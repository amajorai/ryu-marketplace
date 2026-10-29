// Co-located unit test for the `headroom` plugin manifest.
//
// Runner: `bun test`; uses the production manifest SDK.
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

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
	PluginManifestSchema,
	RunnableMetaSchema,
} from "../../../packages/sdk/src/manifest.ts";

// Core policy entries have their own native kind/config contract; the SDK's
// authoring runnable enum intentionally does not include `policy`.
const identitySchema = z.object({
	id: PluginManifestSchema.shape.id,
	name: PluginManifestSchema.shape.name,
	version: PluginManifestSchema.shape.version,
});
const compressionDefinitionSchema = z.object({
	service: z.string(),
	url: z.string(),
	timeout_ms: z.number(),
	min_messages: z.number(),
});
const compressionPolicySchema = z.object({
	policy_type: z.string(),
	definition: compressionDefinitionSchema,
});
const localProcessSchema = z.object({
	kind: z.literal("local"),
	command: z.string(),
	command_env: z.string(),
	args: z.array(z.string()),
});
const compressionSidecarSchema = z.object({
	name: z.string(),
	process: localProcessSchema,
	health_path: z.string(),
	port: z.number(),
});
const headroomManifestSchema = identitySchema.extend({
	runnables: z.array(
		z.object({
			id: RunnableMetaSchema.shape.id,
			name: RunnableMetaSchema.shape.name,
			kind: z.literal("policy"),
			config: compressionPolicySchema,
		})
	),
	sidecars: z.array(compressionSidecarSchema),
	permission_grants: z.array(z.string()),
});

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
// plugins-store/plugins/headroom -> repo root -> Core fixture.
const RAW = readFileSync(MANIFEST_PATH, "utf8");

test("manifest.json is valid, parseable JSON", () => {
	assert.doesNotThrow(() => JSON.parse(RAW));
	const m = JSON.parse(RAW);
	assert.doesNotThrow(() => headroomManifestSchema.parse(m));
	assert.ok(m !== null && !Array.isArray(m), "manifest is a JSON object");
});

test("manifest carries required identity fields", () => {
	const m = JSON.parse(RAW);
	assert.equal(m.id, "@ryu/headroom");
	assert.doesNotThrow(() => identitySchema.shape.name.parse(m.name));
	assert.ok(m.name.length > 0, "name is non-empty");
	// Version must be a non-empty semver-ish string (Core rejects empty version).
	assert.doesNotThrow(() => identitySchema.shape.version.parse(m.version));
	assert.match(m.version, /^\d+\.\d+\.\d+$/, "version is semver");
});

test("Agent Plugins projection stays synchronized with the native manifest", () => {
	const manifest = JSON.parse(RAW);
	const projection = JSON.parse(
		readFileSync(join(HERE, "plugin.json"), "utf8")
	);
	assert.equal(projection.name, "ryu.headroom");
	assert.equal(projection.version, manifest.version);
	assert.equal(projection.description, manifest.description);
	assert.deepEqual(projection.author, manifest.author);
	assert.equal(projection.repository, manifest.repository);
	assert.equal(projection.homepage, manifest.homepage);
	assert.deepEqual(projection.keywords, manifest.keywords);
	assert.deepEqual(projection.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
});

test("manifest declares no hook/mcp/tool/secret surfaces (policy+sidecar shape)", () => {
	const m = JSON.parse(RAW);
	// Guard the classification this test rests on: if any of these appear in a
	// future revision, this suite must grow an inline-hook / tool section.
	assert.equal(m.contributes, undefined, "no contributes block");
	assert.equal(m.mcp_servers, undefined, "no mcp_servers");
	assert.equal(m.secret_headers, undefined, "no secret_headers");
	assert.deepEqual(m.permission_grants, [], "permission_grants is empty");
});

test("policy runnable is well-formed (compression, non-empty policy_type)", () => {
	const m = JSON.parse(RAW);
	assert.ok(Array.isArray(m.runnables), "runnables is an array");
	assert.equal(m.runnables.length, 1);

	const r = m.runnables[0];
	assert.equal(r.id, "policy-headroom-compression");
	assert.doesNotThrow(() => RunnableMetaSchema.shape.name.parse(r.name));
	assert.ok(r.name.length > 0);
	assert.equal(r.kind, "policy");

	const cfg = r.config;
	assert.doesNotThrow(
		() => compressionPolicySchema.parse(cfg),
		"config object present"
	);
	// Core: `policy_type` must not be empty.
	assert.doesNotThrow(() =>
		compressionPolicySchema.shape.policy_type.parse(cfg.policy_type)
	);
	assert.ok(cfg.policy_type.length > 0, "policy_type non-empty");
	assert.equal(cfg.policy_type, "compression");

	const def = cfg.definition;
	assert.doesNotThrow(
		() => compressionDefinitionSchema.parse(def),
		"definition object present"
	);
	assert.equal(def.service, "headroom");
	assert.doesNotThrow(() =>
		compressionDefinitionSchema.shape.url.parse(def.url)
	);
	assert.match(def.url, /^http:\/\/127\.0\.0\.1:\d+$/, "url is loopback http");
	assert.doesNotThrow(() =>
		compressionDefinitionSchema.shape.timeout_ms.parse(def.timeout_ms)
	);
	assert.ok(def.timeout_ms > 0, "timeout_ms positive");
	assert.doesNotThrow(() =>
		compressionDefinitionSchema.shape.min_messages.parse(def.min_messages)
	);
	assert.ok(
		Number.isInteger(def.min_messages) && def.min_messages >= 0,
		"min_messages is a non-negative integer"
	);
});

test("sidecar is well-formed (local command, leading-slash health_path)", () => {
	const m = JSON.parse(RAW);
	assert.ok(Array.isArray(m.sidecars), "sidecars is an array");
	assert.equal(m.sidecars.length, 1);

	const s = m.sidecars[0];
	assert.equal(s.name, "headroom");

	const p = s.process;
	assert.doesNotThrow(
		() => localProcessSchema.parse(p),
		"process object present"
	);
	assert.equal(p.kind, "local");
	// Core: local 'command' must not be empty.
	assert.doesNotThrow(() => localProcessSchema.shape.command.parse(p.command));
	assert.ok(p.command.length > 0, "command non-empty");
	assert.equal(p.command, "headroom");
	// Per AGENTS.md: the binary is overridable via an injected env var.
	assert.equal(p.command_env, "RYU_HEADROOM_BIN");
	assert.ok(Array.isArray(p.args), "args is an array");

	// Core: health_path must start with '/'.
	assert.doesNotThrow(() =>
		compressionSidecarSchema.shape.health_path.parse(s.health_path)
	);
	assert.ok(s.health_path.startsWith("/"), "health_path starts with '/'");
	assert.equal(s.health_path, "/health");

	// Port must be a valid TCP port.
	assert.doesNotThrow(() => compressionSidecarSchema.shape.port.parse(s.port));
	assert.ok(
		Number.isInteger(s.port) && s.port > 0 && s.port < 65_536,
		"port in valid range"
	);
});

test("port is consistent across sidecar.port, sidecar args, and policy url", () => {
	const m = JSON.parse(RAW);
	const sidecar = m.sidecars[0];
	const port = sidecar.port;

	// args carry `--port <port>`.
	const args = sidecar.process.args;
	const portFlagIdx = args.indexOf("--port");
	assert.ok(portFlagIdx >= 0, "args include --port");
	assert.equal(
		String(args[portFlagIdx + 1]),
		String(port),
		"args port matches"
	);

	// args carry `--host 127.0.0.1`.
	const hostFlagIdx = args.indexOf("--host");
	assert.ok(hostFlagIdx >= 0, "args include --host");
	assert.equal(args[hostFlagIdx + 1], "127.0.0.1", "args host is loopback");

	// The policy definition URL must target the same loopback port the sidecar
	// binds — otherwise the Gateway policy hits a dead port.
	const url = m.runnables[0].config.definition.url;
	const urlPort = Number(new URL(url).port);
	assert.equal(urlPort, port, "policy url port matches sidecar port");
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
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
		"headroom.manifest.json"
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
			'include_str!("../../../../plugins-store/plugins/headroom/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
