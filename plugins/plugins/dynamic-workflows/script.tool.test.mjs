// Runs the `workflow.script` body against every case in `script.cases.json`,
// twice each, with all ambient nondeterminism shadowed. Mirrors the generated
// `tool.test.mjs`; this package ships two tool bodies, so each has its own cases.

import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Dynamic, because a published satellite tree ships the plugin without the repo's
// tools/ directory — there the harness is genuinely absent and a skip is the honest
// result. A REPORTED skip, never a silent pass.
let defineToolTests;
try {
	({ defineToolTests } = await import("../../../tools/toolsmith/harness.mjs"));
} catch {
	test("toolsmith harness is absent — cases did NOT run (satellite checkout?)", {
		skip: "harness not resolvable from this tree",
	}, () => {
		// intentionally empty: the skip reason is the report
	});
}

if (defineToolTests) {
	defineToolTests(here, "script.cases.json");
}
