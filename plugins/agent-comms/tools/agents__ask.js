// Tool body for `agents__ask`, run in Core's Deno sandbox.
//
// This file is a FRAGMENT, not an ES module: Core splices it into an async IIFE
// (`build_inline_tool_program` in crates/core/tool-exec/src/lib.rs) with `input`,
// `caller` (the DISPATCHING agent, host-derived) and `host` bound, and the body
// `return`s the tool result. The manifest's `runnables[].config.code` is sealed
// from this file — edit here, then reseal (plugin.test.mjs fails on drift).
//
// `ask` is the SYNCHRONOUS half of the mailbox: the addressed agent runs now, in
// a clean context, and its answer comes back as this tool's result. It is
// `host.runAgent` — the delegation engine — addressed by agent id, with the pair's
// own message history carried in, which is the difference between "delegate a
// subtask" and "ask a colleague who remembers the last thing you asked".

const MAX_TEXT = 4000;
const MAX_THREAD = 12;
const MAX_HISTORY_CHARS = 2000;
const HISTORY_TURNS = 6;
const MAX_HOPS = 2;
// A `busy` marker is only meaningful while the run that wrote it is in flight.
// If a process dies mid-ask the marker survives, and there are two ways out —
// both needed, because the first is instant and the second is the backstop:
//
//   1. OWNERSHIP. A marker records who wrote it. An agent that meets its OWN
//      marker is meeting the wreckage of its own dead ask (a turn runs its tool
//      calls one at a time, so it cannot legitimately be blocked on itself), and
//      clears it. That covers the common case with no waiting at all.
//   2. AGE. A marker written by a DIFFERENT agent expires by distance in the
//      attempt counter, which every ask — including a refused one — advances. So
//      even a foreign stale marker ages out instead of wedging the pair forever.
const BUSY_STALE_AFTER = 25;

async function readJson(key, fallback) {
	const raw = await host.storage.get(key);
	if (raw === null || raw === undefined || raw === "") {
		return fallback;
	}
	try {
		const parsed = JSON.parse(String(raw));
		return parsed === null ? fallback : parsed;
	} catch (_e) {
		return fallback;
	}
}

async function readInt(key) {
	const raw = await host.storage.get(key);
	const n = Number.parseInt(String(raw ?? "0"), 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

async function nextSeq() {
	const next = (await readInt("seq")) + 1;
	await host.storage.set("seq", String(next));
	return next;
}

function threadKey(a, b) {
	return a < b ? `thread:${a}|${b}` : `thread:${b}|${a}`;
}

const to = String(input.to ?? "").trim();
if (to === "") {
	throw new Error(
		"agents__ask: 'to' is required — the id of the agent to ask. Call agents__directory to see the agents on this node."
	);
}
const question = String(input.question ?? "").trim();
if (question === "") {
	throw new Error("agents__ask: 'question' is required");
}
const from =
	String(caller.agent_id ?? "").trim() || String(input.from ?? "").trim();
if (from === "") {
	throw new Error(
		"agents__ask: the calling agent could not be identified, and no 'from' was supplied"
	);
}
if (from === to) {
	throw new Error(
		`agents__ask: '${to}' is the calling agent — asking yourself is just thinking, do it directly`
	);
}

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
		error: `agents__ask: this would be hop ${hops} of an agent-to-agent chain and the limit is ${MAX_HOPS}. Answer with what you have instead of asking another agent.`,
	};
}

// CYCLE GUARD. `ask` blocks on a real agent run, so A→B→A is not slow, it is a
// deadlocked pair burning two model budgets. Both ends are marked busy for the
// duration: the target (it is running) and the asker (it is waiting), so the
// nested call back up the chain is refused instead of started. The hop limit
// bounds depth; this bounds the *shape*.
//
// The counter is advanced FIRST, before the check can refuse: a refusal that
// returned early would leave the sequence where it was, so a retry would compare
// identical numbers forever and a stale marker could never age out.
const askSeq = await nextSeq();

/** The `{seq, by}` marker at `key`, or null when absent or unreadable. */
async function readBusy(key) {
	const raw = await host.storage.get(key);
	if (raw === null || raw === undefined || raw === "") {
		return null;
	}
	try {
		const parsed = JSON.parse(String(raw));
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch (_e) {
		return null;
	}
}

const busyTarget = await readBusy(`busy:${to}`);
if (
	busyTarget !== null &&
	busyTarget.by !== from &&
	askSeq - Number(busyTarget.seq ?? 0) < BUSY_STALE_AFTER
) {
	return {
		ok: false,
		refused: "cycle",
		error: `agents__ask: '${to}' is already handling a request higher up this same chain. Use agents__send to leave it a message instead of waiting on it.`,
	};
}

const tKey = threadKey(from, to);
const thread = await readJson(tKey, []);
const history = (Array.isArray(thread) ? thread : []).slice(-HISTORY_TURNS);
let historyText = "";
if (history.length > 0) {
	const lines = history.map((m) => `${m.from} → ${m.to}: ${m.text}`);
	historyText = `\n\nWhat the two of you have said before (oldest first):\n${lines
		.join("\n")
		.slice(-MAX_HISTORY_CHARS)}`;
}

// The peer runs with a CLEAN context — it cannot see the asker's conversation —
// so everything it needs is in this task text. That is the same isolation
// `delegate__fanout` gives a subtask, and the reason the pair history above is
// carried in explicitly rather than assumed.
const task = [
	`You are the agent "${to}". Another agent on this node, "${from}", is asking you something directly — this is agent-to-agent, not a user turn.`,
	`Answer as yourself, using your own tools and knowledge. Reply with the answer only: no preamble, no restating the question.`,
	`If you cannot answer, say so plainly and say what you would need.`,
	historyText,
	`\n\nQuestion from ${from}:\n${question.slice(0, MAX_TEXT)}`,
].join("\n");

// Claim only what is not already claimed, and release only what was claimed
// HERE. A nested ask (B→C inside A→B) must not delete the marker A is relying
// on: whoever wrote a marker is the only one who may remove it.
const claimed = [];
async function claim(key) {
	const existing = await readBusy(key);
	if (existing !== null && existing.by !== from) {
		return;
	}
	await host.storage.set(key, JSON.stringify({ seq: askSeq, by: from }));
	claimed.push(key);
}
await claim(`busy:${to}`);
await claim(`busy:${from}`);
// The peer runs as a delegated agent with no conversation of its own, so its own
// hop depth has to travel on an agent-scoped key — otherwise a tool it calls
// mid-answer would read a depth of zero and the chain would be unbounded.
await host.storage.set(`hops.agent:${to}`, String(hops));

let reply = null;
let failure = null;
try {
	const out = await host.runAgent({
		task: task,
		agent_id: to,
		wall_time_secs: input.wall_time_secs,
	});
	reply = typeof out === "string" ? out : JSON.stringify(out);
} catch (e) {
	failure = String((e && e.message) || e);
} finally {
	for (const key of claimed) {
		await host.storage.delete(key);
	}
	await host.storage.delete(`hops.agent:${to}`);
}

if (failure !== null) {
	return {
		ok: false,
		from: from,
		to: to,
		error: `agents__ask: '${to}' did not answer: ${failure}`,
	};
}

// Both halves land in the pair's history, so the next ask carries this exchange
// and `agents__thread` shows a conversation rather than a list of questions.
const answerSeq = await nextSeq();
const nextThread = (Array.isArray(thread) ? thread : []).concat([
	{ seq: askSeq, from: from, to: to, text: question.slice(0, MAX_TEXT) },
	{
		seq: answerSeq,
		from: to,
		to: from,
		text: String(reply ?? "").slice(0, MAX_TEXT),
	},
]);
await host.storage.set(tKey, JSON.stringify(nextThread.slice(-MAX_THREAD)));

return {
	ok: true,
	from: from,
	to: to,
	hops: hops,
	question: question.slice(0, MAX_TEXT),
	reply: String(reply ?? ""),
};
