# Deploying

This program is built with `anchor build --no-idl` (see `idl/README.md` for why plain
`anchor build` is broken on this toolchain) and deployed with `anchor deploy` /
`solana program deploy`. There is one on-chain program shared by all Pools — Pools are
just accounts created under it (see `docs/adr/0001-multi-pool-factory-with-immutable-terms.md`),
so a single deploy per cluster is all that's needed; you don't redeploy per Pool.

## Prerequisites

- Everything in the root [`README.md`](../README.md#prerequisites) (Rust, Solana CLI
  1.18.17, Anchor CLI 0.30.1 via `avm`).
- A funded deployer keypair for the target cluster. Deploying writes a new program
  buffer account sized to the compiled `.so`, so the wallet needs enough SOL to cover
  that rent (a few SOL is typically enough for a program this size; check the exact
  size with `ls -la target/deploy/token_vault.so` after building and rent-cost with
  `solana rent <bytes> --data-slot` / `solana program deploy --help` guidance).
- Decide the deployer/upgrade-authority keypair *before* the first deploy — see
  [Upgrade authority](#upgrade-authority) below. Don't deploy to mainnet with a
  throwaway or unmanaged keypair as authority.

## Build

```bash
anchor build --no-idl
```

Produces `target/deploy/token_vault.so` and `target/deploy/token_vault-keypair.json`.
The program's on-chain address is the pubkey of that keypair file — it must match
`declare_id!()` in `programs/token-vault/src/lib.rs` and the `[programs.<cluster>]`
entry in `Anchor.toml` for the target cluster (see below). If you don't already have a
`target/deploy/token_vault-keypair.json` (e.g. first deploy on a fresh clone/CI runner),
generate one and update `declare_id!()`/`Anchor.toml` to match it *before* building —
see the "declare_id placeholder" entry in `CLAUDE.md`'s Lessons Learned for why a
hand-typed placeholder pubkey silently breaks the build.

## Devnet

1. Point the CLI at devnet and confirm/fund the deployer wallet:
   ```bash
   solana config set --url devnet
   solana airdrop 2 <deployer-pubkey>   # devnet faucet; repeat if rate-limited
   ```
2. Add (or confirm) a `[programs.devnet]` entry in `Anchor.toml` with the program's
   address, and set `[provider] cluster = "devnet"` — or pass `--provider.cluster
   devnet` on the command line instead of editing the file, to avoid disturbing the
   `localnet` default other contributors rely on for `anchor test`.
3. Deploy:
   ```bash
   anchor deploy --provider.cluster devnet --provider.wallet <path-to-deployer-keypair>
   ```
4. Smoke-test against the deployed program: run `initialize`, `create_pool`, and a
   `stake`/`withdraw` cycle from a script or the Anchor CLI console against the devnet
   address before treating the deploy as verified. The LiteSVM test suite (`yarn test`)
   does *not* touch a deployed program — it only exercises the compiled `.so` in an
   in-process VM, so it's not a substitute for this check.

## Mainnet

Mainnet deploy is the same mechanics as devnet with higher stakes — treat it as a
one-way door until this repo has an on-chain upgrade governance story (see
[Upgrade authority](#upgrade-authority)):

1. `solana config set --url mainnet-beta`.
2. Fund the deployer wallet with real SOL covering the program buffer rent (see
   [Prerequisites](#prerequisites)).
3. Add a `[programs.mainnet]` entry to `Anchor.toml`, matching
   `target/deploy/token_vault-keypair.json`.
4. Before deploying, confirm:
   - The build was produced from a clean checkout of the commit being shipped (no
     uncommitted local changes) — `git status` should be clean.
   - `create_pool` parameter bounds checks are in place (see CLAUDE.md's Lessons
     Learned — Pools are immutable once created, so an unvalidated Pool created with
     bad terms is permanently broken).
   - The full test suite passes: `anchor build --no-idl && yarn test`.
5. Deploy:
   ```bash
   anchor deploy --provider.cluster mainnet-beta --provider.wallet <path-to-deployer-keypair>
   ```
6. Re-run the same smoke test as devnet (step 4 above) against the mainnet address
   before pointing any client/frontend at it.

## Upgrade authority

This repo has no documented upgrade-authority policy yet. By default,
`anchor deploy`/`solana program deploy` sets the deploying wallet as the program's
upgrade authority, meaning that single keypair can push new program logic at any time
with no additional review. Before a real mainnet deploy, decide and document:

- Whether the deployer keypair is a personal/dev key (fine for devnet, not for
  mainnet-with-real-funds) or a dedicated deploy key held in a secrets manager /
  hardware wallet.
- Whether to transfer upgrade authority to a multisig (e.g. Squads) after the initial
  deploy: `solana program set-upgrade-authority <program-id> --new-upgrade-authority
  <multisig-pubkey>`.
- Whether to eventually freeze upgrades entirely (`solana program set-upgrade-authority
  <program-id> --final`) once the program is considered stable — irreversible, so only
  after an audit and a deliberate decision, not as a default step in this runbook.

## IDL for clients

`anchor build --no-idl` skips codegen; there is no `target/idl/token_vault.json` to
publish. Clients (frontend, scripts) should use the hand-maintained
[`idl/token_vault.json`](../idl/token_vault.json) /
[`idl/token_vault.ts`](../idl/token_vault.ts) instead — keep them in sync with
`lib.rs` per instruction/account/error change (see [`idl/README.md`](../idl/README.md)).
