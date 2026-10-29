// Co-located contract test for the `sample` (Research Assistant) plugin.
// Runner: `bun test` or `node --test`; uses the production manifest SDK.
//
// `sample` is a purely declarative manifest plugin: no `sidecar`, no Core Rust,
// no `mcp_servers`, no inline `turn_hooks[].code` strings, and no `http`/`command`
// tool proxy. It contributes four `runnables` (agent / workflow / tool / skill),
// a `permission_grants` allowlist, and a desktop `companion`. There is therefore
// no executable hook logic to run; this test validates the manifest contract,
// the internal coherence between runnables and grants, and the byte-identical
// Core fixture registration seam. See notes in the task report.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
	CompanionSurfaceSchema,
	PluginManifestSchema,
	RunnableMetaSchema,
} from "../../../packages/sdk/src/manifest.ts";

// The SDK owns runnable metadata; Core's native per-kind fields are concrete
// for this reference package, rather than the SDK's opaque authoring config.
const agentConfigSchema = z.object({
	system_prompt: z.string(),
	model: z.string(),
	tools: z.array(z.string()),
});
const workflowConfigSchema = z.object({ entry: z.string() });
const toolConfigSchema = z.object({ slug: z.string() });
const skillConfigSchema = z.object({ skill_id: z.string() });

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");

const manifest = JSON.parse(raw);

test("the complete reference package survives the production SDK boundary", () => {
	const parsed = PluginManifestSchema.parse(manifest);

	assert.equal(parsed.id, manifest.id);
	assert.deepEqual(parsed.runnables, manifest.runnables);
	assert.deepEqual(parsed.permission_grants, manifest.permission_grants);
	assert.deepEqual(parsed.companion, manifest.companion);
});

test("the SDK refuses malformed runnable identities before host registration", () => {
	const candidate = structuredClone(manifest);
	candidate.runnables[0].id = "";
	assert.throws(() => PluginManifestSchema.parse(candidate));
});

test("Ryu's Marketplace extension metadata projects this reference manifest", () => {
	const extension = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
	assert.equal(extension.name, "example.research-assistant");
	assert.equal(extension.version, manifest.version);
	assert.equal(extension.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(
		extension.extensions["com.ryuhq.ryu"].displayName,
		manifest.name
	);
});

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "@example/research-assistant");
	assert.doesNotThrow(() => RunnableMetaSchema.shape.name.parse(manifest.name));
	assert.ok(manifest.name.length > 0);
	assert.equal(manifest.name, "Research Assistant");
	// semantic version string
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("declares a runnables array with four entries", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 4);
	for (const r of manifest.runnables) {
		assert.doesNotThrow(() => RunnableMetaSchema.shape.id.parse(r.id));
		assert.ok(r.id.length > 0, "runnable id must be non-empty");
		assert.doesNotThrow(() => RunnableMetaSchema.shape.name.parse(r.name));
		assert.ok(r.name.length > 0, "runnable name must be non-empty");
		assert.doesNotThrow(() => RunnableMetaSchema.shape.kind.parse(r.kind));
		assert.doesNotThrow(() =>
			RunnableMetaSchema.shape.config.unwrap().parse(r.config)
		);
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
	assert.doesNotThrow(() =>
		agentConfigSchema.shape.system_prompt.parse(a.config.system_prompt)
	);
	assert.ok(a.config.system_prompt.length > 0);
	assert.doesNotThrow(() =>
		agentConfigSchema.shape.model.parse(a.config.model)
	);
	assert.ok(a.config.model.length > 0);
	assert.ok(Array.isArray(a.config.tools));
	assert.ok(a.config.tools.includes("web_search"));
});

test("workflow runnable declares an entry step", () => {
	const w = byKind.get("workflow");
	assert.equal(w.id, "wf-summarise");
	assert.doesNotThrow(() =>
		workflowConfigSchema.shape.entry.parse(w.config.entry)
	);
	assert.ok(w.config.entry.length > 0);
});

test("tool runnable declares a slug", () => {
	const t = byKind.get("tool");
	assert.equal(t.id, "tool-web-search");
	assert.doesNotThrow(() => toolConfigSchema.shape.slug.parse(t.config.slug));
	assert.equal(t.config.slug, "web_search");
});

test("skill runnable declares a skill_id", () => {
	const s = byKind.get("skill");
	assert.equal(s.id, "skill-research");
	assert.doesNotThrow(() =>
		skillConfigSchema.shape.skill_id.parse(s.config.skill_id)
	);
	assert.ok(s.config.skill_id.length > 0);
});

test("agent tools reference a tool actually contributed by the plugin", () => {
	const agent = byKind.get("agent");
	const declaredSlugs = new Set(
		manifest.runnables
			.filter((r) => r.kind === "tool")
			.map((r) => r.config.slug)
	);
	for (const slug of agent.config.tools) {
		assert.ok(
			declaredSlugs.has(slug),
			`agent references ${slug} without a contributed tool`
		);
	}
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
	assert.doesNotThrow(() => CompanionSurfaceSchema.parse(c));
	assert.notEqual(c, null);
	assert.doesNotThrow(() => CompanionSurfaceSchema.shape.label.parse(c.label));
	assert.ok(c.label.length > 0);
	assert.doesNotThrow(() =>
		CompanionSurfaceSchema.shape.icon.unwrap().parse(c.icon)
	);
	assert.ok(c.icon.length > 0);
	// shortcut is a modifier+key chord
	assert.doesNotThrow(() =>
		CompanionSurfaceSchema.shape.shortcut.unwrap().parse(c.shortcut)
	);
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

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(here, "..", "..", "..", "apps", "core", "src");
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
		"sample.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	// The test const lives in the plugin_manifest test module (tests.rs), so read
	// both the module and its sibling test file.
	const mod =
		readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8") +
		readFileSync(join(coreSrc, "plugin_manifest", "tests.rs"), "utf8");
	// Registration seam: forgetting the include_str! leaves every other guard passing
	// while the plugin simply does not exist at runtime. Compiled in via a test const, not BUILTIN_MANIFESTS — it is a template to fork, not a shipped built-in.
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/sample/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});
