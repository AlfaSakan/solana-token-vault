# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

This repo is single-context: one `CONTEXT.md` and one `docs/adr/` at the root, no per-package contexts.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-multi-pool-factory-with-immutable-terms.md
│   ├── 0002-reward-token-minted-not-prefunded.md
│   ├── 0003-early-withdrawal-penalty-to-treasury.md
│   └── 0004-pause-blocks-deposits-only.md
└── programs/token-vault/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids (e.g. say Stake Position, not "deposit" or "stake"; say Reward Token, not "yield token").

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (reward minted, not pre-funded), but worth reopening because…_
