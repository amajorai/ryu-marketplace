import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const hook = manifest.contributes.turn_hooks[0];

test("declares a bounded, opt-in observer hook", () => {
	assert.equal(manifest.id, "@ryu/observer-agents");
	assert.deepEqual(manifest.permission_grants, ["hook:side-model"]);
	assert.equal(hook.on, "post_assistant_turn");
	assert.equal(hook.match.flag, "io.ryu.observer-agents");
	assert.equal(hook.code_file, "hooks/review.js");
	assert.ok(existsSync(join(HERE, hook.code_file)));
});

test("keeps observer instructions and digest caps in the hook body", () => {
	const source = readFileSync(join(HERE, hook.code_file), "utf8");
	assert.match(source, /read-only digest/);
	assert.match(source, /MAX_ENTRY_CHARS = 2000/);
	assert.match(source, /MAX_DIGEST_CHARS = 12000/);
	assert.match(source, /SILENT/);
	assert.match(source, /advisory only/);
});
