# Proof of Work
<p align="center"><img src="./icon.png" alt="proof" width="96" /></p>

The stricter sibling of `/goal`: an independent verifier agent has to prove with tool-gathered evidence that the goal is actually done, rather than judging the transcript alone. The loop runs until that proof lands; `/proof clear` stops it and the verifier model is configurable.

Definition lives in `manifest.json`, its sandboxed hook body in `hooks/loop.js`; Core compiles both in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
