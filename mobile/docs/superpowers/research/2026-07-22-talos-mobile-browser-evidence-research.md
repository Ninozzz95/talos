# TALOS Mobile Browser And Evidence Research

Date: 2026-07-22
Owner: Codex mobile lane
Status: COMPLETE for P1.7 implementation
Desktop reference: `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed`

## Problem statement

TALOS mobile must keep Browse inside the ordinary Chat surface, render real browser
evidence next to the response that owns it, and provide a safe path from manual local
browsing to full trusted-node automation. The APK must remain useful when installed
without the desktop stack, but it must never claim that a provider inspected a page
when no browser evidence reached the model.

## Local inspection

The frozen desktop implementation already defines the durable product semantics:

- `browser-worker/` owns Playwright and MCP execution. It pins
  `@playwright/mcp@0.0.78`, `@modelcontextprotocol/sdk@1.29.0`, and
  `playwright@1.61.1`.
- Laravel owns users, browser sessions, approvals, action capabilities, artifacts,
  replay and audit. Browser routes use the authenticated web session boundary.
- The worker is internal-only. Its service token and ES256 capability-signing
  material are privileged machine credentials, not mobile-user credentials.
- The mobile database already contains `talos_chat_tool_activities`, but its
  repository contract does not expose the table.
- Mobile already carries the frozen browser task, activity, artifact, snapshot and
  HMI policy types, but has no browser UI, local browser adapter, evidence parser or
  durable activity projection.

## Current primary sources

### Capacitor InAppBrowser

Source: <https://capacitorjs.com/docs/apis/inappbrowser>

The official plugin provides three supported presentation boundaries: isolated
in-app WebView, platform system browser and external browser. `openInWebView` exposes
load, navigation and close events; it does not expose the page DOM, screenshots or
arbitrary JavaScript injection. On Android API 28 and newer, the default isolated
mode uses a separate process and data directory. The plugin requires Android min SDK
26.

Registry verification on 2026-07-22:

- package: `@capacitor/inappbrowser@4.0.1`
- peer: `@capacitor/core >=8.0.0`
- license: MIT
- integrity:
  `sha512-XlbF6o/SaW1i2PA30mMLMTrYPguk1yb1FWT0bkhNulgn8hmV0FMGUjV13yubYZ48BengaehZgRq2u/DqHu0NDQ==`

Decision: **ADOPT DIRECTLY** behind `TalosInAppBrowserService`. Keep Android
`isIsolated: true`, show URL/navigation controls, reject non-HTTP(S) URLs, and retain
the plugin in a dynamic chunk. Raise `minSdkVersion` from 24 to 26 as required by the
upstream package.

### Model Context Protocol

Sources:

- <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports>
- <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- <https://modelcontextprotocol.io/docs/develop/clients/client-best-practices>

The current MCP guidance keeps credentials in the host, validates the origin for
HTTP transports, binds local services to loopback, makes tool invocation visible,
and lets the user deny actions. A remembered categorical grant may remove repeated
confirmation for routine actions, but the host still evaluates every call.

Decision: **ADAPT THROUGH AN AVM-OWNED GATEWAY**. Reuse the existing worker and its
pinned MCP implementation. The APK will consume only a future paired-node gateway
with user-scoped authentication and normalized TALOS contracts. It will not connect
to the raw worker or store its service token.

### Playwright MCP

Source: <https://github.com/microsoft/playwright-mcp>

Playwright MCP uses structured accessibility snapshots for deterministic browser
automation. Its own documentation states that the snapshot is not a security
boundary. TALOS must continue treating every page, snapshot and tool result as
untrusted input.

Decision: **REUSE THE EXISTING PINNED WORKER**, not a second Playwright/MCP runtime
inside the APK. Mobile renders normalized evidence and interaction challenges; the
trusted node performs browser execution.

### Android WebView security

Source:
<https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion>

Android recommends disabling unsafe file access and avoiding broad JavaScript/file
bridges for untrusted content. Directly building a custom WebView automation bridge
would recreate security-sensitive browser infrastructure and break the standards-
first rule.

Decision: **REJECT** custom JavaScript injection, raw file access, universal access
from file URLs, hidden iframe automation and homemade screenshot clicking.

### Vue lifecycle and asynchronous application readiness

Sources:

- <https://vuejs.org/guide/essentials/lifecycle.html>
- <https://vuejs.org/api/composition-api-lifecycle#onmounted>

Vue defines `onMounted()` as a post-render lifecycle hook: the component DOM already
exists when the callback runs, and the hook contract does not make arbitrary
application initialization a prerequisite for subsequent user interaction. The first
real `/browse` Playwright journey therefore exposed a valid race between the rendered
composer and the asynchronous SQLite bootstrap started from the mounted path.

Decision: **ADAPT THE EXISTING IDEMPOTENT STORE PROMISE**. Every Browse surface write
must await `ChatStore.initialize()` before calling the persistence-guarded
`setSurface()`. Do not add polling, artificial delays, a second readiness flag or a
new package; the shared initialization promise is already the canonical ownership
boundary and deduplicates concurrent callers.

### Vue Test Utils fixture integrity

Sources:

- <https://test-utils.vuejs.org/api/#mount>
- <https://test-utils.vuejs.org/guide/advanced/stubs-shallow-mount>

Vue Test Utils documents `mount()` as creating a real Vue application around the
component and recommends testing user-visible inputs and outputs while keeping mocks
and stubs explicit. The full regression suite exposed two stale local fixtures after
Browse became real: the App-shell controller mock omitted the new evidence projection,
and the Settings capability list still classified Browser as gated.

Decision: **ADAPT TEST FIXTURES TO THE PUBLIC PRODUCT CONTRACT**. Add the exact missing
reactive projection, remove Browser only from the remaining-gated list, and assert its
real policy control. Do not add optional chaining or production fallbacks that would
hide an incomplete controller contract.

### Playwright user-facing command contracts

Source: <https://playwright.dev/docs/locators>

Playwright recommends role, accessible name and visible text locators because they
match how users and assistive technology perceive the product. The full mobile corpus
found one stale expectation that still used the correct locator style but pinned
Browse's former disabled state.

Decision: **KEEP THE USER-FACING LOCATORS AND MOVE THE FAIL-CLOSED FIXTURE**. Browse
stays covered by its real same-surface journeys; the generic disabled-command branch
uses `/file`, whose visible disabled reason still truthfully names the missing local
Vault ingestion command bridge.

## Product boundary

| Capability | Standalone APK | Paired trusted node |
|---|---:|---:|
| Open and interact with a live page manually | Yes, isolated InAppBrowser | Yes |
| Preserve navigation activity in the chat | Yes | Yes |
| Render imported screenshots and snapshots inline | Yes | Yes |
| Let the model inspect current page state | No | Yes |
| Screenshot/snapshot automation | No | Yes |
| Coordinate click/scroll/upload from evidence | No | Yes |
| Durable approvals, recovery and replay | Local projection only | Authoritative node |

The UI must label the unavailable cells. Manual browsing never fabricates a
screenshot or page reading and never adds page content to the model context.

## Policy decision

Use the existing three-mode policy:

- `read_only`: no state-changing browser interaction.
- `confirm_sensitive`: routine interactions may run without repeated prompts after
  the user selects this mode; credentials, payments, uploads/downloads, external
  writes and authority changes still require policy evaluation and confirmation.
- `confirm_every_interaction`: every interactive action requires confirmation.

There is intentionally no unrestricted bypass. `confirm_sensitive` is the requested
low-friction mode while preserving mandatory high-risk gates.

## Rejected alternatives

1. Raw worker REST/MCP from the APK: rejected because it would distribute machine
   credentials and bypass Laravel ownership/audit.
2. Playwright inside Android WebView: rejected because Playwright's supported browser
   control model does not provide a production embedded-APK runtime.
3. Custom iframe/WebView DOM bridge: rejected for security, cross-origin and
   maintenance reasons.
4. Provider-generated Markdown screenshot URLs: rejected because they are not
   verified artifacts and directly caused hallucinated evidence in the desktop flow.
5. Decorative evidence cards without persisted canonical data: rejected by the no-
   fake-feature rule.

## Upgrade and rollback

The plugin pin and integrity are recorded in `mobile/docs/upstream-provenance.md`.
Upgrade only after isolated WebView, event ordering, min-SDK and Android sync gates
pass. Rollback removes the plugin adapter and returns Browser settings to a gated
capability panel; persisted tool activities remain readable because their storage
uses the existing v1 database table.
