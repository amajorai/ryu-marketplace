// Structural and integrity tests for the ChatGPT Web plugin bundle.
// Run with: node --test plugin.test.mjs

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const backendPath = join(here, "backend.js");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const backend = readFileSync(backendPath, "utf8");

test("manifest identity and backend integrity are valid", () => {
	assert.equal(manifest.id, "@ryu/chatgpt-web");
	assert.equal(manifest.name, "ChatGPT Web");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(typeof manifest.backend_code, "string");
	assert.equal(
		manifest.backend_sha256,
		createHash("sha256").update(manifest.backend_code, "utf8").digest("hex")
	);
	assert.equal(manifest.backend_code, backend);
});

test("the plugin consumes Ryu Browser and declares the required grants", () => {
	assert.deepEqual(manifest.requires.capabilities, [
		{ capability: "browser.control", min_version: "1.0.0" },
	]);
	assert.ok(manifest.requires.grants.includes("browser:control"));
	assert.deepEqual(manifest.permission_grants, [
		"sidecar:process",
		"browser:control",
		"preferences:read",
	]);
	assert.deepEqual(manifest.sidecars[0].host_api.grants, [
		"browser:control",
		"preferences:read",
	]);
});

test("the managed sidecar exposes a provider and only declared HTTP routes", () => {
	const sidecar = manifest.sidecars[0];
	assert.equal(sidecar.process.kind, "node");
	assert.equal(sidecar.process.entry, "./backend.js");
	assert.equal(sidecar.health_path, "/health");
	assert.deepEqual(
		sidecar.http.routes.map((route) => route.path),
		["/v1/models", "/v1/chat/completions", "/status"]
	);
	assert.deepEqual(sidecar.provides_provider, {
		id: "chatgpt-web",
		label: "ChatGPT Web",
		api: "openai-completions",
		base_path: "/v1",
		models: [
			"chatgpt-web/instant",
			"chatgpt-web/medium",
			"chatgpt-web/high",
			"chatgpt-web/extra-high",
			"chatgpt-web/pro",
		],
	});
});

test("browser automation is constrained to fixed ChatGPT Web navigation", () => {
	assert.match(backend, /https:\/\/chatgpt\.com/);
	assert.match(backend, /temporary-chat=true/);
	assert.match(backend, /browser.snapshot/);
	assert.match(backend, /browser.type/);
	assert.match(backend, /browser.click/);
	assert.match(backend, /generationComplete/);
	assert.match(backend, /completionQueue/);
	assert.doesNotMatch(backend, /browser.eval/);
	assert.doesNotMatch(backend, /document\.cookie/);
	assert.doesNotMatch(backend, /auth\.json/);
	assert.doesNotMatch(backend, /new Function|eval\s*\(/);
	assert.doesNotMatch(backend, /chatgpt\.com\/backend-api/);
});

test("the provider refuses unsupported image and tool requests", () => {
	assert.match(backend, /images_not_supported/);
	assert.match(backend, /tools_not_supported/);
	assert.match(backend, /login_required/);
	assert.match(backend, /model_option_not_found/);
});
