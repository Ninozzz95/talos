# TALOS mobile — open debt register

**Verified at `71dbbd9` (2026-07-25).** Progress: **A1 + D1–D5 closed** (`15988d7`, `+ dead-code batch`) — 30 items remain. Every line below was confirmed against the
code, not recited from a review. This file exists because the owner asked that no
debt be left on the road: a debt that lives only in a review transcript or a
commit message is a debt nobody will pay.

**Rule:** an item leaves this file only when the code changes and a gate proves
it. Closing an item by editing this file is forbidden.

---

## SECURITY — the app lock does not lock anything at rest

| # | Item | Evidence | Why it matters |
|---|---|---|---|
| S1 | The PIN does not derive the SQLCipher key | `src/persistence/capacitorSqliteRuntime.ts` generates an independent random secret; `src/services/appLock.ts` only verifies a PBKDF2 hash | "Locked" is a Vue boolean over a live, decrypted DB. Flipping one flag is a full bypass |
| S2 | No `FLAG_SECURE`; re-lock happens on *resume*, not *pause* | grep `FLAG_SECURE` in `android/` → **0 hits**; `src/services/resumeRelock.ts` records `hiddenAt` on hide, acts on resume | Android snapshots the screen at pause → the recents card shows the open chat, readable with no PIN |
| S3 | No attempt throttling; 4-digit minimum | `src/services/appLock.ts` | 10 000 candidates, unthrottled, against a local verifier |
| S4 | Vault file bodies are stored unencrypted | `src/services/attachmentFileStore.ts` writes raw bytes to `Directory.Data` | The DB is SQLCipher-encrypted while the passport scan next to it is plaintext — asymmetric in the wrong direction |
| S5 | Endpoint override ships the API key to any host, no confirmation, no allowlist | `src/lib/chat/providers/openAiCompatibleAdapter.ts` prefers `credential.endpoint`; `providerErrors.ts` validates only scheme/parse | One settings change (or one persuasive reply) sends a live paid key to a third party |
| S6 | Model output still writes files with **no confirmation** | `src/stores/chatController.ts` → `attachments.saveGenerated(block)` fire-and-forget | An opt-out toggle + an Undo toast is *mitigation*, not the per-write consent the review demanded |
| S7 | `metadata.library_shared` opt-out has no UI | read in `chatController.ts`, written nowhere | The per-document exclusion is honored in code and unreachable by the user |
| S8 | The untrusted-context boundary is forgeable | `src/lib/chat/libraryContext.ts` interpolates doc text verbatim; the `USER_TASK:` boundary is prose | A document body containing `USER_TASK:` terminates the untrusted region from the model's point of view |
| S9 | Secret redaction is exact-match only | `safeProviderMessage` in `chatController.ts` | A provider echoing a transformed key (URL-encoded, truncated) leaks it into a persisted error |
| S10 | Export writes plaintext to Cache and races the share target | `src/services/sessionExportDelivery.ts` | Unawaited delete can fire while the receiver is still reading; Cache is not excluded from backup |
| S11 | FileProvider grants the whole external storage root | `android/app/src/main/res/xml/file_paths.xml` (`path="."`) | Least-privilege violation that becomes dangerous the moment device-filesystem work starts |

## ARCHITECTURE — blocks the roadmap

| # | Item | Evidence | Blocks |
|---|---|---|---|
| ~~A1~~ ✅ **CLOSED** `15988d7` | The completion contract is `Promise<string>` | `src/stores/chat.ts:38`; `ChatTurn.role` admits only user/assistant; `finishReason` is discarded | **Tool calling cannot be added without breaking it.** Must be widened FIRST or the work is done twice |
| A2 | `chatController.ts` is a god-object | **1256 lines**, 52 public members, ~28 module deps, imported by 11 screens | Every feature edits one file; nothing can be unit-tested without building the world |
| A3 | No `dispose()`/teardown anywhere | `repository.close()` has zero production callers | Re-lock leaves messages, sessions and document text live in memory; blocks DB re-key and device-wipe |
| A4 | Memory and Library are near-duplicate injection pipelines | 4 mutable closure vars in `chatController.ts` + a composition flag | A third (semantic) tier makes it 6 vars and a 3-way rule |
| A5 | Three error protocols; raw `TALOS_*` codes reach the UI | `MemoryScreen/NotesScreen/TasksScreen.describeError` return `cause.message` verbatim | A whitespace-only title shows the user `TALOS_TITLE_INVALID` |
| A6 | 38-method repository god-interface × 3 implementations | `src/repositories/chatRepository.ts` | Each roadmap item adds ~4 methods × 3 impls by hand |
| A7 | Layering inversion | `lib/` and `services/` import from `components/`; `lib/chat/providerContracts.ts` imports from `stores/` | No layer compiles or reasons in isolation |

## DEAD CODE / INERT STATE — ✅ CLOSED (15988d7 + this commit)

| # | Item | Evidence |
|---|---|---|
| ~~D1~~ ✅ | `appearance_visibility` (~250 lines + store API) has no UI consumer | 8 references in `src/stores/settings.ts`, zero in any `.vue` |
| ~~D2~~ ✅ | `composer_mode` and `advanced_rail_expanded` persist with no consumer | 2 references in `src/lib/talosChatLayout.ts`, no renderer |
| ~~D3~~ ✅ | `sensitive_blur` survives the owner's obliteration directive | `src/lib/talosAppearancePreferences.ts` |
| ~~D4~~ ✅ | Orphan exports: `resolveTalosMissionPathVisibility`, `TALOS_CHAT_COMPOSER_MODE_OPTIONS`, `resolvePresentation`, `TALOS_TABLET_MIN_WIDTH`, `asyncRouteComponent` | definition-only references |
| ~~D5~~ ✅ | Tests still assert removed behaviour (`setVisibility`/`resetVisibility`) | `tests/unit/theme/settingsStore.test.ts` |

## TEST COVERAGE STILL MISSING

| # | Item | Why it matters |
|---|---|---|
| T1 | Grant revocation (`resolveMessageParts`) never executes in any test — every caller stubs it | It is the only thing stopping a revoked file from reaching a provider |
| T2 | Stop/abort has no unit test and no e2e; no test presses Stop | The fix for a shipped device bug is undefended |
| T3 | Provider adapters: one 401 test total across four adapters; no abort/stall/malformed-body coverage | The whole provider error surface is unguarded |
| T4 | The native dictation engine is module-private and untested | "Mic not starting" is exactly this surface |
| T5 | No CI at all (`.github/` absent); `device-smoke.mjs` exists but never runs | "Device-proven" currently means the owner's thumb |

## PRODUCT / PERF

| # | Item | Evidence |
|---|---|---|
| P1 | `verify-initial-chunk.mjs` budgets JS but ignores ~130KB of render-blocking CSS | `scripts/verify-initial-chunk.mjs` sums only `.js` |
| P2 | The `.woff` plugin deletes bundle entries after CSS/manifest were emitted | shipped CSS still lists `.woff` URLs; manifest advertises 15 non-existent assets (harmless today — woff2 wins — but the manifest lies) |
| P3 | Idle warm-up is one un-yielded 284KB / 35-chunk burst, forced at 3s | `src/main.ts` |
| P4 | Chat text size does not reach in-thread chrome (timestamps, chips, system messages) | `text-[11px]`/`text-xs` in `TalosMobileMessageList.vue`, `TalosMobileStatusMessage.vue` |
| P5 | Composer sheet swallows one Back during its 300ms close animation | `TalosMobileComposerSheet.vue` registers without an `isActive` predicate |
| P6 | Library grid has no per-item actions; group-by-chat is not persisted | `src/screens/ContextScreen.vue` |
| P7 | No message virtualization; `listMessages` has no LIMIT | a long thread re-sanitizes every message on open |
| P8 | `feature-parity.json` still marks shipped features `planned` (settings, theme_engine, memory, tasks, notes, doctor) | the 4 phantom test ids are gone, the status lies are not |

---

## Sequencing — what must be paid before each roadmap phase

- **Semantic retrieval probe**: A4 first (a third tier on four mutable closure
  variables is how the budget bug returns), then P8 so progress is expressible.
- **Tool suite**: ~~A1 is blocking~~ ✅ **contract widened** — next are — widen the completion contract before the
  first tool exists. Then D1–D2 (do not add tool toggles to a repo that ships
  inert ones) and T3.
- **Device filesystem / Shizuku**: **S1–S6 are blocking.** Broad device authority
  on a consent model that shipped two defects in 24 hours is how a breach gets
  written. Also needs A3 (teardown) and a real audit log.
- **Claude-style "+" drawer**: collapse the three existing `+` surfaces first
  (P5/P6 adjacent), or a fourth variant compounds untested configuration space.
