import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(packageRoot, "manifest.json"), "utf8")
);
const server = manifest.contributes.lsp_servers["csharp-ls"];

const runServer = ({ environment, signal } = {}) =>
	new Promise((resolve, reject) => {
		const child = spawn(server.command, server.args ?? [], {
			env: environment,
			signal,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("close", (status, closeSignal) => {
			resolve({ closeSignal, status, stderr, stdout });
		});
		child.stdin.end();
	});

test("manifest declares the exact grant, activation, command, and C# mapping", () => {
	assert.equal(manifest.id, "@ryu/csharp-lsp");
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(server, {
		command: "csharp-ls",
		extensionToLanguage: { ".cs": "csharp" },
	});
});

test("portable projection retains identity while refusing to claim an executable", () => {
	const projection = JSON.parse(
		readFileSync(join(packageRoot, "plugin.json"), "utf8")
	);
	assert.equal(projection.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(
		projection.extensions["com.ryuhq.ryu"].displayName,
		manifest.name
	);
	assert.equal(projection.version, manifest.version);
	assert.equal(projection.bin, undefined);
	assert.equal(projection.commands, undefined);
});

test("README publishes the same extension map and missing-server behavior", () => {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const example = readme.match(/```json\n([\s\S]*?)\n```/);
	assert.ok(example);
	assert.deepEqual(JSON.parse(example[1]), server.extensionToLanguage);
	assert.match(readme, /never bundles the server\s+binary/);
	assert.match(readme, /missing binary is a\s+graceful skip/);
});

test("the declared command supports independent launches and exact retry after failure", {
	skip:
		process.platform === "win32"
			? "executable fixture uses a POSIX shebang"
			: false,
}, async () => {
	const directory = mkdtempSync(join(tmpdir(), "ryu-csharp-lsp-"));
	try {
		const executable = join(directory, server.command);
		writeFileSync(
			executable,
			`#!/usr/bin/env node
const attempt = process.env.RYU_LSP_ATTEMPT;
if (attempt === "fail") {
  process.stderr.write("startup refused");
  process.exit(23);
}
process.stdout.write(JSON.stringify({ pid: process.pid, argv: process.argv.slice(2) }));
`
		);
		chmodSync(executable, 0o755);
		const baseEnvironment = {
			...process.env,
			PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
		};

		const [first, second] = await Promise.all([
			runServer({ environment: baseEnvironment }),
			runServer({ environment: baseEnvironment }),
		]);
		assert.equal(first.status, 0, first.stderr);
		assert.equal(second.status, 0, second.stderr);
		assert.deepEqual(JSON.parse(first.stdout).argv, server.args ?? []);
		assert.deepEqual(JSON.parse(second.stdout).argv, server.args ?? []);
		assert.notEqual(
			JSON.parse(first.stdout).pid,
			JSON.parse(second.stdout).pid
		);

		const refused = await runServer({
			environment: { ...baseEnvironment, RYU_LSP_ATTEMPT: "fail" },
		});
		assert.equal(refused.status, 23);
		assert.equal(refused.stderr, "startup refused");
		const retry = await runServer({ environment: baseEnvironment });
		assert.equal(retry.status, 0, retry.stderr);
		assert.deepEqual(JSON.parse(retry.stdout).argv, server.args ?? []);
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});

test("a canceled declared-command launch reports cancellation without fabricated output", {
	skip:
		process.platform === "win32"
			? "executable fixture uses a POSIX shebang"
			: false,
}, async () => {
	const directory = mkdtempSync(join(tmpdir(), "ryu-csharp-lsp-cancel-"));
	try {
		const executable = join(directory, server.command);
		writeFileSync(
			executable,
			"#!/usr/bin/env node\nsetTimeout(() => process.stdout.write('unexpected'), 10_000);\n"
		);
		chmodSync(executable, 0o755);
		const controller = new AbortController();
		const launch = runServer({
			environment: {
				...process.env,
				PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
			},
			signal: controller.signal,
		});
		controller.abort();
		await assert.rejects(launch, { code: "ABORT_ERR" });
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
