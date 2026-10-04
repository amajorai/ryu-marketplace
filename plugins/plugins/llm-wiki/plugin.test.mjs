// Contract tests for the skill-only LLM Wiki plugin.
// Run with: node --test plugins-store/plugins/llm-wiki/plugin.test.mjs

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const skillPath = join(HERE, "skills", "llm-wiki", "SKILL.md");
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

test("manifest identifies a Space-backed skill plugin", () => {
	assert.equal(manifest.id, "@ryu/llm-wiki");
	assert.equal(manifest.name, "LLM Wiki");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.deepEqual(manifest.runnables, [
		{
			id: "skill-llm-wiki",
			name: "LLM Wiki",
			kind: "skill",
			config: { skill_id: "llm-wiki" },
		},
	]);
	assert.deepEqual(manifest.requires.apps, [{ id: "@ryu/spaces" }]);
	assert.deepEqual(manifest.requires.grants, ["spaces:docs"]);
	assert.deepEqual(manifest.permission_grants, ["spaces:docs"]);
});

test("the bundled skill has standard frontmatter and a real body", () => {
	assert.equal(existsSync(skillPath), true);
	const parsed = parseFrontmatter(skill);
	assert.ok(parsed, "SKILL.md must have parseable front matter");
	assert.equal(parsed.values.name, "LLM Wiki");
	assert.equal(parsed.values.enabled, "true");
	assert.match(parsed.values.description, /Ryu Space/);
	assert.ok(parsed.body.trim().length > 0);
});

test("the skill is Ryu-native and never falls back to a private filesystem wiki", () => {
	for (const phrase of [
		"spaces.list_spaces",
		"spaces.list_documents",
		"spaces.search",
		"spaces.create_space",
		"spaces.create_file",
		"mime: \"text/markdown\"",
		"web.extract",
		"Raw source documents are immutable",
		"untrusted source material",
		"Never invent a `WIKI_PATH`",
		"partial",
	]) {
		assert.ok(skill.includes(phrase), `SKILL.md is missing: ${phrase}`);
	}
	assert.doesNotMatch(skill, /\$\{?WIKI_PATH|~\/wiki|\.\/wiki/);
});

test("the skill preserves the wiki invariants that make it compounding", () => {
	for (const phrase of [
		"SCHEMA.md",
		"index.md",
		"log.md",
		"raw/articles/<slug>.md",
		"[[wikilinks]]",
		"confidence: high | medium | low",
		"contested: true",
		"sha256",
		"queries/<slug>.md",
		"Ask before a single ingest would touch ten or more existing pages",
		"Deletion is destructive",
	]) {
		assert.ok(skill.includes(phrase), `SKILL.md is missing: ${phrase}`);
	}
});

test("the Agent Plugins projection matches the native manifest", () => {
	const projection = JSON.parse(
		readFileSync(join(HERE, "plugin.json"), "utf8")
	);
	assert.equal(projection.name, "ryu.llm-wiki");
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
			'include_str!("../../../../plugins-store/plugins/llm-wiki/manifest.json")'
		),
		"Core's test catalog must compile the package manifest from its source-of-truth path"
	);
});
