# Pause blocks new deposits only, never withdrawals

The Admin Authority can Pause the program, but Pause only rejects new Stake Position deposits. Withdrawal and Early Withdrawal instructions ignore pause state entirely and always succeed (subject to their own normal constraints).

This is deliberate: a pause mechanism that could also block withdrawals would let the Admin Authority trap user funds, which is the exact failure mode a custody-holding program must not have. Anyone reading the withdrawal instruction and wondering why it doesn't check the pause flag should take this as intentional, not a missing check.
