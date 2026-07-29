# Execution ledger - R7 tool consent localization

Date: 2026-07-29
Subsystem: TALOS mobile authorization / localization
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED (automated; multilingual physical-device gate remains for owner)
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-tool-consent-localization-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-tool-consent-localization-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-tool-consent-localization-ledger.md`

Modify:

- `mobile/src/lib/tools/toolLabels.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/i18n/locales/it.ts`
- `mobile/tests/unit/tools/toolLabels.test.ts`
- `mobile/tests/unit/chat/chatController.test.ts`

Delete:

- none

## Public symbols and compatibility

- Add `TALOS_TOOL_CONSENT_KEYS`.
- Add `talosToolConsentCopy`.
- Preserve `TalosToolDefinition`, provider tool schemas,
  `TalosToolConsentRequest`, `pendingToolConsent`, consent queue semantics,
  per-session write grant, input objects, executor audit, and component props.
- Do not add a locale runtime, provider-schema fork, or protocol migration.

## RED tests and expected failures

1. `TOOL-CONSENT-I18N-01 every offered tool owns localized consent keys`.
   - pre-fix no consent-copy map exists.
2. `TOOL-CONSENT-I18N-02 resolves Italian human copy without changing input`.
   - pre-fix only English schema prose is available.
3. `TOOL-CONSENT-I18N-03 controller opens an Italian sheet for a real
   natural-language document tool call`.
   - pre-fix pending title is `Create a document`;
   - pre-fix pending description is the English provider schema;
   - deny must still prevent execution and release the send.
4. Existing catalog structural parity, localization coverage, consent queue,
   executor, and English behavior remain green.

## Baseline evidence

Fresh command before RED edits on 2026-07-29:

```text
npx vitest run tests/unit/tools/toolLabels.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts tests/unit/chat/chatController.test.ts

4 files passed
66 tests passed
```

## Focused GREEN and affected regression gates

```powershell
npx vitest run tests/unit/tools/toolLabels.test.ts tests/unit/chat/chatController.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts
npx vitest run tests/unit/tools/toolExecutor.test.ts tests/unit/tools/consentQueue.test.ts tests/unit/i18n/typescriptUiLocalization.test.ts tests/unit/shell/appShell.test.ts
npm run typecheck
npm run build
git diff --check
```

## Real-device and human-visible gate

On a physical device:

- switch the application language to Italian;
- set write and outbound permissions to ask;
- trigger document creation, image generation, web search/archive, and device
  export through natural language;
- verify title, description, outer dialog label, and buttons are Italian;
- verify exact filenames, URLs, prompts, and other arguments remain visible and
  unchanged;
- deny one call and allow one call, then verify their real outcomes;
- repeat one sheet in English and after an app restart.

Automation cannot substitute for this multilingual authorization gate.

## RED evidence

Fresh pre-fix command on 2026-07-29:

```text
npx vitest run tests/unit/tools/toolLabels.test.ts tests/unit/chat/chatController.test.ts

2 test files failed
4 expected failures
58 compatibility tests passed
```

Observed boundaries:

- every canonical consent-copy assertion failed because no presentation map or
  resolver existed;
- the realistic Italian controller flow opened `Create a document` with the
  complete English provider description;
- the exact requested `format`, `title`, and `body` were already preserved.

The failures matched the ledger before product code was changed.

## GREEN evidence

Fresh post-fix evidence on 2026-07-29:

```text
localized controller/catalog matrix: 4 files, 70/70 passed
executor/queue/TypeScript localization/shell regressions: 4 files, 24/24 passed
vue-tsc typecheck: passed
Vite production build: passed, 3,240 modules
initial JavaScript: 557,162 / 560,000 bytes
initial CSS: 132,986 / 150,000 bytes
parity script tests: 9/9 passed
feature parity ledger: passed, no missing entries
git diff --check: passed
```

The realistic controller test proves localized Italian title and description,
unchanged significant input, denial, queue release, and a completed second
provider round. Completeness tests cover all twelve currently offered tools;
custom already-localized prompts retain their supplied copy.

## Rollback

Revert only the four product files and two tests listed above, then remove these
three task documents. No persisted data, native resource, or schema rollback is
required.
