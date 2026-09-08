import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createTestContext,
  createStakeMint,
  fundedKeypair,
  deriveConfigPda,
  derivePoolPda,
  deriveVaultPda,
  TestContext,
} from "./helpers/context";

describe("create_pool", () => {
  let ctx: TestContext;
  let admin: Keypair;
  let configPda: PublicKey;

  const LOCK_DURATION_SECONDS = new anchor.BN(60 * 60 * 24 * 7);
  const REWARD_RATE_BPS = new anchor.BN(1_500);
  const EARLY_WITHDRAWAL_PENALTY_BPS = 500;

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

  function callCreatePool(
    signer: Keypair,
    stakeMint: PublicKey,
    treasury: PublicKey,
    overrides: {
      lockDurationSeconds?: anchor.BN;
      rewardRateBps?: anchor.BN;
      earlyWithdrawalPenaltyBps?: number;
    } = {}
  ) {
    return ctx.program.methods
      .createPool(
        overrides.lockDurationSeconds ?? LOCK_DURATION_SECONDS,
        overrides.rewardRateBps ?? REWARD_RATE_BPS,
        overrides.earlyWithdrawalPenaltyBps ?? EARLY_WITHDRAWAL_PENALTY_BPS
      )
      .accounts({
        config: configPda,
        adminAuthority: signer.publicKey,
        stakeMint,
        treasury,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc();
  }

  it("creates a Pool with all listed parameters stored correctly", async () => {
    const stakeMint = await createStakeMint(ctx, admin);
    const treasury = Keypair.generate().publicKey;
    const [poolPda, poolBump] = derivePoolPda(stakeMint, ctx.program.programId);
    const [vaultPda, vaultBump] = deriveVaultPda(poolPda, ctx.program.programId);

    await callCreatePool(admin, stakeMint, treasury);

    const pool = await ctx.program.account.pool.fetch(poolPda);
    expect(pool.config.equals(configPda)).to.be.true;
    expect(pool.stakeMint.equals(stakeMint)).to.be.true;
    expect(pool.vault.equals(vaultPda)).to.be.true;
    expect(pool.treasury.equals(treasury)).to.be.true;
    expect(pool.lockDurationSeconds.eq(LOCK_DURATION_SECONDS)).to.be.true;
    expect(pool.rewardRateBps.eq(REWARD_RATE_BPS)).to.be.true;
    expect(pool.earlyWithdrawalPenaltyBps).to.equal(EARLY_WITHDRAWAL_PENALTY_BPS);
    expect(pool.paused).to.be.false;
    expect(pool.bump).to.equal(poolBump);
    expect(pool.vaultBump).to.equal(vaultBump);

    const vaultAccount = ctx.svm.getAccount(vaultPda);
    expect(vaultAccount, "vault token account should exist").to.not.be.null;
  });

  it("rejects a non-admin signer attempting to create a Pool", async () => {
    const stakeMint = await createStakeMint(ctx, admin);
    const treasury = Keypair.generate().publicKey;
    const impostor = fundedKeypair(ctx);

    let error: anchor.AnchorError | undefined;
    try {
      await callCreatePool(impostor, stakeMint, treasury);
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }
    expect(error, "create_pool from a non-admin signer should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("ConstraintHasOne");

    const [poolPda] = derivePoolPda(stakeMint, ctx.program.programId);
    expect(ctx.svm.getAccount(poolPda), "Pool should not have been created").to.be.null;
  });

  it("lets two Pools with different stake mints/terms coexist independently", async () => {
    const stakeMintA = await createStakeMint(ctx, admin);
    const stakeMintB = await createStakeMint(ctx, admin);
    const treasuryA = Keypair.generate().publicKey;
    const treasuryB = Keypair.generate().publicKey;

    await callCreatePool(admin, stakeMintA, treasuryA, {
      lockDurationSeconds: new anchor.BN(1000),
      rewardRateBps: new anchor.BN(200),
      earlyWithdrawalPenaltyBps: 100,
    });
    await callCreatePool(admin, stakeMintB, treasuryB, {
      lockDurationSeconds: new anchor.BN(2000),
      rewardRateBps: new anchor.BN(300),
      earlyWithdrawalPenaltyBps: 150,
    });

    const [poolPdaA] = derivePoolPda(stakeMintA, ctx.program.programId);
    const [poolPdaB] = derivePoolPda(stakeMintB, ctx.program.programId);

    const poolA = await ctx.program.account.pool.fetch(poolPdaA);
    const poolB = await ctx.program.account.pool.fetch(poolPdaB);

    expect(poolA.stakeMint.equals(stakeMintA)).to.be.true;
    expect(poolB.stakeMint.equals(stakeMintB)).to.be.true;
    expect(poolA.lockDurationSeconds.toNumber()).to.equal(1000);
    expect(poolB.lockDurationSeconds.toNumber()).to.equal(2000);
    expect(poolA.treasury.equals(treasuryA)).to.be.true;
    expect(poolB.treasury.equals(treasuryB)).to.be.true;
  });
});
