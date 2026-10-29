const tool = (module, name) => `tool_exec::tests::${module}_runtime::${name}`;
const registry = (module, name) => `sidecar::mcp::tests::${module}::${name}`;
const decisions = registry(
	"local_decision_models_runtime",
	"local_decision_models_dispatch_and_switch_through_canonical_facade"
);

export const CORE_RUNTIME_FILTERS = {
	"output-styles": [
		"server::output_styles_package_runtime::shipped_profiles_sync_read_fork_disable_and_recover",
		"sidecar::adapters::output_styles_package_prompt::every_shipped_profile_resolves_and_shapes_both_prompt_planes",
	],
	spider: [
		"tool_exec::tests::spider_runtime::spider_canonical_registry_preserves_grants_and_egress_refusal",
	],
	scrapling: [
		"sidecar::mcp::tests::scrapling_capabilities_runtime::shipped_scrapling_adapter_routes_formats_chunks_failures_and_grants",
	],
	advisor: [
		tool(
			"advisor",
			"shipped_advisor_tool_reaches_core_http_runtime_and_preserves_contracts"
		),
	],
	"agent-comms": [
		tool(
			"agent_comms",
			"shipped_agent_directory_runs_through_core_http_runtime"
		),
	],
	reactions: [
		"plugin_host::agent_react_runtime_test::sealed_agent_react_actual_host_actor_refusals_retry_reopen_and_room",
		"plugin_host::agent_react_runtime_test::sealed_agent_react_without_message_id_acknowledges_the_latest_user_message",
		"sidecar::mcp::agent_react_registry_runtime_test::agent_react_registry_dispatch_binds_actor_and_conversation",
	],
	agentbrowser: [
		"sidecar::mcp::tests::agentbrowser_capabilities_runtime::agentbrowser_canonical_routes_sequence_real_mcp_calls",
	],
	brave: [
		tool(
			"brave",
			"shipped_brave_search_reaches_core_http_runtime_and_preserves_contracts"
		),
	],
	bytebot: [
		registry(
			"bytebot_registry_runtime",
			"bytebot_canonical_verbs_dispatch_with_grants_and_failures"
		),
	],
	"cloudflare-clef": [
		registry(
			"cloudflare_clef_runtime",
			"shipped_clef_runs_through_registry_without_provider_headers"
		),
		registry(
			"cloudflare_clef_runtime",
			"sidecar_secrets_are_explicit_scoped_and_missing_values_are_omitted"
		),
	],
	exa: [
		tool(
			"exa",
			"shipped_exa_runnables_reach_core_http_runtime_and_preserve_contracts"
		),
	],
	firecrawl: [
		tool(
			"firecrawl",
			"shipped_firecrawl_runnables_reach_core_http_runtime_and_preserve_contracts"
		),
	],
	headroom: [
		"sidecar::gateway::tests::headroom_policy_runtime::shipped_headroom_policy_sets_and_clears_spawn_contract",
	],
	honcho: [
		tool("honcho", "shipped_honcho_dialectic_runnable_uses_core_http_dispatch"),
		tool(
			"honcho",
			"shipped_honcho_memory_search_binding_reaches_core_http_runtime"
		),
		tool(
			"honcho_mutation",
			"honcho_native_mutations_preserve_routes_bodies_state_and_errors"
		),
		"sidecar::mcp::honcho_registry_runtime_test::memory_search_dispatches_through_registry_with_manifest_defaults_and_grants",
	],
	kev: [
		tool(
			"kev",
			"shipped_kev_runnables_preserve_keyless_http_contract_and_errors"
		),
	],
	"jina-reader": [
		tool(
			"jina_reader",
			"jina_reader_hydrated_registry_preserves_authorization_transport_refusal_and_retry"
		),
	],
	"kill-switch": [
		"execution_control::tests::kill_switch_resume_only_admits_new_generation",
		"execution_control::tests::kill_switch_midstream_pause_closes_and_drops_provider",
		"execution_control::tests::kill_switch_natural_completion_keeps_provider_frames_and_fresh_admission",
	],
	firewall: [
		"server::gateway_policy_patch_tests::firewall_dispatch_runtime::shipped_firewall_dispatch_preserves_live_state_and_fails_closed_until_retry",
	],
	laya: [decisions],
	mem0: [
		"tool_exec::tests::mem0_manifest_tools_reach_the_http_runtime_with_expected_payloads",
		tool(
			"mem0",
			"mem0_canonical_registry_preserves_scope_state_permissions_and_recovery"
		),
	],
	ollaya: [decisions],
	parallel: [
		tool(
			"parallel",
			"shipped_parallel_runnables_use_core_dispatcher_for_exact_contracts_and_errors"
		),
	],
	recap: [
		"plugin_host::hooks_runtime_tests::shipped_recap_mute_clear_refusal_and_retry_roundtrip_real_sandbox",
	],
	"security-scanner": [
		"plugin_host::hooks_runtime_tests::shipped_security_clear_refusal_and_retry_roundtrip_real_sandbox",
		"skills_catalog::plugin_skills::installed_runtime_tests::installed_skill_bodies_install_activate_preserve_collisions_and_retry",
	],
	"writing-style": [
		"skills_catalog::plugin_skills::installed_runtime_tests::installed_skill_bodies_install_activate_preserve_collisions_and_retry",
	],
	"llm-wiki": [
		"skills_catalog::plugin_skills::installed_runtime_tests::installed_skill_bodies_install_activate_preserve_collisions_and_retry",
	],
	serper: [
		tool(
			"serper",
			"shipped_serper_runnables_reach_core_http_runtime_and_preserve_contracts"
		),
	],
	shadow: [
		tool(
			"shadow",
			"shipped_shadow_runnables_reach_core_http_runtime_with_expected_requests"
		),
	],
	spidercloud: [
		tool(
			"spidercloud",
			"shipped_spidercloud_crawl_runs_with_exact_core_payload_defaults_and_errors"
		),
		"sidecar::mcp::tests::spidercloud_capabilities_runtime::shipped_spidercloud_canonical_crawl_maps_defaults_clamps_errors_and_grants",
	],
	tavily: [
		tool(
			"tavily",
			"shipped_tavily_runnables_reach_core_http_runtime_and_preserve_contracts"
		),
	],
};
for (const name of [
	"action-summary",
	"advisor",
	"agent-comms",
	"agentation",
	"agentbrowser",
	"agents-md-tail",
	"auto-continue",
	"bitwarden",
	"brave",
	"browser-use",
	"chat-title",
	"chatgpt-web",
	"cloudflare-browser-run",
	"cloudflare-clef",
	"composio-connect",
	"codex-computer-use",
	"deepseek",
	"docs",
	"double-check",
	"dynamic-workflows",
	"effort-escalator",
	"ego-browser",
	"exa",
	"expect",
	"firecrawl",
	"functiongemma",
	"ghost",
	"goal",
	"honcho",
	"jina-reader",
	"kernel",
	"kill-switch",
	"laya",
	"llm-wiki",
	"no-ai-slop",
	"no-more-mistakes",
	"needle3",
	"observer-agents",
	"parallel",
	"pi-subagent",
	"plan-continue",
	"proof",
	"reactions",
	"recap",
	"receipts",
	"ripgrep",
	"rtk",
	"rules",
	"sample",
	"sample-widget",
	"scrapling",
	"security-guidance",
	"security-scanner",
	"serper",
	"spider",
	"spidercloud",
	"steel",
	"tavily",
	"tokenmaxxing",
	"toolsmith-example",
	"usage-pacer",
	"zvec-grep",
]) {
	CORE_RUNTIME_FILTERS[name] ??= [];
	CORE_RUNTIME_FILTERS[name].push(
		"plugins::shipped_grants_runtime_tests::shipped_package_grants_fail_closed_revoke_and_retry"
	);
}
for (const name of [
	"action-summary",
	"advisor",
	"agent-comms",
	"agents-md-tail",
	"auto-continue",
	"chat-title",
	"clangd-lsp",
	"composer-predictions",
	"csharp-lsp",
	"double-check",
	"effort-escalator",
	"expanded-composer",
	"ghost-chats",
	"goal",
	"gopls-lsp",
	"hook-observers",
	"hook-session-context",
	"jdtls-lsp",
	"kotlin-lsp",
	"lua-lsp",
	"no-ai-slop",
	"no-more-mistakes",
	"observer-agents",
	"output-styles",
	"php-lsp",
	"pi-monitor",
	"pi-shell",
	"pi-subagent",
	"plan-continue",
	"prompt-suggestions",
	"proof",
	"pyright-lsp",
	"reactions",
	"recap",
	"receipts",
	"reconnect-retry",
	"ruby-lsp",
	"rules",
	"rust-analyzer-lsp",
	"security-guidance",
	"security-scanner",
	"side-chats",
	"stats",
	"swift-lsp",
	"tokenmaxxing",
	"tool-firewall",
	"typescript-lsp",
	"usage-pacer",
	"writing-style",
]) {
	CORE_RUNTIME_FILTERS[name] ??= [];
	CORE_RUNTIME_FILTERS[name].push(
		"server::activation_package_runtime::shipped_activation_matching_registration_and_failure_recovery"
	);
}
CORE_RUNTIME_FILTERS.ghost.push(
	"sidecar::mcp::tests::ghost_capabilities_runtime::shipped_ghost_bindings_route_all_native_calls_and_refuse_unapproved_servers"
);
CORE_RUNTIME_FILTERS["cloudflare-browser-run"].push(
	"sidecar::mcp::tests::cloudflare_oauth_capabilities_runtime::cloudflare_oauth_sealed_binding_projects_only_to_bound_canonical_fixture"
);
CORE_RUNTIME_FILTERS["ego-browser"].push(
	"offline_test_bootstrap::tests::isolated_bootstrap_rejects_release_profiles_credentials_and_reused_state"
);
for (const name of ["recap", "security-scanner"]) {
	CORE_RUNTIME_FILTERS[name].push(
		"plugin_host::tests::hook_grants_never_use_unapproved_declared_capabilities"
	);
}
for (const name of ["kev", "cloudflare-clef"]) {
	CORE_RUNTIME_FILTERS[name].push(
		"sidecar::mcp::tests::kev_clef_capabilities_runtime::kev_clef_canonical_selection_preserves_requests_grants_and_errors"
	);
}
for (const name of [
	"brave",
	"exa",
	"tavily",
	"firecrawl",
	"serper",
	"parallel",
	"deepseek",
]) {
	CORE_RUNTIME_FILTERS[name].push(
		"sidecar::mcp::tests::web_capabilities_runtime::hydrated_web_providers_dispatch_canonical_requests_and_failures"
	);
}
for (const name of [
	"clangd-lsp",
	"csharp-lsp",
	"gopls-lsp",
	"jdtls-lsp",
	"kotlin-lsp",
	"lua-lsp",
	"php-lsp",
	"pyright-lsp",
	"ruby-lsp",
	"rust-analyzer-lsp",
	"swift-lsp",
	"typescript-lsp",
]) {
	CORE_RUNTIME_FILTERS[name] = [
		"pi_config::shipped_lsp_runtime_tests::shipped_lsp_packages_materialize_disable_and_retry_in_managed_agent_directory",
	];
}

for (const name of [
	"action-summary",
	"advisor",
	"agent-comms",
	"agentation",
	"agentbrowser",
	"agents-md-tail",
	"ambient-elevator",
	"auto-continue",
	"bitwarden",
	"brave",
	"bytebot",
	"chat-title",
	"chatgpt-web",
	"clangd-lsp",
	"cloudflare-browser-run",
	"cloudflare-clef",
	"composer-predictions",
	"composio-connect",
	"codex-computer-use",
	"csharp-lsp",
	"deepseek",
	"docs",
	"double-check",
	"dynamic-workflows",
	"effort-escalator",
	"ego-browser",
	"exa",
	"expanded-composer",
	"expect",
	"firecrawl",
	"firewall",
	"ghost",
	"ghost-chats",
	"goal",
	"gopls-lsp",
	"headroom",
	"honcho",
	"hook-observers",
	"hook-session-context",
	"jdtls-lsp",
	"kev",
	"kotlin-lsp",
	"laya",
	"llm-wiki",
	"lua-lsp",
	"mem0",
	"no-ai-slop",
	"no-more-mistakes",
	"observer-agents",
	"ollaya",
	"output-styles",
	"parallel",
	"php-lsp",
	"pi-monitor",
	"pi-shell",
	"pi-subagent",
	"plan-continue",
	"prompt-suggestions",
	"proof",
	"pxpipe",
	"pyright-lsp",
	"reactions",
	"recap",
	"receipts",
	"reconnect-retry",
	"ripgrep",
	"rtk",
	"ruby-lsp",
	"rules",
	"rust-analyzer-lsp",
	"sample",
	"sample-widget",
	"scrapling",
	"security-guidance",
	"security-scanner",
	"serper",
	"shadow",
	"side-chats",
	"spider",
	"spidercloud",
	"stats",
	"swift-lsp",
	"tavily",
	"tokenmaxxing",
	"tool-firewall",
	"toolsmith-example",
	"typescript-lsp",
	"usage-pacer",
	"writing-style",
	"zvec-grep",
]) {
	CORE_RUNTIME_FILTERS[name] ??= [];
	CORE_RUNTIME_FILTERS[name].push(
		"plugin_manifest::shipped_portable_loader_runtime::shipped_portable_packages_resolve_refuse_restore_and_preserve_native_precedence"
	);
}

export function runtimePlan(packages) {
	const selected = packages ?? Object.keys(CORE_RUNTIME_FILTERS);
	return {
		packages: selected.filter((name) =>
			Object.hasOwn(CORE_RUNTIME_FILTERS, name)
		),
		boundaries: selected.filter(
			(name) => !Object.hasOwn(CORE_RUNTIME_FILTERS, name)
		),
		filters: [
			...new Set(selected.flatMap((name) => CORE_RUNTIME_FILTERS[name] ?? [])),
		],
	};
}

export function assertListedFilters(filters, output) {
	const listed = new Set(
		output
			.split(/\r?\n/)
			.filter((line) => line.endsWith(": test"))
			.map((line) => line.slice(0, -6))
	);
	const missing = filters.filter((filter) => !listed.has(filter));
	if (missing.length) {
		throw new Error(
			`Core runtime filters missing from compiled binary: ${missing.join(", ")}`
		);
	}
}

export function assertRuntimeResult(filter, result) {
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0 || result.signal) {
		throw new Error(
			`Core runtime failed: ${filter} (status=${result.status}, signal=${result.signal})`
		);
	}
	const summaries = [
		...(result.stdout ?? "").matchAll(
			/test result: (ok|FAILED)\. (\d+) passed; (\d+) failed;/g
		),
	];
	if (
		summaries.length === 0 ||
		summaries.some(
			(summary) =>
				summary[1] !== "ok" || summary[2] !== "1" || summary[3] !== "0"
		)
	) {
		throw new Error(
			`Core runtime did not execute exactly one passing test: ${filter}`
		);
	}
}

export function assertFreshSnapshot(built, started, sources) {
	if (built < started) {
		throw new Error(
			"Core binary predates the current compilation; wait for its completed artifact"
		);
	}
	for (const source of sources) {
		if (source.modified > started) {
			throw new Error(
				`Core source changed after compilation began: ${source.path}; compile a stable source snapshot`
			);
		}
	}
}

for (const filters of Object.values(CORE_RUNTIME_FILTERS)) {
	filters.push(
		"server::catalog_package_cards_runtime::shipped_package_cards_project_canonical_identity_and_permissions"
	);
}
