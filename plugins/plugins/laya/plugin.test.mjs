import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const marketplacePlugin = JSON.parse(
	readFileSync(join(here, "plugin.json"), "utf8")
);
const bySlug = new Map(
	manifest.runnables.map((runnable) => [runnable.config.slug, runnable])
);
const sidecar = manifest.sidecars[0];
const runtime = sidecar.process;
const snapshot = runtime.model_snapshots[0];
const pyproject = readFileSync(join(here, "sidecar", "pyproject.toml"), "utf8");

test("manifest is parseable and identifies the Laya model package", () => {
	assert.equal(manifest.id, "@ryu/laya");
	assert.equal(manifest.name, "Laya Local Decisions");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.match(
		manifest.repository,
		/huggingface\.co\/convaiinnovations\/laya$/
	);
	assert.match(manifest.license, /Apache-2\.0/i);
});

test("both Store descriptions disclose the complete checkpoint disk requirement", () => {
	assert.match(manifest.description, /2\.37 GB \/ 2\.21 GiB/);
	assert.match(marketplacePlugin.description, /2\.37 GB \/ 2\.21 GiB/);
});

test("tools use Core's authenticated ext-proxy and expose explicit model choices", () => {
	assert.ok(bySlug.has("laya.predict"));
	assert.ok(bySlug.has("laya.status"));
	const predict = bySlug.get("laya.predict").config;
	assert.equal(predict.backend, "http");
	assert.equal(predict.method, "POST");
	assert.equal(predict.url, "core:/api/ext/@ryu/laya/predict");
	assert.deepEqual(predict.secret_headers, {
		Authorization: "Bearer env:RYU_TOKEN",
	});
	assert.equal(predict.unwrap_body, true);
	assert.equal(predict.fail_open, true);
	assert.deepEqual(predict.input_schema.properties.model.enum, [
		"router",
		"english",
		"multilingual",
		"typed-decisions",
	]);
	assert.deepEqual(predict.input_schema.required, ["state", "questions"]);

	const status = bySlug.get("laya.status").config;
	assert.equal(status.method, "GET");
	assert.equal(status.url, "core:/api/ext/@ryu/laya/capability");
});

test("sidecar is a private Python runtime with a package-owned source tree", () => {
	assert.equal(sidecar.name, "laya");
	assert.equal(runtime.kind, "python");
	assert.equal(runtime.entry, "ryu_laya");
	assert.equal(runtime.pyproject_extra, "server");
	assert.equal(runtime.source.format, "directory");
	assert.equal(runtime.source.path, "sidecar");
	assert.equal(runtime.source.url, "");
	assert.equal(runtime.port_env, "RYU_LAYA_PORT");
	assert.equal(runtime.env.HF_TOKEN, undefined);
	assert.equal(runtime.env.HUGGINGFACE_HUB_TOKEN, undefined);
	assert.equal(sidecar.port, 8098);
	assert.equal(sidecar.lazy, false);
	assert.equal(sidecar.idle_stop_secs, 1800);
	assert.ok(existsSync(join(here, "sidecar", "pyproject.toml")));
	assert.ok(existsSync(join(here, "sidecar", "ryu_laya", "server.py")));
});

test("Laya pins a published Python 3.14-compatible Router release", () => {
	assert.match(pyproject, /server = \["laya==0\.3\.20"\]/);
	assert.match(pyproject, /requires-python = ">=3\.10"/);
});

test("model bundle is pinned, explicit, and complete for all three checkpoints", () => {
	assert.equal(snapshot.source, "hf:convaiinnovations/laya");
	assert.match(snapshot.revision, /^[0-9a-f]{40}$/);
	assert.equal(snapshot.dest_under_runtime, "models/laya");
	assert.equal(snapshot.files.length, 15);
	assert.equal(new Set(snapshot.files).size, snapshot.files.length);
	for (const path of snapshot.files) {
		assert.ok(!path.startsWith("/"));
		assert.ok(!path.includes(".."));
		assert.ok(!path.includes("\\"));
		assert.match(
			path,
			/(?:model\.safetensors|config\.json|rl_agent_config\.json|tokenizer\.json|tokenizer_config\.json)$/
		);
	}
	for (const prefix of ["", "multilingual/", "typed-decisions/"]) {
		assert.ok(snapshot.files.includes(`${prefix}model.safetensors`));
		assert.ok(snapshot.files.includes(`${prefix}rl_agent_config.json`));
		assert.ok(snapshot.files.includes(`${prefix}tokenizer/tokenizer.json`));
	}
});

test("sidecar routes and permissions keep inference behind the app boundary", () => {
	const routes = new Map(
		sidecar.http.routes.map((route) => [route.path, route])
	);
	assert.ok(routes.has("/health"));
	assert.ok(routes.has("/capability"));
	assert.ok(routes.has("/models"));
	assert.ok(routes.has("/openapi.json"));
	assert.equal(routes.get("/predict").method, "POST");
	assert.equal(routes.get("/predict").permission, "laya.predict");
	assert.equal(routes.get("/computer-use").method, "POST");
	assert.equal(routes.get("/computer-use").permission, "laya.predict");
	assert.ok(!manifest.permission_grants.includes("sidecar:process"));
	assert.ok(!manifest.permission_grants.includes("runtime:external"));
	assert.ok(manifest.permission_grants.includes("tool:http-egress:127.0.0.1"));
	for (const route of sidecar.http.routes) {
		assert.notEqual(route.auth, "public", `${route.path} must not be public`);
	}
});

test("Shadow discovers Laya profiles from the declarative local model catalog", () => {
	assert.deepEqual(
		manifest.contributes.computer_use_planners.map(
			(planner) => planner.model_id
		),
		["router", "english", "multilingual", "typed-decisions"]
	);
});

test("manifest is registered as a Core-tier package without being pre-installed", () => {
	const coreSrc = join(here, "..", "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return;
	}
	const manifestSource = readFileSync(
		join(coreSrc, "plugin_manifest", "mod.rs"),
		"utf8"
	);
	assert.ok(
		manifestSource.includes(
			'include_str!("../../../../plugins-store/plugins/laya/manifest.json")'
		),
		"Core must compile the Laya manifest from its package home"
	);
	const builtins = readFileSync(
		join(coreSrc, "plugins", "builtins.rs"),
		"utf8"
	);
	const corePluginsStart = builtins.indexOf("pub const CORE_PLUGINS");
	const preinstalledStart = builtins.indexOf("pub const CORE_PREINSTALLED");
	const corePlugins = builtins.slice(corePluginsStart, preinstalledStart);
	assert.ok(corePlugins.includes('"@ryu/laya"'));
	const preinstalled = builtins.slice(preinstalledStart);
	assert.ok(!preinstalled.includes('"@ryu/laya"'));
});
