// Co-located contract test for the `bytebot` plugin.
// Runner: `node --test` (zero dependencies).
//
// `bytebot` is a declarative HTTP-tool plugin and the SECOND provider of the
// `computer.control` capability — the one that makes that layer swappable at all.
// Every verb here MOVES A POINTER or PRESSES A KEY on a real desktop session, so
// these tests are stricter than the search providers': a wrong `action` constant, a
// dropped required field, or a clamp left off does not degrade a result, it drives
// the wrong input into someone's screen.
//
// Every constant asserted below was read out of the upstream source, not the docs
// site (which disagrees with it on the endpoint path):
//   packages/bytebotd/src/main.ts                      -> app.listen(9990)
//   packages/bytebotd/src/computer-use/*.controller.ts -> @Controller('computer-use') @Post()
//   packages/bytebotd/src/computer-use/dto/*.ts        -> field names, enums, optionality
//   packages/bytebot-agent/src/agent/agent.computer-use.ts -> `${BASE}/computer-use`

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "manifest.json");
const raw = readFileSync(manifestPath, "utf8");

test("manifest.json is valid parseable JSON", () => {
	assert.doesNotThrow(() => JSON.parse(raw));
});

const manifest = JSON.parse(raw);

test("has required top-level identity fields", () => {
	assert.equal(manifest.id, "bytebot");
	assert.equal(typeof manifest.name, "string");
	assert.ok(manifest.name.length > 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test("declares an engines.ryu constraint", () => {
	assert.equal(typeof manifest.engines?.ryu, "string");
	assert.match(manifest.engines.ryu, /^>=/);
});

const bySlug = new Map(manifest.runnables.map((r) => [r.config.slug, r]));

test("contributes six http tool runnables with namespaced native slugs", () => {
	assert.ok(Array.isArray(manifest.runnables));
	assert.equal(manifest.runnables.length, 6);
	for (const r of manifest.runnables) {
		assert.equal(r.kind, "tool");
		assert.equal(r.config.backend, "http");
		assert.equal(r.config.method, "POST");
		// A slug containing `__` registers under its NATIVE id rather than being
		// prefixed with `app__`, which is what makes the verb bindings below resolve.
		assert.ok(
			r.config.slug.startsWith("bytebot__"),
			`slug ${r.config.slug} not namespaced`
		);
	}
	assert.deepEqual([...bySlug.keys()].sort(), [
		"bytebot__application",
		"bytebot__click",
		"bytebot__screenshot",
		"bytebot__scroll",
		"bytebot__type_keys",
		"bytebot__type_text",
	]);
});

test("every tool posts to the ONE documented daemon endpoint over loopback", () => {
	// bytebotd exposes a single unified action endpoint; the action is a body field,
	// not a path. The docs site says `/computer-use/computer`; the daemon's own
	// controller and Bytebot's own agent both say `/computer-use`, and the source wins.
	for (const r of manifest.runnables) {
		const u = new URL(r.config.url);
		assert.equal(
			u.protocol,
			"http:",
			`${r.config.slug} must stay loopback http`
		);
		assert.equal(u.hostname, "127.0.0.1");
		assert.equal(u.port, "9990");
		assert.equal(u.pathname, "/computer-use");
	}
});

test("no tool carries credentials — the daemon has no auth to send", () => {
	for (const r of manifest.runnables) {
		assert.equal(r.config.secret_headers, undefined);
		assert.equal(r.config.header_params, undefined);
	}
	// ...and therefore no BYOK settings tab either. A `secret` field whose key nothing
	// reads is decoration, and would imply the endpoint is authenticated when it is not.
	assert.equal(manifest.contributes, undefined);
});

test("permission_grants gate egress to exactly the host the tools call", () => {
	assert.deepEqual(manifest.permission_grants, ["tool:http-egress:127.0.0.1"]);
	const hosts = new Set(
		manifest.runnables.map((r) => new URL(r.config.url).hostname)
	);
	for (const h of hosts) {
		assert.ok(
			manifest.permission_grants.includes(`tool:http-egress:${h}`),
			`no egress grant for called host ${h}`
		);
	}
});

test("each tool pins its `action` constant in body_defaults", () => {
	// The endpoint is one URL for sixteen operations; `action` is what selects one.
	// Getting it wrong sends a well-formed request that does the WRONG THING.
	const expected = {
		bytebot__screenshot: "screenshot",
		bytebot__click: "click_mouse",
		bytebot__type_text: "type_text",
		bytebot__type_keys: "type_keys",
		bytebot__scroll: "scroll",
		bytebot__application: "application",
	};
	for (const [slug, action] of Object.entries(expected)) {
		assert.equal(bySlug.get(slug).config.body_defaults.action, action);
		// `action` is a constant, never a model-supplied argument.
		assert.ok(
			!Object.hasOwn(bySlug.get(slug).config.input_schema.properties, "action"),
			`${slug} must not let a caller choose the action`
		);
	}
});

test("the daemon's REQUIRED fields it does not ask us for are defaulted", () => {
	// ClickMouseActionDto: `button` and `clickCount` are NOT optional upstream, so a
	// click that omits them 400s. They are defaulted rather than made required here.
	const click = bySlug.get("bytebot__click").config.body_defaults;
	assert.equal(click.button, "left");
	assert.equal(click.clickCount, 1);
	// ScrollActionDto: `scrollCount` is likewise required upstream.
	assert.equal(
		bySlug.get("bytebot__scroll").config.body_defaults.scrollCount,
		3
	);
});

test("only the screenshot unwraps its body; the action tools stay enveloped", () => {
	// The five action handlers return `Promise<void>` — an empty body on SUCCESS.
	// Unwrapped, that reaches the caller as `""`, which reads like a failure (the same
	// trap mem0's 204 DELETE documents). `{status, body}` says "it worked".
	assert.equal(bySlug.get("bytebot__screenshot").config.unwrap_body, true);
	for (const slug of [
		"bytebot__click",
		"bytebot__type_text",
		"bytebot__type_keys",
		"bytebot__scroll",
		"bytebot__application",
	]) {
		assert.equal(
			bySlug.get(slug).config.unwrap_body,
			false,
			`${slug} must not unwrap an empty success body`
		);
	}
});

test("nothing is fail_open — a dead daemon must not read as a no-op", () => {
	for (const r of manifest.runnables) {
		assert.equal(
			r.config.fail_open,
			false,
			`${r.config.slug}: a click that never happened must surface as an error`
		);
	}
});

test("required schema properties are actually declared in properties", () => {
	for (const r of manifest.runnables) {
		const sch = r.config.input_schema;
		assert.equal(sch.type, "object");
		for (const key of sch.required ?? []) {
			assert.ok(
				Object.hasOwn(sch.properties, key),
				`${r.config.slug}: required key ${key} not in properties`
			);
		}
	}
});

test("enum-valued arguments match the daemon's own enums exactly", () => {
	const click = bySlug.get("bytebot__click").config.input_schema.properties;
	assert.deepEqual(click.button.enum, ["left", "right", "middle"]);
	const scroll = bySlug.get("bytebot__scroll").config.input_schema.properties;
	assert.deepEqual(scroll.direction.enum, ["up", "down", "left", "right"]);
	// ApplicationName is a CLOSED enum — this is the whole reason computer__focus_app
	// is not bound, so the list living in the schema is load-bearing, not cosmetic.
	const app = bySlug.get("bytebot__application").config.input_schema.properties;
	assert.deepEqual(app.application.enum, [
		"firefox",
		"1password",
		"thunderbird",
		"vscode",
		"terminal",
		"desktop",
		"directory",
	]);
});

// ── Capability-provider contract (the swappable-layer seam) ─────────────────

const provides = manifest.provides ?? [];
const byCapability = new Map(provides.map((p) => [p.capability, p]));

test("provides exactly the computer.control capability", () => {
	assert.equal(provides.length, 1);
	assert.ok(byCapability.has("computer.control"));
	assert.match(byCapability.get("computer.control").version, /^\d+\.\d+\.\d+/);
});

test("is selectable and claims no default", () => {
	const entry = byCapability.get("computer.control");
	// Selectability requires UNANIMITY across every provider of a capability: if any
	// one omits it, the capability resolves to nothing at all.
	assert.equal(entry.selectable, true);
	// `ghost` is the declared default for computer.control; exactly one may claim it.
	assert.ok(entry.default === undefined || entry.default === false);
});

test("declares that it drives a REMOTE desktop, not this machine", () => {
	// The whole reason `target` exists. bytebotd drives the desktop IT runs on — a
	// containerized Linux desktop in the shipped product — so selecting bytebot is
	// NOT a second way to drive your own computer. That was stated only in this
	// manifest's prose `description`, which nothing structured could read, so the
	// layer picker rendered the ghost→bytebot swap exactly like an exa→tavily swap.
	assert.equal(byCapability.get("computer.control").target, "remote-desktop");
});

test("binds five canonical verbs and deliberately not focus_app", () => {
	// A single-underscore typo (`computer_click`) is not an error anywhere — the verb
	// lookup simply misses and the layer silently serves nothing. Hence this test.
	const entry = byCapability.get("computer.control");
	assert.deepEqual(Object.keys(entry.tools).sort(), [
		"computer__capture",
		"computer__click",
		"computer__key",
		"computer__scroll",
		"computer__type",
	]);
	// The exclusion is the decision, so assert it rather than leaving it implied:
	// Bytebot's `application` action takes a closed enum, the canonical verb takes a
	// free-form app name, and binding it would 400 on schema-legal input.
	assert.equal(entry.tools.computer__focus_app, undefined);
});

test("each verb forwards to a tool this manifest actually declares", () => {
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			assert.ok(
				bySlug.has(binding.tool),
				`${verb} forwards to ${binding.tool}, which this manifest does not declare`
			);
		}
	}
});

test("verbs forward to the tool whose action actually performs them", () => {
	const t = byCapability.get("computer.control").tools;
	assert.equal(t.computer__capture.tool, "bytebot__screenshot");
	assert.equal(t.computer__click.tool, "bytebot__click");
	assert.equal(t.computer__type.tool, "bytebot__type_text");
	assert.equal(t.computer__scroll.tool, "bytebot__scroll");
	// The one that is easy to get wrong: `type_keys` presses every key then releases
	// every key (one chord, what the canonical verb promises). `press_keys` is a HALF
	// action with a required `press: up|down` — a chord sent through it would leave
	// the modifiers physically held down on the desktop.
	assert.equal(t.computer__key.tool, "bytebot__type_keys");
	assert.equal(
		bySlug.get(t.computer__key.tool).config.body_defaults.action,
		"type_keys"
	);
});

test("argument renames target arguments the provider tool really accepts", () => {
	for (const p of provides) {
		for (const [verb, binding] of Object.entries(p.tools)) {
			const props = bySlug.get(binding.tool).config.input_schema.properties;
			for (const [canonical, target] of Object.entries(binding.args ?? {})) {
				if (target === "") {
					continue; // an explicit drop: the provider cannot express it
				}
				const field = target.endsWith("[]") ? target.slice(0, -2) : target;
				assert.ok(
					Object.hasOwn(props, field),
					`${verb}: maps ${canonical} onto '${field}', which ${binding.tool} does not accept`
				);
			}
			// The same must hold for a template's top-level fields.
			for (const field of Object.keys(binding.arg_template ?? {})) {
				assert.ok(
					Object.hasOwn(props, field),
					`${verb}: templates '${field}', which ${binding.tool} does not accept`
				);
			}
		}
	}
});

test("click templates the coordinate pair the daemon nests", () => {
	const binding = byCapability.get("computer.control").tools.computer__click;
	// The canonical verb passes flat `x`/`y`; the daemon takes `coordinates: {x, y}`.
	// Whole-string placeholders keep the JSON type, so these stay numbers.
	assert.deepEqual(binding.arg_template, {
		coordinates: { x: "{x}", y: "{y}" },
	});
	assert.equal(binding.args.count, "clickCount");
	// `button` is NOT renamed: the canonical enum and the daemon's are the same three
	// strings, so it passes through untouched. Asserting that stops a redundant
	// rename being added later and drifting.
	assert.equal(binding.args.button, undefined);
});

test("scroll DROPS x/y instead of templating them", () => {
	const binding = byCapability.get("computer.control").tools.computer__scroll;
	// This is the subtle one. `arg_template` builds its object shape unconditionally,
	// and the daemon's `coordinates` is @IsOptional @ValidateNested over {x, y} both
	// @IsNumber — so a scroll with NO coordinates (legal: optional in the canonical
	// schema) would send `coordinates: {}` and be rejected. Dropping them scrolls at
	// the pointer's current position, the fallback the canonical `x` description
	// already warns about. Templating here would 4xx on schema-legal input.
	assert.equal(binding.arg_template, undefined);
	assert.equal(binding.args.x, "");
	assert.equal(binding.args.y, "");
	assert.equal(binding.args.amount, "scrollCount");
});

test("scroll clamps amount, and click does not clamp count", () => {
	const tools = byCapability.get("computer.control").tools;
	// `scrollCount` counts WHEEL TICKS with a 150ms sleep between them. An `amount` a
	// model intends as pixels (500) would be 500 ticks — 75 seconds of scrolling.
	assert.deepEqual(tools.computer__scroll.arg_clamp, {
		amount: { min: 1, max: 10 },
	});
	// The clamp must actually NARROW the canonical bound to be worth declaring; the
	// tool's own schema is where that ceiling is restated.
	const scrollProps =
		bySlug.get("bytebot__scroll").config.input_schema.properties;
	assert.equal(scrollProps.scrollCount.maximum, 10);
	// `count` maxes at 3 canonically and the daemon declares no upper bound, so a
	// clamp there would narrow nothing.
	assert.equal(tools.computer__click.arg_clamp, undefined);
});

test("capture declares no response map", () => {
	const binding = byCapability.get("computer.control").tools.computer__capture;
	// The payload IS the record and it is a base64 PNG. Any `response` map would
	// rewrite it into {provider, results:[{…, raw}]}, duplicating a megabyte-scale
	// string into the item AND its raw copy. The facade's untouched
	// {provider, raw:{image}} passthrough is the right shape — same choice ghost makes.
	assert.equal(binding.response, undefined);
});

test("no verb binding invents an argument the canonical schema lacks", () => {
	// The canonical arg names, from the verb table in capability_tools.rs. A rename
	// keyed on a name the facade never passes is dead config that looks alive.
	const canonical = {
		computer__capture: [],
		computer__click: ["x", "y", "button", "count"],
		computer__type: ["text"],
		computer__key: ["keys"],
		computer__scroll: ["x", "y", "direction", "amount"],
	};
	for (const [verb, binding] of Object.entries(
		byCapability.get("computer.control").tools
	)) {
		for (const name of Object.keys(binding.args ?? {})) {
			assert.ok(
				canonical[verb].includes(name),
				`${verb}: renames '${name}', which is not a canonical argument`
			);
		}
		for (const name of Object.keys(binding.arg_clamp ?? {})) {
			assert.ok(
				canonical[verb].includes(name),
				`${verb}: clamps '${name}', which is not a canonical argument`
			);
		}
	}
});

test("manifest is byte-identical to the Core fixture (registration seam)", () => {
	const fixturePath = resolve(
		here,
		"../../apps/core/src/plugin_manifest/fixtures/bytebot.manifest.json"
	);
	// Skip on the SATELLITE tree (no apps/core at all), but fail loudly if the
	// fixtures directory is here and only the file name is wrong — otherwise a
	// broken path silently skips instead of catching real drift.
	if (!existsSync(dirname(fixturePath))) {
		return;
	}
	assert.deepEqual(
		readFileSync(manifestPath),
		readFileSync(fixturePath),
		"manifest.json drifted from the Core fixture — they must be byte-identical"
	);
});
