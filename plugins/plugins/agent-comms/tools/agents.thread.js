// Tool body for `agents.thread`, run in Core's Deno sandbox.
//
// This file is a FRAGMENT, not an ES module: Core splices it into an async IIFE
// (`build_inline_tool_program` in crates/core/tool-exec/src/lib.rs) with `input`,
// `caller` and `host` bound, and the body `return`s the tool result. The
// manifest's `runnables[].config.code` is sealed from this file — edit here, then
// reseal (plugin.test.mjs fails on drift).
//
// Reading is scoped to the CALLING agent's own threads, and that is the whole
// security posture of this tool: `caller.agent_id` is host-derived, so a `with`
// the model writes can only ever name the OTHER end of one of its own
// conversations. There is deliberately no "read agent X's mailbox" argument.

const MAX_MESSAGES = 12;
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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

function threadKey(a, b) {
	const pair = [a, b].sort().map((value) => encodeURIComponent(value));
	return `thread:${pair[0]}|${pair[1]}`;
}

const me = String(caller.agent_id ?? "").trim();
if (!AGENT_ID.test(me)) {
	throw new Error("agents.thread: the calling agent could not be identified");
}

const peer = String(input.with ?? "").trim();
if (peer !== "" && !AGENT_ID.test(peer)) {
	throw new Error("agents.thread: 'with' must be a bounded agent id");
}

// No peer named → which agents has this one talked to at all. Derived from the
// key set, so it lists real history rather than the node's whole roster (that is
// what agents.directory is for).
if (peer === "") {
	const keys = await host.storage.keys();
	const peers = [];
	for (const key of Array.isArray(keys) ? keys : []) {
		const k = String(key);
		if (!k.startsWith("thread:")) {
			continue;
		}
		const pair = k.slice("thread:".length).split("|");
		if (pair.length !== 2) {
			continue;
		}
		const decoded = pair.map((value) => decodeURIComponent(value));
		if (decoded[0] === me && !peers.includes(decoded[1])) {
			peers.push(decoded[1]);
		} else if (decoded[1] === me && !peers.includes(decoded[0])) {
			peers.push(decoded[0]);
		}
	}
	return {
		ok: true,
		agent: me,
		peers: peers,
		hint:
			peers.length === 0
				? "No agent-to-agent history yet. agents.directory lists who is on this node."
				: "Call agents.thread again with `with: \"<agent id>\"` to read one of these.",
	};
}

const messages = await readJson(threadKey(me, peer), []);
const rows = (Array.isArray(messages) ? messages : []).slice(-MAX_MESSAGES);

return {
	ok: true,
	agent: me,
	with: peer,
	messages: rows.map((m) => ({
		seq: m.seq ?? null,
		from: m.from ?? null,
		to: m.to ?? null,
		text: String(m.text ?? ""),
	})),
	count: rows.length,
};
