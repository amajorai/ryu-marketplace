// Headroom's Gateway pipeline/compression fixtures. No external service/provider.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withTestResourceLease } from "../../tools/test-resource-lease.mjs";
import {
	assertFreshSnapshot,
	assertListedFilters,
	assertRuntimeResult,
} from "./runtime-map.mjs";

export const HEADROOM_GATEWAY_FILTERS = [
	"pipeline::fallback_tests::headroom_compression_runtime::headroom_manifest_compresses_both_chat_paths_before_provider_dispatch",
	"pipeline::fallback_tests::headroom_compression_runtime::headroom_manifest_disabled_and_short_requests_do_not_call_the_service",
	"pipeline::fallback_tests::headroom_compression_runtime::headroom_manifest_failures_keep_both_provider_request_bodies_intact",
	"compression::tests::swaps_messages_and_reports_saved_tokens",
	"compression::tests::fail_open_response_is_a_noop",
	"compression::tests::missing_messages_is_a_noop",
	"compression::tests::derives_saved_from_before_after_when_absent",
];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function sources(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory()
			? sources(path)
			: entry.isFile() && entry.name.endsWith(".rs")
				? [path]
				: [];
	});
}
function main() {
	const args = process.argv.slice(2);
	if (
		args.length &&
		(args.length !== 2 || args[0] !== "--gateway-binary" || !args[1])
	) {
		throw new Error(
			"Usage: headroom-gateway-runtime.mjs [--gateway-binary path]"
		);
	}
	let binary = args.length ? resolve(args[1]) : undefined;
	const data = mkdtempSync(join(tmpdir(), "ryu-headroom-gateway-"));
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
		RUST_MIN_STACK: "16777216",
		// One job by default for memory-constrained hosts; an explicit caller
		// setting (as the Marketplace Store runner honors) may raise it.
		CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "1",
	});
	const execute = (command, argv, timeout) =>
		spawnSync(command, argv, {
			cwd: root,
			env,
			encoding: "utf8",
			maxBuffer: 32 * 1024 * 1024,
			timeout,
		});
	try {
		if (!binary) {
			const result = withTestResourceLease(
				"heavy",
				() =>
					execute(
						"cargo",
						[
							"test",
							"-p",
							"ryu-gateway",
							"--bin",
							"ryu-gateway",
							"--no-run",
							"--message-format=json",
						],
						30 * 60 * 1000
					),
				{ label: "Headroom Gateway fixture compile" }
			);
			process.stderr.write(result.stderr ?? "");
			if (result.error) {
				throw result.error;
			}
			const artifacts = (result.stdout ?? "")
				.split(/\r?\n/)
				.filter((line) => line.startsWith("{"))
				.map((line) => JSON.parse(line));
			for (const artifact of artifacts) {
				if (
					artifact.reason === "compiler-message" &&
					artifact.message?.level === "error"
				) {
					process.stderr.write(
						artifact.message.rendered ?? artifact.message.message
					);
				}
			}
			if (result.status !== 0) {
				throw new Error(
					`Gateway fixture compilation failed (${result.status}); no runtime pass`
				);
			}
			binary = artifacts.find(
				(artifact) =>
					artifact.reason === "compiler-artifact" &&
					artifact.target?.name === "ryu-gateway" &&
					artifact.profile?.test === true &&
					artifact.executable
			)?.executable;
			if (!binary) {
				throw new Error("Cargo did not return the Gateway test executable");
			}
		}
		const match = /^ryu_gateway-([a-f0-9]+)(?:\.exe)?$/.exec(basename(binary));
		if (!match) {
			throw new Error("Supplied Gateway binary must be a Cargo test artifact");
		}
		const started = statSync(
			join(
				dirname(dirname(binary)),
				".fingerprint",
				`ryu-gateway-${match[1]}`,
				"invoked.timestamp"
			)
		).mtimeMs;
		const files = [
			...sources(join(root, "apps/gateway/src")),
			...sources(join(root, "crates")),
			join(root, "plugins-store/plugins/headroom/manifest.json"),
		];
		assertFreshSnapshot(
			statSync(binary).mtimeMs,
			started,
			files.map((path) => ({ path, modified: statSync(path).mtimeMs }))
		);
		const listed = execute(binary, ["--list", "--format", "terse"], 60_000);
		if (listed.error) {
			throw listed.error;
		}
		if (listed.status !== 0) {
			throw new Error("Gateway test listing failed");
		}
		assertListedFilters(HEADROOM_GATEWAY_FILTERS, listed.stdout);
		for (const filter of HEADROOM_GATEWAY_FILTERS) {
			process.stdout.write(`\nHeadroom Gateway runtime: ${filter}\n`);
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
			"Headroom Gateway runtime passed:7 exact filters; local service/provider fixtures only.\n"
		);
	} finally {
		rmSync(data, { recursive: true, force: true });
	}
}
if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main();
}
