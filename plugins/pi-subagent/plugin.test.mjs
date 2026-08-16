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

test("registers an inherited-by-default subagent model setting", () => {
	assert.deepEqual(manifest.permission_grants, ["preferences:read"]);
	const tabs = manifest.contributes?.settings_tabs ?? [];
	assert.equal(tabs.length, 1);
	assert.equal(tabs[0].scope, "node");
	assert.deepEqual(tabs[0].fields, [
		{
			type: "model_picker",
			pref_key: "pi-subagent-model",
			label: "Default subagent model",
			description:
				"Leave unset to let the main agent choose a model for each task. Selecting a model forces every subagent to use it.",
			placeholder: "Let the main agent decide",
		},
	]);
});

test("forces the registered model over the main agent's requested model", () => {
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	assert.match(source, /const DEFAULT_MODEL_PREF_KEY = "pi-subagent-model"/);
	assert.match(
		source,
		/const childModel = modelOverride \?\? requestedModel \?\? agent\.model/
	);
	assert.match(source, /args\.push\("--model", childModel\)/);
	const taskSchema = source.slice(
		source.indexOf("const TaskItem"),
		source.indexOf("// ── Global in-flight accounting")
	);
	assert.match(taskSchema, /\bmodel: Type\.Optional/);
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

test("surfaces every spawned child as a nested Agent lifecycle transaction", () => {
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	assert.match(source, /function childLifecycleStep\(/);
	assert.match(source, /name: "Agent"/);
	assert.match(source, /lifecycleId: `agent-\$\{index\}`/);
	assert.match(source, /status: "pending"/);
	assert.match(source, /lifecycle\.status = isFailedResult\(currentResult\)/);
	assert.match(source, /Publish the lifecycle row before creating the process/);
});
