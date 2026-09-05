import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { LiteSVMProvider } from "anchor-litesvm";
import type { TokenVault } from "../../idl/token_vault";

const PROGRAM_SO_PATH = path.join(__dirname, "../../target/deploy/token_vault.so");
// Hand-maintained, not `anchor build`-generated — see idl/token_vault.json header
// and CLAUDE.md "Lessons Learned" for why, and keep it in sync with lib.rs.
const IDL_PATH = path.join(__dirname, "../../idl/token_vault.json");

const IDL = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));

/** Seeds must stay in sync with programs/token-vault/src/lib.rs. */
export const CONFIG_SEED = Buffer.from("config");
export const REWARD_MINT_SEED = Buffer.from("reward_mint");

export interface TestContext {
  svm: LiteSVM;
  provider: LiteSVMProvider;
  program: Program<TokenVault>;
}

/**
 * Boots a fresh LiteSVM instance with the token-vault program loaded and
 * returns an Anchor `Program` client wired to it. Call this once per test
 * (or per `beforeEach`) so each test gets an isolated on-chain state — the
 * shared piece being this loading logic, not a shared mutable svm instance.
 */
export function createTestContext(): TestContext {
  const svm = new LiteSVM();
  const programId = new PublicKey(IDL.address);
  svm.addProgramFromFile(programId, PROGRAM_SO_PATH);

  const provider = new LiteSVMProvider(svm);
  anchor.setProvider(provider);
  const program = new Program<TokenVault>(IDL, provider);

  return { svm, provider, program };
}

export function fundedKeypair(
  ctx: TestContext,
  lamports = 10 * anchor.web3.LAMPORTS_PER_SOL
): anchor.web3.Keypair {
  const keypair = anchor.web3.Keypair.generate();
  ctx.svm.airdrop(keypair.publicKey, BigInt(lamports));
  return keypair;
}

export function deriveConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

export function deriveRewardMintPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([REWARD_MINT_SEED], programId);
}
