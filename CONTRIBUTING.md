# Publish a package to the Ryu marketplace

GitHub is the package and release source of truth. You keep the repository,
tags, issues, and release assets in your own GitHub account. Ryu stores the
listing binding, offer, Stripe Connect IDs, entitlement, review, and moderation
state; it does not become a second package registry or require a central
marketplace index.

## 1. Add a package manifest

Put a `ryu.package.json` at the repository root for a standalone package, or in
each package folder of a collection repository. Supported kinds are `app`,
`plugin`, `skill`, `agent`, `workflow`, `theme`, `output_style`, `space`,
`profile`, and `bundle`.

```json
{
  "schemaVersion": 1,
  "kind": "plugin",
  "id": "com.example.release-notes",
  "name": "Release Notes",
  "version": "1.0.0",
  "artifacts": ["plugin/manifest.json"],
  "targets": ["desktop"],
  "scopes": ["desktop"],
  "requires": {},
  "capabilities": ["network"],
  "security": {
    "containsSecrets": false,
    "privateContent": false,
    "permissions": ["network"],
    "redacted": false
  }
}
```

Keep package IDs stable. A package may use `/` in its ID, but its manifest,
release asset, and Ryu listing must keep the same identity across versions.
Do not commit secrets or private customer content. Ryu rejects packages that
declare secret-bearing or private-content material.

## 2. Choose discovery

- Tag a standalone repository with `ryu-app` or `ryu-plugin`.
- Tag a collection repository with `ryu-marketplace`; Ryu scans folders that
  contain `ryu.package.json`.

There is no `marketplace.json` index to maintain. A seller pastes the repository
or package-folder URL into the seller flow. The server discovers the topic,
resolves the package, and records the GitHub binding. Collection folders are
individual listings, not entries copied into a second registry.

## 3. Create an immutable release

Build a deterministic archive named `<id>-<version>.ryupack`. The archive must
contain the validated `ryu.package.json` and exactly the files declared by the
package tree. Publish it on an immutable GitHub Release; do not replace an asset
after publishing it. Ryu validates the manifest, pins the commit and release,
computes the package and asset SHA-256 digests, checks the archive against the
source tree, validates requested grants through the Gateway, and signs the
manifest before the listing can be approved.

The seller flow calls `POST /api/marketplace/github/inspect` while you review a
package and `POST /api/marketplace/github/publish` to submit it for moderation.
Use `POST /api/marketplace/github/resync` after a release change. Configure a
GitHub Release webhook at `POST /api/marketplace/github/webhook` so release and
push events trigger an idempotent resync.

For a private repository, the seller completes a one-time GitHub App
installation from the URL returned by the inspect response. Ryu stores the
installation binding and requests short-lived installation tokens only while
it validates or proxies a release. Tokens never enter a listing, catalog card,
desktop state, or buyer flow.

## 4. Add an offer

Free listings need no Stripe setup. Paid listings use Stripe Connect onboarding
for the seller organization and can be one-time, monthly, or yearly:

```json
{
  "model": "subscription",
  "interval": "month",
  "amountMinor": 1200,
  "currency": "usd",
  "distribution": "github_release"
}
```

Stripe owns checkout, recurring invoices, transfers, and payouts. Ryu keeps the
Stripe IDs and is authoritative for the package binding and entitlement. Stripe
metadata contains Ryu listing and buyer IDs for reconciliation; it is not an
authorization decision.

## 5. Buyer and node behavior

Buyers do not set up GitHub or authenticate with GitHub. Core asks Ryu for the
signed descriptor, Ryu checks the buyer's entitlement, and Ryu streams the
private or public release asset through `/api/marketplace/github/:kind/:id/download`.
The archive is verified and installed locally as a portable package.

Lifecycle actions are independent node-scoped permissions:

```text
app.install   app.update   app.enable   app.disable   app.uninstall
```

The same permissions apply to every package kind. The node ACL can be edited at
`GET/PUT /api/acl/resources/node/:nodeId` by a personal-node owner or an org
owner/admin, or by a caller with `roles.manage`. Team and member grants are
explicit; an individual deny overrides a team grant. Personal-node ownership is
never bypassed by org administration.

An expired subscription blocks new installs, updates, and release downloads.
Already-installed bytes remain usable, and disable/uninstall remain available.
Every denied mutation returns a structured `403` with the required permission
and node scope.

## Legacy compatibility

The old server-stored artifact publish path remains read-only compatibility data
while existing listings are verified and migrated; write attempts receive
`410 github_source_required`. New listings must use a GitHub repository and
immutable `.ryupack` release. Do not add or update a central `marketplace.json`
index for new packages.

## Rules

- No secrets, telemetry-by-default, obfuscated code, or private customer data.
- Release assets are immutable and deterministic.
- Requested capabilities must match the package behavior.
- All public links must use `https`.
- The package must remain installable from its own GitHub repository without a
  Ryu-owned copy of its source.
