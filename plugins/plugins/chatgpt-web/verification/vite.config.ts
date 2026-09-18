import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

export default {
	esbuild: {
		jsxFactory: "React.createElement",
		jsxFragment: "React.Fragment",
		jsxInject: 'import React from "react"',
		jsx: "transform",
	},
	resolve: {
		alias: {
			react: resolve(repoRoot, "node_modules/react/index.js"),
			"react/jsx-dev-runtime": resolve(
				repoRoot,
				"node_modules/react/jsx-dev-runtime.js"
			),
			"react/jsx-runtime": resolve(
				repoRoot,
				"node_modules/react/jsx-runtime.js"
			),
			"react-dom/client": resolve(
				repoRoot,
				"apps/desktop/node_modules/react-dom/client.js"
			),
		},
	},
};
