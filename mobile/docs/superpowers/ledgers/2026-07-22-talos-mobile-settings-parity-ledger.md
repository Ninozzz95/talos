# TALOS Mobile Settings Parity Execution Ledger

Date: 2026-07-22
Status: COMPLETE
Owner: Codex mobile lane

## Frozen boundaries

- Read-only specification: `C:/Users/ninox/Desktop/AVM/control-plane/resources/js/components/talos/settings/TalosSettingsCenter.vue`
- Writable product root: `C:/Users/ninox/Desktop/AVM-lanes/kimi/mobile/`
- No Git mutation commands. No desktop/backend edits. No package install.

## Public symbols and compatibility contracts

- `TalosMobileSettingsTabId`
- `TalosMobileSettingsTab`
- `TALOS_MOBILE_SETTINGS_TABS`
- `TalosMobileSettingsCenter`
- `TalosMobileSettingsModelsPanel`
- `TalosMobileSettingsAiDefaultsPanel`
- `TalosMobileSettingsAppearancePanel`
- `TalosMobileSettingsShortcutsPanel`
- `TalosMobileSettingsCapabilityPanel`
- `TalosThemedSelect`
- `TalosThemedSelectItem`
- Existing stable symbols retained: `SettingsScreen`, `useSettingsStore`, `useThemeStore`, `useChatController`, `TALOS_MOBILE_SETTINGS_KEY`, `TALOS_MOBILE_THEME_KEY`.
- New store boundary: `TalosMotionPreferencePatch`, `SettingsStore.setMotionPreferences`, `SettingsStore.resetMotionPreferences`, `SettingsStore.resetVisibility`, `SettingsStore.resetShortcuts`.

## Exact file inventory

Create:

1. `mobile/src/components/talos/settings/settingsTabs.ts`
2. `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
3. `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue`
4. `mobile/src/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue`
5. `mobile/src/components/talos/settings/TalosMobileSettingsAppearancePanel.vue`
6. `mobile/src/components/talos/settings/TalosMobileSettingsShortcutsPanel.vue`
7. `mobile/src/components/talos/settings/TalosMobileSettingsCapabilityPanel.vue`
8. `mobile/src/components/talos/ui/TalosThemedSelect.vue`
9. `mobile/src/components/talos/ui/TalosThemedSelect.test.ts`
10. `mobile/tests/unit/settings/settingsTabs.test.ts`
11. `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
12. `mobile/tests/unit/settings/TalosMobileSettingsAppearancePanel.test.ts`
13. `mobile/tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`

Modify:

14. `mobile/src/screens/SettingsScreen.vue`
15. `mobile/tests/unit/screens/settingsScreen.test.ts`
16. `mobile/src/stores/settings.ts`
17. `mobile/src/main.ts`
18. `mobile/src/components/talos/workspace/TalosMobileBackground.vue`
19. `mobile/tests/unit/theme/settingsStore.test.ts`
20. `mobile/tests/unit/theme/mobileBackground.test.ts`
21. `docs/superpowers/progress/kimi-mobile/M-parity-theme-motion-settings-ledger.md` after verification.
22. `mobile/src/App.vue` for the fail-closed navigation stacking regression.

Delete: none.

## TDD scenarios

### SET-M01: exact information architecture

RED: `settingsTabs.test.ts::exposes the exact twelve desktop settings categories in order`

Expected failure: no mobile tab registry exists.

GREEN: registry contains exactly `models`, `ai_defaults`, `search`, `browser`, `integrations`, `email`, `reminders`, `appearance`, `shortcuts`, `account`, `agent_tools`, `system`.

### SET-M02: APG tabs and navigation

RED: `TalosMobileSettingsCenter.test.ts::renders one labelled tablist, twelve tabs, and the selected tabpanel`

RED: `TalosMobileSettingsCenter.test.ts::moves selection with ArrowDown, Home, and End`

Expected failure: current screen has no tabs.

GREEN: Reka owns focus/selection semantics; selected panel is instant and preloaded enough for automatic activation.

### SET-M02A: themed option sets

RED: `TalosThemedSelect.test.ts::renders a themed portalled listbox without a native select`

Expected failure: no mobile themed select exists.

GREEN: port the desktop `TalosThemedSelect` boundary exactly, backed directly by `reka-ui@2.10.1`; preserve keyboard selection, disabled items, and portal behavior.

### SET-M03: secure provider and model flow retained

RED: updated `settingsScreen.test.ts` mounts the center, saves/removes a provider secret, and selects a callable profile without reload.

Expected failure: controls are not routed through a center panel.

GREEN: the extracted Models panel receives the existing chat controller state/actions without changing secure-storage ownership.

### SET-M04: appearance drives live theme and local preferences

RED: `TalosMobileSettingsAppearancePanel.test.ts::changes all thirteen presets and color mode through the theme store`

RED: `TalosMobileSettingsAppearancePanel.test.ts::persists bubble scale, composer mode, sheet presentation, and visibility`

Expected failure: no Appearance panel.

GREEN: controls call `ThemeStore.setTheme/setMode` and `SettingsStore.setChatLayout/setVisibility`; no duplicate state.

### SET-M04A: Motion V6 preferences are real

RED: `settingsStore.test.ts::sanitizes and persists Motion V6 preferences through the canonical parser`

RED: `mobileBackground.test.ts::feeds persisted Motion V6 preferences into the runtime resolver`

Expected failure: `motion_v6` is absent from the mobile settings schema and the background passes `{}`.

GREEN: the store deep-merges patches into a complete canonical `TalosMotionV6Preferences`, fails closed through `parseTalosMotionV6Preferences`, persists it, hydrates at app boot, and the background consumes that exact object. Appearance exposes mode, background/interface switches, speed, intensity, glow, density, quality, pause-when-hidden, data-saver, and reset.

### SET-M05: AI defaults and shortcuts are functional

RED: `TalosMobileSettingsLocalPanels.test.ts::persists utility, research, and vision defaults`

RED: `TalosMobileSettingsLocalPanels.test.ts::persists an edited shortcut through the settings store`

Expected failure: no panels.

GREEN: calls existing `setAiDefaults` and `setShortcut` boundaries.

### SET-M06: unavailable capability honesty

RED: `TalosMobileSettingsCenter.test.ts::keeps every runtime-dependent category visible and explicitly gated`

Expected failure: categories are absent.

GREEN: each panel has a status reason and no enabled action that implies service readiness.

### SET-M07: responsive and regression proof

RED characterization: Settings content has a bounded, scrollable category region and panel; 360x640 content and controls remain reachable.

GREEN gates:

- `npm.cmd run test:unit -- tests/unit/settings tests/unit/screens/settingsScreen.test.ts tests/unit/theme/settingsStore.test.ts tests/unit/theme/themeStore.test.ts`
- `npm.cmd run build`
- focused Playwright Settings journey at 390x844 and 360x640 after component GREEN.
- `git diff --check`

### SET-M08: fail-closed navigation remains actionable

RED: `mobile-shell.e2e.spec.ts::shell renders a fail-closed fallback when upstream ui components are disabled`

Observed failure: the fallback navigation is visible, but the persistent chat composer overlaps its hit area after the boot overlay leaves, so a real pointer click times out. Browser measurement confirmed the composer fixed layer at `z-index: 40`, the first attempted navigation layer at `z-index: 20`, and the composer content as the first `elementsFromPoint()` hit target.

GREEN: the fallback navigation owns an explicit positioned `z-index: 50` stacking context above the routed composer and below the boot loader. Playwright must complete a normal `locator.click()`; forced clicks are forbidden because they would bypass the receiving-events contract.

Upstream decision:

- ADOPT the CSS stacking model documented by MDN: a positioned element with a numeric `z-index` establishes an explicit local stacking order.
- ADOPT Playwright actionability as the regression oracle: the target must receive pointer events naturally.
- REJECT `{ force: true }` and synthetic event dispatch because both would hide the user-visible overlap.

Primary research:

- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/z-index
- https://playwright.dev/docs/actionability

## Human-visible proof

1. Open Settings from the mobile rail.
2. Traverse all twelve categories by touch and keyboard.
3. Save a provider key, select its model, close Settings, and send chat without reload.
4. Change preset and color mode and observe the shell/background update immediately.
5. Change chat scale/presentation, close Settings, reopen, and verify persistence.
6. Confirm runtime-dependent panels state exactly why they are unavailable and expose no fake enabled actions.

## Rollback

Remove only the seven new Settings components/registry and four new test files, then restore `SettingsScreen.vue` and its test to the pre-slice implementation. Store schemas and persisted keys remain backward compatible; no migration or destructive preference rewrite is introduced.

## Verification record

- Focused Settings/theme unit gate: 9 files / 28 tests PASS.
- Complete mobile unit gate: 64 files / 755 tests PASS.
- `npm.cmd run build`: PASS with Vue typecheck and Vite production bundle.
- Focused Settings E2E: 3/3 PASS.
- Complete mobile E2E: 15/15 PASS.
- `SET-M08` lifecycle: RED reproduced in the complete corpus, browser geometry and hit stack measured, focused GREEN 1/1, complete E2E GREEN 15/15.
- Visual proof inspected at 360x640 and 390x844 in light and settled dark Atlas states; no horizontal overflow or clipped Settings controls.
