// Tool body for `agents.react`, run in Core's JS sandbox.
//
// This file is a FRAGMENT, not an ES module: Core splices it into an async IIFE
// (`build_inline_tool_program` in crates/core/tool-exec/src/lib.rs) with `input`
// (the call arguments), `caller` (the DISPATCHING agent, host-derived) and `host`
// (the capability bridge) already bound, and the body `return`s the tool result.
// A top-level `return` is therefore correct here and `export` is not. The
// manifest's `runnables[].config.code` is sealed from this file with
// `node tools/toolsmith/index.mjs sync plugins-store/plugins/reactions`.
//
// Reactions are scoped to the agent's current host conversation. The Core bridge
// supplies that conversation and the agent actor from the dispatch context, so a
// model cannot redirect the reaction to another chat or react as another agent.
// An omitted `message_id` is resolved by Core to the latest user message: the
// model is never shown persisted ids, and acknowledging what the user just said
// is the common case.

const MAX_MESSAGE_ID_BYTES = 200;
const MAX_EMOJI_BYTES = 64;
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const byteLength = (value) => new TextEncoder().encode(value).length;

const messageId = String(input.message_id ?? "").trim();
if (byteLength(messageId) > MAX_MESSAGE_ID_BYTES) {
	throw new Error(
		`agents.react: 'message_id' must be at most ${MAX_MESSAGE_ID_BYTES} bytes`
	);
}

const emoji = String(input.emoji ?? "").trim();
if (emoji === "") {
	throw new Error("agents.react: 'emoji' is required");
}
if (byteLength(emoji) > MAX_EMOJI_BYTES) {
	throw new Error(
		`agents.react: 'emoji' must be at most ${MAX_EMOJI_BYTES} bytes`
	);
}

const agentId = String(caller.agent_id ?? "").trim();
if (!AGENT_ID.test(agentId)) {
	throw new Error("agents.react: the calling agent could not be identified");
}
if (!String(caller.conversation_id ?? "").trim()) {
	throw new Error(
		"agents.react: a current conversation is required to set a reaction"
	);
}

// Core derives the conversation and actor from the dispatch context. Only the
// exact persisted message id (when one was named) and the normalized emoji cross
// the sandbox boundary.
return await host.reactions.add(
	messageId === "" ? { emoji } : { message_id: messageId, emoji }
);
