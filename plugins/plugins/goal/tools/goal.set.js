// Tool body for `goal.set`, run in Core's JS sandbox.
//
// This file is a FRAGMENT, not an ES module: Core splices it into an async IIFE
// (`build_inline_tool_program` in crates/core/tool-exec/src/lib.rs) with `input`
// (the model's arguments), `caller` (the dispatching agent, host-derived), and
// `host` (the capability bridge) already bound. A top-level `return` is correct;
// `export` is not. The manifest's wire-form `code` is sealed from this file —
// edit here, then run `node plugins-store/plugins/goal/seal.mjs`.

const MAX_GOAL_LENGTH = 4000;

const primitiveStringAdmitted = (() => {
	const raw = input?.goal;
	try {
		// The native String brand operation accepts only string primitives or
		// boxed strings. Identity rejects boxes without coercing the raw value.
		return String.prototype.valueOf.call(raw) === raw;
	} catch {
		return false;
	}
})();
if (!primitiveStringAdmitted) {
	throw new Error("goal.set: 'goal' is required and must be a string");
}

const goal = input.goal.trim();
if (goal === "") {
	throw new Error("goal.set: 'goal' must not be empty");
}
if (goal.length > MAX_GOAL_LENGTH) {
	throw new Error(
		`goal.set: 'goal' must be ${MAX_GOAL_LENGTH} characters or fewer`
	);
}

// The conversation is resolved by Core's dispatch path, not by the model's
// arguments. This prevents an agent from writing a goal into another chat by
// naming that conversation in its tool input.
const conversationId = String(caller?.conversation_id ?? "").trim();
if (conversationId === "") {
	throw new Error(
		"goal.set: an active conversation is required; goals cannot be set from an agent-less call"
	);
}

await host.storage.set(
	conversationId,
	JSON.stringify({
		condition: goal,
		status: "active",
		started_at: Date.now(),
		turns: 0,
	})
);

return {
	ok: true,
	goal,
	status: "active",
	turns: 0,
	message:
		"Goal set for this conversation. Continue working toward it; the goal judge will evaluate progress after the reply.",
};
