import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { checkInventory } from "./inventory.mjs";

test("interaction inventory exactly matches all three live package clusters", () => {
	const { rows, summary } = checkInventory();
	const allowedStatuses = new Set(["behavior", "partial", "unmapped"]);
	assert.ok(rows.length > 0);
	assert.deepEqual(Object.keys(summary).sort(), [
		"external_plugins",
		"lsp",
		"plugins",
	]);
	assert.ok(summary.plugins.rows > 0);
	assert.ok(summary.lsp.rows > 0);
	assert.ok(summary.external_plugins.rows > 0);
	assert.ok(rows.every((row) => allowedStatuses.has(row.status)));
	for (const [cluster, counts] of Object.entries(summary)) {
		const clusterRows = rows.filter((row) => row.cluster === cluster);
		assert.deepEqual(counts, {
			rows: clusterRows.length,
			behavior: clusterRows.filter((row) => row.status === "behavior").length,
			partial: clusterRows.filter((row) => row.status === "partial").length,
			unmapped: clusterRows.filter((row) => row.status === "unmapped").length,
		});
	}
});

test("sidecar test files never become product coverage rows", () => {
	const { rows } = checkInventory();
	assert.ok(
		rows.every((row) => !/sidecar\/(?:tests|__tests__)\//.test(row.row_id))
	);
	for (const name of ["functiongemma", "needle3"]) {
		assert.ok(
			rows.some(
				(row) =>
					row.row_id ===
					`plugins/${name}#sidecar_code_file:source:sidecar/ryu_${name}/server.py`
			)
		);
		assert.ok(
			rows.some(
				(row) =>
					row.row_id ===
					`plugins/${name}#sidecar_code_file:source:sidecar/ryu_${name}/decision.py`
			)
		);
	}
});

test("plugins package ownership map covers each plugins package exactly once", () => {
	const lines = readFileSync(
		new URL("./package-groups.tsv", import.meta.url),
		"utf8"
	)
		.trimEnd()
		.split(/\r?\n/);
	assert.equal(lines[0], "cluster\tgroup_id\tpackage_id\townership\towner");
	const entries = lines
		.slice(1)
		.map((line) => line.split("\t"))
		.filter((entry) => entry[0] === "plugins");
	const packageIds = entries.map((entry) => entry[2]);
	const pluginDirs = readdirSync(new URL("../plugins/", import.meta.url), {
		withFileTypes: true,
	})
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	assert.equal(new Set(packageIds).size, packageIds.length);
	assert.deepEqual(packageIds.sort(), pluginDirs);
	assert.ok(entries.every((entry) => entry[0] === "plugins"));
	assert.deepEqual(
		entries
			.filter((entry) => entry[1] === "continuation-controls")
			.map((entry) => entry[2])
			.sort(),
		["auto-continue", "plan-continue"]
	);
});

test("LSP package ownership map covers each language-server package exactly once", () => {
	const entries = readFileSync(
		new URL("./package-groups.tsv", import.meta.url),
		"utf8"
	)
		.trimEnd()
		.split(/\r?\n/)
		.slice(1)
		.map((line) => line.split("\t"))
		.filter((entry) => entry[0] === "lsp");
	const packageIds = entries.map((entry) => entry[2]);
	const lspDirs = readdirSync(new URL("../lsp/", import.meta.url), {
		withFileTypes: true,
	})
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	assert.equal(new Set(packageIds).size, packageIds.length);
	assert.deepEqual(packageIds.sort(), lspDirs);
	assert.ok(entries.every((entry) => entry[1] === "language-servers"));
	assert.ok(entries.every((entry) => entry[3] === "mapped"));
});
