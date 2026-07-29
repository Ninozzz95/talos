# P0 localization conformance closure research

Date: 2026-07-29  
Lane: `lane/kimi-mobile`  
Subsystem: TALOS mobile localization / upstream provenance / route contract tests

## Local failure evidence

The complete unit suite exposed four localization-era conformance regressions:

- `routeWiring.test.ts` still searched localized screens for frozen English
  product copy and for the pre-i18n exact `createApp(...).use(router)` chain;
- `desktopPortedConformance.test.ts` correctly rejected the intentional
  localized-label extension in `talosMessageMarkdown.ts`;
- `shadcnConformance.test.ts` correctly rejected three dialog sources whose
  visible or assistive-only `Close` labels now use the TALOS locale catalog.

These are not Agent Tools runtime failures. They are stale contracts that must
be made truthful without weakening their original regression purpose.

## Current primary guidance

- shadcn-vue introduction:
  https://shadcn-vue.com/docs/introduction
  - shadcn-vue distributes open component source;
  - the checked-in top layer is explicitly owned, customizable code.
- Vue I18n installation:
  https://vue-i18n.intlify.dev/guide/installation
  - the i18n instance is installed with `app.use(i18n)` before `mount`.
- Vue application API:
  https://vuejs.org/api/application
  - plugins are installed with `app.use`;
  - `app.mount` is the lifecycle boundary that makes the app interactive.
- Node.js SHA-256 implementation used by the repository:
  https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options
- Vue Test Utils asynchronous behavior:
  https://test-utils.vuejs.org/guide/advanced/async-suspense
  - `flushPromises()` resolves outstanding non-Vue promises before assertions
    or environment teardown.
- Vue Test Utils async-component stubbing:
  https://test-utils.vuejs.org/guide/advanced/stubs-shallow-mount
  - an async child can be stubbed by its registration key before resolution;
  - tests should stub only children irrelevant to the behavior under test.
- Vitest `vi.dynamicImportSettled()`:
  https://vitest.dev/api/vi#vi-dynamicimportsettled
  - waits for direct and nested dynamic imports plus the following timer tick;
  - is the exact gate when the component starts an import without exposing its
    Promise to the test.

The already-approved localization upstream remains exactly
`vue-i18n@11.4.8` with integrity
`sha512-0ULeHP6Z9CGvAm67S77ZEp41cfGXIREGL8qfhos2BMgcQQewtQcDKuojt6jjasAD/S8GwfTp2ySPmDSpwvrCMQ==`.
The shadcn generator provenance remains exactly `shadcn-vue@2.8.0`, MIT, with
integrity
`sha512-iCRrUYGJ52rJkivBpk+O2ZW+2u30UOvA4sMTu8kw24r2UPkpO57NwLBMegPeC/ifPESSiOOrtMjvYTV5lpCf9w==`.

## Upstream decisions

### shadcn dialog sources — adapt with two hashes

**Adapt behind a truthful TALOS-owned source record.**

Keep every original generated `sha256` unchanged. Add a closed
`adaptations` list that records, for each deliberately modified destination:

- its original upstream hash;
- the accepted TALOS hash;
- the exact localization reason;
- this research record.

The conformance test must require all fields, reject duplicate or orphan
adaptations, verify the upstream hash still matches the frozen generated row,
and compare local bytes with the accepted hash only for explicitly adapted
files. This preserves both upgrade evidence and local drift detection.

Simply replacing the upstream hash is rejected because it would falsely claim
the localized bytes came directly from the generator. Reverting the three
labels is rejected because it would reintroduce mixed-language and
screen-reader regressions.

### Desktop-ported Markdown renderer — adapt and repin the mobile fork

**Adapt and repin the existing AVM-owned fork.**

The manifest already defines its hash as the mobile accepted hash rather than
byte equality with desktop. Keep desktop revision `76a0aa9`, update only the
`talosMessageMarkdown.ts` digest, and expand its reconciliation note to name
the localized label contract and locale-aware cache key. Sanitization, URL
policy, source bounds and HTML allowlists remain the desktop-derived contract.

### Route wiring — semantic characterization

**Replace copy-coupled assertions with stable structural contracts.**

Each route must still resolve its actual named SFC, but source markers become
stable test ids or locale keys. The preload test locates the actual
`.mount('#app')` lifecycle call rather than one exact plugin chain, then proves
that `preloadTalosMobileRoutes()` remains after mount and is never awaited.

No package, user-visible behavior, provider payload, storage schema or native
boundary changes in this closure.

### Async component tests — await the owned boundary

**Adapt the tests to the production async boundary.**

The message list intentionally lazy-loads Markdown and the streaming renderer
to preserve the initial-JavaScript budget. Each calm-thread test waits for the
real nested imports with `vi.dynamicImportSettled()` and resolves Vue Test
Utils' outstanding work with `flushPromises()` before asserting and unmounting.
This prevents imports from continuing after jsdom teardown without making
production eager or replacing the production child in the loader scenario.

The source-level composer test searches for the stable locale key
`chat.addToChat`, not its English catalog value. It continues to enforce the
same ghost variant and 44 px target.
