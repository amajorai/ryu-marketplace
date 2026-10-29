// Co-located contract test for the Round-Trip Translate plugin.
//
// Runner: `node --test plugins-store/plugins/round-trip-translate/plugin.test.mjs`.
// The clean-text tool body is executed case-by-case in `tool.test.mjs`; this file
// pins the HTTP egress, the credential namespace, and the skill/manifest pairing.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const projection = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const runnable = (id) => manifest.runnables.find((entry) => entry.id === id);
const translate = runnable("tool-google-translate").config;
const clean = runnable("tool-round-trip-clean-text").config;
const field = manifest.contributes.settings_tabs[0].fields[0];
const skillPath = join(here, "skills", "round-trip-translate", "SKILL.md");

test("translation uses the fixed official Cloud Translation endpoint", () => {
	assert.equal(translate.backend, "http");
	assert.equal(translate.method, "POST");
	assert.equal(
		translate.url,
		"https://translation.googleapis.com/language/translate/v2"
	);
	assert.deepEqual(translate.body_defaults, { format: "text" });
	assert.equal(translate.unwrap_body, true);
	assert.deepEqual(translate.input_schema.required, ["q", "target"]);
	assert.deepEqual(manifest.permission_grants, [
		"tool:http-egress:translation.googleapis.com",
		"tool:execute",
	]);
});

test("the API key is scoped to this plugin's credential namespace and never model-visible", () => {
	const encodedId = [...manifest.id.trim()]
		.map((character) =>
			/[A-Za-z0-9]/.test(character)
				? character.toUpperCase()
				: `_X${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}_`
		)
		.join("");
	const ownKey = `RYU_PLUGIN_${encodedId}_API_KEY`;
	assert.equal(field.type, "secret");
	assert.equal(field.pref_key, ownKey);
	assert.deepEqual(translate.secret_headers, {
		"X-Goog-Api-Key": `env:${ownKey}`,
	});
	assert.equal(translate.header_params, undefined);
	assert.equal("key" in translate.input_schema.properties, false);
});

test("the clean-text tool is sealed inline and requires a string", () => {
	assert.equal(clean.backend, "inline_deno");
	assert.equal(clean.slug, "round_trip.clean_text");
	assert.equal(
		clean.code,
		readFileSync(join(here, "tools", "clean_text.js"), "utf8")
	);
	assert.deepEqual(clean.input_schema.required, ["text"]);
});

test("the skill drives both tools and does not promise detector evasion", () => {
	assert.deepEqual(runnable("skill-round-trip-translate").config, {
		skill_id: "round-trip-translate",
	});
	assert.equal(existsSync(skillPath), true);
	const skill = readFileSync(skillPath, "utf8");
	assert.match(skill, /^---\nname: Round-Trip Translate\n/);
	assert.match(skill, /`round_trip\.clean_text`/);
	assert.match(skill, /`google_translate\.translate`/);
	assert.match(skill, /Never substitute your own rewording/);
	assert.match(skill, /Do not claim the result will pass, or avoid/);
});

test("the Agent Plugins projection matches the native manifest", () => {
	assert.equal(projection.version, manifest.version);
	assert.equal(projection.description, manifest.description);
	assert.deepEqual(projection.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
});
