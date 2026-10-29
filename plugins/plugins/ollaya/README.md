# Ollaya Decision Models
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="ollaya" width="96" />
  </picture>
</p>

`@ryu/ollaya` connects a Ryu node to an Ollaya service running on that same
machine. Ollaya owns model installation and process lifecycle; the plugin only
calls its local TypeSafe-compatible HTTP API.

Start Ollaya and pull a model, for example:

```sh
ollaya run laya
```

Enable **Ollaya Decision Models** in Ryu and select it from the node selector's
**Decision Models** layer. Agents use the stable `decision.predict` tool for
typed `choice`, `score`, and `noul` questions. `ollaya.models` lists checkpoints
already available in the local service.

The provider sends requests to `127.0.0.1:11435` and supports a keyless local
service. Core does not send provider credentials over plaintext HTTP. An Ollaya
server configured with `OLLAYA_API_KEY` is unsupported by this connector until
an HTTPS transport is available. Calls fail visibly while Ollaya is unavailable
or a requested model is not installed.
