# Reward Token is minted on withdrawal, not pre-funded

The obvious design for a staking reward is a pre-funded vault: the Admin Authority deposits reward tokens up front (often the same token being staked, or an existing token like USDC), and withdrawals simply transfer out of that balance. We rejected this. Instead, a single Reward Token mint is created once at program initialization, with a PDA as its mint authority, and new supply is minted directly to the user at withdrawal time.

This means the Reward Token is a protocol-native token with no existing liquidity or pre-set value — it only exists because this program mints it. We chose this because it better demonstrates PDA-as-mint-authority patterns and removes the operational burden of an admin needing to keep a reward vault topped up (a pre-funded vault that runs dry would fail claims, a failure mode we'd rather not build).

Consequence: because rewards are minted rather than transferred from a balance, an Early Withdrawal penalty (which is paid in the staked token, not the Reward Token) has nothing to flow back into — see [0003-early-withdrawal-penalty-to-treasury.md](./0003-early-withdrawal-penalty-to-treasury.md).
