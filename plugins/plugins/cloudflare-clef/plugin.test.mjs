import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const predict = manifest.runnables.find(
	(runnable) => runnable.config.slug === "cloudflare-clef.predict"
);

test("Cloudflare Clef is an opt-in Decision Models provider", () => {
	assert.equal(manifest.id, "@ryu/cloudflare-clef");
	assert.equal(manifest.category, "Models");
	assert.equal(manifest.provides[0].capability, "decision.typed");
	assert.equal(manifest.provides[0].layerKind, "decision-model");
	assert.equal(
		manifest.provides[0].tools["decision.predict"].tool,
		"cloudflare-clef.predict"
	);
	assert.equal(
		manifest.provides[0].tools["decision.predict_multimodal"].tool,
		"cloudflare-clef.predict"
	);
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.ok(
		!manifest.contributes.settings_tabs[0].fields.some((field) => field.default)
	);
	assert.ok(
		manifest.contributes.settings_tabs[0].fields.some(
			(field) =>
				field.pref_key === "RYU_CLOUDFLARE_API_TOKEN" && field.type === "secret"
		)
	);
	assert.ok(!manifest.permission_grants.includes("tool:http-egress:*"));
});

test("Clef and Clef Flash share the typed request and are sent through Core's sidecar route", () => {
	assert.ok(predict);
	assert.equal(
		predict.config.url,
		"core:/api/ext/@ryu/cloudflare-clef/predict"
	);
	assert.deepEqual(predict.config.secret_headers, {
		Authorization: "Bearer env:RYU_TOKEN",
	});
	assert.equal(predict.config.fail_open, false);
	assert.deepEqual(predict.config.body_defaults, { model: "clef" });
	assert.deepEqual(predict.config.input_schema.properties.model.enum, [
		"clef",
		"clef-flash",
	]);
	assert.equal(predict.config.input_schema.properties.images.maxItems, 4);
	assert.equal(
		manifest.sidecars[0].process.env.RYU_CLOUDFLARE_ACCOUNT_ID,
		"env:RYU_CLOUDFLARE_ACCOUNT_ID"
	);
	assert.equal(
		manifest.sidecars[0].process.env.RYU_CLOUDFLARE_API_TOKEN,
		"env:RYU_CLOUDFLARE_API_TOKEN"
	);
	assert.ok(
		manifest.permission_grants.includes("tool:http-egress:api.cloudflare.com")
	);
	assert.ok(manifest.permission_grants.includes("tool:http-egress:127.0.0.1"));
	assert.ok(
		manifest.sidecars[0].http.routes.some((route) => route.path === "/predict")
	);
});

test("Core compiles the provider as an opt-in first-party plugin", () => {
	const root = join(here, "..", "..", "..", "apps", "core", "src");
	const manifestSource = readFileSync(
		join(root, "plugin_manifest", "mod.rs"),
		"utf8"
	);
	assert.ok(
		manifestSource.includes(
			'include_str!("../../../../plugins-store/plugins/cloudflare-clef/manifest.json")'
		)
	);
	const builtins = readFileSync(join(root, "plugins", "builtins.rs"), "utf8");
	assert.ok(builtins.includes('"@ryu/cloudflare-clef"'));
	const preinstalledStart = builtins.indexOf("pub const CORE_PREINSTALLED");
	assert.notEqual(preinstalledStart, -1);
	assert.ok(
		!builtins.slice(preinstalledStart).includes('"@ryu/cloudflare-clef"')
	);
});

test("sidecar validates typed multimodal input and normalizes fixture responses", () => {
	const result = spawnSync(
		process.env.PYTHON?.trim() || "python3",
		["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"],
		{
			cwd: join(here, "sidecar"),
			encoding: "utf8",
			timeout: 10_000,
		}
	);
	assert.equal(result.error, undefined, result.error?.message);
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	assert.match(`${result.stdout}\n${result.stderr}`, /Ran 12 tests/);
});
