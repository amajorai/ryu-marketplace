// Seal `tools/<slug>.js` into this plugin's manifest as the wire-form `code`.
//
//   node plugins-store/plugins/goal/seal.mjs          # write
//   node plugins-store/plugins/goal/seal.mjs --check  # verify, non-zero on drift
//
// ToolConfig currently carries inline_deno bodies as manifest strings, so the
// readable `.js` file is the source form and the manifest is the wire form.
// Keeping the source flat makes the sandboxed body auditable and lets the test
// suite reject an edited-but-unsealed tool.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "manifest.json");

export function inlineToolSources(manifest) {
	return (manifest.runnables ?? [])
		.filter((runnable) => runnable.config?.backend === "inline_deno")
		.map((runnable) => ({
			slug: runnable.config.slug,
			file: `tools/${runnable.config.slug}.js`,
		}));
}

export function seal(raw) {
	const manifest = JSON.parse(raw);
	for (const { slug, file } of inlineToolSources(manifest)) {
		const runnable = manifest.runnables.find(
			(entry) => entry.config?.slug === slug
		);
		runnable.config.code = readFileSync(join(HERE, file), "utf8");
	}
	return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function drifted(
	raw,
	read = (relativePath) => readFileSync(join(HERE, relativePath), "utf8")
) {
	const manifest = JSON.parse(raw);
	const driftedSlugs = [];
	for (const { slug, file } of inlineToolSources(manifest)) {
		const runnable = manifest.runnables.find(
			(entry) => entry.config?.slug === slug
		);
		if ((runnable?.config?.code ?? "") !== read(file)) {
			driftedSlugs.push(slug);
		}
	}
	return driftedSlugs;
}

if (process.argv[1]?.endsWith("seal.mjs")) {
	const raw = readFileSync(MANIFEST_PATH, "utf8");
	if (process.argv.includes("--check")) {
		const bad = drifted(raw);
		if (bad.length > 0) {
			process.stderr.write(
				`manifest.json is out of date with tools/*.js (${bad.join(", ")}) — run: node plugins-store/plugins/goal/seal.mjs\n`
			);
			process.exit(1);
		}
		process.stdout.write("manifest.json matches tools/*.js\n");
	} else {
		writeFileSync(MANIFEST_PATH, seal(raw));
		process.stdout.write(`sealed ${MANIFEST_PATH}\n`);
	}
}
