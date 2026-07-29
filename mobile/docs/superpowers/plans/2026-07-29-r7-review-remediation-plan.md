# R7 review remediation plan

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: approved; slices 1-13 closed, slice 14 automated gates and APK
complete, independent review complete; owner acceptance blocked by review P1s
and the post-APK R8 context-isolation finding
Commit policy: no commit without fresh owner authorization

## Fixed execution order

Each slice receives its own research dossier, design, exact file-level ledger,
RED test, focused GREEN gate, affected regression gate, rollback, and
human-visible proof. A later slice cannot start while the preceding slice is
open.

1. Fail closed when a generated image cannot be persisted in the Vault.
2. Localize tool-consent titles and descriptions.
3. Make Agent Tools toggle persistence transactional and visibly recoverable.
4. Add the Android 13+ application-locale migration sentinel.
5. Make native export filenames grapheme-safe on every supported Android
   runtime.
6. Remove the `TALOS` wordmark from the launcher artwork; retain only the
   centered, theme-aware final-frame symbol.
7. Give the tablet Settings sidebar the same bounded vertical scrolling
   contract as the global sidebar.
8. Add an official Tavily registration/API-key link to Settings through the
   existing safe external-navigation boundary.
9. Render the `N memory used` pill only on the first relevant message bubble,
   never redundantly on every subsequent bubble.
10. Make the global Library `All` filter include saved links as well as every
    file/media kind, with permanent filter/search/count regression coverage.
11. Replace the `Sparkles` icon on the Reasoning row with the semantically
    correct `Brain` icon, preserving every row action and state.
12. Restore coherent interaction motion for composer focus-in/focus-out and
    Settings-section navigation, then audit adjacent abrupt state changes
    against the owned motion tokens, reduced-motion contract and frame-budget
    gates.
13. Replace new-chat welcome copy with a localized, research-backed JSON
    library: title-only presentation; at least ten verified titles per
    morning/afternoon/evening/night condition and per supported special date;
    explicit precedence/fallback rules; and small contextual easter eggs that
    remain accessible, theme-safe and reduced-motion compliant.
    - Owner approved the international set on 2026-07-29: New Year's Day,
      Valentine's Day, Halloween, Christmas Eve, Christmas Day and New Year's
      Eve.
    - Owner approved the dedicated lazy per-locale JSON architecture and
      atomic inline execution on 2026-07-29.
    - Detailed implementation plan:
      `docs/superpowers/plans/2026-07-29-r7-localized-welcome-library-plan.md`.
    - Automated closure on 2026-07-29: 96 affected unit tests, typecheck,
      production build/parity, five real lazy manifest boundaries and the
      phone/reload/tablet Playwright journey are green. Initial JavaScript is
      559,912/560,000 bytes; physical Android proof remains in slice 14.
14. Run the complete R7 verification matrix, build and copy the APK to the
    Desktop, then start the independent critical review.

The Claude acknowledgement ticket remains blocked until the owner has manually
tested every item and explicitly acknowledged the checklist. No commit is part
of this plan.

## Cross-slice compatibility contracts

- Preserve the successful generated-image path, encrypted Vault lifecycle, and
  reload-safe message attachment.
- Preserve live tool revocation and fail-closed capability checks.
- Preserve explicit locale choices and Android system-locale integration.
- Preserve Unicode filenames without replacing one broken runtime heuristic
  with another.
- Preserve adaptive icon masks, theme aliases, boot-frame geometry, and
  centering.
- Preserve phone Settings behavior, tablet keyboard navigation, safe-area
  handling, and the global sidebar layout.
- Preserve the Tavily key's secure-storage boundary; the registration link
  must not read, prefill, log, or append credentials.
- Preserve memory evidence and accessibility while deduplicating only its
  repeated visual badge; do not hide distinct per-turn memory provenance.
- Preserve link rows across the global Library's `All` view, search, counts,
  reload and every type-specific filter.
- Preserve Reasoning-row labels, actions, state and layout while changing only
  its semantic icon.
- Preserve focus, keyboard, scroll position and selected Settings state while
  adding motion; reduced-motion must remain immediate and no transition may
  animate layout in a way that causes text reflow or frame fragmentation.
- Preserve fast offline new-chat startup and UI localization while making the
  welcome title dynamic. Do not fetch copy at runtime, infer protected personal
  traits, show a subtitle, or let a festive decoration obscure/rename the
  heading; special-date precedence and locale fallback must be deterministic.
- Do not add a second media store, raw base64 to persisted chat rows, mock
  product behavior, or new runtime dependencies without an amended ledger and
  upstream decision.

## Final gates

The final R7 close requires the focused gates recorded in every slice plus:

```powershell
npm run typecheck
npm run test:unit
npm run build
npx cap sync android
.\gradlew.bat testDebugUnitTest assembleDebug
git diff --check
```

The Android commands run from `mobile/android`. Physical-device, real-provider,
reload, tablet viewport, launcher, and locale checks remain owner acceptance
gates and must appear in the APK checklist.

## Slice 14 full-suite amendment - 2026-07-29

The first complete unit run reported 2,300 passes and three failures. Focused
reruns proved the consent and app-shell cases green in isolation, while the
provenance mismatch remained deterministic.

Exact additional ownership:

- Modify `tests/unit/chat/chatController.test.ts`.
- Modify `tests/unit/shell/appShell.test.ts`.
- Modify `docs/upstream-provenance.md`.

Named permanent scenarios:

- `R7-FINAL-UNIT-01`: the real document-tool consent wait uses an explicit
  non-performance timeout under full-suite CPU contention; focused behavior
  and denial completion remain unchanged.
- `R7-FINAL-UNIT-02`: persistent ChatScreen-under-sheet proof targets the
  stable hero/composer DOM contract, never one random welcome title.
- `R7-FINAL-DOC-01`: provenance retains the historical Java regex probe
  without presenting the rejected JDK 17 string as a current toolchain.

Current official Vitest documents a 1,000 ms default for `vi.waitFor` and an
explicit timeout option; Vue Test Utils recommends stable DOM assertions plus
`flushPromises` for non-Vue promises. Decisions: adapt those existing test
APIs, do not change runtime scheduling, random-title behavior or product
timeouts. Sources:
<https://vitest.dev/api/vi#vi-waitfor> and
<https://test-utils.vuejs.org/guide/advanced/async-suspense>.

RED evidence:

```text
chatController TOOL-CONSENT-I18N-03  pending consent still null at default wait
appShell persistent-base assertion   fixed welcome copy absent after lazy resolve
provenanceConsistency                stale literal "JDK 17" rejected
```

Focused GREEN, the complete unit suite, build, Android and diff gates must all
rerun before APK delivery. Rollback restores only these three test/doc lines;
no product or persisted state is involved.

## Slice 14 automated evidence - 2026-07-29

- Focused full-file regression gate: 3 files and 52 tests passed.
- Complete Vitest gate: 269 files passed, 2 skipped; 2,303 tests passed,
  5 skipped; zero failures.
- `npm run typecheck`: passed.
- Production build and parity: passed; 3,250 modules transformed; initial
  JavaScript 559,912/560,000 bytes; initial CSS 134,866/150,000 bytes;
  parity 9/9.
- `npx cap sync android`: passed with 14 real native plugins.
- Temurin 21.0.11 plus Android SDK 36:
  `testDebugUnitTest assembleDebug` passed with `BUILD SUCCESSFUL`;
  555 actionable tasks, 32 executed and 523 up-to-date.
- APK signature verification: debug signer, APK Signature Scheme v2 passed.
- Android build-tools 36.0.0 `zipalign -c -P 16 -v 4`: verification
  successful.
- Package: `ai.talos`, version `1.0 (1)`, min SDK 26, target SDK 36.
- Desktop artifact:
  `C:\Users\ninox\Desktop\TALOS-mobile-final-2026-07-29-r7-debug.apk`;
  43,688,877 bytes; SHA-256
  `9F0662FA7A39D7F3649205319E43E433FEBD5593D9423AD22C1D7CA05E83E441`.
- `git diff --check`: passed with line-ending warnings only.
- `npm audit --omit=dev --audit-level=low`: zero known runtime dependency
  vulnerabilities at the time of the gate.
- Owner physical-device acceptance remains pending against
  `C:\Users\ninox\Downloads\findings\2026-07-29-talos-mobile-r7-manual-acceptance-checklist.md`.
- Claude acknowledgement ticket and commit remain blocked until fresh owner
  authorization after manual acceptance.

## Independent review closure and post-APK blocker amendment - 2026-07-29

- The read-only independent review is complete. Its full report is stored at
  `C:\Users\ninox\Downloads\findings\2026-07-29-talos-mobile-r7-independent-code-review.md`.
- Verdict: the R7 artifact is a diagnostic/manual-test APK, not an
  acceptance-ready or release-ready build.
- Review blockers:
  - P1 transactional persistence for capability-bearing settings;
  - P1 serialized database relock/unlock lifecycle.
- The owner's post-APK transcript also proves unrelated global-Library context
  reached a follow-up after a model change. The root analysis and proposed
  R8 ledger are stored at
  `C:\Users\ninox\Downloads\findings\2026-07-29-r8-model-switch-library-context-isolation-proposal.md`.
- The model change is a plausible trigger but not proven as the sole cause by
  the current Markdown export. The confirmed primary defect is ambient
  whole-Library injection with no positive-relevance requirement; adjacent
  session/model races make the boundary non-transactional.
- Compatibility audit: R8 must preserve the opt-in ambient use of relevant,
  shared uploaded files, the generated-file exclusion, natural-language
  Library tools, live revocation and bounded disclosure. It replaces only
  zero-relevance/whole-Library selection and mutable send identity; the earlier
  proposal to remove ambient grounding entirely is superseded.
- No remediation code has been started for these review findings. Each requires
  its own research/ledger amendment, RED proof and ordered closure before a new
  acceptance APK.
- Claude acknowledgement and any commit remain blocked by the owner's stated
  manual-acceptance and fresh-authorization requirements.
