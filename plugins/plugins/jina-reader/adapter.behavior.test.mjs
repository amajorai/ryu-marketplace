// Executes the shipped capability fragment through the standard injected-scope
// harness. Provider effects are controlled; no live Reader or DNS lookup occurs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runOnce } from "../../../tools/toolsmith/harness.mjs";
import { scanPurity } from "../../../tools/toolsmith/purity.mjs";

const manifest = JSON.parse(
	readFileSync(new URL("./manifest.json", import.meta.url), "utf8")
);
const adapter = manifest.provides.find(
	(entry) => entry.capability === "web.extract"
).tools["web.extract"].adapter;
const code = readFileSync(new URL(adapter.code_file, import.meta.url), "utf8");
const violations = scanPurity(code);
if (violations.length > 0) {
	throw new Error(
		`Shipped Reader adapter failed purity review: ${JSON.stringify(violations)}`
	);
}

function execute(input, responses) {
	return runOnce({
		kind: "adapter",
		code,
		adapterTools: adapter.tools ?? [],
		testCase: { input, provider: { call: responses } },
	});
}

// structuredClone reads this enumerable response getter only when the harness
// dispatches callTool. That records a real attempted effect even if the adapter
// later throws: runCase's expectError branch does not itself check expectCalls.
function observedResponse(
	effect,
	response = { code: 200, data: { content: "fixture" } }
) {
	return {
		get code() {
			effect();
			return response.code;
		},
		data: response.data,
	};
}

for (const url of [
	"http://localhost/admin",
	"http://tenant.localhost/admin",
	"http://office.local/admin",
	"http://service.internal/admin",
	"http://0.0.0.0/admin",
	"http://10.2.3.4/admin",
	"http://169.254.169.254/latest/meta-data/",
	"http://172.16.0.1/admin",
	"http://172.31.255.254/admin",
	"http://192.168.2.3/admin",
	"http://224.0.0.1/admin",
	"http://255.255.255.255/admin",
	"http://2130706433/admin",
	"http://0x7f000001/admin",
	"http://0177.0.0.1/admin",
	"http://[::]/admin",
	"http://[fc00::1]/admin",
	"http://[fd12::1]/admin",
	"http://[fe80::1]/admin",
]) {
	test(`private target is denied before any provider effect: ${url}`, async () => {
		let effects = 0;
		await assert.rejects(
			execute({ url }, [
				observedResponse(() => {
					effects += 1;
				}),
			]),
			{
				name: "TypeError",
				message:
					"web.extract cannot send a local or private URL to Jina Reader",
			}
		);
		assert.equal(effects, 0);
	});
}

// These public-address bypass shapes are absent from the original cases. Keep
// denial assertions strict so root can reproduce and fix the actual guard.
for (const url of [
	"http://localhost./admin",
	"http://[fe90::1]/admin",
	"http://[ff02::1]/admin",
]) {
	test(`non-public address bypass must not reach Reader: ${url}`, async () => {
		let effects = 0;
		await assert.rejects(
			execute({ url }, [
				observedResponse(() => {
					effects += 1;
				}),
			]),
			{
				name: "TypeError",
				message:
					"web.extract cannot send a local or private URL to Jina Reader",
			}
		);
		assert.equal(effects, 0);
	});
}

test("canonical public URL and JSON format are the only caller fields forwarded", async () => {
	const response = { code: 200, data: { content: "# Public document" } };
	const { value, calls } = await execute(
		{
			url: "HTTPS://EXAMPLE.COM:443/a/../article?x=1",
			Accept: "text/html",
			Authorization: "Bearer caller-supplied-secret",
			headers: { "X-Workspace": "different-caller" },
		},
		[response]
	);
	assert.deepEqual(calls, [
		{
			path: "callTool",
			args: {
				url: "https://example.com/article?x=1",
				Accept: "application/json",
			},
		},
	]);
	assert.deepEqual(value, {
		results: [
			{
				url: "https://example.com/article?x=1",
				title: null,
				content: "# Public document",
				raw: response.data,
			},
		],
	});
});

test("provider refusal and malformed results remain errors rather than fabricated extraction", async () => {
	for (const response of [
		{ code: 403, error: { message: "Reader access denied" } },
		{ code: 429, error: { message: "Reader rate limit" } },
		{ code: "200", data: { content: "wrong code type" } },
		{ code: 200, data: { content: 12 } },
		{
			code: 200,
			data: {
				content: "Server error",
				warning: "Target URL returned error 503",
			},
		},
		null,
	]) {
		const { value, calls } = await execute(
			{ url: "https://example.com/article" },
			[response]
		);
		assert.deepEqual(value, { raw: response });
		assert.equal("results" in value, false);
		assert.deepEqual(calls, [
			{
				path: "callTool",
				args: {
					url: "https://example.com/article",
					Accept: "application/json",
				},
			},
		]);
	}
});

test("a rejected or cancelled tool call propagates and a later explicit retry uses fresh input", async () => {
	for (const error of [
		new Error("tool grant denied"),
		new DOMException("Caller cancelled", "AbortError"),
	]) {
		let effects = 0;
		await assert.rejects(
			execute({ url: "https://example.com/old" }, [
				observedResponse(() => {
					effects += 1;
					throw error;
				}),
			]),
			{ name: error.name, message: error.message }
		);
		assert.equal(
			effects,
			1,
			"a rejected effect is neither swallowed nor automatically retried"
		);
		const { value, calls } = await execute(
			{ url: "https://example.com/current" },
			[{ code: 200, data: { content: "Recovered" } }]
		);
		assert.deepEqual(calls, [
			{
				path: "callTool",
				args: {
					url: "https://example.com/current",
					Accept: "application/json",
				},
			},
		]);
		assert.equal(value.results[0].url, "https://example.com/current");
		assert.equal(value.results[0].content, "Recovered");
	}
});

test("canonical html/text formats map to X-Respond-With; markdown keeps Reader's default", async () => {
	const response = { code: 200, data: { content: "<p>Doc</p>" } };
	for (const [format, header] of [
		["html", "html"],
		["text", "text"],
		["markdown", undefined],
		["pdf", undefined],
		[undefined, undefined],
	]) {
		const { calls } = await execute(
			{ url: "https://example.com/doc", format },
			[response]
		);
		const args = {
			url: "https://example.com/doc",
			Accept: "application/json",
		};
		if (header !== undefined) {
			args["X-Respond-With"] = header;
		}
		assert.deepEqual(calls, [{ path: "callTool", args }], String(format));
	}
});
