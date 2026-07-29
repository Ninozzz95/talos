# Execution ledger - R7 Tavily registration/API-key link

Date: 2026-07-29
Subsystem: TALOS UI / Settings web-search source
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED - automated gates green; physical-browser acceptance pending
Commit policy: no commit without fresh owner authorization
Upstream pins: Tavily Platform/docs inspected 2026-07-29;
`@capacitor/inappbrowser@4.0.1`

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-tavily-key-link-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-tavily-key-link-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-tavily-key-link-ledger.md`

Modify:

- `mobile/src/components/talos/settings/TalosMobileSearchSourcePanel.vue`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/i18n/locales/it.ts`
- `mobile/tests/unit/settings/searchSourcePanel.test.ts`
- `mobile/tests/e2e/mobile-settings-parity.e2e.spec.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

## Public symbols and compatibility

- Add no exported symbol, route, provider, permission, schema or persistence.
- Add internal constant `TAVILY_PLATFORM_URL`.
- Preserve `TalosMobileSearchSourcePanel`, all source ids, secure-key names,
  selection, save/replace/clear and readiness semantics.
- Preserve `openTalosLinkOnce` unchanged.

## Baseline

Fresh 2026-07-29:

```text
2 files passed
14 tests passed
```

The current panel has no Tavily account/key action.

## RED and expected failure

Add permanent tests first:

- `TAVILY-LINK-01`: Tavily selection shows the localized action; other sources
  do not;
- `TAVILY-LINK-02`: a tap calls only
  `openTalosLinkOnce("https://app.tavily.com/", "system_browser")`;
- `TAVILY-LINK-03`: a failed open reports localized feedback and does not touch
  settings or secure-key methods;
- E2E Settings flow observes a popup to exactly the official Tavily origin,
  fulfilled locally so the gate makes no live external request.

Expected pre-fix failures: no action exists, so neither the browser adapter nor
the popup can be reached.

Fresh RED evidence, 2026-07-29:

```text
Unit: 3 failed, 8 passed
Browser: 1 failed because the action was absent
```

The unit failures were exactly `TAVILY-LINK-01` through
`TAVILY-LINK-03`. The browser journey reached AI Defaults and selected Tavily,
then failed on the missing action.

## Focused GREEN and affected gates

```powershell
npx vitest run tests/unit/settings/searchSourcePanel.test.ts tests/unit/services/inAppBrowserService.test.ts
npm run build
npx playwright test tests/e2e/mobile-settings-parity.e2e.spec.ts --grep "Tavily"
npm run typecheck
git diff --check
```

## GREEN evidence

Fresh 2026-07-29 results:

- search panel plus browser adapter: 2 files, 17/17 tests passed;
- localization coverage/regressions: 2 files, 8/8 tests passed;
- exact Tavily popup journey: 1/1 passed with the external host fulfilled
  locally;
- complete Settings parity E2E suite: 6/6 passed;
- `npm run typecheck`: passed;
- `npm run build`: passed, including parity verification; initial JavaScript
  remained 557,756 / 560,000 bytes;
- `git diff --check`: passed.

Only a selected Tavily source exposes the localized action. It calls
`openTalosLinkOnce("https://app.tavily.com/", "system_browser")`; failed opens
return localized status while source settings and secure keys remain untouched.

## Human-visible proof

On Android, choose Tavily, tap the new key action and confirm the system browser
opens Tavily's sign-in/create-account platform. Sign in, copy a key, return via
Back, paste/save it, reload Settings and confirm `one is already saved`. Verify
the URL contains no key/query parameter and that Brave/SearXNG/custom show no
Tavily action.

Manual proof remains required before the Claude ACK ticket.

## Rollback

Restore only the seven modified files and three slice documents listed above.
No key, source preference or browser history is deleted.
