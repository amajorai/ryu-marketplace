import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const sidecar = manifest.sidecars[0];
const runtime = sidecar.process;
const snapshot = runtime.model_snapshots[0];
const pyproject = readFileSync(join(here, "sidecar", "pyproject.toml"), "utf8");

test("manifest declares Needle as a local computer-use model provider", () => {
	assert.equal(manifest.id, "@ryu/needle3");
	assert.equal(manifest.license, "Apache-2.0");
	assert.deepEqual(manifest.contributes.computer_use_planners, [
		{
			id: "needle3.base",
			label: "Needle 3 · Base",
			model_id: "needle3",
			description:
				"Apache-2.0, 29–121M-parameter on-device tool-calling model.",
		},
	]);
	assert.equal(
		sidecar.http.routes.find((route) => route.path === "/computer-use")
			.permission,
		"needle3.predict"
	);
});

test("model weights are pinned and only the license and required archive are fetched", () => {
	assert.equal(snapshot.source, "hf:Cactus-Compute/needle3");
	assert.match(snapshot.revision, /^[0-9a-f]{40}$/);
	assert.deepEqual(snapshot.files, ["LICENSE", "needle3.cact"]);
	assert.equal(runtime.env.NEEDLE_TELEMETRY, "0");
	assert.equal(runtime.env.DO_NOT_TRACK, "1");
});

test("sidecar has the standard local runtime and auth boundaries", () => {
	assert.equal(sidecar.lazy, false);
	assert.equal(runtime.entry, "ryu_needle3");
	assert.equal(runtime.source.path, "sidecar");
	assert.equal(runtime.env.HF_TOKEN, undefined);
	assert.equal(runtime.env.HUGGINGFACE_HUB_TOKEN, undefined);
	assert.ok(!manifest.permission_grants.includes("runtime:external"));
	assert.ok(!manifest.permission_grants.includes("sidecar:process"));
	assert.ok(manifest.permission_grants.includes("tool:http-egress:127.0.0.1"));
	assert.ok(existsSync(join(here, "sidecar", "ryu_needle3", "server.py")));
	assert.ok(existsSync(join(here, "sidecar", "ryu_needle3", "__main__.py")));
	assert.ok(existsSync(join(here, "sidecar", "tests", "test_decision.py")));
});

test("the runtime package supports the host Python version range", () => {
	assert.match(pyproject, /requires-python = ">=3\.11,<3\.15"/);
	assert.match(pyproject, /cactus-needle==3\.0\.1/);
});

test("Core exposes this opt-in model plugin without pre-installing it", () => {
	const core = join(here, "..", "..", "..", "apps", "core", "src");
	const manifestSource = readFileSync(
		join(core, "plugin_manifest", "mod.rs"),
		"utf8"
	);
	const builtins = readFileSync(join(core, "plugins", "builtins.rs"), "utf8");
	assert.ok(
		manifestSource.includes(
			'include_str!("../../../../plugins-store/plugins/needle3/manifest.json")'
		)
	);
	assert.ok(builtins.includes('"@ryu/needle3"'));
	const preinstalledStart = builtins.indexOf("pub const CORE_PREINSTALLED");
	assert.ok(!builtins.slice(preinstalledStart).includes('"@ryu/needle3"'));
});
