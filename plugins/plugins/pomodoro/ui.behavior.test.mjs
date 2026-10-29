// Drives the real widget module in happy-dom with a controlled clock. The
// interval is captured rather than run, so each test advances time explicitly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRequire = createRequire(
	resolve(here, "../../../apps/desktop/package.json")
);
const { Window } = createRequire(
	desktopRequire.resolve("@happy-dom/global-registrator")
)("happy-dom");
const html = readFileSync(join(here, "pomodoro.html"), "utf8");
const scripts = [
	...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g),
];

const MINUTE = 60_000;
const T0 = 1_800_000_000_000;

function mount({ toolOutput = {}, widgetState = {}, bridgeExtras = {} } = {}) {
	const window = new Window();
	window.window = window;
	window.globalThis = window;
	window.document.body.innerHTML = html.replace(
		/<script type="module">[\s\S]*?<\/script>/g,
		""
	);

	const clock = { now: T0 };
	class ControlledDate extends Date {
		static now() {
			return clock.now;
		}
	}
	window.Date = ControlledDate;
	const intervals = [];
	window.setInterval = (callback, delay) => {
		intervals.push({ callback, delay });
		return intervals.length;
	};

	const stateWrites = [];
	const heights = [];
	const bridge = {
		theme: "light",
		displayMode: "inline",
		toolOutput,
		widgetState,
		setWidgetState(next) {
			this.widgetState = next;
			stateWrites.push(structuredClone(next));
			return Promise.resolve();
		},
		notifyIntrinsicHeight(height) {
			heights.push(height);
		},
		...bridgeExtras,
	};
	window.ryu = bridge;
	window.openai = bridge;
	runInNewContext(scripts[0][1], window, {
		filename: "plugins-store/plugins/pomodoro/pomodoro.html",
	});

	const $ = (id) => window.document.getElementById(id);
	return {
		window,
		bridge,
		stateWrites,
		heights,
		intervals,
		$,
		text: (id) => $(id).textContent,
		click: (id) => $(id).click(),
		advance(ms) {
			clock.now += ms;
			for (const { callback } of intervals) {
				callback();
			}
		},
	};
}

function dotStates(widget) {
	return [...widget.$("dots").children].map((dot) =>
		dot.getAttribute("data-state")
	);
}

test("renders the tool output settings before any interaction", () => {
	assert.equal(scripts.length, 1, "the widget should ship one inline module");
	const widget = mount({
		toolOutput: {
			task: "Draft chapter 3",
			focusMinutes: 50,
			shortBreakMinutes: 10,
			longBreakMinutes: 20,
			roundsBeforeLongBreak: 3,
			autoStart: false,
		},
	});
	assert.equal(widget.text("phase"), "Focus");
	assert.equal(widget.text("task"), "Draft chapter 3");
	assert.equal(widget.text("time"), "50:00");
	assert.equal(widget.text("toggle-label"), "Start");
	assert.equal(widget.text("rounds"), "Round 1 of 3");
	assert.deepEqual(dotStates(widget), ["current", "todo", "todo"]);
	assert.equal(widget.$("icon-play").hasAttribute("hidden"), false);
	assert.equal(widget.$("icon-pause").hasAttribute("hidden"), true);
	assert.equal(widget.$("fill").style.transform, "scaleX(0)");
	assert.equal(
		widget.window.document.documentElement.getAttribute("data-status"),
		"idle"
	);
	assert.equal(widget.$("time").getAttribute("role"), "timer");
	assert.equal(
		widget.$("popout").hidden,
		true,
		"no display-mode bridge, no button"
	);
	assert.ok(widget.heights.length > 0, "first paint reports its height");
	assert.equal(
		widget.stateWrites.length,
		0,
		"rendering alone must not write state"
	);
	assert.equal(widget.intervals[0].delay, 250);
	widget.window.close();
});

test("falls back to classic defaults for missing or malformed settings", () => {
	const widget = mount({
		toolOutput: { focusMinutes: -5, shortBreakMinutes: "7", task: 9 },
	});
	assert.equal(widget.text("time"), "25:00");
	assert.equal(widget.text("task"), "");
	assert.equal(widget.text("rounds"), "Round 1 of 4");
	assert.equal(dotStates(widget).length, 4);
	widget.window.close();
});

test("start, pause and resume keep exact remaining time and persist it", () => {
	const widget = mount({ toolOutput: { focusMinutes: 1 } });
	widget.click("toggle");
	assert.equal(widget.text("toggle-label"), "Pause");
	assert.deepEqual(widget.stateWrites.at(-1).pomodoro, {
		phase: "focus",
		status: "running",
		endsAt: T0 + MINUTE,
		remainingMs: MINUTE,
		completedRounds: 0,
		sound: true,
	});
	assert.equal(widget.text("announce"), "Focus started.");
	assert.equal(widget.$("icon-play").hasAttribute("hidden"), true);
	assert.equal(widget.$("icon-pause").hasAttribute("hidden"), false);

	widget.advance(20_500);
	assert.equal(widget.text("time"), "00:40");
	widget.click("toggle");
	assert.equal(widget.text("toggle-label"), "Resume");
	assert.equal(widget.stateWrites.at(-1).pomodoro.status, "paused");
	assert.equal(widget.stateWrites.at(-1).pomodoro.remainingMs, 39_500);
	assert.equal(widget.stateWrites.at(-1).pomodoro.endsAt, null);

	widget.advance(10 * MINUTE);
	assert.equal(widget.text("time"), "00:40", "a paused timer does not move");
	widget.click("toggle");
	assert.equal(
		widget.stateWrites.at(-1).pomodoro.endsAt,
		T0 + 20_500 + 10 * MINUTE + 39_500
	);
	widget.window.close();
});

test("a finished focus round credits a round and waits at a short break", () => {
	const widget = mount({
		toolOutput: {
			focusMinutes: 1,
			shortBreakMinutes: 2,
			roundsBeforeLongBreak: 2,
		},
	});
	widget.click("toggle");
	widget.advance(MINUTE);
	assert.equal(widget.text("phase"), "Short break");
	assert.equal(widget.text("time"), "02:00");
	assert.equal(widget.text("toggle-label"), "Start");
	assert.equal(widget.text("rounds"), "1 round completed");
	assert.equal(
		widget.window.document.documentElement.getAttribute("data-phase"),
		"short_break"
	);
	assert.equal(
		widget.text("announce"),
		"Time for a short break. Press Start when ready."
	);
	assert.deepEqual(widget.stateWrites.at(-1).pomodoro, {
		phase: "short_break",
		status: "idle",
		endsAt: null,
		remainingMs: 2 * MINUTE,
		completedRounds: 1,
		sound: true,
	});
	widget.window.close();
});

test("auto-start cycles to a long break after the configured rounds", () => {
	const widget = mount({
		toolOutput: {
			focusMinutes: 1,
			shortBreakMinutes: 1,
			longBreakMinutes: 3,
			roundsBeforeLongBreak: 2,
			autoStart: true,
		},
	});
	widget.click("toggle");
	widget.advance(MINUTE); // focus 1 → short break
	assert.equal(widget.text("phase"), "Short break");
	assert.equal(widget.text("toggle-label"), "Pause");
	widget.advance(MINUTE); // short break → focus 2
	assert.equal(widget.text("phase"), "Focus");
	assert.equal(widget.text("rounds"), "Round 2 of 2");
	assert.deepEqual(dotStates(widget), ["done", "current"]);
	widget.advance(MINUTE); // focus 2 → long break
	assert.equal(widget.text("phase"), "Long break");
	assert.equal(widget.text("rounds"), "2 rounds completed");
	assert.deepEqual(dotStates(widget), ["done", "done"]);
	assert.equal(widget.text("time"), "03:00");
	assert.equal(widget.stateWrites.at(-1).pomodoro.completedRounds, 2);
	assert.equal(
		widget.stateWrites.at(-1).pomodoro.endsAt,
		T0 + 3 * MINUTE + 3 * MINUTE
	);
	widget.advance(3 * MINUTE); // long break → focus 3 starts a new cycle
	assert.equal(widget.text("rounds"), "Round 1 of 2");
	assert.deepEqual(dotStates(widget), ["current", "todo"]);
	widget.window.close();
});

test("a late tick catches up every elapsed phase on the original cadence", () => {
	const widget = mount({
		toolOutput: {
			focusMinutes: 1,
			shortBreakMinutes: 1,
			roundsBeforeLongBreak: 4,
			autoStart: true,
		},
	});
	widget.click("toggle");
	widget.advance(2.5 * MINUTE); // focus, break done; halfway through focus 2
	assert.equal(widget.text("phase"), "Focus");
	assert.equal(widget.text("time"), "00:30");
	assert.equal(widget.stateWrites.at(-1).pomodoro.completedRounds, 1);
	widget.window.close();
});

test("the progress bar tracks elapsed time in the current phase", () => {
	const widget = mount({ toolOutput: { focusMinutes: 1 } });
	widget.click("toggle");
	widget.advance(30_000);
	assert.equal(widget.$("fill").style.transform, "scaleX(0.5)");
	widget.click("toggle");
	widget.advance(5 * MINUTE);
	assert.equal(
		widget.$("fill").style.transform,
		"scaleX(0.5)",
		"a paused phase keeps its progress"
	);
	widget.window.close();
});

test("skip never credits a focus round and returns from a break to focus", () => {
	const widget = mount({
		toolOutput: { focusMinutes: 1, shortBreakMinutes: 2 },
	});
	widget.click("skip");
	assert.equal(widget.text("phase"), "Short break");
	assert.equal(widget.text("toggle-label"), "Start");
	assert.equal(widget.stateWrites.at(-1).pomodoro.completedRounds, 0);
	assert.equal(widget.text("announce"), "Skipped to short break.");
	widget.click("skip");
	assert.equal(widget.text("phase"), "Focus");
	assert.equal(widget.text("time"), "01:00");
	widget.window.close();
});

test("reset returns to the first focus round but keeps the sound choice", () => {
	const widget = mount({ toolOutput: { focusMinutes: 1 } });
	widget.click("sound");
	assert.equal(widget.$("sound").title, "Chime off");
	assert.equal(widget.$("icon-sound-on").hasAttribute("hidden"), true);
	assert.equal(widget.$("icon-sound-off").hasAttribute("hidden"), false);
	assert.equal(widget.$("sound").getAttribute("aria-pressed"), "false");
	widget.click("toggle");
	widget.advance(MINUTE);
	widget.click("reset");
	assert.deepEqual(widget.stateWrites.at(-1).pomodoro, {
		phase: "focus",
		status: "idle",
		endsAt: null,
		remainingMs: MINUTE,
		completedRounds: 0,
		sound: false,
	});
	assert.equal(widget.text("rounds"), "Round 1 of 4");
	widget.window.close();
});

test("a reload restores a running session from its wall-clock deadline", () => {
	const widget = mount({
		toolOutput: { focusMinutes: 25 },
		widgetState: {
			other: "kept",
			pomodoro: {
				phase: "focus",
				status: "running",
				endsAt: T0 + 90_000,
				remainingMs: 25 * MINUTE,
				completedRounds: 3,
				sound: true,
			},
		},
	});
	assert.equal(widget.text("time"), "01:30");
	assert.equal(widget.text("toggle-label"), "Pause");
	assert.equal(widget.text("rounds"), "Round 4 of 4");
	widget.advance(90_000);
	assert.equal(widget.text("phase"), "Long break");
	assert.equal(
		widget.stateWrites.at(-1).other,
		"kept",
		"foreign state survives"
	);
	widget.window.close();
});

test("corrupted saved state starts a fresh session", () => {
	for (const pomodoro of [
		{ phase: "nap", status: "idle" },
		{ phase: "focus", status: "running", endsAt: "soon" },
		"broken",
	]) {
		const widget = mount({
			toolOutput: { focusMinutes: 10 },
			widgetState: { pomodoro },
		});
		assert.equal(widget.text("phase"), "Focus");
		assert.equal(widget.text("time"), "10:00");
		assert.equal(widget.text("toggle-label"), "Start");
		widget.window.close();
	}
	const clamped = mount({
		toolOutput: { focusMinutes: 10 },
		widgetState: {
			pomodoro: { phase: "focus", status: "paused", remainingMs: 99 * MINUTE },
		},
	});
	assert.equal(
		clamped.text("time"),
		"10:00",
		"remaining time never exceeds the phase"
	);
	assert.equal(clamped.text("toggle-label"), "Resume");
	clamped.window.close();
});

test("a rejected state write keeps the timer running", async () => {
	const widget = mount({
		toolOutput: { focusMinutes: 1 },
		bridgeExtras: {
			setWidgetState() {
				return Promise.reject(new Error("offline"));
			},
		},
	});
	widget.click("toggle");
	await new Promise((resolveTurn) => setImmediate(resolveTurn));
	widget.advance(30_000);
	assert.equal(widget.text("time"), "00:30");
	widget.window.close();
});

test("pop out asks for picture-in-picture and reports refusal", async () => {
	const requests = [];
	let refuse = false;
	const widget = mount({
		bridgeExtras: {
			requestDisplayMode(request) {
				requests.push(request);
				return refuse ? Promise.reject(new Error("denied")) : Promise.resolve();
			},
		},
	});
	const popout = widget.$("popout");
	assert.equal(popout.hidden, false);
	widget.click("popout");
	assert.equal(popout.disabled, true);
	widget.click("popout");
	await new Promise((resolveTurn) => setImmediate(resolveTurn));
	assert.equal(requests.length, 1, "in-flight requests are not repeated");
	assert.equal(requests[0].mode, "pip");
	assert.equal(popout.disabled, false);

	refuse = true;
	widget.click("popout");
	await new Promise((resolveTurn) => setImmediate(resolveTurn));
	assert.equal(widget.text("announce"), "Pop out is not available here.");

	widget.bridge.displayMode = "pip";
	widget.window.dispatchEvent(new widget.window.Event("ryu:set_globals"));
	assert.equal(popout.hidden, true, "already popped out");
	widget.window.close();
});

test("host global updates re-theme and apply new idle settings", () => {
	const widget = mount({ toolOutput: { focusMinutes: 25 } });
	widget.bridge.theme = "dark";
	widget.bridge.toolOutput = { focusMinutes: 45 };
	widget.window.dispatchEvent(new widget.window.Event("openai:set_globals"));
	assert.equal(
		widget.window.document.documentElement.getAttribute("data-theme"),
		"dark"
	);
	assert.equal(widget.text("time"), "45:00");
	widget.window.close();
});
