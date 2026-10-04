# Jina Reader

Jina Reader provides a direct `web.extract` backend for Ryu. The native
`jina_reader.fetch` HTTP tool sends one URL to `https://r.jina.ai/` and requests
JSON output. Its capability adapter maps a successful page to the shared
`web.extract` result shape. A target-page warning or upstream error remains an
error envelope instead of an empty page.

The service works anonymously at Jina's lower free limit. Add an optional
`RYU_PLUGIN__X40_RYU_X2F_JINA_X2D_READER_API_KEY` in the plugin's node settings
for a higher upstream limit. This plugin-scoped name also works as an operator
environment variable without granting the package access to other node secrets.
Ryu keeps the key on the node and sends it only to `r.jina.ai`.

Select **Jina Reader** for the `web.extract` layer after installing the plugin.
The `web.extract` adapter accepts public HTTP and HTTPS URLs without embedded
credentials; it rejects obvious local and private IP targets before the hosted
fetch. Direct callers of the lower-level `jina_reader.fetch` tool must apply
their own target policy.

The adapter and its four cases are verified with:

```sh
node tools/toolsmith/index.mjs verify plugins-store/plugins/jina-reader
```
