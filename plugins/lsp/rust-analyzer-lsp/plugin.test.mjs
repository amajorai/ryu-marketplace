// Co-located caller contract for the Rust LSP package.
// Run with: node --test plugins-store/lsp/rust-analyzer-lsp/plugin.test.mjs

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
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const projection = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const server = manifest.contributes.lsp_servers["rust-analyzer"];

function launch(command, env) {
	return spawn(command, [], {
		env,
		stdio: ["pipe", "pipe", "pipe"],
	});
}

function waitForExit(child) {
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}

test("native manifest and Agent Plugins projection retain one Rust LSP identity", () => {
	assert.equal(manifest.id, "@ryu/rust-analyzer-lsp");
	assert.deepEqual(Object.keys(manifest.contributes.lsp_servers), [
		"rust-analyzer",
	]);
	assert.equal(server.command, "rust-analyzer");
	assert.deepEqual(server.extensionToLanguage, { ".rs": "rust" });
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(projection.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.equal(projection.version, manifest.version);
});

test("the declared command refuses when unavailable, then an exact retry speaks LSP and can be canceled", async () => {
	const directory = mkdtempSync(join(tmpdir(), "ryu-rust-lsp-"));
	try {
		const missing = launch(server.command, { PATH: directory });
		await assert.rejects(
			waitForExit(missing),
			(error) => error.code === "ENOENT"
		);

		const executable = join(directory, server.command);
		writeFileSync(
			executable,
			`#!/usr/bin/env node
let input = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  const separator = input.indexOf("\\r\\n\\r\\n");
  if (separator < 0) return;
  const length = Number(/Content-Length: (\\d+)/i.exec(input.subarray(0, separator).toString())?.[1]);
  const body = input.subarray(separator + 4, separator + 4 + length).toString();
  const request = JSON.parse(body);
  const response = JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { capabilities: { hoverProvider: true } } });
  process.stdout.write("Content-Length: " + Buffer.byteLength(response) + "\\r\\n\\r\\n" + response);
});
setInterval(() => {}, 1000);
`
		);
		chmodSync(executable, 0o755);

		const child = launch(server.command, {
			...process.env,
			PATH: `${directory}:${process.env.PATH ?? ""}`,
		});
		let output = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		const request = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { rootUri: null, capabilities: {} },
		});
		child.stdin.write(
			`Content-Length: ${Buffer.byteLength(request)}\r\n\r\n${request}`
		);
		await new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error(`LSP fixture response timed out: ${output}`)),
				2000
			);
			const inspect = () => {
				if (!output.includes('"hoverProvider":true')) {
					return;
				}
				clearTimeout(timeout);
				resolve();
			};
			child.stdout.on("data", inspect);
			inspect();
		});
		assert.match(output, /^Content-Length: \d+\r\n\r\n/);
		assert.match(output, /"id":1/);
		child.kill("SIGTERM");
		assert.deepEqual(await waitForExit(child), {
			code: null,
			signal: "SIGTERM",
		});
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
