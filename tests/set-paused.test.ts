import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createTestContext,
  createStakeMint,
  fundedKeypair,
  mintTokensTo,
  deriveConfigPda,
  derivePoolPda,
  deriveVaultPda,
  TestContext,
} from "./helpers/context";

describe("set_paused", () => {
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

  function callSetPaused(signer: Keypair, poolPda: PublicKey, paused: boolean) {
    return ctx.program.methods
      .setPaused(paused)
      .accounts({
        config: configPda,
        adminAuthority: signer.publicKey,
        pool: poolPda,
      })
      .signers([signer])
      .rpc();
  }

  it("lets the admin toggle Pool.paused on a specific Pool", async () => {
    const { poolPda } = await setUpPool();

    await callSetPaused(admin, poolPda, true);
    expect((await ctx.program.account.pool.fetch(poolPda)).paused).to.be.true;

    await callSetPaused(admin, poolPda, false);
    expect((await ctx.program.account.pool.fetch(poolPda)).paused).to.be.false;
  });

  it("rejects a non-admin signer attempting to pause/unpause", async () => {
    const { poolPda } = await setUpPool();
    const impostor = fundedKeypair(ctx);

    let error: anchor.AnchorError | undefined;
    try {
      await callSetPaused(impostor, poolPda, true);
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }

    expect(error, "set_paused from a non-admin signer should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("ConstraintHasOne");
    expect((await ctx.program.account.pool.fetch(poolPda)).paused).to.be.false;
  });

  it("rejects stake into a paused Pool while a different, unpaused Pool still accepts stake", async () => {
    const pausedPool = await setUpPool();
    const openPool = await setUpPool({ lockDurationSeconds: new anchor.BN(999) });
    const owner = fundedKeypair(ctx);

    await callSetPaused(admin, pausedPool.poolPda, true);

    const ownerTokenAccountPaused = await mintTokensTo(
      ctx,
      pausedPool.stakeMint,
      owner.publicKey,
      STAKE_AMOUNT,
      admin,
      admin
    );
    const ownerTokenAccountOpen = await mintTokensTo(
      ctx,
      openPool.stakeMint,
      owner.publicKey,
      STAKE_AMOUNT,
      admin,
      admin
    );
    const nonce = new anchor.BN(0);

    let error: anchor.AnchorError | undefined;
    try {
      await ctx.program.methods
        .stake(new anchor.BN(STAKE_AMOUNT.toString()), nonce)
        .accounts({
          owner: owner.publicKey,
          pool: pausedPool.poolPda,
          ownerTokenAccount: ownerTokenAccountPaused,
          vault: pausedPool.vaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    } catch (err) {
      error = anchor.AnchorError.parse((err as anchor.web3.SendTransactionError).logs ?? []) ?? undefined;
    }

    expect(error, "stake into a paused Pool should fail").to.not.be.undefined;
    expect(error!.error.errorCode.code).to.equal("PoolPaused");

    await ctx.program.methods
      .stake(new anchor.BN(STAKE_AMOUNT.toString()), nonce)
      .accounts({
        owner: owner.publicKey,
        pool: openPool.poolPda,
        ownerTokenAccount: ownerTokenAccountOpen,
        vault: openPool.vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
  });
});
