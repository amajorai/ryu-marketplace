import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runCase } from "../../../tools/toolsmith/harness.mjs";
import { scanPurity } from "../../../tools/toolsmith/purity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const memory = manifest.provides.find((entry) => entry.capability === "memory");

async function runAdapter(verb, testCase) {
	const binding = memory.tools[verb];
	if (!binding?.adapter) {
		throw new Error(`${verb} must use its declared adapter`);
	}
	const code = readFileSync(join(HERE, binding.adapter.code_file), "utf8");
	const purityIssues = scanPurity(code);
	if (purityIssues.length > 0) {
		throw new Error(
			`${verb} must stay sandbox-pure: ${JSON.stringify(purityIssues)}`
		);
	}
	return runCase({
		kind: "adapter",
		code,
		adapterTools: binding.adapter.tools,
		testCase,
	});
}

test("memory.store reports missing workspace or peer without calling Honcho", async () => {
	await runAdapter("memory.store", {
		input: { content: "A fact" },
		defaults: { peer_id: "user-7" },
		provider: { call: [] },
		expect: {
			stored: false,
			error:
				"honcho: set the workspace id and peer id in the Honcho settings tab",
		},
		expectCalls: [],
	});
});

test("memory.store trims content, applies the stable session default, and preserves fact metadata", async () => {
	await runAdapter("memory.store", {
		input: {
			content: "  Prefer concise release notes.  ",
			scope: "project",
			category: "preference",
			importance: 4,
			when_to_use: "When writing release notes",
		},
		defaults: { workspace_id: "workspace-a", peer_id: "user-7" },
		provider: { call: [[{ id: "message-1" }]] },
		expect: {
			stored: true,
			count: 1,
			peer: "user-7",
			session: "ryu",
		},
		expectCalls: [
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "ryu",
					messages: [
						{
							content: "Prefer concise release notes.",
							peer_id: "user-7",
							metadata: {
								ryu_kind: "fact",
								ryu_scope: "project",
								ryu_category: "preference",
								ryu_importance: 4,
								ryu_when_to_use: "When writing release notes",
							},
						},
					],
				},
			},
		],
	});
});

test("memory.store creates the missing peer and session once before retrying a 404", async () => {
	await runAdapter("memory.store", {
		input: { content: "first run fact" },
		defaults: {
			workspace_id: "workspace-a",
			peer_id: "user-7",
			session_id: "project-42",
		},
		provider: {
			call: [{ status: 404, body: { error: "missing peer" } }, [{ id: "m1" }]],
			named: {
				"honcho.peer_upsert": [{ id: "user-7" }],
				"honcho.session_upsert": [{ id: "project-42" }],
			},
		},
		expect: {
			stored: true,
			count: 1,
			peer: "user-7",
			session: "project-42",
		},
		expectCalls: [
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "project-42",
					messages: [
						{
							content: "first run fact",
							peer_id: "user-7",
							metadata: { ryu_kind: "fact" },
						},
					],
				},
			},
			{
				path: "callNamed:honcho.peer_upsert",
				args: { workspace_id: "workspace-a", id: "user-7" },
			},
			{
				path: "callNamed:honcho.session_upsert",
				args: { workspace_id: "workspace-a", id: "project-42" },
			},
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "project-42",
					messages: [
						{
							content: "first run fact",
							peer_id: "user-7",
							metadata: { ryu_kind: "fact" },
						},
					],
				},
			},
		],
	});
});

test("memory.store keeps an empty fact and provider failure from becoming a false success", async () => {
	await runAdapter("memory.store", {
		input: { content: " \n " },
		defaults: { workspace_id: "workspace-a", peer_id: "user-7" },
		provider: { call: [] },
		expect: { stored: false, error: "honcho: nothing to store" },
		expectCalls: [],
	});
	await runAdapter("memory.store", {
		input: { content: "fact" },
		defaults: { workspace_id: "workspace-a", peer_id: "user-7" },
		provider: { call: [{ available: false, reason: "missing_secret" }] },
		expect: { raw: { available: false, reason: "missing_secret" } },
		expectCalls: [
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "ryu",
					messages: [
						{
							content: "fact",
							peer_id: "user-7",
							metadata: { ryu_kind: "fact" },
						},
					],
				},
			},
		],
	});
});

test("memory.store refuses a missing peer when the workspace is configured", async () => {
	await runAdapter("memory.store", {
		input: { content: "A fact" },
		defaults: { workspace_id: "workspace-a" },
		provider: { call: [] },
		expect: {
			stored: false,
			error:
				"honcho: set the workspace id and peer id in the Honcho settings tab",
		},
		expectCalls: [],
	});
});

test("memory.sync keeps assistant turns under the configured assistant peer", async () => {
	await runAdapter("memory.sync", {
		input: { role: "assistant", content: "  I suggested a local fixture. " },
		defaults: {
			workspace_id: "workspace-a",
			peer_id: "user-7",
			assistant_peer_id: "ryu-bot",
		},
		provider: { call: [[{ id: "message-2" }]] },
		expect: {
			stored: true,
			count: 1,
			peer: "ryu-bot",
			session: "ryu",
		},
		expectCalls: [
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "ryu",
					messages: [
						{ content: "I suggested a local fixture.", peer_id: "ryu-bot" },
					],
				},
			},
		],
	});
});

test("memory.sync trims user turns and uses the configured peer and session", async () => {
	await runAdapter("memory.sync", {
		input: { role: "user", content: "  A user turn.  " },
		defaults: {
			workspace_id: "workspace-a",
			peer_id: "user-7",
			session_id: "project-42",
			assistant_peer_id: "ryu-bot",
		},
		provider: { call: [[{ id: "message-3" }]] },
		expect: {
			stored: true,
			count: 1,
			peer: "user-7",
			session: "project-42",
		},
		expectCalls: [
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "project-42",
					messages: [{ content: "A user turn.", peer_id: "user-7" }],
				},
			},
		],
	});
});

test("memory.sync rejects missing scope and blank content without calling Honcho", async () => {
	await runAdapter("memory.sync", {
		input: { role: "user", content: "A user turn" },
		defaults: { workspace_id: "workspace-a" },
		provider: { call: [] },
		expect: {
			stored: false,
			error:
				"honcho: set the workspace id and peer id in the Honcho settings tab",
		},
		expectCalls: [],
	});
	await runAdapter("memory.sync", {
		input: { role: "user", content: " \n " },
		defaults: { workspace_id: "workspace-a", peer_id: "user-7" },
		provider: { call: [] },
		expect: { stored: false, error: "honcho: nothing to store" },
		expectCalls: [],
	});
});

test("memory.sync repairs a missing assistant peer and session, then retries once", async () => {
	await runAdapter("memory.sync", {
		input: { role: "assistant", content: "Reply body" },
		defaults: {
			workspace_id: "workspace-a",
			peer_id: "user-7",
		},
		provider: {
			call: [
				{ status: 422, body: { error: "peer not found" } },
				[{ id: "m2" }],
			],
			named: {
				"honcho.peer_upsert": [{ id: "ryu" }],
				"honcho.session_upsert": [{ id: "ryu" }],
			},
		},
		expect: { stored: true, count: 1, peer: "ryu", session: "ryu" },
		expectCalls: [
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "ryu",
					messages: [{ content: "Reply body", peer_id: "ryu" }],
				},
			},
			{
				path: "callNamed:honcho.peer_upsert",
				args: { workspace_id: "workspace-a", id: "ryu" },
			},
			{
				path: "callNamed:honcho.session_upsert",
				args: { workspace_id: "workspace-a", id: "ryu" },
			},
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "ryu",
					messages: [{ content: "Reply body", peer_id: "ryu" }],
				},
			},
		],
	});
});

test("memory.sync preserves fail-open provider errors without calling upserts", async () => {
	await runAdapter("memory.sync", {
		input: { role: "user", content: "user turn" },
		defaults: { workspace_id: "workspace-a", peer_id: "user-7" },
		provider: { call: [{ status: 401, body: { error: "not authorized" } }] },
		expect: { raw: { status: 401, body: { error: "not authorized" } } },
		expectCalls: [
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "ryu",
					messages: [{ content: "user turn", peer_id: "user-7" }],
				},
			},
		],
	});
});

test("write conflicts pass through without trying resource upserts", async () => {
	const conflict = { status: 409, body: { error: "write conflict" } };
	const cases = [
		{
			verb: "memory.store",
			input: { content: "A fact" },
			defaults: { workspace_id: "workspace-a", peer_id: "user-7" },
			body: {
				workspace_id: "workspace-a",
				session_id: "ryu",
				messages: [
					{
						content: "A fact",
						peer_id: "user-7",
						metadata: { ryu_kind: "fact" },
					},
				],
			},
		},
		{
			verb: "memory.sync",
			input: { role: "user", content: "A user turn" },
			defaults: { workspace_id: "workspace-a", peer_id: "user-7" },
			body: {
				workspace_id: "workspace-a",
				session_id: "ryu",
				messages: [{ content: "A user turn", peer_id: "user-7" }],
			},
		},
	];

	for (const { verb, input, defaults, body } of cases) {
		await runAdapter(verb, {
			input,
			defaults,
			provider: { call: [conflict] },
			expect: { raw: conflict },
			expectCalls: [{ path: "callTool", args: body }],
		});
	}
});

test("memory.sync passes through a failed retry instead of reporting a stored turn", async () => {
	const retryFailure = { status: 409, body: { error: "write conflict" } };
	await runAdapter("memory.sync", {
		input: { role: "user", content: "A user turn" },
		defaults: { workspace_id: "workspace-a", peer_id: "user-7" },
		provider: {
			call: [{ status: 404, body: { error: "missing session" } }, retryFailure],
			named: {
				"honcho.peer_upsert": [{ id: "user-7" }],
				"honcho.session_upsert": [{ id: "ryu" }],
			},
		},
		expect: { raw: retryFailure },
		expectCalls: [
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "ryu",
					messages: [{ content: "A user turn", peer_id: "user-7" }],
				},
			},
			{
				path: "callNamed:honcho.peer_upsert",
				args: { workspace_id: "workspace-a", id: "user-7" },
			},
			{
				path: "callNamed:honcho.session_upsert",
				args: { workspace_id: "workspace-a", id: "ryu" },
			},
			{
				path: "callTool",
				args: {
					workspace_id: "workspace-a",
					session_id: "ryu",
					messages: [{ content: "A user turn", peer_id: "user-7" }],
				},
			},
		],
	});
});
