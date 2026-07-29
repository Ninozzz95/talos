# Execution ledger - P0 composite tool permissions

Date: 2026-07-28

Subsystem: TALOS mobile security and tool authorization.

Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`

Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

Status: CLOSED - automated gates green; physical consent path remains in the
owner checklist.

## Exact ownership

Create:

1. `mobile/docs/superpowers/research/2026-07-28-p0-composite-tool-permissions-research.md`
2. `mobile/docs/superpowers/specs/2026-07-28-p0-composite-tool-permissions-design.md`
3. `mobile/docs/superpowers/ledgers/2026-07-28-p0-composite-tool-permissions-ledger.md`

Modify:

4. `mobile/src/lib/tools/registry.ts`
5. `mobile/src/lib/tools/executor.ts`
6. `mobile/src/lib/tools/toolset.ts`
7. `mobile/src/lib/search/webTools.ts`
8. `mobile/src/stores/chatController.ts`
9. `mobile/src/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue`
10. `mobile/tests/unit/tools/toolExecutor.test.ts`
11. `mobile/tests/unit/search/webTools.test.ts`
12. `mobile/tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`
13. `mobile/tests/unit/chat/chatController.test.ts`

Delete: none.

Amendment, 2026-07-28: the affected-regression run proved that
`WEB-LIB-07` intentionally exercises a successful web-plus-Library journey but
enabled only outbound permission. The fixture must explicitly allow both
capabilities under the repaired contract. No product behavior is changed by
this test-fixture amendment.

R4 amendment, 2026-07-28:

Create:

14. `mobile/tests/unit/images/imageTools.test.ts`

Modify:

15. `mobile/src/lib/images/imageTools.ts`
16. `mobile/src/lib/tools/libraryExportTools.ts`
17. `mobile/tests/unit/tools/libraryExportTools.test.ts`

The R4 review found that `generate_image` still declared only `write` despite
performing a provider network call, while `library_export` declared only
`write` despite reading decrypted private bytes. The existing central compound
permission contract is correct; these two tool declarations and permanent
offer/execution regression cases are missing.

Regression-fixture amendment: `P2-FILENAME-04` is an intentionally successful
realistic image-provider round. It previously enabled only `write`; under the
corrected contract it must explicitly enable `outbound` as well. This is test
setup alignment, not a relaxation of product policy.

## Public symbols

Stable:

- `TalosToolDefinition.action`
- `executeTalosTool`
- `createTalosToolset`
- `createTalosWebTools`
- `TalosToolConsentRequest`
- `TalosToolAuditRow`

Add:

- `TalosToolDefinition.requiredActions`
- `talosToolRequiredActions(tool)`
- `TalosToolConsentRequest.actions`
- `TalosToolAuditRow.requiredActions`

No schema, migration, provider wire contract, or Android manifest symbol changes.

## RED scenarios

1. `mobile/tests/unit/tools/toolExecutor.test.ts::P0-CAP-01 deny on any required action blocks before the tool body`
   - Expected RED: a compound outbound/write tool runs with
     `outbound=allow, write=deny`.
   - Focused GREEN:
     `npm run test:unit -- --run tests/unit/tools/toolExecutor.test.ts`

2. `mobile/tests/unit/tools/toolExecutor.test.ts::P0-CAP-02 asks once with exactly the unresolved compound actions`
   - Expected RED: consent receives no action set and only the primary action is
     evaluated.
   - Focused GREEN: same command.

3. `mobile/tests/unit/search/webTools.test.ts::P0-WEB-01 web tools declare outbound plus write`
   - Expected RED: both tools declare only `outbound`.
   - Focused GREEN:
     `npm run test:unit -- --run tests/unit/search/webTools.test.ts`

4. `mobile/tests/unit/search/webTools.test.ts::P0-WEB-02 write deny hides web schemas`
   - Expected RED: `toolset.offer()` advertises both web tools.
   - Focused GREEN: same command.

5. `mobile/tests/unit/search/webTools.test.ts::P0-WEB-03 write deny blocks before network and persistence`
   - Expected RED: web source and archive are called.
   - Focused GREEN: same command.

6. `mobile/tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts::P0-COPY-01 AI Defaults states the active outbound/write web contract`
   - Expected RED: copy says nothing in TALOS sends data off-device.
   - Focused GREEN:
     `npm run test:unit -- --run tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`

7. `mobile/tests/unit/images/imageTools.test.ts::P0-CAP-IMG-01 image generation requires outbound plus write`
   - Expected RED: only `write` is declared and an outbound-denied tool remains
     offerable.
   - Focused GREEN:
     `npx vitest run tests/unit/images/imageTools.test.ts`

8. `mobile/tests/unit/tools/libraryExportTools.test.ts::P0-CAP-EXPORT-01 export requires read plus write`
   - Expected RED: only `write` is declared and a read-denied tool remains
     offerable.
   - Focused GREEN:
     `npx vitest run tests/unit/tools/libraryExportTools.test.ts`

## Affected regressions

- `tests/unit/tools/toolExecutor.test.ts`
- `tests/unit/search/webTools.test.ts`
- `tests/unit/tools/toolRegistry.test.ts`
- `tests/unit/tools/toolsetLibraryDiscovery.test.ts`
- `tests/unit/tools/agentLoop.test.ts`
- `tests/unit/chat/chatController.test.ts`
- `tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`
- `tests/unit/settings/searchSourcePanel.test.ts`
- full `npm run test:unit`
- full `npm run test:e2e`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Real-upstream gate

No upstream runtime is integrated. The conformance gate is the local permission
matrix executed through the real registry, offer filter, executor, web tool
sources, consent callback, and audit sink.

Primary references and pins are recorded in the paired research dossier.

## Human-visible proof

1. Set outbound `Always allow` and write `Never allow`.
2. Start a new chat and ask TALOS to search the web.
3. Verify no web tool is offered/executed and no Library source is created.
4. Set write to `Ask me every time`; retry.
5. Verify consent appears before the query leaves the device and explains that
   the source will be stored.
6. Decline: verify no request and no Library artifact.
7. Allow: verify search succeeds and a source record appears.

## Rollback

Revert only the files listed in Exact ownership to their pre-slice content.
There is no database migration, dependency, generated resource, or persistent
format to undo. Retain the RED tests as permanent regression evidence.

## RED evidence

Command:

`npm run test:unit -- --run tests/unit/tools/toolExecutor.test.ts tests/unit/search/webTools.test.ts tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`

Observed before product edits:

- 3 test files failed;
- 7 named P0 assertions failed and 28 adjacent assertions passed;
- the compound executor ran with `write=deny`;
- web schemas remained advertised and both sources ran;
- web tools had no complete capability declaration;
- the Settings panel still claimed that TALOS sends nothing off-device.

This was a behavioral RED, not an environment or compile failure.

## GREEN evidence

Focused:

- the same three-file command: 35/35 passed;
- `npm run typecheck`: passed.

Affected regression set:

`npm run test:unit -- --run tests/unit/tools/toolExecutor.test.ts tests/unit/search/webTools.test.ts tests/unit/tools/toolRegistry.test.ts tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/tools/agentLoop.test.ts tests/unit/chat/chatController.test.ts tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts tests/unit/settings/searchSourcePanel.test.ts`

- first run: 95 passed, one timeout in `WEB-LIB-07`, because that successful
  fixture enabled outbound but left write at `ask`;
- ledger amended before editing the fixture;
- rerun: 96/96 passed.

Complete subsystem and cross-cutting gates:

- `npm run test:unit`: 249 files passed, 2 skipped; 2,088 tests passed,
  5 skipped; only known jsdom canvas notices;
- `npm run build`: passed, 3,213 modules; initial JavaScript 555,600 /
  560,000 bytes, CSS 129,354 / 150,000 bytes; parity 9/9;
- `npm run test:e2e`: 74/74 passed;
- final focused `git diff --check`: passed.

## Implemented upstream decision

OWASP/NIST semantics were adapted behind the TALOS-owned registry and executor:

- compound tools expose a complete, local-only capability set;
- deny on any required action blocks schema offering and execution;
- consent receives exactly the actions configured as `ask`;
- write consent cannot satisfy an outbound prompt;
- audit payloads record `required_actions`;
- both web tools require `outbound + write`;
- AI Defaults now states the real web and encrypted-Library behavior.

No package, provider wire change, migration, or Android permission was added.

## R4 follow-up RED/GREEN evidence

Fresh RED before the two declarations:

```text
2 files; 5 expected failures and 6 compatibility tests passed
generate_image ran with outbound=deny
library_export listed/read/exported with read=deny
library_export remained offered with read=deny
```

Fresh GREEN after the minimal declarations:

```text
focused declarations/execution: 2 files, 11/11 passed
permission/toolset/web regressions: 5 files, 45/45 passed
realistic chat controller: 1 file, 39/39 passed
npm run typecheck: passed
npm run build: passed; 3222 modules transformed
initial JavaScript: 556126 / 560000 bytes
initial CSS: 129477 / 150000 bytes
feature parity: 9/9 validator tests and ledger verification passed
git diff --check: passed (line-ending notices only)
```

The permanent scenarios prove the central executor stops both operations before
network/persistence or decrypted-byte/Save-As effects. No provider key, file
picker, or Android runtime permission was exercised; those remain explicit
owner-device checklist steps.
