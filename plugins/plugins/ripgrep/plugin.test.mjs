import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

test("manifest identity and public metadata are complete", () => {
	assert.equal(manifest.id, "@ryu/ripgrep");
	assert.equal(manifest.name, "ripgrep");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.category, "Search");
	assert.equal(manifest.engines.ryu, ">=0.1.0");
	assert.ok(manifest.description.length > 0);
});

test("declares two fixed ripgrep command tools", () => {
	assert.deepEqual(
		manifest.runnables.map((runnable) => runnable.config.slug),
		["ripgrep.search", "ripgrep.files"]
	);
	for (const runnable of manifest.runnables) {
		assert.equal(runnable.kind, "tool");
		assert.equal(runnable.config.backend, "command");
		assert.equal(runnable.config.bin, "rg");
		assert.equal(runnable.config.timeout_secs, 60);
		assert.ok(runnable.config.command_args.includes("--"));
	}
});

test("search input is required and terminates options before model values", () => {
	const search = manifest.runnables.find(
		(runnable) => runnable.config.slug === "ripgrep.search"
	).config;
	assert.deepEqual(search.input_schema.required, ["pattern", "path"]);
	assert.equal(search.input_schema.properties.pattern.type, "string");
	assert.equal(search.input_schema.properties.path.type, "string");
	assert.deepEqual(search.command_args, [
		"--json",
		"--color",
		"never",
		"--",
		"{pattern}",
		"{path}",
	]);
	assert.deepEqual(search.workspace_path_args, ["path"]);
	assert.match(
		search.input_schema.properties.path.description,
		/active Ryu workspace/
	);
});

test("files input is required and returns the visible file listing", () => {
	const files = manifest.runnables.find(
		(runnable) => runnable.config.slug === "ripgrep.files"
	).config;
	assert.deepEqual(files.input_schema.required, ["path"]);
	assert.deepEqual(files.command_args, [
		"--files",
		"--color",
		"never",
		"--",
		"{path}",
	]);
	assert.deepEqual(files.workspace_path_args, ["path"]);
});

test("grant is scoped to rg and the plugin declares no MCP server", () => {
	assert.deepEqual(manifest.permission_grants, ["tool:command:rg"]);
	assert.deepEqual(manifest.mcp_servers ?? {}, {});
});
