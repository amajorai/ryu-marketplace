// Co-located contract test for the `rtk` plugin (plugins-store/rtk).
// Zero-dependency, runnable with:  node --test plugins-store/rtk/plugin.test.mjs
//
// rtk is a COMMAND-TOOL plugin: it exposes a single `command` backend runnable
// (`rtk__run`) that shells out to the locally-installed `rtk` binary. It has no
// turn_hooks, no mcp_servers, and no http/secret_headers, so there is no inline
// hook JS to execute. This test therefore validates the manifest contract:
// the command spec, the arg-mapping shape, timeout, permission grant, settings
// contributions, and byte-identity with the Core fixture (the built-in
// registration seam that must never drift).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const fixturePath = join(
  here,
  "..",
  "..",
  "apps",
  "core",
  "src",
  "plugin_manifest",
  "fixtures",
  "rtk.manifest.json"
);

const rawManifest = readFileSync(manifestPath, "utf8");

test("manifest.json is valid JSON and parses", () => {
  const parsed = JSON.parse(rawManifest);
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
});

const manifest = JSON.parse(rawManifest);

test("has required top-level id/name/version", () => {
  assert.equal(manifest.id, "rtk");
  assert.equal(typeof manifest.name, "string");
  assert.ok(manifest.name.length > 0);
  // version is present and semver-shaped
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("has descriptive metadata fields", () => {
  for (const field of ["description", "tagline", "category"]) {
    assert.equal(typeof manifest[field], "string", `${field} is a string`);
    assert.ok(manifest[field].length > 0, `${field} is non-empty`);
  }
  assert.equal(typeof manifest.engines, "object");
  assert.equal(typeof manifest.engines.ryu, "string");
});

test("declares exactly one command-tool runnable", () => {
  assert.ok(Array.isArray(manifest.runnables));
  assert.equal(manifest.runnables.length, 1);
  const [run] = manifest.runnables;
  assert.equal(run.id, "tool-rtk-run");
  assert.equal(run.kind, "tool");
  assert.equal(typeof run.config, "object");
});

test("command tool config is well-formed (command backend + rtk bin + timeout)", () => {
  const cfg = manifest.runnables[0].config;
  assert.equal(cfg.slug, "rtk__run");
  assert.equal(cfg.backend, "command");
  assert.equal(cfg.bin, "rtk");
  // timeout is present, numeric, and positive
  assert.equal(typeof cfg.timeout_secs, "number");
  assert.ok(cfg.timeout_secs > 0);
  assert.equal(cfg.timeout_secs, 120);
  assert.equal(typeof cfg.description, "string");
  assert.ok(cfg.description.length > 0);
});

test("input_schema requires `command` and constrains `mode` to the arg-map keys", () => {
  const schema = manifest.runnables[0].config.input_schema;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["command"]);
  assert.equal(schema.properties.command.type, "string");
  assert.equal(schema.properties.mode.type, "string");
  // Every declared enum value must be a key the args map knows how to route.
  const modeEnum = schema.properties.mode.enum;
  assert.deepEqual(modeEnum, ["wrap", "proxy", "test", "err"]);
});

test("args mapping is coherent: mode->flags map covers every enum, command splits shell", () => {
  const cfg = manifest.runnables[0].config;
  const args = cfg.args;
  assert.ok(Array.isArray(args));
  assert.equal(args.length, 2);

  const modeArg = args.find((a) => a.from === "mode");
  const commandArg = args.find((a) => a.from === "command");
  assert.ok(modeArg, "has a mode-derived arg");
  assert.ok(commandArg, "has a command-derived arg");

  // The mode map must (a) cover every enum value from input_schema and
  // (b) map each to an array of CLI tokens; `wrap` is the no-flag default.
  const modeEnum = cfg.input_schema.properties.mode.enum;
  for (const value of modeEnum) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(modeArg.map, value),
      `mode map covers "${value}"`
    );
    assert.ok(Array.isArray(modeArg.map[value]), `mode map[${value}] is an array`);
  }
  assert.deepEqual(modeArg.map.wrap, []);
  assert.deepEqual(modeArg.map.proxy, ["proxy"]);
  assert.deepEqual(modeArg.map.test, ["test"]);
  assert.deepEqual(modeArg.map.err, ["err"]);
  assert.equal(modeArg.default, "wrap");
  // default must itself be a valid enum value
  assert.ok(modeEnum.includes(modeArg.default));

  // The command is passed through with shell splitting and is required.
  assert.equal(commandArg.split, "shell");
  assert.equal(commandArg.required, true);
});

test("simulate arg resolution: mode+command produce the expected rtk argv", () => {
  // Mirror the declarative command backend: mode flags first, then the
  // shell-split command tokens. This exercises the map end-to-end.
  const cfg = manifest.runnables[0].config;
  const modeArg = cfg.args.find((a) => a.from === "mode");
  const resolve = (mode, command) => {
    const flags = modeArg.map[mode ?? modeArg.default] ?? [];
    const tokens = command.trim().split(/\s+/);
    return [...flags, ...tokens];
  };
  assert.deepEqual(resolve(undefined, "git status"), ["git", "status"]);
  assert.deepEqual(resolve("wrap", "git status"), ["git", "status"]);
  assert.deepEqual(resolve("proxy", "cargo test"), ["proxy", "cargo", "test"]);
  assert.deepEqual(resolve("test", "cargo test"), ["test", "cargo", "test"]);
  assert.deepEqual(resolve("err", "ls -la"), ["err", "ls", "-la"]);
});

test("permission_grants scope the command tool to the rtk binary", () => {
  assert.ok(Array.isArray(manifest.permission_grants));
  assert.ok(manifest.permission_grants.includes("tool:command:rtk"));
  // No mcp/http grants — this plugin is command-only.
  for (const grant of manifest.permission_grants) {
    assert.equal(typeof grant, "string");
  }
});

test("this plugin declares NO mcp_servers / http / secret_headers / turn_hooks", () => {
  // Guards the classification: if any of these ever appear, this test file's
  // coverage is no longer sufficient and must grow (e.g. execute hook JS).
  assert.equal(manifest.mcp_servers, undefined);
  const contributes = manifest.contributes ?? {};
  assert.equal(contributes.turn_hooks, undefined);
  const cfg = manifest.runnables[0].config;
  assert.equal(cfg.secret_headers, undefined);
  assert.equal(cfg.http, undefined);
  assert.notEqual(cfg.backend, "http");
});

test("contributes.settings_tabs is well-formed (RTK tab + pref-keyed fields)", () => {
  const tabs = manifest.contributes.settings_tabs;
  assert.ok(Array.isArray(tabs));
  assert.equal(tabs.length, 1);
  const [tab] = tabs;
  assert.equal(tab.id, "rtk.settings");
  assert.equal(typeof tab.title, "string");
  assert.ok(Array.isArray(tab.fields));
  assert.ok(tab.fields.length >= 1);

  const allowedTypes = new Set(["toggle", "textarea", "text", "select"]);
  const prefKeys = new Set();
  for (const field of tab.fields) {
    assert.ok(allowedTypes.has(field.type), `field type "${field.type}" is known`);
    assert.equal(typeof field.pref_key, "string");
    assert.ok(field.pref_key.length > 0);
    assert.equal(typeof field.label, "string");
    assert.ok(field.label.length > 0);
    // pref keys must be unique within the tab
    assert.ok(!prefKeys.has(field.pref_key), `pref_key "${field.pref_key}" is unique`);
    prefKeys.add(field.pref_key);
  }
  assert.ok(prefKeys.has("rtk-wrap-pi"));
  assert.ok(prefKeys.has("rtk-wrap-claude"));
  assert.ok(prefKeys.has("rtk-exclude-commands"));
});

test("manifest is byte-identical to the Core fixture (registration seam)", () => {
  const fixtureRaw = readFileSync(fixturePath, "utf8");
  assert.equal(
    rawManifest,
    fixtureRaw,
    "plugins-store/rtk/manifest.json must byte-match apps/core/.../fixtures/rtk.manifest.json"
  );
});
