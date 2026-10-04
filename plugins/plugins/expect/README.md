# Expect

[Expect](https://www.expect.dev/) is a browser QA MCP server for agent code. It
reads the current changes, creates a test plan, and runs that plan in a real
browser with Playwright to catch behavior, performance, security, and design
regressions.

Ryu ships the plugin install-on-demand. After the user installs and enables it, Core launches the server lazily as:

```bash
npx -y expect-cli@0.1.3 mcp
```

Node.js and network access for the first `npx` download are required. Once the
server is running, its tools appear under the `expect.` namespace. Disable the
plugin from the App store if this local browser-testing process is not wanted.
