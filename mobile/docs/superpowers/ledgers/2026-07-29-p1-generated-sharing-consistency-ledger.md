# Execution ledger - P1 generated-file sharing consistency

Date: 2026-07-29  
Subsystem: TALOS mobile UI / agent Library tools  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED (automated; physical-device/provider gate remains for owner)  
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-p1-generated-sharing-consistency-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-p1-generated-sharing-consistency-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-p1-generated-sharing-consistency-ledger.md`

Modify:

- `mobile/src/components/chat/TalosMobileChatMediaPanel.vue`
- `mobile/src/lib/tools/toolset.ts`
- `mobile/tests/unit/chat/chatMediaPanel.test.ts`
- `mobile/tests/unit/tools/libraryExportTools.test.ts`

Delete:

- none

## Public symbols and compatibility

- no public symbol, prop, event, tool name, schema, or metadata field changes;
- preserve `TalosMobileChatMediaPanel.setShared`,
  `isTalosLibraryFileShared`, `createTalosToolset`,
  `library_list`, `library_search`, `library_read`, and `library_export`;
- preserve absent-flag compatibility, per-file write serialization, generated
  provenance, and manual file actions.

## RED scenarios

1. `LIB-SHARE-01 generated rows expose the controlled global-read checkbox and
   persist its requested value`.
2. `LIB-SHARE-02 a generated row with library_shared=false visibly renders
   private and unchecked`.
3. `LIB-SHARE-03 library_export excludes a withdrawn generated file before
   decrypted-byte or Save-As access`.
4. Existing generated search/read withdrawal, uploaded sharing, persistence
   metadata merge, ambient-injection exclusion, menu accessibility, manual
   Save, and positive generated export paths remain green.

Expected pre-fix failures:

- a generated row has no share action and renders the obsolete no-reread copy;
- generated `library_shared=false` remains an export candidate and reaches
  bytes/Save-As.

## Focused GREEN commands

```powershell
npx vitest run tests/unit/chat/chatMediaPanel.test.ts tests/unit/tools/libraryExportTools.test.ts
npx vitest run tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/services/vaultLibrarySharing.test.ts tests/unit/lib/libraryContext.test.ts tests/unit/library/TalosMobileLibraryActionsMenu.test.ts tests/unit/services/saveVaultFileToDevice.test.ts
npm run typecheck
npm run build
git diff --check -- src/components/chat/TalosMobileChatMediaPanel.vue src/lib/tools/toolset.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/tools/libraryExportTools.test.ts docs/superpowers/research/2026-07-29-p1-generated-sharing-consistency-research.md docs/superpowers/specs/2026-07-29-p1-generated-sharing-consistency-design.md docs/superpowers/ledgers/2026-07-29-p1-generated-sharing-consistency-ledger.md
```

## Real-upstream and human-visible gate

On the physical Android build:

- generate one document and one image in a chat;
- verify each per-chat row shows a checked global-read item;
- turn each off and reopen the panel to verify persistence;
- ask in another chat to list, read, and export each withdrawn file and verify
  no content/picker appears;
- manually attach and manually save one withdrawn file to prove direct human
  actions still work;
- turn access back on and verify explicit natural-language discovery succeeds;
- confirm no generated file is injected into an unrelated ordinary prompt.

Automation proves exact policy predicates and UI wiring but does not substitute
for the real provider, encrypted Vault, native picker, and owner timing gate.

## Rollback

Revert only the two product files and two test files listed above, then remove
these three task documents. No data migration or stored metadata rewrite is
required.

## RED evidence

Fresh pre-fix command on 2026-07-29:

```text
npx vitest run tests/unit/chat/chatMediaPanel.test.ts tests/unit/tools/libraryExportTools.test.ts

2 test files failed
3 expected consistency tests failed
30 compatibility tests passed
```

Observed boundaries:

- `LIB-SHARE-01`: a default-shared generated row had no checkbox;
- `LIB-SHARE-02`: a withdrawn generated row had no controlled private state;
- `LIB-SHARE-03`: a generated row with `library_shared=false` exported
  successfully instead of being unavailable.

The positive upload, menu, viewer, manual save, consent, and generated-export
compatibility scenarios remained green. Product implementation may begin.

## GREEN evidence

Fresh post-fix evidence on 2026-07-29:

```text
focused media/export matrix: 2 files, 33/33 passed
discovery/persistence/context/menu/manual-save regressions: 5 files, 35/35 passed
vue-tsc typecheck: passed
Vite production build: passed, 3,239 modules
initial JavaScript: 559,957 / 560,000 bytes
initial CSS: 132,986 / 150,000 bytes
feature parity: 9/9
Playwright mobile chat-file lifecycle: 3/3 passed
git diff --check (exact owned files): passed
```

The closed contract now proves:

- uploaded and generated per-chat rows expose the same controlled sharing
  state;
- absent metadata remains shared and explicit false visibly remains private;
- a generated toggle writes through the existing metadata-preserving service;
- withdrawn generated files are absent from export candidates before byte
  access and native Save-As;
- allowed generated files still export successfully;
- generated search/read already honor the same predicate;
- direct human save, attach, open, delete, menu focus, persistence, and narrow
  viewport flows remain green;
- automatic ambient injection of generated output remains unchanged and off.

No real provider key, physical encrypted Vault, or Android picker was used by
automation. The owner's physical-device checklist remains mandatory before a
Claude ACK ticket may be created.
