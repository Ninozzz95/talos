# R6 provider error oracle conformance execution ledger

Date: 2026-07-29  
Subsystem: TALOS mobile provider adapter and endpoint persistence tests  
Lane: `lane/kimi-mobile`

Research:
`docs/superpowers/research/2026-07-29-r6-provider-error-oracle-conformance-research.md`

Design:
`docs/superpowers/specs/2026-07-29-r6-provider-error-oracle-conformance-design.md`

Upstream decision: **ADAPT** WHATWG URL semantics and RFC 9457's separation of
machine-readable identity from localizable presentation, using the already
pinned `vitest@4.1.10` assertion API.

## Exact ownership

Create:

- `docs/superpowers/research/2026-07-29-r6-provider-error-oracle-conformance-research.md`
- `docs/superpowers/specs/2026-07-29-r6-provider-error-oracle-conformance-design.md`
- `docs/superpowers/ledgers/2026-07-29-r6-provider-error-oracle-conformance-ledger.md`

Modify:

- `tests/unit/chat/ollamaAdapter.test.ts`
- `tests/unit/services/providerEndpointStore.test.ts`

Delete: none.

No production source file is owned by this slice.

## Public symbols

Create, modify or delete: none.

Compatibility symbols remain stable:

- `TalosMobileProviderError`
- `normalizeHttpEndpoint()`
- `ollamaAdapter`
- `setProviderEndpoint()`

## Permanent RED scenario

`I18N-CONFORMANCE-09 provider endpoint consumers assert stable error identity,
not frozen English copy`

Expected RED:

- `file:///tmp/socket` receives `TALOS_PROVIDER_ENDPOINT_PROTOCOL`, which does
  not match `/http/i`;
- `file:///tmp/ollama` receives the same code, which does not match `/http/i`;
- focused result is 2 failed and 8 passed.

## GREEN commands

Focused:

```powershell
npx vitest run tests/unit/chat/ollamaAdapter.test.ts tests/unit/services/providerEndpointStore.test.ts tests/unit/chat/providerErrors.test.ts
```

Affected and release regression:

```powershell
npm run test:unit
git diff --check
```

## Real-upstream and human-visible proof

- the tests execute the real WHATWG-compatible `URL` implementation used by the
  application and the pinned Vitest matcher, not a URL-policy mock;
- no human-visible copy or runtime behavior changes in this slice;
- physical provider configuration remains part of the final owner checklist,
  including a valid LAN Ollama endpoint and rejected unsafe endpoint.

## Fresh automated evidence

- Focused endpoint/provider-error gate: 3 files, 10 tests passed.
- Complete unit gate: 263 files passed, 2 skipped; 2,225 tests passed and 5
  skipped out of 2,230; exit code 0.
- The five JSDOM canvas notices are non-failing limitations already emitted by
  tests that deliberately run without the optional native `canvas` package.

## Rollback

Revert only the two test assertion edits and these three documents. No
application, dependency, persisted setting or user data is changed.
