# TALOS mobile — open debt register

**Verified at HEAD (2026-07-26), after the tool suite and its SF flattening
round.** Progress: **A1, D1–D5, S2, S3, S1, P1, P2, P4, P7, T5 closed** — plus
the owner's six-defect batch (`ae06e8b`…`a463c96`), its cross-cutting re-review
(`8c0e596`), the tool suite (`5a1c276`…`8d72254`) and this flattening commit.
**25 items remain** (S4–S6, S8–S11, A2–A7, T1–T4, **T6–T9**, P3, P5, P6, P8). S7 closed by the per-chat media gallery; T6–T9 are NEW, opened by the tool suite and the gallery. They were named in commit messages and in a ledger and were missing from this table — an SF review caught that, which is precisely the hiding this file exists to prevent. — the previous line
said 19 while the table below listed 22, and the register that exists to stop
debt hiding must not be the thing hiding it. Every line below was confirmed against the
code, not recited from a review. This file exists because the owner asked that no
debt be left on the road: a debt that lives only in a review transcript or a
commit message is a debt nobody will pay.

**Rule:** an item leaves this file only when the code changes and a gate proves
it. Closing an item by editing this file is forbidden.

---

## SECURITY — the app lock does not lock anything at rest

| # | Item | Evidence | Why it matters |
|---|---|---|---|
| ~~S1~~ ✅ **CLOSED** `ae06e8b` | The PIN does not derive the SQLCipher key | `src/persistence/capacitorSqliteRuntime.ts` generates an independent random secret; `src/services/appLock.ts` only verifies a PBKDF2 hash | "Locked" is a Vue boolean over a live, decrypted DB. Flipping one flag is a full bypass |
| ~~S2~~ ✅ **CLOSED** `510327b` | No `FLAG_SECURE`; re-lock happens on *resume*, not *pause* | grep `FLAG_SECURE` in `android/` → **0 hits**; `src/services/resumeRelock.ts` records `hiddenAt` on hide, acts on resume | Android snapshots the screen at pause → the recents card shows the open chat, readable with no PIN |
| ~~S3~~ ✅ **CLOSED** `510327b` | No attempt throttling; 4-digit minimum | `src/services/appLock.ts` | 10 000 candidates, unthrottled, against a local verifier |
| S4 | Vault file bodies are stored unencrypted | `src/services/attachmentFileStore.ts` writes raw bytes to `Directory.Data` | The DB is SQLCipher-encrypted while the passport scan next to it is plaintext — asymmetric in the wrong direction |
| S5 | Endpoint override ships the API key to any host, no confirmation, no allowlist | `src/lib/chat/providers/openAiCompatibleAdapter.ts` prefers `credential.endpoint`; `providerErrors.ts` validates only scheme/parse | One settings change (or one persuasive reply) sends a live paid key to a third party |
| S6 | Model output still writes files with **no confirmation** | `src/stores/chatController.ts` → `attachments.saveGenerated(block)` fire-and-forget | An opt-out toggle + an Undo toast is *mitigation*, not the per-write consent the review demanded |
| T6 | Anthropic signed `thinking` blocks are not captured | `anthropicAdapter.ts` reads `thinking_delta` only, never `signature_delta`; `reasoning` is a flat string with no block identity | Extended thinking is DISABLED on tool follow-up rounds, because replaying unsigned blocks is a documented 400 |
| T7 | Tool rounds are never persisted | `appendDurable` takes `user\|assistant\|system`, although the DB schema, the row parser, `ChatTurn` and all four adapters accept `tool` | The model re-calls the same tools for every follow-up about one document; the `role === 'tool'` branch in the history rebuild is unreachable |
| T8 | The tool audit trail is written and never shown | Rows land as `tool.<name>`; `toBrowserActivityView` allow-lists ten browser operations and returns null otherwise | A failed tool and a successful one look identical to the user; the "explainable afterwards" promise is kept only in the session export |
| T9 | Thumbnails re-read every image in full on each open | `previewUrl` → `readFilePreview` does `getVaultFile` (whole body) + `readPrivate` (full bytes, up to 10 MB); the cache dies with the panel | A chat with a dozen photos re-pulls tens of MB across the Capacitor bridge on every header tap. Real fix: generate a downscaled thumbnail once at ingest |
| ~~S7~~ ✅ **CLOSED** (2026-07-26) | `metadata.library_shared` opt-out has no UI | The switch now lives on every uploaded document in the per-chat media gallery, written through `vault.setFileShared`, which MERGES the flag — `updateVaultFile` replaces the metadata bag wholesale, so a naive write would have erased `origin` and `origin_session_id` and made a generated file look uploaded | — |
| S8 | The untrusted-context boundary is forgeable | `src/lib/chat/libraryContext.ts` interpolates doc text verbatim; the `USER_TASK:` boundary is prose | A document body containing `USER_TASK:` terminates the untrusted region from the model's point of view |
| S9 | Secret redaction is exact-match only | `safeProviderMessage` in `chatController.ts` | A provider echoing a transformed key (URL-encoded, truncated) leaks it into a persisted error |
| S10 | Export writes plaintext to Cache and races the share target | `src/services/sessionExportDelivery.ts` | Unawaited delete can fire while the receiver is still reading; Cache is not excluded from backup |
| S11 | FileProvider grants the whole external storage root | `android/app/src/main/res/xml/file_paths.xml` (`path="."`) | Least-privilege violation that becomes dangerous the moment device-filesystem work starts |

## ARCHITECTURE — blocks the roadmap

| # | Item | Evidence | Blocks |
|---|---|---|---|
| ~~A1~~ ✅ **CLOSED** `15988d7` | The completion contract is `Promise<string>` | `src/stores/chat.ts:38`; `ChatTurn.role` admits only user/assistant; `finishReason` is discarded | **Tool calling cannot be added without breaking it.** Must be widened FIRST or the work is done twice |
| A2 | `chatController.ts` is a god-object | **1412 lines** (1256 when first measured; +156 from the tool suite alone), 55 public members, ~28 module deps, imported by 11 screens | Every feature edits one file; nothing can be unit-tested without building the world |
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
| ~~T5~~ ✅ **CLOSED** `a463c96` | The evidence was wrong even when written — `.github/workflows/ci.yml` had six jobs; MOBILE was the part never checked. It has a job now | "Device-proven" currently means the owner's thumb |

## PRODUCT / PERF

| # | Item | Evidence |
|---|---|---|
| ~~P1~~ ✅ **CLOSED** `42c4d4b` | `verify-initial-chunk.mjs` budgets JS but ignores ~130KB of render-blocking CSS | `scripts/verify-initial-chunk.mjs` sums only `.js` |
| ~~P2~~ ✅ **CLOSED** `42c4d4b` + inline data URIs in the re-review | The `.woff` plugin deletes bundle entries after CSS/manifest were emitted | shipped CSS still lists `.woff` URLs; manifest advertises 15 non-existent assets (harmless today — woff2 wins — but the manifest lies) |
| P3 | Idle warm-up is one un-yielded 284KB / 35-chunk burst, forced at 3s | `src/main.ts` |
| ~~P4~~ ✅ **CLOSED** `6cce6c6` (global font scale) | Chat text size does not reach in-thread chrome | `text-[11px]`/`text-xs` in `TalosMobileMessageList.vue`, `TalosMobileStatusMessage.vue` |
| P5 | Composer sheet swallows one Back during its 300ms close animation | `TalosMobileComposerSheet.vue` registers without an `isActive` predicate |
| P6 | Library grid has no per-item actions; group-by-chat is not persisted | `src/screens/ContextScreen.vue` |
| ~~P7~~ ✅ **CLOSED** `d90668a` (keyset paging; the lazy wrapper that silently disabled it was caught by the cross-cutting re-review) | No message virtualization; `listMessages` has no LIMIT | a long thread re-sanitizes every message on open |
| P8 | `feature-parity.json` still marks shipped features `planned` (settings, theme_engine, memory, tasks, notes, doctor) | the 4 phantom test ids are gone, the status lies are not |

---

## PROVENANCE — three upstream hashes that could not be re-derived (2026-08-01)

The conformance manifests had been recorded from a working copy carrying stray
CR characters on some lines. Git normalises those on commit, so the committed
text was always correct and `git status` stayed clean — but the numbers written
into `upstream/shadcn-vue-2.8.0-manifest.json` and
`upstream/desktop-ported-libs-manifest.json` described bytes that exist on no
clean checkout. **All 24 shadcn rows and one ported row were unsatisfiable by
any fresh clone**, which a first clone on a second machine exposed; CI would
have shown the same. Re-recorded against canonical repository bytes.

The text was provably unchanged: git calls a file clean only after normalising
CR, so any difference beyond line endings would have shown as modified.

| # | Item | Evidence |
|---|---|---|
| U1 | The three adapted rows' `upstream_sha256` still hold the pre-correction numbers. They describe the **pristine upstream** file, which is not on disk here — it lived in a probe app that was never vendored — so they cannot be recomputed from anything available. Only what could be proved was rewritten. | `adaptations[].upstream_sha256` in `upstream/shadcn-vue-2.8.0-manifest.json`; `source_evidence` names `generated-checksums.txt`, absent from the repo |
| U2 | 32 tracked files hold CR **inside their blobs** despite `* text=auto eol=lf`. Harmless today — blob bytes are identical on every clone, so hashes reproduce — but it is the same trap one commit away. `git add --renormalize` is the fix, and it rewrites content, so it wants its own commit. | `git ls-files --eol` filtered to `attr/text=auto eol=lf` with `w/mixed` or `w/crlf` |

Paying U1 means re-extracting shadcn-vue 2.8.0 into a probe app and recomputing
the pristine hashes — which would also re-verify that the 21 unadapted files
really are byte-identical to upstream, a claim currently resting on the
original Codex 55/55 check rather than on anything reproducible here.

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
