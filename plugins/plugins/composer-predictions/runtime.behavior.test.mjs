import assert from "node:assert/strict";
import test from "node:test";
import { fetchComposerPrediction } from "../../../packages/core-client/src/chat.ts";

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

test("a completed turn asks Core for one prediction for that conversation", async () => {
	const calls = [];
	const controller = new AbortController();
	const result = await fetchComposerPrediction(
		fixtureTarget(Response.json({ prediction: "now add tests" }), calls),
		"conversation/with spaces",
		controller.signal
	);

	assert.equal(result, "now add tests");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].input, "http://local-node.test/api/chat/prediction");
	assert.equal(calls[0].init.method, "POST");
	assert.deepEqual(JSON.parse(calls[0].init.body), {
		conversation_id: "conversation/with spaces",
	});
	assert.equal(calls[0].init.signal, controller.signal);
	assert.equal(calls[0].init.headers.Authorization, "Bearer node-token");
	assert.equal(calls[0].init.headers["x-ryu-user-jwt"], "user-session");
});

test("abstentions, blanks and HTTP errors all degrade to no ghost text", async () => {
	for (const response of [
		Response.json({ prediction: null }),
		Response.json({ prediction: "   " }),
		Response.json({}),
		new Response("unavailable", { status: 503 }),
	]) {
		assert.equal(
			await fetchComposerPrediction(fixtureTarget(response, []), "c1"),
			null
		);
	}
});

test("an aborted prediction request is silent", async () => {
	const controller = new AbortController();
	const target = {
		token: "node-token",
		url: "http://local-node.test",
		fetch(_input, init) {
			return new Promise((_resolve, reject) => {
				init.signal.addEventListener(
					"abort",
					() => reject(new DOMException("Aborted", "AbortError")),
					{ once: true }
				);
			});
		},
	};
	const pending = fetchComposerPrediction(target, "c2", controller.signal);
	controller.abort();
	assert.equal(await pending, null);
});
