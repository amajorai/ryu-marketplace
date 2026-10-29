import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	isNativeObjectLike,
	isNativeText,
} from "../../tools/dist/native-primitive-observation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const INVENTORY_PATH = join(HERE, "interaction-inventory.tsv");
const COVERAGE_MAP_PATH = join(HERE, "coverage-map.json");
const COLUMNS = [
	"cluster",
	"row_id",
	"package_id",
	"kind",
	"artifact",
	"user_visible_item",
	"source_files",
	"status",
	"evidence",
	"boundary",
];
const CLUSTERS = ["plugins", "lsp", "external_plugins"];
const STATUSES = new Set(["behavior", "partial", "unmapped"]);
const DESCRIPTOR_KEYS = new Set([
	"agent",
	"capability",
	"code_file",
	"command",
	"id",
	"label",
	"name",
	"on",
	"path",
	"title",
	"type",
]);
const CODE_DIRS = ["adapters", "hooks", "pi-extensions", "sidecar", "tools"];
const CODE_EXTENSIONS = new Set([".js", ".mjs", ".py", ".sh", ".ts"]);

function clean(value) {
	return String(value ?? "")
		.replace(/[\t\r\n]+/g, " ")
		.replace(/\s{2,}/g, " ")
		.trim();
}

function pointer(parts) {
	return parts
		.map(
			(part) => `/${String(part).replaceAll("~", "~0").replaceAll("/", "~1")}`
		)
		.join("");
}

function slug(value) {
	return (
		clean(value)
			.toLowerCase()
			.replace(/[^a-z0-9_.:-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "entry"
	);
}

function exists(path) {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

function ensure(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function extension(filename) {
	const index = filename.lastIndexOf(".");
	return index < 0 ? "" : filename.slice(index);
}

function defaultBoundary(kind, cluster) {
	if (kind === "package_card") {
		return "Rendered Marketplace listing and install/enable lifecycle are not proved by manifest checks.";
	}
	if (kind === "permission_grant") {
		return "Rendered permission consent and the granted/denied runtime boundary require a host fixture.";
	}
	if (kind === "activation_event") {
		return "Core activation dispatch and the event's real runtime effect require a local host fixture.";
	}
	if (kind === "runnable" || kind === "runnable_parameter") {
		return "Tool, agent, workflow, skill, or policy execution and side effects require a mocked host.";
	}
	if (kind === "contribution" || kind === "contribution_field") {
		return "Rendered contribution behavior and saved state or callbacks require a production host fixture.";
	}
	if (kind === "provider_capability" || kind === "provider_tool") {
		return (
			"The " +
			cluster +
			" host boundary and any remote provider remain separate from local body tests."
		);
	}
	if (kind === "mcp_server" || kind === "mcp_config") {
		return "Hosted MCP availability, OAuth, account authorization, and remote tool effects are not exercised.";
	}
	if (kind === "sidecar") {
		return "Sidecar process startup, readiness, persistence, and provider behavior require a local fixture.";
	}
	if (kind === "plugin_extension") {
		return "The target extension host and its rendered controls are not exercised by manifest validation.";
	}
	if (kind === "code_file" || kind === "sidecar_code_file") {
		return "Map source bodies to behavior assertions or an explicit runtime boundary.";
	}
	if (kind === "embedded_backend") {
		return "Embedded backend request and lifecycle behavior require a local runtime fixture.";
	}
	return "Review the package-specific runtime boundary before claiming behavior coverage.";
}

function codeFilesIn(value, found = []) {
	if (Array.isArray(value)) {
		for (const item of value) {
			codeFilesIn(item, found);
		}
		return found;
	}
	if (value && isNativeObjectLike(value)) {
		for (const [key, child] of Object.entries(value)) {
			if (key === "code_file" && isNativeText(child)) {
				found.push(child);
			} else {
				codeFilesIn(child, found);
			}
		}
	}
	return found;
}

function visitContribution(value, pathParts, visit) {
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			visitContribution(value[index], [...pathParts, index], visit);
		}
		return;
	}
	if (!(value && isNativeObjectLike(value))) {
		visit(pathParts, value);
		return;
	}
	if (Object.keys(value).some((key) => DESCRIPTOR_KEYS.has(key))) {
		visit(pathParts, value);
		return;
	}
	for (const [key, child] of Object.entries(value)) {
		visitContribution(child, [...pathParts, key], visit);
	}
}

function visitSchema(schema, pathParts, visit) {
	if (!(schema && isNativeObjectLike(schema) && schema.properties)) {
		return;
	}
	for (const [name, property] of Object.entries(schema.properties)) {
		const current = [...pathParts, name];
		visit(current, property);
		visitSchema(property, current, visit);
	}
}

function entries(value) {
	if (Array.isArray(value)) {
		return value.map((item, index) => [String(index), item]);
	}
	if (value && isNativeObjectLike(value)) {
		return Object.entries(value);
	}
	return [];
}

function sourceCodeFiles(packageRoot, directory) {
	const start = join(packageRoot, directory);
	if (!exists(start)) {
		return [];
	}
	const result = [];
	const walk = (current) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const absolute = join(current, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "tests" || entry.name === "__tests__") {
					continue;
				}
				walk(absolute);
			} else if (CODE_EXTENSIONS.has(extension(entry.name))) {
				result.push(relative(packageRoot, absolute));
			}
		}
	};
	walk(start);
	return result.sort();
}

export function discoverInventoryRows() {
	const rows = [];
	for (const cluster of CLUSTERS) {
		const clusterRoot = join(REPO_ROOT, "plugins-store", cluster);
		const packages = readdirSync(clusterRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
		for (const packageDir of packages) {
			const packageRoot = join(clusterRoot, packageDir);
			const manifest = JSON.parse(
				readFileSync(join(packageRoot, "manifest.json"), "utf8")
			);
			const plugin = JSON.parse(
				readFileSync(join(packageRoot, "plugin.json"), "utf8")
			);
			const addRow = ({
				kind,
				location,
				label,
				artifact,
				sourceFiles = [],
			}) => {
				rows.push({
					cluster,
					row_id: `${cluster}/${packageDir}#${kind}:${location}`,
					package_id: clean(manifest.id || packageDir),
					kind,
					artifact: artifact || "manifest.json",
					user_visible_item: clean(label),
					source_files: [...new Set(sourceFiles)].sort().join(";"),
					status: "unmapped",
					evidence: "",
					boundary: defaultBoundary(kind, cluster),
				});
			};

			addRow({
				kind: "package_card",
				location: "manifest",
				label:
					(manifest.name || packageDir) +
					": Marketplace listing, install, enable, disable",
				artifact: "manifest.json;plugin.json",
				sourceFiles: [
					relative(REPO_ROOT, join(packageRoot, "manifest.json")),
					relative(REPO_ROOT, join(packageRoot, "plugin.json")),
				],
			});

			for (const [index, grant] of (
				manifest.permission_grants || []
			).entries()) {
				addRow({
					kind: "permission_grant",
					location: `manifest.permission_grants[${index}]`,
					label: String(grant),
				});
			}
			for (const [index, event] of (
				manifest.activation_events || []
			).entries()) {
				addRow({
					kind: "activation_event",
					location: `manifest.activation_events[${index}]`,
					label: String(event),
				});
			}

			for (const [index, runnable] of (manifest.runnables || []).entries()) {
				const runnableKey = runnable.id || `index-${index}`;
				const bodyPaths = codeFilesIn(runnable).map((file) =>
					relative(REPO_ROOT, join(packageRoot, file))
				);
				addRow({
					kind: "runnable",
					location: `manifest.runnables[${slug(runnableKey)}]`,
					label:
						(runnable.kind || "runnable") +
						": " +
						(runnable.name || runnableKey),
					sourceFiles: bodyPaths,
				});
				const schema =
					runnable.config?.input_schema || runnable.input_schema || null;
				visitSchema(schema, [], (fieldPath, field) => {
					addRow({
						kind: "runnable_parameter",
						location:
							"manifest.runnables[" +
							slug(runnableKey) +
							"].input_schema" +
							pointer(fieldPath),
						label:
							(runnable.name || runnableKey) +
							" input " +
							fieldPath.join(".") +
							": " +
							(field.description || field.type || "field"),
					});
				});
			}

			for (const [contributionName, contribution] of Object.entries(
				manifest.contributes || {}
			)) {
				visitContribution(
					contribution,
					["manifest", "contributes", contributionName],
					(pathParts, item) => {
						const descriptor =
							item && isNativeObjectLike(item) ? item : { value: item };
						const itemKey =
							descriptor.id ||
							descriptor.name ||
							descriptor.command ||
							pathParts.at(-1);
						const bodyPaths = codeFilesIn(descriptor).map((file) =>
							relative(REPO_ROOT, join(packageRoot, file))
						);
						const itemPointer = pointer(pathParts.slice(1));
						addRow({
							kind: "contribution",
							location: itemPointer,
							label: `${contributionName}: ${itemKey}`,
							sourceFiles: bodyPaths,
						});
						for (const [fieldIndex, field] of (
							descriptor.fields || []
						).entries()) {
							addRow({
								kind: "contribution_field",
								location: `${itemPointer}/fields/${fieldIndex}`,
								label:
									itemKey +
									" field " +
									(field.label || field.key || field.pref_key || fieldIndex) +
									": " +
									(field.type || "control"),
								sourceFiles: bodyPaths,
							});
						}
					}
				);
			}

			for (const [capIndex, capability] of (
				manifest.provides || []
			).entries()) {
				const capabilityId = capability.capability || `capability-${capIndex}`;
				addRow({
					kind: "provider_capability",
					location: `manifest.provides[${slug(capabilityId)}]`,
					label:
						(capability.title || capabilityId) +
						" (" +
						(capability.capability || "unnamed capability") +
						")",
				});
				for (const [toolId, binding] of Object.entries(
					capability.tools || {}
				)) {
					addRow({
						kind: "provider_tool",
						location:
							"manifest.provides[" +
							slug(capabilityId) +
							"].tools[" +
							slug(toolId) +
							"]",
						label: `${capabilityId}: ${toolId}`,
						sourceFiles: codeFilesIn(binding).map((file) =>
							relative(REPO_ROOT, join(packageRoot, file))
						),
					});
				}
			}

			for (const [serverName, server] of entries(manifest.mcp_servers)) {
				addRow({
					kind: "mcp_server",
					location: `manifest.mcp_servers[${slug(serverName)}]`,
					label:
						serverName +
						": " +
						(server.url || server.command || server.type || "MCP server"),
				});
			}

			for (const [indexOrName, sidecar] of entries(manifest.sidecars)) {
				const sidecarName = sidecar.id || sidecar.name || indexOrName;
				addRow({
					kind: "sidecar",
					location: `manifest.sidecars[${slug(sidecarName)}]`,
					label: `${sidecarName}: ${sidecar.description || sidecarName}`,
					sourceFiles: codeFilesIn(sidecar).map((file) =>
						relative(REPO_ROOT, join(packageRoot, file))
					),
				});
			}

			const mcpPath = join(packageRoot, "mcp.json");
			if (exists(mcpPath)) {
				const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
				for (const [serverName, server] of entries(mcp.mcpServers)) {
					addRow({
						kind: "mcp_config",
						location: `mcp.json.mcpServers[${slug(serverName)}]`,
						label:
							serverName +
							": " +
							(server.url || server.command || server.type || "MCP config"),
						artifact: "mcp.json",
					});
				}
			}

			for (const [extensionHost, extensionInfo] of entries(plugin.extensions)) {
				addRow({
					kind: "plugin_extension",
					location: `plugin.json.extensions[${slug(extensionHost)}]`,
					label:
						extensionHost +
						": " +
						(extensionInfo.displayName ||
							extensionInfo.name ||
							extensionInfo.id ||
							packageDir),
					artifact: "plugin.json",
				});
			}

			if (isNativeText(manifest.backend_code)) {
				const backendPath = join(packageRoot, "backend.js");
				addRow({
					kind: "embedded_backend",
					location: "manifest.backend_code",
					label: `${manifest.name || packageDir} embedded backend`,
					sourceFiles: exists(backendPath)
						? [relative(REPO_ROOT, backendPath)]
						: [],
				});
			}

			for (const codeDirectory of CODE_DIRS) {
				for (const file of sourceCodeFiles(packageRoot, codeDirectory)) {
					const kind =
						codeDirectory === "sidecar" ? "sidecar_code_file" : "code_file";
					addRow({
						kind,
						location: `source:${file}`,
						label: `${codeDirectory} source ${file}`,
						artifact: file,
						sourceFiles: [relative(REPO_ROOT, join(packageRoot, file))],
					});
				}
			}
		}
	}
	return rows.sort((left, right) => left.row_id.localeCompare(right.row_id));
}

function readCoverageMap() {
	return JSON.parse(readFileSync(COVERAGE_MAP_PATH, "utf8"));
}

export function renderInventory(
	rows = discoverInventoryRows(),
	coverageMap = readCoverageMap()
) {
	const byId = new Map(rows.map((row) => [row.row_id, row]));
	for (const [rowId, override] of Object.entries(coverageMap)) {
		const row = byId.get(rowId);
		ensure(row, `coverage map references unknown inventory row: ${rowId}`);
		ensure(STATUSES.has(override.status), `invalid status for ${rowId}`);
		row.status = override.status;
		row.evidence = clean(override.evidence);
		if (override.boundary) {
			row.boundary = clean(override.boundary);
		}
	}
	return [
		COLUMNS.join("\t"),
		...rows.map((row) =>
			COLUMNS.map((column) => clean(row[column])).join("\t")
		),
		"",
	].join("\n");
}

function summarize(rows) {
	const result = {};
	for (const cluster of CLUSTERS) {
		const items = rows.filter((row) => row.cluster === cluster);
		result[cluster] = {
			rows: items.length,
			behavior: items.filter((row) => row.status === "behavior").length,
			partial: items.filter((row) => row.status === "partial").length,
			unmapped: items.filter((row) => row.status === "unmapped").length,
		};
	}
	return result;
}

export function checkInventory({ write = false } = {}) {
	const rows = discoverInventoryRows();
	const rendered = renderInventory(rows, readCoverageMap());
	if (write) {
		writeFileSync(INVENTORY_PATH, rendered);
	} else {
		ensure(
			readFileSync(INVENTORY_PATH, "utf8") === rendered,
			"interaction-inventory.tsv is stale; update coverage-map.json then run inventory.mjs --write"
		);
	}
	for (const row of rows) {
		for (const sourceFile of row.source_files.split(";").filter(Boolean)) {
			ensure(
				exists(join(REPO_ROOT, sourceFile)),
				`${row.row_id} references missing source file ${sourceFile}`
			);
		}
		if (row.status !== "unmapped") {
			ensure(row.evidence, `${row.row_id} has no test evidence path`);
			const evidencePath = row.evidence.split("#", 1)[0];
			ensure(
				exists(join(REPO_ROOT, evidencePath)),
				`${row.row_id} references missing evidence file ${evidencePath}`
			);
		}
	}
	return { rows, summary: summarize(rows) };
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const write = process.argv.includes("--write");
	const result = checkInventory({ write });
	console.log(JSON.stringify(result.summary, null, 2));
	console.log(
		(write ? "Wrote " : "Validated ") +
			result.rows.length +
			" interaction rows."
	);
}
