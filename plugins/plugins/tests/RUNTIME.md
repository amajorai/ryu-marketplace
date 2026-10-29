# Bundled package tests

Headroom additionally runs seven Gateway pipeline/compression cases after its Core
policy fixture. The standalone Gateway stage is `node plugins-store/tests/headroom-gateway-runtime.mjs`.
`--gateway-binary /absolute/current/Gateway-test-artifact` reuses a fresh Cargo artifact
and is accepted by both the package and runtime runners when Headroom is selected.
Both compiler stages acquire the shared heavy-build lease for compilation only.
Set `RYU_COVERAGE_RESOURCE_POOL=/private/tmp/ryu-coverage-resource-pool` during
the coordinated local sweep; do not wrap the runner in another heavy-build lease.

Run one plugin independently:

```sh
rtk proxy node plugins-store/tests/run.mjs plugins --package mem0
```

The default runner first executes that package's Node/Python suites, then the
registered local Core fixture filters. Core is compiled once for the invocation;
shared filters (Laya/Ollaya and the shipped LSP packages) run once. Every exact filter must appear in the compiled
binary and execute one passing test. Missing filters, compile errors, timeouts,
subprocess errors and zero-test results fail the stage.

Inspect the exact mapping without compiling:

```sh
rtk proxy node plugins-store/tests/runtime.mjs --list-plan
rtk proxy node plugins-store/tests/runtime.mjs --package mem0,bytebot --list-plan
```

`runtime-map.mjs` is the per-package dispatch map. A package without a registered
Core fixture is printed as a runtime boundary; its package tests do not prove Core
execution. The runtime-only runner rejects a selection with no registered filters.

For authoring-only package checks, explicitly exclude Core:

```sh
rtk proxy node plugins-store/tests/run.mjs plugins --package recap --contract-only
```

This prints `CONTRACT-ONLY`. It is never equivalent to the bundled runtime stage.

After a current Core test binary has been compiled, reuse it for a selected stage:

```sh
rtk proxy node plugins-store/tests/runtime.mjs --package mem0,bytebot,recap,security-scanner --core-binary /absolute/path/to/current/Core-test-binary
```

The binary must be a completed Cargo artifact. Core/crate Rust sources and selected
manifest/hook/adapter and embedded skill/profile/extension sources, plus Cargo
manifests and lockfile, must predate its Cargo invocation timestamp; edits
made during a build cannot be hidden by a later binary link time. This check applies
to fresh compilation and supplied binaries. Missing exact filters are still rejected. The normal
runner also accepts `--core-binary` to avoid a second compilation. Default compilation
uses Cargo's executable artifact metadata rather than guessing a target filename.

Each stage uses `RYU_PROFILE=dev`, `RYU_KEYCHAIN=off` and a unique temporary
`RYU_DIR`. Rust test threads use a 16 MiB stack for the large registry fixture
futures. Provider/node credential environment is excluded. The tests use synthetic
keys and local fixture endpoints; they preserve HTTPS/secret and egress refusal
checks. They do not prove live accounts, provider acceptance, actual desktop input,
or physical devices. Run local fixtures where loopback sockets and child
processes are allowed; a permission failure is a failed stage, never a skip.

For the concurrently edited coverage sweep, honor
`docs/proof/test-coverage-sweep-20260924/parallel/resource-pool.md` before compilation
or browser suites. Compiler stages release only their own lease after the process
finishes. Supplied-artifact validation and runtime tests do not hold a build lease.

The LSP stage exercises shipped manifest resolution and managed-agent configuration
write, disable, failure and retry readback for all twelve packages. It does not
launch language servers. Output Styles exercises the shipped profiles through
Core storage and prompt helpers. Spider exercises canonical routing, the
pre-spawn refusal of private URLs, and a sentinel spawn behind Core's per-call
egress broker (proxy environment and broker refusal of the metadata address); it
does not run a real crawl.

The canonical web matrix drives six hydrated search providers and their declared
extract/crawl mappings, including exact requests, defaults, error/retry and grant
refusal. Kev and Clef additionally drive their reachable canonical decision verbs.
Agentbrowser drives canonical routes through a local MCP HTTP protocol fixture:
changing the shipped stdio transport loses Core provenance, and the fixture must
receive explicit Community MCP approval before registration. This does not prove
the pinned npm process, a real browser or OAuth. Firewall drives the same live
policy helper called by the production dispatcher, preserving operator fields and
failing closed on unreadable config; full Store activation and Gateway model
enforcement remain separate checks. Installed skill tests use real isolated package
trees and scanners, preserving ownership and write/activation failure recovery.

The shared grant matrix exercises unchanged authored manifests through Core's real
install/enable/grant-edit/disable lifecycle and reopened SQLite state. Its Gateway
responses are controlled loopback fixtures; this proves Core approval/refusal/revoke
handling, separately from actual Gateway policy and host action execution. The
external plugin cluster now runs this registered Core fixture by default and accepts
`--core-binary`; hosted OAuth and provider startup remain separate boundaries.
When an exact filter covers multiple packages, artifact freshness checks include
the source packages of every shared-filter owner, even for a narrow selection.

The activation fixture invokes the production driver with its real dependency
builder, stores, runtime generations and handlers. It proves Switchboard registration
and Output Styles startup sync; all other shipped-event matching assertions alone
do not prove those packages' host activation. Spidercloud and Scrapling additionally
exercise their canonical mappings with local HTTP/MCP transport fixtures. Transport
replacement does not establish npm/pip installation, browser operation or upstream
acceptance.
