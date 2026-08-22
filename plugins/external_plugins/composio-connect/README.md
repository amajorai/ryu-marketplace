# Composio Connect
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="composio-connect" width="96" />
  </picture>
</p>

Composio Connect is Ryu's first-party bridge to Composio's hosted **For You**
MCP server. It gives an agent access to Composio's connected apps through one
remote Streamable HTTP MCP connection.

## Setup

The plugin uses Ryu's generic remote-MCP OAuth flow. Open **Marketplace →
Connections**, choose an identity profile, and select **Connect** on Composio
Connect. Ryu opens Composio's browser authorization flow and stores the
resulting provider token in the node's encrypted identity storage.

This path does **not** use `COMPOSIO_API_KEY`. Ryu's existing API-key integration
remains available separately for direct `composio.<action>` catalog actions.

## Safety boundary

Composio's own permission groups (read, write, and destructive) are upstream
policies on the hosted connector. Ryu still applies the local tool allowlist and
approval policy to calls made through `composio_connect.*`. The Simple chat
mode's `Auto` behavior is an agent permission preset; it does not silently
change Composio's upstream permission policy.
