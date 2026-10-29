import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const pluginJson = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));

test("declares the host-owned composer predictions surface", () => {
	assert.equal(manifest.id, "@ryu/composer-predictions");
	assert.equal(pluginJson.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(pluginJson.version, manifest.version);
	const [toggle, model] = manifest.contributes.settings_tabs[0].fields;
	assert.equal(toggle.pref_key, "composer-predictions-enabled");
	assert.equal(toggle.type, "toggle");
	assert.equal(toggle.default, true);
	assert.equal(model.pref_key, "composer-predictions-model");
	assert.equal(model.type, "model_picker");
	assert.deepEqual(manifest.permission_grants, []);
});

test("does not run its own side-model hook", () => {
	assert.deepEqual(manifest.runnables, []);
	assert.equal(manifest.contributes.turn_hooks, undefined);
	assert.equal(existsSync(join(here, "hooks")), false);
});
