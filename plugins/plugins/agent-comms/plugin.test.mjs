// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";

// Co-located test for the `agent-comms` plugin.
// Run with:  node --test plugins-store/plugins/agent-comms/plugin.test.mjs
//
// The plugin contributes four tools and two turn hooks. Three tools have
// `inline_js` bodies, and both hooks have `code_file` bodies that Core splices
// into a sandbox with fixed injected globals. This test reproduces the splice
// (`input`/`caller`/`host` for a tool, `ctx`/`host` for a hook), runs the real
// bodies against an in-memory KV, and asserts the outcome. Nothing here edits
// manifest.json.
//
// The load-bearing cases are the bounds, because this plugin must not create
// unrequested agent work: the hop limit and refusal to address yourself. Each
// has a test that fails if the guard is removed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCase } from "../../../tools/toolsmith/harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const raw = readFileSync(MANIFEST_PATH, "utf8");
const manifest = JSON.parse(raw);
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));
const normalizeLineEndings = (value) => value.replace(/\r\n?/g, "\n");

// Core wraps a body in an async IIFE where a bare `return` reports the value.
// `AsyncFunction(...names, body)` reproduces that, and the parameter names are
// the injected globals: `build_inline_tool_program` binds `input`, `caller` and
// `host`; `plugin_host::build_hook_program` binds `ctx` and `host`.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const toolBody = (slug) => {
	const runnable = manifest.runnables.find((r) => r.config?.slug === slug);
	if (!runnable) {
		throw new Error(`no runnable declares the tool '${slug}'`);
	}
	return runnable.config.code;
};

const hookBody = (id) => {
	const hook = manifest.contributes.turn_hooks.find((h) => h.id === id);
	if (!hook) {
		throw new Error(`no turn hook declares the id '${id}'`);
	}
	// Core hydrates `code_file` into `code` at parse time
	// (`PluginManifest::hydrate_code_files`); mirror that here or the body read
	// below would be empty and every assertion would pass vacuously.
	return readFileSync(join(HERE, hook.code_file), "utf8");
};

const runTool = (slug, { input = {}, caller = {}, host }) =>
	new AsyncFunction("input", "caller", "host", toolBody(slug))(
		input,
		{ agent_id: null, conversation_id: null, ...caller },
		host
	);

const runHook = (id, { ctx = {}, host }) =>
	new AsyncFunction("ctx", "host", hookBody(id))(ctx, host);

/**
 * The `host` facade, backed by a real Map so a read-after-write inside one body
 * behaves as it does in Core (`plugin_storage` is a real store, not a queue).
 * `runAgent` is scripted per test and every call is recorded.
 */
function makeHost({
	storage = {},
	runAgent = async () => "ok",
	casConflicts = 0,
} = {}) {
	const kv = new Map(Object.entries(storage));
	const calls = [];
	const casAttempts = [];
	return {
		kv,
		calls,
		casAttempts,
		host: {
			runAgent: async (args) => {
				calls.push({ path: "runAgent", args });
				return runAgent(args);
			},
			sideModel: async () => {
				throw new Error("this plugin must not call host.sideModel");
			},
			getPreference: async () => null,
			storage: {
				get: async (key) => (kv.has(String(key)) ? kv.get(String(key)) : null),
				set: async (key, value) => {
					kv.set(
						String(key),
						isNativeText(value) ? value : JSON.stringify(value)
					);
					return true;
				},
				delete: async (key) => kv.delete(String(key)),
				keys: async () => [...kv.keys()],
				compareAndSet: async (key, expected, value) => {
					const name = String(key);
					casAttempts.push({ key: name, expected, value });
					if (casAttempts.length <= casConflicts) {
						return false;
					}
					const current = kv.has(name) ? kv.get(name) : null;
					if (current !== (expected == null ? null : String(expected))) {
						return false;
					}
					if (value == null) {
						kv.delete(name);
					} else {
						kv.set(name, String(value));
					}
					return true;
				},
			},
			log: () => {},
		},
	};
}

const inboxOf = (kv, agent) =>
	JSON.parse(kv.get(`inbox:${encodeURIComponent(agent)}`) ?? "[]");

// ── manifest contract ─────────────────────────────────────────────────────────

test("every tool is routable, callable, and sealed from its source file", () => {
	assert.equal(manifest.id, "@ryu/agent-comms");
	assert.equal(isNativeText(manifest.name), true);
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"].id, manifest.id);
	assert.equal(plugin.extensions["com.ryuhq.ryu"].displayName, manifest.name);
	assert.deepEqual(manifest.activation_events, ["*"]);
	// `tool:execute` is what makes an `inline_js` tool callable at all: without
	// it Core registers the tool and then refuses every call.
	assert.ok(manifest.permission_grants.includes("tool:execute"));
	assert.ok(manifest.permission_grants.includes("storage:kv"));
	assert.ok(!manifest.permission_grants.includes("hook:run-agent"));
	// The directory tool dials Core over loopback; the egress grant is checked
	// before the request is made, so a missing one is a deterministic refusal.
	assert.ok(manifest.permission_grants.includes("tool:http-egress:127.0.0.1"));

	for (const runnable of manifest.runnables) {
		const config = runnable.config;
		assert.ok(
			config.description.length > 80,
			`${config.slug} needs a real description`
		);
		assert.equal(config.input_schema.type, "object");
		if (config.backend === "inline_js") {
			assert.ok(config.code.length > 0, `${config.slug} has an empty body`);
		}
	}

	// The drift check, inlined rather than imported from seal.mjs so this file
	// stays runnable on its own: `tools/<slug>.js` is the source form and the
	// manifest's `code` is the wire form, and an edited-but-unsealed body would
	// otherwise ship as whatever the manifest last captured.
	for (const runnable of manifest.runnables) {
		if (runnable.config.backend !== "inline_js") {
			continue;
		}
		const source = readFileSync(
			join(HERE, "tools", `${runnable.config.slug}.js`),
			"utf8"
		);
		assert.equal(
			normalizeLineEndings(runnable.config.code),
			normalizeLineEndings(source),
			`${runnable.config.slug} was edited without resealing — run: node plugins-store/plugins/agent-comms/seal.mjs`
		);
	}
});

test("the delivery hook is the only reader of an inbox", () => {
	// The security property this plugin rests on: reads are keyed by the
	// server-derived `ctx.agent_id`, so no tool may take an argument naming whose
	// mailbox to read. If a future tool adds one, this fails.
	for (const runnable of manifest.runnables) {
		const properties = runnable.config.input_schema.properties ?? {};
		for (const name of Object.keys(properties)) {
			assert.ok(
				!/^(for_agent|as|inbox|read_as)$/.test(name),
				`${runnable.config.slug} takes '${name}', which would let a model read another agent's mail`
			);
		}
	}
	const directory = manifest.contributes.turn_hooks.find(
		(h) => h.id === "agent-comms.directory"
	);
	// The redaction hook must stay `match`-gated or it spawns a sandbox on every
	// tool result in the node.
	assert.deepEqual(directory.match.tools, ["agents.directory"]);
});

// ── agents.send ──────────────────────────────────────────────────────────────

test("send queues a message under the recipient's inbox", async () => {
	const { host, kv } = makeHost();
	const result = await runTool("agents.send", {
		input: { to: "scout", text: "the deploy finished" },
		caller: { agent_id: "ryu", conversation_id: "conv_1" },
		host,
	});
	assert.equal(result.ok, true);
	assert.equal(result.from, "ryu");
	assert.equal(result.to, "scout");
	assert.equal(result.hops, 1);
	assert.equal(result.id, "m1");

	const inbox = inboxOf(kv, "scout");
	assert.equal(inbox.length, 1);
	assert.equal(inbox[0].text, "the deploy finished");
	assert.equal(inbox[0].from, "ryu");
	assert.equal(inbox[0].seq, 1);
	// The pair history is written from the same call for agents.thread.
	assert.ok(kv.has("thread:ryu|scout"));
});

test("send preserves a reply target in the recipient's persisted inbox", async () => {
	const { host, kv } = makeHost();
	const result = await runTool("agents.send", {
		input: { to: "scout", text: "answering the handoff", reply_to: "m17" },
		caller: { agent_id: "ryu", conversation_id: "conv-reply" },
		host,
	});

	assert.equal(result.ok, true);
	assert.equal(result.id, "m1");
	assert.deepEqual(inboxOf(kv, "scout")[0], {
		id: "m1",
		seq: 1,
		from: "ryu",
		from_conversation: "conv-reply",
		to: "scout",
		text: "answering the handoff",
		hops: 1,
		reply_to: "m17",
	});
	assert.equal(
		JSON.parse(kv.get("thread:ryu|scout"))[0].text,
		"answering the handoff"
	);
});

test("message ids remain monotonic across sends", async () => {
	const { host } = makeHost();
	const first = await runTool("agents.send", {
		input: { to: "scout", text: "one" },
		caller: { agent_id: "ryu" },
		host,
	});
	const second = await runTool("agents.send", {
		input: { to: "scout", text: "two" },
		caller: { agent_id: "ryu" },
		host,
	});
	assert.equal(first.id, "m1");
	assert.equal(second.id, "m2");
});

test("send retries transient compare-and-set conflicts without duplicating messages", async () => {
	const { host, kv, casAttempts } = makeHost({ casConflicts: 2 });
	const result = await runTool("agents.send", {
		input: { to: "scout", text: "retry the local write" },
		caller: { agent_id: "ryu", conversation_id: "conv-retry" },
		host,
	});

	assert.equal(result.ok, true);
	assert.equal(result.id, "m1");
	assert.equal(
		casAttempts.filter((attempt) => attempt.key === "seq").length,
		3
	);
	assert.equal(inboxOf(kv, "scout").length, 1);
	assert.equal(inboxOf(kv, "scout")[0].text, "retry the local write");
	assert.equal(JSON.parse(kv.get("thread:ryu|scout")).length, 1);
});

test("send stops after the CAS retry limit without leaving a partial inbox entry", async () => {
	const { host, kv, casAttempts } = makeHost({ casConflicts: 8 });
	await assert.rejects(
		runTool("agents.send", {
			input: { to: "scout", text: "must not partially queue" },
			caller: { agent_id: "ryu" },
			host,
		}),
		/sequence is busy; retry the message/
	);
	assert.equal(casAttempts.length, 8);
	assert.equal(kv.has("inbox:scout"), false);
	assert.equal(kv.has("thread:ryu|scout"), false);
});

test("the sender is the calling agent, not what the model wrote", async () => {
	const { host, kv } = makeHost();
	await runTool("agents.send", {
		input: { to: "scout", text: "hi", from: "the-boss" },
		caller: { agent_id: "ryu", conversation_id: "conv_1" },
		host,
	});
	assert.equal(inboxOf(kv, "scout")[0].from, "ryu");
});

test("an agent-less caller cannot impersonate a sender", async () => {
	const { host } = makeHost();
	await assert.rejects(
		runTool("agents.send", {
			input: { to: "scout", text: "nightly run failed", from: "monitors" },
			host,
		}),
		/calling agent could not be identified/
	);
});

test("send refuses a third hop", async () => {
	// The recipient's turn recorded that it was answering a hop-2 message, so a
	// relay from it would be hop 3.
	const { host, kv } = makeHost({ storage: { "hops.conv:conv_9": "2" } });
	const result = await runTool("agents.send", {
		input: { to: "third", text: "and you should know…" },
		caller: { agent_id: "scout", conversation_id: "conv_9" },
		host,
	});
	assert.equal(result.ok, false);
	assert.equal(result.refused, "hop_limit");
	assert.equal(
		kv.has("inbox:third"),
		false,
		"a refused hop must write nothing"
	);
});

test("send refuses a message to yourself and a message with no recipient", async () => {
	const { host } = makeHost();
	await assert.rejects(
		runTool("agents.send", {
			input: { to: "ryu", text: "note to self" },
			caller: { agent_id: "ryu" },
			host,
		}),
		/message to yourself/
	);
	await assert.rejects(
		runTool("agents.send", {
			input: { text: "to nobody" },
			caller: { agent_id: "ryu" },
			host,
		}),
		/bounded agent id/
	);
});

test("send rejects unbounded or delimiter-bearing agent ids", async () => {
	const { host } = makeHost();
	for (const to of ["scout|other", "x".repeat(129)]) {
		await assert.rejects(
			runTool("agents.send", {
				input: { to, text: "nope" },
				caller: { agent_id: "ryu" },
				host,
			}),
			/bounded agent id/
		);
	}
});

test("the inbox is capped, oldest first", async () => {
	const { host, kv } = makeHost();
	for (let i = 0; i < 24; i++) {
		await runTool("agents.send", {
			input: { to: "scout", text: `m${i}` },
			caller: { agent_id: "ryu", conversation_id: "conv_1" },
			host,
		});
	}
	const inbox = inboxOf(kv, "scout");
	assert.equal(inbox.length, 20);
	assert.equal(inbox[0].text, "m4");
	assert.equal(inbox.at(-1).text, "m23");
});

test("the synchronous delegation tool is not shipped", () => {
	assert.equal(
		manifest.runnables.some((r) => r.config?.slug === "agents.ask"),
		false
	);
});

// ── agents.react ─────────────────────────────────────────────────────────────

test("agent reactions are owned by Message Reactions, not the mailbox", () => {
	// `agents.react` moved to the pre-installed `@ryu/reactions` plugin so every
	// agent can react without enabling this per-turn mailbox hook.
	assert.equal(
		manifest.runnables.some((r) => r.config?.slug === "agents.react"),
		false
	);
	assert.equal(
		manifest.permission_grants.includes("conversation:reactions"),
		false
	);
});

// ── agents.thread ────────────────────────────────────────────────────────────

test("thread reads only the calling agent's own threads", async () => {
	const { host } = makeHost({
		storage: {
			"thread:ryu|scout": JSON.stringify([
				{ seq: 1, from: "ryu", to: "scout", text: "which service?" },
			]),
			"thread:planner|scout": JSON.stringify([
				{ seq: 2, from: "planner", to: "scout", text: "private" },
			]),
		},
	});
	const mine = await runTool("agents.thread", {
		input: { with: "scout" },
		caller: { agent_id: "ryu" },
		host,
	});
	assert.equal(mine.count, 1);
	assert.equal(mine.messages[0].text, "which service?");

	// Naming a pair it is not part of reads an empty thread, never someone
	// else's: the key is built from `caller.agent_id`, not from the arguments.
	const peers = await runTool("agents.thread", {
		input: {},
		caller: { agent_id: "ryu" },
		host,
	});
	assert.deepEqual(peers.peers, ["scout"]);
});

test("Toolsmith runs agents.thread against only the caller's local history", async () => {
	await runCase({
		kind: "inline_tool",
		code: toolBody("agents.thread"),
		testCase: {
			name: "read a caller-owned thread",
			input: { with: "scout" },
			caller: { agent_id: "ryu" },
			host: {
				storage: {
					"thread:ryu|scout": JSON.stringify([
						{ seq: 4, from: "ryu", to: "scout", text: "local question" },
					]),
				},
			},
			expect: {
				ok: true,
				agent: "ryu",
				with: "scout",
				messages: [
					{ seq: 4, from: "ryu", to: "scout", text: "local question" },
				],
				count: 1,
			},
			expectCalls: [
				{
					path: "host.storage.get",
					args: { key: "thread:ryu|scout" },
				},
			],
		},
	});
});

test("thread refuses agent-less and malformed peer identities", async () => {
	const { host } = makeHost();
	await assert.rejects(
		runTool("agents.thread", { input: { from: "ryu" }, host }),
		/calling agent could not be identified/
	);
	await assert.rejects(
		runTool("agents.thread", {
			input: { with: "scout|other" },
			caller: { agent_id: "ryu" },
			host,
		}),
		/bounded agent id/
	);
});

// ── the delivery hook ─────────────────────────────────────────────────────────

test("the delivery hook injects the inbox once and clears it", async () => {
	const { host, kv } = makeHost({
		storage: {
			"inbox:scout": JSON.stringify([
				{ id: "m1", from: "ryu", text: "the deploy finished", hops: 1 },
			]),
		},
	});
	const first = await runHook("agent-comms.deliver", {
		ctx: {
			agent_id: "scout",
			conversation_id: "conv_2",
			transcript: [],
			flags: {},
		},
		host,
	});
	assert.equal(first.kind, "inject");
	assert.match(first.text, /the deploy finished/);
	assert.match(first.text, /from ryu/);
	// Prompt-injection posture: a message is data from a peer, not an instruction
	// that outranks the user.
	assert.match(first.text, /not your operator/);
	// The hop depth is carried onto the conversation so a relay counts as hop 2.
	assert.equal(kv.get("hops.conv:conv_2"), "1");

	const second = await runHook("agent-comms.deliver", {
		ctx: {
			agent_id: "scout",
			conversation_id: "conv_2",
			transcript: [],
			flags: {},
		},
		host,
	});
	assert.deepEqual(
		second,
		{ kind: "none" },
		"a message must be delivered once"
	);
});

test("the delivery hook is two KV reads and no writes on the common path", async () => {
	// It runs on EVERY turn (there is no cheap `match` for an agent-keyed inbox),
	// so the empty case has to stay the inbox read plus this conversation's hop
	// context read, and no writes.
	const { host, kv } = makeHost();
	const reads = [];
	const counting = {
		...host,
		storage: {
			...host.storage,
			get: async (key) => {
				reads.push(String(key));
				return host.storage.get(key);
			},
			set: async () => {
				throw new Error("the empty path must not write");
			},
			delete: async () => {
				throw new Error("the empty path must not write");
			},
		},
	};
	const directive = await runHook("agent-comms.deliver", {
		ctx: {
			agent_id: "ryu",
			conversation_id: "conv_3",
			transcript: [],
			flags: {},
		},
		host: counting,
	});
	assert.deepEqual(directive, { kind: "none" });
	assert.deepEqual(reads, ["inbox:ryu", "hops.conv:conv_3"]);
	assert.equal(kv.size, 0);
});

test("the delivery hook does nothing without an agent, and survives a corrupt inbox", async () => {
	const { host } = makeHost({ storage: { "inbox:ryu": "{not json" } });
	assert.deepEqual(
		await runHook("agent-comms.deliver", { ctx: { transcript: [] }, host }),
		{ kind: "none" }
	);
	assert.deepEqual(
		await runHook("agent-comms.deliver", {
			ctx: { agent_id: "ryu", conversation_id: "conv_4", transcript: [] },
			host,
		}),
		{ kind: "none" }
	);
});

// ── the directory redaction hook ──────────────────────────────────────────────

test("the directory hook strips every agent's system prompt before the model sees it", async () => {
	const { host } = makeHost();
	const directive = await runHook("agent-comms.directory", {
		ctx: {
			tool_name: "agents.directory",
			tool_output: {
				agents: [
					{
						id: "scout",
						name: "Scout",
						description: "Reads the codebase",
						model: "gpt-oss",
						system_prompt: "SECRET internal instructions",
					},
					{ id: "", name: "nameless" },
				],
			},
		},
		host,
	});
	assert.equal(directive.kind, "transform");
	assert.equal(directive.output.count, 1);
	assert.deepEqual(Object.keys(directive.output.agents[0]).sort(), [
		"description",
		"id",
		"model",
		"name",
	]);
	assert.equal(
		JSON.stringify(directive.output).includes("SECRET"),
		false,
		"a system prompt must never reach the transcript"
	);
});

test("the directory hook leaves other tools and error envelopes alone", async () => {
	const { host } = makeHost();
	assert.deepEqual(
		await runHook("agent-comms.directory", {
			ctx: { tool_name: "web.search", tool_output: { hits: [] } },
			host,
		}),
		{ kind: "none" }
	);
	// `fail_open` returns an availability envelope with no roster: passing it
	// through is what lets the model see why the call failed.
	assert.deepEqual(
		await runHook("agent-comms.directory", {
			ctx: {
				tool_name: "agents.directory",
				tool_output: { available: false, error: "endpoint not reachable" },
			},
			host,
		}),
		{ kind: "none" }
	);
});

test("the consent request stays scoped to the local directory and declared capabilities", () => {
	assert.deepEqual(manifest.permission_grants, [
		"tool:execute",
		"storage:kv",
		"tool:http-egress:127.0.0.1",
	]);

	const directory = manifest.runnables.find(
		(runnable) => runnable.config?.slug === "agents.directory"
	)?.config;
	assert.ok(directory);
	assert.deepEqual(
		{
			backend: directory.backend,
			method: directory.method,
			url: directory.url,
			secret_headers: directory.secret_headers,
			fail_open: directory.fail_open,
			unwrap_body: directory.unwrap_body,
		},
		{
			backend: "http",
			method: "GET",
			url: "core:/api/agents",
			secret_headers: { Authorization: "Bearer env:RYU_TOKEN" },
			fail_open: true,
			unwrap_body: true,
		}
	);
	assert.equal(
		manifest.permission_grants.some((grant) => /run[-:]agent/i.test(grant)),
		false,
		"messages are queued locally and must not gain an agent-run capability"
	);
});

test("send, delivery, and thread readback share exact local storage payloads", async () => {
	const inboxKey = "inbox:review%3Aalpha";
	const threadKey = "thread:planner|review%3Aalpha";
	const { host, kv, calls, casAttempts } = makeHost();
	const sent = await runTool("agents.send", {
		input: { to: "review:alpha", text: "Verify the release artifact." },
		caller: { agent_id: "planner", conversation_id: "conv-planner" },
		host,
	});
	const message = {
		id: "m1",
		seq: 1,
		from: "planner",
		from_conversation: "conv-planner",
		to: "review:alpha",
		text: "Verify the release artifact.",
		hops: 1,
		reply_to: null,
	};
	const inboxJson = JSON.stringify([message]);
	const historyJson = JSON.stringify([
		{
			seq: 1,
			from: "planner",
			to: "review:alpha",
			text: "Verify the release artifact.",
		},
	]);

	assert.deepEqual(sent, {
		ok: true,
		id: "m1",
		from: "planner",
		to: "review:alpha",
		hops: 1,
		queued: 1,
		delivery:
			"queued — it is injected at the start of the recipient's next turn. Nothing wakes an idle agent; continue in your own turn when you need a response.",
	});
	assert.equal(kv.get(inboxKey), inboxJson);
	assert.equal(kv.get(threadKey), historyJson);
	assert.deepEqual(casAttempts, [
		{ key: "seq", expected: null, value: "1" },
		{ key: inboxKey, expected: null, value: inboxJson },
		{ key: threadKey, expected: null, value: historyJson },
	]);
	assert.deepEqual(
		calls,
		[],
		"agents.send queues a message; it does not start another agent run"
	);

	const delivered = await runHook("agent-comms.deliver", {
		ctx: { agent_id: "review:alpha", conversation_id: "conv-review" },
		host,
	});
	assert.equal(delivered.kind, "inject");
	assert.match(delivered.text, /from planner \(message m1\)/);
	assert.match(delivered.text, /Verify the release artifact\./);
	assert.equal(kv.has(inboxKey), false);
	assert.equal(kv.get("hops.conv:conv-review"), "1");

	const readback = await runTool("agents.thread", {
		input: { with: "planner" },
		caller: { agent_id: "review:alpha" },
		host,
	});
	assert.deepEqual(readback, {
		ok: true,
		agent: "review:alpha",
		with: "planner",
		messages: [
			{
				seq: 1,
				from: "planner",
				to: "review:alpha",
				text: "Verify the release artifact.",
			},
		],
		count: 1,
	});
	assert.deepEqual(casAttempts.at(-1), {
		key: inboxKey,
		expected: inboxJson,
		value: null,
	});
	assert.deepEqual([...kv.keys()].sort(), [
		"hops.conv:conv-review",
		"seq",
		threadKey,
	]);
	assert.deepEqual(
		calls,
		[],
		"the local round trip does not invoke a live agent"
	);
});

test("hop context ends with the turn that delivered it", async () => {
	const { host, kv } = makeHost({
		storage: {
			"inbox:scout": JSON.stringify([
				{ id: "m4", from: "planner", text: "here is the answer", hops: 2 },
			]),
		},
	});
	const ctx = { agent_id: "scout", conversation_id: "conv-a" };
	const delivered = await runHook("agent-comms.deliver", { ctx, host });
	assert.equal(delivered.kind, "inject");
	assert.equal(kv.get("hops.conv:conv-a"), "2");
	const relay = await runTool("agents.send", {
		input: { to: "planner", text: "and one more thing" },
		caller: { agent_id: "scout", conversation_id: "conv-a" },
		host,
	});
	assert.equal(relay.refused, "hop_limit", "the delivering turn is capped");

	// The user's next turn delivers no mail, so its send starts a fresh chain.
	assert.deepEqual(await runHook("agent-comms.deliver", { ctx, host }), {
		kind: "none",
	});
	assert.equal(kv.has("hops.conv:conv-a"), false);
	const fresh = await runTool("agents.send", {
		input: { to: "planner", text: "new task from the user" },
		caller: { agent_id: "scout", conversation_id: "conv-a" },
		host,
	});
	assert.equal(fresh.ok, true);
	assert.equal(fresh.hops, 1);
});

test("a lost inbox compare-and-set leaves no hop context", async () => {
	const { host, kv } = makeHost({
		storage: {
			"inbox:scout": JSON.stringify([
				{ id: "m5", from: "planner", text: "queued", hops: 2 },
			]),
		},
		casConflicts: 1,
	});
	const ctx = { agent_id: "scout", conversation_id: "conv-b" };
	assert.deepEqual(await runHook("agent-comms.deliver", { ctx, host }), {
		kind: "none",
	});
	assert.equal(kv.has("hops.conv:conv-b"), false);
	assert.equal(kv.has("inbox:scout"), true);
});

test("delivery retries an inbox snapshot after a compare-and-set conflict", async () => {
	const inboxKey = "inbox:scout";
	const inboxJson = JSON.stringify([
		{ id: "m7", from: "ryu", text: "keep this message", hops: 1 },
	]);
	const { host, kv, casAttempts } = makeHost({
		storage: { [inboxKey]: inboxJson },
		casConflicts: 1,
	});
	const ctx = { agent_id: "scout", conversation_id: "conv-scout" };

	assert.deepEqual(await runHook("agent-comms.deliver", { ctx, host }), {
		kind: "none",
	});
	assert.equal(
		kv.get(inboxKey),
		inboxJson,
		"a lost compare-and-set must leave the message available for retry"
	);

	const delivered = await runHook("agent-comms.deliver", { ctx, host });
	assert.equal(delivered.kind, "inject");
	assert.match(delivered.text, /keep this message/);
	assert.equal(kv.has(inboxKey), false);
	assert.equal(casAttempts.length, 2);
	assert.deepEqual(
		await runHook("agent-comms.deliver", { ctx, host }),
		{ kind: "none" },
		"the message is injected only after the snapshot is claimed"
	);
});

test("refused hop persistence retains queued messages and concurrent appends for retry", async () => {
	const inboxKey = "inbox:scout";
	const first = {
		id: "m1",
		from: "planner",
		text: "Original queued message",
		hops: 2,
	};
	const appended = {
		id: "m2",
		from: "reviewer",
		text: "Concurrent queued message",
		hops: 3,
	};
	const { host, kv, casAttempts, calls } = makeHost({
		storage: { [inboxKey]: JSON.stringify([first]) },
	});
	const originalSet = host.storage.set;
	let refuse = true;
	host.storage.set = async (key, value) => {
		if (refuse) {
			refuse = false;
			assert.equal(key, "hops.conv:conv-scout");
			assert.equal(value, "2");
			kv.set(inboxKey, JSON.stringify([first, appended]));
			throw new Error("Hop persistence refused");
		}
		return originalSet(key, value);
	};
	const ctx = { agent_id: "scout", conversation_id: "conv-scout" };
	await assert.rejects(
		runHook("agent-comms.deliver", { ctx, host }),
		/Hop persistence refused/
	);
	assert.equal(kv.get(inboxKey), JSON.stringify([first, appended]));
	assert.deepEqual(
		casAttempts,
		[],
		"refused preparation never consumes or restores inbox state"
	);
	const delivered = await runHook("agent-comms.deliver", { ctx, host });
	assert.equal(delivered.kind, "inject");
	assert.match(delivered.text, /Original queued message/);
	assert.match(delivered.text, /Concurrent queued message/);
	assert.equal(kv.get("hops.conv:conv-scout"), "3");
	assert.equal(kv.has(inboxKey), false);
	assert.deepEqual(casAttempts, [
		{ key: inboxKey, expected: JSON.stringify([first, appended]), value: null },
	]);
	assert.deepEqual(await runHook("agent-comms.deliver", { ctx, host }), {
		kind: "none",
	});
	assert.deepEqual(calls, []);
});

for (const snapshot of ["broken-json", "[]", "{}"]) {
	test(`cleanup preserves concurrent valid inbox replacing ${snapshot}`, async () => {
		const inboxKey = "inbox:scout";
		const appended = JSON.stringify([
			{ id: "m9", from: "planner", text: "Keep newer valid message", hops: 1 },
		]);
		const { host, kv, casAttempts } = makeHost({
			storage: { [inboxKey]: snapshot },
		});
		const originalCas = host.storage.compareAndSet;
		let replace = true;
		host.storage.compareAndSet = async (key, expected, value) => {
			if (replace) {
				replace = false;
				kv.set(inboxKey, appended);
			}
			return originalCas(key, expected, value);
		};
		const originalDelete = host.storage.delete;
		host.storage.delete = async (key) => {
			if (String(key) === inboxKey) {
				throw new Error("Blind inbox delete is forbidden");
			}
			return originalDelete(key);
		};
		const ctx = { agent_id: "scout", conversation_id: "conv-scout" };
		assert.deepEqual(await runHook("agent-comms.deliver", { ctx, host }), {
			kind: "none",
		});
		assert.equal(kv.get(inboxKey), appended);
		assert.deepEqual(casAttempts, [
			{ key: inboxKey, expected: snapshot, value: null },
		]);
		const delivered = await runHook("agent-comms.deliver", { ctx, host });
		assert.equal(delivered.kind, "inject");
		assert.match(delivered.text, /Keep newer valid message/);
		assert.equal(kv.has(inboxKey), false);
		assert.deepEqual(await runHook("agent-comms.deliver", { ctx, host }), {
			kind: "none",
		});
	});
}
