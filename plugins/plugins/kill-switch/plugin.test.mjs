// Uses the shared, closed Node observer artifact generated from the canonical
// source. Marketplace carries that artifact; no npm installation is required.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isNativeText } from "../../../tools/dist/native-primitive-observation.mjs";

const manifest = JSON.parse(
	readFileSync(new URL("./manifest.json", import.meta.url), "utf8")
);
const contract = JSON.parse(
	readFileSync(
		new URL(
			"../../../crates/core/kernel-contracts/schemas/host-api.json",
			import.meta.url
		),
		"utf8"
	)
);

test("emergency actions use the approved execution grant and no model turn", () => {
	assert.deepEqual(manifest.permission_grants, ["execution:control"]);
	assert.deepEqual(manifest.runnables, []);
	const actions = manifest.contributes.context_menu_items;
	assert.deepEqual(
		actions.map((action) => action.capability),
		["execution.pause", "execution.resume"]
	);
	for (const action of actions) {
		const method = contract.methods.find(
			(entry) => entry.method === action.capability
		);
		assert.ok(method, `${action.capability} is a real host method`);
		assert.equal(method.grant, "execution:control");
		assert.equal(action.anchor, "conversation");
	}
});

test("both menu actions dispatch unary Core control with distinct pending/error feedback", () => {
	// These declarations are paired with the real execution_control regressions;
	// this check does not pretend a declarative contribution is a runnable hook.
	for (const action of manifest.contributes.context_menu_items) {
		const method = contract.methods.find(
			(entry) => entry.method === action.capability
		);
		assert.equal(method.capability, "execution.control");
		assert.equal(method.tsHost, false);
		assert.equal(method.streaming, false);
		assert.equal(
			action.args,
			undefined,
			"caller/node authority must come from the host"
		);
		assert.equal(isNativeText(action.feedback.loading), true);
		assert.equal(isNativeText(action.feedback.error), true);
		assert.notEqual(action.feedback.error, action.feedback.success);
	}
	assert.deepEqual(
		manifest.contributes.context_menu_items.map((action) => action.id),
		["kill-switch.stop", "kill-switch.resume"]
	);
});
