# pxpipe

[pxpipe](https://github.com/teamchong/pxpipe) is a loopback proxy that renders the
bulky, static half of a request — the system prompt, the tool-schema block, large
tool results, older conversation history — into PNG pages and sends them as image
blocks. Vision models price an image by its pixel area, not by the density of what
is drawn on it, so dense technical text lands at roughly **3.1 characters per
image-token** against 1 character per text-token: ~4.7× more context for the same
budget. Recent turns and sparse content stay as text.

This plugin is the **process lifecycle plus a mounted dashboard**. It does not
change how Ryu talks to a provider — see "Wiring it up".

## Wiring it up

pxpipe is a *transparent* proxy: it forwards whatever auth header its caller sent.
It owns no credential. So it cannot be a self-configuring Ryu provider — you point
a provider at it and supply your own key:

| field    | value                                        |
| -------- | -------------------------------------------- |
| Base URL | `http://127.0.0.1:47821`                     |
| API type | `anthropic-messages`                         |
| API key  | your own Anthropic key                       |

The proxy also speaks OpenAI chat/completions and Responses (`/v1/...`) and Google
`generateContent`, and defaults its upstreams to `https://api.anthropic.com` /
`https://api.openai.com`. `ANTHROPIC_UPSTREAM`, `OPENAI_UPSTREAM` and
`PXPIPE_UPSTREAM` retarget them; `PXPIPE_MODELS=off` disables imaging entirely
without taking the proxy down.

The dashboard (live savings, before/after pairs, model chips, kill switch) is
mounted behind Core auth at `/api/ext/@ryu/pxpipe`. The scoped id's slash is a real
path separator — `split_scoped_plugin_path` reunites the two segments — and the bare
form resolves to sub-path `/`, which is why the manifest declares a `"/"` route
alongside `/dashboard`. Routes are matched by the proxy's own `route_matches`, not
registered into a router, so `"/"` and `"/fragments/*rest"` coexist without conflict.

`max_body_bytes` is tightened to 4 MiB from the 10 MiB default: it bounds only the
*request* body Core buffers, and the sole POST here is the kill switch
(`/api/compression`). Responses — including the PNG previews — stream through
untouched.

## Why it is shaped this way

Three seams were considered and rejected on evidence. Recorded here so the next
reader does not re-derive them.

**`provides_provider` (self-registering provider).** The obvious fit, and it does
not work. `register_provider_once` in `apps/core/src/sidecar/manifest_sidecar.rs`
passes the sidecar's `RYU_EXT_TOKEN` as the provider's `apiKey`, and pxpipe's
Anthropic path never populates `config.apiKey`, so that token is forwarded verbatim
to `api.anthropic.com` — a guaranteed 401. Editing the key by hand does not survive
either: the registration latch is a per-process `AtomicBool`, so every Core restart
re-fires the healthy edge and re-stamps it. The seam is built for credential-*owning*
bridges (see `examples/auth-bridge`, which reads `~/.codex/auth.json` and ignores the
inbound key). pxpipe owns no credential. Wrong seam, not a wiring bug.

**The gateway compression policy** (`policy_type: "compression"`, what `@ryu/headroom`
uses). It would auto-wrap every gateway-routed agent with no manual provider step,
and the Gateway holds the credentials so the auth problem disappears. But it calls
`POST <url>/v1/compress` with `{messages, model}`; pxpipe serves no such route. An
adapter over pxpipe's library exports (`renderTextToImages`,
`transformAnthropicMessages`) would have to ship as a `kind: "node"` sidecar, which
Core refuses unless `ryu:experimental-plugin-runtime` is on — default off. Inert as
shipped, so not shipped.

**`lazy` + `idle_stop_secs`.** Both are driven by the ext-proxy hop
(`apps/core/src/sidecar/ext_proxy.rs`). Model traffic reaches pxpipe *directly* on
the loopback port and never touches Core, so it would register as zero activity:
`lazy` would leave the proxy unstarted until someone opened the dashboard, and
`idle_stop_secs` would reap a proxy that is carrying live turns. The sidecar is
therefore eager and never idle-stopped.

## Install shape

`SidecarProcess::Local` with `command: "npx"`, args pinned to
`pxpipe-proxy@0.11.1`. pxpipe publishes to npm only — there is no release artifact
for the checksum-verified `Binary` variant to point at, and `Local` is documented as
the first-party escape hatch, so this is the less-bad of two imperfect options
rather than the intended one. Consequence to know about: on a **release** build,
`resolve_local_sidecar_program` first probes the Ryu release page for an
`npx-<platform>` asset, fails, warns, and falls through to `npx` on `PATH`. Harmless,
but it is one 404 per cold start.

`port_env: "PORT"` — pxpipe reads `process.env.PORT`, so Core's profile-shifted port
reaches it and concurrent Core profiles do not collide on 47821.

`health_path: "/proxy-stats"`, verified 200 on a cold instance with zero traffic.
`/api/stats.json` is a dashboard-only route and 404s in this build; do not use it.

## Tier

Core-tier (`CORE_PLUGINS`) but **not** default-on, for the same reason
`@ryu/scrapling` is: Core-tier is a requirement, not a promotion. A Community-tier
plugin needs the Gateway-approved `sidecar:process` grant before Core will spawn a
managed sidecar, and the Gateway denies that grant at enable — a Community pxpipe
would install and then never start its proxy. It stays install-then-enable because
it needs Node on `PATH` and fetches a package on first run.
