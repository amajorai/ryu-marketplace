// Tool body for `workflow__run`, run in Core's Deno sandbox.
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

const tasks = input && input.tasks;
if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 20) {
	throw new Error("workflow__run: 'tasks' must contain 1-20 delegate tasks");
}

const presets = new Set(["research", "code_read", "summarise"]);
const ids = new Set();
const delegates = tasks.map((task, index) => {
	if (!task || typeof task !== "object" || Array.isArray(task)) {
		throw new Error(`workflow__run: task ${index + 1} must be an object`);
	}
	if (typeof task.task !== "string" || task.task.trim().length === 0) {
		throw new Error(`workflow__run: task ${index + 1} requires a non-empty 'task'`);
	}
	const id = typeof task.id === "string" && task.id.trim().length > 0
		? task.id.trim()
		: `delegate-${index + 1}`;
	if (ids.has(id)) {
		throw new Error(`workflow__run: duplicate task id '${id}'`);
	}
	ids.add(id);
	if (task.agent_id !== undefined && (typeof task.agent_id !== "string" || task.agent_id.trim().length === 0)) {
		throw new Error(`workflow__run: task ${index + 1} 'agent_id' must be a non-empty string`);
	}
	if (task.preset !== undefined && !presets.has(task.preset)) {
		throw new Error(`workflow__run: task ${index + 1} has an unknown preset`);
	}
	if (task.tools !== undefined && (!Array.isArray(task.tools) || task.tools.some((tool) => typeof tool !== "string"))) {
		throw new Error(`workflow__run: task ${index + 1} 'tools' must be an array of strings`);
	}
	const delegate = {
		id,
		task: task.task.trim(),
		preset: task.preset ?? "code_read",
	};
	if (task.agent_id !== undefined) delegate.agent_id = task.agent_id.trim();
	if (task.system_prompt !== undefined || task.model !== undefined || task.tools !== undefined) {
		if (typeof task.system_prompt !== "string" || task.system_prompt.trim().length === 0) {
			throw new Error(`workflow__run: task ${index + 1} 'system_prompt' must be non-empty`);
		}
		delegate.inline = {
			system_prompt: task.system_prompt?.trim() ?? "",
			...(task.model === undefined ? {} : { model: task.model }),
			...(task.tools === undefined ? {} : { tools: task.tools }),
		};
	}
	return delegate;
});

const caps = {};
for (const [key, minimum, maximum] of [["max_concurrent", 1, 5], ["wall_time_secs", 5, 600], ["max_tokens", 1, 32768]]) {
	if (input[key] !== undefined && (!Number.isInteger(input[key]) || input[key] < minimum || input[key] > maximum)) {
		throw new Error(`workflow__run: '${key}' must be an integer from ${minimum} to ${maximum}`);
	}
	if (input[key] !== undefined) caps[key] = input[key];
}

const response = await host.runFanout({ delegates, caps });
if (!response || response.ok !== true || !Array.isArray(response.results)) {
	throw new Error("workflow__run: host.runFanout returned an invalid response");
}
return { ok: true, count: response.results.length, results: response.results };
