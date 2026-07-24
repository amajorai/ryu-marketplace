// Co-located test for the `spider` plugin manifest.
//
// Spider is a declarative `command`-tool plugin (no inline turn_hooks, no
// mcp_servers, no http tool, no secret_headers). It shells out to the locally
// installed `spider` CLI. There is therefore no embedded JS to execute; the
// strongest honest test is a full validation of the command-tool contract:
// the runnable shape, the placeholder<->input_schema wiring, the egress arg,
// the timeout, and the permission grant. We also assert the manifest is
// byte-identical to the Core built-in fixture (the registration seam).
//
// Runner: `node --test` (zero deps).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

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
  "spider.plugin.json"
);

const raw = readFileSync(manifestPath, "utf8");

test("plugin.json is valid JSON and parses", () => {
  assert.doesNotThrow(() => JSON.parse(raw));
});

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
  assert.equal(manifest.id, "spider");
  assert.equal(typeof manifest.name, "string");
  assert.ok(manifest.name.length > 0);
  assert.equal(typeof manifest.version, "string");
  // semver-ish
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("declares an engines.ryu constraint", () => {
  assert.equal(typeof manifest.engines, "object");
  assert.equal(typeof manifest.engines.ryu, "string");
  assert.match(manifest.engines.ryu, /^>=/);
});

test("runnables is a non-empty array with the crawl tool", () => {
  assert.ok(Array.isArray(manifest.runnables));
  assert.equal(manifest.runnables.length, 1);
  const r = manifest.runnables[0];
  assert.equal(r.kind, "tool");
  assert.equal(r.id, "tool-spider-crawl");
  assert.equal(typeof r.name, "string");
  assert.equal(typeof r.config, "object");
});

const config = manifest.runnables[0].config;

test("command-tool config is well-formed", () => {
  assert.equal(config.backend, "command");
  assert.equal(config.slug, "spider__crawl");
  assert.equal(config.bin, "spider");
  assert.equal(config.output, "json");
  // timeout must be a positive integer number of seconds
  assert.equal(typeof config.timeout_secs, "number");
  assert.ok(Number.isInteger(config.timeout_secs));
  assert.ok(config.timeout_secs > 0);
  assert.equal(config.timeout_secs, 120);
  assert.equal(typeof config.description, "string");
  assert.ok(config.description.length > 0);
});

test("command_args is a string array beginning with the subcommand", () => {
  assert.ok(Array.isArray(config.command_args));
  for (const a of config.command_args) {
    assert.equal(typeof a, "string");
  }
  assert.equal(config.command_args[0], "crawl");
  // the URL must be passed after a `--` end-of-flags sentinel so a
  // hostile URL cannot be parsed as a flag.
  const dashIdx = config.command_args.indexOf("--");
  const urlIdx = config.command_args.indexOf("{url}");
  assert.ok(dashIdx !== -1, "expected a `--` sentinel before the URL");
  assert.ok(urlIdx !== -1, "expected the {url} placeholder");
  assert.ok(urlIdx > dashIdx, "{url} must come after the `--` sentinel");
});

// Every {placeholder} used in command_args must resolve to a declared input.
function placeholdersIn(args) {
  const found = new Set();
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  for (const a of args) {
    let m;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
    while ((m = re.exec(a)) !== null) {
      found.add(m[1]);
    }
  }
  return found;
}

test("every command_args placeholder maps to an input_schema property", () => {
  const schema = config.input_schema;
  assert.equal(schema.type, "object");
  const props = schema.properties;
  assert.equal(typeof props, "object");

  const used = placeholdersIn(config.command_args);
  assert.deepEqual([...used].sort(), ["depth", "limit", "url"]);
  for (const name of used) {
    assert.ok(
      Object.hasOwn(props, name),
      `placeholder {${name}} has no matching input_schema property`
    );
  }
});

test("input_schema declares url/depth/limit with sane bounds", () => {
  const props = config.input_schema.properties;

  assert.equal(props.url.type, "string");

  assert.equal(props.depth.type, "integer");
  assert.equal(props.depth.minimum, 0);
  assert.equal(props.depth.maximum, 10);
  assert.ok(props.depth.default >= props.depth.minimum);
  assert.ok(props.depth.default <= props.depth.maximum);

  assert.equal(props.limit.type, "integer");
  assert.equal(props.limit.minimum, 1);
  assert.equal(props.limit.maximum, 500);
  assert.ok(props.limit.default >= props.limit.minimum);
  assert.ok(props.limit.default <= props.limit.maximum);

  assert.deepEqual(config.input_schema.required, ["url"]);
});

test("egress_url_arg references a real string input", () => {
  assert.equal(config.egress_url_arg, "url");
  assert.ok(Object.hasOwn(config.input_schema.properties, config.egress_url_arg));
  assert.equal(
    config.input_schema.properties[config.egress_url_arg].type,
    "string"
  );
});

test("permission_grants matches the declared command binary", () => {
  assert.ok(Array.isArray(manifest.permission_grants));
  assert.ok(manifest.permission_grants.includes(`tool:command:${config.bin}`));
});

test("manifest is byte-identical to the Core built-in fixture", () => {
  const fixture = readFileSync(fixturePath, "utf8");
  assert.equal(raw, fixture);
});
