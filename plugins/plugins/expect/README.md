# Expect
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="expect" width="96" />
  </picture>
</p>

[Expect](https://www.expect.dev/) is a browser QA MCP server for agent code. It
reads the current changes, creates a test plan, and runs that plan in a real
browser with Playwright to catch behavior, performance, security, and design
regressions.

Ryu ships the plugin enabled by default. Core launches the server lazily as:

```bash
npx -y expect-cli@latest mcp
```

Node.js and network access for the first `npx` download are required. Once the
server is running, its tools appear under the `expect.` namespace. Disable the
plugin from the App store if this local browser-testing process is not wanted.
