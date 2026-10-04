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

test("manifest contributes FunctionGemma through the normalized local planner contract", () => {
	assert.equal(manifest.id, "@ryu/functiongemma");
	assert.equal(
		manifest.repository,
		"https://huggingface.co/google/functiongemma-270m-it"
	);
	assert.equal(
		manifest.contributes.computer_use_planners[0].model_id,
		"google/functiongemma-270m-it"
	);
	assert.equal(
		manifest.contributes.computer_use_planners[0].id,
		"functiongemma.base"
	);
	assert.equal(
		sidecar.http.routes.find((route) => route.path === "/computer-use")
			.permission,
		"functiongemma.predict"
	);
});

test("gated FunctionGemma snapshot is pinned and allowlists only runtime files", () => {
	assert.equal(snapshot.source, "hf:google/functiongemma-270m-it");
	assert.equal(snapshot.revision, "f54f8715e2b205f72c350f6efa748fd29fa19d98");
	assert.deepEqual(snapshot.files, [
		"added_tokens.json",
		"chat_template.jinja",
		"config.json",
		"generation_config.json",
		"model.safetensors",
		"special_tokens_map.json",
		"tokenizer.json",
		"tokenizer.model",
		"tokenizer_config.json",
	]);
	assert.ok(!snapshot.files.includes("tiny_garden.litertlm"));
	assert.equal(runtime.env.HF_HUB_OFFLINE, "1");
});

test("sidecar keeps inference local and has contract/parser tests", () => {
	assert.equal(sidecar.lazy, false);
	assert.equal(runtime.entry, "ryu_functiongemma");
	assert.equal(runtime.source.path, "sidecar");
	assert.equal(runtime.env.HF_TOKEN, undefined);
	assert.equal(runtime.env.HUGGINGFACE_HUB_TOKEN, undefined);
	assert.ok(!manifest.permission_grants.includes("runtime:external"));
	assert.ok(!manifest.permission_grants.includes("sidecar:process"));
	assert.ok(manifest.permission_grants.includes("tool:http-egress:127.0.0.1"));
	assert.ok(
		existsSync(join(here, "sidecar", "ryu_functiongemma", "server.py"))
	);
	assert.ok(
		existsSync(join(here, "sidecar", "ryu_functiongemma", "__main__.py"))
	);
	assert.ok(existsSync(join(here, "sidecar", "tests", "test_decision.py")));
});

test("the pinned inference stack installs on Ryu's Python 3.14 host", () => {
	assert.match(pyproject, /requires-python = ">=3\.11,<3\.15"/);
	assert.match(pyproject, /"torch==2\.10\.0"/);
	assert.match(pyproject, /"transformers==4\.57\.1"/);
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
			'include_str!("../../../../plugins-store/plugins/functiongemma/manifest.json")'
		)
	);
	assert.ok(builtins.includes('"@ryu/functiongemma"'));
	const preinstalledStart = builtins.indexOf("pub const CORE_PREINSTALLED");
	assert.ok(
		!builtins.slice(preinstalledStart).includes('"@ryu/functiongemma"')
	);
});
