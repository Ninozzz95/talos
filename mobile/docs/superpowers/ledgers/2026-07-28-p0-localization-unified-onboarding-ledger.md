# P0 localization and unified onboarding execution ledger

Date: 2026-07-28  
Lane: `lane/kimi-mobile`  
Status: GREEN in automated gates; physical-device checklist remains for final APK

## Upstream pin

- `vue-i18n@11.4.8`, MIT,
  integrity `sha512-0ULeHP6Z9CGvAm67S77ZEp41cfGXIREGL8qfhos2BMgcQQewtQcDKuojt6jjasAD/S8GwfTp2ySPmDSpwvrCMQ==`
- existing `androidx.appcompat:appcompat:1.7.1`
- decision and primary sources:
  `docs/superpowers/research/2026-07-28-p0-localization-unified-onboarding-research.md`

## Exact ownership

Create:

- `mobile/src/i18n/contracts.ts`
- `mobile/src/i18n/index.ts`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/i18n/locales/it.ts`
- `mobile/src/lib/localizationPolicy.ts`
- `mobile/src/services/nativeLocale.ts`
- `mobile/src/services/profileMemory.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsLanguagePanel.vue`
- `mobile/android/app/src/main/java/ai/talos/TalosLocalePlugin.java`
- `mobile/android/app/src/main/java/ai/talos/TalosLocalePolicy.java`
- `mobile/android/app/src/test/java/ai/talos/TalosLocalePolicyTest.java`
- `mobile/android/app/src/main/res/xml/locales_config.xml`
- `mobile/android/app/src/main/res/values-it/strings.xml`
- `mobile/tests/unit/i18n/localization.test.ts`
- `mobile/tests/unit/i18n/localizationCoverage.test.ts`
- `mobile/tests/unit/services/profileMemory.test.ts`
- `mobile/tests/unit/settings/TalosMobileSettingsLanguagePanel.test.ts`
- `mobile/tests/e2e/mobile-localization-onboarding.e2e.spec.ts`
- `mobile/upstream/licenses/vue-i18n-11.4.8-MIT.txt`

Modify infrastructure, persistence and flow:

- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/main.ts`
- `mobile/src/App.vue`
- `mobile/src/stores/settings.ts`
- `mobile/src/stores/account.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/src/stores/stationFacades.ts`
- `mobile/src/repositories/chatRepository.ts`
- `mobile/src/repositories/memoryChatRepository.ts`
- `mobile/src/repositories/sqliteChatRepository.ts`
- `mobile/src/repositories/lazyChatRepository.ts`
- `mobile/src/lib/onboarding/setupProgress.ts`
- `mobile/src/components/intro/TalosMobileSetupIntro.vue`
- `mobile/src/components/talos/settings/settingsTabs.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsAccountPanel.vue`
- `mobile/tests/setup/jsdomShims.ts`
- `mobile/tests/unit/components/TalosMobileSetupIntro.test.ts`
- `mobile/tests/unit/onboarding/setupProgress.test.ts`
- `mobile/tests/unit/repositories/memoryChatRepository.test.ts`
- `mobile/tests/unit/repositories/sqliteChatRepository.test.ts`
- `mobile/tests/unit/stores/account.test.ts`
- `mobile/tests/unit/stores/settingsOnboarding.test.ts`
- `mobile/tests/unit/settings/settingsTabs.test.ts`
- `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
- `mobile/tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`
- `mobile/tests/e2e/mobile-f2-journeys.e2e.spec.ts`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/android/app/src/main/java/ai/talos/MainActivity.java`
- `mobile/android/app/src/main/res/values/strings.xml`
- `mobile/docs/upstream-provenance.md`

Modify user-visible localization surfaces:

- `mobile/src/App.vue`
- `mobile/src/components/brand/TalosBootLogo.vue`
- `mobile/src/screens/TasksScreen.vue`
- `mobile/src/screens/SettingsScreen.vue`
- `mobile/src/screens/RunsScreen.vue`
- `mobile/src/screens/ResearchScreen.vue`
- `mobile/src/screens/NotesScreen.vue`
- `mobile/src/screens/MemoryScreen.vue`
- `mobile/src/screens/DoctorScreen.vue`
- `mobile/src/screens/ContextScreen.vue`
- `mobile/src/screens/ChatsScreen.vue`
- `mobile/src/screens/ChatScreen.vue`
- `mobile/src/components/security/TalosMobileLockScreen.vue`
- `mobile/src/components/chat/TalosMobileAttachmentTray.vue`
- `mobile/src/components/chat/TalosMobileBrowserActivity.vue`
- `mobile/src/components/chat/TalosMobileBrowserInteractiveFrame.vue`
- `mobile/src/components/chat/TalosMobileBrowserScreenshotEvidence.vue`
- `mobile/src/components/chat/TalosMobileChatMediaPanel.vue`
- `mobile/src/components/chat/TalosMobileComposer.vue`
- `mobile/src/components/chat/TalosMobileComposerDrawer.vue`
- `mobile/src/components/chat/TalosMobileComposerModelPicker.vue`
- `mobile/src/components/chat/TalosMobileComposerSheet.vue`
- `mobile/src/components/chat/TalosMobileEffortPicker.vue`
- `mobile/src/components/chat/TalosMobileEnhancerDrawer.vue`
- `mobile/src/components/chat/TalosMobileMessageActions.vue`
- `mobile/src/components/chat/TalosMobileMessageContent.vue`
- `mobile/src/components/chat/TalosMobileMessageImage.vue`
- `mobile/src/components/chat/TalosMobileMessageList.vue`
- `mobile/src/components/chat/TalosMobileMessageOverflowMenu.vue`
- `mobile/src/components/chat/TalosMobileModelEffortDrawer.vue`
- `mobile/src/components/chat/TalosMobilePromptEnhancerPopover.vue`
- `mobile/src/components/chat/TalosMobileReasoningBlock.vue`
- `mobile/src/components/chat/TalosMobileRunningToolRow.vue`
- `mobile/src/components/chat/TalosMobileSessionExportSheet.vue`
- `mobile/src/components/chat/TalosMobileSlashCommandMenu.vue`
- `mobile/src/components/chat/TalosMobileSourcesChip.vue`
- `mobile/src/components/chat/TalosMobileStatusMessage.vue`
- `mobile/src/components/chat/TalosMobileStreamingReply.vue`
- `mobile/src/components/chat/TalosMobileToolConsentSheet.vue`
- `mobile/src/components/chat/TalosMobileTraceRow.vue`
- `mobile/src/components/shell/TalosAdaptiveSurface.vue`
- `mobile/src/components/shell/TalosMobileChatOptionsMenu.vue`
- `mobile/src/components/shell/TalosMobileConfirmDialog.vue`
- `mobile/src/components/shell/TalosMobileDeleteChatDialog.vue`
- `mobile/src/components/shell/TalosMobileHeader.vue`
- `mobile/src/components/shell/TalosMobileImmersiveChrome.vue`
- `mobile/src/components/shell/TalosMobileNewChatFab.vue`
- `mobile/src/components/shell/TalosMobileScreen.vue`
- `mobile/src/components/shell/TalosMobileSidebar.vue`
- `mobile/src/components/shell/TalosMobileToolSheet.vue`
- `mobile/src/components/shell/TalosMobileToastRegion.vue`
- `mobile/src/components/shell/TalosTabletDivider.vue`
- `mobile/src/components/shell/TalosTabletSidebar.vue`
- `mobile/src/components/ui/dialog/DialogContent.vue`
- `mobile/src/components/ui/dialog/DialogFooter.vue`
- `mobile/src/components/ui/dialog/DialogScrollContent.vue`
- `mobile/src/components/talos/library/TalosMobileLibraryFileRow.vue`
- `mobile/src/components/talos/library/TalosMobileSavedLinkRow.vue`
- `mobile/src/components/talos/models/TalosMobileModelAdvancedOptions.vue`
- `mobile/src/components/talos/models/TalosMobileModelCatalog.vue`
- `mobile/src/components/talos/models/TalosMobileProviderRuntimePanel.vue`
- `mobile/src/components/talos/settings/TalosLauncherIconDialog.vue`
- `mobile/src/components/talos/settings/TalosMobileAppLockModal.vue`
- `mobile/src/components/talos/settings/TalosMobilePinInput.vue`
- `mobile/src/components/talos/settings/TalosMobileSearchSourcePanel.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsAppearancePanel.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsBrowserPanel.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsCapabilityPanel.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue`
- `mobile/src/components/talos/settings/TalosMobileVoiceSettings.vue`
- `mobile/src/components/talos/ui/TalosThemedSelect.vue`
- `mobile/src/lib/chat/providerErrors.ts`
- `mobile/src/lib/diagnostics/doctorSections.ts`
- `mobile/src/lib/mobileCommandRegistry.ts`
- `mobile/src/lib/permissions/permissionRows.ts`
- `mobile/src/lib/relativeTime.ts`
- `mobile/src/lib/search/searchSources.ts`
- `mobile/src/lib/sessionActionRunner.ts`
- `mobile/src/lib/talosMessageMarkdown.ts`
- `mobile/src/lib/tone.ts`

Delete superseded second wizard and its dedicated tests:

- `mobile/src/components/onboarding/TalosMobileAccountWizard.vue`
- `mobile/src/components/onboarding/wizard/WizardWelcome.vue`
- `mobile/src/components/onboarding/wizard/WizardIdentity.vue`
- `mobile/src/components/onboarding/wizard/WizardPersonalize.vue`
- `mobile/src/components/onboarding/wizard/WizardProtect.vue`
- `mobile/src/components/onboarding/wizard/WizardSignIn.vue`
- `mobile/src/components/onboarding/wizard/WizardDone.vue`
- `mobile/src/components/onboarding/wizard/wizardSteps.ts`
- `mobile/src/composables/useTalosAccountWizard.ts`
- `mobile/src/composables/useTalosMobileWizardState.ts`
- `mobile/src/lib/wizardInjection.ts`
- `mobile/tests/unit/composables/useTalosAccountWizard.test.ts`
- `mobile/tests/unit/composables/useTalosMobileWizardState.test.ts`
- `mobile/tests/unit/onboarding/TalosMobileAccountWizard.test.ts`
- `mobile/tests/unit/onboarding/wizardStepComponents.test.ts`
- `mobile/tests/unit/onboarding/wizardSteps.test.ts`
- `mobile/tests/e2e/mobile-account-wizard.e2e.spec.ts`

Inspection showed that the legacy wizard E2E asserts only the superseded
second fullscreen state machine. It is therefore removed with that machine and
replaced by the unified localization/onboarding E2E already owned above.

No other product file is owned. If a previously hidden user-facing source is
discovered, amend this exact list and record the reason before editing it.

Ledger amendment, 2026-07-28: the compiler-AST localization coverage gate
discovered three previously omitted static accessibility/chrome sources:
`App.vue` (`Primary` landmark), `TalosBootLogo.vue` (loading label), and
`DialogFooter.vue` (mobile close action). They are now explicitly owned before
their first localization edit; no subsystem boundary changed.

Ledger amendment, 2026-07-28: the post-template runtime audit found generated
English in `talosMessageMarkdown.ts`, `TalosMobileMessageContent.vue`,
`toolLabels.ts`, and `TalosMobileStreamingReply.vue`. Those product files were
already owned above, but their focused regression files were not. Add exact
ownership of:

- `mobile/tests/unit/chat/talosMessageMarkdown.test.ts`
- `mobile/tests/unit/chat/markdownBlockCache.test.ts`
- `mobile/tests/unit/chat/TalosMobileMessageContent.test.ts`
- `mobile/tests/unit/tools/toolLabels.test.ts`

The renderer cache key must include the localized render contract so changing
language cannot reuse HTML generated for the previous locale.

Ledger amendment, 2026-07-29: the first fresh production build failed the
existing initial-JavaScript gate at 614147/560000 bytes. Inspection showed that
direct `useI18n` imports collapsed the dynamically imported upstream runtime
back into the static entry graph. Preserve the research/design decision to
adapt `vue-i18n@11.4.8` behind the AVM-owned localization boundary by adding:

- public `useTalosI18n`
- `mobile/tests/unit/i18n/localizationImportBoundary.test.ts`

All already-owned localized Vue surfaces above switch mechanically from the
upstream import to this adapter. The new gate rejects any future product import
of `vue-i18n`; only `mobile/src/i18n/index.ts` may dynamically import it. The
560000-byte product budget remains unchanged.

Ledger amendment, 2026-07-29: the later complete unit gate exposed four stale
localization-era conformance assertions. Before any gate edit, add exact
ownership of:

- create
  `mobile/docs/superpowers/research/2026-07-29-p0-localization-conformance-closure-research.md`;
- modify `mobile/tests/unit/router/routeWiring.test.ts`;
- modify `mobile/upstream/desktop-ported-libs-manifest.json`;
- modify `mobile/upstream/shadcn-vue-2.8.0-manifest.json`;
- modify `mobile/tests/unit/upstream/shadcnConformance.test.ts`;
- modify `mobile/docs/upstream-provenance.md`.

The structured complete-suite report then exposed two additional stale test
contracts. Before their first edit, also modify:

- `mobile/tests/unit/chat/composerIconButtons.test.ts`;
- `mobile/tests/unit/chat/TalosMobileMessageList.calm.test.ts`.

Public metadata contract:

- `shadcn-vue-2.8.0-manifest.json` advances to `schema_version: 2`;
- add a closed `adaptations` array with
  `destination`, `upstream_sha256`, `accepted_sha256`, `reason`, and
  `research`;
- retain every original generated file `sha256` as immutable upstream
  evidence;
- `desktop_reconciled_revision: 76a0aa9` remains stable.

Named permanent scenarios:

- `I18N-CONFORMANCE-01 route characterization survives locale copy changes`;
- `I18N-CONFORMANCE-02 route warming starts only after the i18n-enabled app
  mount`;
- `I18N-CONFORMANCE-03 the localized Markdown fork is consciously pinned`;
- `I18N-CONFORMANCE-04 shadcn upstream and TALOS adaptation hashes are both
  enforced`;
- `I18N-CONFORMANCE-05 unknown, duplicate, orphan or malformed shadcn
  adaptations fail closed`.
- `I18N-CONFORMANCE-06 composer icon geometry follows the stable locale key,
  not frozen English copy`;
- `I18N-CONFORMANCE-07 the real lazy streaming loader resolves before
  assertion and no async import survives jsdom teardown`.

Observed RED:

- `routeWiring.test.ts`: 2/2 failed on the removed English welcome copy and
  the old exact plugin chain;
- `desktopPortedConformance.test.ts`: 1 conformance scenario failed on
  `talosMessageMarkdown.ts`;
- `shadcnConformance.test.ts`: 1 conformance scenario failed first on
  `DialogContent.vue`; a complete hash audit also found the two intended
  localized siblings `DialogFooter.vue` and `DialogScrollContent.vue`.
- `composerIconButtons.test.ts`: the product still used the required ghost
  button and 44 px target, but the source parser found zero controls after
  `aria-label="Add to chat"` became `:aria-label="$t('chat.addToChat')"`;
- `TalosMobileMessageList.calm.test.ts`: the immediate assertion ran before
  `TalosMobileStreamingReply` resolved and the other cases left five async
  Markdown imports alive after environment teardown.

Focused GREEN command:

```powershell
npx vitest run tests/unit/chat/composerIconButtons.test.ts tests/unit/chat/TalosMobileMessageList.calm.test.ts tests/unit/router/routeWiring.test.ts tests/unit/upstream/desktopPortedConformance.test.ts tests/unit/upstream/shadcnConformance.test.ts
```

Affected regression gates: localization catalog/coverage/import-boundary,
Markdown renderer/cache, dialog consumers, production build, typecheck, route
E2E and complete unit suite. Human proof remains locale switching plus dialog
close announcements in English and Italian, followed by navigation after the
shell becomes interactive. Rollback restores only these test/provenance
contracts; it must never restore English-only product labels.

## Public symbols

Add:

- `TalosLocaleMode`
- `TalosSupportedLocale`
- `TALOS_SUPPORTED_LOCALES`
- `TALOS_INTRO_LANGUAGE_PAGE_ENABLED`
- `resolveTalosLocale`
- `createTalosI18n`
- `talosT`
- `setTalosLocaleMode`
- `useTalosLocalization`
- `useTalosI18n`
- `TalosLocalePlugin.getState`
- `TalosLocalePlugin.setMode`
- `TalosChatRepository.upsertMemory`
- `upsertTalosDisplayNameMemory`
- `TalosStationFacades.memories.upsertDisplayName`

Stable:

- `TalosMobileSetupIntro`
- `useTalosMobileIntroState`
- `TalosAccountStore.setDisplayName`
- all existing route names, test ids, settings persistence and repository rows
  not explicitly superseded above

Remove:

- the `TalosMobileAccountWizard` public surface and
  `TALOS_MOBILE_WIZARD_KEY`; Settings replay points to the unified intro.

## RED scenarios

- `I18N-01 it-IT resolves to a complete Italian catalog before mount`
- `I18N-02 unsupported/corrupt locale falls back to English`
- `I18N-03 language preference persists and system mode resets Android locale`
- `I18N-04 catalog key trees and interpolation variables are identical`
- `I18N-05 supported UI templates contain no uncovered English chrome`
- `I18N-06 generated Markdown semantics and copy feedback follow the live locale`
- `I18N-07 tool activity labels follow the live locale without translating wire names`
- `I18N-09 the upstream i18n runtime stays behind one dynamic AVM adapter`
- `ONBOARD-UNIFIED-01 language is the first reversible page`
- `ONBOARD-UNIFIED-02 workspace name is in the same modal`
- `ONBOARD-UNIFIED-03 name creates exactly one global untrusted memory`
- `ONBOARD-UNIFIED-04 replay/name change updates that memory idempotently`
- `ONBOARD-UNIFIED-05 memory failure is visible and retryable`
- `ONBOARD-UNIFIED-06 old second wizard cannot mount`
- `ANDROID-LOCALE-01 only system/en/it are accepted`
- `ANDROID-LOCALE-02 Android advertises exactly en and it`

Initial RED:

```powershell
npx vitest run tests/unit/i18n/localization.test.ts tests/unit/services/profileMemory.test.ts tests/unit/components/TalosMobileSetupIntro.test.ts tests/unit/settings/TalosMobileSettingsLanguagePanel.test.ts
```

Expected: missing localization/profile modules and first language/identity pages.

RED established on 2026-07-28:

- localization policy/catalog suite failed at missing owned modules;
- profile-memory suite failed at missing owned service;
- Language Settings panel suite failed at missing owned component;
- the existing intro suite kept 13/13 compatibility scenarios green while the
  new first-language-page scenario failed because the story still mounted
  first.

## Focused GREEN and regressions

```powershell
npx vitest run tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts tests/unit/services/profileMemory.test.ts tests/unit/components/TalosMobileSetupIntro.test.ts tests/unit/onboarding/setupProgress.test.ts tests/unit/repositories/memoryChatRepository.test.ts tests/unit/repositories/sqliteChatRepository.test.ts tests/unit/stores/account.test.ts tests/unit/stores/settingsOnboarding.test.ts tests/unit/settings/settingsTabs.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts tests/unit/settings/TalosMobileSettingsLanguagePanel.test.ts tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts
npx playwright test tests/e2e/mobile-localization-onboarding.e2e.spec.ts tests/e2e/mobile-f2-journeys.e2e.spec.ts
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:testDebugUnitTest :app:processDebugResources :app:compileDebugJavaWithJavac
npm run typecheck
npm run build
git diff --check
```

## Human-visible proof

- fresh Italian device: first frame and first intro page are Italian;
- choose English and Italian; every open station and Settings page updates
  immediately with no mixed-language chrome;
- choose System, restart, and confirm the system language wins;
- enter a Unicode name, finish setup, open Memory and see one global active
  display-name memory;
- replay with the same and then a different name: still one memory;
- app language appears in Android Settings with only English and Italian;
- unsupported system locale falls back cleanly to English;
- hardware Back, Skip, reload, PIN and provider flows retain behavior.

## Rollback

Remove only the owned adapter/catalog/native resources and restore the previous
intro plus replay wizard files. Locale and profile-memory preferences are
non-secret and additive; an older build ignores them. The deterministic memory
row can remain as ordinary untrusted user memory or be deleted explicitly by
the user from Memory.

## Closure evidence

Fresh 2026-07-29 evidence:

- focused localization/onboarding/repository/chat regression: 20 files,
  169 tests passed;
- production build, parity validator and initial-graph contract passed:
  558343/560000 JavaScript bytes and 129575/150000 CSS bytes;
- Android locale policy/resources/Java compilation passed through
  `:app:testDebugUnitTest`, `:app:processDebugResources` and
  `:app:compileDebugJavaWithJavac`;
- unified first-run/account replay/app-lock E2E: 7/7 passed;
- system `it-IT` → explicit English → System → reload E2E: 1/1 passed;
- `vue-tsc -b --force` passed.

The first browser attempt was invalid because `vite preview` served a stale
pre-localization `dist`. A fresh production build reproduced the intended
bundle and made both previously failing flows green. The fresh build then
exposed one store-owned English send-disabled reason; `I18N-09` and the locale
E2E now permanently cover that runtime class.

Conformance closure evidence, 2026-07-29:

- the five originally failing test files are 16/16 green;
- localization/Markdown/route/provenance regressions are 17 files,
  110/110 green;
- shadcn schema v2 preserves all 24 original upstream hashes and separately
  gates the three reviewed localized dialog adaptations;
- the complete unit gate evaluated 258 files: 2,180 tests passed, 5 declared
  skips, 0 failures and 0 unhandled async errors;
- typecheck and `git diff --check` pass.

Final-gate amendment, 2026-07-29: the complete Playwright run exposed one
stale English-copy oracle in two viewport scenarios. Before editing it, add
exact ownership of:

- modify `mobile/tests/e2e/mobile-composer-state.e2e.spec.ts`.

Named permanent scenario:

- `I18N-CONFORMANCE-08 the persisted reasoning-effort title uses the localized
  display label, not the internal lowercase wire value`.

Observed RED:

- 69/71 Playwright scenarios passed;
- both failures received the correct persisted medium state and localized
  `Effort: Medium` title, while the stale assertion expected the pre-i18n raw
  string `Effort: medium`.

Decision: adapt the existing E2E oracle to the catalog-owned English display
label. Do not revert the localized product control to a wire-format value.
Focused GREEN is the two-scenario composer-state spec, followed by the complete
Playwright suite.

Final GREEN:

- composer-state focused E2E: 2/2 passed;
- complete Playwright: 71/71 passed;
- no product copy or runtime behavior changed for this conformance closure.
