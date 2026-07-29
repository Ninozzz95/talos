# R6 provider error oracle conformance design

## Outcome

Endpoint security consumer tests assert stable, locale-neutral TALOS error
codes instead of former English message fragments. Production URL validation,
persistence and transport behavior remain unchanged.

## Contract

- a missing Ollama endpoint rejects with
  `TALOS_PROVIDER_ENDPOINT_REQUIRED`;
- a non-HTTP(S) endpoint rejects with
  `TALOS_PROVIDER_ENDPOINT_PROTOCOL`;
- an endpoint containing username or password rejects with
  `TALOS_PROVIDER_ENDPOINT_CREDENTIALS`;
- the endpoint store performs no write after either rejected value;
- localized display copy remains proven by
  `tests/unit/chat/providerErrors.test.ts`.

## Non-goals

- changing accepted schemes, URL canonicalization or credential handling;
- changing provider error classes or localization catalogs;
- adding a dependency or a persistence migration.

## Acceptance

The focused three-file gate passes all ten tests, the complete unit suite passes
without skipping a newly failing test, and `git diff --check` remains clean.

