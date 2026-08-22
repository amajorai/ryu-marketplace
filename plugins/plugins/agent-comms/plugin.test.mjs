// Co-located, zero-dependency test for the `agent-comms` plugin.
// Run with:  node --test plugins-store/plugins/agent-comms/plugin.test.mjs
//
// The plugin is five bodies — three `inline_deno` tools and two turn hooks — that
// Core splices into a sandbox with a fixed set of injected globals. This test
// reproduces each splice exactly (`input`/`caller`/`host` for a tool,
// `ctx`/`host` for a hook), runs the real body against an in-memory KV, and
// asserts the outcome. Nothing here edits manifest.json.
//
// The load-bearing cases are the bounds, because this plugin must not create
// unrequested agent work: the hop limit and refusal to address yourself. Each
// has a test that fails if the guard is removed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const raw = readFileSync(MANIFEST_PATH, "utf8");
const manifest = JSON.parse(raw);

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
function makeHost({ storage = {}, runAgent = async () => "ok" } = {}) {
	const kv = new Map(Object.entries(storage));
	const calls = [];
	return {
		kv,
		calls,
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
						typeof value === "string" ? value : JSON.stringify(value)
					);
					return true;
				},
				delete: async (key) => kv.delete(String(key)),
				keys: async () => [...kv.keys()],
			},
			log: () => {},
		},
	};
}

const inboxOf = (kv, agent) => JSON.parse(kv.get(`inbox:${agent}`) ?? "[]");

// ── manifest contract ─────────────────────────────────────────────────────────

test("every tool is routable, callable, and sealed from its source file", () => {
	assert.equal(manifest.id, "@ryu/agent-comms");
	// `tool:execute` is what makes an `inline_deno` tool callable at all: without
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
		if (config.backend === "inline_deno") {
			assert.ok(config.code.length > 0, `${config.slug} has an empty body`);
		}
	}

	// The drift check, inlined rather than imported from seal.mjs so this file
	// stays runnable on its own: `tools/<slug>.js` is the source form and the
	// manifest's `code` is the wire form, and an edited-but-unsealed body would
	// otherwise ship as whatever the manifest last captured.
	for (const runnable of manifest.runnables) {
		if (runnable.config.backend !== "inline_deno") {
			continue;
		}
		const source = readFileSync(
			join(HERE, "tools", `${runnable.config.slug}.js`),
			"utf8"
		);
		assert.equal(
			runnable.config.code,
			source,
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

	const inbox = inboxOf(kv, "scout");
	assert.equal(inbox.length, 1);
	assert.equal(inbox[0].text, "the deploy finished");
	assert.equal(inbox[0].from, "ryu");
	// The pair history is written from the same call for agents.thread.
	assert.ok(kv.has("thread:ryu|scout"));
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

test("an agent-less caller may still name itself", async () => {
	// Workflows, monitors and recipes dispatch with no agent at all; Core injects
	// nulls. Refusing them outright would make the tool unusable from a workflow
	// step, so `from` is honoured exactly there.
	const { host, kv } = makeHost();
	const result = await runTool("agents.send", {
		input: { to: "scout", text: "nightly run failed", from: "monitors" },
		host,
	});
	assert.equal(result.ok, true);
	assert.equal(inboxOf(kv, "scout")[0].from, "monitors");
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
		/'to' is required/
	);
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

test("the delivery hook is a single KV read on the common path", async () => {
	// It runs on EVERY turn (there is no cheap `match` for an agent-keyed inbox),
	// so the empty case has to stay one read and no writes.
	const { host, kv } = makeHost();
	let reads = 0;
	const counting = {
		...host,
		storage: {
			...host.storage,
			get: async (key) => {
				reads += 1;
				return host.storage.get(key);
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
	assert.equal(reads, 1);
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
