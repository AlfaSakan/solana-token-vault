import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createTestContext,
  createStakeMint,
  fundedKeypair,
  mintTokensTo,
  getTokenBalance,
  deriveConfigPda,
  derivePoolPda,
  deriveVaultPda,
  deriveStakePositionPda,
  TestContext,
} from "./helpers/context";

describe("stake", () => {
  let ctx: TestContext;
  let admin: Keypair;
  let configPda: PublicKey;

  const LOCK_DURATION_SECONDS = new anchor.BN(60 * 60 * 24 * 7);
  const REWARD_RATE_BPS = new anchor.BN(1_500);
  const EARLY_WITHDRAWAL_PENALTY_BPS = 500;
  const STAKE_AMOUNT = 1_000_000n;

  beforeEach(async () => {
    ctx = createTestContext();
    admin = fundedKeypair(ctx);
    [configPda] = deriveConfigPda(ctx.program.programId);

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

  async function setUpPool(overrides: { lockDurationSeconds?: anchor.BN } = {}) {
    const stakeMint = await createStakeMint(ctx, admin);
    const treasury = Keypair.generate().publicKey;
    const [poolPda] = derivePoolPda(stakeMint, ctx.program.programId);
    const [vaultPda] = deriveVaultPda(poolPda, ctx.program.programId);

    await ctx.program.methods
      .createPool(
        overrides.lockDurationSeconds ?? LOCK_DURATION_SECONDS,
        REWARD_RATE_BPS,
        EARLY_WITHDRAWAL_PENALTY_BPS
      )
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

  function callStake(
    signer: Keypair,
    poolPda: PublicKey,
    ownerTokenAccount: PublicKey,
    vaultPda: PublicKey,
    amount: bigint,
    positionNonce: anchor.BN
  ) {
    return ctx.program.methods
      .stake(new anchor.BN(amount.toString()), positionNonce)
      .accounts({
        owner: signer.publicKey,
        pool: poolPda,
        ownerTokenAccount,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc();
  }

  it("creates a Stake Position with correct amount, staked_at, and unlocks_at, and moves tokens into the vault", async () => {
    const { stakeMint, poolPda, vaultPda } = await setUpPool();
    const owner = fundedKeypair(ctx);
    const ownerTokenAccount = await mintTokensTo(ctx, stakeMint, owner.publicKey, STAKE_AMOUNT * 2n, admin, admin);
    const nonce = new anchor.BN(0);
    const [stakePositionPda] = deriveStakePositionPda(poolPda, owner.publicKey, nonce, ctx.program.programId);

    const beforeClock = ctx.svm.getClock();

    await callStake(owner, poolPda, ownerTokenAccount, vaultPda, STAKE_AMOUNT, nonce);

    const position = await ctx.program.account.stakePosition.fetch(stakePositionPda);
    expect(position.pool.equals(poolPda)).to.be.true;
    expect(position.owner.equals(owner.publicKey)).to.be.true;
    expect(BigInt(position.amount.toString())).to.equal(STAKE_AMOUNT);
    expect(position.stakedAt.toNumber()).to.be.at.least(Number(beforeClock.unixTimestamp));
    expect(position.unlocksAt.sub(position.stakedAt).toNumber()).to.equal(LOCK_DURATION_SECONDS.toNumber());

    expect(getTokenBalance(ctx, vaultPda)).to.equal(STAKE_AMOUNT);
    expect(getTokenBalance(ctx, ownerTokenAccount)).to.equal(STAKE_AMOUNT);
  });

  it("lets one owner hold multiple concurrent Stake Positions in the same Pool via distinct nonces", async () => {
    const { stakeMint, poolPda, vaultPda } = await setUpPool();
    const owner = fundedKeypair(ctx);
    const ownerTokenAccount = await mintTokensTo(ctx, stakeMint, owner.publicKey, STAKE_AMOUNT * 3n, admin, admin);

    const nonceA = new anchor.BN(0);
    const nonceB = new anchor.BN(1);
    const [positionA] = deriveStakePositionPda(poolPda, owner.publicKey, nonceA, ctx.program.programId);
    const [positionB] = deriveStakePositionPda(poolPda, owner.publicKey, nonceB, ctx.program.programId);

    await callStake(owner, poolPda, ownerTokenAccount, vaultPda, STAKE_AMOUNT, nonceA);
    await callStake(owner, poolPda, ownerTokenAccount, vaultPda, STAKE_AMOUNT * 2n, nonceB);

    const fetchedA = await ctx.program.account.stakePosition.fetch(positionA);
    const fetchedB = await ctx.program.account.stakePosition.fetch(positionB);

    expect(BigInt(fetchedA.amount.toString())).to.equal(STAKE_AMOUNT);
    expect(BigInt(fetchedB.amount.toString())).to.equal(STAKE_AMOUNT * 2n);
    expect(fetchedA.owner.equals(owner.publicKey)).to.be.true;
    expect(fetchedB.owner.equals(owner.publicKey)).to.be.true;
    expect(getTokenBalance(ctx, vaultPda)).to.equal(STAKE_AMOUNT * 3n);
  });

  it("lets one owner hold Stake Positions across different Pools simultaneously", async () => {
    const poolA = await setUpPool({ lockDurationSeconds: new anchor.BN(1000) });
    const poolB = await setUpPool({ lockDurationSeconds: new anchor.BN(2000) });
    const owner = fundedKeypair(ctx);

    const ownerTokenAccountA = await mintTokensTo(ctx, poolA.stakeMint, owner.publicKey, STAKE_AMOUNT, admin, admin);
    const ownerTokenAccountB = await mintTokensTo(ctx, poolB.stakeMint, owner.publicKey, STAKE_AMOUNT, admin, admin);

    const nonce = new anchor.BN(0);
    const [positionInA] = deriveStakePositionPda(poolA.poolPda, owner.publicKey, nonce, ctx.program.programId);
    const [positionInB] = deriveStakePositionPda(poolB.poolPda, owner.publicKey, nonce, ctx.program.programId);

    await callStake(owner, poolA.poolPda, ownerTokenAccountA, poolA.vaultPda, STAKE_AMOUNT, nonce);
    await callStake(owner, poolB.poolPda, ownerTokenAccountB, poolB.vaultPda, STAKE_AMOUNT, nonce);

    const fetchedA = await ctx.program.account.stakePosition.fetch(positionInA);
    const fetchedB = await ctx.program.account.stakePosition.fetch(positionInB);

    expect(fetchedA.pool.equals(poolA.poolPda)).to.be.true;
    expect(fetchedB.pool.equals(poolB.poolPda)).to.be.true;
    expect(getTokenBalance(ctx, poolA.vaultPda)).to.equal(STAKE_AMOUNT);
    expect(getTokenBalance(ctx, poolB.vaultPda)).to.equal(STAKE_AMOUNT);
  });

  it("rejects staking into a paused Pool", async () => {
    const { stakeMint, poolPda, vaultPda } = await setUpPool();
    const owner = fundedKeypair(ctx);
    const ownerTokenAccount = await mintTokensTo(ctx, stakeMint, owner.publicKey, STAKE_AMOUNT, admin, admin);
    const nonce = new anchor.BN(0);
    const [stakePositionPda] = deriveStakePositionPda(poolPda, owner.publicKey, nonce, ctx.program.programId);

    await ctx.program.methods
      .setPaused(true)
      .accounts({
        config: configPda,
        adminAuthority: admin.publicKey,
        pool: poolPda,
      })
      .signers([admin])
      .rpc();

    let error: anchor.AnchorError | undefined;
    try {
      await callStake(owner, poolPda, ownerTokenAccount, vaultPda, STAKE_AMOUNT, nonce);
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }

    expect(error, "stake into a paused Pool should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("PoolPaused");
    expect(ctx.svm.getAccount(stakePositionPda), "Stake Position should not have been created").to.be.null;
  });

  it("rejects staking a zero amount", async () => {
    const { stakeMint, poolPda, vaultPda } = await setUpPool();
    const owner = fundedKeypair(ctx);
    const ownerTokenAccount = await mintTokensTo(ctx, stakeMint, owner.publicKey, STAKE_AMOUNT, admin, admin);
    const nonce = new anchor.BN(0);
    const [stakePositionPda] = deriveStakePositionPda(poolPda, owner.publicKey, nonce, ctx.program.programId);

    let error: anchor.AnchorError | undefined;
    try {
      await callStake(owner, poolPda, ownerTokenAccount, vaultPda, 0n, nonce);
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }

    expect(error, "staking a zero amount should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("ZeroAmount");
    expect(ctx.svm.getAccount(stakePositionPda), "Stake Position should not have been created").to.be.null;
  });
});
