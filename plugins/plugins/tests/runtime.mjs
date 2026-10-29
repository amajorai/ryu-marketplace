// Local Core fixture stage. No contract-only or zero-test success fallback.
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withTestResourceLease } from "../../tools/test-resource-lease.mjs";
import { HEADROOM_GATEWAY_FILTERS } from "./headroom-gateway-runtime.mjs";
import {
	assertFreshSnapshot,
	assertListedFilters,
	assertRuntimeResult,
	CORE_RUNTIME_FILTERS,
	runtimePlan,
} from "./runtime-map.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function packageDirectory(name) {
	const path = ["plugins", "lsp", "external_plugins"]
		.map((cluster) => join(root, "plugins-store", cluster, name))
		.find((path) => existsSync(join(path, "manifest.json")));
	if (!path) {
		throw new Error(`Unknown package directory ${name}`);
	}
	return path;
}
function rustSources(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return rustSources(path);
		}
		return entry.isFile() &&
			(entry.name.endsWith(".rs") || entry.name === "Cargo.toml")
			? [path]
			: [];
	});
}
function embeddedPackageSources(directory) {
	if (!existsSync(directory)) {
		return [];
	}
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return embeddedPackageSources(path);
		}
		return entry.isFile() && /\.(md|js|ts|toml)$/.test(entry.name)
			? [path]
			: [];
	});
}
function checkFreshBinary(binary, packages) {
	const built = statSync(binary).mtimeMs;
	const match = /^ryu_core-([a-f0-9]+)(?:\.exe)?$/.exec(basename(binary));
	if (!match) {
		throw new Error("Supplied Core binary must be a Cargo Core test artifact");
	}
	const invoked = join(
		dirname(dirname(binary)),
		".fingerprint",
		`ryu-core-${match[1]}`,
		"invoked.timestamp"
	);
	const started = statSync(invoked).mtimeMs;
	const sources = [
		join(root, "Cargo.toml"),
		join(root, "Cargo.lock"),
		join(root, "apps/core/Cargo.toml"),
		...rustSources(join(root, "apps/core/src")),
		...rustSources(join(root, "crates")),
	];
	for (const name of packages) {
		const directory = packageDirectory(name);
		sources.push(join(directory, "manifest.json"));
		for (const folder of ["skills", "output-styles", "pi-extensions"]) {
			sources.push(...embeddedPackageSources(join(directory, folder)));
		}
		for (const folder of ["hooks", "adapters"]) {
			try {
				for (const file of readdirSync(join(directory, folder))) {
					sources.push(join(directory, folder, file));
				}
			} catch (error) {
				if (error?.code !== "ENOENT") {
					throw error;
				}
			}
		}
	}
	assertFreshSnapshot(
		built,
		started,
		sources.map((source) => ({
			path: source,
			modified: statSync(source).mtimeMs,
		}))
	);
}

const args = process.argv.slice(2);
let packages;
let binary;
let gatewayBinary;
let listOnly = false;
for (let index = 0; index < args.length; index++) {
	const flag = args[index];
	if (flag === "--list-plan") {
		listOnly = true;
	} else if (
		flag === "--package" ||
		flag === "--core-binary" ||
		flag === "--gateway-binary"
	) {
		const value = args[++index];
		if (!value || value.startsWith("--")) {
			throw new Error(`${flag} requires a value`);
		}
		if (flag === "--package") {
			packages = value
				.split(",")
				.map((name) => name.trim())
				.filter(Boolean);
		} else if (flag === "--gateway-binary") {
			gatewayBinary = resolve(value);
		} else {
			binary = resolve(value);
		}
	} else {
		throw new Error(`Unknown Core runtime flag: ${flag}`);
	}
}
if (packages) {
	if (packages.length === 0 || new Set(packages).size !== packages.length) {
		throw new Error(
			"--package must contain nonempty unique package directory names"
		);
	}
	const available = new Set(
		["plugins", "lsp", "external_plugins"]
			.flatMap((cluster) =>
				readdirSync(join(root, "plugins-store", cluster), {
					withFileTypes: true,
				})
			)
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
	);
	const unknown = packages.filter((name) => !available.has(name));
	if (unknown.length) {
		throw new Error(`Unknown plugins package ids: ${unknown.join(", ")}`);
	}
}
const plan = runtimePlan(packages);
if (gatewayBinary && !plan.packages.includes("headroom")) {
	throw new Error("--gateway-binary requires the headroom package selection");
}
if (listOnly) {
	process.stdout.write(
		`${JSON.stringify({ ...plan, gatewayFilters: plan.packages.includes("headroom") ? HEADROOM_GATEWAY_FILTERS : [] }, null, 2)}\n`
	);
} else {
	if (!plan.filters.length) {
		throw new Error(
			`No registered Core runtime proof for: ${plan.boundaries.join(", ")}. Use the explicitly labelled contract-only package runner for that boundary.`
		);
	}
	for (const name of plan.boundaries) {
		process.stdout.write(
			`Core runtime boundary: ${name} has no registered local Core fixture.\n`
		);
	}
	const data = mkdtempSync(join(tmpdir(), "ryu-plugin-core-runtime-"));
	// Inherit toolchain/path configuration, never provider or node credentials.
	const env = Object.fromEntries(
		[
			"PATH",
			"HOME",
			"TMPDIR",
			"SystemRoot",
			"USERPROFILE",
			"RUSTUP_HOME",
			"CARGO_HOME",
			"CARGO_INCREMENTAL",
			// Profile/target settings keep this compile on the same artifacts as
			// the caller's other Cargo stages instead of a second debuginfo variant.
			"CARGO_PROFILE_DEV_DEBUG",
			"CARGO_PROFILE_TEST_DEBUG",
			"CARGO_TARGET_DIR",
			"RYU_COVERAGE_RESOURCE_POOL",
			"SDKROOT",
			"CC",
			"CXX",
			"MACOSX_DEPLOYMENT_TARGET",
		]
			.filter((key) => process.env[key] !== undefined)
			.map((key) => [key, process.env[key]])
	);
	Object.assign(env, {
		RYU_PROFILE: "dev",
		RYU_KEYCHAIN: "off",
		RYU_DIR: data,
		// One job by default for memory-constrained hosts; an explicit caller
		// setting (as the Marketplace Store runner honors) may raise it.
		CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "1",
		RUST_MIN_STACK: "16777216",
	});
	const execute = (command, commandArgs, timeout) =>
		spawnSync(command, commandArgs, {
			cwd: root,
			env,
			encoding: "utf8",
			maxBuffer: 32 * 1024 * 1024,
			timeout,
		});
	try {
		if (!binary) {
			const compile = withTestResourceLease(
				"heavy",
				() =>
					execute(
						"cargo",
						[
							"test",
							"-p",
							"ryu-core",
							"--bin",
							"ryu-core",
							"--no-run",
							"--message-format=json",
						],
						30 * 60 * 1000
					),
				{ label: "Plugins Store Core fixture compile" }
			);
			process.stderr.write(compile.stderr ?? "");
			if (compile.error) {
				throw compile.error;
			}
			if (compile.status !== 0) {
				for (const line of (compile.stdout ?? "").split(/\r?\n/)) {
					if (line.startsWith("{")) {
						const diagnostic = JSON.parse(line);
						if (diagnostic.reason === "compiler-message") {
							process.stderr.write(diagnostic.message?.rendered ?? "");
						}
					}
				}
				throw new Error(
					`Core fixture compilation failed (${compile.status}); runtime proof remains unverified.`
				);
			}
			const artifacts = (compile.stdout ?? "")
				.split(/\r?\n/)
				.filter((line) => line.startsWith("{"))
				.map((line) => JSON.parse(line));
			binary = artifacts.find(
				(artifact) =>
					artifact.reason === "compiler-artifact" &&
					artifact.target?.name === "ryu-core" &&
					artifact.profile?.test === true &&
					artifact.executable
			)?.executable;
			if (!binary) {
				throw new Error("Cargo did not return the Core test executable");
			}
		}
		const sourcePackages = Object.entries(CORE_RUNTIME_FILTERS)
			.filter(([, filters]) =>
				filters.some((filter) => plan.filters.includes(filter))
			)
			.map(([name]) => name);
		checkFreshBinary(binary, sourcePackages);
		process.stdout.write(`Core test artifact: ${binary}\n`);
		const listing = execute(binary, ["--list", "--format", "terse"], 60_000);
		if (listing.error) {
			throw listing.error;
		}
		if (listing.status !== 0) {
			throw new Error("Core test listing failed");
		}
		assertListedFilters(plan.filters, listing.stdout);
		for (const filter of plan.filters) {
			process.stdout.write(`\nCore runtime: ${filter}\n`);
			const result = execute(
				binary,
				["--exact", filter, "--test-threads=1", "--nocapture"],
				180_000
			);
			process.stdout.write(result.stdout ?? "");
			process.stderr.write(result.stderr ?? "");
			assertRuntimeResult(filter, result);
		}
		process.stdout.write(
			`Local Core runtime passed: ${plan.filters.length} exact filters across ${plan.packages.length} packages. Provider/device effects remain outside these fixtures.\n`
		);
		if (plan.packages.includes("headroom")) {
			const args = [
				join(root, "plugins-store/tests/headroom-gateway-runtime.mjs"),
			];
			if (gatewayBinary) {
				args.push("--gateway-binary", gatewayBinary);
			}
			const result = spawnSync(process.execPath, args, {
				cwd: root,
				env,
				stdio: "inherit",
			});
			if (result.error) {
				throw result.error;
			}
			if (result.status !== 0) {
				throw new Error(
					`Headroom Gateway runtime stage failed (${result.status})`
				);
			}
		}
	} finally {
		rmSync(data, { recursive: true, force: true });
	}
}
