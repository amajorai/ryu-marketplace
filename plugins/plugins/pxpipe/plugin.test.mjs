// Co-located unit test for the `pxpipe` plugin manifest.
//
// Runner: `node --test` (zero external deps).
//
// Shape note: `pxpipe` is a *sidecar-only* plugin. It declares NO
// `contributes.turn_hooks`, NO `mcp_servers`, NO `provides`, NO runnables and NO
// `secret_headers`, so there is no inline hook `code` string to extract and
// execute (see the INLINE-HOOK plugins for that pattern). The strongest honest
// test for this manifest is contract validation: assert the JSON is valid, that
// the managed sidecar matches the invariants Core enforces in
// `crates/core/kernel-contracts/src/schema.rs` (`validate_sidecar_spec`), that the
// declared proxy routes are ones pxpipe actually serves, and that the two
// registration seams (compiled-in manifest, Core tier) are both wired.
//
// The negative assertions below are the load-bearing ones. Each pins a seam that
// was evaluated and rejected on evidence, and each would look like a harmless
// addition to someone who had not: `provides_provider` (Core stamps the sidecar's
// RYU_EXT_TOKEN as the provider apiKey, which a transparent proxy forwards
// upstream verbatim → 401), and `lazy`/`idle_stop_secs` (both are driven by the
// ext-proxy hop, which model traffic on the loopback port never touches → an
// unstarted proxy, or a live one reaped mid-turn). See README.md.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");
const RAW = readFileSync(MANIFEST_PATH, "utf8");

test("manifest.json is valid, parseable JSON", () => {
	assert.doesNotThrow(() => JSON.parse(RAW));
	const m = JSON.parse(RAW);
	assert.equal(typeof m, "object");
	assert.ok(m !== null && !Array.isArray(m), "manifest is a JSON object");
});

test("manifest carries required identity fields", () => {
	const m = JSON.parse(RAW);
	assert.equal(m.id, "@ryu/pxpipe");
	assert.equal(typeof m.name, "string");
	assert.ok(m.name.length > 0, "name is non-empty");
	assert.equal(typeof m.version, "string");
	assert.match(m.version, /^\d+\.\d+\.\d+$/, "version is semver");
	assert.equal(typeof m.description, "string");
	assert.ok(m.description.length > 0, "description is non-empty");
});

test("manifest declares no hook/mcp/tool/secret surfaces (sidecar-only shape)", () => {
	const m = JSON.parse(RAW);
	// Guard the classification this suite rests on: if any of these appear in a
	// future revision, this suite must grow the matching section.
	assert.equal(m.contributes, undefined, "no contributes block");
	assert.equal(m.mcp_servers, undefined, "no mcp_servers");
	assert.equal(m.provides, undefined, "no capability provides");
	assert.equal(m.secret_headers, undefined, "no secret_headers");
	assert.deepEqual(m.runnables, [], "runnables is empty");
});

test("declares no grants — Core-tier must not ask for sidecar:process", () => {
	const m = JSON.parse(RAW);
	// The Gateway DENIES `sidecar:process` at enable. A Core-tier plugin is
	// auto-allowed to run its sidecar (`may_run_sidecar`), so declaring the grant
	// buys nothing and fails the enable it was meant to permit.
	assert.deepEqual(m.permission_grants, []);
});

test("sidecar is well-formed (local npx command, pinned version, port_env)", () => {
	const m = JSON.parse(RAW);
	assert.ok(Array.isArray(m.sidecars), "sidecars is an array");
	assert.equal(m.sidecars.length, 1);

	const s = m.sidecars[0];
	assert.equal(s.name, "pxpipe");
	// Core: the name must be a safe single path segment.
	assert.doesNotMatch(s.name, /[/\\]|\.\./, "name is a safe path segment");

	const p = s.process;
	assert.ok(p && typeof p === "object", "process object present");
	assert.equal(p.kind, "local");
	assert.equal(typeof p.command, "string");
	assert.ok(p.command.length > 0, "command non-empty");
	assert.equal(p.command, "npx");

	assert.ok(Array.isArray(p.args), "args is an array");
	// A bare `pxpipe-proxy` would float onto whatever npm publishes next; the
	// version is the only thing making a cold start reproducible.
	const pkg = p.args.find((a) => a.startsWith("pxpipe-proxy"));
	assert.ok(pkg, "args install pxpipe-proxy");
	assert.match(pkg, /^pxpipe-proxy@\d+\.\d+\.\d+$/, "npm package is pinned");
	assert.ok(p.args.includes("-y"), "npx runs non-interactively");

	// `command_env` is deliberately ABSENT: an override would replace `npx` while
	// the args still say `-y pxpipe-proxy@…`, which the real `pxpipe` binary
	// rejects with `unknown option: -y` (exit 2).
	assert.equal(p.command_env, undefined, "no command_env override seam");

	// pxpipe reads `process.env.PORT`. Without port_env, Core's profile-shifted
	// port and the port the child binds diverge, so concurrent Core profiles
	// collide on 47821 and the health probe points at the wrong process.
	assert.equal(p.port_env, "PORT");
});

test("sidecar port and health path match what pxpipe actually serves", () => {
	const m = JSON.parse(RAW);
	const s = m.sidecars[0];

	assert.equal(typeof s.port, "number");
	assert.ok(
		Number.isInteger(s.port) && s.port > 0 && s.port < 65_536,
		"port in valid range"
	);
	assert.equal(s.port, 47_821, "pxpipe's documented default port");

	// Core: health_path must start with '/'. `/proxy-stats` returns 200 on a cold
	// instance with zero traffic; `/api/stats.json` is dashboard-only and 404s in
	// this build, which would leave the sidecar permanently unhealthy.
	assert.equal(typeof s.health_path, "string");
	assert.ok(s.health_path.startsWith("/"), "health_path starts with '/'");
	assert.equal(s.health_path, "/proxy-stats");
	assert.notEqual(s.health_path, "/api/stats.json");
});

test("sidecar is eager and never idle-stopped", () => {
	const m = JSON.parse(RAW);
	const s = m.sidecars[0];
	// Model traffic reaches pxpipe DIRECTLY on the loopback port (a provider
	// baseUrl), never through Core's ext-proxy — which is what drives both wake
	// and idle accounting. `lazy` would leave the proxy unstarted until someone
	// opened the dashboard; `idle_stop_secs` would reap it while it carries turns.
	assert.ok(!s.lazy, "sidecar is eager");
	assert.equal(s.idle_stop_secs, undefined, "no idle-stop");
});

test("sidecar does not register itself as a model provider", () => {
	const m = JSON.parse(RAW);
	const s = m.sidecars[0];
	// `register_sidecar_provider` stamps the sidecar's RYU_EXT_TOKEN as the
	// provider's apiKey. pxpipe is a transparent proxy — it never populates its
	// own `config.apiKey` on the Anthropic path — so that token would be forwarded
	// to api.anthropic.com verbatim and 401 every request. The latch is a
	// per-process AtomicBool, so a hand-edited key is re-stamped on every restart.
	// The seam is for credential-OWNING bridges (see examples/auth-bridge).
	assert.equal(s.provides_provider, undefined);
});

test("proxied routes are declared, loopback-safe, and all served by pxpipe", () => {
	const m = JSON.parse(RAW);
	const http = m.sidecars[0].http;
	assert.ok(http && typeof http === "object", "http proxy block present");
	assert.ok(Array.isArray(http.routes), "routes is an array");
	assert.ok(http.routes.length > 0, "at least one route");

	// Every declared path must be one pxpipe's dashboard router answers. An
	// undeclared path is 404'd by Core, and a declared-but-unserved one is a 404
	// from the sidecar wearing Core's authority.
	const SERVED = new Set([
		"/",
		"/dashboard",
		"/proxy-stats",
		"/proxy-recent",
		"/proxy-latest-png",
		"/api/stats.json",
		"/api/sessions.json",
		"/api/current-session.json",
		"/api/compression",
		"/api/image-source",
		"/fragments/*rest",
	]);
	for (const r of http.routes) {
		assert.equal(typeof r.path, "string");
		assert.ok(r.path.startsWith("/"), `route ${r.path} starts with '/'`);
		assert.ok(SERVED.has(r.path), `route ${r.path} is served by pxpipe`);
		// Secure by default: no route here is reachable by a caller with no
		// identity. The dashboard's kill switch (`POST /api/compression`) changes
		// how every subsequent turn is billed — never a public route.
		assert.notEqual(r.auth, "public", `route ${r.path} is not public`);
	}

	// The model-traffic paths (/v1/messages, /v1/chat/completions) are
	// deliberately NOT proxied: Core buffers proxied bodies, which would break
	// streaming, and the provider talks to the port directly anyway.
	for (const r of http.routes) {
		assert.ok(
			!r.path.startsWith("/v1"),
			`${r.path} must not proxy model traffic`
		);
	}

	assert.equal(http.mount, undefined, "sub-path forwarded verbatim");
	assert.equal(typeof http.max_body_bytes, "number");
	assert.ok(http.max_body_bytes > 0, "max_body_bytes caps proxy memory");
});

test("manifest is the only copy and Core compiles it in (registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree: no apps/core here at all
	}

	// There is no fixture COPY any more. Core `include_str!`s this manifest
	// straight from its package home, so a resurrected copy is a dead-edit trap:
	// the fixture would WIN for any include_str! still pointing at fixtures/, and
	// edits made here would silently go nowhere.
	const stale = join(
		coreSrc,
		"plugin_manifest",
		"fixtures",
		"pxpipe.manifest.json"
	);
	assert.ok(
		!existsSync(stale),
		`${stale} duplicates this manifest — a packaged manifest has ONE home, its package directory. Delete the fixture copy.`
	);

	const mod = readFileSync(join(coreSrc, "plugin_manifest", "mod.rs"), "utf8");
	// Registration seam: forgetting the include_str! leaves every other guard
	// passing while the plugin simply does not exist at runtime.
	assert.ok(
		mod.includes(
			'include_str!("../../../../plugins-store/plugins/pxpipe/manifest.json")'
		),
		"Core does not compile this manifest in from its package home — it would not exist at runtime"
	);
});

test("plugin is Core-tier but not default-on (the second registration seam)", () => {
	const coreSrc = join(HERE, "..", "..", "..", "apps", "core", "src");
	if (!existsSync(coreSrc)) {
		return; // satellite tree
	}
	const builtins = readFileSync(
		join(coreSrc, "plugins", "builtins.rs"),
		"utf8"
	);
	const id = JSON.parse(RAW).id;

	// Core tier is a REQUIREMENT: `may_run_sidecar` allows a managed sidecar at
	// Community tier only against the Gateway-approved `sidecar:process` grant,
	// which the Gateway denies at enable. Off this list the proxy never spawns.
	const corePlugins = builtins.slice(
		builtins.indexOf("pub const CORE_PLUGINS"),
		builtins.indexOf("];", builtins.indexOf("pub const CORE_PLUGINS"))
	);
	assert.ok(
		corePlugins.includes(`"${id}"`),
		`${id} must be in CORE_PLUGINS or its sidecar is refused at enable`
	);

	// …but NOT default-on: it needs Node on PATH, fetches an npm package on first
	// start, and does nothing until a provider is pointed at it by hand.
	const defaultOnIdx = builtins.indexOf("pub const CORE_DEFAULT_ON");
	if (defaultOnIdx >= 0) {
		const defaultOn = builtins.slice(
			defaultOnIdx,
			builtins.indexOf("];", defaultOnIdx)
		);
		assert.ok(
			!defaultOn.includes(`"${id}"`),
			`${id} must not be default-on — it has unmet host prerequisites`
		);
	}
});
