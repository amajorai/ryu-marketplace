// The `goal.loop` turn hook, run from its hydrated manifest body against a
// mock host: /goal commands, the active-goal judge loop, the turn cap, fail-safe
// handling of stored state, and retry after a failed judge call.
// Run with:  node --test plugins-store/plugins/goal/hook-loop.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import { isNativeNumber } from "../../../tools/dist/native-primitive-observation.mjs";
import {
	JUDGE_FEEDBACK_FRAME,
	JUDGE_PREF_KEY,
	loadHookRunner,
	makeCtx,
	makeHost,
	parseManifest,
} from "./goal.test-fixture.mjs";

test("no conversation_id → {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no - x");
	assert.deepEqual(await run(makeCtx({ conversation_id: null }), host), {
		kind: "none",
	});
	assert.equal(host.sideModelCalls.length, 0);
});

test("'/goal clear' deletes stored state and returns a note", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("unused", {
		"conv-123": JSON.stringify({ condition: "x", status: "active", turns: 3 }),
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "assistant", content: "working…" },
			{ role: "user", content: "/goal clear" },
		],
	});
	const directive = await run(ctx, host);
	assert.deepEqual(directive, { kind: "note", text: "Goal cleared." });
	assert.equal(host.store.has("conv-123"), false, "state removed");
	assert.equal(host.sideModelCalls.length, 0, "no judge call on clear");
});

test("'/goal stop' also clears (same note)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("unused", {
		"conv-123": JSON.stringify({ condition: "x", status: "active", turns: 1 }),
	});
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "  /goal stop  " }],
	});
	assert.deepEqual(await run(ctx, host), {
		kind: "note",
		text: "Goal cleared.",
	});
	assert.equal(host.store.has("conv-123"), false);
});

test("'/goal <condition>' seeds active state and returns a continue", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("unused");
	const ctx = makeCtx({
		transcript: [
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "/goal ship the release notes" },
		],
	});
	const directive = await run(ctx, host);
	assert.deepEqual(directive, {
		kind: "continue",
		text: "Begin working toward this goal: ship the release notes",
	});
	// storage now holds a parseable active goal at turn 0
	const stored = JSON.parse(host.store.get("conv-123"));
	assert.equal(stored.condition, "ship the release notes");
	assert.equal(stored.status, "active");
	assert.equal(stored.turns, 0);
	assert.equal(isNativeNumber(stored.started_at), true);
	assert.equal(host.sideModelCalls.length, 0, "seeding does not judge");
});

test("'/goal ' with an empty condition does not seed", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("unused");
	const ctx = makeCtx({
		transcript: [{ role: "user", content: "/goal    " }],
	});
	// no condition → skip the set; no prior state → none
	assert.deepEqual(await run(ctx, host), { kind: "none" });
	assert.equal(host.store.size, 0);
});

test("no command and no stored state → {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no - x");
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.sideModelCalls.length, 0);
});

test("active goal, judge says not met → continue + turn incremented + state persisted", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no - not there yet", {
		"conv-123": JSON.stringify({
			condition: "reach 100 stars",
			status: "active",
			turns: 3,
		}),
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "keep pushing" },
			{ role: "assistant", content: "made progress" },
		],
	});
	const directive = await run(ctx, host);

	assert.deepEqual(directive, {
		kind: "continue",
		text: `Keep working toward the goal: reach 100 stars. ${JUDGE_FEEDBACK_FRAME}Judge feedback: MET: no - not there yet`,
	});

	// judge was consulted with the right pref key + a prompt carrying the goal
	// and the rendered transcript
	assert.equal(host.sideModelCalls.length, 1);
	const args = host.sideModelCalls[0];
	assert.equal(args.model_pref_key, JUDGE_PREF_KEY);
	assert.ok(
		args.system.includes("MET:"),
		"system frames the MET: verdict format"
	);
	assert.ok(args.prompt.includes("reach 100 stars"), "prompt carries the goal");
	assert.ok(
		args.prompt.includes("user: keep pushing"),
		"prompt renders transcript"
	);
	assert.ok(
		args.prompt.includes("assistant: made progress"),
		"prompt renders assistant turn"
	);

	// state persisted: turns 3 → 4, still active, last_reason recorded
	const stored = JSON.parse(host.store.get("conv-123"));
	assert.equal(stored.turns, 4);
	assert.equal(stored.status, "active");
	assert.equal(stored.condition, "reach 100 stars");
	assert.equal(stored.last_reason, "MET: no - not there yet");
});

test("active goal, judge says met → note + achieved state persisted", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: yes - all done", {
		"conv-123": JSON.stringify({
			condition: "finish the task",
			status: "active",
			turns: 2,
		}),
	});
	const directive = await run(makeCtx(), host);

	assert.deepEqual(directive, {
		kind: "note",
		text: "Goal met. MET: yes - all done",
	});
	assert.equal(host.store.has("conv-123"), true, "met goal is retained");
	const stored = JSON.parse(host.store.get("conv-123"));
	assert.equal(stored.condition, "finish the task");
	assert.equal(stored.status, "achieved");
	assert.equal(stored.turns, 3);
	assert.equal(stored.last_reason, "MET: yes - all done");
	assert.equal(isNativeNumber(stored.achieved_at), true);
	assert.equal(host.sideModelCalls.length, 1);
});

test("case-insensitive verdict: 'met: YES' still counts as met", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("met: YES — good enough", {
		"conv-123": JSON.stringify({ condition: "c", status: "active", turns: 0 }),
	});
	const directive = await run(makeCtx(), host);
	assert.equal(directive.kind, "note");
	assert.ok(directive.text.startsWith("Goal met."));
});

test("turn cap: at 25 turns the loop stops without judging", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no - keep going", {
		"conv-123": JSON.stringify({ condition: "c", status: "active", turns: 25 }),
	});
	const directive = await run(makeCtx(), host);
	assert.deepEqual(directive, {
		kind: "note",
		text: "Goal stopped after 25 turns.",
	});
	assert.equal(host.store.has("conv-123"), false, "state cleared at the cap");
	assert.equal(host.sideModelCalls.length, 0, "no judge call once capped");
});

test("corrupt stored state → {kind:'none'} (fail-safe, no judge)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no", { "conv-123": "not-json{" });
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.sideModelCalls.length, 0);
});

test("non-active stored status → {kind:'none'}", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no", {
		"conv-123": JSON.stringify({ condition: "c", status: "done", turns: 1 }),
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.equal(host.sideModelCalls.length, 0);
});

test("paused goal keeps its persisted state and does not judge", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: no - should not run", {
		"conv-123": JSON.stringify({
			condition: "ship it",
			status: "paused",
			turns: 4,
		}),
	});
	assert.deepEqual(await run(makeCtx(), host), { kind: "none" });
	assert.deepEqual(JSON.parse(host.store.get("conv-123")), {
		condition: "ship it",
		status: "paused",
		turns: 4,
	});
	assert.equal(host.sideModelCalls.length, 0);
});

test("command detection uses the NEWEST user turn (reverse scan)", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("unused", {
		"conv-123": JSON.stringify({ condition: "c", status: "active", turns: 0 }),
	});
	// an OLD '/goal clear' precedes a newer ordinary user turn — must NOT clear
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "/goal clear" },
			{ role: "assistant", content: "cleared" },
			{ role: "user", content: "actually keep going" },
			{ role: "assistant", content: "ok" },
		],
	});
	const directive = await run(ctx, host);
	// newest user turn is not a command → falls through to the active-goal judge loop
	assert.equal(directive.kind, "continue");
	assert.equal(
		host.store.has("conv-123"),
		true,
		"state survived (no stale clear)"
	);
	assert.equal(host.sideModelCalls.length, 1, "judge ran on the active goal");
});

test("a newest /goal command replaces an active goal before judging it", async () => {
	const run = loadHookRunner(parseManifest());
	const host = makeHost("MET: yes - should not be consulted", {
		"conv-123": JSON.stringify({
			condition: "old goal",
			status: "active",
			turns: 12,
			last_reason: "old verdict",
		}),
	});
	const ctx = makeCtx({
		transcript: [
			{ role: "user", content: "/goal stale command" },
			{ role: "assistant", content: "started stale command" },
			{ role: "user", content: "  /goal new goal  " },
		],
	});

	assert.deepEqual(await run(ctx, host), {
		kind: "continue",
		text: "Begin working toward this goal: new goal",
	});
	const stored = JSON.parse(host.store.get("conv-123"));
	assert.equal(stored.condition, "new goal");
	assert.equal(stored.status, "active");
	assert.equal(stored.turns, 0);
	assert.equal("last_reason" in stored, false);
	assert.equal(isNativeNumber(stored.started_at), true);
	assert.equal(
		host.sideModelCalls.length,
		0,
		"replacement runs before the judge"
	);
});

test("a judge host failure leaves the active goal unchanged", async () => {
	const run = loadHookRunner(parseManifest());
	const original = JSON.stringify({
		condition: "finish the task",
		status: "active",
		turns: 4,
	});
	const host = makeHost(
		() => {
			throw new Error("judge service unavailable");
		},
		{ "conv-123": original }
	);

	await assert.rejects(() => run(makeCtx(), host), /judge service unavailable/);
	assert.equal(host.sideModelCalls.length, 1);
	assert.equal(host.store.get("conv-123"), original);
});

test("a failed judge call retries from unchanged persisted state", async () => {
	const run = loadHookRunner(parseManifest());
	const original = JSON.stringify({
		condition: "finish the task",
		status: "active",
		turns: 4,
	});
	let attempts = 0;
	const host = makeHost(
		() => {
			attempts += 1;
			if (attempts === 1) {
				throw new Error("temporary judge outage");
			}
			return "MET: no - one check remains";
		},
		{ "conv-123": original }
	);

	await assert.rejects(() => run(makeCtx(), host), /temporary judge outage/);
	assert.equal(host.store.get("conv-123"), original);
	assert.deepEqual(await run(makeCtx(), host), {
		kind: "continue",
		text: `Keep working toward the goal: finish the task. ${JUDGE_FEEDBACK_FRAME}Judge feedback: MET: no - one check remains`,
	});
	assert.equal(attempts, 2, "the next hook dispatch performs one exact retry");
	assert.deepEqual(JSON.parse(host.store.get("conv-123")), {
		condition: "finish the task",
		status: "active",
		turns: 5,
		last_reason: "MET: no - one check remains",
	});
});
