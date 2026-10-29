import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
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

test("the declared commands search and list only a local fixture with exact argv", () => {
	const directory = mkdtempSync(join(here, ".ripgrep-fixture-"));
	try {
		mkdirSync(join(directory, "src"), { recursive: true });
		writeFileSync(join(directory, ".gitignore"), "ignored.txt\n");
		writeFileSync(
			join(directory, "src", "visible.txt"),
			"first line\n--help\nlast line\n"
		);
		writeFileSync(join(directory, "ignored.txt"), "--help\n");
		writeFileSync(join(directory, ".hidden.txt"), "--help\n");
		const fixturePath = relative(here, directory).split(sep).join("/");
		const search = manifest.runnables.find(
			(runnable) => runnable.config.slug === "ripgrep.search"
		).config;
		const searchArgs = search.command_args.map((argument) =>
			argument.replace("{pattern}", "--help").replace("{path}", fixturePath)
		);
		assert.deepEqual(searchArgs, [
			"--json",
			"--color",
			"never",
			"--",
			"--help",
			fixturePath,
		]);
		const found = spawnSync(search.bin, searchArgs, {
			cwd: here,
			encoding: "utf8",
		});
		assert.equal(found.status, 0, found.stderr);
		const events = found.stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		const match = events.find((event) => event.type === "match");
		assert.ok(match, "literal `--help` search returned a match event");
		assert.ok(match.data.path.text.endsWith("src/visible.txt"));
		assert.equal(match.data.lines.text.trim(), "--help");
		assert.equal(
			events.some(
				(event) =>
					event.type === "match" && event.data.path.text.endsWith("ignored.txt")
			),
			false,
			"rg retains the fixture's ignore rule"
		);

		const noMatchArgs = search.command_args.map((argument) =>
			argument
				.replace("{pattern}", "not-present-token")
				.replace("{path}", fixturePath)
		);
		const noMatch = spawnSync(search.bin, noMatchArgs, {
			cwd: here,
			encoding: "utf8",
		});
		assert.equal(
			noMatch.status,
			1,
			"no match is the documented rg exit status"
		);
		const noMatchEvents = noMatch.stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.equal(
			noMatchEvents.some((event) => event.type === "match"),
			false
		);
		assert.equal(noMatchEvents.at(-1).type, "summary");

		const files = manifest.runnables.find(
			(runnable) => runnable.config.slug === "ripgrep.files"
		).config;
		const filesArgs = files.command_args.map((argument) =>
			argument.replace("{path}", fixturePath)
		);
		assert.deepEqual(filesArgs, [
			"--files",
			"--color",
			"never",
			"--",
			fixturePath,
		]);
		const listed = spawnSync(files.bin, filesArgs, {
			cwd: here,
			encoding: "utf8",
		});
		assert.equal(listed.status, 0, listed.stderr);
		assert.deepEqual(listed.stdout.trim().split("\n"), [
			`${fixturePath}/src/visible.txt`,
		]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
