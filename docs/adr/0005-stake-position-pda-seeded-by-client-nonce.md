# Stake Position PDAs are seeded by a client-supplied nonce, not an on-chain counter

A Stake Position PDA needs a seed that's unique per deposit, since one owner can hold multiple concurrent Stake Positions in the same Pool. The seed can't be just `[pool, owner]` — that collides on the second deposit.

We considered keeping an on-chain per-owner-per-pool counter (e.g. a small PDA account tracking "next index") and incrementing it on every `stake` call, then seeding with that index. We rejected this: it adds a whole extra account (with its own rent and `init`/`mut` lifecycle) purely to hand out sequential numbers, and creates a serialization point — two concurrent `stake` calls from the same owner into the same Pool would race on the same counter account.

Instead, `stake` takes a `position_nonce: u64` argument chosen by the caller, and the Stake Position PDA is seeded `[b"stake_position", pool, owner, position_nonce]`. The caller is responsible for picking a nonce that doesn't collide with their own still-open positions in that Pool (e.g. a random `u64`, or a locally-tracked counter) — collision just means the transaction fails with an `init`-on-existing-account error, not a fund-safety issue, since the constraint on `stake_position` is `init` and Anchor rejects double-init outright.
