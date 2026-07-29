# P1 dictation locale and diagnostic-severity execution ledger

Status: GREEN - implementation and affected regression gates are closed.
Physical microphone behavior remains explicitly assigned to the owner's final
APK checklist.

## Owned subsystem

TALOS mobile speech input, local Settings, localized notices, and Doctor
diagnostics. No desktop/backend, Claude-session, Git-history, permission, or
database writes.

## Exact file ownership

Create:

1. `docs/superpowers/research/2026-07-29-p1-dictation-locale-diagnostics-research.md`
2. `docs/superpowers/specs/2026-07-29-p1-dictation-locale-diagnostics-design.md`
3. `docs/superpowers/ledgers/2026-07-29-p1-dictation-locale-diagnostics-ledger.md`
4. `src/lib/dictationPolicy.ts`
5. `tests/unit/lib/dictationPolicy.test.ts`
6. `tests/unit/services/dictationEngine.test.ts`

Modify:

7. `src/services/dictation.ts`
8. `src/composables/useTalosMobileDictation.ts`
9. `src/screens/ChatScreen.vue`
10. `src/screens/DoctorScreen.vue`
11. `src/stores/settings.ts`
12. `src/components/talos/settings/TalosMobileVoiceSettings.vue`
13. `src/components/talos/settings/TalosMobileSettingsAccountPanel.vue`
14. `src/i18n/locales/en.ts`
15. `src/i18n/locales/it.ts`
16. `tests/unit/services/dictationDiagnostics.test.ts`
17. `tests/unit/composables/useTalosMobileDictation.test.ts`
18. `tests/unit/settings/TalosMobileVoiceSettings.test.ts`
19. `tests/unit/components/TalosMobileSettingsAccountPanel.test.ts`
20. `tests/unit/theme/settingsStore.test.ts`
21. `tests/e2e/mobile-settings-parity.e2e.spec.ts`

Delete: none.

If inspection requires another product file, amend this list and record the
reason before editing it.

## Public symbols and compatibility

Add:

- `TalosDictationLanguageMode`
- `TalosDictationErrorCode`
- `TalosDictationStartOptions`
- `parseTalosDictationLanguageMode`
- `resolveTalosDictationLanguageTag`
- `TalosMobileVoicePreferences.dictation_language`
- `TalosDictationDiagnostics.trace`
- `UseTalosMobileDictationOptions.language`
- `UseTalosMobileDictationOptions.errorMessage`

Change compatibly:

- `TalosDictationEngine.start(events, options?)` keeps every existing call
  valid.
- `TalosDictationEvents.onError` changes from an arbitrary string to the
  bounded `TalosDictationErrorCode`.
- `TalosDictationDiagnostics.error` remains public but becomes truthful:
  success is `null`; failures contain bounded step evidence.

Stable:

- `talosDictationEngine`
- `talosDictationDiagnostics`
- `useTalosMobileDictation`
- `TalosMobileVoiceSettings`
- all existing mic, TTS, Doctor report, and settings persistence contracts.

## RED scenarios

1. `DICT-POLICY-01 system/en/it parse fail-closed and resolve to bounded tags`.
2. `DICT-SETTINGS-01 dictation language defaults to system, rejects garbage,
   persists and rehydrates`.
3. `DICT-ADAPTER-01 native start supplies the explicit Capgo language`.
4. `DICT-ADAPTER-02 web start supplies the explicit Web Speech language and
   system mode retains the browser language`.
5. `DICT-I18N-01 engine and liveness failures use localized bounded messages,
   never raw plugin prose`.
6. `DICT-UI-01 dictation language remains available without TTS and updates
   the Settings store`.
7. `DICT-DIAG-01 a healthy deep probe has error null, a trace, and adds no
   TALOS_SPEECH_DEEP issue`.
8. `DICT-DIAG-02 a failed probe retains an issue and truthful error`.
9. `DICT-ACCOUNT-01 a healthy trace is labelled Details, never Error`.
10. `DICT-E2E-01 language selection persists across reload and remains
    independent from UI locale`.

Expected initial RED: missing policy module/symbols; engine accepts no language;
diagnostics logs healthy probes and stores their trace as `error`; Settings has
no speech-input choice; composable surfaces English/raw strings.

## RED evidence

Fresh run on 2026-07-29:

```text
npx vitest run tests/unit/lib/dictationPolicy.test.ts \
  tests/unit/services/dictationEngine.test.ts \
  tests/unit/services/dictationDiagnostics.test.ts \
  tests/unit/composables/useTalosMobileDictation.test.ts \
  tests/unit/settings/TalosMobileVoiceSettings.test.ts \
  tests/unit/components/TalosMobileSettingsAccountPanel.test.ts \
  tests/unit/theme/settingsStore.test.ts --reporter=dot

exit 1
7 test files red
13 failed, 42 passed
```

The failures match the ledger: the pure policy module is absent; native and web
adapters ignore the explicit locale; the composable ignores localized-message
and language options; healthy diagnostics have no `trace`, retain a non-null
`error`, and log `TALOS_SPEECH_DEEP`; the settings field/control and Account
Details label do not exist. No unrelated focused regression appeared.

## Commands

RED and focused GREEN:

```powershell
npx vitest run tests/unit/lib/dictationPolicy.test.ts tests/unit/services/dictationEngine.test.ts tests/unit/services/dictationDiagnostics.test.ts tests/unit/composables/useTalosMobileDictation.test.ts tests/unit/settings/TalosMobileVoiceSettings.test.ts tests/unit/components/TalosMobileSettingsAccountPanel.test.ts tests/unit/theme/settingsStore.test.ts
```

Affected regression:

```powershell
npx vitest run tests/unit/services tests/unit/composables/useTalosMobileDictation.test.ts tests/unit/chat/TalosMobileComposer.dictation.test.ts tests/unit/chat/TalosMobileComposer.drawer.test.ts tests/unit/settings tests/unit/components/TalosMobileSettingsAccountPanel.test.ts tests/unit/theme/settingsStore.test.ts tests/unit/diagnostics tests/unit/screens/doctorSections.test.ts
npm run typecheck
npm run build
npx playwright test tests/e2e/mobile-settings-parity.e2e.spec.ts tests/e2e/mobile-f5-regressions.e2e.spec.ts
git diff --check
```

Full unit, complete Playwright, Capacitor sync, Android JVM and APK assembly
remain the later single-runner final handoff gate.

## GREEN and closure evidence

Fresh runs on 2026-07-29:

```text
Focused unit:
7 files passed
56 tests passed

Affected regression:
49 files passed
314 tests passed

npm run typecheck:
passed

npm run build:
3239 modules transformed
initial JavaScript 559798 / 560000 bytes
initial CSS 132986 / 150000 bytes
9 parity checks passed

Focused Playwright:
tests/e2e/mobile-settings-parity.e2e.spec.ts
5 passed

Combined affected Playwright:
tests/e2e/mobile-settings-parity.e2e.spec.ts
tests/e2e/mobile-f5-regressions.e2e.spec.ts
7 passed

git diff --check:
passed (line-ending notices only)
```

The first build completed compilation but correctly failed the JavaScript
budget at 560002 / 560000 bytes. The budget was not raised. Compact fallback
copy used only by non-product isolated callers removed the two-byte overage;
the localized product messages remain unchanged. The subsequent build passed
with 202 bytes of headroom.

The first combined Playwright run was 6/7 because the new independence test
looked for the root heading `Settings Center` while the open detail route
truthfully displayed `Appearance`. Its accessibility snapshot showed the
English `Dictation language` control with `Italiano` selected. The oracle was
corrected to assert the stable English control and the absence of the Italian
UI label; the focused and combined reruns then passed.

Human-visible inspection at 390x844 and 320x640 confirmed that the Voice panel
keeps speech input separate from reply reading, retains clear hierarchy, and
has no horizontal clipping or overlap. At 320px the lower controls remain
vertically scrollable.

The affected unit run emits known Vue warnings from
`TalosMobileSettingsAppearancePanel.test.ts` mocks that omit unrelated shell
fields; they are non-failing and were not introduced by this slice.

Later coordinated handoff gates also passed:

- complete Vitest: 2,195 passed, 5 declared skips;
- complete Playwright: 71/71;
- Capacitor sync: 14 plugins, speech recognition 8.1.7;
- Android JVM: 24/24;
- APK assembly, zip alignment and v2 signature verification.

## Real-upstream and human-visible proof

- Mounted Settings tests exercise the existing Reka-backed themed select.
- Adapter tests call the actual pinned Capgo JS proxy contract through the
  AVM-owned engine rather than duplicating start-option semantics.
- Playwright changes dictation language, reloads, and proves UI locale does not
  change.
- Physical APK checklist: choose Italiano while UI is English, dictate an
  Italian sentence, switch back to device, rescan Doctor, and confirm a healthy
  probe creates no recent issue.

## Rollback

Remove the two new code/test files and the optional engine options; remove only
the new locale keys and preference field; restore diagnostic trace placement.
No stored chat, media, permission, database, native resource, or dependency
rollback is required.
