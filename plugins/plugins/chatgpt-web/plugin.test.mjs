// Structural and integrity tests for the ChatGPT Web plugin bundle.
// Run with: node --test plugin.test.mjs

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const backendPath = join(here, "backend.js");
const verificationViteConfigPath = join(here, "verification", "vite.config.ts");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const backend = readFileSync(backendPath, "utf8").replace(/\r\n?/g, "\n");
const verificationViteConfig = readFileSync(verificationViteConfigPath, "utf8");
const browserManifest = JSON.parse(
	readFileSync(join(here, "../../../apps-store/browser/manifest.json"), "utf8")
);

test("manifest identity and backend integrity are valid", () => {
	assert.equal(manifest.id, "@ryu/chatgpt-web");
	assert.equal(manifest.name, "ChatGPT Web");
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(
		String.prototype.valueOf.call(manifest.backend_code),
		manifest.backend_code
	);
	assert.equal(
		manifest.backend_sha256,
		createHash("sha256").update(manifest.backend_code, "utf8").digest("hex")
	);
	assert.equal(manifest.backend_code, backend);
});

test("the plugin consumes Ryu Browser and declares the required grants", () => {
	assert.deepEqual(manifest.requires.capabilities, [
		{ capability: "browser.session", min_version: "1.0.0" },
	]);
	assert.deepEqual(manifest.requires.apps, [
		{ id: "@ryu/browser", min_version: "0.1.15" },
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
	const sessionProvider = browserManifest.provides.find(
		(entry) => entry.capability === "browser.session"
	);
	assert.deepEqual(sessionProvider, {
		capability: "browser.session",
		version: "1.0.0",
		title: "Browser session",
		sidecar: "browser",
		route: "/",
		grant: "browser:control",
		target: "local-machine",
	});
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

test("the verification bundle resolves dependencies from this checkout", () => {
	assert.doesNotMatch(verificationViteConfig, /ryu-closed/);
	assert.match(
		verificationViteConfig,
		/resolve\(repoRoot, "node_modules\/react\/index\.js"\)/
	);
	assert.match(
		verificationViteConfig,
		/resolve\(\s*repoRoot,\s*"apps\/desktop\/node_modules\/react-dom\/client\.js"\s*\)/
	);
});

function findManifests(directory) {
	if (!existsSync(directory)) {
		return [];
	}
	const found = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) {
			continue;
		}
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			found.push(...findManifests(path));
		} else if (entry.name === "manifest.json") {
			found.push(path);
		}
	}
	return found;
}

function sidecarPorts(path) {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		const sidecars = Array.isArray(parsed.sidecars) ? parsed.sidecars : [];
		return sidecars
			.map((sidecar) => sidecar.port)
			.filter((port) => Number.isInteger(port));
	} catch {
		return [];
	}
}

test("the sidecar port stays in the first-party band and is unique", () => {
	// sidecar-ports.mdx reserves 8300-8699 for community apps and plugins and
	// 7990-8112 for first-party ones. A first-party port inside the community
	// band would collide with the numbers we tell third parties to pick.
	const { port } = manifest.sidecars[0];
	assert.equal(port, 8027);
	assert.ok(port >= 7990 && port <= 8112, "first-party band");
	assert.ok(port < 8300 || port > 8699, "outside the community band");
	const repoRoot = resolve(here, "..", "..", "..");
	const others = [
		...findManifests(resolve(repoRoot, "apps-store")),
		...findManifests(resolve(repoRoot, "plugins-store")),
	].filter((path) => path !== manifestPath);
	assert.ok(others.length > 10, "the scan found the sibling manifests");
	const clashes = others.filter((path) => sidecarPorts(path).includes(port));
	assert.deepEqual(clashes, []);
});
