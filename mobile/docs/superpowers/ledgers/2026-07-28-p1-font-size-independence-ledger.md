# P1 Font-size independence execution ledger

Date: 2026-07-28
Subsystem: TALOS mobile UI
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED (automated); physical Android accessibility checklist pending

Amendment 2026-07-28: current inspection located the font-scale unit at
`tests/unit/lib/talosFontScale.test.ts`, not the initially written
`tests/unit/settings/talosFontScale.test.ts`. The command below is corrected;
scope and behavior are unchanged.

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p1-font-size-independence-research.md`
- `mobile/docs/superpowers/research/2026-07-28-p1-font-size-conformance-pin-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-font-size-independence-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-font-size-independence-ledger.md`

Modify:

- `mobile/src/lib/talosChatLayout.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsAppearancePanel.vue`
- `mobile/src/stores/settings.ts`
- `mobile/src/lib/talosFontScale.ts`
- `mobile/src/App.vue`
- `mobile/upstream/desktop-ported-libs-manifest.json`
- `mobile/tests/unit/chat/chatTextScale.test.ts`
- `mobile/tests/e2e/mobile-f4-regressions.e2e.spec.ts`
- `mobile/tests/e2e/mobile-settings-parity.e2e.spec.ts`

Delete: none.

Amendment 2026-07-28 (final global gate): the original ownership list omitted
the checksum manifest even though this slice intentionally edits a
desktop-ported file. The full unit suite made that omission visible. The
manifest and the task-specific conformance research are added before the
manifest edit; no product path is expanded.

Named final-gate regression:

`desktopPortedConformance.test.ts::every pinned ported lib matches its recorded
hash (drift is a red build)`

Observed RED:

```text
expected 37b64b546076e43a0c4b6a34724ae4142550d54bd7c23dc26481eeea406d692f
received 221891216546ceb1ddbe0f073b6ecd32daa9a71795ebc41cf24437e8b7044be9
```

Upstream decision and exact provenance are recorded in
`2026-07-28-p1-font-size-conformance-pin-research.md`.

Final-gate GREEN:

```text
desktopPortedConformance.test.ts + chatTextScale.test.ts
2 files | 7 tests passed
```

The manifest now pins the reviewed mobile bytes and explicitly records both
intentional divergences: the fourth chat step and independent UI/chat scaling.

## Stable public symbols and schemas

- Keep `talosChatTextSize(scale)` name, arguments, and return type stable.
- Keep `TALOS_CHAT_TEXT_SCALE_REM`,
  `TALOS_CHAT_BUBBLE_SCALE_OPTIONS`, `TalosChatBubbleScale`,
  `TalosFontScale`, `shell.ui_font_scale`, and
  `chat_layout.bubble_scale` stable.
- Add no migration and no compatibility alias.
- Add only the private test selector
  `data-testid="talos-chat-font-scale-select"`.

## RED

Named unit regression:

`chatTextScale.test.ts::keeps every chat step independent from the interface ui scale`

Expected failure before product edit: each rendered thread style contains
`var(--talos-ui-scale, 1)` instead of the exact mapped `<n>rem`.

Named realistic E2E regression:

`mobile-f4-regressions.e2e.spec.ts::font size and chat message size remain independent in both directions and after reload`

Expected failure before product edit: changing only `Font size` changes the
computed font size of already-rendered message prose.

RED commands:

```powershell
npm run test:unit -- tests/unit/chat/chatTextScale.test.ts
npx playwright test tests/e2e/mobile-f4-regressions.e2e.spec.ts --grep "font size and chat message size"
```

Observed RED:

- Unit: 1 failed / 4 passed. The received inline style was
  `font-size: calc(0.875rem * var(--talos-ui-scale, 1));`.
- E2E: with Chat `Extra small`, changing UI Small -> Extra large changed
  message prose from 12.6 px to 18.2 px.

## GREEN implementation

- Change `talosChatTextSize()` to return `${rem}rem` with no
  `--talos-ui-scale` multiplier.
- Update inaccurate comments and Appearance explanatory copy.
- Add a stable selector to the chat-size control.
- Preserve UI token scaling and all serialized values.

Focused GREEN commands are the two RED commands above.

## Affected regression gates

```powershell
npm run test:unit -- tests/unit/chat/chatTextScale.test.ts tests/unit/lib/talosFontScale.test.ts tests/unit/settings/TalosMobileSettingsAppearancePanel.test.ts tests/unit/chat/TalosMobileMessageList.test.ts
npx playwright test tests/e2e/mobile-settings-parity.e2e.spec.ts tests/e2e/mobile-f4-regressions.e2e.spec.ts
npm run typecheck
npm run build
git diff --check
```

Full mobile unit/E2E suites and Android packaging remain coordinated final-run
gates after all queued P slices close.

## Real-upstream and human-visible gates

- Chromium/WebView-style Playwright acceptance measures computed styles through
  real Settings interactions, message rendering, persistence, and reload.
- Android owner checklist repeats both axes, then validates Android maximum
  system font size for reflow/clipping.
- No mock-only claim can close the physical-device accessibility gate.

## Fresh closure evidence

- Focused unit GREEN: 5/5.
- Focused computed-style E2E GREEN: 1/1 in 15.2 s.
- Affected unit suites: 26/26 across 4 files.
- Affected E2E suites: 13/13 across Settings parity and F4 regressions.
- `npm run typecheck`: pass.
- `npm run build`: pass; 3,205 modules, initial JavaScript 554,428 /
  560,000 bytes, CSS 129,159 / 150,000 bytes, parity 9/9.
- `git diff --check`: pass; only existing line-ending notices were emitted.

The Android maximum-system-font and physical two-axis checks remain explicitly
deferred to the owner's final APK checklist. They do not authorize an ACK
ticket before the owner reports all manual checks passed.

## Rollback

Rollback is the scoped reversal of this slice's exact modifications. No stored
data rollback is required because schemas and persisted option values do not
change. Reinstating the old `calc(... * var(--talos-ui-scale))` would restore
the known coupling and must also remove the independence tests and copy.
