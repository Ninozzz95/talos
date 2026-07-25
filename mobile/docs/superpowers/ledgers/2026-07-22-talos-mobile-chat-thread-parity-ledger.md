# TALOS Mobile Chat Thread Parity P1.3-A Execution Ledger

Date: 2026-07-22
Owner: Codex mobile lane
Status: WEB/PRODUCT GATE COMPLETE; NATIVE CLIPBOARD REGISTRATION DEFERRED TO APK GATE
Research: `docs/superpowers/research/2026-07-22-mobile-chat-thread-parity-research.md`
Desktop reference: `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed` read-only

## Objective

Make the durable mobile thread safely readable and operable from the final phone
UI: desktop Markdown, per-item sensitive disclosure, structured failures,
copy/reuse/resend/retry and reload-safe provenance. This ledger does not claim
message mutation/export, evidence or benchmark parity.

## Public contracts

- `MAX_TALOS_MARKDOWN_SOURCE_LENGTH`
- `TalosRenderedMessage`
- `TalosMarkdownRenderOptions`
- `renderTalosMarkdown(source, options?)`
- `TalosCensorMatchKind`
- `censorSensitiveText(root)`
- `TalosMobileControlledFaultLayer`
- `TalosMobileControlledFault`
- `talosMobileControlledFault(message)`
- `TalosClipboardWriter`
- `writeTalosClipboardText(value, writer?)`
- `TalosMobileMessageView.model_profile_id`
- `TalosMobileMessageView.run_id`
- `TalosMobileMessageView.metadata`
- `ChatStore.send(text, modelProfileId?, metadata?)`
- `ChatController.resendMessage(messageId)`
- `ChatController.retryAssistantMessage(messageId)`
- `TalosMobileComposer.focusPrompt()`
- `TalosMobileMessageActions` events `copy`, `reuse`, `resend`, `retry`
- `TalosMobileMessageList` events `reuse`, `resend`, `retry`

Compatibility symbols kept stable:

- `createChatStore`
- `ChatCompletion`
- `ChatTurn`
- `useChatController`
- existing provider/model/session controller methods
- current `TalosMobileMessageView` fields and role/state values
- durable schema version `1`; no migration is introduced

## Exact file inventory

Create:

1. `docs/superpowers/research/2026-07-22-mobile-chat-thread-parity-research.md`
2. `docs/superpowers/ledgers/2026-07-22-talos-mobile-chat-thread-parity-ledger.md`
3. `mobile/src/lib/talosMessageMarkdown.ts`
4. `mobile/src/lib/talosSensitiveCensor.ts`
5. `mobile/src/lib/talosMessageState.ts`
6. `mobile/src/services/clipboard.ts`
7. `mobile/src/components/chat/TalosMobileMessageContent.vue`
8. `mobile/src/components/chat/TalosMobileStatusMessage.vue`
9. `mobile/src/components/chat/TalosMobileMessageOverflowMenu.vue`
10. `mobile/src/components/chat/TalosMobileMessageActions.vue`
11. `mobile/tests/unit/chat/talosMessageMarkdown.test.ts`
12. `mobile/tests/unit/chat/talosSensitiveCensor.test.ts`
13. `mobile/tests/unit/chat/talosMessageState.test.ts`
14. `mobile/tests/unit/services/clipboard.test.ts`
15. `mobile/tests/unit/chat/TalosMobileMessageContent.test.ts`
16. `mobile/tests/unit/chat/TalosMobileStatusMessage.test.ts`
17. `mobile/tests/unit/chat/TalosMobileMessageActions.test.ts`
18. `mobile/tests/unit/chat/TalosMobileMessageList.test.ts`
19. `mobile/tests/e2e/mobile-chat-thread-parity.e2e.spec.ts`

Modify:

20. `mobile/package.json`
21. `mobile/package-lock.json`
22. `mobile/docs/upstream-provenance.md`
23. `mobile/src/components/chat/mobileChatTypes.ts`
24. `mobile/src/stores/chat.ts`
25. `mobile/src/stores/chatController.ts`
26. `mobile/src/components/chat/TalosMobileMessageList.vue`
27. `mobile/src/components/chat/TalosMobileComposer.vue`
28. `mobile/src/screens/ChatScreen.vue`
29. `mobile/scripts/verify-initial-chunk.mjs`
30. `mobile/tests/unit/build/initialChunkContract.test.ts`
31. `mobile/tests/unit/chat/chatStore.test.ts`
32. `mobile/tests/unit/chat/chatController.test.ts`
33. `mobile/tests/unit/screens/chatScreen.test.ts`
34. `mobile/tests/unit/chat/TalosMobileComposer.test.ts`

Delete: none.

Native generation is excluded from this inventory. Before running
`npx cap sync android`, amend this ledger with every generated Android file that
will change.

## Named TDD scenarios

| ID | RED test | Expected RED | GREEN evidence |
|---|---|---|---|
| THREAD-01 | `talosMessageMarkdown.test.ts::renders the frozen desktop document hierarchy` | module missing | exact safe HTML hierarchy |
| THREAD-02 | `talosMessageMarkdown.test.ts::rejects executable HTML, unsafe protocols and remote images` | module missing | no executable node/URL/image |
| THREAD-02A | `talosMessageMarkdown.test.ts::pins the patched sanitizer release in both package boundaries` | package and lock resolve affected `dompurify@3.4.11` | both resolve exact patched `3.4.12`; audit has zero vulnerabilities |
| THREAD-03 | `talosMessageMarkdown.test.ts::bounds pathological source and strips bidi controls` | module missing | truncation and normalization |
| THREAD-04 | `talosSensitiveCensor.test.ts::reveals only the selected sensitive item` | module missing | independent accessible controls |
| THREAD-05 | `talosMessageState.test.ts::parses a canonical persisted provider fault` | module missing | typed fault or null |
| THREAD-06 | `clipboard.test.ts::writes through the injected upstream writer and rejects empty text` | module missing | one explicit write/no hidden fallback |
| THREAD-07 | `TalosMobileMessageContent.test.ts::renders Markdown and copies fenced code from its final text` | component missing | rendered hierarchy + live status |
| THREAD-08 | `TalosMobileStatusMessage.test.ts::renders actionable controlled faults and neutral notices` | component missing | accessible alert/status branches |
| THREAD-09 | `TalosMobileMessageActions.test.ts::exposes role-correct icon actions and Reka overflow` | component missing | keyboard/menu event contract |
| THREAD-10 | `TalosMobileMessageList.test.ts::renders role/state/meta and forwards message actions without horizontal overflow classes` | old plain rows | complete mobile thread composition |
| THREAD-11 | `chatStore.test.ts::persists message metadata and a canonical provider fault across restart` | metadata dropped/plain fault | metadata preserved and structured |
| THREAD-12 | `chatController.test.ts::resends and retries with full prior context and provenance` | methods missing | append-only contextual turns |
| THREAD-13 | `chatController.test.ts::fails retry when no preceding user prompt exists` | method missing | no provider request; actionable state |
| THREAD-14 | `chatScreen.test.ts::reuses a prompt and focuses the composer` | event/focus missing | prompt populated and textarea focused |
| THREAD-14A | `TalosMobileComposer.test.ts::focusPrompt focuses the enabled prompt field only` | exposed method missing | stable component focus contract |
| THREAD-15 | `initialChunkContract.test.ts::rejects an eager message renderer` | boundary absent | renderer dynamic entry enforced |
| THREAD-15A | `initialChunkContract.test.ts::rejects the message overflow menu when it enters the static initial graph` | production graph measured 550,992 bytes; Reka subtree eager | overflow menu dynamic entry enforced; initial graph <= 512,000 bytes |
| THREAD-16 | `mobile-chat-thread-parity.e2e.spec.ts::renders and operates a durable safe thread` | plain thread/no actions | final Chromium journey GREEN |
| THREAD-16A | `mobile-chat-persistence.e2e.spec.ts::persists contextual chat sessions through reload, rename, switch and active deletion` | old partial `Send message` locator also matches new `Resend message` actions | composer-scoped exact role locator; existing durable journey GREEN |

## Amendment 1: production chunk regression

The first full build after THREAD-15 emitted the Markdown renderer as the
required dynamic entry but measured the remaining initial graph at 550,992
bytes. Current Vue/Vite primary documentation confirms an async component as
the supported component-subtree split point. `TalosMobileMessageActions.vue`
will therefore load the already-inventoried
`TalosMobileMessageOverflowMenu.vue` asynchronously while direct Copy,
Resend and Retry controls remain synchronous. No file inventory changes and no
budget increase are authorized. The manifest contract gains THREAD-15A before
the product edit.

## Amendment 2: DOMPurify security repin

The post-install audit found GitHub-reviewed advisory
`GHSA-c2j3-45gr-mqc4` on the direct `dompurify@3.4.11` pin. The patched release
is 3.4.12 with registry integrity
`sha512-zQvGet8Z2sWbQhCmfFz/T5QWH2oBmjnqK3qvOjaqaNLrLEF912WamU+ohnTp0TCep/MFVHpdJuCZEdFOdTnEFg==`.
THREAD-02A is added before changing `package.json` or the lockfile. Existing
Markdown security tests, exact lockfile resolution, build and a fresh
`npm audit --audit-level=low` are required GREEN.

## Amendment 3: deterministic existing E2E locator

The combined chat corpus exposed an inherited partial-name locator:
`getByLabel('Send message')` also matches the newly introduced accessible name
`Resend message`. Playwright's official locator contract documents substring
matching as the default and recommends role plus accessible name, with exact
matching when needed. THREAD-16A scopes the locator to the final composer and
uses the exact button name. No product accessibility name is weakened.

## TDD and verification commands

RED/GREEN groups:

```bash
npm run test:unit -- tests/unit/chat/talosMessageMarkdown.test.ts tests/unit/chat/talosSensitiveCensor.test.ts tests/unit/chat/talosMessageState.test.ts
npm run test:unit -- tests/unit/services/clipboard.test.ts tests/unit/chat/TalosMobileMessageContent.test.ts tests/unit/chat/TalosMobileStatusMessage.test.ts tests/unit/chat/TalosMobileMessageActions.test.ts tests/unit/chat/TalosMobileMessageList.test.ts
npm run test:unit -- tests/unit/chat/chatStore.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/TalosMobileComposer.test.ts tests/unit/screens/chatScreen.test.ts
npm run test:unit -- tests/unit/build/initialChunkContract.test.ts
```

Slice regression:

```bash
npm run test:unit -- tests/unit/chat tests/unit/repositories tests/unit/persistence tests/unit/screens/chatScreen.test.ts tests/unit/shell/appShell.test.ts tests/unit/build/initialChunkContract.test.ts
npm run build
npm run test:e2e -- tests/e2e/mobile-chat-persistence.e2e.spec.ts tests/e2e/mobile-provider-model-refresh.e2e.spec.ts tests/e2e/mobile-chat-thread-parity.e2e.spec.ts --workers=1
git diff --check
```

Real-upstream gates:

- lockfile resolves the four exact package pins and recorded integrities;
- dynamic import loads `TalosMobileMessageContent.vue` in the production bundle;
- real DOMPurify/markdown-it security corpus runs in jsdom;
- real Reka menu runs in Vue component tests and Chromium;
- real Clipboard Web implementation is exercised from a user click in Chromium;
- Android Clipboard registration is deferred to the explicitly inventoried
  `cap sync` gate.

## Human-visible proof

At 390x844 and 360x640, send a provider response containing heading, list,
table, external link, code fence, email and unsafe HTML/image Markdown. Verify:

1. hierarchy renders without page-level horizontal scroll;
2. unsafe HTML/image content is inert;
3. one sensitive item reveals without revealing another;
4. Copy Message and Copy Code update the system clipboard and announce success;
5. Reuse Prompt fills and focuses the composer;
6. Resend and Retry produce new contextual turns with no history rewrite;
7. a structured provider failure exposes code, recovery action and retryability;
8. reload preserves content, metadata and actions.

## Rollback

Remove files 3-19 and revert modifications 20-34. Do not delete or downgrade the
SQLite database: extra metadata keys are already schema-compatible JSON. Remove
the Clipboard native package only through a separately inventoried Capacitor
sync rollback.

## Fresh evidence

Completed 2026-07-22 in `lane/kimi-mobile` without Git operations:

- utility contracts: 4 files / 13 tests GREEN;
- message components: 4 files / 10 tests GREEN;
- store/controller/composer/screen: 4 files / 35 tests GREEN;
- affected regression gate: 31 files / 137 tests GREEN;
- manifest contract: 6/6 GREEN;
- production build: GREEN, initial JavaScript graph 498,368 / 512,000 bytes;
- dynamic entries: SQLite repository, message renderer, message overflow menu,
  and four station screens all outside the initial static closure;
- `npm audit --audit-level=low`: 0 vulnerabilities after the DOMPurify 3.4.12
  security repin;
- Chromium journey `mobile-chat-thread-parity.e2e.spec.ts`: 1/1 GREEN in 6.7s;
- combined chat corpus: 4/4 GREEN in 27.7s;
- `git diff --check`: GREEN.

The official Capacitor Clipboard package is present and its Web adapter was
exercised through a real click and system clipboard in Chromium. Android plugin
registration and device clipboard verification are intentionally not claimed:
they remain part of the final inventoried `cap sync android`, APK and physical
device gate.
