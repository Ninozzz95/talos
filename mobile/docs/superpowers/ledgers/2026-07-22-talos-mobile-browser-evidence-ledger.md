# TALOS Mobile Browser And Evidence Execution Ledger

Date: 2026-07-22
Owner: Codex mobile lane
Status: CHECKPOINT GREEN; PHYSICAL-DEVICE OPEN/CLOSE GATE OPEN
Research: `docs/superpowers/research/2026-07-22-talos-mobile-browser-evidence-research.md`
Design: `docs/superpowers/specs/2026-07-22-talos-mobile-browser-evidence-design.md`

## Exact file inventory

Create:

1. `mobile/src/lib/browser/browserContracts.ts`
2. `mobile/src/lib/browser/browserEvidence.ts`
3. `mobile/src/lib/browser/browserImageGeometry.ts`
4. `mobile/src/services/inAppBrowserService.ts`
5. `mobile/src/components/chat/TalosMobileBrowserActivity.vue`
6. `mobile/src/components/chat/TalosMobileBrowserScreenshotEvidence.vue`
7. `mobile/src/components/chat/TalosMobileBrowserInteractiveFrame.vue`
8. `mobile/src/components/talos/settings/TalosMobileSettingsBrowserPanel.vue`
9. `mobile/tests/unit/browser/browserContracts.test.ts`
10. `mobile/tests/unit/browser/browserEvidence.test.ts`
11. `mobile/tests/unit/browser/browserImageGeometry.test.ts`
12. `mobile/tests/unit/services/inAppBrowserService.test.ts`
13. `mobile/tests/unit/chat/TalosMobileBrowserActivity.test.ts`
14. `mobile/tests/unit/chat/TalosMobileBrowserScreenshotEvidence.test.ts`
15. `mobile/tests/unit/chat/TalosMobileBrowserInteractiveFrame.test.ts`
16. `mobile/tests/unit/settings/TalosMobileSettingsBrowserPanel.test.ts`
17. `mobile/tests/e2e/mobile-browser-evidence.e2e.spec.ts`

Modify:

18. `mobile/package.json`
19. `mobile/package-lock.json`
20. `mobile/android/variables.gradle`
21. `mobile/android/app/capacitor.build.gradle`
22. `mobile/android/app/src/main/AndroidManifest.xml`
23. `mobile/android/capacitor.settings.gradle`
24. `mobile/src/repositories/chatRepository.ts`
25. `mobile/src/repositories/memoryChatRepository.ts`
26. `mobile/src/repositories/sqliteChatRepository.ts`
27. `mobile/src/repositories/lazyChatRepository.ts`
28. `mobile/tests/unit/repositories/chatRepository.contract.ts`
29. `mobile/tests/unit/repositories/sqliteChatRepository.test.ts`
30. `mobile/src/components/chat/mobileChatTypes.ts`
31. `mobile/src/stores/chat.ts`
32. `mobile/tests/unit/chat/chatStore.test.ts`
33. `mobile/src/components/chat/TalosMobileMessageList.vue`
34. `mobile/tests/unit/chat/TalosMobileMessageList.test.ts`
35. `mobile/src/stores/settings.ts`
36. `mobile/tests/unit/theme/settingsStore.test.ts`
37. `mobile/src/components/talos/settings/settingsTabs.ts`
38. `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
39. `mobile/tests/unit/settings/settingsTabs.test.ts`
40. `mobile/tests/unit/screens/settingsScreen.test.ts`
41. `mobile/src/components/chat/TalosMobileComposer.vue`
42. `mobile/tests/unit/chat/TalosMobileComposer.test.ts`
43. `mobile/src/screens/ChatScreen.vue`
44. `mobile/tests/unit/screens/chatScreen.test.ts`
45. `mobile/src/lib/mobileCommandRegistry.ts`
46. `mobile/tests/unit/chat/mobileCommandRegistry.test.ts`
47. `mobile/src/lib/mobileSlashCommands.ts`
48. `mobile/tests/unit/chat/mobileSlashCommands.test.ts`
49. `mobile/src/stores/chatController.ts`
50. `mobile/tests/unit/chat/chatController.test.ts`
51. `mobile/docs/upstream-provenance.md`
52. `mobile/docs/feature-parity.json`
53. `docs/superpowers/plans/2026-07-22-talos-mobile-desktop-parity-master-plan.md`
54. `docs/superpowers/ledgers/2026-07-22-talos-mobile-browser-evidence-ledger.md`
55. `mobile/tests/e2e/mobile-settings-parity.e2e.spec.ts`
56. `mobile/tests/unit/chat/TalosMobileSlashCommandMenu.test.ts`

Delete: none. No desktop, backend, validator, core, worker or shared-contract file may
be edited in this slice.

## Amendments

### BR-A1 - Vitest hoist-safe Settings fixture

The first Browser panel GREEN run exposed a test-harness error: `vi.hoisted()` was
calling imported Vue `reactive()` and reading an imported default before module
initialization. The panel, settings parser, tab registry and Settings deep-link suites
were already green. The fixture now uses the same literal preference shape inside the
hoisted factory and resets it with `Object.assign` in `beforeEach`; no product code or
assertion changed.

### BR-A2 - portal attribute assertion waits for Vue render

The first interactive-frame GREEN run passed all behavior except a test that read the
portaled Dialog `data-zoom` attribute in the same JavaScript task as ten native button
clicks. `zoom` itself updates synchronously, while Vue patches the DOM in its next
render cycle. The test now awaits `flushPromises()` before reading the attribute. The
four-times clamp, control implementation and assertions are unchanged.

### BR-A3 - Browse is durable session state, not a route-local toggle

Current inspection found the existing `surface` database column and create-session
contract, but no write path in `UpdateChatSessionInput`, no Chat store projection for
session-level browser lifecycle evidence, and a disabled `/browse` registry entry.
BR-09 therefore extends the existing repository/session contract instead of adding a
parallel UI-only preference. `surface=chat|browse` must survive select/reload, while
manual local-browser lifecycle activities remain nullable-message session records and
never masquerade as model-observed page evidence.

### BR-A4 - disabled slash-command characterization moves to File

The first BR-09 GREEN run left one intentional expectation stale: the generic
Composer fail-closed test used `/browse` as its disabled command fixture. Since Browse
is now backed by the real local browser adapter, that test uses `/file`, whose Vault
ingestion command remains honestly disabled. Keyboard, IME and disabled-command
behavior are unchanged.

### BR-A5 - browser lifecycle owner fence

A native WebView can outlive the currently selected chat. Browser activity recording
therefore takes the owning session ID captured before `open()` and persists to that
session. If another chat becomes active, the event is stored but not projected into
the visible thread; selecting the owner later hydrates it. This prevents cross-chat
evidence leakage without discarding a real lifecycle event.

### BR-A6 - immutable JSON evidence projection

The first production type-check found that the canonical envelope lacked a JSON object
index signature and exposed mutable nested arrays while Vue publishes store projections
as deeply readonly. The wire fields are now readonly and the envelope is explicitly a
`Record<string, unknown>`. This removes the mismatch without weakening the repository
JSON boundary or adding casts; `npm run build` is the permanent regression gate.

### BR-A7 - no permanent pending lifecycle event

Review of the manual lifecycle projection found that an `opening` event recorded as
pending would display an indefinite spinner because event rows are append-only.
`opening` is now a completed fact (`succeeded`); a later plugin failure remains a
separate failed fact. A permanent unit assertion prevents non-terminal manual events.

### BR-A8 - Browse waits for the shared persistence bootstrap

The first real Playwright `/browse` journey exposed a startup race that direct
component tests could not reproduce: Vue had mounted the interactive composer while
the asynchronous SQLite initialization was still pending. `setBrowseMode()` reached
the persistence-guarded `setSurface()` before the store became ready and the command
failed even though the same journey passed after startup settled.

The permanent controller regression test holds the repository initialization promise,
starts controller initialization and Browse concurrently, and proves Browse remains
pending until that exact shared promise resolves. The production fix must await the
existing idempotent `ChatStore.initialize()` call before writing the surface. Polling,
fixed delays, duplicate readiness state and new dependencies are forbidden. Upstream
decision and official Vue lifecycle sources are recorded in the research dossier.

### BR-A9 - generated Android graph is a tested contract

File inventory amendment: create
`mobile/tests/unit/build/androidBrowserNativeContract.test.ts` before changing the
Android project. The test reads the real package manifest, `variables.gradle`,
`capacitor.settings.gradle` and `app/capacitor.build.gradle`; it fails unless the
exact `@capacitor/inappbrowser@4.0.1` pin is present, `minSdkVersion` is 26, and the
generated Gradle graph includes and depends on `:capacitor-inappbrowser`.

RED must show the current SDK 24 and missing generated plugin entries. GREEN must be
produced by changing the owned min-SDK variable and running the official
`npx cap sync android` generator. Hand-editing generated Capacitor Gradle files is
forbidden.

### BR-A10 - full-suite fixture and provenance reconciliation

File inventory amendment: modify
`mobile/tests/unit/shell/appShell.test.ts`,
`mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts` and
`mobile/tests/unit/docs/provenanceConsistency.test.ts`. The complete unit run produced
five RED assertions across those three files after all focused Browser gates were
green. Root-cause inspection proved that the shell mock omitted
`sessionBrowserActivities`, the capability fixture still listed Browser as gated, and
the host-provenance paragraph still said no JDK 21 or Gradle gate existed.

GREEN updates only those fixtures and the already-owned
`mobile/docs/upstream-provenance.md`: Browser is asserted as a real panel, the shell
mock exposes the exact reactive projection, and provenance records the verified
portable Temurin runtime, successful Gradle build, APK hash, and still-open ADB/device
gate. Production optional fallbacks and weakened assertions are forbidden.

### BR-A11 - full E2E disabled-command fixture follows capability ownership

File inventory amendment: modify
`mobile/tests/e2e/mobile-prompt-enhancer-slash-commands.e2e.spec.ts`. The complete
31-test Playwright corpus produced one RED after 30 passes because the generic slash
fail-closed scenario still expected `/browse` to be disabled. Browse now has a real
owner and two dedicated GREEN journeys, so retaining that expectation would test a
removed capability state rather than user behavior.

The scenario now enters `/file`, locates `Attach file` by role and accessible name,
asserts its exact visible missing-bridge reason, and proves Enter leaves the command
and route unchanged. Official Playwright locator guidance is recorded in the research
dossier. No product behavior changes.

## Public symbols

- `TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT`
- `TalosMobileBrowserEvidenceEnvelope`
- `TalosMobileBrowserEvidenceArtifact`
- `TalosMobileBrowserPreferences`
- `parseTalosMobileBrowserEvidenceEnvelope`
- `parseTalosMobileBrowserPreferences`
- `normalizeTalosBrowserUrl`
- `extractTalosBrowserUrls`
- `createTalosManualBrowserActivity`
- `TalosManualBrowserLifecycleEvent`
- `TalosManualBrowserActivityContext`
- `TalosManualBrowserActivityRecord`
- `mergePersistedBrowserEvidenceWithCurrentFrame`
- `resolveBrowserImageRect`
- `clampBrowserImagePan`
- `mapBrowserImagePointer`
- `CreateToolActivityInput`
- `UpdateToolActivityInput`
- `TalosChatRepository.appendToolActivity`
- `TalosChatRepository.updateToolActivity`
- `TalosChatRepository.listMessageToolActivities`
- `TalosChatRepository.listSessionToolActivities`
- `UpdateChatSessionInput.surface`
- `ChatStore.sessionBrowserActivities`
- `ChatStore.setSurface`
- `ChatStore.recordBrowserActivity(sessionId, input)`
- `TalosInAppBrowserEvent`
- `TalosInAppBrowserService`
- `createTalosInAppBrowserService`
- `TalosMobileSettingsState.browser`
- `SettingsStore.setBrowserPreferences`
- `TalosMobileMessageView.browserActivities`
- `ChatController.browseMode`
- `ChatController.setBrowseMode`

Compatibility symbols preserved:

- existing schema version 2 and every v1/v2 table;
- `TalosChatRepository` chat/file/draft behavior;
- Chat route and composer send behavior;
- all six provider adapters and the Model Lab/quick picker;
- 512000-byte initial JavaScript budget;
- desktop/browser-worker wire contracts remain untouched.

## RED -> GREEN scenarios

### BR-01 - canonical evidence parser

RED: missing discriminator, unknown keys, unsafe preview schemes, duplicate IDs,
invalid hashes/dimensions, oversized node/activity lists and malformed retries are
accepted or cast unchecked.

GREEN: `browserContracts.test.ts` proves exact bounded parsing and safe copies.

### BR-02 - URL normalization

RED: text URLs followed by punctuation, multiple links, upper-case schemes and
unsafe schemes are not handled deterministically.

GREEN: `browserEvidence.test.ts` extracts bounded unique HTTP(S) URLs, trims natural
punctuation and rejects credentials, javascript/data/file schemes and malformed
hosts.

### BR-03 - durable tool activity repository

RED: `talos_chat_tool_activities` is unreachable through the repository.

GREEN: memory and SQLite repositories append/update/list exact parsed records,
persist transactions, reject malformed JSON and cascade with deleted sessions.

### BR-04 - evidence hydration and ownership

RED: reloading/selecting a chat loses browser activity or attaches it to another
message.

GREEN: Chat store hydrates only exact per-message activities, preserves chronological
order, rejects malformed canonical evidence and keeps null-message lifecycle events
out of bubbles.

### BR-05 - screenshot evidence rendering

RED: assistant bubbles cannot display verified screenshots.

GREEN: screenshot evidence is lazy-loaded inline, deduplicated by artifact ID, uses
safe preview URIs and remains inside 360px width.

### BR-06 - interactive frame

RED: no accessible lightbox, zoom/pan bound or current-frame recovery exists.

GREEN: shadcn-vue Dialog opens the selected capture, previous/next and zoom are
bounded, stale/failed state remains visible, retry emits the current artifact, and
pointer actions stay disabled without trusted-node capability.

### BR-07 - direct upstream local browser

RED: mobile has no supported local browser boundary.

GREEN: the pinned official plugin is dynamically loaded; listeners are registered
before open; isolated WebView/system modes emit deterministic events; invalid URLs
perform zero plugin calls; listener handles are cleaned up.

### BR-08 - settings and confirmation policy

RED: Browser is a dead gated tab and preferences do not persist.

GREEN: exact Browser preferences round-trip; `confirm_sensitive` removes repeated
routine prompts but mandatory sensitive gates remain described; dev evidence is
absent from production; trusted-node status is honest.

### BR-09 - same-surface Browse UX

RED: composer has no Browse state or URL suggestion.

GREEN: icon-only globe toggles the active conversation mode without navigation;
detected URL offers the exact isolated open action; manual mode never tells the model
it inspected the page; ordinary chat stays unchanged.

Permanent tests: repository contracts update and reload `surface`; Chat store restores
only null-message browser activities for the active session; controller completion
uses a capability-aware system prompt; Composer emits toggle/open intents; `/browse`
is enabled and ChatScreen remains on the current route while the pinned upstream
browser adapter records truthful lifecycle evidence.

### BR-10 - final human journey

RED/authored: enable Browse, send natural text containing a URL, open it, observe
navigation evidence, reload, render a trusted screenshot fixture inline, inspect it,
exercise stale-frame retry, verify raw snapshot is dev-only, and confirm no horizontal
overflow at 390x844 and 360x640.

GREEN: `mobile-browser-evidence.e2e.spec.ts`, existing chat/settings E2E, initial
chunk contract and real Capacitor sync.

### BR-11 - Android native registration

RED: package pin exists, but the Android project remains on SDK 24 and its generated
Gradle graph does not contain InAppBrowser.

GREEN: `androidBrowserNativeContract.test.ts` proves SDK 26 and exact generated
registration after the official Capacitor sync. A real device/emulator open-close
remains the upstream integration gate and cannot be replaced by this source contract.

## Focused commands

```text
npm.cmd run test:unit -- tests/unit/browser tests/unit/services/inAppBrowserService.test.ts tests/unit/chat/TalosMobileBrowserActivity.test.ts tests/unit/chat/TalosMobileBrowserScreenshotEvidence.test.ts tests/unit/chat/TalosMobileBrowserInteractiveFrame.test.ts tests/unit/settings/TalosMobileSettingsBrowserPanel.test.ts tests/unit/repositories/memoryChatRepository.test.ts tests/unit/repositories/sqliteChatRepository.test.ts tests/unit/chat/chatStore.test.ts tests/unit/chat/TalosMobileMessageList.test.ts tests/unit/chat/TalosMobileComposer.test.ts tests/unit/screens/chatScreen.test.ts tests/unit/theme/settingsStore.test.ts
npm.cmd run test:unit
npm.cmd run build
npx.cmd playwright test tests/e2e/mobile-browser-evidence.e2e.spec.ts tests/e2e/mobile-chat-persistence.e2e.spec.ts tests/e2e/mobile-settings-parity.e2e.spec.ts --workers=1
npx.cmd cap sync android
npm.cmd audit --audit-level=low
git diff --check
```

## Real upstream gate

The production Android project must list `@capacitor/inappbrowser@4.0.1`, sync the
native plugin, target min SDK 26, and open/close an HTTP(S) page on a real Android
device or emulator. A mocked service unit test is necessary but not sufficient.

## Human proof

At 390x844 and 360x640:

1. toggle Browse without leaving Chat;
2. enter natural text around an URL and open the detected link;
3. scroll and dismiss a cookie banner in the isolated browser manually;
4. close it and see only truthful navigation lifecycle evidence;
5. load a trusted screenshot fixture, see it inline in the assistant bubble and open
   the lightbox;
6. confirm raw snapshot details are absent in production;
7. set `Confirm sensitive only`, reload and verify the preference;
8. verify credentials/payment/upload/external-write classes remain mandatory.

## Checkpoint evidence

Evidence captured on 2026-07-22 from `lane/kimi-mobile`:

- focused Browser/chat regression corpus: 33/33 tests passed;
- focused Chromium journeys for immediate Browse, evidence/reload, Browser
  settings, Appearance and responsive layout: 5/5 passed;
- production build: 2,828 modules and `476034/512000` initial JavaScript bytes;
- full unit corpus: 116 files passed, 1 skipped; 1,057 tests passed, 2 skipped;
- full Chromium corpus: 31/31 journeys passed;
- `npm audit --audit-level=low`: zero vulnerabilities;
- official Capacitor sync: ten native plugins, including
  `@capacitor/inappbrowser@4.0.1`;
- Android source contract: min SDK 26 and generated InAppBrowser registration,
  2/2 tests passed;
- portable Eclipse Temurin `21.0.11+10`, archive SHA-256
  `d3625e7cadf23787ea540229544b6e2ab494b3b54da1801879e583e1dfee0a64`;
- `gradlew test assembleDebug --no-daemon --console=plain`: passed;
- debug APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`,
  36,041,965 bytes, SHA-256
  `fbba81cae06b2bdaa145ab73d4ed3177e8843311c5fb47d38cd1457e2708d3bd`;
- user copy: `C:/Users/ninox/Downloads/TALOS-mobile-debug-2026-07-22.apk`,
  byte-identical to the build output.

The device gate remains open. The repo-local Android SDK `adb` process exits on
this host with Windows status `0xC0000135` before device enumeration, so install,
launch and real open/close evidence have not been claimed. This is an explicit
host-runtime blocker, not a product-test substitution.

## Rollback

Remove the Browser UI/service and package pin, restore min SDK 24 and gate the
Browser Settings tab again. Leave repository read support for the existing tool-
activity table so previously stored evidence remains recoverable. No chat, Vault or
provider data migration is required.
