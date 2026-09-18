// Tool body for `agents.send`, run in Core's Deno sandbox.
//
// This file is a FRAGMENT, not an ES module: Core splices it into an async IIFE
// (`build_inline_tool_program` in crates/core/tool-exec/src/lib.rs) with `input`
// (the call arguments), `caller` (the DISPATCHING agent, host-derived) and `host`
// (the capability bridge) already bound, and the body `return`s the tool result.
// A top-level `return` is therefore correct here and `export` is not. The
// manifest's `runnables[].config.code` is sealed from this file — edit here, then
// reseal (see plugin.test.mjs, which fails on drift).
//
// `send` is the ASYNCHRONOUS half of the mailbox: it drops a message in another
// agent's inbox and returns immediately. The recipient reads it at the start of
// its next turn, injected by the `agent-comms.deliver` hook. Nothing wakes an
// idle agent; callers that need a response should use an ordinary user turn.

const MAX_TEXT = 4000;
const MAX_INBOX = 20;
const MAX_THREAD = 12;
// Hop 1 is a user-initiated message. Hop 2 is the one relay it may cause. A
// third would be an agent chain nobody asked for, and every hop is a real agent
// run on the user's budget — so the chain stops here, deterministically, rather
// than relying on the models involved to lose interest.
const MAX_HOPS = 2;
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_CAS_RETRIES = 8;

function validateAgentId(value, label) {
	const id = String(value ?? "").trim();
	if (!AGENT_ID.test(id)) {
		throw new Error(
			`agents.send: '${label}' must be a bounded agent id from agents.directory`
		);
	}
	return id;
}

function keyPart(value) {
	return encodeURIComponent(value);
}

/** Read a JSON value from plugin KV, or `fallback` when absent/corrupt. */
async function readJson(key, fallback) {
	const raw = await host.storage.get(key);
	if (raw === null || raw === undefined || raw === "") {
		return fallback;
	}
	try {
		const parsed = JSON.parse(String(raw));
		return parsed === null ? fallback : parsed;
	} catch (_e) {
		// A half-written value must not brick the mailbox: treat it as empty.
		return fallback;
	}
}

/** Read a small non-negative integer from plugin KV; 0 when absent/unparseable. */
async function readInt(key) {
	const raw = await host.storage.get(key);
	const n = Number.parseInt(String(raw ?? "0"), 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// Message ids come from a stored counter, not a clock: the sandbox denies
// `Date.now()` (and a tool that reads one is not replayable), so the sequence IS
// the ordering. It is monotonic across every message this node relays.
async function nextSeq() {
	for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt += 1) {
		const raw = await host.storage.get("seq");
		const current = Number.parseInt(String(raw ?? "0"), 10);
		const next = (Number.isFinite(current) && current > 0 ? current : 0) + 1;
		if (await host.storage.compareAndSet("seq", raw, String(next))) {
			return next;
		}
	}
	throw new Error("agents.send: sequence is busy; retry the message");
}

/** The canonical, order-independent key for a pair's message history. */
function threadKey(a, b) {
	const pair = [a, b].sort().map(keyPart);
	return `thread:${pair[0]}|${pair[1]}`;
}

async function appendJson(key, item, limit) {
	for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt += 1) {
		const raw = await host.storage.get(key);
		const current = await readJson(key, []);
		const next = (Array.isArray(current) ? current : [])
			.concat([item])
			.slice(-limit);
		if (await host.storage.compareAndSet(key, raw, JSON.stringify(next))) {
			return next.length;
		}
	}
	throw new Error(`agents.send: '${key}' is busy; retry the message`);
}

const to = validateAgentId(input.to, "to");
const text = String(input.text ?? "").trim();
if (text === "") {
	throw new Error("agents.send: 'text' is required (the message to send)");
}

// WHO IS SENDING IS NOT THE MODEL'S TO SAY. Agent-less workflows have no
// verified principal, so they fail closed rather than accepting a model-supplied
// `from` identity.
const from = String(caller.agent_id ?? "").trim();
if (from === "") {
	throw new Error("agents.send: the calling agent could not be identified");
}
validateAgentId(from, "from");
if (from === to) {
	throw new Error(
		`agents.send: '${to}' is the calling agent — a message to yourself is a note, not a message`
	);
}

// How deep this agent already is in a relayed chain: from the conversation it is
// answering in (set by the delivery hook) or, when it is itself running as a
// delegated sub-agent with no conversation, from its agent-scoped marker.
	const arrivedByConversation = caller.conversation_id
	? await readInt(`hops.conv:${keyPart(caller.conversation_id)}`)
	: 0;
	const arrivedByAgent = await readInt(`hops.agent:${keyPart(from)}`);
const hops = Math.max(arrivedByConversation, arrivedByAgent) + 1;
if (hops > MAX_HOPS) {
	return {
		ok: false,
		refused: "hop_limit",
		hops: hops,
		max_hops: MAX_HOPS,
		error: `agents.send: this message would be hop ${hops} of an agent-to-agent chain and the limit is ${MAX_HOPS}. Answer the user directly instead of relaying further.`,
	};
}

const seq = await nextSeq();
const id = `m${seq}`;
const message = {
	id: id,
	seq: seq,
	from: from,
	from_conversation: caller.conversation_id ?? null,
	to: to,
	text: text.slice(0, MAX_TEXT),
	hops: hops,
	reply_to: input.reply_to ? String(input.reply_to) : null,
};

// The inbox is per-AGENT, not per-conversation: a message addressed to an agent
// is delivered in whichever of its conversations runs next. Capped, oldest
// dropped — an undelivered backlog is not worth an unbounded KV value.
const inboxKey = `inbox:${keyPart(to)}`;
const queued = await appendJson(inboxKey, message, MAX_INBOX);

// The pair's history, so `agents.thread` can show what was said.
const tKey = threadKey(from, to);
await appendJson(
	tKey,
	{ seq: seq, from: from, to: to, text: message.text },
	MAX_THREAD
);

return {
	ok: true,
	id: id,
	from: from,
	to: to,
	hops: hops,
	queued: queued,
	delivery:
		"queued — it is injected at the start of the recipient's next turn. Nothing wakes an idle agent; continue in your own turn when you need a response.",
};
