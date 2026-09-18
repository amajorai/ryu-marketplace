// Co-located contract test for the Writing Style plugin.
//
// Runner: `node --test plugins-store/plugins/writing-style/plugin.test.mjs`.
// The plugin is intentionally a skill-only package. Its runtime behavior is the
// instruction body plus the current agent's already-authorized connection tools;
// this test keeps the package layout, privacy boundary, and generated projection
// from drifting.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const skillPath = join(HERE, "skills", "writing-style", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");

function parseFrontmatter(text) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
	if (!match) {
		return null;
	}
	const [, block, body] = match;
	const values = {};
	for (const line of block.split(/\r?\n/)) {
		const entry = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (entry) {
			values[entry[1]] = entry[2].trim().replace(/^['"](.*)['"]$/, "$1");
		}
	}
	return { values, body };
}

test("manifest identifies a skill-only Writing Style plugin", () => {
	assert.equal(manifest.id, "@ryu/writing-style");
	assert.equal(manifest.name, "Writing Style");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.runnables.length, 1);
	assert.deepEqual(manifest.runnables[0], {
		id: "skill-writing-style",
		name: "Writing Style Extractor",
		kind: "skill",
		config: { skill_id: "writing-style" },
	});
});

test("the skill body is present in the package tree and has standard front matter", () => {
	assert.equal(existsSync(skillPath), true);
	const parsed = parseFrontmatter(skill);
	assert.ok(parsed, "SKILL.md must have parseable front matter");
	assert.equal(parsed.values.name, "Writing Style Extractor");
	assert.match(parsed.values.description, /content-agnostic/);
	assert.equal(parsed.values.enabled, "true");
	assert.equal(parsed.values["always-on"], "false");
	assert.ok(parsed.body.trim().length > 0);
});

test("the workflow uses existing connections and creates a reviewable Markdown artifact", () => {
	for (const phrase of [
		"actual read-only tools",
		"never invent an id",
		"untrusted sample data",
		"fewer than three usable samples",
		"sentence length distribution",
		"Confidence and evidence",
		"artifact.create",
		"text/markdown",
		"artifact.render",
		"personal-writing-style.md",
	]) {
		assert.ok(skill.includes(phrase), `SKILL.md is missing: ${phrase}`);
	}
});

test("the generated guide is a separate skill layer, not a second Output Style", () => {
	assert.equal(manifest.permission_grants.length, 0);
	assert.equal(manifest.contributes, undefined);
	assert.equal(manifest.requires, undefined);
	assert.equal(
		parseFrontmatter(skill).values["keep-coding-instructions"],
		undefined,
		"the extractor skill must not itself be authored as an Output Style"
	);
	assert.match(skill, /This is an Agent Skill, not an Output Style/);
	assert.match(skill, /composes with the selected Output Style/);
});

test("the Agent Plugins projection matches the native manifest", () => {
	const projection = JSON.parse(
		readFileSync(join(HERE, "plugin.json"), "utf8")
	);
	assert.equal(projection.name, "ryu.writing-style");
	assert.equal(projection.version, manifest.version);
	assert.equal(projection.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(
		projection.extensions["com.ryuhq.ryu"].displayName,
		manifest.name
	);
});

test("Core's hermetic plugin catalog registers the package manifest", () => {
	const coreManifest = join(
		HERE,
		"..",
		"..",
		"..",
		"apps",
		"core",
		"src",
		"plugin_manifest",
		"mod.rs"
	);
	if (!existsSync(coreManifest)) {
		return;
	}
	const source = readFileSync(coreManifest, "utf8");
	assert.ok(
		source.includes(
			'include_str!("../../../../plugins-store/plugins/writing-style/manifest.json")'
		),
		"Core's test catalog must compile the package manifest from its single source-of-truth path"
	);
});
