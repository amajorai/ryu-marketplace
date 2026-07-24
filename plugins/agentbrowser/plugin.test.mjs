// Co-located unit test for the `agentbrowser` plugin manifest.
// Zero-dependency, runnable with: node --test plugin.test.mjs
//
// agentbrowser is a manifest-only plugin: it contributes an MCP server
// (`npx -y agentbrowser`) and has no inline turn_hooks, so there is no
// executable hook code to run. The strongest honest coverage is therefore
// structural validation of the manifest contract Core relies on:
//   - manifest.json parses as valid JSON
//   - required identity fields (id / name / version) are well-formed
//   - the mcp_servers command spec is well-formed (command + args)
//   - permission_grants line up with the declared MCP server id
// See notes in the reported summary.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

const RAW = readFileSync(MANIFEST_PATH, "utf8");
const SEMVER = /^\d+\.\d+\.\d+/;

test("manifest.json is valid JSON and parses", () => {
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(RAW);
  }, "manifest.json must be parseable JSON");
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
});

test("required identity fields are present and well-formed", () => {
  const m = JSON.parse(RAW);

  assert.equal(typeof m.id, "string");
  assert.ok(m.id.length > 0, "id must be non-empty");
  assert.equal(m.id, "agentbrowser");

  assert.equal(typeof m.name, "string");
  assert.ok(m.name.length > 0, "name must be non-empty");

  assert.equal(typeof m.version, "string");
  assert.match(m.version, SEMVER, "version must be semver-ish");
});

test("runnables is an array (empty for this MCP-only plugin)", () => {
  const m = JSON.parse(RAW);
  assert.ok(Array.isArray(m.runnables), "runnables must be an array");
});

test("mcp_servers.agentbrowser is a well-formed command spec", () => {
  const m = JSON.parse(RAW);

  assert.equal(typeof m.mcp_servers, "object");
  assert.notEqual(m.mcp_servers, null);

  const server = m.mcp_servers.agentbrowser;
  assert.ok(server, "must declare an `agentbrowser` MCP server");

  // command must be a non-empty string
  assert.equal(typeof server.command, "string");
  assert.ok(server.command.length > 0, "command must be non-empty");
  assert.equal(server.command, "npx");

  // args must be a string array launching the agentbrowser package
  assert.ok(Array.isArray(server.args), "args must be an array");
  for (const arg of server.args) {
    assert.equal(typeof arg, "string", "every arg must be a string");
  }
  assert.deepEqual(server.args, ["-y", "agentbrowser"]);

  // description, if present, must be a non-empty string
  if (server.description !== undefined) {
    assert.equal(typeof server.description, "string");
    assert.ok(server.description.length > 0, "description must be non-empty");
  }
});

test("permission_grants reference the declared MCP server", () => {
  const m = JSON.parse(RAW);

  assert.ok(Array.isArray(m.permission_grants), "permission_grants must be an array");
  for (const grant of m.permission_grants) {
    assert.equal(typeof grant, "string");
  }

  // The mcp:<id> grant must correspond to an actually-declared server.
  const mcpGrants = m.permission_grants.filter((g) => g.startsWith("mcp:"));
  for (const grant of mcpGrants) {
    const serverId = grant.slice("mcp:".length);
    assert.ok(
      Object.hasOwn(m.mcp_servers ?? {}, serverId),
      `permission grant ${grant} must match a declared mcp_servers key`
    );
  }
  assert.ok(mcpGrants.includes("mcp:agentbrowser"));
});

test("no inline turn_hooks are declared (nothing to execute)", () => {
  const m = JSON.parse(RAW);
  const hooks = m.contributes?.turn_hooks;
  // agentbrowser contributes no turn hooks; if this ever changes, this test
  // fails loudly so a maintainer adds executable-hook coverage.
  assert.ok(
    hooks === undefined || (Array.isArray(hooks) && hooks.length === 0),
    "agentbrowser declares no turn_hooks; add hook-execution tests if it starts to"
  );
});
