export default {
	esbuild: {
		jsxFactory: "React.createElement",
		jsxFragment: "React.Fragment",
		jsxInject: 'import React from "react"',
		jsx: "transform",
	},
	resolve: {
		alias: {
			react:
				"/Users/jiawei/Documents/Code/ryu-closed/node_modules/react/index.js",
			"react/jsx-dev-runtime":
				"/Users/jiawei/Documents/Code/ryu-closed/node_modules/react/jsx-dev-runtime.js",
			"react/jsx-runtime":
				"/Users/jiawei/Documents/Code/ryu-closed/node_modules/react/jsx-runtime.js",
			"react-dom/client":
				"/Users/jiawei/Documents/Code/ryu-closed/apps/desktop/node_modules/react-dom/client.js",
		},
	},
};
