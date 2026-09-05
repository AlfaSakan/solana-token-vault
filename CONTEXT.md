# Token Vault

An Anchor program on Solana implementing multi-pool, time-locked SPL token staking with minted rewards. Built as a portfolio piece for positioning as a Rust/Anchor/Solana freelance developer.

## Language

**Pool**:
A configuration created by the Admin Authority for a single fixed SPL mint, lock duration, reward rate, and penalty percentage. Immutable once created — changing terms requires creating a new Pool.
_Avoid_: Vault, Program

**Vault Account**:
The PDA-owned token account that custodies a Pool's staked tokens.
_Avoid_: Pool, Treasury

**Stake Position**:
A single user deposit into a Pool, represented by its own PDA account with its own amount and unlock timestamp. A user may hold multiple concurrent Stake Positions in the same Pool.
_Avoid_: Stake (as a noun), Deposit

**Lock Duration**:
The fixed period (in seconds) a Stake Position must remain before reaching Unlock. Set per Pool, immutable.

**Unlock**:
The moment a Stake Position's Lock Duration has elapsed, after which the user may withdraw at full terms (principal + Reward).

**Reward Rate**:
The fixed annualized rate (basis points per year) used to compute Reward. Set per Pool, immutable.
_Avoid_: APY, Interest Rate

**Reward**:
The amount of Reward Token minted to a user upon withdrawal at Unlock, computed from Reward Rate, staked amount, and Lock Duration. Only paid in full at Unlock — never partially claimable mid-lock.
_Avoid_: Yield, Interest

**Reward Token**:
The single token mint shared across every Pool in the program. Its mint authority is a PDA, and new supply is minted only at withdrawal time.
_Avoid_: Reward Mint (fine as informal alias), Yield Token

**Early Withdrawal**:
Withdrawing a Stake Position before Unlock. Forfeits the entire Reward (no pro-rata payout) and incurs a Penalty.

**Penalty**:
A fixed percentage of principal deducted on Early Withdrawal, transferred to the Pool's Treasury.
_Avoid_: Fee, Fine

**Treasury**:
The wallet address designated per Pool at creation time that receives Penalty payments. A distinct role from Admin Authority — a Pool's Treasury need not be the Admin's own wallet.
_Avoid_: Admin wallet

**Admin Authority**:
The privileged signer permitted to create new Pools and Pause the program.
_Avoid_: Owner, Deployer

**Pause**:
An Admin Authority action that halts new Stake Position deposits. Withdrawal and Early Withdrawal always remain available regardless of pause state — funds already deposited can never be locked by an admin action.
_Avoid_: Freeze, Halt
