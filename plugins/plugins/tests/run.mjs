import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureNativeObserverArtifact } from "./native-observer.mjs";
import { runtimePlan } from "./runtime-map.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const CLUSTERS = ["plugins", "lsp", "external_plugins"];
const args = process.argv.slice(2);
const cluster = args[0];

function packageDirectories(root, packageFilter) {
	if (packageFilter) {
		return packageFilter;
	}
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

function testFilesFor(selectedCluster, packageFilter) {
	const roots = selectedCluster === "all" ? CLUSTERS : [selectedCluster];
	const files = [
		join(HERE, "inventory.test.mjs"),
		join(HERE, "runtime-map.test.mjs"),
	];
	for (const rootName of roots) {
		const root = join(REPO_ROOT, "plugins-store", rootName);
		for (const packageDir of packageDirectories(
			root,
			rootName === selectedCluster ? packageFilter : null
		)) {
			const walk = (directory) => {
				for (const entry of readdirSync(directory, { withFileTypes: true })) {
					const absolute = join(directory, entry.name);
					if (entry.isDirectory()) {
						walk(absolute);
					} else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
						files.push(absolute);
					}
				}
			};
			walk(join(root, packageDir));
		}
	}
	if (roots.includes("external_plugins")) {
		files.push(join(HERE, "external_plugins.test.mjs"));
	}
	if (roots.includes("lsp")) {
		files.push(join(HERE, "lsp_contracts.test.mjs"));
	}
	if (
		roots.includes("plugins") &&
		(!packageFilter ||
			packageFilter.some((name) =>
				["auto-continue", "plan-continue"].includes(name)
			))
	) {
		files.push(join(HERE, "plugins_continuation.test.mjs"));
	}
	if (
		roots.includes("plugins") &&
		(!packageFilter ||
			packageFilter.some((name) =>
				["advisor", "double-check", "observer-agents"].includes(name)
			))
	) {
		files.push(join(HERE, "plugins_review_quality.test.mjs"));
	}
	return [...new Set(files)].sort();
}

if (!cluster || (cluster !== "all" && !CLUSTERS.includes(cluster))) {
	console.error(
		"Usage: node plugins-store/tests/run.mjs <" +
			CLUSTERS.join("|") +
			"|all> [--package package-id,package-id] [--contract-only] [--core-binary path]"
	);
	process.exit(2);
}

let packageFilter = null;
const contractOnly = args.includes("--contract-only");
const binaryFlag = args.indexOf("--core-binary");
const coreBinary = binaryFlag >= 0 ? args[binaryFlag + 1] : null;
const gatewayFlag = args.indexOf("--gateway-binary");
const gatewayBinary = gatewayFlag >= 0 ? args[gatewayFlag + 1] : null;
if (gatewayFlag >= 0 && (!gatewayBinary || gatewayBinary.startsWith("--"))) {
	throw new Error("--gateway-binary requires a compiled Gateway test binary");
}
if (
	gatewayBinary &&
	(contractOnly || (cluster !== "plugins" && cluster !== "all"))
) {
	throw new Error("--gateway-binary requires bundled plugins runtime mode");
}
if (binaryFlag >= 0 && (!coreBinary || coreBinary.startsWith("--"))) {
	throw new Error("--core-binary requires the compiled Core test binary path");
}
if (contractOnly && coreBinary) {
	throw new Error("--contract-only cannot be combined with --core-binary");
}
for (let index = 1; index < args.length; index++) {
	if (
		args[index] === "--package" ||
		args[index] === "--core-binary" ||
		args[index] === "--gateway-binary"
	) {
		index++;
	} else if (args[index] !== "--contract-only") {
		throw new Error(`Unknown package test flag: ${args[index]}`);
	}
}
const packageFlag = args.indexOf("--package");
if (packageFlag >= 0) {
	if (cluster === "all" || !args[packageFlag + 1]) {
		throw new Error(
			"--package requires one ownership cluster and a comma-separated package list"
		);
	}
	packageFilter = args[packageFlag + 1]
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (
		packageFilter.length === 0 ||
		new Set(packageFilter).size !== packageFilter.length
	) {
		throw new Error(
			"--package must be a non-empty list without duplicate package ids"
		);
	}
	const pluginRoot = join(REPO_ROOT, "plugins-store", cluster);
	const available = new Set(packageDirectories(pluginRoot, null));
	const unknown = packageFilter.filter((name) => !available.has(name));
	if (unknown.length > 0) {
		throw new Error(`Unknown ${cluster} package ids: ${unknown.join(", ")}`);
	}
}

// inventory.mjs (and many package tests) import the generated native observer,
// so it must exist before the inventory module is loaded.
ensureNativeObserverArtifact(REPO_ROOT);
const { checkInventory } = await import("./inventory.mjs");
const { rows, summary } = checkInventory();
console.log(
	contractOnly
		? "CONTRACT-ONLY package stage: Core runtime is explicitly excluded."
		: "Bundled package stage: Node/Python followed by registered local Core fixtures."
);
console.log(`Inventory gate passed: ${rows.length} declared interaction rows.`);
console.log(JSON.stringify(summary[cluster] || summary, null, 2));
if (packageFilter) {
	console.log(`Package filter: ${packageFilter.join(", ")}`);
}

const testFiles = testFilesFor(cluster, packageFilter);
if (cluster === "lsp" && testFiles.length === 1) {
	console.log("LSP has no package tests yet; running the inventory gate only.");
}
const result = spawnSync(
	process.execPath,
	["--test", "--test-concurrency=1", ...testFiles],
	{
		cwd: REPO_ROOT,
		stdio: "inherit",
	}
);
if (result.error) {
	throw result.error;
}

let exitCode = result.status ?? 1;
// Laya and Cloudflare Clef stub FastAPI. FunctionGemma and Needle3 drive their
// real ASGI apps, so uv provisions only their pinned FastAPI (as the Apps Store
// Python suites do); model runtimes stay stubbed and are never installed.
const PYTHON_SUITES = [
	{ name: "laya", dependencies: [] },
	{ name: "cloudflare-clef", dependencies: [] },
	{ name: "functiongemma", dependencies: ["fastapi==0.115.12"] },
	{ name: "needle3", dependencies: ["fastapi==0.115.12"] },
];
// uv needs package-index reachability; credential variables stay excluded.
const PACKAGE_INDEX_ENVIRONMENT =
	/^(?:UV_CACHE_DIR|UV_NATIVE_TLS|UV_SYSTEM_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|(?:HTTPS?|NO|ALL)_PROXY|(?:https?|no|all)_proxy)$/;
for (const { name, dependencies } of PYTHON_SUITES) {
	if (
		!(
			(cluster === "all" || cluster === "plugins") &&
			(!packageFilter || packageFilter.includes(name))
		)
	) {
		continue;
	}
	console.log(`\n=== ${name} sidecar Python behavior ===`);
	const sidecarRoot = join(REPO_ROOT, "plugins-store/plugins", name, "sidecar");
	const pythonEnv = Object.fromEntries(
		Object.entries(process.env).filter(
			([key]) =>
				["PATH", "HOME", "TMPDIR", "SystemRoot", "USERPROFILE"].includes(key) ||
				(dependencies.length > 0 && PACKAGE_INDEX_ENVIRONMENT.test(key))
		)
	);
	pythonEnv.PYTHONDONTWRITEBYTECODE = "1";
	const python = process.env.PYTHON?.trim();
	const unittestArgs = [
		"-m",
		"unittest",
		"discover",
		"-s",
		"tests",
		"-p",
		"test_*.py",
		"-v",
	];
	const [command, commandArgs] =
		dependencies.length > 0
			? [
					"uv",
					[
						"run",
						"--no-project",
						...(python ? ["--python", python] : []),
						...dependencies.flatMap((dependency) => ["--with", dependency]),
						"python",
						...unittestArgs,
					],
				]
			: [python || "python3", unittestArgs];
	const pythonResult = spawnSync(command, commandArgs, {
		cwd: sidecarRoot,
		stdio: "inherit",
		env: pythonEnv,
	});
	if (pythonResult.error) {
		throw pythonResult.error;
	}
	if (pythonResult.status !== 0) {
		exitCode = pythonResult.status ?? 1;
	}
}

if (exitCode === 0 && !contractOnly) {
	const selected =
		packageFilter ??
		(cluster === "all"
			? ["plugins", "lsp", "external_plugins"].flatMap((name) =>
					packageDirectories(join(REPO_ROOT, "plugins-store", name), null)
				)
			: packageDirectories(join(REPO_ROOT, "plugins-store", cluster), null));
	const plan = runtimePlan(selected);
	for (const name of plan.boundaries) {
		console.log(
			`Core runtime boundary: ${name} has no registered local Core proof; package results do not prove Core execution.`
		);
	}
	if (plan.filters.length) {
		const runtimeArgs = [
			join(HERE, "runtime.mjs"),
			"--package",
			plan.packages.join(","),
		];
		if (coreBinary) {
			runtimeArgs.push("--core-binary", coreBinary);
		}
		if (gatewayBinary) {
			runtimeArgs.push("--gateway-binary", gatewayBinary);
		}
		const runtime = spawnSync(process.execPath, runtimeArgs, {
			cwd: REPO_ROOT,
			stdio: "inherit",
		});
		if (runtime.error) {
			throw runtime.error;
		}
		exitCode = runtime.status ?? 1;
	}
}

if (!contractOnly && cluster === "external_plugins") {
	console.log(
		"External plugin boundary: local Core grant lifecycle fixtures do not prove hosted OAuth or live server/provider startup."
	);
}
process.exitCode = exitCode;
