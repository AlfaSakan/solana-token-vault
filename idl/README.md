# Hand-maintained IDL

`token_vault.json` / `token_vault.ts` are **hand-maintained**, not `anchor build`-generated.

`anchor build`'s IDL step fails on this repo's toolchain (Solana CLI 1.18.17's bundled
platform-tools rustc is a custom fork that lacks `proc_macro::SourceFile`, which
`anchor-syn`'s `procmacro2_semver_exempt` code path needs — see CLAUDE.md "Lessons
Learned" for the full story). `anchor build --no-idl` still produces
`target/deploy/token_vault.so` fine; only IDL/TS-type codegen is broken.

Until that's fixed (newer anchor-cli, or a toolchain where `anchor build`'s IDL step
works), update these two files by hand whenever an instruction, account, or error is
added/changed in `programs/token-vault/src/lib.rs`:

- Instruction discriminator: first 8 bytes of `sha256("global:<snake_case_name>")`.
- Account discriminator: first 8 bytes of `sha256("account:<PascalCase_name>")`.

```js
const crypto = require("crypto");
const disc = (prefix, name) =>
  Array.from(crypto.createHash("sha256").update(`${prefix}:${name}`).digest().slice(0, 8));
```
