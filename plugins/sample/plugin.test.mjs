// Co-located contract test for the `sample` (Research Assistant) plugin.
// Runner: `node --test` (zero dependencies).
//
// `sample` is a purely declarative manifest plugin: no `sidecar`, no Core Rust,
// no `mcp_servers`, no inline `turn_hooks[].code` strings, and no `http`/`command`
// tool proxy. It contributes four `runnables` (agent / workflow / tool / skill),
// a `permission_grants` allowlist, and a desktop `companion`. There is therefore
// no executable hook logic to run; this test validates the manifest contract,
// the internal coherence between runnables and grants, and the byte-identical
// Core fixture registration seam. See notes in the task report.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");

test("manifest.json is valid parseable JSON", () => {
  assert.doesNotThrow(() => JSON.parse(raw));
});

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
  assert.equal(manifest.id, "com.example.research-assistant");
  assert.equal(typeof manifest.name, "string");
  assert.ok(manifest.name.length > 0);
  assert.equal(manifest.name, "Research Assistant");
  // semantic version string
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("declares a runnables array with four entries", () => {
  assert.ok(Array.isArray(manifest.runnables));
  assert.equal(manifest.runnables.length, 4);
  for (const r of manifest.runnables) {
    assert.equal(typeof r.id, "string");
    assert.ok(r.id.length > 0, "runnable id must be non-empty");
    assert.equal(typeof r.name, "string");
    assert.ok(r.name.length > 0, "runnable name must be non-empty");
    assert.equal(typeof r.kind, "string");
    assert.equal(typeof r.config, "object");
    assert.notEqual(r.config, null);
  }
});

test("runnable ids are unique", () => {
  const ids = manifest.runnables.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate runnable id");
});

// Index runnables by kind for precise per-kind assertions. Each kind appears once.
const byKind = new Map(manifest.runnables.map((r) => [r.kind, r]));

test("contributes exactly one of each supported kind", () => {
  const kinds = manifest.runnables.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["agent", "skill", "tool", "workflow"]);
});

test("agent runnable is well-formed", () => {
  const a = byKind.get("agent");
  assert.equal(a.id, "agent-researcher");
  assert.equal(typeof a.config.system_prompt, "string");
  assert.ok(a.config.system_prompt.length > 0);
  assert.equal(typeof a.config.model, "string");
  assert.ok(a.config.model.length > 0);
  assert.ok(Array.isArray(a.config.tools));
  assert.ok(a.config.tools.includes("web_search"));
});

test("workflow runnable declares an entry step", () => {
  const w = byKind.get("workflow");
  assert.equal(w.id, "wf-summarise");
  assert.equal(typeof w.config.entry, "string");
  assert.ok(w.config.entry.length > 0);
});

test("tool runnable declares a slug", () => {
  const t = byKind.get("tool");
  assert.equal(t.id, "tool-web-search");
  assert.equal(typeof t.config.slug, "string");
  assert.equal(t.config.slug, "web_search");
});

test("skill runnable declares a skill_id", () => {
  const s = byKind.get("skill");
  assert.equal(s.id, "skill-research");
  assert.equal(typeof s.config.skill_id, "string");
  assert.ok(s.config.skill_id.length > 0);
});

test("agent tools reference a tool actually contributed by the plugin", () => {
  const agent = byKind.get("agent");
  const declaredSlugs = new Set(
    manifest.runnables
      .filter((r) => r.kind === "tool")
      .map((r) => r.config.slug)
  );
  // Every non-builtin tool the agent lists should resolve to a contributed
  // tool runnable. `web_search` is contributed by this same manifest.
  assert.ok(
    declaredSlugs.has("web_search"),
    "agent references web_search but no tool runnable provides it"
  );
});

test("permission_grants is a coherent mcp allowlist", () => {
  assert.ok(Array.isArray(manifest.permission_grants));
  assert.deepEqual(manifest.permission_grants, [
    "mcp:web_search",
    "mcp:file_read",
  ]);
  for (const grant of manifest.permission_grants) {
    assert.match(grant, /^mcp:/, `grant ${grant} is not namespaced under mcp:`);
  }
});

test("the tool the agent uses has a matching mcp permission grant", () => {
  const agent = byKind.get("agent");
  const grantedTools = new Set(
    manifest.permission_grants
      .filter((g) => g.startsWith("mcp:"))
      .map((g) => g.slice("mcp:".length))
  );
  for (const tool of agent.config.tools) {
    assert.ok(
      grantedTools.has(tool),
      `agent uses tool ${tool} without an mcp: permission grant`
    );
  }
});

test("companion descriptor is well-formed", () => {
  const c = manifest.companion;
  assert.equal(typeof c, "object");
  assert.notEqual(c, null);
  assert.equal(typeof c.label, "string");
  assert.ok(c.label.length > 0);
  assert.equal(typeof c.icon, "string");
  assert.ok(c.icon.length > 0);
  // shortcut is a modifier+key chord
  assert.equal(typeof c.shortcut, "string");
  assert.match(c.shortcut, /^[a-z]+(\+[a-z]+)+$/, "shortcut must be a chord");
});

test("manifest declares no executable hook / mcp / sidecar surface", () => {
  // Guards the test's own premise: if a future edit adds turn_hooks, mcp_servers,
  // an http/command tool proxy, or a sidecar, this test (and its notes) must be
  // revisited to actually execute that logic rather than only validate shape.
  assert.equal(manifest.contributes, undefined);
  assert.equal(manifest.mcp_servers, undefined);
  assert.equal(manifest.sidecar, undefined);
  for (const r of manifest.runnables) {
    assert.notEqual(r.config.backend, "http");
    assert.notEqual(r.config.backend, "command");
    assert.equal(r.config.secret_headers, undefined);
  }
});

test("manifest is byte-identical to the Core fixture (registration seam)", () => {
  const fixturePath = resolve(
    here,
    "../../apps/core/src/plugin_manifest/fixtures/sample.manifest.json"
  );
  // Skip on the SATELLITE tree (no apps/core at all), but fail loudly if the
  // fixtures directory is here and only the file name is wrong — otherwise a
  // broken path silently skips instead of catching real drift.
  if (!existsSync(dirname(fixturePath))) {
    return;
  }
  const fixture = readFileSync(fixturePath);
  assert.deepEqual(
    readFileSync(manifestPath),
    fixture,
    "manifest.json drifted from the Core fixture — they must be byte-identical"
  );
});
