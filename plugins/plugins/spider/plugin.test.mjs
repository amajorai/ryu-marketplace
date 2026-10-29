// Co-located test for the `spider` plugin manifest.
//
// Spider is a declarative `command`-tool plugin (no inline turn_hooks, no
// mcp_servers, no http tool, no secret_headers). It shells out to the locally
// installed `spider` CLI. There is therefore no embedded JS to execute; the
// these Node tests validate the authored command-tool contract:
// the runnable shape, the placeholder<->input_schema wiring, the egress arg,
// the timeout, and the permission grant. We also assert the manifest is
// registered from its package home. The bundled Core runtime stage separately
// proves canonical routing and the current fail-closed URL-child policy; these
// manifest checks alone do not prove a successful crawler invocation.
//
// Runner: `bun test`; uses the production manifest SDK.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
	EnginesReqSchema,
	PluginManifestSchema,
	RunnableMetaSchema,
} from "../../../packages/sdk/src/manifest.ts";

const identitySchema = z.object({
	id: PluginManifestSchema.shape.id,
	name: PluginManifestSchema.shape.name,
	version: PluginManifestSchema.shape.version,
});
const spiderInputPropertiesSchema = z.object({
	url: z.object({
		type: z.literal("string"),
		description: z.string().optional(),
	}),
	depth: z.object({
		type: z.literal("integer"),
		minimum: z.number(),
		maximum: z.number(),
		default: z.number(),
	}),
	limit: z.object({
		type: z.literal("integer"),
		minimum: z.number(),
		maximum: z.number(),
		default: z.number(),
	}),
});
const spiderCommandSchema = z.object({
	slug: z.string(),
	backend: z.literal("command"),
	bin: z.string(),
	output: z.literal("json"),
	timeout_secs: z.number(),
	description: z.string(),
	command_args: z.array(z.string()),
	egress_url_arg: z.string(),
	bin_version: z.object({
		args: z.array(z.string()),
		pattern: z.string(),
		requirement: z.string(),
		install_hint: z.string(),
	}),
	input_schema: z.object({
		type: z.literal("object"),
		required: z.array(z.string()),
		properties: spiderInputPropertiesSchema,
	}),
});

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "@ryu/spider");
	assert.doesNotThrow(() => identitySchema.shape.name.parse(manifest.name));
	assert.ok(manifest.name.length > 0);
	assert.doesNotThrow(() =>
		identitySchema.shape.version.parse(manifest.version)
	);
	// semver-ish
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(plugin.version, manifest.version);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
});

test("declares an engines.ryu constraint", () => {
	assert.doesNotThrow(() => EnginesReqSchema.parse(manifest.engines));
	assert.doesNotThrow(() =>
		EnginesReqSchema.shape.ryu.parse(manifest.engines.ryu)
	);
	assert.match(manifest.engines.ryu, /^>=/);
});

test("runnables is a non-empty array with the crawl tool", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 1);
	const r = manifest.runnables[0];
	assert.equal(r.kind, "tool");
	assert.equal(r.id, "tool-spider-crawl");
	assert.doesNotThrow(() => RunnableMetaSchema.shape.name.parse(r.name));
	assert.doesNotThrow(() => spiderCommandSchema.parse(r.config));
});

const config = manifest.runnables[0].config;

test("command-tool config is well-formed", () => {
	assert.equal(config.backend, "command");
	assert.equal(config.slug, "spider.crawl");
	assert.equal(config.bin, "spider");
	assert.equal(config.output, "json");
	// timeout must be a positive integer number of seconds
	assert.doesNotThrow(() =>
		spiderCommandSchema.shape.timeout_secs.parse(config.timeout_secs)
	);
	assert.ok(Number.isInteger(config.timeout_secs));
	assert.ok(config.timeout_secs > 0);
	assert.equal(config.timeout_secs, 120);
	assert.doesNotThrow(() =>
		spiderCommandSchema.shape.description.parse(config.description)
	);
	assert.ok(config.description.length > 0);
});

test("command_args is a string array beginning with the subcommand", () => {
	assert.ok(Array.isArray(config.command_args));
	for (const a of config.command_args) {
		assert.doesNotThrow(() =>
			spiderCommandSchema.shape.command_args.element.parse(a)
		);
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
		for (const match of a.matchAll(re)) {
			found.add(match[1]);
		}
	}
	return found;
}

test("every command_args placeholder maps to an input_schema property", () => {
	const schema = config.input_schema;
	assert.equal(schema.type, "object");
	const props = schema.properties;
	assert.doesNotThrow(() => spiderInputPropertiesSchema.parse(props));

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
	assert.ok(
		Object.hasOwn(config.input_schema.properties, config.egress_url_arg)
	);
	assert.equal(
		config.input_schema.properties[config.egress_url_arg].type,
		"string"
	);
});

test("permission_grants matches the declared command binary", () => {
	assert.ok(Array.isArray(manifest.permission_grants));
	assert.ok(manifest.permission_grants.includes(`tool:command:${config.bin}`));
});

test("canonical extract and crawl retain their distinct declared command mappings", () => {
	const extract = manifest.provides.find(
		(entry) => entry.capability === "web.extract"
	);
	const crawl = manifest.provides.find(
		(entry) => entry.capability === "web.crawl"
	);
	assert.deepEqual(extract.tools["web.extract"], {
		tool: "spider.crawl",
		args: { format: "" },
		arg_defaults: { depth: 0, limit: 1 },
	});
	assert.deepEqual(crawl.tools["web.crawl"], { tool: "spider.crawl" });
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
		"spider.manifest.json"
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
			'include_str!("../../../../plugins-store/plugins/spider/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});

test("README pins the spider_cli version the egress broker was verified against", () => {
	// Core's egress proxy only mediates a CLI that honours HTTP(S)_PROXY, verified for
	// spider_cli 2.53.9. The manifest's bin_version makes Core enforce that pin; the
	// README install instruction must match it, and an unpinned install must not return.
	const readme = readFileSync(join(here, "README.md"), "utf8");
	assert.ok(
		readme.includes("cargo install spider_cli --version 2.53.9 --locked"),
		"README must pin spider_cli to the verified 2.53.9 release"
	);
	const unpinned = readme
		.split("\n")
		.filter(
			(line) =>
				line.includes("cargo install spider_cli") && !line.includes("--version")
		);
	assert.deepEqual(unpinned, [], "unpinned spider_cli install instruction");
});

test("bin_version makes Core enforce the verified spider_cli release", () => {
	// spider_cli 2.53.9 is a clap derive CLI with no explicit name, so
	// `spider --version` prints the crate name: `spider_cli 2.53.9`.
	assert.deepEqual(config.bin_version, {
		args: ["--version"],
		pattern: "spider_cli {version}",
		requirement: "=2.53.9",
		install_hint: "cargo install spider_cli --version 2.53.9 --locked",
	});
	assert.equal(config.bin_version.pattern.split("{version}").length, 2);
	const readme = readFileSync(join(here, "README.md"), "utf8");
	assert.ok(readme.includes(config.bin_version.install_hint));
});
