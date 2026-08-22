// Ryu-native ChatGPT Web provider.
//
// This sidecar deliberately uses the Ryu Browser capability instead of reaching
// into the Codex desktop app or reading ChatGPT cookies. It opens ChatGPT Web's
// Temporary Chat URL in the user's already-signed-in Ryu Browser, selects the
// requested reasoning profile, submits a prompt through accessibility refs, and
// translates the completed answer to OpenAI chat/completions.
//
// The implementation is intentionally dependency-free. Core writes this file from
// `manifest.json` and runs it under the managed extension-host bootstrap.

const env = process.env;
const CORE_PORT = (env.RYU_CORE_PORT || "").trim();
const PLUGIN_ID = (env.RYU_EXT_PLUGIN_ID || "").trim();
const EXT_TOKEN = (env.RYU_EXT_TOKEN || "").trim();

const CHATGPT_ORIGIN = "https://chatgpt.com";
const TEMPORARY_CHAT_URL = `${CHATGPT_ORIGIN}/?temporary-chat=true`;
const BROWSER_CAPABILITY_URL = CORE_PORT
	? `http://127.0.0.1:${CORE_PORT}/api/host/capability/browser.control`
	: "";

const DEFAULT_MODELS = [
	"chatgpt-web/instant",
	"chatgpt-web/medium",
	"chatgpt-web/high",
	"chatgpt-web/extra-high",
	"chatgpt-web/pro",
];

const MODEL_PROFILES = {
	"extra-high": {
		labels: ["Extra High", "Extra-high", "Extra high"],
	},
	high: { labels: ["High"] },
	instant: { labels: ["Instant", "Fast"] },
	medium: { labels: ["Medium"] },
	pro: { labels: ["Pro"] },
};

const MAX_REQUEST_BYTES = 2_000_000;
const MAX_MESSAGES = 100;
const READY_TIMEOUT_MS = 30_000;
const RESPONSE_TIMEOUT_MS = 120_000;
const POLL_MS = 500;

let hostContext = null;
let activeTabId = null;
let modelPreferenceCache = null;
let completionQueue = Promise.resolve();

class BridgeError extends Error {
	constructor(code, message, status = 502) {
		super(message);
		this.name = "BridgeError";
		this.code = code;
		this.status = status;
	}
}

function log(level, message, extra = {}) {
	const record = {
		level,
		src: "ryu-chatgpt-web",
		plugin: PLUGIN_ID,
		msg: message,
		...extra,
	};
	process.stderr.write(`${JSON.stringify(record)}\n`);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestId() {
	if (globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalise(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/[‐‑‒–—]/g, "-")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function modelKey(model) {
	const value = String(model || "")
		.trim()
		.toLowerCase();
	const withoutPrefix = value.startsWith("chatgpt-web/")
		? value.slice("chatgpt-web/".length)
		: value;
	return withoutPrefix.replace(/_/g, "-");
}

function modelProfile(model) {
	const key = modelKey(model);
	const profile = MODEL_PROFILES[key];
	if (!profile) {
		throw new BridgeError(
			"model_not_supported",
			`model '${model}' is not one of the ChatGPT Web profiles`,
			400
		);
	}
	return { key, ...profile };
}

function modelIdsFromPreference(value) {
	if (typeof value !== "string") {
		return DEFAULT_MODELS;
	}
	const ids = value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => /^[a-z0-9._/-]+$/i.test(item))
		.slice(0, 12);
	return ids.length > 0 ? ids : DEFAULT_MODELS;
}

async function configuredModels() {
	if (modelPreferenceCache) {
		return modelPreferenceCache;
	}
	if (!hostContext?.host?.call) {
		modelPreferenceCache = DEFAULT_MODELS;
		return modelPreferenceCache;
	}
	try {
		const preference = await hostContext.host.call("preferences.get", {
			key: "chatgpt-web.models",
		});
		modelPreferenceCache = modelIdsFromPreference(preference);
	} catch (error) {
		log("warn", "model preference unavailable; using defaults", {
			error: error instanceof Error ? error.message : "unknown error",
		});
		modelPreferenceCache = DEFAULT_MODELS;
	}
	return modelPreferenceCache;
}

function jsonError(error) {
	if (error instanceof BridgeError) {
		return {
			status: error.status,
			json: { error: { code: error.code, message: error.message } },
		};
	}
	log("error", "request failed", {
		error: error instanceof Error ? error.message : "unknown error",
	});
	return {
		status: 502,
		json: {
			error: {
				code: "bridge_failed",
				message: "ChatGPT Web bridge request failed",
			},
		},
	};
}

function parseRequestBody(raw) {
	if (typeof raw !== "string" || raw.length > MAX_REQUEST_BYTES) {
		throw new BridgeError(
			"request_too_large",
			"request body is too large",
			413
		);
	}
	try {
		const parsed = JSON.parse(raw || "{}");
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("body must be an object");
		}
		return parsed;
	} catch {
		throw new BridgeError("invalid_json", "invalid JSON body", 400);
	}
}

async function browserCall(tool, args = {}, timeoutMs = RESPONSE_TIMEOUT_MS) {
	if (!(BROWSER_CAPABILITY_URL && EXT_TOKEN)) {
		throw new BridgeError(
			"browser_unavailable",
			"Ryu Core did not provide the browser capability bridge",
			503
		);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	let response;
	try {
		response = await fetch(BROWSER_CAPABILITY_URL, {
			method: "POST",
			headers: {
				accept: "application/json",
				authorization: `Bearer ${EXT_TOKEN}`,
				"content-type": "application/json",
				"x-ryu-plugin-id": PLUGIN_ID,
			},
			body: JSON.stringify({ args, tool }),
			signal: controller.signal,
		});
	} catch (error) {
		if (error?.name === "AbortError") {
			throw new BridgeError(
				"browser_timeout",
				`browser capability '${tool}' timed out`,
				504
			);
		}
		throw new BridgeError(
			"browser_unavailable",
			`browser capability '${tool}' could not be reached`,
			503
		);
	} finally {
		clearTimeout(timeout);
	}

	const raw = await response.text();
	let payload = {};
	try {
		payload = raw ? JSON.parse(raw) : {};
	} catch {
		throw new BridgeError(
			"browser_protocol_error",
			`browser capability '${tool}' returned invalid JSON`,
			502
		);
	}
	if (!response.ok || payload.ok === false) {
		const detail =
			typeof payload.error === "string" ? payload.error : "request rejected";
		const code =
			response.status === 401 || response.status === 403
				? "browser_not_authorized"
				: response.status === 404
					? "browser_not_available"
					: "browser_request_failed";
		throw new BridgeError(
			code,
			`browser capability '${tool}': ${detail}`,
			response.status >= 500 ? 502 : response.status
		);
	}
	return payload;
}

function tabIsChatGPT(tab) {
	try {
		const url = new URL(tab?.url || "");
		return url.protocol === "https:" && url.hostname === "chatgpt.com";
	} catch {
		return false;
	}
}

function tabList(payload) {
	return Array.isArray(payload?.tabs) ? payload.tabs : [];
}

async function ensureTemporaryTab() {
	const tabs = tabList(await browserCall("browser.tabs", {}));
	// Only reuse a tab this provider opened and that is still on ChatGPT. Never
	// adopt an arbitrary user-owned ChatGPT tab from the browser tab list.
	const current = tabs.find(
		(tab) => tab.id === activeTabId && tabIsChatGPT(tab)
	);
	if (current) {
		const navigated = await browserCall("browser.navigate_tab", {
			tab_id: current.id,
			url: TEMPORARY_CHAT_URL,
		});
		activeTabId = navigated.tab?.id || current.id;
		return activeTabId;
	}

	const opened = await browserCall("browser.navigate", {
		url: TEMPORARY_CHAT_URL,
	});
	if (typeof opened.tab?.id !== "string" || opened.tab.id.trim() === "") {
		throw new BridgeError(
			"browser_protocol_error",
			"browser did not return a tab id",
			502
		);
	}
	activeTabId = opened.tab.id;
	return activeTabId;
}

function elementText(element) {
	return [element?.name, element?.value]
		.filter((value) => typeof value === "string" && value.trim() !== "")
		.join(" ")
		.trim();
}

function elementsOf(snapshot) {
	return Array.isArray(snapshot?.elements) ? snapshot.elements : [];
}

function isLoginSnapshot(snapshot) {
	const url = typeof snapshot?.tab?.url === "string" ? snapshot.tab.url : "";
	if (/^https:\/\/chatgpt\.com\/auth\/login(?:[/?#]|$)/i.test(url)) {
		return true;
	}
	const text = elementsOf(snapshot).map(elementText).join(" ");
	return (
		/\b(sign in|log in|create account)\b/i.test(text) && !findComposer(snapshot)
	);
}

function findComposer(snapshot) {
	const elements = elementsOf(snapshot);
	const named = elements.find((element) => {
		if (!["textbox", "combobox"].includes(element.role)) {
			return false;
		}
		return /message|chat|ask|prompt|compose|type/i.test(elementText(element));
	});
	if (named) {
		return named;
	}
	return elements.find((element) => element.role === "textbox") || null;
}

function modelLabelMatches(element, labels) {
	const text = normalise(elementText(element));
	return labels.some((label) => {
		const expected = normalise(label);
		return (
			text === expected ||
			text.includes(` ${expected} `) ||
			text.startsWith(`${expected} `) ||
			text.endsWith(` ${expected}`)
		);
	});
}

function modelControl(snapshot) {
	const elements = elementsOf(snapshot);
	return elements.find((element) => {
		if (!["button", "combobox"].includes(element.role)) {
			return false;
		}
		const text = elementText(element);
		if (/send|attach|voice|read aloud|new chat|settings|menu/i.test(text)) {
			return false;
		}
		return /model|instant|medium|high|extra|pro|thinking|auto|gpt/i.test(text);
	});
}

function modelOption(snapshot, labels) {
	return elementsOf(snapshot).find((element) => {
		if (
			!["button", "combobox", "menuitem", "option", "tab"].includes(
				element.role
			)
		) {
			return false;
		}
		return modelLabelMatches(element, labels);
	});
}

async function snapshotTab(tabId) {
	return browserCall("browser.snapshot", { tab_id: tabId });
}

async function waitForComposer(tabId, timeoutMs = READY_TIMEOUT_MS) {
	const deadline = Date.now() + timeoutMs;
	let lastSnapshot = null;
	while (Date.now() < deadline) {
		lastSnapshot = await snapshotTab(tabId);
		if (isLoginSnapshot(lastSnapshot)) {
			throw new BridgeError(
				"login_required",
				"sign in to ChatGPT Web in the Ryu Browser, then retry",
				401
			);
		}
		if (findComposer(lastSnapshot)) {
			return lastSnapshot;
		}
		await sleep(POLL_MS);
	}
	throw new BridgeError(
		"chatgpt_not_ready",
		"ChatGPT Web did not expose a message composer",
		504
	);
}

async function selectModel(tabId, model) {
	const profile = modelProfile(model);
	let snapshot = await snapshotTab(tabId);
	const current = modelControl(snapshot);
	if (current && modelLabelMatches(current, profile.labels)) {
		return snapshot;
	}
	if (!current) {
		throw new BridgeError(
			"model_control_not_found",
			"ChatGPT Web did not expose its model selector",
			502
		);
	}

	await browserCall("browser.click", { ref: current.ref, tab_id: tabId });
	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		snapshot = await snapshotTab(tabId);
		const option = modelOption(snapshot, profile.labels);
		if (option && option.ref !== current.ref) {
			await browserCall("browser.click", { ref: option.ref, tab_id: tabId });
			const settled = await snapshotTab(tabId);
			const selected = modelControl(settled);
			if (!selected || modelLabelMatches(selected, profile.labels)) {
				return settled;
			}
		}
		await sleep(POLL_MS);
	}
	throw new BridgeError(
		"model_option_not_found",
		`ChatGPT Web did not expose the '${profile.labels[0]}' model option`,
		502
	);
}

function contentToText(content) {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return String(content ?? "");
	}
	const chunks = [];
	for (const part of content) {
		if (typeof part === "string") {
			chunks.push(part);
			continue;
		}
		if (!part || typeof part !== "object") {
			continue;
		}
		if (part.type === "text" && typeof part.text === "string") {
			chunks.push(part.text);
			continue;
		}
		if (part.type === "image_url" || part.type === "input_image") {
			throw new BridgeError(
				"images_not_supported",
				"ChatGPT Web provider currently accepts text messages only",
				400
			);
		}
	}
	return chunks.join("\n");
}

function buildPrompt(messages, marker) {
	const lines = [
		"You are answering through ChatGPT Web inside Ryu's browser-backed model provider.",
		`Request marker: ${marker}`,
		"Return only the answer to the conversation below. Do not mention this wrapper, the marker, or browser automation.",
		"Conversation:",
	];
	for (const message of messages) {
		const role =
			typeof message.role === "string" ? message.role.toUpperCase() : "USER";
		const text = contentToText(message.content).trim();
		if (text === "") {
			continue;
		}
		lines.push(`[${role}]\n${text}`);
	}
	return lines.join("\n\n");
}

function responseText(snapshot, marker) {
	const elements = elementsOf(snapshot);
	const markerIndex = elements.findIndex((element) =>
		elementText(element).includes(marker)
	);
	if (markerIndex < 0) {
		return "";
	}

	const ignored =
		/^(copy|regenerate|retry|edit|good response|bad response|read aloud|stop generating|share)$/i;
	const chunks = [];
	for (const element of elements.slice(markerIndex + 1)) {
		if (
			[
				"button",
				"checkbox",
				"combobox",
				"link",
				"menuitem",
				"textbox",
			].includes(element.role)
		) {
			continue;
		}
		const text = elementText(element).replaceAll(marker, "").trim();
		if (
			text === "" ||
			ignored.test(text) ||
			text.includes("RYU_CHATGPT_WEB_")
		) {
			continue;
		}
		if (chunks.at(-1) !== text) {
			chunks.push(text);
		}
	}
	return chunks.join("\n").trim();
}

function generationComplete(snapshot) {
	const elements = elementsOf(snapshot);
	const generating = elements.some(
		(element) =>
			element.role === "button" &&
			/\bstop generating\b/i.test(elementText(element))
	);
	if (generating) {
		return false;
	}
	return elements.some(
		(element) =>
			["button", "link"].includes(element.role) &&
			/\b(?:regenerate(?: response)?|retry)\b/i.test(elementText(element))
	);
}

async function withCompletionLock(task) {
	const previous = completionQueue;
	let release;
	completionQueue = new Promise((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		return await task();
	} finally {
		release();
	}
}

async function submitAndWait(tabId, prompt, marker) {
	let snapshot = await waitForComposer(tabId);
	let composer = findComposer(snapshot);
	if (!composer) {
		throw new BridgeError(
			"chatgpt_not_ready",
			"message composer disappeared",
			504
		);
	}
	await browserCall("browser.type", {
		tab_id: tabId,
		ref: composer.ref,
		text: prompt,
		replace: true,
		submit: true,
	});

	const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		snapshot = await snapshotTab(tabId);
		if (isLoginSnapshot(snapshot)) {
			throw new BridgeError(
				"login_required",
				"ChatGPT Web requires sign-in in the Ryu Browser",
				401
			);
		}
		const answer = responseText(snapshot, marker);
		if (answer !== "" && generationComplete(snapshot)) {
			return answer;
		}
		composer = findComposer(snapshot);
		if (!composer && answer === "") {
			await sleep(POLL_MS);
			continue;
		}
		await sleep(POLL_MS);
	}
	throw new BridgeError(
		"response_timeout",
		"ChatGPT Web did not produce an answer before the timeout",
		504
	);
}

function validateMessages(messages) {
	if (!Array.isArray(messages) || messages.length === 0) {
		throw new BridgeError("messages_required", "messages is required", 400);
	}
	if (messages.length > MAX_MESSAGES) {
		throw new BridgeError("too_many_messages", "too many messages", 400);
	}
	for (const message of messages) {
		if (!message || typeof message !== "object") {
			throw new BridgeError(
				"invalid_message",
				"each message must be an object",
				400
			);
		}
		if (typeof message.role !== "string" || message.role.trim() === "") {
			throw new BridgeError(
				"invalid_message",
				"each message needs a role",
				400
			);
		}
		contentToText(message.content);
	}
}

async function complete(body) {
	const request = parseRequestBody(body);
	validateMessages(request.messages);
	if (Array.isArray(request.tools) && request.tools.length > 0) {
		throw new BridgeError(
			"tools_not_supported",
			"ChatGPT Web provider currently accepts text messages only",
			400
		);
	}
	const models = await configuredModels();
	const model =
		typeof request.model === "string" && request.model.trim() !== ""
			? request.model.trim()
			: models[0];
	if (!models.includes(model)) {
		throw new BridgeError(
			"model_not_available",
			`model '${model}' is not enabled`,
			400
		);
	}
	return withCompletionLock(async () => {
		const marker = `RYU_CHATGPT_WEB_${requestId().replaceAll("-", "").toUpperCase()}`;
		const prompt = buildPrompt(request.messages, marker);
		const tabId = await ensureTemporaryTab();
		await waitForComposer(tabId);
		await selectModel(tabId, model);
		const answer = await submitAndWait(tabId, prompt, marker);
		return { answer, model, marker };
	});
}

function openAiCompletion(model, answer) {
	const completionTokens = Math.max(1, Math.ceil(answer.length / 4));
	return {
		id: `chatcmpl-${requestId()}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				message: { role: "assistant", content: answer },
				finish_reason: "stop",
			},
		],
		usage: {
			prompt_tokens: 0,
			completion_tokens: completionTokens,
			total_tokens: completionTokens,
		},
	};
}

async function chatCompletions(body) {
	const request = parseRequestBody(body);
	const result = await complete(body);
	const completion = openAiCompletion(result.model, result.answer);
	if (request.stream === true) {
		return {
			status: 200,
			headers: { "content-type": "text/event-stream; charset=utf-8" },
			stream: (async function* () {
				yield `data: ${JSON.stringify({
					...completion,
					choices: [
						{
							index: 0,
							delta: { role: "assistant", content: result.answer },
							finish_reason: null,
						},
					],
				})}\n\n`;
				yield `data: ${JSON.stringify({
					id: completion.id,
					object: "chat.completion.chunk",
					created: completion.created,
					model: result.model,
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
				})}\n\n`;
				yield "data: [DONE]\n\n";
			})(),
		};
	}
	return { status: 200, json: completion };
}

function modelList(models) {
	return {
		object: "list",
		data: models.map((id) => ({
			id,
			object: "model",
			created: 0,
			owned_by: "chatgpt-web",
		})),
	};
}

async function status() {
	const tabs = tabList(await browserCall("browser.tabs", {}));
	const chatgptTab = tabs.find(tabIsChatGPT);
	let signedIn = false;
	if (chatgptTab) {
		try {
			const snapshot = await snapshotTab(chatgptTab.id);
			signedIn = Boolean(findComposer(snapshot)) && !isLoginSnapshot(snapshot);
		} catch {
			// The status surface is diagnostic; a navigation race should not expose page
			// content or turn a healthy browser into a hard failure.
		}
	}
	return {
		ok: true,
		provider: "chatgpt-web",
		browser: {
			available: true,
			chatgpt_tab_open: Boolean(chatgptTab),
			signed_in: signedIn,
		},
		temporary_chat: true,
	};
}

export async function activate(ctx) {
	hostContext = ctx;
	log("info", "activated", {
		browser_capability: Boolean(BROWSER_CAPABILITY_URL),
	});
	ctx.http.onRequest(async (req) => {
		try {
			if (req.method === "GET" && req.path === "/v1/models") {
				return { json: modelList(await configuredModels()) };
			}
			if (req.method === "GET" && req.path === "/status") {
				return { json: await status() };
			}
			if (req.method === "POST" && req.path === "/v1/chat/completions") {
				log("info", "completion started");
				const response = await chatCompletions(req.body);
				log("info", "completion finished");
				return response;
			}
			return null;
		} catch (error) {
			return jsonError(error);
		}
	});
}
