// Shared harness for the hook localisation tests (`hook-i18n.test.mjs` in each
// plugin package). It runs a hook body the way Core does (an async function of
// `ctx` and `host`) with a `host.t` stub that tags every rendering, so a test can
// tell a translated sentence from English text that never went through the
// catalog.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** The tag the stub `host.t` puts in front of every rendered message. */
export const TRANSLATED = "[ja] ";

/** Run the `turn_hooks` entry with `hookId` from the package at `packageDir`. */
export function loadTurnHook(packageDir, hookId) {
	const manifest = JSON.parse(
		readFileSync(join(packageDir, "manifest.json"), "utf8")
	);
	const hook = manifest.contributes.turn_hooks.find(
		(entry) => entry.id === hookId
	);
	if (!hook) {
		throw new Error(`no turn hook ${hookId} in ${packageDir}`);
	}
	const body = readFileSync(join(packageDir, hook.code_file), "utf8");
	const run = new AsyncFunction("ctx", "host", body);
	return (ctx, host) => run(ctx, host);
}

function fill(source, values) {
	return String(source).replace(/\{(\w+)\}/g, (match, name) =>
		Object.hasOwn(values, name) ? String(values[name]) : match
	);
}

/**
 * A host whose `t` tags its output and records the sources it was asked for.
 * `extra` supplies the capabilities a hook needs (sideModel, runAgent, …).
 */
export function translatingHost(extra = {}) {
	const sources = [];
	const sideModelCalls = [];
	const host = {
		log: () => undefined,
		t: async (source, values = {}) => {
			sources.push(source);
			return TRANSLATED + fill(source, values);
		},
		...extra,
	};
	if (typeof extra.sideModel === "function") {
		host.sideModel = async (args) => {
			sideModelCalls.push(args);
			return await extra.sideModel(args);
		};
	}
	return { host, sources, sideModelCalls };
}

/** The lines of `text` that start with a bullet. */
export function bulletLines(text) {
	return String(text)
		.split("\n")
		.filter((line) => line.startsWith("• "));
}
