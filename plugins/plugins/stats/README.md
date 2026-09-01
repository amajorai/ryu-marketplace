# Session Stats

Adds a pre-installed `session-stats` chat feature. The desktop host reads the
structured transcript parts emitted by Core and shows turns, tool steps, token
counts, prompt-cache efficiency, cache lifetime, throughput, context usage,
compactions, cost, and provider usage windows when those values exist.

The plugin owns the contribution and settings contract. Core remains the
authority for provider routing, transcript access, and subscription usage; the
desktop owns the native renderer. Missing provider fields stay missing instead
of becoming misleading zeroes.
