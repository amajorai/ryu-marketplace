// Co-located, zero-dependency test for the `pi-monitor` plugin.
// Run with:  node --test plugins-store/plugins/pi-monitor/plugin.test.mjs
//
// `pi-monitor` is a PI-EXTENSION plugin: it carries no sandboxed hook JS at all,
// only a `contributes.pi_extensions` row naming a TypeScript file the managed Pi
// agent loads at process start. There is no hook body to execute here, so this
// test pins the things that would otherwise fail SILENTLY at runtime — the
// declared file missing from disk, a tool name that collides with a Pi built-in,
// an import outside the closed module set, and a slash command that would
// deadlock the turn. It never edits manifest.json.

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
	assert.equal(ext.id, "monitor");
	// `pi-extensions/<name>.ts`, one segment deep. Core's
	// `validate_pi_extension_path` rejects anything else, and the mirror's vendoring
	// glob is only provably sufficient because the layout is flat.
	assert.match(ext.file, /^pi-extensions\/[A-Za-z0-9._-]+\.ts$/);
	assert.ok(
		existsSync(join(HERE, ext.file)),
		`${ext.file} is declared but not present — Core would resolve nothing and the agent would silently lose the monitor tool`
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

test("registers exactly the `monitor` tool, never a Pi built-in name", () => {
	// pi-acp special-cases the exact tool name `bash` and hijacks the call into
	// terminal rendering, dropping `rawOutput` entirely; a Pi built-in name taken
	// by an extension is silently ignored or worse. The monitor must register its
	// own name and nothing that collides.
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	const names = [...source.matchAll(/name:\s*["'`]([^"'`]+)["'`]/g)].map(
		(m) => m[1]
	);
	assert.deepEqual(
		names.filter((n) => n !== "monitor"),
		[],
		`the extension registers unexpected tool names: ${names.join(", ")}`
	);
	assert.ok(names.includes("monitor"), "the extension must register `monitor`");
});

test("imports only the closed module set", () => {
	// Pi loads extensions through jiti with a CLOSED module set (the pi packages,
	// typebox, node built-ins). A bare specifier outside that set would break at
	// load time under Pi's standalone-binary loader, and `node:ws` in particular
	// is the tempting mistake — the ws source must use the runtime global instead.
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
		(m) => m[1]
	);
	assert.ok(imports.length > 0, "expected at least one import");
	// node: built-ins, bare packages (typebox) and the pi scoped packages.
	const allowed = /^(node:\S+|\w+|@[a-z0-9-]+\/[a-z0-9-]+)$/;
	for (const specifier of imports) {
		assert.ok(
			allowed.test(specifier),
			`import "${specifier}" is outside the closed module set (node: built-ins and the pi packages only)`
		);
	}
	assert.ok(
		!imports.includes("node:ws"),
		"node:ws would not resolve under jiti; the ws source must use the global WebSocket"
	);
});

test("never registers a slash command", () => {
	// `pi.registerCommand` is fatal over ACP: Pi short-circuits a registered
	// extension command before `_runAgentPrompt`, so no `agent_end` fires and the
	// ACP `session/prompt` request never returns. The monitor registers tools and
	// nothing else.
	const source = readFileSync(
		join(HERE, manifest.contributes.pi_extensions[0].file),
		"utf8"
	);
	// An actual CALL is `registerCommand(`, never `registerCommand` as prose (the
	// file's own preamble names the hazard in a comment).
	assert.ok(
		!source.includes("registerCommand("),
		"a registered slash command would deadlock the turn that invoked it"
	);
});
