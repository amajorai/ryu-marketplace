// Tool body for `workflow.script`, run in Core's JS sandbox.
//
// This file is a FRAGMENT, not an ES module: Core splices it into an async IIFE
// with `input` (the call arguments) and `host` (the capability bridge) already
// bound, and the body `return`s the tool's result. A top-level `return` is
// therefore correct here and `export` is not.
//
// It must be a PURE function of `input` plus whatever `host.*` returns: no
// `Date.now()`, no `Math.random()`, no ambient clock or environment. Everything
// variable arrives as an argument. `node tools/toolsmith/index.mjs verify`
// enforces that both statically and by running every case twice.
//
// The script itself never runs here: Core stores it as a durable workflow run
// and executes it in its own sandbox, checkpointing every finished agent() call.

function primitiveStringAdmitted(raw) {
	try {
		return String.prototype.valueOf.call(raw) === raw;
	} catch {
		return false;
	}
}

const MAX_SCRIPT_CHARS = 262_144;
const MAX_WAIT_SECS = 540;
const presets = new Set(["research", "code_read", "code_write", "summarise"]);

const args = input ?? {};
const waitSecs = args.wait_secs ?? 300;
if (!Number.isInteger(waitSecs) || waitSecs < 0 || waitSecs > MAX_WAIT_SECS) {
	throw new Error(
		`workflow.script: 'wait_secs' must be an integer from 0 to ${MAX_WAIT_SECS}`
	);
}

function describe(summary) {
	if (!summary || Object(summary) !== summary || !primitiveStringAdmitted(summary.run_id)) {
		throw new Error("workflow.script: Core returned an invalid run summary");
	}
	const notes = {
		running:
			"Still running. Call workflow.script again with this run_id to keep waiting.",
		waiting:
			"Paused by a provider rate, usage, or session limit. It resumes on its own at resume_at; finished agents are kept.",
		awaiting_input: "Waiting for a person to respond before it can continue.",
		failed:
			"Failed. Call workflow.script again with the same script and args to continue from the agents that already finished.",
		completed: "Finished.",
	};
	return { ...summary, note: notes[summary.status] ?? "" };
}

if (args.run_id !== undefined) {
	if (!primitiveStringAdmitted(args.run_id) || args.run_id.trim().length === 0) {
		throw new Error("workflow.script: 'run_id' must be a non-empty string");
	}
	if (args.script !== undefined) {
		throw new Error("workflow.script: pass either 'script' or 'run_id', not both");
	}
	return describe(
		await host.workflows.status({ run_id: args.run_id.trim(), wait_secs: waitSecs })
	);
}

if (!primitiveStringAdmitted(args.script) || args.script.trim().length === 0) {
	throw new Error("workflow.script: 'script' must be a non-empty string");
}
if (args.script.length > MAX_SCRIPT_CHARS) {
	throw new Error(`workflow.script: 'script' exceeds ${MAX_SCRIPT_CHARS} characters`);
}
if (args.preset !== undefined && !presets.has(args.preset)) {
	throw new Error("workflow.script: unknown 'preset'");
}
if (
	args.run_key !== undefined &&
	(!primitiveStringAdmitted(args.run_key) ||
		args.run_key.trim().length === 0 ||
		args.run_key.length > 128)
) {
	throw new Error("workflow.script: 'run_key' must be 1-128 characters");
}

const request = {
	script: args.script,
	args: args.args ?? null,
	wait_secs: waitSecs,
};
if (args.preset !== undefined) request.preset = args.preset;
if (args.run_key !== undefined) request.run_key = args.run_key.trim();

return describe(await host.workflows.script(request));
