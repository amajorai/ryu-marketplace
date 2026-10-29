import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const laya = JSON.parse(
	readFileSync(join(here, "..", "laya", "manifest.json"), "utf8")
);
const bySlug = new Map(
	manifest.runnables.map((runnable) => [runnable.config.slug, runnable])
);

test("Ollaya is a registered typed-decision provider", () => {
	assert.equal(manifest.id, "@ryu/ollaya");
	assert.equal(manifest.name, "Ollaya Decision Models");
	assert.equal(manifest.category, "Models");
	assert.equal(manifest.icon, "ai-brain-01");
	assert.equal(manifest.license, "Apache-2.0");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(plugin.name, "ryu.ollaya");
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.deepEqual(manifest.provides, [
		{
			capability: "decision.typed",
			version: "1.0.0",
			title: "Typed Decisions",
			selectable: true,
			layerKind: "decision-model",
			tools: {
				"decision.predict": { tool: "ollaya.predict" },
			},
		},
	]);

	const layaProvider = laya.provides.find(
		(provider) => provider.capability === "decision.typed"
	);
	assert.equal(layaProvider.layerKind, "decision-model");
	assert.equal(layaProvider.selectable, true);
	assert.equal(layaProvider.default, true);
	assert.equal(layaProvider.tools["decision.predict"].tool, "laya.predict");
});

test("prediction uses the TypeSafe-compatible local systemone endpoint", () => {
	const predict = bySlug.get("ollaya.predict");
	assert.ok(predict);
	assert.equal(predict.kind, "tool");
	assert.equal(predict.config.backend, "http");
	assert.equal(predict.config.method, "POST");
	assert.equal(predict.config.url, "http://127.0.0.1:11435/v1/systemone");
	assert.equal(predict.config.fail_open, false);
	assert.equal(predict.config.unwrap_body, true);
	assert.deepEqual(predict.config.body_defaults, { model: "laya" });
	assert.equal(predict.config.secret_headers, undefined);
	assert.deepEqual(predict.config.input_schema.required, [
		"state",
		"questions",
	]);
	assert.ok(predict.config.input_schema.properties.model);
	assert.ok(predict.config.input_schema.properties.questions);
	assert.ok(predict.config.input_schema.properties.state);
	assert.equal(predict.config.input_schema.properties.task, undefined);
	assert.equal(predict.config.input_schema.properties.lang, undefined);
});

test("model discovery uses a keyless local Ollaya service", () => {
	const models = bySlug.get("ollaya.models");
	assert.ok(models);
	assert.equal(models.config.method, "GET");
	assert.equal(models.config.url, "http://127.0.0.1:11435/v1/models");
	assert.equal(models.config.fail_open, false);
	assert.deepEqual(manifest.permission_grants, ["tool:http-egress:127.0.0.1"]);
	assert.equal(models.config.secret_headers, undefined);
	assert.equal(manifest.contributes, undefined);
});

test("declares the complete permission and runnable boundary", () => {
	assert.deepEqual([...bySlug.keys()].sort(), [
		"ollaya.models",
		"ollaya.predict",
	]);
	assert.deepEqual(manifest.permission_levels, [
		{
			id: "ollaya.view",
			label: "Can view local model availability",
			description:
				"List decision models that Ollaya has available on this node.",
		},
		{
			id: "ollaya.run",
			label: "Can run local decisions",
			description:
				"Send bounded state and typed questions to the local Ollaya service.",
			implies: ["ollaya.view"],
		},
	]);
	for (const runnable of manifest.runnables) {
		assert.equal(
			runnable.config.url.startsWith("http://127.0.0.1:11435/"),
			true
		);
		assert.equal(runnable.config.fail_open, false);
		assert.equal(runnable.config.unwrap_body, true);
		assert.equal(runnable.config.secret_headers, undefined);
	}
	assert.equal(manifest.mcp_servers, undefined);
	assert.equal(manifest.sidecar, undefined);
});

test("Core knows Ollaya as a first-party optional provider", () => {
	const core = join(here, "..", "..", "..", "apps", "core", "src");
	const manifestSource = readFileSync(
		join(core, "plugin_manifest", "mod.rs"),
		"utf8"
	);
	assert.ok(
		manifestSource.includes(
			'include_str!("../../../../plugins-store/plugins/ollaya/manifest.json")'
		)
	);
	const builtins = readFileSync(join(core, "plugins", "builtins.rs"), "utf8");
	assert.ok(builtins.includes('"@ryu/ollaya"'));
	const preinstalledStart = builtins.indexOf("pub const CORE_PREINSTALLED");
	assert.notEqual(preinstalledStart, -1);
	assert.ok(!builtins.slice(preinstalledStart).includes('"@ryu/ollaya"'));
});
