import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const hook = manifest.contributes.turn_hooks[0];
const hookSource = readFileSync(join(HERE, hook.code_file), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const runHook = new AsyncFunction("ctx", "host", hookSource);

test("declares a bounded, opt-in observer hook", () => {
	assert.equal(manifest.id, "@ryu/observer-agents");
	assert.deepEqual(manifest.permission_grants, ["hook:side-model"]);
	assert.equal(hook.on, "post_assistant_turn");
	assert.equal(hook.match.flag, "io.ryu.observer-agents");
	assert.equal(hook.code_file, "hooks/review.js");
	assert.ok(existsSync(join(HERE, hook.code_file)));
});

test("keeps observer instructions and digest caps in the hook body", () => {
	assert.match(hookSource, /read-only digest/);
	assert.match(hookSource, /MAX_ENTRY_CHARS = 2000/);
	assert.match(hookSource, /MAX_DIGEST_CHARS = 12000/);
	assert.match(hookSource, /SILENT/);
	assert.match(hookSource, /advisory only/);
});

test("does not invoke the side model for an empty or unusable transcript", async () => {
	let calls = 0;
	const host = {
		sideModel: async () => {
			calls += 1;
		},
	};
	assert.deepEqual(await runHook({ transcript: [] }, host), { kind: "none" });
	assert.deepEqual(
		await runHook(
			{ transcript: [{ role: "assistant", content: [{ image: "x" }] }] },
			host
		),
		{ kind: "none" }
	);
	assert.equal(calls, 0);
});

test("sends only the latest bounded activity and treats SILENT as no report", async () => {
	let request;
	const transcript = Array.from({ length: 14 }, (_, index) => ({
		role: index % 2 ? "assistant" : "user",
		content: `entry-${index}-${"x".repeat(2500)}`,
	}));
	const result = await runHook(
		{ transcript },
		{
			sideModel: async (value) => {
				request = value;
				return "  silent  ";
			},
		}
	);
	assert.deepEqual(result, { kind: "none" });
	assert.equal(request.model_pref_key, "observer-agents-model");
	assert.doesNotMatch(request.prompt, /entry-0-/);
	assert.doesNotMatch(request.prompt, /entry-1-/);
	assert.match(request.prompt, /entry-2-/);
	const activity = request.prompt.match(
		/<worker-activity>\n([\s\S]*)\n<\/worker-activity>/
	)?.[1];
	assert.ok(activity);
	assert.ok(activity.length <= 12_000);
});

test("returns a bounded advisory note and propagates provider refusal", async () => {
	const longReport = `review: ${"z".repeat(1500)}`;
	const note = await runHook(
		{ transcript: [{ role: "assistant", content: "work" }] },
		{
			sideModel: async () => longReport,
		}
	);
	assert.equal(note.kind, "note");
	assert.match(
		note.text,
		/^Background observer report \(advisory only\): review:/
	);
	assert.ok(note.text.length <= 1047);

	await assert.rejects(
		runHook(
			{ transcript: [{ role: "assistant", content: "work" }] },
			{
				sideModel: async () => {
					throw new Error("provider refused");
				},
			}
		),
		/provider refused/
	);
});
