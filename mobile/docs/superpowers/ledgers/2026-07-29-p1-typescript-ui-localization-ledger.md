# P1 TypeScript UI localization execution ledger

Date: 2026-07-29  
Subsystem: TALOS mobile UI/application boundary  
Lane: `lane/kimi-mobile`

Research:
`docs/superpowers/research/2026-07-29-p1-typescript-ui-localization-research.md`

Design:
`docs/superpowers/specs/2026-07-29-p1-typescript-ui-localization-design.md`

Upstream decision: **ADAPT** pinned `vue-i18n@11.4.8` through the existing
AVM-owned `@/i18n` boundary. Do not translate wire/model/diagnostic contracts.

## Exact ownership

Create:

- `src/i18n/uiErrors.ts`
- `tests/helpers/talosTestI18n.ts`
- `tests/unit/i18n/typescriptUiLocalization.test.ts`
- `tests/unit/chat/providerErrors.test.ts`

Modify:

- `src/i18n/contracts.ts`
- `src/i18n/index.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/it.ts`
- `src/composables/useTalosMobileAttachments.ts`
- `src/composables/useTalosMobileComposerDraft.ts`
- `src/lib/sessionActionRunner.ts`
- `src/lib/chat/chatCompletion.ts`
- `src/lib/chat/providerErrors.ts`
- `src/lib/chat/providerRegistry.ts`
- `src/lib/chat/promptEnhancement.ts`
- `src/services/appLock.ts`
- `src/services/secureKeyStore.ts`
- `src/stores/chat.ts`
- `src/stores/chatController.ts`
- `src/App.vue`
- `src/screens/ChatScreen.vue`
- `src/components/talos/models/TalosMobileModelAdvancedOptions.vue`
- `src/components/talos/models/TalosMobileModelCatalog.vue`
- `src/components/talos/models/TalosMobileProviderRuntimePanel.vue`
- `src/components/talos/settings/TalosMobileAppLockModal.vue`
- `scripts/verify-initial-chunk.mjs`
- `tests/unit/build/initialChunkContract.test.ts`
- `tests/unit/i18n/localizationCoverage.test.ts`
- `tests/unit/i18n/localization.test.ts`
- `tests/unit/composables/useTalosMobileAttachments.test.ts`
- `tests/unit/composables/deleteVaultFilesInBulk.test.ts`
- `tests/unit/composables/useTalosMobileComposerDraft.test.ts`
- `tests/unit/chat/sessionActionRunner.test.ts`
- `tests/unit/chat/chatStore.test.ts`
- `tests/unit/chat/chatStoreStreaming.test.ts`
- `tests/unit/chat/toolContract.test.ts`
- `tests/unit/chat/chatController.test.ts`
- `tests/unit/chat/chatCompletion.test.ts`
- `tests/unit/chat/chatCompletionStreaming.test.ts`
- `tests/unit/chat/providerRegistry.test.ts`
- `tests/unit/chat/promptEnhancement.test.ts`
- `tests/unit/services/appLock.test.ts`
- `tests/unit/services/secureKeyStore.test.ts`

Delete: none.

If inspection proves that a listed consumer already wraps every reachable
error in catalog copy, amend the ledger before omitting it.

## Public symbols

Create:

- `TalosTranslate`
- `TalosMessageParameters`
- `TalosTranslatableError`
- `talosTranslatableErrorMessage(error, translate)`

Extend without breaking existing identities:

- `TalosMobileAttachmentsOptions.translate`
- `TalosMobileComposerDraftOptions.translate`
- `ChatStoreOptions.translate`
- `ChatControllerDeps.translate`
- `TalosMobileProviderError.uiMessageKey`
- `TalosMobileProviderError.uiMessageParameters`
- `ChatConfigError.uiMessageKey`
- `ChatConfigError.uiMessageParameters`
- `TalosMobilePromptEnhancementError.uiMessageKey`
- `TalosMobilePromptEnhancementError.uiMessageParameters`

Compatibility symbols and provider/tool/schema names remain stable.

## RED scenarios

- `I18N-TS-01 attachment and draft errors follow the injected Italian locale`
- `I18N-TS-02 chat storage and fault recovery copy follows Italian`
- `I18N-TS-03 controller toasts, consent and model probes follow Italian`
- `I18N-TS-04 typed provider/configuration/enhancer errors resolve through the catalog`
- `I18N-TS-05 PIN and provider-key validation keep stable codes and localized UI`
- `I18N-TS-06 the coverage gate catches direct prose in registered TypeScript UI emitters`
- `I18N-TS-07 protocol/model/tool/diagnostic strings remain unchanged`
- `I18N-TS-08 optional launcher-icon dialog stays outside the initial graph`

Expected RED: Italian assertions currently receive English sentences and the
TypeScript coverage fixture reports the known direct prose.

Build-budget amendment: the first GREEN implementation made the existing
production budget fail at 562,034 / 560,000 bytes. `I18N-TS-08` first
characterizes the optional launcher dialog as a required dynamic boundary;
`src/App.vue` will retain the controller eagerly but render the async dialog
only for a pending launcher-icon decision. This replaces the invalid planned
assumption that moving catalog prose alone would keep the entry graph under
budget.

## GREEN commands

Focused:

```powershell
npx vitest run tests/unit/i18n/typescriptUiLocalization.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts tests/unit/composables/useTalosMobileAttachments.test.ts tests/unit/composables/deleteVaultFilesInBulk.test.ts tests/unit/composables/useTalosMobileComposerDraft.test.ts tests/unit/chat/sessionActionRunner.test.ts tests/unit/chat/chatCompletion.test.ts tests/unit/chat/providerErrors.test.ts tests/unit/chat/promptEnhancement.test.ts tests/unit/services/appLock.test.ts tests/unit/services/secureKeyStore.test.ts
```

Affected:

```powershell
npx vitest run tests/unit/chat/chatStore.test.ts tests/unit/chat/chatStoreStreaming.test.ts tests/unit/chat/chatController.test.ts tests/unit/settings tests/unit/components
npm run typecheck
npm run build
npx playwright test tests/e2e/mobile-localization-onboarding.e2e.spec.ts tests/e2e/mobile-provider-model-refresh.e2e.spec.ts tests/e2e/mobile-chat-files.e2e.spec.ts
git diff --check
```

## Real-upstream and human-visible gates

- production app uses the pinned real Vue I18n composer, not a mock;
- switch Settings language to Italian without restarting;
- force an attachment validation error, a failed draft write, a missing model
  probe prerequisite and an invalid PIN;
- confirm visible chrome is Italian while error codes in Doctor/export evidence
  and provider/tool protocol payloads remain canonical;
- switch back to English and repeat one path.

Device/manual proof is required before the final Claude ACK ticket.

## Fresh automated evidence

- Focused localization/composable/provider/security gate: 13 files, 69 tests
  passed.
- Affected chat/settings/component gate: 19 files, 162 tests passed.
- Initial-graph contract, including `I18N-TS-08`: 13 tests passed.
- Launcher icon controller/dialog/plan regression gate: 3 files, 15 tests
  passed.
- `npm run typecheck`: passed.
- `npm run build`: passed with exit code 0; 3,240 modules transformed,
  555,034 / 560,000 initial JavaScript bytes, 132,986 / 150,000 initial CSS
  bytes, parity 9/9.
- Localization, provider refresh and chat-file Playwright gate: 6/6 passed.
- `git diff --check`: passed; only pre-existing CRLF conversion warnings were
  emitted.

No physical-device provider failure, locale-switch or launcher-dialog timing
claim is made. Those remain in the owner checklist and block the final Claude
ACK ticket.

## Rollback

Revert only the files listed in this ledger. No schema migration or stored user
content is changed. Catalog keys can be removed together with their call sites;
stable error codes and existing persisted records remain readable.
