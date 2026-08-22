// Seal `tools/<slug>.js` into this plugin's manifest as the wire-form `code`.
//
//   node plugins-store/plugins/agent-comms/seal.mjs          # write
//   node plugins-store/plugins/agent-comms/seal.mjs --check  # verify, non-zero on drift
//
// WHY THIS EXISTS
// ---------------
// `ToolConfig` (crates/core/kernel-contracts/src/schema.rs) has no `code_file`
// field, so an `inline_deno` tool's only loadable form is a JSON string in the
// manifest — while AGENTS.md bans authoring sandboxed JS as an escaped blob, for
// the reason that applies here identically: nobody audits a `\n`-escaped string,
// and that is where malicious code hides. So the `.js` file is the SOURCE form
// and the manifest string is the WIRE form, sealed from it here.
//
// `tools/toolsmith` does exactly this (`sync`) for a package with ONE tool; its
// `cases.json` names a single body, and this plugin ships three. When toolsmith
// grows multi-tool packages — or `ToolConfig` gains `code_file`, which deletes
// both — this file goes away. Until then plugin.test.mjs runs the same check, so
// an edited body that was never resealed fails the suite instead of shipping.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

/** Every `inline_deno` runnable, paired with the source file it is sealed from. */
export function inlineToolSources(manifest) {
	return (manifest.runnables ?? [])
		.filter((r) => r.config?.backend === "inline_deno")
		.map((r) => ({ slug: r.config.slug, file: `tools/${r.config.slug}.js` }));
}

/** The manifest text with every inline body resealed from disk. */
export function seal(raw) {
	const manifest = JSON.parse(raw);
	for (const { slug, file } of inlineToolSources(manifest)) {
		const body = readFileSync(join(HERE, file), "utf8");
		const runnable = manifest.runnables.find((r) => r.config?.slug === slug);
		runnable.config.code = body;
	}
	return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Every body whose sealed copy no longer matches its source file.
 *
 * Compares the PARSED `code` against the file, never the two files' bytes: the
 * manifest is also formatted by the repo's JSON formatter, and a whole-text
 * comparison would report drift every time that ran. The property worth pinning
 * is "the manifest carries exactly this body", which survives reformatting.
 */
export function drifted(
	raw,
	read = (rel) => readFileSync(join(HERE, rel), "utf8")
) {
	const manifest = JSON.parse(raw);
	const out = [];
	for (const { slug, file } of inlineToolSources(manifest)) {
		const runnable = manifest.runnables.find((r) => r.config?.slug === slug);
		if ((runnable?.config?.code ?? "") !== read(file)) {
			out.push(slug);
		}
	}
	return out;
}

// Guarded so the test suite can import `drifted` without the CLI running.
if (process.argv[1]?.endsWith("seal.mjs")) {
	const raw = readFileSync(MANIFEST_PATH, "utf8");
	if (process.argv.includes("--check")) {
		const bad = drifted(raw);
		if (bad.length > 0) {
			process.stderr.write(
				`manifest.json is out of date with tools/*.js (${bad.join(", ")}) — run: node plugins-store/plugins/agent-comms/seal.mjs\n`
			);
			process.exit(1);
		}
		process.stdout.write("manifest.json matches tools/*.js\n");
	} else {
		writeFileSync(MANIFEST_PATH, seal(raw));
		process.stdout.write(`sealed ${MANIFEST_PATH}\n`);
	}
}
