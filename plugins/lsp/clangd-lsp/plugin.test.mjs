import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const projection = JSON.parse(readFileSync(join(here, "plugin.json"), "utf8"));
const server = manifest.contributes.lsp_servers.clangd;

const parseVersion = (text) => {
	const match = text.match(/^(\d+)\.(\d+)\.(\d+)$/);
	return match ? match.slice(1).map(Number) : null;
};

const compareVersions = (left, right) => {
	for (const [index, part] of left.entries()) {
		if (part !== right[index]) {
			return part - right[index];
		}
	}
	return 0;
};

test("declares the exact clangd command, argv and C/C++ file mapping", () => {
	assert.equal(manifest.id, "@ryu/clangd-lsp");
	assert.deepEqual(manifest.permission_grants, ["pi:extension"]);
	assert.deepEqual(manifest.activation_events, ["*"]);
	assert.deepEqual(manifest.runnables, []);
	assert.deepEqual(Object.keys(manifest.contributes.lsp_servers), ["clangd"]);
	assert.deepEqual(server, {
		command: "clangd",
		args: ["--background-index"],
		extensionToLanguage: {
			".c": "c",
			".h": "c",
			".cpp": "cpp",
			".cc": "cpp",
			".cxx": "cpp",
			".hpp": "cpp",
			".hxx": "cpp",
		},
	});
});

test("README publishes the same extension map and omits case-colliding variants", () => {
	const readme = readFileSync(join(here, "README.md"), "utf8");
	const example = readme.match(/```json\n([\s\S]*?)\n```/);
	assert.ok(example, "README must publish the extension map as JSON");
	assert.deepEqual(JSON.parse(example[1]), server.extensionToLanguage);
	const lowered = Object.keys(server.extensionToLanguage).map((extension) =>
		extension.toLowerCase()
	);
	assert.equal(new Set(lowered).size, lowered.length);
	assert.match(readme, /never bundles the server\s+binary/);
	assert.match(readme, /missing binary is a\s+graceful skip/);
});

test("the engines.ryu range is satisfied by the current Core version", () => {
	const range = manifest.engines?.ryu;
	assert.equal(typeof range, "string");
	const minimum = range.match(/^>=(\S+)$/);
	assert.ok(minimum, `unsupported engines.ryu range ${range}`);
	const coreToml = readFileSync(
		join(repoRoot, "apps", "core", "Cargo.toml"),
		"utf8"
	);
	const coreVersion = coreToml.match(/^version = "([^"]+)"/m);
	assert.ok(coreVersion, "apps/core/Cargo.toml must declare a version");
	const current = parseVersion(coreVersion[1]);
	const required = parseVersion(minimum[1]);
	assert.ok(current, `Core version ${coreVersion[1]} is not plain semver`);
	assert.ok(required, `engines.ryu minimum ${minimum[1]} is not plain semver`);
	assert.ok(
		compareVersions(current, required) >= 0,
		`Core ${coreVersion[1]} does not satisfy ${range}`
	);
});

test("Agent Plugins projection preserves the native package identity", () => {
	assert.equal(projection.name, "ryu.clangd-lsp");
	assert.equal(projection.version, manifest.version);
	assert.equal(projection.description, manifest.description);
	assert.equal(projection.repository, manifest.repository);
	assert.equal(projection.homepage, manifest.homepage);
	assert.deepEqual(projection.keywords, manifest.keywords);
	assert.deepEqual(projection.extensions["com.ryuhq.ryu"], {
		id: manifest.id,
		displayName: manifest.name,
	});
	assert.equal(projection.bin, undefined);
	assert.equal(projection.commands, undefined);
});

test("surfaces do not overstate browser or mobile language-server support", () => {
	assert.deepEqual(
		Object.fromEntries(
			Object.entries(manifest.surfaces).map(([surface, entry]) => [
				surface,
				entry.support,
			])
		),
		{
			gateway: "none",
			core: "full",
			desktop: "full",
			island: "limited",
			mobile: "limited",
			extension: "limited",
			web: "limited",
			cli: "full",
		}
	);
});
