import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import {
  createTestContext,
  fundedKeypair,
  deriveConfigPda,
  deriveRewardMintPda,
  TestContext,
} from "./helpers/context";

describe("initialize", () => {
  let ctx: TestContext;
  let admin: Keypair;
  let configPda: PublicKey;
  let rewardMintPda: PublicKey;
  let rewardMintBump: number;

  beforeEach(() => {
    ctx = createTestContext();
    admin = fundedKeypair(ctx);
    [configPda] = deriveConfigPda(ctx.program.programId);
    [rewardMintPda, rewardMintBump] = deriveRewardMintPda(ctx.program.programId);
  });

  function callInitialize() {
    // `config` and `rewardMint` are PDAs derived purely from const seeds, so
    // Anchor's client auto-resolves them — no need to pass them explicitly.
    return ctx.program.methods
      .initialize()
      .accounts({
        adminAuthority: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  }

  it("creates Config storing the admin_authority and the Reward Token mint address", async () => {
    await callInitialize();

    const config = await ctx.program.account.config.fetch(configPda);
    expect(config.adminAuthority.equals(admin.publicKey)).to.be.true;
    expect(config.rewardMint.equals(rewardMintPda)).to.be.true;
    expect(config.rewardMintBump).to.equal(rewardMintBump);
  });

  it("makes the program PDA the Reward Token mint's mint authority, not any wallet", async () => {
    await callInitialize();

    const accountInfo = ctx.svm.getAccount(rewardMintPda);
    expect(accountInfo, "reward mint account should exist").to.not.be.null;

    const mint = unpackMint(
      rewardMintPda,
      {
        ...accountInfo!,
        data: Buffer.from(accountInfo!.data),
      } as anchor.web3.AccountInfo<Buffer>,
      TOKEN_PROGRAM_ID
    );

    expect(mint.mintAuthority?.equals(rewardMintPda)).to.be.true;
    expect(mint.mintAuthority?.equals(admin.publicKey)).to.be.false;
  });

  it("fails on a second call, so a second Reward Token mint can never be created", async () => {
    await callInitialize();

    // Force a fresh blockhash so the second call is a distinct transaction —
    // otherwise it's byte-identical to the first and LiteSVM treats it as an
    // already-seen signature instead of actually re-executing the instruction.
    ctx.svm.expireBlockhash();

    let threw = false;
    try {
      await callInitialize();
    } catch (err) {
      threw = true;
    }
    expect(threw, "second initialize call should fail").to.be.true;

    // Config and the Reward Token mint are still the ones from the first call.
    const config = await ctx.program.account.config.fetch(configPda);
    expect(config.rewardMint.equals(rewardMintPda)).to.be.true;
  });
});
