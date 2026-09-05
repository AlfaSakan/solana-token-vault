# Multi-pool factory with immutable per-pool terms

We considered a single global vault (one fixed mint, one lock duration, one reward rate) versus a factory where the Admin Authority creates any number of Pools, each with its own mint, lock duration, reward rate, penalty percentage, and treasury. We chose the factory model because it better demonstrates PDA seeding and account derivation, and lets the portfolio piece show multiple staking products from one deployed program.

Each Pool's terms are immutable once created — there is no instruction to edit an existing Pool's parameters. Changing terms means deploying a new Pool. This was a deliberate choice: mutable terms would let the Admin Authority alter conditions for stakers already locked into a Pool, which is a trust problem worth avoiding rather than solving.
