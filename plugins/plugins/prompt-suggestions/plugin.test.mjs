import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

test("declares the host-owned prompt suggestions surface", () => {
	assert.equal(manifest.id, "@ryu/prompt-suggestions");
	assert.equal(
		manifest.contributes.settings_tabs[0].fields[0].pref_key,
		"chat-suggestions-enabled"
	);
	assert.equal(
		manifest.contributes.settings_tabs[0].fields[1].pref_key,
		"chat-suggestions-model"
	);
	assert.deepEqual(manifest.permission_grants, []);
	assert.deepEqual(manifest.contributes.turn_hooks ?? [], []);
});

test("does not run a duplicate side-model hook", () => {
	assert.deepEqual(manifest.runnables, []);
	assert.equal(manifest.contributes.turn_hooks, undefined);
	assert.equal(existsSync(join(here, "hooks", "turn.js")), false);
});
