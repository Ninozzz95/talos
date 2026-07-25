# TALOS Mobile Chat Thread Parity Research

Date: 2026-07-22
Owner: Codex mobile lane
Desktop reference: `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed` (read-only)
Scope: P1.3-A safe rendering, controlled faults, sensitive disclosure, copy, reuse, resend and retry

## Problem

The durable mobile conversation currently renders every row as plain text. It
drops persisted metadata, exposes provider failures as unstructured prose, has
no message actions, does not render desktop Markdown, and contains the mojibake
copy `TALOS is thinking...`. The final phone user therefore cannot inspect or
reuse a model response with the same safety and interaction contract as the
frozen desktop product.

## Primary sources inspected

1. markdown-it official repository and option contract. Raw HTML is disabled by
   default; linkification and renderer rules are explicit opt-ins:
   - https://github.com/markdown-it/markdown-it
2. DOMPurify official repository and security guidance. Sanitized HTML may be
   inserted with `innerHTML`, but modifying it through another HTML transformer
   after sanitization can invalidate the guarantee:
   - https://github.com/cure53/DOMPurify
3. W3C Clipboard API and permissions model. Clipboard writes are a powerful
   feature and should remain attached to an explicit user action:
   - https://www.w3.org/TR/clipboard-apis/
4. Capacitor official plugin repository. The Clipboard package is maintained by
   the Capacitor team and its current major is for Capacitor 8:
   - https://github.com/ionic-team/capacitor-plugins
5. Reka UI Dropdown Menu. The maintained primitive owns focus, keyboard,
   typeahead, collision handling, Escape dismissal and menu-button semantics:
   - https://reka-ui.com/docs/components/dropdown-menu
6. Vue official async-component guide and Vite official performance guidance.
   `defineAsyncComponent(() => import(...))` is the supported component-tree
   split point and Vite emits its dependencies as a separate on-demand chunk:
   - https://vuejs.org/guide/components/async.html
   - https://vuejs.org/guide/best-practices/performance
   - https://vite.dev/guide/features.html
7. Frozen TALOS desktop implementations and security corpus:
   - `control-plane/resources/js/lib/talosMessageMarkdown.ts`
   - `control-plane/resources/js/lib/talosSensitiveCensor.ts`
   - `control-plane/resources/js/lib/talosMessageState.ts`
   - `control-plane/resources/js/components/talos/chat/TalosMessageContent.vue`
   - `control-plane/resources/js/components/talos/chat/TalosMessageActions.vue`
   - `control-plane/resources/js/components/talos/chat/TalosMessageOverflowMenu.vue`
   - `control-plane/resources/js/components/talos/chat/TalosStatusMessage.vue`

## Exact upstream pins

| Package | Version | Integrity | License | Decision |
|---|---:|---|---|---|
| `markdown-it` | `14.3.0` | `sha512-RCEsPjR+sr0x+AuYp601tKTkgFG4YEPLCzHST3cQ/fhlJkqAkz1L2/Qbp1j9qw5SBwQHFBoW8+hoN5xssOF0Tw==` | MIT | Adopt directly |
| `dompurify` | `3.4.12` | `sha512-zQvGet8Z2sWbQhCmfFz/T5QWH2oBmjnqK3qvOjaqaNLrLEF912WamU+ohnTp0TCep/MFVHpdJuCZEdFOdTnEFg==` | MPL-2.0 OR Apache-2.0 | Adopt patched release directly |
| `@types/markdown-it` | `14.1.2` | `sha512-promo4eFwuiW+TfGxhi+0x3czqTYJkG8qB17ZUJiVF10Xm7NLVRSLUsfRTU/6h1e24VvRnXCx+hG7li58lkzog==` | MIT | Adopt directly as development types |
| `@capacitor/clipboard` | `8.0.1` | `sha512-iOlbTi8MojKyLnYE+M27priXid7vHd0PlDwyHohPzkuQ8Rkp6q7ykwZmPEUD+OnU/Ink7Qw/pUOfKgraKmA6Eg==` | MIT | Adopt directly behind adapter |
| `reka-ui` | existing `2.10.1` | frozen in the current lockfile | MIT | Reuse the already pinned upstream primitive |

`@capacitor/clipboard@8.0.1` declares `@capacitor/core >=8.0.0`; TALOS pins
Capacitor `8.4.2`, so the peer contract is satisfied.

### Security repin recorded 2026-07-22

The initial `dompurify@3.4.11` resolution produced npm advisory
`GHSA-c2j3-45gr-mqc4`. GitHub's reviewed advisory marks every version through
3.4.11 affected and 3.4.12 patched. TALOS does not enable the implicated
`CUSTOM_ELEMENT_HANDLING` option, but retaining an affected sanitizer violates
the mobile supply-chain gate. The pin is therefore amended to 3.4.12 with the
registry integrity above; the manifest/lockfile version and `npm audit` remain
permanent verification gates.

## Decision

### Adopt the frozen desktop rendering contract

Port the desktop Markdown parser and sensitive-censor source with only mobile
import-path changes. Keep `html: false`, the 100,000-character bound, bidi and
control stripping, image omission, strict DOMPurify allowlists, safe external
link attributes, semantic tables/tasks, and bounded code blocks. Remote image
Markdown remains inert text; browser evidence and local Vault images require a
typed artifact component rather than trusting model-authored URLs.

### Keep heavy parsing outside the initial graph

`TalosMobileMessageContent.vue` is loaded through Vue `defineAsyncComponent`.
The existing Vite manifest gate must prove that this component is a reachable
dynamic entry outside the initial static closure. Increasing the 512,000-byte
budget or eagerly importing the parser is rejected.

### Use a native-first clipboard adapter

`writeTalosClipboardText()` dynamically loads the official Capacitor plugin on
native platforms and uses the standards-based browser clipboard during Web
preview. It is called only from Copy controls. A hidden-textarea/
`document.execCommand` fallback is rejected because it is deprecated,
permission-obscuring and unnecessary in the supported WebView/Chromium matrix.

### Reuse Reka for overflow behavior

Mobile keeps Copy and Resend/Retry as direct icon actions. Reuse Prompt is in a
non-modal Reka overflow menu, matching the frozen desktop phone layout without
hand-rolling focus or portal behavior. Evidence and benchmark entries remain
absent until their real mobile capability adapters exist.

### Build-gate amendment: split the Reka overflow subtree

The first production build after the message slice measured an initial static
graph of 550,992 bytes against the frozen 512,000-byte ceiling even though the
Markdown renderer was correctly emitted as a 137,030-byte dynamic entry. The
remaining regression came from eagerly importing the Reka overflow subtree.
TALOS therefore loads `TalosMobileMessageOverflowMenu.vue` with Vue's official
`defineAsyncComponent(() => import(...))` boundary. Direct Copy and Resend/Retry
controls remain synchronous. The manifest verifier names both message
boundaries and fails closed if either re-enters the initial graph. Raising the
budget, replacing Reka, or adding a manual Rollup vendor split is rejected:
those options either hide the feature-owned regression or discard the adopted
upstream interaction contract.

### Preserve structured failure metadata

Every provider exception is persisted as a system row with a versionless
`metadata.chat_error` canonical object. The UI parses that object by shape and
renders layer, code, provider/model, HTTP status, retryability and next action.
The original provider message is already secret-redacted at the controller
boundary. Unknown metadata fails to the neutral System Notice row.

### Retry semantics

Resend appends the selected user prompt as a new turn with
`command_id=resend_message`. Retry finds the nearest preceding user prompt and
appends it as a new turn with `command_id=retry_assistant_response`,
`retry_of_message_id` and `resend_of_message_id`. Existing history is never
rewritten or silently deleted.

## Explicitly deferred from P1.3-A

- Message mutation/delete requires new repository methods and a transcript
  consistency policy; it is P1.3-B.
- Session JSON/Markdown export requires a real Filesystem/Share artifact
  boundary; it is P1.3-B.
- Browser evidence, AVM receipts and benchmark actions require their real
  adapters and stay hidden until those slices.
- `npx cap sync android` is a coordinated native-generation gate after the
  Web/unit/build slice is green; no generated Android file is edited during
  P1.3-A without a ledger amendment.

## Verification contract

- Unit security corpus: executable HTML and unsafe protocols removed, images
  omitted, links bounded, source truncated, controls/bidi stripped.
- Component: Markdown hierarchy, code copy, per-item sensitive reveal,
  controlled fault, accessible Reka overflow, action visibility and feedback.
- Store/controller: metadata survives restart; provider faults are structured;
  resend/retry append contextual turns with provenance and fail closed when no
  prior user prompt exists.
- Build: parser and Reka overflow subtree are dynamic entries and the initial
  graph remains <= 512,000 bytes.
- Chromium: a real mocked provider turn renders Markdown, blocks unsafe content,
  copies code/message, reuses a prompt, resends/retries, persists provenance and
  survives reload without horizontal page overflow.

## Rollback

Remove the lazy renderer, action components and four new package pins; restore
the plain-text message list while leaving every persisted message and metadata
row untouched. Remove the native Clipboard plugin only after a coordinated
`cap sync android`; rollback never deletes conversation data.
