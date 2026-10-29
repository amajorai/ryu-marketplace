// Co-located, zero-dependency test for the `pi-copy` plugin.
// Run with:  node --test plugins-store/plugins/pi-copy/plugin.test.mjs
//
// `pi-copy` is a PI-EXTENSION plugin: it carries no sandboxed hook JS, only a
// `contributes.pi_extensions` row naming a TypeScript file the managed Pi agent
// loads at process start. This test pins the things that would otherwise fail
// SILENTLY at runtime — the declared file missing from disk, a tool name that
// collides with a Pi built-in, an import outside the closed module set, and a
// slash command that would deadlock the turn. runtime.behavior.test.mjs drives
// the production tool against real files.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const extensionSource = () =>
	readFileSync(join(HERE, manifest.contributes.pi_extensions[0].file), "utf8");

test("declares exactly one pi extension, and the file is on disk", () => {
	const extensions = manifest.contributes?.pi_extensions ?? [];
	assert.equal(extensions.length, 1);
	const [ext] = extensions;
	assert.equal(ext.id, "copy");
	// Flat `pi-extensions/<name>.ts`: Core's `validate_pi_extension_path` rejects
	// anything else, and the mirror's vendoring glob relies on the flat layout.
	assert.match(ext.file, /^pi-extensions\/[A-Za-z0-9._-]+\.ts$/);
	assert.ok(
		existsSync(join(HERE, ext.file)),
		`${ext.file} is declared but not present — the agent would silently lose copy_paste`
	);
});

test("carries no sandboxed hook or adapter code", () => {
	assert.deepEqual(manifest.contributes?.turn_hooks ?? [], []);
	assert.deepEqual(manifest.provides ?? [], []);
});

test("registers exactly the `copy_paste` tool, never a Pi built-in name", () => {
	// `edit`/`write`/`read` are Pi built-ins; an extension tool taking one of
	// those names would shadow or be shadowed by it. ryu-plan.ts gates this tool
	// by the exact name `copy_paste`, so a rename must move both.
	const names = [
		...extensionSource().matchAll(/name:\s*["'`]([^"'`]+)["'`]/g),
	].map((m) => m[1]);
	assert.deepEqual(names, ["copy_paste"]);
});

test("imports only the closed module set", () => {
	// Pi loads extensions through jiti with a CLOSED module set (the pi packages,
	// typebox, node built-ins).
	const imports = [
		...extensionSource().matchAll(/from\s+["']([^"']+)["']/g),
	].map((m) => m[1]);
	assert.ok(imports.length > 0, "expected at least one import");
	const allowed = /^(node:\S+|\w+|@[a-z0-9-]+\/[a-z0-9-]+)$/;
	for (const specifier of imports) {
		assert.ok(
			allowed.test(specifier),
			`import "${specifier}" is outside the closed module set`
		);
	}
});

test("never registers a slash command", () => {
	// `pi.registerCommand` is fatal over ACP: the turn that invoked it never ends.
	assert.ok(!extensionSource().includes("registerCommand("));
});
