// Co-located unit test for the `headroom` plugin manifest.
//
// Runner: `node --test` (zero external deps).
//
// Shape note: `headroom` is a *policy + sidecar* plugin. It declares NO
// `contributes.turn_hooks`, NO `mcp_servers`, NO http/command tool, and NO
// `secret_headers`. There is therefore no inline hook `code` string to extract
// and execute (see the INLINE-HOOK plugins for that pattern). The strongest
// honest test for this manifest is contract validation: assert the JSON is
// valid and well-formed, that the policy runnable and managed sidecar match the
// invariants Core enforces in `crates/core/kernel-contracts/src/schema.rs`
// (`validate_runnable` / `validate_sidecar_spec`), and that the co-located
// manifest stays byte-identical to the built-in Core fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, 'plugin.json');
// plugins-store/headroom -> repo root -> Core fixture.
const FIXTURE_PATH = join(
  HERE,
  '..',
  '..',
  'apps',
  'core',
  'src',
  'plugin_manifest',
  'fixtures',
  'headroom.plugin.json'
);

const RAW = readFileSync(MANIFEST_PATH, 'utf8');

test('plugin.json is valid, parseable JSON', () => {
  assert.doesNotThrow(() => JSON.parse(RAW));
  const m = JSON.parse(RAW);
  assert.equal(typeof m, 'object');
  assert.ok(m !== null && !Array.isArray(m), 'manifest is a JSON object');
});

test('manifest carries required identity fields', () => {
  const m = JSON.parse(RAW);
  assert.equal(m.id, 'headroom');
  assert.equal(typeof m.name, 'string');
  assert.ok(m.name.length > 0, 'name is non-empty');
  // Version must be a non-empty semver-ish string (Core rejects empty version).
  assert.equal(typeof m.version, 'string');
  assert.match(m.version, /^\d+\.\d+\.\d+$/, 'version is semver');
});

test('manifest declares no hook/mcp/tool/secret surfaces (policy+sidecar shape)', () => {
  const m = JSON.parse(RAW);
  // Guard the classification this test rests on: if any of these appear in a
  // future revision, this suite must grow an inline-hook / tool section.
  assert.equal(m.contributes, undefined, 'no contributes block');
  assert.equal(m.mcp_servers, undefined, 'no mcp_servers');
  assert.equal(m.secret_headers, undefined, 'no secret_headers');
  assert.deepEqual(m.permission_grants, [], 'permission_grants is empty');
});

test('policy runnable is well-formed (compression, non-empty policy_type)', () => {
  const m = JSON.parse(RAW);
  assert.ok(Array.isArray(m.runnables), 'runnables is an array');
  assert.equal(m.runnables.length, 1);

  const r = m.runnables[0];
  assert.equal(r.id, 'policy-headroom-compression');
  assert.equal(typeof r.name, 'string');
  assert.ok(r.name.length > 0);
  assert.equal(r.kind, 'policy');

  const cfg = r.config;
  assert.ok(cfg && typeof cfg === 'object', 'config object present');
  // Core: `policy_type` must not be empty.
  assert.equal(typeof cfg.policy_type, 'string');
  assert.ok(cfg.policy_type.length > 0, 'policy_type non-empty');
  assert.equal(cfg.policy_type, 'compression');

  const def = cfg.definition;
  assert.ok(def && typeof def === 'object', 'definition object present');
  assert.equal(def.service, 'headroom');
  assert.equal(typeof def.url, 'string');
  assert.match(def.url, /^http:\/\/127\.0\.0\.1:\d+$/, 'url is loopback http');
  assert.equal(typeof def.timeout_ms, 'number');
  assert.ok(def.timeout_ms > 0, 'timeout_ms positive');
  assert.equal(typeof def.min_messages, 'number');
  assert.ok(
    Number.isInteger(def.min_messages) && def.min_messages >= 0,
    'min_messages is a non-negative integer'
  );
});

test('sidecar is well-formed (local command, leading-slash health_path)', () => {
  const m = JSON.parse(RAW);
  assert.ok(Array.isArray(m.sidecars), 'sidecars is an array');
  assert.equal(m.sidecars.length, 1);

  const s = m.sidecars[0];
  assert.equal(s.name, 'headroom');

  const p = s.process;
  assert.ok(p && typeof p === 'object', 'process object present');
  assert.equal(p.kind, 'local');
  // Core: local 'command' must not be empty.
  assert.equal(typeof p.command, 'string');
  assert.ok(p.command.length > 0, 'command non-empty');
  assert.equal(p.command, 'headroom');
  // Per AGENTS.md: the binary is overridable via an injected env var.
  assert.equal(p.command_env, 'RYU_HEADROOM_BIN');
  assert.ok(Array.isArray(p.args), 'args is an array');

  // Core: health_path must start with '/'.
  assert.equal(typeof s.health_path, 'string');
  assert.ok(s.health_path.startsWith('/'), "health_path starts with '/'");
  assert.equal(s.health_path, '/health');

  // Port must be a valid TCP port.
  assert.equal(typeof s.port, 'number');
  assert.ok(
    Number.isInteger(s.port) && s.port > 0 && s.port < 65_536,
    'port in valid range'
  );
});

test('port is consistent across sidecar.port, sidecar args, and policy url', () => {
  const m = JSON.parse(RAW);
  const sidecar = m.sidecars[0];
  const port = sidecar.port;

  // args carry `--port <port>`.
  const args = sidecar.process.args;
  const portFlagIdx = args.indexOf('--port');
  assert.ok(portFlagIdx >= 0, 'args include --port');
  assert.equal(String(args[portFlagIdx + 1]), String(port), 'args port matches');

  // args carry `--host 127.0.0.1`.
  const hostFlagIdx = args.indexOf('--host');
  assert.ok(hostFlagIdx >= 0, 'args include --host');
  assert.equal(args[hostFlagIdx + 1], '127.0.0.1', 'args host is loopback');

  // The policy definition URL must target the same loopback port the sidecar
  // binds — otherwise the Gateway policy hits a dead port.
  const url = m.runnables[0].config.definition.url;
  const urlPort = Number(new URL(url).port);
  assert.equal(urlPort, port, 'policy url port matches sidecar port');
});

test('co-located manifest is byte-identical to the Core fixture', () => {
  // AGENTS.md byte-identical rule: the built-in registration copy in Core must
  // match this satellite manifest exactly.
  const fixture = readFileSync(FIXTURE_PATH, 'utf8');
  assert.equal(RAW, fixture, 'plugin.json equals Core fixture byte-for-byte');
});
