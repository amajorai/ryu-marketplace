import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(here, "manifest.json"), "utf8"));

test("declares the prompt suggestions plugin", () => {
  assert.equal(manifest.id, "@ryu/prompt-suggestions");
  assert.equal(manifest.contributes.settings_tabs[0].fields[0].pref_key, "chat-suggestions-enabled");
  assert.equal(manifest.contributes.settings_tabs[0].fields[1].pref_key, "chat-suggestions-model");
});

test("ships executable turn-hook code", async () => {
  const hook = await readFile(join(here, manifest.contributes.turn_hooks[0].code_file), "utf8");
  assert.match(hook, /host\.sideModel/);
  assert.match(hook, /host\.storage\.set/);
});
