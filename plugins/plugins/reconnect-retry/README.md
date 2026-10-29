# Reconnect Retry
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="reconnect-retry" width="96" />
  </picture>
</p>

Reconnect Retry is an opt-in host-rendered chat feature for Ryu. When the selected
node or the browser's network connection goes away, it remembers conversations that
were actively running. When both the network and node are reachable again, it asks
Core to retry each eligible terminal turn once.

The plugin is deliberately bounded:

- An in-flight turn is resumed first, so a dropped UI stream is not duplicated.
- Only conversations observed as running during the outage are candidates.
- Core re-checks the conversation ACL, terminal run status, and persisted user turn
  before accepting a retry.
- The retry skips appending the already-saved user message, and one outage gets at
  most one automatic attempt per conversation.

The package contributes only the declarative `chat_features` entry. Desktop owns
the native network/node signal and Core owns the retry authorization and lifecycle;
there is no sandboxed hook body or sidecar.
