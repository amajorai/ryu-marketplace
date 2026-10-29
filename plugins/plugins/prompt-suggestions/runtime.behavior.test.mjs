import assert from "node:assert/strict";
import test from "node:test";
import { fetchNextPromptSuggestions } from "../../../packages/core-client/src/chat.ts";

function fixtureTarget(response, calls) {
	return {
		token: "node-token",
		url: "http://local-node.test/",
		userJwt: "user-session",
		async fetch(input, init) {
			calls.push({ input: String(input), init });
			return response;
		},
	};
}

test("completed assistant suggestions use the current node and preserve the conversation id", async () => {
	const calls = [];
	const controller = new AbortController();
	const result = await fetchNextPromptSuggestions(
		fixtureTarget(
			Response.json({
				suggestions: ["Add regression tests", "Explain the risk"],
			}),
			calls
		),
		"conversation/with spaces",
		controller.signal
	);

	assert.deepEqual(result, ["Add regression tests", "Explain the risk"]);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].input, "http://local-node.test/api/chat/suggestions");
	assert.equal(calls[0].init.method, "POST");
	assert.deepEqual(JSON.parse(calls[0].init.body), {
		conversation_id: "conversation/with spaces",
	});
	assert.equal(calls[0].init.signal, controller.signal);
	assert.equal(calls[0].init.headers.Authorization, "Bearer node-token");
	assert.equal(calls[0].init.headers["x-ryu-user-jwt"], "user-session");
});

test("an empty Core result and HTTP errors both degrade to no follow-up chips", async () => {
	const emptyCalls = [];
	const empty = await fetchNextPromptSuggestions(
		fixtureTarget(
			new Response("{}", { headers: { "content-type": "application/json" } }),
			emptyCalls
		),
		"conversation-1"
	);
	assert.deepEqual(empty, []);

	const failedCalls = [];
	const failed = await fetchNextPromptSuggestions(
		fixtureTarget(
			new Response(JSON.stringify({ error: "conversation unavailable" }), {
				status: 503,
			}),
			failedCalls
		),
		"conversation-1"
	);
	assert.deepEqual(failed, []);
	assert.equal(failedCalls.length, 1);
});

test("an aborted suggestion request is silent and does not show stale chips", async () => {
	const calls = [];
	const controller = new AbortController();
	const target = {
		token: "node-token",
		url: "http://local-node.test",
		async fetch(input, init) {
			calls.push({ input: String(input), init });
			return new Promise((_resolve, reject) => {
				init.signal.addEventListener(
					"abort",
					() => reject(new DOMException("Aborted", "AbortError")),
					{ once: true }
				);
			});
		},
	};
	const pending = fetchNextPromptSuggestions(
		target,
		"conversation-2",
		controller.signal
	);
	controller.abort();

	assert.deepEqual(await pending, []);
	assert.equal(calls.length, 1);
});

test("a failed request can be retried exactly once without retaining stale results", async () => {
	const calls = [];
	let attempt = 0;
	const target = {
		token: "node-token",
		url: "http://local-node.test",
		async fetch(input, init) {
			calls.push({ input: String(input), init });
			attempt += 1;
			if (attempt === 1) {
				return new Response("temporarily unavailable", { status: 503 });
			}
			return Response.json({ suggestions: ["Retry succeeded"] });
		},
	};

	assert.deepEqual(
		await fetchNextPromptSuggestions(target, "conversation-retry"),
		[]
	);
	assert.deepEqual(
		await fetchNextPromptSuggestions(target, "conversation-retry"),
		["Retry succeeded"]
	);
	assert.equal(calls.length, 2);
	assert.deepEqual(
		calls.map(({ init }) => JSON.parse(init.body)),
		[
			{ conversation_id: "conversation-retry" },
			{ conversation_id: "conversation-retry" },
		]
	);
});

test("concurrent conversations keep their request identities and results isolated", async () => {
	const releases = new Map();
	const calls = [];
	const target = {
		token: "node-token",
		url: "http://local-node.test",
		async fetch(input, init) {
			const conversationId = JSON.parse(init.body).conversation_id;
			calls.push({ input: String(input), conversationId });
			return new Promise((resolve) => releases.set(conversationId, resolve));
		},
	};

	const first = fetchNextPromptSuggestions(target, "conversation-a");
	const second = fetchNextPromptSuggestions(target, "conversation-b");
	assert.deepEqual(calls, [
		{
			input: "http://local-node.test/api/chat/suggestions",
			conversationId: "conversation-a",
		},
		{
			input: "http://local-node.test/api/chat/suggestions",
			conversationId: "conversation-b",
		},
	]);

	releases.get("conversation-b")(Response.json({ suggestions: ["second"] }));
	releases.get("conversation-a")(Response.json({ suggestions: ["first"] }));
	assert.deepEqual(await Promise.all([first, second]), [["first"], ["second"]]);
});
