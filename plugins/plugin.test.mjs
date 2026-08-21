import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname);
const manifest = JSON.parse(
	await readFile(path.join(ROOT, "manifest.json"), "utf8")
);

async function hydratedHook() {
	const hook = manifest.contributes.turn_hooks.find(
		(entry) => entry.id === "usage-pacer.select"
	);
	return {
		...hook,
		code: await readFile(path.join(ROOT, hook.code_file), "utf8"),
	};
}

async function runHook(
	ctx,
	{ rules, windows, enabled = "true", mode = "threshold" }
) {
	const hook = await hydratedHook();
	const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
	const host = {
		async getPreference({ key }) {
			if (key === "usage-pacer-enabled") {
				return enabled;
			}
			if (key === "usage-pacer-mode") {
				return mode;
			}
			if (key === "usage-pacer-rules") {
				return JSON.stringify(rules);
			}
			return null;
		},
		async usage() {
			return { available: true, windows };
		},
	};
	return new AsyncFunction("ctx", "host", hook.code)(ctx, host);
}

function weeklyWindow({ used = 0, resetAfterMinutes = 7 * 24 * 60 }) {
	return {
		used_percent: used,
		window_seconds: 7 * 24 * 60 * 60,
		resets_at: new Date(
			Date.now() + resetAfterMinutes * 60 * 1000
		).toISOString(),
	};
}

function context(model, agentId = "acp:claude") {
	return { agent_id: agentId, event: { model } };
}

test("declares the reverse upgrade ladder in the settings schema", () => {
	const field = manifest.contributes.settings_tabs[0].fields.find(
		(entry) => entry.pref_key === "usage-pacer-rules"
	);
	const defaults = JSON.parse(field.default);

	assert.equal(manifest.version, "0.2.0");
	assert.ok(Array.isArray(defaults.global.upgrade_ladder));
	assert.ok(Array.isArray(defaults.agents["acp:claude"].upgrade_ladder));
	assert.deepEqual(defaults.global.upgrade_ladder[0], {
		from: "sonnet",
		remaining: 20,
		model: "opus",
	});
});

test("keeps the original used-percent fallback ladder working", async () => {
	const directive = await runHook(context("opus"), {
		rules: {
			global: {
				windows: "weekly",
				ladder: [{ from: "opus", at: 50, model: "sonnet" }],
			},
		},
		windows: [weeklyWindow({ used: 60 })],
	});

	assert.equal(directive.kind, "select_model");
	assert.equal(directive.model, "sonnet");
	assert.match(directive.reason, /60% used/);
});

test("upgrades to a stronger model when remaining quota crosses the threshold", async () => {
	const directive = await runHook(context("sonnet"), {
		rules: {
			global: {
				windows: "weekly",
				upgrade_ladder: [{ from: "sonnet", remaining: 25, model: "opus" }],
			},
		},
		windows: [weeklyWindow({ used: 80 })],
	});

	assert.equal(directive.kind, "select_model");
	assert.equal(directive.model, "opus");
	assert.match(directive.reason, /quota escalation active/);
});

test("applies an ACP fast-mode option without changing the current model", async () => {
	const directive = await runHook(context("opus"), {
		rules: {
			global: {
				windows: "weekly",
				upgrade_ladder: [
					{
						from: "opus",
						within_minutes: 1440,
						acp_config: { fast_mode: "true" },
					},
				],
			},
		},
		windows: [weeklyWindow({ used: 60, resetAfterMinutes: 60 })],
	});

	assert.deepEqual(directive.acp_config, { fast: "true" });
	assert.equal(directive.model, "opus");
});

test("lets an active end-of-window rule win over the fallback ladder", async () => {
	const directive = await runHook(context("opus"), {
		rules: {
			global: {
				windows: "weekly",
				ladder: [
					{ from: "opus", at: 50, model: "sonnet" },
					{ from: "sonnet", at: 75, model: "haiku" },
				],
				upgrade_ladder: [
					{ from: "opus", remaining: 25, acp_config: { fast_mode: "true" } },
				],
			},
		},
		windows: [weeklyWindow({ used: 80, resetAfterMinutes: 30 })],
	});

	assert.equal(directive.model, "opus");
	assert.deepEqual(directive.acp_config, { fast: "true" });
});

test("does not downgrade when an active upgrade already targets the current model", async () => {
	const directive = await runHook(context("opus"), {
		rules: {
			global: {
				windows: "weekly",
				ladder: [{ from: "opus", at: 50, model: "sonnet" }],
				upgrade_ladder: [{ from: "opus", remaining: 25, model: "opus" }],
			},
		},
		windows: [weeklyWindow({ used: 80 })],
	});

	assert.deepEqual(directive, { kind: "none" });
});

test("maps the readable fast_mode key to Codex ACP's advertised option id", async () => {
	const directive = await runHook(context("gpt-5.5", "acp:codex"), {
		rules: {
			global: {
				windows: "weekly",
				upgrade_ladder: [
					{
						from: "gpt-5.5",
						within_minutes: 1440,
						acp_config: { fast_mode: "true" },
					},
				],
			},
		},
		windows: [weeklyWindow({ used: 60, resetAfterMinutes: 60 })],
	});

	assert.deepEqual(directive.acp_config, { "fast-mode": "true" });
});

test("chains a one-day model upgrade and a one-hour effort upgrade", async () => {
	const directive = await runHook(context("sonnet"), {
		rules: {
			global: {
				windows: "weekly",
				upgrade_ladder: [
					{ from: "sonnet", remaining: 25, model: "opus" },
					{
						from: "opus",
						within_minutes: 1440,
						acp_config: { fast_mode: "true" },
					},
					{ from: "opus", within_minutes: 60, effort: "high" },
				],
			},
		},
		windows: [weeklyWindow({ used: 80, resetAfterMinutes: 30 })],
	});

	assert.equal(directive.model, "opus");
	assert.equal(directive.effort, "high");
	assert.deepEqual(directive.acp_config, { fast: "true" });
});

test("does not fire a reset countdown before its boundary", async () => {
	const directive = await runHook(context("opus"), {
		rules: {
			global: {
				windows: "weekly",
				upgrade_ladder: [
					{
						from: "opus",
						within_minutes: 60,
						acp_config: { fast_mode: "true" },
					},
				],
			},
		},
		windows: [weeklyWindow({ used: 10, resetAfterMinutes: 120 })],
	});

	assert.deepEqual(directive, { kind: "none" });
});

test("fails closed when usage is unavailable", async () => {
	const hook = await hydratedHook();
	const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
	const directive = await new AsyncFunction("ctx", "host", hook.code)(
		context("sonnet"),
		{
			async getPreference({ key }) {
				if (key === "usage-pacer-enabled") {
					return "true";
				}
				if (key === "usage-pacer-rules") {
					return JSON.stringify({
						global: { upgrade_ladder: [{ remaining: 25, model: "opus" }] },
					});
				}
				return "threshold";
			},
			async usage() {
				return { available: false, windows: [] };
			},
		}
	);

	assert.deepEqual(directive, { kind: "none" });
});
