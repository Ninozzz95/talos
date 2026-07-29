# Execution ledger - P0 chat/global saved-link parity

Date: 2026-07-28  
Subsystem: TALOS mobile UI / Library evidence  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED (automated gates; physical Android proof remains in owner checklist)

## Exact ownership

Create:

- `mobile/src/components/talos/library/TalosMobileSavedLinkRow.vue`
- `mobile/tests/unit/library/TalosMobileSavedLinkRow.test.ts`
- `mobile/docs/superpowers/research/2026-07-28-p0-chat-library-saved-link-parity-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-chat-library-saved-link-parity-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-chat-library-saved-link-parity-ledger.md`

Modify:

- `mobile/src/screens/ContextScreen.vue`
- `mobile/src/components/chat/TalosMobileChatMediaPanel.vue`
- `mobile/tests/unit/screens/contextScreen.test.ts`
- `mobile/tests/unit/chat/chatMediaPanel.test.ts`

Delete: none.

## Public symbols

- New component `TalosMobileSavedLinkRow`.
- Props: `row`, `savedAtLabel`, `copyTestId`, `browserTestId`.
- Events: `openCopy`, `openBrowser`.
- Stable domain symbol: `TalosSavedLinkRow`.
- Existing global Library test IDs and browser/copy behavior stay stable.
- New chat hooks:
  `talos-chat-media-links`, `talos-chat-media-link-copy`,
  `talos-chat-media-link-open`.

## RED scenarios

1. `TalosMobileSavedLinkRow.test.ts::LINK-PARITY-01 renders title, host, date and two independent 48px actions`
   - Expected RED: component does not exist.
2. `TalosMobileSavedLinkRow.test.ts::LINK-PARITY-02 emits copy and browser destinations independently`
   - Expected RED: component does not exist.
3. `chatMediaPanel.test.ts::LINK-PARITY-03 renders chat web evidence as canonical links, not markdown files`
   - Expected RED: `Sources` tab contains a generic `MD` file row.
4. `chatMediaPanel.test.ts::LINK-PARITY-04 opens retained copy and original browser independently`
   - Expected RED: no browser action exists in the chat panel.
5. `contextScreen.test.ts::LINK-PARITY-05 global Library uses the shared saved-link row`
   - Expected RED: global markup is still inline.

## Focused and regression gates

```powershell
npx vitest run tests/unit/library/TalosMobileSavedLinkRow.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/chat/savedLinkRows.test.ts
npx vitest run tests/unit/library/TalosMobileLibraryFileRow.test.ts tests/unit/lib/vaultLibrary.test.ts tests/unit/services/inAppBrowserService.test.ts
npm run typecheck
npm run build
git diff --check
```

## Real path and human-visible proof

On Android, run a web search that saves multiple source links, reopen the chat,
open `Media > Links`, and compare the same address in global `Library > Links`.
Verify identical geometry/title/host/date, retained copy, system-browser open,
back navigation, reload persistence, and no `.md` file identity. Repeat with a
legacy transcript containing only a `Source:` header and with a deliberate
browser-open failure.

## Upstream pin and rollback

Primary sources and the adapt/reject decision are pinned in the paired research
dossier. No upstream package or protocol is integrated.

Rollback removes the shared row and restores only the two prior render blocks
and their tests. No storage, schema, URL-canonicalization, or migration change
exists.

## RED/GREEN evidence

Fresh RED:

```text
shared component suite: import failed because the component did not exist
surface set: 3 expected failures, 45 compatibility tests passed
chat exposed Sources (1) and a generic MD row
global link markup had no shared row hook
```

Fresh GREEN:

```text
focused shared row + chat/global surfaces + URL rows: 4 files, 50/50 passed
adjacent file-row, Vault and browser regressions: 3 files, 24/24 passed
npm run typecheck: passed
npm run build: passed; 3224 modules transformed
initial JavaScript: 556126 / 560000 bytes
initial CSS: 129477 / 150000 bytes
feature parity: 9/9 validator tests and ledger verification passed
git diff --check: passed (line-ending notices only)
```

Both surfaces now render the same title/host/date row and preserve separate
retained-copy and system-browser actions. Chat counts canonical visible links,
including multi-link dossiers, rather than backing `.md` files. The physical
browser, reload, legacy transcript, and 320/390px visual comparisons remain in
the final owner checklist.
