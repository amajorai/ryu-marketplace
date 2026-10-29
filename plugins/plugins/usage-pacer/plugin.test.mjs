import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname);
const manifest = JSON.parse(
	await readFile(path.join(ROOT, "manifest.json"), "utf8")
);
const plugin = JSON.parse(
	await readFile(path.join(ROOT, "plugin.json"), "utf8")
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
	{
		rules,
		windows,
		enabled = "true",
		mode = "threshold",
		hostOverrides = {},
		nowMs = 1_800_000_000_000,
	}
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
		...hostOverrides,
	};
	return new AsyncFunction("ctx", "host", "Date", hook.code)(ctx, host, {
		now: () => nowMs,
		parse: Date.parse,
	});
}

function weeklyWindow({ used = 0, resetAfterMinutes = 7 * 24 * 60 }) {
	return {
		used_percent: used,
		window_seconds: 7 * 24 * 60 * 60,
		resets_at: new Date(
			1_800_000_000_000 + resetAfterMinutes * 60 * 1000
		).toISOString(),
	};
}

function context(model, agentId = "acp:claude") {
	return { agent_id: agentId, event: { model } };
}

test("declares the reverse upgrade ladder in the settings schema", () => {
	assert.equal(manifest.id, "@ryu/usage-pacer");
	assert.equal(manifest.name, "Usage Pacer");
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(manifest.permission_grants, [
		"preferences:read",
		"usage:read",
	]);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.deepEqual(
		[
			manifest.contributes.settings_tabs[0].id,
			manifest.contributes.settings_tabs[0].title,
		],
		["usage-pacer.settings", "Usage pacing"]
	);
	assert.deepEqual(
		manifest.contributes.settings_tabs[0].fields.map((entry) => [
			entry.pref_key,
			entry.label,
			entry.type,
		]),
		[
			[
				"usage-pacer-enabled",
				"Automatically pace and escalate models",
				"toggle",
			],
			["usage-pacer-mode", "Pacing mode", "select"],
			["usage-pacer-rules", "Agent and global ladders", "textarea"],
		]
	);
	assert.deepEqual(
		manifest.contributes.turn_hooks.map(({ id, on, code_file }) => [
			id,
			on,
			code_file,
		]),
		[["usage-pacer.select", "pre_model_select", "hooks/select-model.js"]]
	);

	const field = manifest.contributes.settings_tabs[0].fields.find(
		(entry) => entry.pref_key === "usage-pacer-rules"
	);
	const defaults = JSON.parse(field.default);

	assert.equal(manifest.version, "0.3.0");
	assert.match(field.description, /`providers`/);
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

test("fails closed on a refused usage read and retries the same selection", async () => {
	let attempts = 0;
	const options = {
		rules: {
			global: {
				windows: "weekly",
				ladder: [{ from: "opus", at: 50, model: "sonnet" }],
			},
		},
		windows: [weeklyWindow({ used: 60 })],
		hostOverrides: {
			async usage() {
				attempts += 1;
				if (attempts === 1) {
					throw new Error("usage grant revoked");
				}
				return { available: true, windows: [weeklyWindow({ used: 60 })] };
			},
		},
	};

	assert.deepEqual(await runHook(context("opus"), options), { kind: "none" });
	assert.deepEqual(await runHook(context("opus"), options), {
		kind: "select_model",
		model: "sonnet",
		reason: "60% used; 60% in deficit",
	});
	assert.equal(attempts, 2);
});

test("even pacing spends the deficit tolerance before advancing a ladder rung", async () => {
	const options = {
		rules: {
			global: {
				windows: "weekly",
				pace_deficit: 15,
				ladder: [{ from: "opus", at: 75, model: "sonnet" }],
			},
		},
		windows: [weeklyWindow({ used: 60, resetAfterMinutes: 7 * 24 * 60 })],
	};
	assert.deepEqual(
		await runHook(context("opus"), { ...options, mode: "threshold" }),
		{ kind: "none" }
	);
	assert.equal(
		(await runHook(context("opus"), { ...options, mode: "even" })).model,
		"sonnet"
	);
	assert.deepEqual(
		await runHook(context("opus"), {
			...options,
			mode: "even",
			rules: { global: { ...options.rules.global, pace_deficit: 60 } },
		}),
		{ kind: "none" }
	);
});

test("session and weekly rules ignore high pressure in the other quota window", async () => {
	const session = {
		used_percent: 95,
		window_seconds: 5 * 60 * 60,
		resets_at: "2027-01-15T08:00:00Z",
	};
	const weekly = weeklyWindow({ used: 20 });
	const ladder = [{ from: "opus", at: 90, model: "sonnet" }];
	assert.deepEqual(
		await runHook(context("opus"), {
			rules: { global: { windows: "weekly", ladder } },
			windows: [session, weekly],
		}),
		{ kind: "none" }
	);
	assert.equal(
		(
			await runHook(context("opus"), {
				rules: { global: { windows: "session", ladder } },
				windows: [session, weekly],
			})
		).model,
		"sonnet"
	);
	assert.deepEqual(
		await runHook(context("opus"), {
			rules: { global: { windows: "session", ladder } },
			windows: [weekly],
		}),
		{ kind: "none" }
	);
});

test("matching agent rules override the global ladder and usage is attributed to that agent", async () => {
	const calls = [];
	const directive = await runHook(context("opus", "acp:codex"), {
		rules: {
			global: { ladder: [{ at: 50, model: "global-model" }] },
			agents: { "acp:codex": { ladder: [{ at: 50, model: "agent-model" }] } },
		},
		windows: [],
		hostOverrides: {
			usage: async (request) => {
				calls.push(request);
				return { available: true, windows: [weeklyWindow({ used: 80 })] };
			},
		},
	});
	assert.equal(directive.model, "agent-model");
	assert.deepEqual(calls, [{ agent_id: "acp:codex" }]);
});

test("disabled or incomplete selections do not read rules or spend a usage call", async () => {
	for (const [ctx, enabled] of [
		[context("opus"), "false"],
		[{ event: { model: "opus" } }, "true"],
		[context(""), "true"],
	]) {
		const reads = [];
		assert.deepEqual(
			await runHook(ctx, {
				rules: {},
				windows: [],
				enabled,
				hostOverrides: {
					getPreference: async ({ key }) => {
						reads.push(key);
						return enabled;
					},
					usage: async () => {
						assert.fail("disabled selection must not query quota");
					},
				},
			}),
			{ kind: "none" }
		);
		assert.deepEqual(reads, ["usage-pacer-enabled"]);
	}
});

test("each refused preference read fails closed without emitting a selection", async () => {
	for (const refusedKey of [
		"usage-pacer-enabled",
		"usage-pacer-rules",
		"usage-pacer-mode",
	]) {
		const rules = { global: { ladder: [{ at: 50, model: "sonnet" }] } };
		assert.deepEqual(
			await runHook(context("opus"), {
				rules,
				windows: [weeklyWindow({ used: 80 })],
				hostOverrides: {
					getPreference: async ({ key }) => {
						if (key === refusedKey) {
							throw new Error("preference access revoked");
						}
						return {
							"usage-pacer-enabled": "true",
							"usage-pacer-rules": JSON.stringify(rules),
							"usage-pacer-mode": "threshold",
						}[key];
					},
				},
			}),
			{ kind: "none" }
		);
	}
});

test("malformed rule JSON and unavailable quota shapes never query or select fabricated models", async () => {
	let usageCalls = 0;
	assert.deepEqual(
		await runHook(context("opus"), {
			rules: {},
			windows: [],
			hostOverrides: {
				getPreference: async ({ key }) =>
					key === "usage-pacer-enabled" ? "true" : "{broken",
				usage: async () => {
					usageCalls += 1;
				},
			},
		}),
		{ kind: "none" }
	);
	assert.equal(usageCalls, 0);
	for (const snapshot of [
		null,
		{ available: true, windows: null },
		{ available: true, windows: [] },
	]) {
		assert.deepEqual(
			await runHook(context("opus"), {
				rules: { global: { ladder: [{ at: 0, model: "sonnet" }] } },
				windows: [],
				hostOverrides: { usage: async () => snapshot },
			}),
			{ kind: "none" }
		);
	}
});

test("threshold selection is inclusive and follows the highest eligible matching rung", async () => {
	const rules = {
		global: {
			ladder: [
				{ from: "opus", at: 50, model: "sonnet" },
				{ from: "opus", at: 75, model: "haiku" },
			],
		},
	};
	for (const [used, expected] of [
		[49.99, undefined],
		[50, "sonnet"],
		[74.99, "sonnet"],
		[75, "haiku"],
	]) {
		const directive = await runHook(context("opus"), {
			rules,
			windows: [weeklyWindow({ used })],
		});
		assert.equal(directive.model, expected);
	}
});

test("cyclic downgrade ladders stop at the last fresh model instead of oscillating", async () => {
	const directive = await runHook(context("opus"), {
		rules: {
			global: {
				ladder: [
					{ from: "opus", at: 50, model: "sonnet" },
					{ from: "sonnet", at: 50, model: "opus" },
				],
			},
		},
		windows: [weeklyWindow({ used: 80 })],
	});
	assert.equal(directive.model, "sonnet");
});

test("ACP overrides preserve primitive values and exclude null, object, and empty keys", async () => {
	const directive = await runHook(context("opus", "other-agent"), {
		rules: {
			global: {
				upgrade_ladder: [
					{
						remaining: 20,
						acp_config: {
							fast_mode: false,
							budget: 2,
							mode: "safe",
							secret: null,
							nested: {},
							" ": "invalid",
						},
					},
				],
			},
		},
		windows: [weeklyWindow({ used: 80 })],
	});
	assert.deepEqual(directive.acp_config, {
		fast_mode: "false",
		budget: "2",
		mode: "safe",
	});
	assert.equal(directive.model, "opus");
});

function providerContext(model, event = {}) {
	return {
		agent_id: "ryu",
		event: { model, provider_id: "claude-pro-max", ...event },
	};
}

function poolAccount(accountId, { used, state = "ok", ...rest } = {}) {
	return {
		account_id: accountId,
		active: false,
		eligible: true,
		needs_reauth: false,
		state,
		usage:
			used === undefined
				? null
				: { available: true, windows: [weeklyWindow({ used })] },
		...rest,
	};
}

function providerHost(pool, agentWindows = [weeklyWindow({ used: 0 })]) {
	const calls = [];
	return {
		calls,
		hostOverrides: {
			usage: async (request) => {
				calls.push(request);
				if (request.provider_id) {
					if (pool instanceof Error) {
						throw pool;
					}
					return pool;
				}
				return { available: true, windows: agentWindows };
			},
		},
	};
}

const downgradeAt50 = {
	global: {
		windows: "weekly",
		ladder: [{ from: "opus", at: 50, model: "sonnet" }],
	},
};

test("a pooled provider paces against its least-pressured eligible account", async () => {
	const { calls, hostOverrides } = providerHost({
		provider_id: "claude-pro-max",
		usage_supported: true,
		pool_strategy: "quota_first",
		accounts: [
			poolAccount("acct_a", { used: 90, active: true }),
			poolAccount("acct_b", { used: 40 }),
			poolAccount("acct_c", { used: 10, eligible: false }),
			poolAccount("acct_d", { state: "pending" }),
		],
	});
	assert.deepEqual(
		await runHook(providerContext("opus"), {
			rules: downgradeAt50,
			windows: [],
			hostOverrides,
		}),
		{ kind: "none" }
	);
	assert.deepEqual(calls, [{ provider_id: "claude-pro-max" }]);

	const drained = providerHost({
		pool_strategy: "round_robin",
		accounts: [
			poolAccount("acct_a", { used: 90, active: true }),
			poolAccount("acct_b", { used: 70 }),
		],
	});
	const directive = await runHook(providerContext("opus"), {
		rules: downgradeAt50,
		windows: [],
		hostOverrides: drained.hostOverrides,
	});
	assert.equal(directive.model, "sonnet");
	assert.match(directive.reason, /^70% used/);
});

test("a manual provider paces against the active account only", async () => {
	const { calls, hostOverrides } = providerHost({
		pool_strategy: "manual",
		accounts: [
			poolAccount("acct_a", { used: 80, active: true }),
			poolAccount("acct_b", { used: 5 }),
		],
	});
	const directive = await runHook(providerContext("opus"), {
		rules: downgradeAt50,
		windows: [],
		hostOverrides,
	});
	assert.equal(directive.model, "sonnet");
	assert.match(directive.reason, /^80% used/);
	assert.deepEqual(calls, [{ provider_id: "claude-pro-max" }]);
});

test("a predicted account wins over the pool strategy", async () => {
	const { hostOverrides } = providerHost({
		pool_strategy: "quota_first",
		accounts: [
			poolAccount("acct_a", { used: 10, active: true }),
			poolAccount("acct_b", { used: 85 }),
		],
	});
	const directive = await runHook(
		providerContext("opus", {
			account_id: "acct_b",
			pool_strategy: "quota_first",
		}),
		{ rules: downgradeAt50, windows: [], hostOverrides }
	);
	assert.equal(directive.model, "sonnet");
	assert.match(directive.reason, /^85% used/);
});

test("provider rules override agent and global rules", async () => {
	const { hostOverrides } = providerHost({
		pool_strategy: "manual",
		accounts: [poolAccount("acct_a", { used: 60, active: true })],
	});
	const directive = await runHook(providerContext("opus"), {
		rules: {
			global: { ladder: [{ at: 50, model: "global-model" }] },
			agents: { ryu: { ladder: [{ at: 50, model: "agent-model" }] } },
			providers: {
				"claude-pro-max": { ladder: [{ at: 50, model: "provider-model" }] },
			},
		},
		windows: [],
		hostOverrides,
	});
	assert.equal(directive.model, "provider-model");
});

test("a refused provider read falls back to the agent reading", async () => {
	const { calls, hostOverrides } = providerHost(
		new Error("provider readings are visible to the node owner only"),
		[weeklyWindow({ used: 60 })]
	);
	const directive = await runHook(providerContext("opus"), {
		rules: downgradeAt50,
		windows: [],
		hostOverrides,
	});
	assert.equal(directive.model, "sonnet");
	assert.deepEqual(calls, [
		{ provider_id: "claude-pro-max" },
		{ agent_id: "ryu" },
	]);
});

test("pending, empty, or unknown-account provider results fall back to the agent reading", async () => {
	for (const { pool, event } of [
		{
			pool: {
				pool_strategy: "quota_first",
				accounts: [
					poolAccount("acct_a", { state: "pending" }),
					poolAccount("acct_b", { state: "pending" }),
				],
			},
		},
		{ pool: { pool_strategy: null, accounts: [] } },
		{ pool: { accounts: [], error: "account_not_found" } },
		{
			pool: {
				pool_strategy: "manual",
				accounts: [poolAccount("acct_a", { used: 99, active: true })],
			},
			event: { account_id: "acct_gone" },
		},
	]) {
		const { calls, hostOverrides } = providerHost(pool, [
			weeklyWindow({ used: 60 }),
		]);
		const directive = await runHook(providerContext("opus", event), {
			rules: downgradeAt50,
			windows: [],
			hostOverrides,
		});
		assert.equal(directive.model, "sonnet");
		assert.match(directive.reason, /^60% used/);
		assert.deepEqual(calls.at(-1), { agent_id: "ryu" });
	}
});

test("turns without a provider prediction never use the provider form", async () => {
	const { calls, hostOverrides } = providerHost({ accounts: [] }, [
		weeklyWindow({ used: 60 }),
	]);
	await runHook(context("opus"), {
		rules: downgradeAt50,
		windows: [],
		hostOverrides,
	});
	assert.deepEqual(calls, [{ agent_id: "acp:claude" }]);
});
