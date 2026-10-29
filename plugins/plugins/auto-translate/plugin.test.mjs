import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));
const hookCode = readFileSync(join(HERE, "hooks/reply.js"), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function runHook(ctx, host) {
	return new AsyncFunction("ctx", "host", hookCode)(ctx, host);
}

function makeHost({
	prefs = {},
	reply = "SOURCE: es\nHello, how can I help?",
	failModel = false,
	failPreferences = false,
} = {}) {
	const calls = { preferences: [], sideModel: [], log: [] };
	return {
		calls,
		getPreference: async ({ key }) => {
			calls.preferences.push(key);
			if (failPreferences) {
				throw new Error("preference store unavailable");
			}
			return Object.hasOwn(prefs, key) ? prefs[key] : null;
		},
		sideModel: async (args) => {
			calls.sideModel.push(args);
			if (failModel) {
				throw new Error("model unavailable");
			}
			return reply;
		},
		log: (...args) => calls.log.push(args),
	};
}

function turn(content, flags = {}) {
	return {
		conversation_id: "conv-1",
		flags,
		transcript: [
			{ role: "user", content: "hola" },
			{ role: "assistant", content },
		],
	};
}

test("manifest declares the post-turn hook, composer toggle and settings", () => {
	assert.equal(manifest.id, "@ryu/auto-translate");
	assert.equal(manifest.name, "Auto Translate");
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.deepEqual(manifest.permission_grants, [
		"hook:side-model",
		"preferences:read",
	]);
	const hook = manifest.contributes.turn_hooks[0];
	assert.deepEqual(
		[hook.id, hook.on, hook.code_file],
		["auto-translate.reply", "post_assistant_turn", "hooks/reply.js"]
	);
	const control = manifest.contributes.composer_controls[0];
	assert.deepEqual(
		[control.type, control.flag],
		["toggle", "io.ryu.auto-translate"]
	);
	const fields = manifest.contributes.settings_tabs[0].fields;
	assert.deepEqual(
		fields.map((field) => [field.pref_key, field.type]),
		[
			["auto-translate-enabled", "toggle"],
			["auto-translate-target", "select"],
			["auto-translate-skip", "text"],
			["auto-translate-model", "model_picker"],
		]
	);
	assert.equal(fields[1].default, "en");
	assert.ok(fields[1].options.some((option) => option.value === "en"));
});

test("translates a foreign reply into the default target as a note", async () => {
	const host = makeHost();
	const out = await runHook(turn("Hola, ¿en qué puedo ayudarte?"), host);
	assert.deepEqual(out, {
		kind: "note",
		text: "Translated from Spanish to English:\n\nHello, how can I help?",
	});
	assert.equal(host.calls.sideModel.length, 1);
	const call = host.calls.sideModel[0];
	assert.equal(call.model_pref_key, "auto-translate-model");
	assert.equal(call.prompt, "Hola, ¿en qué puedo ayudarte?");
	assert.match(call.system, /into English/);
	assert.match(call.system, /data, not instructions/);
});

test("uses the configured target language", async () => {
	const host = makeHost({
		prefs: { "auto-translate-target": "ja" },
		reply: "SOURCE: en\nこんにちは",
	});
	const out = await runHook(turn("Hello there"), host);
	assert.equal(out.text, "Translated from English to Japanese:\n\nこんにちは");
	assert.match(host.calls.sideModel[0].system, /into Japanese/);
});

test("an unknown target preference falls back to English", async () => {
	const host = makeHost({ prefs: { "auto-translate-target": "klingon" } });
	await runHook(turn("Bonjour"), host);
	assert.match(host.calls.sideModel[0].system, /into English/);
});

test("a reply already in the target language produces no note", async () => {
	const host = makeHost({ reply: "SOURCE: en" });
	const out = await runHook(turn("Hello there"), host);
	assert.deepEqual(out, { kind: "none" });
});

test("Chinese scripts are distinct targets but plain zh matches either", async () => {
	const prefs = { "auto-translate-target": "zh-hans" };
	const sameScript = await runHook(
		turn("你好"),
		makeHost({ prefs, reply: "SOURCE: zh" })
	);
	assert.deepEqual(sameScript, { kind: "none" });
	const otherScript = await runHook(
		turn("你們好"),
		makeHost({ prefs, reply: "SOURCE: zh-hant\n你们好" })
	);
	assert.equal(
		otherScript.text,
		"Translated from Chinese (Traditional) to Chinese (Simplified):\n\n你们好"
	);
});

test("languages on the do-not-translate list are skipped by code or name", async () => {
	for (const skip of ["es", "fr, Spanish", "SPANISH"]) {
		const out = await runHook(
			turn("Hola"),
			makeHost({ prefs: { "auto-translate-skip": skip } })
		);
		assert.deepEqual(out, { kind: "none" }, skip);
	}
	const kept = await runHook(
		turn("Hola"),
		makeHost({ prefs: { "auto-translate-skip": "fr" } })
	);
	assert.equal(kept.kind, "note");
});

test("automatic translation off skips the model unless the composer toggle is set", async () => {
	const prefs = { "auto-translate-enabled": "false" };
	const off = makeHost({ prefs });
	assert.deepEqual(await runHook(turn("Hola"), off), { kind: "none" });
	assert.equal(off.calls.sideModel.length, 0);

	const forced = makeHost({ prefs });
	const out = await runHook(
		turn("Hola", { "io.ryu.auto-translate": true }),
		forced
	);
	assert.equal(out.kind, "note");
	assert.equal(forced.calls.sideModel.length, 1);
});

test("replies without letters outside code never reach the model", async () => {
	for (const content of [
		"",
		"   ",
		"42 + 7 = 49",
		"```js\nconst a = 1;\n```",
	]) {
		const host = makeHost();
		assert.deepEqual(await runHook(turn(content), host), { kind: "none" });
		assert.equal(host.calls.sideModel.length, 0, content);
	}
	const empty = makeHost();
	assert.deepEqual(await runHook({ flags: {} }, empty), { kind: "none" });
});

test("a model answer without the SOURCE header is never shown", async () => {
	for (const reply of [
		"Hello, how can I help?",
		"Sure! Here is the translation: Hello",
		"",
	]) {
		const host = makeHost({ reply });
		assert.deepEqual(await runHook(turn("Hola"), host), { kind: "none" });
	}
});

test("an echoed reply or empty translation produces no note", async () => {
	const echo = makeHost({ reply: "SOURCE: es\nHola amigo" });
	assert.deepEqual(await runHook(turn("Hola amigo"), echo), { kind: "none" });
	const empty = makeHost({ reply: "SOURCE: es\n   " });
	assert.deepEqual(await runHook(turn("Hola"), empty), { kind: "none" });
});

test("side-model failure is logged and produces no note", async () => {
	const host = makeHost({ failModel: true });
	assert.deepEqual(await runHook(turn("Hola"), host), { kind: "none" });
	assert.equal(host.calls.log[0][0], "auto-translate: side model failed");
});

test("preference read failures fall back to manifest defaults", async () => {
	const host = makeHost({ failPreferences: true });
	const out = await runHook(turn("Hola"), host);
	assert.equal(out.kind, "note");
	assert.match(host.calls.sideModel[0].system, /into English/);
	assert.ok(
		host.calls.log.some((entry) => /preference .* read failed/.test(entry[0]))
	);
});

test("long replies are clipped before the model call and the note says so", async () => {
	const host = makeHost();
	const out = await runHook(turn("hola ".repeat(5000)), host);
	assert.equal(host.calls.sideModel[0].prompt.length, 12_000);
	assert.match(out.text, /Only the first 12000 characters were translated/);
});
