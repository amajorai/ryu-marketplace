// Co-located contract test for the `firewall` plugin.
//
// Runner: `node --test` (zero dependencies).
//   $ node --test plugins-store/plugins/firewall/plugin.test.mjs
//
// firewall is a DECLARATIVE policy plugin: it has no turn_hooks, no
// mcp_servers, no http/command tool, and no UI. Its entire behavior is the
// manifest contract that Core reads to drive the GLOBAL gateway `firewall.enabled`
// flag. So the strongest honest test is a validation of that manifest against
// the exact invariants Core enforces:
//   - a single `policy` runnable whose config carries a non-empty `policy_type`
//     and a `definition` object (apps/core/src/plugin_manifest/schema.rs
//     `validate_runnable` for RunnableKind::Policy);
//   - policy_type === "firewall" and definition.service === "gateway" (the
//     dispatch key in apps/core/src/server/mod.rs `apply_policy`, which calls
//     set_firewall_enabled only for the gateway firewall policy);
//   - contributes.policies references the same runnable id (so the toggle the UI
//     shows maps to the runnable Core applies);
//   - it stays byte-identical to the built-in Core fixture (AGENTS.md rule).
//
// There is no imperative hook code to execute here, so this file is
// intentionally all contract/manifest assertions.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const RAW = readFileSync(MANIFEST_PATH, "utf8");

test("manifest.json is valid JSON and parses", () => {
	const manifest = JSON.parse(RAW);
	assert.equal(typeof manifest, "object");
	assert.notEqual(manifest, null);
});

const manifest = JSON.parse(RAW);

test("has required identity fields: id / name / version", () => {
	assert.equal(typeof manifest.id, "string");
	assert.ok(manifest.id.length > 0, "id must be non-empty");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0, "name must be non-empty");
	assert.equal(typeof manifest.version, "string");
	// semver-ish (major.minor.patch)
	assert.match(manifest.version, /^\d+\.\d+\.\d+/, "version must be semver");
});

test('id is exactly "firewall" (fixture registration key)', () => {
	assert.equal(manifest.id, "@ryu/firewall");
});

test("declares a Ryu engine constraint", () => {
	assert.equal(typeof manifest.engines, "object");
	assert.equal(typeof manifest.engines.ryu, "string");
	assert.ok(manifest.engines.ryu.length > 0);
});

test("has exactly one runnable and it is the firewall policy", () => {
	assert.ok(Array.isArray(manifest.runnables), "runnables must be an array");
	assert.equal(manifest.runnables.length, 1);

	const r = manifest.runnables[0];
	assert.equal(typeof r.id, "string");
	assert.ok(r.id.length > 0, "runnable id must be non-empty");
	assert.equal(r.kind, "policy", 'runnable kind must be "policy"');
});

test("policy runnable config satisfies Core validate_runnable rules", () => {
	const r = manifest.runnables[0];
	// Core: RunnableKind::Policy requires a `config` object.
	assert.equal(typeof r.config, "object");
	assert.notEqual(r.config, null);

	// Core: policy_type must be present and NON-EMPTY.
	assert.equal(typeof r.config.policy_type, "string");
	assert.ok(
		r.config.policy_type.trim().length > 0,
		"'policy_type' must not be empty"
	);

	// Core: a `definition` object accompanies the policy_type.
	assert.equal(typeof r.config.definition, "object");
	assert.notEqual(r.config.definition, null);
});

test("policy dispatches to the gateway firewall (apply_policy key)", () => {
	const r = manifest.runnables[0];
	// The two fields Core matches on to route this to set_firewall_enabled.
	assert.equal(r.config.policy_type, "firewall");
	assert.equal(r.config.definition.service, "gateway");
});

test("contributes.policies references the same runnable id", () => {
	assert.equal(typeof manifest.contributes, "object");
	assert.ok(Array.isArray(manifest.contributes.policies));
	assert.equal(manifest.contributes.policies.length, 1);

	const contributed = manifest.contributes.policies[0];
	const runnableId = manifest.runnables[0].id;
	assert.equal(
		contributed.id,
		runnableId,
		"contributed policy id must match the policy runnable id"
	);
	assert.equal(typeof contributed.title, "string");
	assert.ok(contributed.title.length > 0);
});

test("permission_grants is an empty array (declarative, no grants)", () => {
	assert.ok(Array.isArray(manifest.permission_grants));
	assert.equal(manifest.permission_grants.length, 0);
});

test("does NOT declare tool/server surfaces (pure policy plugin)", () => {
	// Guard the plugin shape: if any of these appear, the test suite above is
	// no longer sufficient and hook/tool assertions would be required.
	assert.equal(manifest.mcp_servers, undefined);
	assert.equal(manifest.turn_hooks, undefined);
	assert.equal(manifest.contributes.turn_hooks, undefined);
	assert.equal(manifest.contributes.tools, undefined);
	assert.equal(manifest.secret_headers, undefined);
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// There is no fixture COPY any more. Core `include_str!`s this manifest straight
	// from its package home, so a resurrected copy is a dead-edit trap: the fixture
	// would WIN for any include_str! still pointing at fixtures/, and edits made here
	// would silently go nowhere. Core asserts this across all packages; repeating it
	// per plugin is what makes a failure name the plugin that regressed.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"firewall.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	// Registration seam: forgetting the include_str! leaves every other guard passing
	// while the plugin simply does not exist at runtime. Compiled in via BUILTIN_MANIFESTS.
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/firewall/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
