// Co-located, zero-dependency test for the `pi-shell` plugin.
// Run with:  node --test plugins-store/pi-shell/plugin.test.mjs
//
// `pi-shell` is a PI-EXTENSION plugin: it carries no sandboxed hook JS at all, only
// a `contributes.pi_extensions` row naming a TypeScript file the managed Pi agent
// loads at process start. There is no hook body to execute here, so this test pins
// the two things that would otherwise fail SILENTLY at runtime — the declared file
// missing from disk, and the tool-name rule the extension's whole design rests on.
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
	assert.equal(ext.id, "shell");
	// `pi-extensions/<name>.ts`, one segment deep. Core's
	// `validate_pi_extension_path` rejects anything else, and the mirror's vendoring
	// glob is only provably sufficient because the layout is flat.
	assert.match(ext.file, /^pi-extensions\/[A-Za-z0-9._-]+\.ts$/);
	assert.ok(
		existsSync(join(HERE, ext.file)),
		`${ext.file} is declared but not present — Core would resolve nothing and the agent would silently lose background bash`
	);
});

test("carries no sandboxed hook or adapter code", () => {
	// A Pi extension is unsandboxed code running inside the agent process; a hook is
	// sandboxed JS. Mixing the two in one plugin would put both privileges behind one
	// enable toggle, which is exactly what the separate `pi:extension` grant exists
	// to avoid.
	assert.deepEqual(manifest.contributes?.turn_hooks ?? [], []);
	assert.deepEqual(manifest.provides ?? [], []);
});

test("no tool the extension registers is named `bash`", () => {
	// pi-acp special-cases the exact tool name `bash` and hijacks the call into
	// terminal rendering, dropping `rawOutput` entirely. Registering one would make
	// the background variants look like they work and return nothing.
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	const names = [...source.matchAll(/name:\s*["'`]([^"'`]+)["'`]/g)].map(
		(m) => m[1]
	);
	assert.ok(names.length > 0, "expected the extension to register tools");
	assert.ok(
		!names.includes("bash"),
		`the extension must never register a tool named exactly \`bash\`; found: ${names.join(", ")}`
	);
});

test("ships the restart-notification wiring", () => {
	// After the Pi process dies, the agent only learns its background shells were
	// orphaned because (a) every shell is written to a durable ledger and (b) the
	// first `context` event injects the "no completion record" notice into the
	// model's context. Dropping either half makes orphaned shells SILENT again —
	// the exact failure the feature exists to close — so pin both here.
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	assert.ok(
		/LEDGER_FILE\s*=\s*["'`]ryu-background-shells\.json["'`]/.test(source),
		"the durable shell ledger must be declared"
	);
	assert.ok(
		/pi\.on\("context"/.test(source),
		"the extension must register a `context` handler to inject the restart notice"
	);
	assert.ok(
		/recordStarted\(shell\)/.test(source),
		"a spawned shell must be written to the ledger so a restart can detect it was never finished"
	);
	assert.ok(
		/recordFinished\(shell\)/.test(source),
		"a finished shell must be marked in the ledger so it is not reported as an orphan"
	);
});

test("wakes the parent agent when a background shell finishes", () => {
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	assert.match(source, /customType: "ryu-background-shell-lifecycle"/);
	assert.match(source, /reportCompletion\?\.\(shell\)/);
	assert.match(source, /deliverAs: "followUp", triggerTurn: true/);
	assert.match(source, /Call bash_output with shell_id/);
	assert.match(source, /Manual\/session teardown already reports elsewhere/);
});
