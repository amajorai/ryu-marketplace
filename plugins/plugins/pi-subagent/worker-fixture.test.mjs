// Execute the shipped runSingleAgent implementation against a deterministic
// in-process Pi worker. This covers the ACP child contract without launching Pi,
// invoking a model, or touching a project.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const piRequire = createRequire(
	import.meta.resolve("@earendil-works/pi-coding-agent")
);
const typeboxUrl = pathToFileURL(piRequire.resolve("typebox")).href;
const valueUrl = pathToFileURL(piRequire.resolve("typebox/value")).href;

const folder = await mkdtemp(join(tmpdir(), "ryu-subagent-worker-fixture-"));
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

function sourceDeclaration(name) {
	const found = ast.statements.find((statement) => {
		if (ts.isFunctionDeclaration(statement)) {
			return statement.name?.text === name;
		}
		if (ts.isVariableStatement(statement)) {
			return statement.declarationList.declarations.some(
				(declaration) =>
					ts.isIdentifier(declaration.name) && declaration.name.text === name
			);
		}
		return false;
	});
	if (!found) {
		throw new Error(`Shipped extension is missing ${name}`);
	}
	return found.getText(ast);
}

const productionDeclarations = [
	"CHILD_JSON_VALUE",
	"CHILD_JSON_OBJECT",
	"CHILD_TEXT",
	"CHILD_IMAGE",
	"CHILD_TEXT_CONTENT",
	"CHILD_USAGE",
	"CHILD_MESSAGE",
	"CHILD_EVENT_INPUT",

	"OVERRIDE_TEXT",
	"AGENT_NAME_RE",
	"MAX_RYU_STEPS",
	"RYU_STEP_OUTPUT_CAP",
	"RYU_STEP_INPUT_FIELD_CAP",
	"SUBAGENT_MARKER",
	"ABORT_KILL_GRACE_MS",
	"renderAgentList",
	"childLifecycleStep",
	"emptyUsage",
	"getFinalOutput",
	"isFailedResult",
	"getResultOutput",
	"capStepInput",
	"runSingleAgent",
].map(sourceDeclaration);

const harness = `
import { Type } from ${JSON.stringify(typeboxUrl)};
import { Value } from ${JSON.stringify(valueUrl)};
let workerFactory;
let spawnCalls = [];
let promptCalls = [];
let removedPromptDirs = [];
const process = { env: { RYU_PARENT_FIXTURE: "kept" }, stderr: { write() {} } };
const log = () => {};
const errorText = (error) => error instanceof Error ? error.message : String(error);
const contentText = (content) => content.map((part) => part.text ?? "").join("");
const getPiInvocation = (args) => ({ command: "local-pi-worker-fixture", args });
const writePromptToTempFile = async (agentName, prompt) => {
  promptCalls.push({ agentName, prompt });
  return { dir: "/fixture/private-prompt", filePath: "/fixture/private-prompt/system.md" };
};
const rm = async (dir, options) => { removedPromptDirs.push({ dir, options }); };
const spawn = (command, args, options) => {
  spawnCalls.push({ command, args, options });
  return workerFactory({ command, args, options });
};
${productionDeclarations.join("\n\n")}
export { runSingleAgent, spawnCalls, promptCalls, removedPromptDirs, setWorkerFactory };
function setWorkerFactory(factory) { workerFactory = factory; }
`;
const compiled = ts.transpileModule(harness, {
	compilerOptions: {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
	},
});
const modulePath = join(folder, "worker-fixture.mjs");
await writeFile(modulePath, compiled.outputText);
const production = await import(pathToFileURL(modulePath).href);

function makeWorker({
	events = [],
	stderr = "",
	exitCode = 0,
	spawnError,
} = {}) {
	const child = new EventEmitter();
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.exitCode = null;
	child.signalCode = null;
	queueMicrotask(() => {
		if (spawnError) {
			child.emit("error", new Error(spawnError));
			return;
		}
		const frames = events.map((event) => `${JSON.stringify(event)}\n`);
		const stream = frames.join("");
		const midpoint = Math.floor(stream.length / 2);
		child.stdout.write(stream.slice(0, midpoint));
		child.stdout.write(stream.slice(midpoint));
		child.stdout.end();
		if (stderr) {
			child.stderr.write(stderr);
		}
		child.stderr.end();
		child.exitCode = exitCode;
		child.emit("close", exitCode, null);
	});
	return child;
}

function message(type, value) {
	// Complete the authored local frames with actual SDK publisher fields.
	// Existing content, usage totals, model and tool assertions are unchanged.
	if (value.role === "assistant") {
		return {
			type,
			message: {
				api: "openai-completions",
				provider: "openai",
				timestamp: 0,
				...value,
				usage: {
					...value.usage,
					cost: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						...value.usage.cost,
					},
				},
			},
		};
	}
	if (value.role === "toolResult") {
		return { type, message: { toolName: "read", timestamp: 0, ...value } };
	}
	return { type, message: value };
}

function detailsFor(results) {
	return {
		mode: "single",
		results,
		ryuSteps: results.flatMap((result) => result.ryuSteps),
	};
}

function eventsForSuccess() {
	return [
		message("message_end", {
			role: "assistant",
			content: [
				{
					type: "toolCall",
					id: "worker-call-1",
					name: "read",
					arguments: {
						file_path: "/fixture/source.ts",
						excerpt: "x".repeat(450),
					},
				},
			],
			model: "worker-reported-model",
			stopReason: "toolUse",
			usage: {
				input: 10,
				output: 3,
				cacheRead: 2,
				cacheWrite: 1,
				totalTokens: 13,
				cost: { total: 0.002 },
			},
		}),
		message("tool_result_end", {
			role: "toolResult",
			toolCallId: "worker-call-1",
			content: [{ type: "text", text: "local source excerpt" }],
			isError: false,
		}),
		message("message_end", {
			role: "assistant",
			content: [
				{ type: "text", text: "The local source has the required assertion." },
			],
			model: "worker-reported-model",
			stopReason: "stop",
			usage: {
				input: 20,
				output: 7,
				cacheRead: 4,
				cacheWrite: 2,
				totalTokens: 27,
				cost: { total: 0.005 },
			},
		}),
	];
}

function singleOptions(overrides = {}) {
	return {
		agentName: "scout",
		agents: new Map([
			[
				"scout",
				{
					description: "Fixture scout",
					model: "persona-model",
					systemPrompt: "Use only the local fixture.",
					tools: ["read", "grep"],
				},
			],
		]),
		cwd: "/fixture/project",
		defaultCwd: "/fixture/default",
		makeDetails: detailsFor,
		lifecycleId: "agent-fixture-1",
		modelOverride: "operator-model",
		onUpdate: undefined,
		requestedModel: "request-model",
		signal: undefined,
		task: "verify the local retry path",
		...overrides,
	};
}

test("runs the shipped child contract, streams nested steps, and completes lifecycle", async () => {
	production.spawnCalls.length = 0;
	production.promptCalls.length = 0;
	production.removedPromptDirs.length = 0;
	const timeline = [];
	const updates = [];
	production.setWorkerFactory(() => {
		timeline.push("spawn");
		return makeWorker({ events: eventsForSuccess() });
	});
	const result = await production.runSingleAgent(
		singleOptions({
			onUpdate: (partial) => {
				const snapshot = structuredClone(partial.details.results[0]);
				updates.push(snapshot);
				timeline.push(`update:${snapshot.ryuSteps[0].status}`);
			},
		})
	);

	assert.deepEqual(timeline[0], "update:pending");
	assert.equal(
		updates[0].exitCode,
		-1,
		"running state is visible before spawn"
	);
	assert.equal(production.spawnCalls.length, 1);
	const spawn = production.spawnCalls[0];
	assert.equal(timeline[1], "spawn");
	assert.equal(spawn.command, "local-pi-worker-fixture");
	assert.deepEqual(spawn.args, [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--model",
		"operator-model",
		"--tools",
		"read,grep",
		"--append-system-prompt",
		"/fixture/private-prompt/system.md",
		"Task: verify the local retry path",
	]);
	assert.deepEqual(production.promptCalls, [
		{ agentName: "scout", prompt: "Use only the local fixture." },
	]);
	assert.equal(spawn.options.cwd, "/fixture/project");
	assert.equal(spawn.options.shell, false);
	assert.deepEqual(spawn.options.stdio, ["ignore", "pipe", "pipe"]);
	assert.equal(spawn.options.env.RYU_PARENT_FIXTURE, "kept");
	assert.equal(spawn.options.env.RYU_PI_SUBAGENT, "1");
	assert.deepEqual(production.removedPromptDirs, [
		{
			dir: "/fixture/private-prompt",
			options: { force: true, recursive: true },
		},
	]);

	assert.equal(result.exitCode, 0);
	assert.equal(result.agent, "scout");
	assert.equal(result.task, "verify the local retry path");
	assert.equal(
		result.model,
		"operator-model",
		"node setting outranks request/persona"
	);
	assert.equal(result.usage.turns, 2);
	assert.equal(result.usage.input, 30);
	assert.equal(result.usage.output, 10);
	assert.equal(result.usage.cacheRead, 6);
	assert.equal(result.usage.cacheWrite, 3);
	assert.equal(result.usage.contextTokens, 27);
	assert.equal(result.usage.cost, 0.007);
	assert.equal(result.stopReason, "stop");
	assert.equal(
		result.ryuSteps[0].status,
		"completed",
		"the visible Agent lifecycle closes after the worker exits"
	);
	assert.equal(
		result.ryuSteps[0].output,
		"Subagent completed with exit code 0."
	);
	assert.deepEqual(result.ryuSteps[0].input, {
		description: "verify the local retry path",
		prompt: "verify the local retry path",
		subagent_type: "scout",
	});
	assert.equal(result.ryuSteps[1].name, "read");
	assert.equal(result.ryuSteps[1].status, "completed");
	assert.equal(result.ryuSteps[1].output, "local source excerpt");
	assert.equal(result.ryuSteps[1].input.file_path, "/fixture/source.ts");
	assert.equal(result.ryuSteps[1].input.excerpt.length, 401);
	assert.equal(
		updates.at(-1).ryuSteps[0].status,
		"completed",
		"the final streamed readback includes the closed lifecycle"
	);
});

test("a failed child is surfaced and a later Task invocation can retry cleanly", async () => {
	production.spawnCalls.length = 0;
	production.promptCalls.length = 0;
	production.removedPromptDirs.length = 0;
	let run = 0;
	production.setWorkerFactory(() => {
		run += 1;
		return run === 1
			? makeWorker({ stderr: "fixture worker unavailable", exitCode: 7 })
			: makeWorker({ events: eventsForSuccess() });
	});

	const first = await production.runSingleAgent(
		singleOptions({ lifecycleId: "retry-1" })
	);
	assert.equal(first.exitCode, 7);
	assert.equal(first.ryuSteps[0].status, "failed");
	assert.equal(first.ryuSteps[0].output, "fixture worker unavailable");
	assert.equal(
		first.ryuSteps.length,
		1,
		"a failed child cannot leak prior tool rows"
	);

	const second = await production.runSingleAgent(
		singleOptions({ lifecycleId: "retry-2", task: "retry the fixture task" })
	);
	assert.equal(second.exitCode, 0);
	assert.equal(second.ryuSteps[0].status, "completed");
	assert.equal(second.ryuSteps[0].id, "retry-2");
	assert.equal(second.ryuSteps[1].output, "local source excerpt");
	assert.equal(production.spawnCalls.length, 2);
	assert.equal(
		production.spawnCalls[1].args.at(-1),
		"Task: retry the fixture task"
	);
	assert.equal(production.promptCalls.length, 2);
	assert.equal(production.removedPromptDirs.length, 2);
});

test("a child that settles as aborted mid tool call is failed, not completed", async () => {
	production.setWorkerFactory(() =>
		makeWorker({
			events: [
				...eventsForSuccess().slice(0, 2),
				{ type: "agent_settled", aborted: true },
			],
		})
	);
	const aborted = await production.runSingleAgent(
		singleOptions({ lifecycleId: "aborted-1" })
	);
	assert.equal(aborted.exitCode, 0);
	assert.equal(aborted.stopReason, "aborted");
	assert.equal(aborted.ryuSteps[0].status, "failed");

	production.setWorkerFactory(() =>
		makeWorker({
			events: [
				...eventsForSuccess(),
				{ type: "agent_settled", aborted: false },
			],
		})
	);
	const settled = await production.runSingleAgent(
		singleOptions({ lifecycleId: "settled-1" })
	);
	assert.equal(settled.stopReason, "stop");
	assert.equal(settled.ryuSteps[0].status, "completed");
});

test("a spawn refusal is visible to the caller and a fresh invocation retries", async () => {
	production.spawnCalls.length = 0;
	production.removedPromptDirs.length = 0;
	let run = 0;
	production.setWorkerFactory(() => {
		run += 1;
		return run === 1
			? makeWorker({ spawnError: "fixture executable missing" })
			: makeWorker({ events: eventsForSuccess() });
	});

	const refused = await production.runSingleAgent(
		singleOptions({ lifecycleId: "spawn-refused" })
	);
	assert.equal(refused.exitCode, 1);
	assert.equal(
		refused.errorMessage,
		"Failed to start subagent: fixture executable missing"
	);
	assert.equal(refused.ryuSteps[0].status, "failed");
	assert.equal(
		refused.ryuSteps[0].output,
		"Failed to start subagent: fixture executable missing"
	);
	assert.equal(production.removedPromptDirs.length, 1);

	const retried = await production.runSingleAgent(
		singleOptions({ lifecycleId: "spawn-retry", task: "retry after refusal" })
	);
	assert.equal(retried.exitCode, 0);
	assert.equal(retried.ryuSteps[0].status, "completed");
	assert.equal(production.spawnCalls.length, 2);
	assert.equal(production.removedPromptDirs.length, 2);
});

test("an unknown persona fails locally without spawning a child", async () => {
	production.spawnCalls.length = 0;
	production.setWorkerFactory(() => {
		throw new Error("unknown personas must not spawn");
	});
	const result = await production.runSingleAgent(
		singleOptions({ agentName: "missing-persona" })
	);
	assert.equal(result.exitCode, 1);
	assert.equal(result.ryuSteps[0].status, "failed");
	assert.match(result.stderr, /Available: scout/);
	assert.equal(production.spawnCalls.length, 0);
});
