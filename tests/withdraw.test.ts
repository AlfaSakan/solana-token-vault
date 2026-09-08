import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createTestContext,
  createStakeMint,
  createAssociatedTokenAccount,
  fundedKeypair,
  mintTokensTo,
  getTokenBalance,
  deriveConfigPda,
  deriveRewardMintPda,
  derivePoolPda,
  deriveVaultPda,
  deriveStakePositionPda,
  TestContext,
} from "./helpers/context";

describe("withdraw", () => {
  let ctx: TestContext;
  let admin: Keypair;
  let configPda: PublicKey;
  let rewardMintPda: PublicKey;

  const LOCK_DURATION_SECONDS = 1_000;
  const REWARD_RATE_BPS = 1_000; // 10% per year
  const EARLY_WITHDRAWAL_PENALTY_BPS = 500;
  const STAKE_AMOUNT = 1_000_000n;
  const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

  beforeEach(async () => {
    ctx = createTestContext();
    admin = fundedKeypair(ctx);
    [configPda] = deriveConfigPda(ctx.program.programId);
    [rewardMintPda] = deriveRewardMintPda(ctx.program.programId);

    await ctx.program.methods
      .initialize()
      .accounts({
        adminAuthority: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  });

  async function setUpPool() {
    const stakeMint = await createStakeMint(ctx, admin);
    const treasury = Keypair.generate().publicKey;
    const [poolPda] = derivePoolPda(stakeMint, ctx.program.programId);
    const [vaultPda] = deriveVaultPda(poolPda, ctx.program.programId);

    await ctx.program.methods
      .createPool(new anchor.BN(LOCK_DURATION_SECONDS), new anchor.BN(REWARD_RATE_BPS), EARLY_WITHDRAWAL_PENALTY_BPS)
      .accounts({
        config: configPda,
        adminAuthority: admin.publicKey,
        stakeMint,
        treasury,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    return { stakeMint, poolPda, vaultPda, treasury };
  }

  async function setUpStakePosition(poolPda: PublicKey, vaultPda: PublicKey, stakeMint: PublicKey) {
    const owner = fundedKeypair(ctx);
    const ownerTokenAccount = await mintTokensTo(ctx, stakeMint, owner.publicKey, STAKE_AMOUNT, admin, admin);
    const nonce = new anchor.BN(0);
    const [stakePositionPda] = deriveStakePositionPda(poolPda, owner.publicKey, nonce, ctx.program.programId);

    await ctx.program.methods
      .stake(new anchor.BN(STAKE_AMOUNT.toString()), nonce)
      .accounts({
        owner: owner.publicKey,
        pool: poolPda,
        ownerTokenAccount,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const ownerRewardTokenAccount = await createAssociatedTokenAccount(ctx, rewardMintPda, owner.publicKey, admin);

    return { owner, ownerTokenAccount, ownerRewardTokenAccount, stakePositionPda };
  }

  function callWithdraw(
    signer: Keypair,
    ownerKey: PublicKey,
    poolPda: PublicKey,
    stakePositionPda: PublicKey,
    ownerTokenAccount: PublicKey,
    vaultPda: PublicKey,
    ownerRewardTokenAccount: PublicKey
  ) {
    return ctx.program.methods
      .withdraw()
      .accounts({
        owner: ownerKey,
        pool: poolPda,
        stakePosition: stakePositionPda,
        ownerTokenAccount,
        vault: vaultPda,
        ownerRewardTokenAccount,
        rewardMint: rewardMintPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();
  }

  function warpPastUnlock() {
    const clock = ctx.svm.getClock();
    clock.unixTimestamp = clock.unixTimestamp + BigInt(LOCK_DURATION_SECONDS + 1);
    ctx.svm.setClock(clock);
  }

  it("returns principal and mints the correct Reward after Unlock, closing the Stake Position", async () => {
    const { stakeMint, poolPda, vaultPda } = await setUpPool();
    const { owner, ownerTokenAccount, ownerRewardTokenAccount, stakePositionPda } = await setUpStakePosition(
      poolPda,
      vaultPda,
      stakeMint
    );

    warpPastUnlock();

    await callWithdraw(
      owner,
      owner.publicKey,
      poolPda,
      stakePositionPda,
      ownerTokenAccount,
      vaultPda,
      ownerRewardTokenAccount
    );

    const expectedReward =
      (STAKE_AMOUNT * BigInt(REWARD_RATE_BPS) * BigInt(LOCK_DURATION_SECONDS)) /
      (10_000n * BigInt(SECONDS_PER_YEAR));

    expect(getTokenBalance(ctx, ownerTokenAccount)).to.equal(STAKE_AMOUNT);
    expect(getTokenBalance(ctx, vaultPda)).to.equal(0n);
    expect(getTokenBalance(ctx, ownerRewardTokenAccount)).to.equal(expectedReward);
    expect(ctx.svm.getAccount(stakePositionPda), "Stake Position should be closed").to.be.null;
  });

  it("fails with StillLocked when called before Unlock", async () => {
    const { stakeMint, poolPda, vaultPda } = await setUpPool();
    const { owner, ownerTokenAccount, ownerRewardTokenAccount, stakePositionPda } = await setUpStakePosition(
      poolPda,
      vaultPda,
      stakeMint
    );

    let error: anchor.AnchorError | undefined;
    try {
      await callWithdraw(
        owner,
        owner.publicKey,
        poolPda,
        stakePositionPda,
        ownerTokenAccount,
        vaultPda,
        ownerRewardTokenAccount
      );
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }

    expect(error, "withdraw before Unlock should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("StillLocked");
    expect(ctx.svm.getAccount(stakePositionPda), "Stake Position should still exist").to.not.be.null;
  });

  it("rejects a withdraw attempt from a signer who is not the Stake Position's owner", async () => {
    const { stakeMint, poolPda, vaultPda } = await setUpPool();
    const { ownerTokenAccount, ownerRewardTokenAccount, stakePositionPda } = await setUpStakePosition(
      poolPda,
      vaultPda,
      stakeMint
    );
    const impostor = fundedKeypair(ctx);

    warpPastUnlock();

    let error: anchor.AnchorError | undefined;
    try {
      await callWithdraw(
        impostor,
        impostor.publicKey,
        poolPda,
        stakePositionPda,
        ownerTokenAccount,
        vaultPda,
        ownerRewardTokenAccount
      );
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }

    expect(error, "withdraw from a non-owner signer should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("ConstraintHasOne");
    expect(ctx.svm.getAccount(stakePositionPda), "Stake Position should still exist").to.not.be.null;
  });
});
