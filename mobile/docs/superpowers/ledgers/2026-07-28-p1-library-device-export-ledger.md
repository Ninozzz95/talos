# P1 Library device-export execution ledger

Date: 2026-07-28
Subsystem: TALOS mobile UI + agent tools + Android native adapter
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED — automated gates complete; owner physical-device acceptance pending

Amendment 2026-07-28: local inspection proved that the installed Capacitor
Filesystem and Capawesome File Picker pins do not expose Android's
`ACTION_CREATE_DOCUMENT` contract. The planned path is therefore a narrow
AVM-owned Capacitor plugin, not `pickDirectory()` plus a fabricated child URI.

Amendment 2026-07-28: tool-label guard inspection found an adjacent established
regression: `generate_image` is executable but omitted from the "EVERY tool"
label/icon guard, so it falls back to its wire name and generic wrench. This is
added as a named regression in this slice because the same guard must expand
for `library_export`.

Amendment 2026-07-28: pre-closure security review found that Unicode bidi and
isolate controls survived the suggested-name boundary, and that a staging file
withdrawn while Android's picker was open could leave the newly created
destination empty. Both became permanent RED cases before the production
guards were changed. The established Vault ingestion ceiling is 10 MiB per
file, matching the native adapter's bounded `expectedBytes` contract.

## Exact ownership

Create:

- `mobile/src/services/saveVaultFileToDevice.ts`
- `mobile/src/lib/tools/libraryExportTools.ts`
- `mobile/tests/unit/services/saveVaultFileToDevice.test.ts`
- `mobile/tests/unit/tools/libraryExportTools.test.ts`
- `mobile/android/app/src/main/java/ai/talos/TalosFileExportPolicy.java`
- `mobile/android/app/src/main/java/ai/talos/TalosFileExportPlugin.java`
- `mobile/android/app/src/test/java/ai/talos/TalosFileExportPolicyTest.java`
- `mobile/docs/superpowers/research/2026-07-28-p1-library-device-export-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-library-device-export-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-library-device-export-ledger.md`

Modify:

- `mobile/android/app/src/main/java/ai/talos/MainActivity.java`
- `mobile/src/screens/ContextScreen.vue`
- `mobile/src/components/chat/TalosMobileChatMediaPanel.vue`
- `mobile/src/components/chat/TalosMobileStreamingReply.vue`
- `mobile/src/lib/tools/toolset.ts`
- `mobile/src/lib/tools/toolLabels.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/tests/unit/screens/contextScreen.test.ts`
- `mobile/tests/unit/chat/chatMediaPanel.test.ts`
- `mobile/tests/unit/chat/streamingUi.test.ts`
- `mobile/tests/unit/chat/chatController.test.ts`
- `mobile/tests/unit/tools/toolLabels.test.ts`
- `mobile/tests/e2e/mobile-chat-files.e2e.spec.ts`
- `mobile/docs/feature-parity.json`

Delete: none.

## Public symbols and compatibility

New TypeScript symbols:

- `TalosDeviceFileSaveInput`
- `TalosDeviceFileSaveResult`
- `TalosDeviceFileSaveRuntime`
- `saveTalosVaultFileToDevice(input, runtime?)`
- `talosSafeExportName(name)`
- `TalosLibraryExportCandidate`
- `TalosLibraryExportSources`
- `createTalosLibraryExportTools(sources)`
- `talosLibraryExportInstruction()`

New native symbols:

- `TalosFileExportPlugin`
- plugin name `TalosFileExport`
- method `saveFile`
- callback `saveFileResult`
- `TalosFileExportPolicy`
- `safeDisplayName`
- `safeMediaType`
- `trustedSource`
- `copy`

Extended stable contracts:

- `TalosToolsetDeps.saveVaultFileToDevice`
- tool name `library_export`
- tool icon names `download` and `image`

Stable compatibility:

- all existing Library, chat-media, viewer, open, attach, selection, deletion,
  share, and switch ids/events remain;
- Vault/repository schemas and private URIs remain;
- no Android storage permission is added;
- `openTalosVaultFileExternally()` remains the Open-With path and is not
  renamed into Save.

New UI hooks:

- `talos-library-save-<id>`
- `talos-library-save-grid-<id>`
- `talos-library-save-overlay-<id>`
- `talos-chat-media-save-<id>`
- `talos-chat-media-viewer-save`

## RED

Named service regressions:

- `saveVaultFileToDevice.test.ts::stages native bytes, verifies the copied byte count, and always removes cache`
- `saveVaultFileToDevice.test.ts::treats Android picker cancellation as cancellation, never success`
- `saveVaultFileToDevice.test.ts::fails closed on a native byte-count mismatch`
- `saveVaultFileToDevice.test.ts::allows only one system save operation at a time`
- `saveVaultFileToDevice.test.ts::uses an honest browser-started result off native`
- `saveVaultFileToDevice.test.ts::normalizes unsafe display names without losing the extension`
  also strips bidi/isolate controls instead of allowing a visually spoofed suffix

Named native regressions:

- `TalosFileExportPolicyTest::acceptsOnlyCanonicalFilesInsideTalosExportCache`
- `TalosFileExportPolicyTest::sanitizesSuggestedNamesAndMediaTypes`
- `TalosFileExportPolicyTest::copiesEveryByteAndReportsTheExactCount`
- `TalosFileExportPolicyTest::removesTheCreatedDestinationWhenThePostPickerSourceIsUntrusted`

Named tool regressions:

- `libraryExportTools.test.ts::exports by exact Library id and records verified evidence`
- `libraryExportTools.test.ts::resolves a unique case-insensitive exact filename`
- `libraryExportTools.test.ts::refuses missing and ambiguous references without reading bytes`
- `libraryExportTools.test.ts::reports picker cancellation as a non-success and forbids automatic retry`
- `libraryExportTools.test.ts::toolset hides export when Library context or write policy is off`
- `libraryExportTools.test.ts::toolset excludes uploaded files withdrawn from chat context`
- `chatController.test.ts::exports an existing Library file through a realistic natural-language tool round`

Named UI regressions:

- `chatMediaPanel.test.ts::saves the exact row bytes through the canonical device-export service`
- `chatMediaPanel.test.ts::keeps save available in the open viewer and reports cancellation honestly`
- `contextScreen.test.ts::offers Save to device in global list, grid, and viewers`
- `contextScreen.test.ts::passes the exact Vault bytes to device export`
- `streamingUi.test.ts::names image generation and device save without wire names`
- `toolLabels.test.ts::EVERY tool includes image generation and Library export labels/icons`
- `mobile-chat-files.e2e.spec.ts::downloads the same persisted bytes from chat media and global Library`
- the same E2E asserts the new global row action remains visible without
  document overflow at 320 × 568

Expected RED: service/tool/native classes do not exist, neither Library renders
a Save action, the controller cannot offer `library_export`, and image/export
tool labels/icons are absent.

RED commands:

```powershell
npm run test:unit -- tests/unit/services/saveVaultFileToDevice.test.ts tests/unit/tools/libraryExportTools.test.ts tests/unit/tools/toolLabels.test.ts tests/unit/chat/streamingUi.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/chat/chatController.test.ts
.\gradlew.bat testDebugUnitTest --tests ai.talos.TalosFileExportPolicyTest
npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts --grep "device"
```

## GREEN

- Implement the cache-staged, byte-counted Save-As service and web fallback.
- Implement and register the narrow native adapter.
- Add Save actions to every required Library presentation without changing
  existing actions.
- Add the exact-reference, consent-gated `library_export` tool and conditional
  prompt instruction.
- Expand labels/icons and their guard for both the new tool and the discovered
  `generate_image` regression.
- Update the context-vault parity evidence.
- Strip filename bidi/isolate controls at both TypeScript and Java boundaries,
  and delete a provider-created destination before rejecting a failed
  post-picker source recheck.

Focused GREEN commands are the RED commands above.

## Affected regression gates

```powershell
npm run test:unit -- tests/unit/services/saveVaultFileToDevice.test.ts tests/unit/tools/libraryExportTools.test.ts tests/unit/tools/toolLabels.test.ts tests/unit/tools/toolExecutor.test.ts tests/unit/tools/providerSchemaDialects.test.ts tests/unit/chat/streamingUi.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/chat/chatController.test.ts tests/unit/composables/useTalosMobileAttachments.test.ts tests/unit/services/talosVaultService.test.ts
.\gradlew.bat testDebugUnitTest
npm run typecheck
npm run build
npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts tests/e2e/mobile-shell.e2e.spec.ts
git diff --check
```

## Real path, security, rollback

- Browser E2E proves both Library surfaces produce the same suggested filename
  and persisted bytes through the web fallback.
- Controller unit journey exercises a realistic user request, provider tool
  call, local bytes, tool result, audit, and final answer.
- Android compilation and pure Java tests prove plugin registration/policy.
- Final owner checklist must exercise a physical Android Save-As picker for
  text, image, PDF, Office, and unknown binary files; compare hashes/sizes,
  cancel once, duplicate a name, choose internal storage, reload TALOS, and
  verify the exported file remains independently openable.
- ADB is unavailable in this environment (process exit `-1073741515`), so no
  physical-device claim will be made before owner execution.
- Rollback removes the UI/tool adapter and native registration. No data
  migration or rollback is required because private Vault bytes are unchanged
  and exported copies are user-owned external files.

## Upstream pin and decision

- Adapt Android `ACTION_CREATE_DOCUMENT` at target/compile SDK 36 and min SDK
  26 behind `TalosFileExportPlugin`.
- Retain Capacitor core/Android `8.4.2`, Filesystem `8.1.2`, and Capawesome File
  Picker `8.0.3`; add no dependency.
- Reject legacy external-storage writes, broad permissions, share-as-save, and
  unsupported tree-URI fabrication for the reasons recorded in the dossier.

## Closure evidence

Initial RED:

- selected Vitest command: 6 new behavioral failures with 72 adjacent tests
  still passing because the export service/tool/UI contracts did not exist;
- Android under the repo-local JDK 21 pin: 9 Java compilation failures for the
  missing `TalosFileExportPolicy`;
- security follow-up RED: 1/7 service failure for surviving bidi/isolate
  controls and 2/4 JVM failures for the same name case plus missing
  post-picker destination cleanup.

Fresh GREEN on 2026-07-28:

- selected affected unit matrix: 11 files, 135/135 tests;
- natural-language controller journey after mock-isolation hardening: 1/1
  focused test (32 unrelated cases skipped);
- `testDebugUnitTest`: `BUILD SUCCESSFUL`, including 4/4 export-policy JVM
  regressions and native plugin compilation;
- `npm run typecheck`: passed;
- `npm run build`: 3,210 modules, parity script 9/9, ledger valid, initial JS
  555,423/560,000 bytes and CSS 129,577/150,000 bytes;
- affected Playwright pair: 17/17 tests, including byte-identical downloads
  from both Library surfaces and 320 px overflow coverage;
- `git diff --check`: passed (line-ending notices only; no whitespace error).

Real-device acceptance remains deliberately open for the final owner checklist:
ADB cannot start in this environment (exit `-1073741515`), so no physical
Android Save-As, provider, duplicate-name, cancellation, or post-uninstall
claim is recorded here. This does not authorize a Claude ACK ticket.
