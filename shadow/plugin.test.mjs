// Co-located contract test for the `shadow` plugin.
// Runner: `node --test` (zero dependencies).
//
// `shadow` is a declarative HTTP-tool plugin: it contributes four `tool`
// runnables (search, semantic search, timeline, recent-context) that Core
// proxies to the device-local Shadow sidecar on 127.0.0.1:7980 under
// `/api/shadow/*`, injecting a server-side Authorization bearer. There are no
// inline turn-hook `code` strings to execute, so this test validates the
// manifest contract and the byte-identical Core fixture registration seam.
// See notes in the task report.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "plugin.json");
const raw = readFileSync(manifestPath, "utf8");

const EXPECTED_SLUGS = [
  "shadow__search",
  "shadow__semantic_search",
  "shadow__timeline",
  "shadow__recent_context",
];

test("plugin.json is valid parseable JSON", () => {
  assert.doesNotThrow(() => JSON.parse(raw));
});

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
  assert.equal(manifest.id, "shadow");
  assert.equal(typeof manifest.name, "string");
  assert.ok(manifest.name.length > 0);
  assert.equal(manifest.name, "Shadow");
  // semantic-ish version string
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("contributes exactly four http GET tool runnables", () => {
  assert.ok(Array.isArray(manifest.runnables));
  assert.equal(manifest.runnables.length, 4);
  for (const r of manifest.runnables) {
    assert.equal(r.kind, "tool");
    assert.equal(typeof r.id, "string");
    assert.equal(typeof r.name, "string");
    assert.equal(r.config.backend, "http");
    assert.equal(r.config.method, "GET");
  }
});

// Index runnables by their native tool slug for precise assertions.
const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("exposes the four native shadow__* tool ids, each namespaced", () => {
  for (const slug of EXPECTED_SLUGS) {
    assert.ok(bySlug.has(slug), `missing ${slug} slug`);
  }
  assert.equal(bySlug.size, EXPECTED_SLUGS.length);
  for (const slug of bySlug.keys()) {
    assert.ok(slug.startsWith("shadow__"), `slug ${slug} not namespaced`);
  }
});

test("every tool carries a SERVER-SIDE Authorization secret header from env", () => {
  for (const r of manifest.runnables) {
    const sh = r.config.secret_headers;
    assert.ok(sh, `${r.config.slug} missing secret_headers`);
    // Key insight: the bearer lives in secret_headers (server-side injection by
    // Core's /api/shadow/* proxy), references an env var, and is never a literal
    // token baked into the manifest.
    assert.equal(sh.Authorization, "Bearer env:RYU_TOKEN");
    assert.match(sh.Authorization, /env:/);
    assert.doesNotMatch(sh.Authorization, /Bearer\s+[A-Za-z0-9_-]{16,}$/);
  }
});

test("every tool targets the loopback Shadow sidecar over http under /api/shadow", () => {
  for (const r of manifest.runnables) {
    const u = new URL(r.config.url);
    assert.equal(u.protocol, "http:", `${r.config.slug} must stay on loopback http`);
    assert.equal(u.hostname, "127.0.0.1");
    assert.equal(u.port, "7980");
    assert.ok(
      u.pathname.startsWith("/api/shadow/"),
      `${r.config.slug} path ${u.pathname} not under /api/shadow/`
    );
  }
});

test("each tool routes to its expected Shadow sidecar path", () => {
  const pathBySlug = {
    shadow__search: "/api/shadow/search",
    shadow__semantic_search: "/api/shadow/search/semantic",
    shadow__timeline: "/api/shadow/timeline",
    shadow__recent_context: "/api/shadow/context/recent",
  };
  for (const [slug, path] of Object.entries(pathBySlug)) {
    assert.equal(new URL(bySlug.get(slug).config.url).pathname, path);
  }
});

test("every tool is a fail_open, unwrap_body proxy", () => {
  // Windows-first capture: when the sidecar is down the tool must fail open
  // (report unavailable) rather than error the whole turn.
  for (const r of manifest.runnables) {
    assert.equal(r.config.fail_open, true, `${r.config.slug} not fail_open`);
    assert.equal(r.config.unwrap_body, true, `${r.config.slug} not unwrap_body`);
  }
});

test("search + semantic-search require q; a positive-int limit is optional", () => {
  for (const slug of ["shadow__search", "shadow__semantic_search"]) {
    const s = bySlug.get(slug).config.input_schema;
    assert.equal(s.type, "object");
    assert.equal(s.properties.q.type, "string");
    assert.deepEqual(s.required, ["q"]);
    assert.equal(s.properties.limit.type, "integer");
    assert.equal(s.properties.limit.minimum, 1);
  }
});

test("timeline requires an explicit integer [start, end] range", () => {
  const s = bySlug.get("shadow__timeline").config.input_schema;
  assert.equal(s.type, "object");
  assert.equal(s.properties.start.type, "integer");
  assert.equal(s.properties.end.type, "integer");
  assert.deepEqual(s.required, ["start", "end"]);
});

test("recent-context takes an optional positive-int minute window and requires nothing", () => {
  const cfg = bySlug.get("shadow__recent_context").config;
  const s = cfg.input_schema;
  assert.equal(s.type, "object");
  assert.equal(s.properties.q.type, "integer");
  assert.equal(s.properties.q.minimum, 1);
  // No required keys: Shadow defaults the window when q is omitted.
  assert.ok(!("required" in s) || s.required.length === 0);
});

test("required schema keys are actually declared in properties", () => {
  for (const r of manifest.runnables) {
    const sch = r.config.input_schema;
    const required = Array.isArray(sch.required) ? sch.required : [];
    for (const key of required) {
      assert.ok(
        Object.hasOwn(sch.properties, key),
        `${r.config.slug}: required key ${key} not in properties`
      );
    }
  }
});

test("permission_grants gate egress to loopback only, matching called hosts", () => {
  assert.ok(Array.isArray(manifest.permission_grants));
  assert.deepEqual(manifest.permission_grants, [
    "tool:http-egress:127.0.0.1",
  ]);
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
    "../../apps/core/src/plugin_manifest/fixtures/shadow.plugin.json"
  );
  let fixture;
  try {
    fixture = readFileSync(fixturePath);
  } catch {
    // Satellite tree ships without apps/core; skip rather than fail there.
    return;
  }
  assert.deepEqual(
    readFileSync(manifestPath),
    fixture,
    "plugin.json drifted from the Core fixture — they must be byte-identical"
  );
});
