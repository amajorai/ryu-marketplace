import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const native = manifest.runnables[0].config;
const field = manifest.contributes.settings_tabs[0].fields[0];

test("Reader uses a fixed direct endpoint and asks for JSON", () => {
	assert.equal(native.url, "https://r.jina.ai/");
	assert.equal(native.method, "POST");
	assert.deepEqual(native.header_params, ["Accept"]);
	assert.equal(native.unwrap_body, true);
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:r.jina.ai",
		"tool:execute",
	]);
});

test("the optional key is scoped to this disk plugin's credential namespace", () => {
	const encodedId = [...manifest.id.trim()]
		.map((character) =>
			/[A-Za-z0-9]/.test(character)
				? character.toUpperCase()
				: `_X${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}_`
		)
		.join("");
	const ownKey = `RYU_PLUGIN_${encodedId}_API_KEY`;
	assert.equal(field.pref_key, ownKey);
	assert.equal(native.secret_headers.Authorization, `Bearer env:${ownKey}`);
});
