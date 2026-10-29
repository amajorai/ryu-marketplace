import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publishPreference, state } from "./test-fixtures/state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../../../apps/desktop");
const appHostRoot = resolve(here, "../../../packages/app-host");
const appPackageUrl = pathToFileURL(resolve(appRoot, "package.json")).href;
const appRequire = createRequire(resolve(appRoot, "package.json"));
const reactModuleUrl = pathToFileURL(appRequire.resolve("react")).href;
const TypeScript = appRequire("typescript");
const compiledTestsDirectory = mkdtempSync(
	join(tmpdir(), "ryu-ambient-audio-test-")
);
function compileDesktopModule(sourcePath, destination) {
	const output = TypeScript.transpileModule(readFileSync(sourcePath, "utf8"), {
		compilerOptions: {
			module: TypeScript.ModuleKind.ESNext,
			target: TypeScript.ScriptTarget.ES2022,
		},
		fileName: sourcePath,
	});
	writeFileSync(destination, output.outputText);
	return pathToFileURL(destination).href;
}

const ambientAudioUrl = compileDesktopModule(
	join(appRoot, "src/audio/ambient-agent-audio.ts"),
	join(compiledTestsDirectory, "ambient-agent-audio.mjs")
);
const hookUrl = compileDesktopModule(
	join(appRoot, "src/hooks/useAgentAmbientAudio.ts"),
	join(compiledTestsDirectory, "useAgentAmbientAudio.mjs")
);
// The hook reads audio specs through the real Desktop contribution parser, so
// compile that parser and its App Host schemas instead of replacing them.
const appHostViewsUrl = compileDesktopModule(
	join(appHostRoot, "src/views.ts"),
	join(compiledTestsDirectory, "app-host-views.mjs")
);
const appHostLiveActivityUrl = compileDesktopModule(
	join(appHostRoot, "src/live-activity.ts"),
	join(compiledTestsDirectory, "app-host-live-activity.mjs")
);
const pluginWireValuesUrl = compileDesktopModule(
	join(appRoot, "src/lib/api/plugin-wire-values.ts"),
	join(compiledTestsDirectory, "plugin-wire-values.mjs")
);
const pluginContributionSpecsUrl = compileDesktopModule(
	join(appRoot, "src/lib/api/plugin-contribution-specs.ts"),
	join(compiledTestsDirectory, "plugin-contribution-specs.mjs")
);
const compiledRelativeAliases = new Map([
	["./views.ts", appHostViewsUrl],
	["./plugin-wire-values.ts", pluginWireValuesUrl],
]);
const compiledDirectoryUrl = pathToFileURL(`${compiledTestsDirectory}/`).href;
const fixture = (name) => pathToFileURL(join(here, "test-fixtures", name)).href;
const aliases = new Map([
	["react", reactModuleUrl],
	["@ryu/app-host/views", appHostViewsUrl],
	["@ryu/app-host/live-activity", appHostLiveActivityUrl],
	["@/src/lib/api/plugin-contribution-specs.ts", pluginContributionSpecsUrl],
	["@/src/hooks/useActiveNode.ts", fixture("use-active-node.mjs")],
	[
		"@/src/hooks/usePluginContributions.ts",
		fixture("use-plugin-contributions.mjs"),
	],
	["@/src/lib/api/client.ts", fixture("client.mjs")],
	["@/src/lib/api/preferences.ts", fixture("preferences.mjs")],
	["@/src/store/useLiveActivityStore.ts", fixture("use-working-agent.mjs")],
	["@/src/audio/ambient-agent-audio.ts", ambientAudioUrl],
]);
registerHooks({
	resolve(specifier, context, nextResolve) {
		const alias = aliases.get(specifier);
		if (alias) {
			return { shortCircuit: true, url: alias };
		}
		const compiledParent = context.parentURL?.startsWith(compiledDirectoryUrl);
		const relativeAlias = compiledParent
			? compiledRelativeAliases.get(specifier)
			: undefined;
		if (relativeAlias) {
			return { shortCircuit: true, url: relativeAlias };
		}
		// Compiled modules live in a temporary directory; resolve their package
		// imports (zod) from Desktop exactly as the app bundle does.
		return nextResolve(
			specifier,
			compiledParent ? { ...context, parentURL: appPackageUrl } : context
		);
	},
});

const React = appRequire("react");
const { createRoot } = appRequire("react-dom/client");
const { GlobalRegistrator } = appRequire("@happy-dom/global-registrator");
const { ambientAudioController } = await import(ambientAudioUrl);
const { useAgentAmbientAudio } = await import(hookUrl);

interfaceTestSetup();

function interfaceTestSetup() {
	GlobalRegistrator.register();
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

class FakeAudio {
	currentTime = 0;
	loop = false;
	paused = true;
	pauseCount = 0;
	playCount = 0;
	preload = "";
	src;
	volume = 0;

	constructor(source) {
		this.src = source;
	}

	pause() {
		this.pauseCount += 1;
		this.paused = true;
	}

	async play() {
		this.playCount += 1;
		this.paused = false;
	}

	load() {}
}

test("settings and active-agent state control one shared ambient player", async () => {
	state.activeNode = "local-node";
	state.contributions = [
		{
			id: "ambient-audio",
			plugin: "@ryu/ambient-elevator",
			spec: { audio: { src: "/sounds/elevator-4.mp3", loop: true } },
		},
	];
	state.preferences = new Map([
		["ambient-elevator-enabled", "true"],
		["ambient-elevator-volume", "35"],
	]);
	state.preferenceListeners.clear();
	state.preferenceReads = [];
	state.working = true;
	const created = [];
	globalThis.Audio = class extends FakeAudio {
		constructor(source) {
			super(source);
			created.push(this);
		}
	};

	let forceRender = () => undefined;
	function Host() {
		useAgentAmbientAudio();
		const [, setVersion] = React.useState(0);
		forceRender = () => setVersion((version) => version + 1);
		return null;
	}

	const root = createRoot(document.createElement("div"));
	await React.act(async () => {
		root.render(React.createElement(Host));
		await Promise.resolve();
	});

	assert.equal(
		created.length,
		1,
		"concurrent agent work should still share one Audio instance"
	);
	assert.equal(created[0].playCount, 1);
	assert.equal(created[0].volume, 0.35);
	assert.equal(created[0].loop, true);
	assert.deepEqual(
		state.preferenceReads.map(({ nodeUrl, key }) => [nodeUrl, key]),
		[
			["http://local-node.ryu.test", "ambient-elevator-enabled"],
			["http://local-node.ryu.test", "ambient-elevator-volume"],
		]
	);

	await React.act(async () => {
		publishPreference("ambient-elevator-enabled", "false");
	});
	assert.equal(
		created[0].paused,
		true,
		"turning off the user setting pauses playback"
	);
	assert.equal(created[0].currentTime, 0);

	await React.act(async () => {
		publishPreference("ambient-elevator-enabled", "true");
		publishPreference("ambient-elevator-volume", "150");
	});
	assert.equal(created[0].playCount, 2);
	assert.equal(
		created[0].volume,
		1,
		"volume is clamped before reaching HTMLAudioElement"
	);

	await React.act(async () => {
		state.working = false;
		forceRender();
	});
	assert.equal(
		created[0].paused,
		true,
		"audio stops when no agent is actively working"
	);

	await React.act(async () => {
		state.working = true;
		forceRender();
	});
	assert.equal(
		created[0].playCount,
		3,
		"a later working run resumes the shared player"
	);

	await React.act(async () => {
		state.contributions = [];
		forceRender();
	});
	assert.equal(
		created[0].paused,
		true,
		"removing the contribution stops its playback"
	);

	await React.act(async () => root.unmount());
	ambientAudioController.dispose();
});

after(async () => {
	ambientAudioController.dispose();
	GlobalRegistrator.unregister();
	globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
	globalThis.Audio = undefined;
	rmSync(compiledTestsDirectory, { force: true, recursive: true });
});
