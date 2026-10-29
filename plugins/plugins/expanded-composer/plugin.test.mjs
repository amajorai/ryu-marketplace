// Co-located contract test for the declarative expanded-composer plugin.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(HERE, "plugin.json"), "utf8"));

test("declares a desktop expanded-composer feature without a runnable", () => {
	assert.equal(manifest.id, "@ryu/expanded-composer");
	assert.equal(manifest.name, "Expanded Composer");
	assert.equal(plugin.version, manifest.version);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(manifest.permission_grants ?? [], []);
	assert.deepEqual(plugin.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(manifest.contributes?.chat_features, [
		{
			id: "expanded-composer",
			kind: "expanded-composer",
			persistence: "none",
			renderer: "expanded-composer",
			scope: "current-chat",
		},
	]);
});

test("keeps the control host-owned, current-chat scoped, and permission free", () => {
	assert.deepEqual(manifest.surfaces, {
		gateway: { support: "none" },
		core: { support: "full" },
		desktop: { support: "full" },
		island: { support: "none" },
		mobile: { support: "none" },
		extension: { support: "none" },
		web: { support: "none" },
		cli: { support: "none" },
	});
	assert.equal(manifest.contributes.chat_features.length, 1);
	const [feature] = manifest.contributes.chat_features;
	assert.equal(feature.scope, "current-chat");
	assert.equal(feature.persistence, "none");
	assert.equal(manifest.permission_levels, undefined);
	assert.equal(manifest.provides, undefined);
	assert.equal(manifest.requires, undefined);
	assert.equal(manifest.mcp_servers, undefined);
	assert.equal(manifest.sidecar, undefined);
});

test("is registered from its package manifest, not a Core fixture copy", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	assert.ok(existsSync(coreSrc));
	assert.equal(
		existsSync(
			join(
				coreSrc,
				"plugin_manifest",
				"fixtures",
				"expanded-composer.manifest.json"
			)
		),
		false
	);
	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/expanded-composer/manifest.json")'
		),
		"Core must include the package manifest in its test catalog"
	);
});
