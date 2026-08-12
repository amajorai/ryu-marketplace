// Tool body for `agents__thread`, run in Core's Deno sandbox.
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
	return a < b ? `thread:${a}|${b}` : `thread:${b}|${a}`;
}

const me =
	String(caller.agent_id ?? "").trim() || String(input.from ?? "").trim();
if (me === "") {
	throw new Error(
		"agents__thread: the calling agent could not be identified, and no 'from' was supplied"
	);
}

const peer = String(input.with ?? "").trim();

// No peer named → which agents has this one talked to at all. Derived from the
// key set, so it lists real history rather than the node's whole roster (that is
// what agents__directory is for).
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
		if (pair[0] === me && !peers.includes(pair[1])) {
			peers.push(pair[1]);
		} else if (pair[1] === me && !peers.includes(pair[0])) {
			peers.push(pair[0]);
		}
	}
	return {
		ok: true,
		agent: me,
		peers: peers,
		hint:
			peers.length === 0
				? "No agent-to-agent history yet. agents__directory lists who is on this node."
				: "Call agents__thread again with `with: \"<agent id>\"` to read one of these.",
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
