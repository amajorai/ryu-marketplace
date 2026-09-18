// Compile the self-contained lifecycle helper from the shipped single-file extension.
// Core ships one TypeScript file; extracting its AST node keeps this test independent
// of Pi SDK loading while executing the actual production helper against real children.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { getEventListeners, once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const folder = await mkdtemp(join(tmpdir(), "ryu-subagent-lifetime-"));
after(() => rm(folder, { recursive: true, force: true }));
const source = await readFile(
	new URL("./pi-extensions/ryu-subagent.ts", import.meta.url),
	"utf8"
);
const ast = ts.createSourceFile(
	"extension.ts",
	source,
	ts.ScriptTarget.Latest,
	true
);
const helper = ast.statements.find(
	(node) =>
		ts.isFunctionDeclaration(node) && node.name?.text === "attachChildAbort"
);
if (!helper) {
	throw new Error("Shipped extension is missing its child cancellation helper");
}
const compiled = ts.transpileModule(`export ${helper.getText(ast)}`, {
	compilerOptions: {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
	},
});
const modulePath = join(folder, "lifetime.mjs");
await writeFile(modulePath, compiled.outputText);
const { attachChildAbort } = await import(pathToFileURL(modulePath).href);

test("a child that ignores SIGTERM is forcibly reaped after the grace period", {
	timeout: 5000,
}, async () => {
	const child = spawn(
		process.execPath,
		[
			"-e",
			"process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);",
		],
		{ stdio: ["ignore", "pipe", "ignore"] }
	);
	const closed = once(child, "close");
	const controller = new AbortController();
	let aborted = 0;
	try {
		await once(child.stdout, "data");
		attachChildAbort(
			child,
			controller.signal,
			() => {
				aborted += 1;
			},
			30
		);
		controller.abort();
		assert.equal(
			child.killed,
			true,
			"SIGTERM was sent but the process is still alive"
		);
		const [, signal] = await closed;
		assert.equal(signal, "SIGKILL");
		assert.equal(aborted, 1);
		assert.equal(getEventListeners(controller.signal, "abort").length, 0);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
		}
		await closed;
	}
});

test("normal child closure detaches cancellation before a later parent abort", {
	timeout: 5000,
}, async () => {
	const child = spawn(
		process.execPath,
		[
			"-e",
			"process.stdout.write('ready'); setTimeout(() => process.exit(0), 40);",
		],
		{ stdio: ["ignore", "pipe", "ignore"] }
	);
	const closed = once(child, "close");
	const controller = new AbortController();
	let aborted = 0;
	try {
		await once(child.stdout, "data");
		attachChildAbort(
			child,
			controller.signal,
			() => {
				aborted += 1;
			},
			30
		);
		assert.equal(getEventListeners(controller.signal, "abort").length, 1);
		const [code] = await closed;
		assert.equal(code, 0);
		assert.equal(getEventListeners(controller.signal, "abort").length, 0);
		controller.abort();
		assert.equal(aborted, 0);
		assert.equal(child.killed, false);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
		}
		await closed;
	}
});
