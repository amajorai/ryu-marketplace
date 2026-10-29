// Shared build step for the closed native-primitive observer test artifact.
//
// Package tests (and inventory.mjs) import `tools/dist/native-primitive-observation.mjs`,
// a generated projection of `packages/ui/src/lib/native-primitive-observation.ts`.
// Both package-test entry points (`tools/run-plugin-tests.mjs` and
// `plugins-store/tests/run.mjs`) call this so a fresh checkout works from either.
//
// In the public Marketplace projection the canonical source and builder are not
// carried; the mirror ships the prebuilt artifact instead, so this only verifies
// that it exists there.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const NATIVE_OBSERVER_ARTIFACT =
	"tools/dist/native-primitive-observation.mjs";

/**
 * Build `tools/dist/native-primitive-observation.mjs` under `root` from canonical
 * source when the builder is present; otherwise require the prebuilt artifact.
 * Throws when neither is available.
 */
export function ensureNativeObserverArtifact(root) {
	const builder = join(root, "tools/build-native-observation-artifact.ts");
	const source = join(
		root,
		"packages/ui/src/lib/native-primitive-observation.ts"
	);
	if (!(existsSync(builder) && existsSync(source))) {
		if (existsSync(join(root, NATIVE_OBSERVER_ARTIFACT))) {
			return;
		}
		throw new Error(
			`Missing ${NATIVE_OBSERVER_ARTIFACT} and no canonical source to build it from`
		);
	}
	const build = spawnSync(
		"bun",
		[
			builder,
			source,
			join(root, "tools/dist"),
			join(root, "bun.lock"),
			join(root, "mirror/overlay/LICENSE-COMMERCIAL.md"),
		],
		{ cwd: root, stdio: "inherit" }
	);
	if (build.status !== 0) {
		throw new Error("Cannot build the shared native test observer artifact", {
			cause: build.error,
		});
	}
}
