# Ryu Docs
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="docs" width="96" />
  </picture>
</p>

Read-only [Model Context Protocol](https://modelcontextprotocol.io) access to the
Ryu documentation, served by the docs site itself at
`https://docs.ryuhq.com/mcp` — the same pattern OpenAI hosts for its developer
docs. Ships built-in and enabled by default, so every agent can look up Ryu
documentation without leaving the chat.

The plugin declares a **remote** MCP server (`docs`) that Core registers on
enable. Unlike `ghost` or `agentbrowser` there is nothing to install: the
server runs on the docs site, so the tools appear as soon as the plugin is
enabled and the docs site is reachable.

## Tools

| Tool | Description |
| --- | --- |
| `docs_search` | Search the docs (`{ query, limit?, tag? }`), returns ranked hits with URLs and snippets. |
| `docs_get_page` | Fetch one docs page as Markdown (`{ path }` — a `/docs/...` path or full URL). |
| `docs_index` | List documentation pages, optionally filtered by top-level section (`{ section? }`). |

In the Ryu registry the tools surface as `docs__docs_search`,
`docs__docs_get_page` and `docs__docs_index`.

## Overriding the endpoint

The default URL is the public docs site. To point the server at a local or
staging docs build (e.g. `http://127.0.0.1:4000/mcp`), add a `docs` entry to
your `~/.ryu/mcp.json` — a user `mcp.json` entry with the same name wins over
the built-in declaration:

```json
{
  "mcpServers": {
    "docs": {
      "type": "http",
      "url": "http://127.0.0.1:4000/mcp"
    }
  }
}
```

The server is documentation-only: it searches and returns docs content, and
never calls a Ryu API or a model. The plain-Markdown `/llms.txt`,
`/llms-full.txt` and `/llms-sections/<section>` endpoints expose the same
content for hosts without MCP support.
