import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const bySlug = new Map(
	manifest.runnables.map((runnable) => [runnable.config.slug, runnable])
);

test("Kev is an opt-in System One decision provider", () => {
	assert.equal(manifest.id, "@ryu/kev");
	assert.equal(manifest.category, "Models");
	assert.equal(manifest.provides[0].capability, "decision.typed");
	assert.equal(manifest.provides[0].layerKind, "decision-model");
	assert.equal(
		manifest.provides[0].tools["decision.predict"].tool,
		"kev.predict"
	);
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.deepEqual(manifest.permission_grants, ["tool:http-egress:127.0.0.1"]);
	assert.equal(manifest.sidecars, undefined);
	assert.equal(manifest.contributes, undefined);
});

test("Kev tools use its documented local System One API", () => {
	const predict = bySlug.get("kev.predict");
	const models = bySlug.get("kev.models");
	assert.ok(predict);
	assert.ok(models);
	assert.equal(predict.config.secret_headers, undefined);
	assert.equal(models.config.secret_headers, undefined);
	assert.equal(predict.config.url, "http://127.0.0.1:8009/v1/systemone");
	assert.equal(predict.config.method, "POST");
	assert.equal(predict.config.fail_open, false);
	assert.deepEqual(predict.config.body_defaults, { model: "kev-latest" });
	assert.equal(models.config.url, "http://127.0.0.1:8009/v1/models");
	assert.equal(models.config.method, "GET");
});

test("Core knows Kev as an optional first-party provider", () => {
	const root = join(here, "..", "..", "..", "apps", "core", "src");
	const manifestSource = readFileSync(
		join(root, "plugin_manifest", "mod.rs"),
		"utf8"
	);
	assert.ok(
		manifestSource.includes(
			'include_str!("../../../../plugins-store/plugins/kev/manifest.json")'
		)
	);
	const builtins = readFileSync(join(root, "plugins", "builtins.rs"), "utf8");
	assert.ok(builtins.includes('"@ryu/kev"'));
	const preinstalledStart = builtins.indexOf("pub const CORE_PREINSTALLED");
	assert.notEqual(preinstalledStart, -1);
	assert.ok(!builtins.slice(preinstalledStart).includes('"@ryu/kev"'));
});
