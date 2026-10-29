import assert from "node:assert/strict";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, test } from "node:test";
import { pathToFileURL } from "node:url";

// Match the actual managed Pi loader's closed native Typebox aliases.
// These resolve the installed SDK implementation, not a shape-only fixture.
const piRequire = createRequire(
	import.meta.resolve("@earendil-works/pi-coding-agent")
);
const nativeTypeboxEntries = new Map([
	["typebox", piRequire.resolve("typebox")],
	["typebox/value", piRequire.resolve("typebox/value")],
]);
registerHooks({
	resolve(specifier, context, nextResolve) {
		const entry = nativeTypeboxEntries.get(specifier);
		if (entry) {
			return { shortCircuit: true, url: pathToFileURL(entry).href };
		}
		return nextResolve(specifier, context);
	},
});

const shellModule = await import("./pi-extensions/ryu-shell.ts");
const shellExtension = shellModule.default;
const { redactLedgerCommand } = shellModule;
const registeredTools = new Map();
const eventHandlers = new Map();
const sessionDirectory = mkdtempSync(join(tmpdir(), "ryu-pi-shell-test-"));
const trackedEnvironment = new Map(
	[
		"RYU_PI_SUBAGENT",
		"RYU_MCP_CORE_URL",
		"RYU_MCP_CORE_TOKEN",
		"RYU_MCP_USER_JWT",
	].map((key) => [key, process.env[key]])
);
for (const key of trackedEnvironment.keys()) {
	delete process.env[key];
}

const piFixture = {
	registerTool(tool) {
		registeredTools.set(tool.name, tool);
	},
	on(event, handler) {
		eventHandlers.set(event, handler);
	},
	sendMessage() {},
};
shellExtension(piFixture);

function context() {
	return {
		cwd: process.cwd(),
		sessionManager: { getSessionDir: () => sessionDirectory },
	};
}

function runTool(name, params) {
	const registered = registeredTools.get(name);
	if (!registered) {
		throw new Error(`${name} did not register`);
	}
	return registered.execute(
		`test-${name}`,
		params,
		new AbortController().signal,
		() => undefined,
		context()
	);
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function outputBody(text) {
	const marker = "--- new output ---\n";
	const index = text.indexOf(marker);
	return index < 0 ? "" : text.slice(index + marker.length);
}

test("background shells stream new output once, report the exit code, and release ids", async () => {
	await assert.rejects(
		runTool("bash_background", { command: "   " }),
		/`command` is required/
	);
	await assert.rejects(
		runTool("bash_background", {
			command: "printf should-not-run",
			cwd: "./this-directory-does-not-exist-for-ryu-tests",
		}),
		/cwd is not a directory/
	);

	const started = await runTool("bash_background", {
		command:
			"printf 'first chunk\\n'; sleep 0.2; printf 'last chunk\\n'; exit 7",
		description: "output-drain regression",
	});
	const shellId = started.details.shell_id;
	assert.match(shellId, /^bg_\d+$/);
	assert.equal(started.details.running, true);

	let firstPoll = await runTool("bash_output", { shell_id: shellId });
	const outputPolls = [firstPoll];
	for (let attempt = 0; attempt < 30; attempt += 1) {
		if (firstPoll.details.drained_chars > 0) {
			break;
		}
		await delay(20);
		firstPoll = await runTool("bash_output", { shell_id: shellId });
		outputPolls.push(firstPoll);
	}
	assert.match(outputBody(firstPoll.content[0]?.text ?? ""), /first chunk/);
	assert.ok(firstPoll.details.drained_chars > 0);

	const nextPoll = await runTool("bash_output", { shell_id: shellId });
	outputPolls.push(nextPoll);
	assert.doesNotMatch(
		outputBody(nextPoll.content[0]?.text ?? ""),
		/first chunk/
	);

	let finalPoll = nextPoll;
	for (let attempt = 0; attempt < 30; attempt += 1) {
		if (finalPoll.details.running === false) {
			break;
		}
		await delay(20);
		finalPoll = await runTool("bash_output", { shell_id: shellId });
		outputPolls.push(finalPoll);
	}
	assert.equal(finalPoll.details.running, false);
	assert.equal(finalPoll.details.exit_code, 7);
	const drainedOutput = outputPolls
		.map((poll) => outputBody(poll.content[0]?.text ?? ""))
		.join("");
	assert.match(drainedOutput, /first chunk/);
	assert.match(drainedOutput, /last chunk/);
	assert.equal(drainedOutput.match(/first chunk/g)?.length, 1);
	assert.equal(drainedOutput.match(/last chunk/g)?.length, 1);
	await assert.rejects(
		runTool("bash_output", { shell_id: shellId }),
		/unknown shell_id/
	);
});

test("concurrent starts enforce the four-shell cap and bash_kill frees slots", {
	skip:
		process.platform === "win32"
			? "this process fixture uses a POSIX shell"
			: false,
}, async () => {
	const command = `exec ${JSON.stringify(process.execPath)} -e "setInterval(() => {}, 1000)"`;
	const starts = await Promise.allSettled(
		Array.from({ length: 5 }, () => runTool("bash_background", { command }))
	);
	const accepted = starts.filter((result) => result.status === "fulfilled");
	const rejected = starts.filter((result) => result.status === "rejected");
	assert.equal(accepted.length, 4);
	assert.equal(rejected.length, 1);
	assert.match(
		String(rejected[0]?.reason),
		/4 background shells are already running/
	);

	for (const result of accepted) {
		const shellId = result.value.details.shell_id;
		assert.ok(shellId, "accepted shell omitted its shell_id");
		const stopped = await runTool("bash_kill", { shell_id: shellId });
		assert.equal(stopped.details.running, false);
		assert.match(
			stopped.content[0]?.text ?? "",
			new RegExp(`Stopped ${shellId}`)
		);
	}

	const recovered = await runTool("bash_background", {
		command: "printf 'slot released\\n'",
	});
	const recoveredId = recovered.details.shell_id;
	assert.ok(recoveredId, "recovered shell omitted its shell_id");
	let recoveredOutput = await runTool("bash_output", { shell_id: recoveredId });
	for (let attempt = 0; attempt < 30; attempt += 1) {
		if (recoveredOutput.details.running === false) {
			break;
		}
		await delay(20);
		recoveredOutput = await runTool("bash_output", { shell_id: recoveredId });
	}
	assert.match(recoveredOutput.content[0]?.text ?? "", /slot released/);
	assert.equal(recoveredOutput.details.running, false);
});

test("the ledger keeps a redacted, owner-only command preview", async () => {
	const secret = "sk-live-ledger-fixture-0123456789";
	const started = await runTool("bash_background", {
		command: `OPENAI_API_KEY=${secret} printf 'ok\\n'; curl -H 'Authorization: Bearer ${secret}' https://user:${secret}@example.invalid --token ${secret} >/dev/null 2>&1 || true`,
	});
	const ledgerFile = join(sessionDirectory, "ryu-background-shells.json");
	const bytes = readFileSync(ledgerFile, "utf8");
	assert.ok(!bytes.includes(secret), "raw secret reached the ledger file");
	const record = JSON.parse(bytes).shells[started.details.shell_id];
	assert.match(record.command, /OPENAI_API_KEY=\[redacted\]/);
	assert.match(record.command, /Authorization: \[redacted\]/);
	assert.match(record.command, /https:\/\/\[redacted\]@example\.invalid/);
	assert.match(record.command, /--token \[redacted\]/);
	if (process.platform !== "win32") {
		assert.equal(statSync(ledgerFile).mode & 0o777, 0o600);
	}
	await runTool("bash_kill", { shell_id: started.details.shell_id });
});

test("a legacy plaintext ledger is redacted and tightened on the next write", async () => {
	const ledgerFile = join(sessionDirectory, "ryu-background-shells.json");
	const secret = "ghp_legacyLedgerFixture0123456789";
	writeFileSync(
		ledgerFile,
		JSON.stringify({
			version: 1,
			shells: {
				bg_legacy: {
					command: `GITHUB_TOKEN=${secret} gh api /user`,
					cwd: "/tmp",
					process_pid: 1,
					started_at: Date.now(),
					status: "finished",
				},
			},
		})
	);
	if (process.platform !== "win32") {
		chmodSync(ledgerFile, 0o644);
	}
	const started = await runTool("bash_background", { command: "true" });
	const bytes = readFileSync(ledgerFile, "utf8");
	assert.ok(!bytes.includes(secret), "legacy secret survived the rewrite");
	assert.match(bytes, /GITHUB_TOKEN=\[redacted\] gh api \/user/);
	if (process.platform !== "win32") {
		assert.equal(statSync(ledgerFile).mode & 0o777, 0o600);
	}
	await runTool("bash_kill", { shell_id: started.details.shell_id });
});

test("redactLedgerCommand leaves ordinary commands readable", () => {
	assert.equal(
		redactLedgerCommand("npm run dev -- --port 3000"),
		"npm run dev -- --port 3000"
	);
	assert.equal(
		redactLedgerCommand("mysql -u root:hunter2pass db"),
		"mysql -u [redacted] db"
	);
	assert.equal(redactLedgerCommand("x".repeat(500)).length, 401);
});

afterEach(async () => {
	await eventHandlers.get("session_shutdown")?.();
});

after(async () => {
	await eventHandlers.get("session_shutdown")?.();
	for (const [key, value] of trackedEnvironment) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
	rmSync(sessionDirectory, { force: true, recursive: true });
});
