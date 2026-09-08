/**
 * Program IDL in TypeScript, hand-maintained (see programs/token-vault/src/lib.rs
 * and CLAUDE.md "Lessons Learned" for why `anchor build` can't auto-generate this
 * on this toolchain). Keep this in sync with idl/token_vault.json and the Rust
 * instruction/account definitions whenever either changes.
 *
 * Unlike token_vault.json, top-level `accounts`/`types` entries here use the
 * post-`convertIdlToCamelCase` name ("config", not "Config") — Anchor's
 * `Program` constructor camelCases the raw IDL before building the runtime
 * `account` namespace, so this type must match what callers actually see
 * (`program.account.config`, not `program.account.Config`).
 */
export type TokenVault = {
  "address": "8mr7vpqXRnwiHsAs4c8dpLurgMWuoFNDmqFYbepqpqBJ",
  "metadata": {
    "name": "token_vault",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "initialize",
      "discriminator": [175, 175, 109, 31, 13, 152, 155, 237],
      "accounts": [
        { "name": "adminAuthority", "writable": true, "signer": true },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [{ "kind": "const", "value": [99, 111, 110, 102, 105, 103] }]
          }
        },
        {
          "name": "rewardMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [114, 101, 119, 97, 114, 100, 95, 109, 105, 110, 116]
              }
            ]
          }
        },
        { "name": "tokenProgram" },
        { "name": "systemProgram" }
      ],
      "args": []
    },
    {
      "name": "createPool",
      "discriminator": [233, 146, 209, 142, 207, 104, 64, 188],
      "accounts": [
        { "name": "config" },
        { "name": "adminAuthority", "writable": true, "signer": true },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [112, 111, 111, 108] },
              { "kind": "account", "path": "stakeMint" }
            ]
          }
        },
        { "name": "stakeMint" },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              { "kind": "const", "value": [118, 97, 117, 108, 116] },
              { "kind": "account", "path": "pool" }
            ]
          }
        },
        { "name": "treasury" },
        { "name": "tokenProgram" },
        { "name": "systemProgram" }
      ],
      "args": [
        { "name": "lockDurationSeconds", "type": "i64" },
        { "name": "rewardRateBps", "type": "u64" },
        { "name": "earlyWithdrawalPenaltyBps", "type": "u16" }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [91, 60, 125, 192, 176, 225, 166, 218],
      "accounts": [
        { "name": "config" },
        { "name": "adminAuthority", "signer": true },
        { "name": "pool", "writable": true }
      ],
      "args": [{ "name": "paused", "type": "bool" }]
    },
    {
      "name": "stake",
      "discriminator": [206, 176, 202, 18, 200, 209, 179, 108],
      "accounts": [
        { "name": "owner", "writable": true, "signer": true },
        { "name": "pool" },
        {
          "name": "stakePosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [115, 116, 97, 107, 101, 95, 112, 111, 115, 105, 116, 105, 111, 110]
              },
              { "kind": "account", "path": "pool" },
              { "kind": "account", "path": "owner" },
              { "kind": "arg", "path": "position_nonce" }
            ]
          }
        },
        { "name": "ownerTokenAccount", "writable": true },
        { "name": "vault", "writable": true },
        { "name": "tokenProgram" },
        { "name": "systemProgram" }
      ],
      "args": [
        { "name": "amount", "type": "u64" },
        { "name": "positionNonce", "type": "u64" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [155, 12, 170, 224, 30, 250, 204, 130]
    },
    {
      "name": "pool",
      "discriminator": [241, 154, 109, 4, 17, 177, 109, 188]
    },
    {
      "name": "stakePosition",
      "discriminator": [78, 165, 30, 111, 171, 125, 11, 220]
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "adminAuthority", "type": "pubkey" },
          { "name": "rewardMint", "type": "pubkey" },
          { "name": "rewardMintBump", "type": "u8" }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "config", "type": "pubkey" },
          { "name": "stakeMint", "type": "pubkey" },
          { "name": "vault", "type": "pubkey" },
          { "name": "treasury", "type": "pubkey" },
          { "name": "lockDurationSeconds", "type": "i64" },
          { "name": "rewardRateBps", "type": "u64" },
          { "name": "earlyWithdrawalPenaltyBps", "type": "u16" },
          { "name": "paused", "type": "bool" },
          { "name": "bump", "type": "u8" },
          { "name": "vaultBump", "type": "u8" }
        ]
      }
    },
    {
      "name": "stakePosition",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "pool", "type": "pubkey" },
          { "name": "owner", "type": "pubkey" },
          { "name": "amount", "type": "u64" },
          { "name": "stakedAt", "type": "i64" },
          { "name": "unlocksAt", "type": "i64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ],
  "errors": [
    { "code": 6000, "name": "PoolPaused", "msg": "Pool is paused for new deposits" },
    {
      "code": 6001,
      "name": "StillLocked",
      "msg": "Stake position has not reached its unlock time yet"
    },
    {
      "code": 6002,
      "name": "AlreadyUnlocked",
      "msg": "Stake position is already unlocked, use withdraw instead of withdraw_early"
    },
    { "code": 6003, "name": "ZeroAmount", "msg": "Stake amount must be greater than zero" }
  ]
};
