// Co-located, zero-dependency test for the `tokeneconomizer` plugin.
// Run with:  node --test plugins-store/plugins/tokeneconomizer/plugin.test.mjs
//
// The companion runtime.behavior.test.mjs drives the production extension.
// This file pins package wiring, the settings Core reads, and privilege
// boundaries.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const pluginJson = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));
const extensionSource = () =>
	readFileSync(join(HERE, manifest.contributes.pi_extensions[0].file), "utf8");

test("declares exactly one flat pi extension that exists on disk", () => {
	const extensions = manifest.contributes?.pi_extensions ?? [];
	assert.equal(extensions.length, 1);
	assert.equal(extensions[0].id, "tokeneconomizer");
	assert.match(extensions[0].file, /^pi-extensions\/[A-Za-z0-9._-]+\.ts$/);
	assert.ok(existsSync(join(HERE, extensions[0].file)));
});

test("ships no tools, hooks, or sandboxed code", () => {
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.contributes?.turn_hooks ?? [], []);
	assert.deepEqual(manifest.provides ?? [], []);
	assert.deepEqual(manifest.permission_grants ?? [], []);
});

test("settings use the preference keys Core's tokeneconomizer_config reads", () => {
	const fields = manifest.contributes.settings_tabs[0].fields;
	assert.deepEqual(
		fields.map((field) => field.pref_key),
		[
			"tokeneconomizer-folder",
			"tokeneconomizer-microskills",
			"tokeneconomizer-loopguard",
		]
	);
	const options = (key) =>
		fields
			.find((field) => field.pref_key === key)
			.options.map((option) => option.value);
	// "default" means Core leaves the mechanism to TokenEconomizer's own config;
	// every other value must be one the dispatcher accepts.
	assert.deepEqual(options("tokeneconomizer-microskills"), [
		"default",
		"off",
		"envfacts",
		"on",
	]);
	assert.deepEqual(options("tokeneconomizer-loopguard"), [
		"default",
		"on",
		"off",
	]);
});

test("never registers a slash command (fatal over ACP)", () => {
	assert.doesNotMatch(extensionSource(), /pi\.registerCommand\(/);
});

test("keeps the upstream Apache-2.0 attribution", () => {
	const source = extensionSource();
	assert.match(source, /microsoft\/TokenEconomizer/);
	assert.match(source, /Apache License, Version 2\.0/);
});

test("plugin.json mirrors the manifest identity", () => {
	assert.equal(pluginJson.version, manifest.version);
	assert.equal(pluginJson.description, manifest.description);
	assert.equal(pluginJson.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(
		pluginJson.extensions["com.ryuhq.ryu"].displayName,
		manifest.name
	);
});
