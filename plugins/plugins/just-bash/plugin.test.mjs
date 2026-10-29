import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const run = manifest.runnables[0].config;

// The behavior test drives the real upstream CLI. Core resolves `just-bash`
// through its command allowlist; here an explicit JUST_BASH_BIN wins, then PATH.
function findJustBash() {
	if (process.env.JUST_BASH_BIN) {
		return process.env.JUST_BASH_BIN;
	}
	for (const directory of (process.env.PATH ?? "").split(delimiter)) {
		const candidate = join(directory, "just-bash");
		if (directory && existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

function render(args) {
	return run.command_args.map((template) =>
		template.replace("{path}", args.path).replace("{script}", args.script)
	);
}

test("manifest identity and public metadata are complete", () => {
	assert.equal(manifest.id, "@ryu/just-bash");
	assert.equal(manifest.name, "just-bash");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.category, "Developer Tools");
	assert.equal(manifest.license, "Apache-2.0");
	assert.equal(manifest.engines.ryu, ">=0.1.0");
	assert.ok(manifest.description.length > 0);
});

test("declares one fixed just-bash command tool", () => {
	assert.equal(manifest.runnables.length, 1);
	const [runnable] = manifest.runnables;
	assert.equal(runnable.kind, "tool");
	assert.equal(run.slug, "just-bash.run");
	assert.equal(run.backend, "command");
	assert.equal(run.bin, "just-bash");
	assert.equal(run.output, "json");
	assert.equal(run.timeout_secs, 60);
});

test("argv keeps the workspace read-only, writes in memory, and the script last", () => {
	assert.deepEqual(run.command_args, [
		"--json",
		"--allow-write",
		"--root",
		"{path}",
		"-c",
		"{script}",
	]);
	assert.equal(run.command_args.includes("--python"), false);
	assert.equal(run.command_args.includes("--javascript"), false);
	assert.deepEqual(run.workspace_path_args, ["path"]);
	assert.deepEqual(run.input_schema.required, ["script", "path"]);
	assert.equal(run.input_schema.additionalProperties, false);
	assert.equal(run.input_schema.properties.script.maxLength, 8192);
	assert.match(
		run.input_schema.properties.path.description,
		/active Ryu workspace/
	);
});

test("grant is scoped to just-bash and the plugin declares no MCP server or sidecar", () => {
	assert.deepEqual(manifest.permission_grants, ["tool:command:just-bash"]);
	assert.deepEqual(manifest.mcp_servers ?? {}, {});
	assert.equal(manifest.sidecars, undefined);
});

const justBash = findJustBash();

test("the declared command runs scripts over a fixture without modifying it", {
	skip: justBash
		? false
		: "just-bash CLI not installed (npm install -g just-bash@3.6.0, or set JUST_BASH_BIN)",
}, () => {
	const directory = mkdtempSync(join(here, ".just-bash-fixture-"));
	try {
		mkdirSync(join(directory, "src"), { recursive: true });
		writeFileSync(join(directory, "src", "a.txt"), "beta\nalpha\nbeta\n");
		writeFileSync(join(directory, "data.json"), '{"n":[1,2,3]}\n');
		const runScript = (script) => {
			const result = spawnSync(justBash, render({ path: directory, script }), {
				encoding: "utf8",
			});
			return { status: result.status, ...JSON.parse(result.stdout) };
		};

		const piped = runScript(
			"sort src/a.txt | uniq -c | sort -rn | head -1; jq '.n | add' data.json"
		);
		assert.equal(piped.exitCode, 0, piped.stderr);
		assert.equal(piped.stdout, "   2 beta\n6\n");

		const written = runScript(
			"echo scratch > note.txt; echo more >> src/a.txt; cat note.txt; wc -l < src/a.txt"
		);
		assert.equal(written.exitCode, 0, written.stderr);
		assert.equal(written.stdout, "scratch\n4\n");
		assert.deepEqual(readdirSync(directory).sort(), ["data.json", "src"]);
		assert.equal(
			readFileSync(join(directory, "src", "a.txt"), "utf8"),
			"beta\nalpha\nbeta\n",
			"in-memory writes never reach the real workspace"
		);

		const contained = runScript(
			"cat ../../../../etc/passwd; curl -s https://example.com"
		);
		assert.notEqual(contained.exitCode, 0);
		assert.equal(contained.stdout, "");
		assert.match(contained.stderr, /No such file or directory/);
		assert.match(contained.stderr, /curl: command not found/);

		const flagLike = runScript("--help");
		assert.equal(flagLike.exitCode, 127, "a flag-shaped script stays a script");

		const failed = runScript("exit 3");
		assert.equal(failed.exitCode, 3);
		assert.equal(failed.status, 3);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
