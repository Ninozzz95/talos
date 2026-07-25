# TALOS Mobile Browser And Evidence Design

Date: 2026-07-22
Owner: Codex mobile lane
Status: APPROVED BY EXISTING PRODUCT DECISIONS - implementation in progress
Research: `docs/superpowers/research/2026-07-22-talos-mobile-browser-evidence-research.md`

## User experience

Browse is a mode of the existing Chat surface. It does not open another TALOS
sidebar, route or workspace window.

1. A globe control in the composer toggles Chat/Browse for the active conversation.
2. When a prompt contains an HTTP(S) URL and URL suggestions are enabled, a compact
   suggestion offers to open that exact URL in the isolated local browser.
3. Manual browsing opens the official Capacitor InAppBrowser with URL, navigation
   controls and Android process isolation enabled.
4. The thread records real navigation lifecycle evidence. It never claims that the
   model saw the page.
5. Canonical screenshot evidence received from a trusted node is displayed directly
   in the owning assistant bubble. Selecting it opens a shadcn-vue Dialog lightbox.
6. Raw snapshot nodes are hidden in production. In development they live behind a
   collapsed `Untrusted browser evidence` disclosure.
7. A failed or stale interaction remains visible and retryable against the current
   frame. It never disappears merely because the evidence commit failed.

## Architecture

### Canonical envelope

`TalosMobileBrowserEvidenceEnvelope` is versioned as
`talos.mobile.browser.evidence.v1`. It contains:

- one normalized `TalosBrowserActivity`;
- zero to eight artifacts with bounded IDs, media types, hashes, dimensions and
  preview URIs;
- an optional untrusted snapshot preview with at most 500 normalized nodes;
- a source discriminator: `manual_local` or `trusted_node`;
- optional retry metadata that identifies the superseded and current frames.

Every nested object is parsed by exact shape. Unknown keys, non-HTTP remote preview
URLs, executable URI schemes, invalid dimensions, duplicate IDs and oversized lists
fail closed.

### Persistence

Use the existing `talos_chat_tool_activities` table. The repository adds append,
update, per-message listing and per-session listing. `payload_json` stores bounded
operation context; `evidence_json` stores the canonical envelope. No schema migration
is required.

Activities are attached to the user/assistant/system message that owns their visual
card. Session-only lifecycle events may retain a null `message_id`; they are never
silently attached to an unrelated bubble.

### Manual local browser

`TalosInAppBrowserService` is an AVM adapter around
`@capacitor/inappbrowser@4.0.1`. It:

- normalizes only `http:` and `https:` URLs;
- dynamically imports the plugin;
- registers listeners before opening;
- opens an isolated WebView with visible URL, toolbar and navigation controls;
- emits deterministic `opening`, `loaded`, `navigated`, `closed`, `failed` events;
- removes only its listener handles on dispose;
- never exposes cookies, DOM, JavaScript evaluation or arbitrary headers.

On web/PWA, the adapter uses a user-initiated external tab because the native plugin
is unavailable. The fallback is explicit and does not imply evidence capture.

### Trusted node boundary

`TalosTrustedBrowserGateway` is an interface, not a fake implementation. Until a
paired authenticated gateway exists, its capability state is `not_paired` and every
automation command fails with `TALOS_BROWSER_TRUSTED_NODE_REQUIRED` before network
I/O. No raw worker URL, token or private signing material is accepted by Settings.

### Rendering

The message list receives browser activities together with attachments. It lazy-
loads browser evidence components so ordinary chat first paint remains below the
512000-byte initial JavaScript budget.

Screenshot cards use `object-contain`, explicit aspect ratio, no horizontal overflow
and a unique accessible name. The lightbox uses the existing shadcn-vue Dialog. It
supports previous/next capture, zoom, pan bounds, keyboard close and a separate `Open
live page` command when the activity has an HTTP(S) URL. Pointer-to-browser commands
remain disabled unless a current trusted-node frame and capability are present.

## Settings

The Browser tab becomes available because standalone manual browsing and policy
preferences are real. It includes:

- `Browser mode`: read-only, confirm sensitive only, confirm every interaction;
- `Open links in`: isolated in-app browser or system browser;
- `Suggest Browse when a link is detected`;
- trusted-node status and exact capability explanation;
- development-only raw evidence switch.

The settings parser is bounded and fail-closed. The default is
`confirm_sensitive`, isolated in-app browser and URL suggestions enabled.

## Model safety

Ordinary provider completion receives no page claim, DOM, snapshot or screenshot
unless it was produced by the trusted-node boundary and parsed into the canonical
envelope. Manual local navigation is user-visible but not model-visible. The system
prompt for Browse must state the active capability state.

## Accessibility and responsive behavior

- Every icon control has an accessible name and at least a 44x44 target.
- Status changes use polite live regions; failures use alerts.
- The screenshot Dialog has title/description, focus trap and deterministic return
  focus through the upstream primitive.
- The UI is tested at 390x844 and 360x640 with no horizontal overflow.
- Reduced motion removes nonessential zoom/transition effects.

## Completion boundary

P1.7A/B is complete when manual local browsing, settings, persistence and inline
evidence are real and tested. Full agent browsing remains incomplete until the
paired-node gateway is implemented and verified against the existing Playwright/MCP
worker. The parity ledger must report those two states separately.
