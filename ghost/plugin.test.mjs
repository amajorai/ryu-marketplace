// Co-located contract test for the `ghost` plugin (plugins-store/ghost).
// Zero-dependency, runnable with:  node --test plugins-store/ghost/plugin.test.mjs
//
// ghost is an MCP-SERVER plugin (same shape as agentbrowser): it contributes a
// single stdio MCP server (`ghost`) that shells out to a locally-installed
// `ghost` binary and is gated behind an `mcp:ghost` permission grant. It has no
// turn_hooks, no http/secret_headers, and no command-tool runnable — so there is
// no inline hook JS to execute. This test validates the manifest contract:
// the mcp_servers spec (command / command_env / args), the permission grant that
// matches the server id, the empty-runnables invariant, a NO-hook/http/secret
// classification guard, and byte-identity with the Core fixture (the built-in
// registration seam that must never drift).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "plugin.json");
const fixturePath = join(
  here,
  "..",
  "..",
  "apps",
  "core",
  "src",
  "plugin_manifest",
  "fixtures",
  "ghost.plugin.json"
);

const rawManifest = readFileSync(manifestPath, "utf8");

test("plugin.json is valid JSON and parses to an object", () => {
  const parsed = JSON.parse(rawManifest);
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
});

const manifest = JSON.parse(rawManifest);

test("has required top-level id/name/version", () => {
  assert.equal(manifest.id, "ghost");
  assert.equal(typeof manifest.name, "string");
  assert.equal(manifest.name, "Ghost");
  assert.ok(manifest.name.length > 0);
  // version is present and semver-shaped
  assert.equal(typeof manifest.version, "string");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("runnables is present and empty (all capability ships via the MCP server)", () => {
  assert.ok(Array.isArray(manifest.runnables));
  assert.equal(manifest.runnables.length, 0);
});

test("declares exactly one mcp server, keyed `ghost`", () => {
  assert.equal(typeof manifest.mcp_servers, "object");
  assert.notEqual(manifest.mcp_servers, null);
  const keys = Object.keys(manifest.mcp_servers);
  assert.deepEqual(keys, ["ghost"]);
});

test("the ghost mcp server spec is well-formed (stdio command + env override + args)", () => {
  const server = manifest.mcp_servers.ghost;
  assert.equal(typeof server, "object");

  // Launches the `ghost` binary over stdio (no url => stdio transport).
  assert.equal(server.command, "ghost");
  assert.equal(server.url, undefined, "stdio server must not carry a url");

  // Env var lets Core point at an overridden binary path (RYU_<APP>_BIN seam).
  assert.equal(server.command_env, "RYU_GHOST_BIN");
  assert.match(server.command_env, /^RYU_[A-Z0-9_]+_BIN$/);

  // Args launch MCP mode: `ghost mcp`.
  assert.ok(Array.isArray(server.args));
  assert.deepEqual(server.args, ["mcp"]);
  for (const arg of server.args) {
    assert.equal(typeof arg, "string");
  }

  // Human-facing description present and non-empty.
  assert.equal(typeof server.description, "string");
  assert.ok(server.description.length > 0);
});

test("permission_grants gate the mcp server and match its id", () => {
  assert.ok(Array.isArray(manifest.permission_grants));
  assert.ok(
    manifest.permission_grants.includes("mcp:ghost"),
    "must grant mcp:ghost"
  );
  for (const grant of manifest.permission_grants) {
    assert.equal(typeof grant, "string");
  }
  // Every `mcp:<id>` grant must name a declared mcp server, and every declared
  // server must be covered by a grant — the two sides cannot drift.
  const serverIds = new Set(Object.keys(manifest.mcp_servers));
  const grantedMcpIds = new Set(
    manifest.permission_grants
      .filter((g) => g.startsWith("mcp:"))
      .map((g) => g.slice("mcp:".length))
  );
  for (const id of serverIds) {
    assert.ok(grantedMcpIds.has(id), `server "${id}" has a matching mcp grant`);
  }
  for (const id of grantedMcpIds) {
    assert.ok(serverIds.has(id), `grant mcp:${id} names a declared server`);
  }
});

test("this plugin declares NO turn_hooks / http-tool / command-tool / secret_headers", () => {
  // Guards the classification: ghost is a pure MCP-server plugin. If any of
  // these ever appear, this test file's coverage is no longer sufficient and
  // must grow (e.g. execute inline hook JS, or assert http/secret_headers).
  const contributes = manifest.contributes ?? {};
  assert.equal(contributes.turn_hooks, undefined);
  assert.equal(manifest.runnables.length, 0, "no command/http-tool runnables");
  // No server in the manifest is an http-tool or carries secret headers.
  const raw = rawManifest;
  assert.ok(!raw.includes("secret_headers"), "no secret_headers anywhere");
});

test("manifest is byte-identical to the Core fixture (registration seam)", () => {
  const fixtureRaw = readFileSync(fixturePath, "utf8");
  assert.equal(
    rawManifest,
    fixtureRaw,
    "plugins-store/ghost/plugin.json must byte-match apps/core/.../fixtures/ghost.plugin.json"
  );
});
