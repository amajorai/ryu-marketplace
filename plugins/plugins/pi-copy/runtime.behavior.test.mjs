// Drives the production `copy_paste` tool against real temporary files.
// Run with:  node --test plugins-store/plugins/pi-copy/runtime.behavior.test.mjs

import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

// Match the managed Pi loader's closed native Typebox aliases.
const piRequire = createRequire(
	import.meta.resolve("@earendil-works/pi-coding-agent")
);
const nativeTypeboxEntries = new Map([
	["typebox", piRequire.resolve("typebox")],
	["typebox/value", piRequire.resolve("typebox/value")],
]);
registerHooks({
	resolve(specifier, context, nextResolve) {
		const entry = nativeTypeboxEntries.get(specifier);
		if (entry) {
			return { shortCircuit: true, url: pathToFileURL(entry).href };
		}
		return nextResolve(specifier, context);
	},
});

const copyExtension = (await import("./pi-extensions/ryu-copy.ts")).default;
const registeredTools = new Map();
copyExtension({
	registerTool(tool) {
		registeredTools.set(tool.name, tool);
	},
});

const workspace = mkdtempSync(join(tmpdir(), "ryu-copy-test-"));
after(() => rmSync(workspace, { force: true, recursive: true }));

let fixtureCount = 0;
function fixture(name, body) {
	fixtureCount++;
	const file = join(workspace, `${fixtureCount}-${name}`);
	writeFileSync(file, body);
	return file;
}

function copyPaste(params) {
	const tool = registeredTools.get("copy_paste");
	if (!tool) {
		throw new Error("copy_paste tool did not register");
	}
	return tool.execute(
		"test-copy",
		params,
		new AbortController().signal,
		() => undefined,
		{ cwd: workspace }
	);
}

const read = (file) => readFileSync(file, "utf8");
const resultText = (result) =>
	result.content.map(({ text }) => text).join("\n");

test("registers a typed schema with the documented parameters", () => {
	const tool = registeredTools.get("copy_paste");
	assert.deepEqual(Object.keys(tool.parameters.properties).sort(), [
		"end_line",
		"move",
		"path",
		"position",
		"start_line",
		"text",
		"to_anchor",
		"to_line",
		"to_path",
	]);
	assert.deepEqual(tool.parameters.required, ["path"]);
});

test("copies a line range to another file before a line, byte-for-byte", async () => {
	const source = fixture("source.txt", "a\nb\nc\nd\n");
	const dest = fixture("dest.txt", "1\n2\n3\n");
	const result = await copyPaste({
		path: source,
		start_line: 2,
		end_line: 3,
		to_path: dest,
		to_line: 2,
	});
	assert.equal(read(dest), "1\nb\nc\n2\n3\n");
	assert.equal(read(source), "a\nb\nc\nd\n", "copy leaves the source alone");
	assert.equal(result.details.mode, "copy");
	assert.equal(result.details.lines, 2);
	assert.equal(result.details.dest_line_from, 2);
	assert.equal(result.details.dest_line_to, 3);
	assert.match(resultText(result), /First line: b\nLast line: c/);
});

test("moves a block later in the same file", async () => {
	const file = fixture("same.ts", "one\ntwo\nthree\nfour\nfive\n");
	const result = await copyPaste({
		path: file,
		start_line: 1,
		end_line: 2,
		to_line: 5,
		move: true,
	});
	assert.equal(read(file), "three\nfour\none\ntwo\nfive\n");
	assert.equal(result.details.dest_line_from, 3);
	assert.equal(result.details.dest_line_to, 4);
});

test("moves a block earlier in the same file", async () => {
	const file = fixture("same-up.ts", "one\ntwo\nthree\nfour\n");
	await copyPaste({ path: file, start_line: 4, to_line: 1, move: true });
	assert.equal(read(file), "four\none\ntwo\nthree\n");
});

test("moves a snippet to its own line at the start of its span", async () => {
	const file = fixture("tie.txt", "abc\ndef\n");
	const result = await copyPaste({
		path: file,
		text: "abc",
		to_line: 1,
		move: true,
	});
	assert.equal(read(file), "abc\n\ndef\n");
	assert.equal(result.details.dest_line_from, 1);
	assert.equal(result.details.dest_line_to, 1);
});

test("refuses to move a block into itself", async () => {
	const file = fixture("inside.ts", "one\ntwo\nthree\n");
	await assert.rejects(
		copyPaste({
			path: file,
			start_line: 1,
			end_line: 3,
			to_line: 2,
			move: true,
		}),
		/inside the span being moved/
	);
	assert.equal(read(file), "one\ntwo\nthree\n");
});

test("selects by exact text and pastes after, before, or in place of an anchor", async () => {
	const file = fixture("anchor.ts", "const x = 1;\n// TODO\nfunction f() {}\n");
	await copyPaste({
		path: file,
		text: "function f() {}\n",
		to_anchor: "// TODO\n",
		position: "replace",
		move: true,
	});
	assert.equal(read(file), "const x = 1;\nfunction f() {}\n");

	await copyPaste({
		path: file,
		text: "1",
		to_anchor: "= 1",
		position: "before",
	});
	assert.equal(read(file), "const x 1= 1;\nfunction f() {}\n");
});

test("moves across files, writing the destination before trimming the source", async () => {
	const source = fixture("cut-from.md", "# Keep\n## Move me\nbody\n");
	const dest = join(workspace, "nested", "created.md");
	const result = await copyPaste({
		path: source,
		start_line: 2,
		end_line: 3,
		to_path: dest,
		move: true,
	});
	assert.equal(read(dest), "## Move me\nbody\n");
	assert.equal(read(source), "# Keep\n");
	assert.equal(result.details.created, true);
	assert.match(resultText(result), /\(new file\)/);
});

test("treats a symlink alias of the source as the same file on a move", async () => {
	const file = fixture("aliased.txt", "one\ntwo\nthree\n");
	const alias = join(workspace, `${fixtureCount}-alias.txt`);
	symlinkSync(file, alias);
	const result = await copyPaste({
		path: file,
		start_line: 1,
		to_path: alias,
		move: true,
	});
	assert.equal(read(file), "two\nthree\none\n", "the block is moved, not lost");
	assert.equal(result.details.dest_line_from, 3);
});

test("keeps an unterminated last line on lines of its own", async () => {
	const source = fixture("no-eol-src.txt", "x\ny");
	const dest = fixture("no-eol-dest.txt", "p\nq");
	await copyPaste({ path: source, start_line: 2, to_path: dest });
	assert.equal(read(dest), "p\nq\ny\n");
	await copyPaste({ path: source, start_line: 2, to_path: dest, to_line: 1 });
	assert.equal(read(dest), "y\np\nq\ny\n");
});

test("preserves CRLF line endings and the copied bytes exactly", async () => {
	const block = '\tkey = "päßwörd ✓"  \r\n  trailing spaces   \r\n';
	const source = fixture("crlf-src.ini", `[a]\r\n${block}[b]\r\n`);
	const dest = fixture("crlf-dest.ini", "[z]\r\n");
	await copyPaste({ path: source, start_line: 2, end_line: 3, to_path: dest });
	assert.equal(read(dest), `[z]\r\n${block}`);
});

test("rejects ambiguous, missing, and malformed selections without writing", async () => {
	const file = fixture("errors.txt", "dup\ndup\nend\n");
	await assert.rejects(
		copyPaste({ path: file, text: "dup" }),
		/more than once/
	);
	await assert.rejects(copyPaste({ path: file, text: "nope" }), /not found/);
	await assert.rejects(
		copyPaste({ path: file, start_line: 2, end_line: 9 }),
		/3 line\(s\); line 9 does not exist/
	);
	await assert.rejects(
		copyPaste({ path: file, start_line: 3, end_line: 2 }),
		/before `start_line`/
	);
	await assert.rejects(
		copyPaste({ path: file, text: "end", start_line: 1 }),
		/either `start_line`\/`end_line` or `text`/
	);
	await assert.rejects(
		copyPaste({ path: file, start_line: 1, to_line: 9 }),
		/at most 4/
	);
	await assert.rejects(
		copyPaste({ path: file, start_line: 1, to_line: 2, to_anchor: "end" }),
		/not both/
	);
	await assert.rejects(
		copyPaste({ path: file, start_line: 1, position: "after" }),
		/only applies with `to_anchor`/
	);
	await assert.rejects(
		copyPaste({
			path: file,
			start_line: 3,
			to_anchor: "end",
			position: "middle",
		}),
		/must be one of before, after, replace/
	);
	await assert.rejects(
		copyPaste({ path: join(workspace, "missing.txt"), start_line: 1 }),
		/does not exist/
	);
	await assert.rejects(
		copyPaste({
			path: file,
			start_line: 1,
			to_path: join(workspace, "absent.txt"),
			to_anchor: "x",
		}),
		/has no lines or anchors/
	);
	assert.equal(read(file), "dup\ndup\nend\n");
	assert.ok(!existsSync(join(workspace, "absent.txt")));
});

test("refuses binary files", async () => {
	const file = fixture("blob.bin", "abc\0def\n");
	await assert.rejects(
		copyPaste({ path: file, start_line: 1 }),
		/looks binary/
	);
});

test("refuses non-UTF-8 files before writing either side", async () => {
	const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a, 0x78, 0x0a]);
	const source = fixture("latin1-src.txt", latin1);
	const utf8 = fixture("utf8-dest.txt", "ok\n");
	await assert.rejects(
		copyPaste({ path: source, start_line: 2, to_path: utf8, move: true }),
		/is not valid UTF-8 text/
	);
	await assert.rejects(
		copyPaste({ path: utf8, start_line: 1, to_path: source }),
		/is not valid UTF-8 text/
	);
	assert.deepEqual(readFileSync(source), latin1);
	assert.equal(read(utf8), "ok\n");
});

test("keeps a UTF-8 byte-order mark byte-exact", async () => {
	const bom = Buffer.from([0xef, 0xbb, 0xbf]);
	const file = fixture("bom.txt", Buffer.concat([bom, Buffer.from("a\nb\n")]));
	await copyPaste({ path: file, start_line: 2 });
	assert.deepEqual(
		readFileSync(file),
		Buffer.concat([bom, Buffer.from("a\nb\nb\n")])
	);
});

test("leaves a byte-order mark out of a line-1 clip and ahead of line 1", async () => {
	const bom = Buffer.from([0xef, 0xbb, 0xbf]);
	const source = fixture(
		"bom-src.txt",
		Buffer.concat([bom, Buffer.from("x\n")])
	);
	const dest = fixture(
		"bom-dest.txt",
		Buffer.concat([bom, Buffer.from("a\n")])
	);
	await copyPaste({ path: source, start_line: 1, to_path: dest, to_line: 1 });
	assert.deepEqual(
		readFileSync(dest),
		Buffer.concat([bom, Buffer.from("x\na\n")])
	);
	await copyPaste({ path: source, start_line: 1, to_path: dest, move: true });
	assert.deepEqual(readFileSync(source), bom);
	assert.deepEqual(
		readFileSync(dest),
		Buffer.concat([bom, Buffer.from("x\na\nx\n")])
	);
});

test("moving an unterminated last line to the end of its file is a no-op", async () => {
	const file = fixture("noop.txt", "a\nb");
	const result = await copyPaste({ path: file, start_line: 2, move: true });
	assert.equal(read(file), "a\nb");
	assert.equal(result.details.dest_line_from, 2);
});

test("resolves relative paths against the session cwd", async () => {
	fixture("rel.txt", "hello\n");
	const result = await copyPaste({
		path: `${fixtureCount}-rel.txt`,
		start_line: 1,
		to_path: "rel-out.txt",
	});
	assert.equal(read(join(workspace, "rel-out.txt")), "hello\n");
	assert.match(resultText(result), /to rel-out\.txt at the end \(new file\)/);
});
