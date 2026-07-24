// Co-located contract test for the `exa` plugin.
// Runner: `node --test` (zero dependencies).
//
// `exa` is a declarative HTTP-tool plugin: it contributes two `tool` runnables
// (search + find-similar) that Core proxies to https://api.exa.ai with a
// server-side Authorization header. There are no inline turn-hook `code`
// strings to execute, so this test validates the manifest contract and the
// byte-identical Core fixture registration seam. See notes in the task report.

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
  assert.equal(manifest.id, "exa");
  assert.equal(typeof manifest.name, "string");
  assert.ok(manifest.name.length > 0);
  // semantic-ish version string
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
  assert.equal(typeof manifest.engines?.ryu, "string");
  assert.match(manifest.engines.ryu, /^>=/);
});

test("contributes exactly two http tool runnables", () => {
  assert.ok(Array.isArray(manifest.runnables));
  assert.equal(manifest.runnables.length, 2);
  for (const r of manifest.runnables) {
    assert.equal(r.kind, "tool");
    assert.equal(typeof r.id, "string");
    assert.equal(typeof r.name, "string");
    assert.equal(r.config.backend, "http");
    assert.equal(r.config.method, "POST");
  }
});

// Index runnables by their native tool slug for precise assertions.
const bySlug = new Map(
  manifest.runnables.map((r) => [r.config.slug, r])
);

test("exposes the native tool ids exa__search and exa__find_similar", () => {
  assert.ok(bySlug.has("exa__search"), "missing exa__search slug");
  assert.ok(bySlug.has("exa__find_similar"), "missing exa__find_similar slug");
  // slugs are namespaced under the plugin id
  for (const slug of bySlug.keys()) {
    assert.ok(slug.startsWith("exa__"), `slug ${slug} not namespaced`);
  }
});

test("both tools carry a SERVER-SIDE Authorization secret header from env", () => {
  for (const r of manifest.runnables) {
    const sh = r.config.secret_headers;
    assert.ok(sh, `${r.id} missing secret_headers`);
    // Key insight: the key lives in secret_headers (server-side injection),
    // NOT in the client-visible request, and references an env var — never a
    // literal token baked into the manifest.
    assert.equal(sh.Authorization, "Bearer env:RYU_EXA_API_KEY");
    assert.match(sh.Authorization, /env:/);
    assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
  }
});

test("both tools target the api.exa.ai host over https", () => {
  for (const r of manifest.runnables) {
    const u = new URL(r.config.url);
    assert.equal(u.protocol, "https:");
    assert.equal(u.hostname, "api.exa.ai");
  }
});

test("search tool routes to /search with sane body defaults", () => {
  const s = bySlug.get("exa__search");
  assert.equal(new URL(s.config.url).pathname, "/search");
  const bd = s.config.body_defaults;
  assert.equal(bd.num_results, 10);
  assert.equal(bd.use_autoprompt, true);
  assert.deepEqual(bd.contents, { text: true });
});

test("find-similar tool routes to /findSimilar with num_results default", () => {
  const f = bySlug.get("exa__find_similar");
  assert.equal(new URL(f.config.url).pathname, "/findSimilar");
  assert.equal(f.config.body_defaults.num_results, 10);
});

test("both tools are fail_open and unwrap_body proxies", () => {
  for (const r of manifest.runnables) {
    assert.equal(r.config.fail_open, true);
    assert.equal(r.config.unwrap_body, true);
  }
});

test("input schemas are well-formed JSON Schema objects with required keys", () => {
  const s = bySlug.get("exa__search").config.input_schema;
  assert.equal(s.type, "object");
  assert.equal(s.properties.query.type, "string");
  assert.deepEqual(s.required, ["query"]);
  // declared numeric bounds are coherent
  assert.equal(s.properties.num_results.type, "integer");
  assert.ok(s.properties.num_results.minimum <= s.properties.num_results.maximum);

  const f = bySlug.get("exa__find_similar").config.input_schema;
  assert.equal(f.type, "object");
  assert.equal(f.properties.url.type, "string");
  assert.deepEqual(f.required, ["url"]);
});

test("required schema properties are actually declared in properties", () => {
  for (const r of manifest.runnables) {
    const sch = r.config.input_schema;
    for (const key of sch.required) {
      assert.ok(
        Object.hasOwn(sch.properties, key),
        `${r.config.slug}: required key ${key} not in properties`
      );
    }
  }
});

test("permission_grants gate egress to the exa host only", () => {
  assert.ok(Array.isArray(manifest.permission_grants));
  assert.deepEqual(manifest.permission_grants, [
    "tool:http-egress:api.exa.ai",
  ]);
  // the granted egress host matches the hosts the tools actually call
  const hosts = new Set(
    manifest.runnables.map((r) => new URL(r.config.url).hostname)
  );
  for (const h of hosts) {
    assert.ok(
      manifest.permission_grants.includes(`tool:http-egress:${h}`),
      `no egress grant for called host ${h}`
    );
  }
});

test("manifest is byte-identical to the Core fixture (registration seam)", () => {
  const fixturePath = resolve(
    here,
    "../../apps/core/src/plugin_manifest/fixtures/exa.manifest.json"
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
