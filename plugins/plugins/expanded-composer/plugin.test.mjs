// Co-located contract test for the declarative expanded-composer plugin.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
	readFileSync(join(HERE, "manifest.json"), "utf8")
);

test("declares a desktop expanded-composer feature without a runnable", () => {
	assert.equal(manifest.id, "@ryu/expanded-composer");
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

test("is registered from its package manifest, not a Core fixture copy", () => {
	const coreSrc = join(HERE, "..", "..", "apps", "core", "src");
	assert.ok(existsSync(coreSrc));
	assert.equal(
		existsSync(
			join(coreSrc, "plugin_manifest", "fixtures", "expanded-composer.manifest.json")
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
