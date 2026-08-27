// Tool body for `ego_browser.dispatch`, run in Core's Deno sandbox.
//
// This file is the readable authoring source. `build.mjs` seals it into the one
// inline_deno runnable in manifest.json so the signed wire manifest stays
// self-contained. The seven canonical browser verbs use tiny code_file adapters
// that add the immutable operation name and call this dispatcher.

const RESULT_PREFIX = "__RYU_EGO_RESULT_V1__:";
const operations = new Set([
	"tabs",
	"navigate",
	"snapshot",
	"click",
	"type",
	"scroll",
	"screenshot",
]);
const operation = String(input.operation ?? "");
if (!operations.has(operation)) {
	throw new Error(`unsupported Ego Browser operation: ${operation}`);
}

const scope = String(
	caller?.conversation_id ?? caller?.agent_id ?? "default"
)
	.replace(/[^a-zA-Z0-9_.-]/g, "-")
	.slice(0, 80) || "default";
const taskSpace = caller?.conversation_id
	? `ryu-conversation-${scope}`
	: `ryu-agent-${scope}`;
const inputJson = JSON.stringify(input ?? {});
const childScript = `
await taskSpaces.useOrCreate(${JSON.stringify(taskSpace)});
const input = JSON.parse(${JSON.stringify(inputJson)});
const operation = ${JSON.stringify(operation)};

const resolveTab = async () => {
	const tabs = await browser.listTabs({ includeChrome: false });
	const targetId = input.tab_id || tabs.find((tab) => tab.active)?.targetId || tabs[0]?.targetId;
	if (!targetId) throw new Error("ego-browser has no open tabs");
	await browser.switchTab(targetId);
	return targetId;
};

let result;
if (operation === "tabs") {
	result = { tabs: await browser.listTabs({ includeChrome: false }) };
} else if (operation === "navigate") {
	if (typeof input.url !== "string" || input.url.trim() === "") {
		throw new Error("browser.navigate requires a non-empty url");
	}
	const tab = await browser.openOrReuseTab(input.url, { wait: true });
	result = { tab_id: tab.targetId, tab };
} else if (operation === "snapshot") {
	if (input.tab_id !== undefined && typeof input.tab_id !== "string") {
		throw new Error("browser.snapshot tab_id must be a string");
	}
	const tabId = await resolveTab();
	const raw = await page.snapshotRaw();
	result = { tab_id: tabId, snapshot: raw.content, refs: raw.refs };
} else if (operation === "click") {
	if (typeof input.ref !== "string" || input.ref.trim() === "") {
		throw new Error("browser.click requires a ref");
	}
	const tabId = await resolveTab();
	await page.locator(input.ref).click();
	result = { ok: true, tab_id: tabId };
} else if (operation === "type") {
	if (typeof input.ref !== "string" || input.ref.trim() === "") {
		throw new Error("browser.type requires a ref");
	}
	if (typeof input.text !== "string") {
		throw new Error("browser.type requires text");
	}
	const tabId = await resolveTab();
	await page.locator(input.ref).fill(input.text, { clearFirst: input.replace === true });
	if (input.submit === true) await page.locator(input.ref).press("Enter");
	result = { ok: true, tab_id: tabId };
} else if (operation === "scroll") {
	const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
	const vector = vectors[input.direction];
	if (!vector) {
		throw new Error("browser.scroll direction must be up, down, left, or right");
	}
	const tabId = await resolveTab();
	const info = await page.info();
	const amount = Number.isInteger(input.amount)
		? Math.abs(input.amount)
		: Math.max(1, Math.round(info.h * 0.8));
	await page.mouse.wheel(vector[0] * amount, vector[1] * amount);
	result = { ok: true, tab_id: tabId };
} else if (operation === "screenshot") {
	const tabId = await resolveTab();
	const capture = await cdp("Page.captureScreenshot", { format: "png" });
	if (typeof capture?.data !== "string") {
		throw new Error("ego-browser returned no screenshot data");
	}
	result = { tab_id: tabId, image: capture.data, encoding: "base64", mime: "image/png" };
}

console.log(${JSON.stringify(RESULT_PREFIX)} + JSON.stringify(result));
`;

const child = new Deno.Command("ego-browser", {
	args: ["nodejs"],
	stdin: "piped",
	stdout: "piped",
	stderr: "piped",
}).spawn();
const writer = child.stdin.getWriter();
await writer.write(new TextEncoder().encode(childScript));
await writer.close();
const output = await child.output();
const stdout = new TextDecoder().decode(output.stdout);
const stderr = new TextDecoder().decode(output.stderr).trim();
if (!output.success) {
	throw new Error(
		`ego-browser failed: ${(stderr || stdout || "the command exited unsuccessfully").slice(-1000)}`
	);
}
const frames = stdout
	.split("\n")
	.filter((line) => line.startsWith(RESULT_PREFIX));
if (frames.length !== 1) {
	throw new Error(
		`ego-browser returned ${frames.length} result frames: ${(stderr || stdout).slice(-1000)}`
	);
}
const serialized = frames[0].slice(RESULT_PREFIX.length);
try {
	return JSON.parse(serialized);
} catch {
	throw new Error(`ego-browser returned invalid JSON: ${serialized.slice(0, 1000)}`);
}
