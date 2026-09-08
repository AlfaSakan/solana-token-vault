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

describe("withdraw_early", () => {
  let ctx: TestContext;
  let admin: Keypair;
  let configPda: PublicKey;
  let rewardMintPda: PublicKey;

  const LOCK_DURATION_SECONDS = 1_000;
  const REWARD_RATE_BPS = 1_000; // 10% per year
  const EARLY_WITHDRAWAL_PENALTY_BPS = 500; // 5%
  const STAKE_AMOUNT = 1_000_000n;

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
    const treasury = fundedKeypair(ctx);
    const [poolPda] = derivePoolPda(stakeMint, ctx.program.programId);
    const [vaultPda] = deriveVaultPda(poolPda, ctx.program.programId);

    await ctx.program.methods
      .createPool(new anchor.BN(LOCK_DURATION_SECONDS), new anchor.BN(REWARD_RATE_BPS), EARLY_WITHDRAWAL_PENALTY_BPS)
      .accounts({
        config: configPda,
        adminAuthority: admin.publicKey,
        stakeMint,
        treasury: treasury.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const treasuryTokenAccount = await createAssociatedTokenAccount(ctx, stakeMint, treasury.publicKey, admin);

    return { stakeMint, poolPda, vaultPda, treasury, treasuryTokenAccount };
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

  function callWithdrawEarly(
    signer: Keypair,
    ownerKey: PublicKey,
    poolPda: PublicKey,
    stakePositionPda: PublicKey,
    ownerTokenAccount: PublicKey,
    vaultPda: PublicKey,
    treasuryTokenAccount: PublicKey
  ) {
    return ctx.program.methods
      .withdrawEarly()
      .accounts({
        owner: ownerKey,
        pool: poolPda,
        stakePosition: stakePositionPda,
        ownerTokenAccount,
        vault: vaultPda,
        treasuryTokenAccount,
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

  it("splits principal between owner and treasury per the penalty percentage, mints zero Reward, and closes the Stake Position", async () => {
    const { stakeMint, poolPda, vaultPda, treasuryTokenAccount } = await setUpPool();
    const { owner, ownerTokenAccount, ownerRewardTokenAccount, stakePositionPda } = await setUpStakePosition(
      poolPda,
      vaultPda,
      stakeMint
    );

    await callWithdrawEarly(
      owner,
      owner.publicKey,
      poolPda,
      stakePositionPda,
      ownerTokenAccount,
      vaultPda,
      treasuryTokenAccount
    );

    const expectedPenalty = (STAKE_AMOUNT * BigInt(EARLY_WITHDRAWAL_PENALTY_BPS)) / 10_000n;
    const expectedPayout = STAKE_AMOUNT - expectedPenalty;

    expect(getTokenBalance(ctx, ownerTokenAccount)).to.equal(expectedPayout);
    expect(getTokenBalance(ctx, treasuryTokenAccount)).to.equal(expectedPenalty);
    expect(getTokenBalance(ctx, vaultPda)).to.equal(0n);
    expect(getTokenBalance(ctx, ownerRewardTokenAccount)).to.equal(0n);
    expect(ctx.svm.getAccount(stakePositionPda), "Stake Position should be closed").to.be.null;
  });

  it("fails with AlreadyUnlocked when called after Unlock", async () => {
    const { stakeMint, poolPda, vaultPda, treasuryTokenAccount } = await setUpPool();
    const { owner, ownerTokenAccount, stakePositionPda } = await setUpStakePosition(poolPda, vaultPda, stakeMint);

    warpPastUnlock();

    let error: anchor.AnchorError | undefined;
    try {
      await callWithdrawEarly(
        owner,
        owner.publicKey,
        poolPda,
        stakePositionPda,
        ownerTokenAccount,
        vaultPda,
        treasuryTokenAccount
      );
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }

    expect(error, "withdraw_early after Unlock should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("AlreadyUnlocked");
    expect(ctx.svm.getAccount(stakePositionPda), "Stake Position should still exist").to.not.be.null;
  });

  it("rejects a withdraw_early attempt from a signer who is not the Stake Position's owner", async () => {
    const { stakeMint, poolPda, vaultPda, treasuryTokenAccount } = await setUpPool();
    const { ownerTokenAccount, stakePositionPda } = await setUpStakePosition(poolPda, vaultPda, stakeMint);
    const impostor = fundedKeypair(ctx);

    let error: anchor.AnchorError | undefined;
    try {
      await callWithdrawEarly(
        impostor,
        impostor.publicKey,
        poolPda,
        stakePositionPda,
        ownerTokenAccount,
        vaultPda,
        treasuryTokenAccount
      );
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }

    expect(error, "withdraw_early from a non-owner signer should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("ConstraintHasOne");
    expect(ctx.svm.getAccount(stakePositionPda), "Stake Position should still exist").to.not.be.null;
  });
});
