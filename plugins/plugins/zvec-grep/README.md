# zvec-grep
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="zvec-grep" width="96" />
  </picture>
</p>

Semantic and ranked workspace search for Ryu agents, powered by
[zvec-grep](https://github.com/zvec-ai/zvec-grep)'s `zg` CLI. This is a
manifest-only MCP plugin: the upstream project owns indexing, retrieval,
embedding authorization, and the local daemon; Ryu owns plugin lifecycle and
MCP governance.

## Tool

The plugin registers one upstream MCP server under the `zvec_grep` namespace:

| Tool id | Purpose |
| --- | --- |
| `zvec_grep.zvec_grep_search` | Hybrid, lexical, or vector retrieval over an indexed workspace |

The plugin launches:

```text
npx -y @zvec/zvec-grep@0.2.1 server --stdio
```

The pinned upstream stdio bridge starts or reuses zvec-grep's local daemon and
proxies its default `agent` MCP toolset. That default intentionally exposes
search only. Index creation, index deletion, status, and managed ripgrep stay
explicit CLI operations; the separate Ryu `ripgrep` plugin owns exact search.

## Setup

zvec-grep requires Node.js 22 or newer. Install or run the pinned package, then
create an index explicitly for the workspace you want the agent to search:

```bash
npm install -g @zvec/zvec-grep
cd /absolute/path/to/workspace
zg index --embedding local/potion-code-16m-v2
```

The index is stored under `.zvec-grep/` in the indexed workspace. The first Ryu
MCP connection may download the pinned package through `npx`; later calls reuse
the local package cache and daemon. Local embedding models keep content on the
machine. Remote embeddings are an upstream opt-in and remain separate from Ryu
plugin permissions.

## Security and lifecycle

The upstream server is local-first and loopback-only. Ryu starts its
stdio bootstrap bridge only when the plugin is enabled and a tool list/call is
needed; it does not silently create or delete a persistent index. The upstream
bridge may leave its shared daemon running so later CLI and agent calls can reuse
the same workspace runtime.

Calls require the `mcp:zvec_grep` grant. The plugin is Core-tier but opt-in in
Ryu because it requires a BYO Node runtime and an explicit workspace index; it
does not install a daemon or model during Ryu startup.

## Tests

```bash
node --test
```

The co-located test checks the pinned package, stdio bootstrap arguments, MCP
server/grant pairing, default search-only posture, and empty runnable list.
