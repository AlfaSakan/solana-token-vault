# Token Vault

An Anchor program on Solana implementing multi-Pool, time-locked SPL token staking with
minted rewards. A staker deposits into a Pool and, at Unlock, withdraws principal plus a
freshly-minted Reward computed from the Pool's terms — or withdraws early for a flat
Penalty and zero Reward. Built as a portfolio piece demonstrating Anchor's PDA and
account-model fundamentals.

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and [`docs/adr/`](./docs/adr)
for the design decisions behind it (multi-Pool factory, minted-not-prefunded rewards,
early-withdrawal penalty routing, pause semantics).

## Status

Early-stage: the account structs and instruction signatures exist; instruction bodies
are being filled in ticket by ticket against the GitHub issue tracker (see
[`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md)). `initialize` is
implemented and tested; the rest (`create_pool`, `set_paused`, `stake`, `withdraw`,
`withdraw_early`) are still stubs.

## Prerequisites

- Rust (`rustup`)
- [Solana CLI](https://docs.anza.xyz/cli/install) — this repo currently builds against
  Solana CLI **1.18.17** (pinned to match Anchor 0.30.1; installed and selected via
  `avm use 0.30.1`, see below)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) **0.30.1**, via `avm`:
  ```bash
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install 0.30.1
  avm use 0.30.1
  ```
- Node.js + Yarn, for the test suite

If you hit toolchain errors building or testing, check `CLAUDE.md`'s "Lessons Learned"
section first — this environment's toolchain combination has several documented,
non-obvious gotchas (dependency pinning for `edition2024`/MSRV mismatches, IDL codegen
being broken here, LiteSVM package deduplication, etc).

## Build

```bash
anchor build --no-idl
```

`--no-idl` is required on this toolchain — see `idl/README.md` for why, and note that
`idl/token_vault.json` / `idl/token_vault.ts` are hand-maintained rather than generated.

## Test

```bash
yarn install
yarn test
```

Tests run against a [LiteSVM](https://github.com/LiteSVM/litesvm)-based harness
(`tests/helpers/context.ts`) — no `solana-test-validator` process required. Each test
gets a fresh, isolated LiteSVM instance with the compiled program loaded.
