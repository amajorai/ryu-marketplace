// Tool body for `agents__send`, run in Core's Deno sandbox.
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
// idle agent — that is the documented v1 limit, and `agents__ask` is the path
// for an answer you need now.

const MAX_TEXT = 4000;
const MAX_INBOX = 20;
const MAX_THREAD = 12;
// Hop 1 is a user-initiated message. Hop 2 is the one relay it may cause. A
// third would be an agent chain nobody asked for, and every hop is a real agent
// run on the user's budget — so the chain stops here, deterministically, rather
// than relying on the models involved to lose interest.
const MAX_HOPS = 2;

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
	const next = (await readInt("seq")) + 1;
	await host.storage.set("seq", String(next));
	return next;
}

/** The canonical, order-independent key for a pair's message history. */
function threadKey(a, b) {
	return a < b ? `thread:${a}|${b}` : `thread:${b}|${a}`;
}

const to = String(input.to ?? "").trim();
if (to === "") {
	throw new Error(
		"agents__send: 'to' is required — the id of the agent to message. Call agents__directory to see the agents on this node."
	);
}
const text = String(input.text ?? "").trim();
if (text === "") {
	throw new Error("agents__send: 'text' is required (the message to send)");
}

// WHO IS SENDING IS NOT THE MODEL'S TO SAY. `caller.agent_id` is resolved by
// Core's dispatch, so an agent cannot post as another one by naming it in its
// arguments. `input.from` is honoured only for the agent-less callers (a
// workflow or a monitor step), which have no identity to derive.
const from =
	String(caller.agent_id ?? "").trim() || String(input.from ?? "").trim();
if (from === "") {
	throw new Error(
		"agents__send: the calling agent could not be identified, and no 'from' was supplied"
	);
}
if (from === to) {
	throw new Error(
		`agents__send: '${to}' is the calling agent — a message to yourself is a note, not a message`
	);
}

// How deep this agent already is in a relayed chain: from the conversation it is
// answering in (set by the delivery hook) or, when it is itself running as a
// delegated sub-agent with no conversation, from its agent-scoped marker.
const arrivedByConversation = caller.conversation_id
	? await readInt(`hops.conv:${caller.conversation_id}`)
	: 0;
const arrivedByAgent = await readInt(`hops.agent:${from}`);
const hops = Math.max(arrivedByConversation, arrivedByAgent) + 1;
if (hops > MAX_HOPS) {
	return {
		ok: false,
		refused: "hop_limit",
		hops: hops,
		max_hops: MAX_HOPS,
		error: `agents__send: this message would be hop ${hops} of an agent-to-agent chain and the limit is ${MAX_HOPS}. Answer the user directly instead of relaying further.`,
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
const inboxKey = `inbox:${to}`;
const inbox = await readJson(inboxKey, []);
const nextInbox = (Array.isArray(inbox) ? inbox : []).concat([message]);
await host.storage.set(
	inboxKey,
	JSON.stringify(nextInbox.slice(-MAX_INBOX))
);

// The pair's history, so a later `agents__ask` can carry context and
// `agents__thread` can show what was said.
const tKey = threadKey(from, to);
const thread = await readJson(tKey, []);
const nextThread = (Array.isArray(thread) ? thread : []).concat([
	{ seq: seq, from: from, to: to, text: message.text },
]);
await host.storage.set(tKey, JSON.stringify(nextThread.slice(-MAX_THREAD)));

return {
	ok: true,
	id: id,
	from: from,
	to: to,
	hops: hops,
	queued: nextInbox.slice(-MAX_INBOX).length,
	delivery:
		"queued — it is injected at the start of the recipient's next turn. Nothing wakes an idle agent; use agents__ask when you need the answer now.",
};
