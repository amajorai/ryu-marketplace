import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

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
