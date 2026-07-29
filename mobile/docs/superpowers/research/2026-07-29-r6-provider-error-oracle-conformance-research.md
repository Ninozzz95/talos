# R6 provider error oracle conformance research

Date: 2026-07-29  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Problem confirmed locally

The complete R6 unit gate found two stale assertions:

- `ollamaAdapter.test.ts` expects the rejected message to match `/http/i`;
- `providerEndpointStore.test.ts` expects protocol and credential failures to
  match the former English prose.

Production already rejects the same unsafe values before transport or
persistence, but now emits the stable codes
`TALOS_PROVIDER_ENDPOINT_PROTOCOL` and
`TALOS_PROVIDER_ENDPOINT_CREDENTIALS` plus separate Vue I18n metadata. The
focused RED is 2 failed and 8 passed across the two consumers and the canonical
provider-error test.

## Current primary sources

1. WHATWG URL Living Standard, last updated 2026-07-06:
   <https://url.spec.whatwg.org/>
   - URL records expose the parsed scheme, username and password separately;
   - a URL includes credentials when username or password is non-empty;
   - user information can mislead the user about the actual host.
2. RFC 9457, Problem Details for HTTP APIs:
   <https://www.rfc-editor.org/rfc/rfc9457.html>
   - human-readable `title` and `detail` are presentation fields;
   - titles may change for localization;
   - consumers should not parse human-readable detail for behavior because
     structured members are less error-prone.
3. Vitest 4.1.10 `expect` API:
   <https://main.vitest.dev/api/expect#tothrow>
   - `rejects.toThrow()` unwraps an asynchronous rejection;
   - a string expectation asserts the error-message substring;
   - a regular expression asserts presentation text matching.

## Upstream decision

**ADAPT** the primary contracts behind the existing AVM-owned provider-error
boundary:

- keep WHATWG `URL` parsing and the explicit TALOS allow-list of `http:` and
  `https:`;
- keep embedded username/password fail-closed;
- assert the stable TALOS error identity in domain tests, while the existing
  localization test independently proves the UI message key and parameters;
- use the pinned `vitest@4.1.10` string form of `rejects.toThrow`.

No package, protocol or production behavior change is warranted. Reintroducing
English prose into the domain error would make tests and machine behavior
locale-dependent, contrary to RFC 9457's separation between structured
identity and human-readable presentation.

## Alternatives rejected

- **Restore English error sentences:** rejected because it regresses runtime
  localization and makes diagnostics depend on prose.
- **Match both old prose and the code with a broad regex:** rejected because it
  permits contract drift and does not prove which rejection occurred.
- **Change the URL policy:** rejected because the failure is solely a stale
  test oracle; the security policy still rejects both supplied attack shapes.

