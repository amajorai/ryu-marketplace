// Co-located, zero-dependency test for the `pi-subagent` plugin.
// Run with:  node --test plugins-store/pi-subagent/plugin.test.mjs
//
// `pi-subagent` is a PI-EXTENSION plugin: it carries no sandboxed hook JS at all,
// only a `contributes.pi_extensions` row naming a TypeScript file the managed Pi
// agent loads at process start. There is no hook body to execute here, so this test
// pins the two things that would otherwise fail SILENTLY at runtime — the declared
// file missing from disk, and the tool name the desktop's subagent UI matches on.
// It never edits manifest.json.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

test("declares exactly one pi extension, and the file is on disk", () => {
	const extensions = manifest.contributes?.pi_extensions ?? [];
	assert.equal(extensions.length, 1);
	const [ext] = extensions;
	assert.equal(ext.id, "subagent");
	assert.match(ext.file, /^pi-extensions\/[A-Za-z0-9._-]+\.ts$/);
	assert.ok(
		existsSync(join(HERE, ext.file)),
		`${ext.file} is declared but not present — Core would resolve nothing and the agent would silently lose sub-agents`
	);
});

test("carries no sandboxed hook or adapter code", () => {
	assert.deepEqual(manifest.contributes?.turn_hooks ?? [], []);
	assert.deepEqual(manifest.provides ?? [], []);
});

test("registers the tool as exactly `Task`", () => {
	// `acp_tool_ui_name`'s KNOWN_TOOLS matches on the ACP title, which pi-acp sets to
	// the raw Pi tool name. Renaming this drops the call off the desktop's subagent
	// card and Cowork rail with no other symptom.
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	const names = [...source.matchAll(/name:\s*["'`]([^"'`]+)["'`]/g)].map(
		(m) => m[1]
	);
	assert.ok(
		names.includes("Task"),
		`expected a tool named exactly \`Task\`; found: ${names.join(", ")}`
	);
});
