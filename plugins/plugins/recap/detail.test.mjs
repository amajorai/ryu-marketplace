// Behaviour tests for the `recap.turn` hook's `recap-detail` setting and the
// `recap-min-chars` clamp. Runs the real hook body (hooks/turn.js) against a fake
// host bridge and inspects what reaches the side model.
// Run with:  node --test plugins-store/plugins/recap/detail.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const turnHook = manifest.contributes.turn_hooks.find(
	(h) => h.id === "recap.turn"
);
const runTurn = new AsyncFunction(
	"ctx",
	"host",
	readFileSync(join(HERE, turnHook.code_file), "utf8")
);

const BRIEF = "ONE sentence, under 25 words";
const DETAILED_BULLETS = "3-6 bullets";
const DETAILED_OPEN = '"Open: "';
const STANDARD = "2-4 bullets";

function makeCtx(
	answer = "Renamed the session helper in apps/core/src/auth.rs."
) {
	return {
		conversation_id: "conv-detail",
		agent_id: "ryu",
		transcript: [
			{ role: "user", content: "tidy the auth helpers" },
			{ role: "assistant", content: answer },
		],
		flags: {},
		input: null,
	};
}

function makeHost(prefs, { throwOn = [] } = {}) {
	const sideModelCalls = [];
	return {
		sideModelCalls,
		getPreference: async ({ key }) => {
			if (throwOn.includes(key)) {
				throw new Error(`preference store unavailable: ${key}`);
			}
			return Object.hasOwn(prefs, key) ? prefs[key] : null;
		},
		sideModel: async (args) => {
			sideModelCalls.push(args);
			return "Renamed the helper.";
		},
		storage: {
			get: async () => null,
			set: async () => undefined,
			delete: async () => undefined,
		},
		log: () => undefined,
	};
}

async function systemPromptFor(prefs, options) {
	const host = makeHost({ "recap-min-chars": "0", ...prefs }, options);
	const ctx = makeCtx();
	const out = await runTurn(ctx, host);
	const [call] = host.sideModelCalls;
	if (out.kind !== "note" || host.sideModelCalls.length !== 1) {
		throw new Error(
			`expected one recap note, got ${out.kind} after ${host.sideModelCalls.length} side-model calls`
		);
	}
	if (call.prompt !== ctx.transcript[1].content) {
		throw new Error("the side model was not given the turn text as its prompt");
	}
	return call.system;
}

test("recap-detail=brief asks for one short sentence and no bullets", async () => {
	const system = await systemPromptFor({ "recap-detail": "brief" });
	assert.ok(system.includes(BRIEF), system);
	assert.ok(!system.includes(STANDARD));
	assert.ok(!system.includes(DETAILED_BULLETS));
});

test("recap-detail=detailed asks for 3-6 bullets and an Open: line", async () => {
	const system = await systemPromptFor({ "recap-detail": "detailed" });
	assert.ok(system.includes(DETAILED_BULLETS), system);
	assert.ok(system.includes(DETAILED_OPEN), system);
	assert.ok(system.includes("'Open: nothing outstanding.'"), system);
	assert.ok(!system.includes(BRIEF));
	assert.ok(!system.includes(STANDARD));
});

test("recap-detail is matched case- and whitespace-insensitively", async () => {
	const system = await systemPromptFor({ "recap-detail": "  BRIEF " });
	assert.ok(system.includes(BRIEF), system);
});

test("recap-detail=standard, garbage, or unset all use the 2-4 bullet shape", async () => {
	for (const value of ["standard", "verbose", "", null]) {
		const prefs = value === null ? {} : { "recap-detail": value };
		const system = await systemPromptFor(prefs);
		assert.ok(system.includes(STANDARD), `recap-detail=${value}: ${system}`);
		assert.ok(!system.includes(BRIEF), `recap-detail=${value}`);
		assert.ok(!system.includes(DETAILED_OPEN), `recap-detail=${value}`);
	}
});

test("a throwing recap-detail preference read falls back to standard", async () => {
	const system = await systemPromptFor(
		{ "recap-detail": "brief" },
		{ throwOn: ["recap-detail"] }
	);
	assert.ok(system.includes(STANDARD), system);
	assert.ok(!system.includes(BRIEF));
});

test("a huge recap-min-chars clamps to 20000, so a 20001-char turn is recapped", async () => {
	const host = makeHost({ "recap-min-chars": "999999" });
	const answer = "x".repeat(20_001);
	const out = await runTurn(makeCtx(answer), host);
	assert.equal(out.kind, "note");
	assert.equal(host.sideModelCalls.length, 1);
	assert.equal(host.sideModelCalls[0].prompt.length, 20_001);
});

test("the clamp is an upper bound only: a 19999-char turn stays under a 20000 floor", async () => {
	const host = makeHost({ "recap-min-chars": "999999" });
	const out = await runTurn(makeCtx("x".repeat(19_999)), host);
	assert.deepEqual(out, { kind: "none" });
	assert.equal(host.sideModelCalls.length, 0);
});
