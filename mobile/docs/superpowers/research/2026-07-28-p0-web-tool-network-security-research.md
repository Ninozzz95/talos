# P0 web-tool network security research

Date: 2026-07-28  
Subsystem: TALOS mobile / security / agent tools / Android networking  
Review trigger: post-R2 independent code review

## Local finding

The review findings are reproducible in the current lane:

1. `web_search` and `web_read` are declared as `read`, while the central
   executor checks only `tool.action`. Therefore `{ read: allow, outbound:
   deny }` still permits both network calls and the toolset advertises them.
2. `web_read` accepts every syntactically valid HTTP(S) URL. The Android
   runtime delegates it to `CapacitorHttp`, whose native layer follows
   redirects. There is no credential, port, literal-IP, A/AAAA, private,
   link-local, multicast, metadata-address, redirect-hop, or DNS-rebinding
   boundary.

The configured SearXNG/custom search endpoint is a distinct contract: the user
chooses that endpoint explicitly and it may intentionally be self-hosted on a
LAN. The arbitrary model-selected `web_read` URL has no such trust grant.

## Current primary sources

- OWASP SSRF Prevention Cheat Sheet, inspected 2026-07-28:
  <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>
  - allow only HTTP(S);
  - validate IPv4 and IPv6;
  - resolve and validate all A/AAAA answers;
  - disable automatic redirects because redirects bypass first-hop
    validation;
  - for an open-web use case where a hostname allowlist is impossible, a
    carefully bounded blocklist is the documented fallback.
- IANA IPv4 and IPv6 Special-Purpose Address registries, both updated
  2025-10-09 and inspected 2026-07-28:
  <https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml>
  <https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml>
  These registries are the canonical source for non-global, private,
  loopback, link-local, multicast, documentation, benchmarking, transition
  and other special ranges.
- Capacitor HTTP API, inspected 2026-07-28:
  <https://capacitorjs.com/docs/apis/http>
  `HttpOptions.disableRedirects` exists, confirming that automatic redirect
  following is optional. It does not expose a DNS-resolution policy or pin
  validated A/AAAA results to the subsequent connection.
- OkHttp project and 5.x API, inspected 2026-07-28:
  <https://github.com/lysine-dev/okhttp>
  <https://square.github.io/okhttp/5.x/okhttp/okhttp3/-ok-http-client/>
  <https://square.github.io/okhttp/5.x/okhttp/okhttp3/-dns/>
  The maintained client supports Android 5+, custom `Dns`, disabled
  redirects, TLS/hostname validation, timeouts and a reusable client.
- Maven Central canonical artifact, inspected 2026-07-28:
  <https://central.sonatype.com/artifact/com.squareup.okhttp3/okhttp>
  Pin: `com.squareup.okhttp3:okhttp:5.4.0`, Apache-2.0. Its published runtime
  dependencies are Kotlin stdlib 2.1.21 and Okio 3.17.0.

## Upstream decision

### Outbound capability

**ADAPT the existing AVM-owned action contract.** No new permission type is
needed: `outbound` already means data leaving the device and defaults to
`deny`. Reclassify both web tools as `outbound`; keep the single executor and
tool-offer filters as the enforcement points. This preserves the three-value
`allow` / `ask` / `deny` user policy and avoids a parallel permission system.

### Safe page fetch

**ADOPT OkHttp 5.4.0 directly, behind an AVM-owned native adapter.** A custom
OkHttp `Dns` validates every address returned by the resolver and returns that
same validated list to OkHttp, removing the preflight/connect DNS TOCTOU that a
JavaScript-only check would retain. Automatic redirects and proxies are
disabled; TALOS follows a small number of redirects itself and revalidates
every hop.

The adapter accepts only credential-free HTTP on port 80 and HTTPS on port
443, rejects non-global/special addresses, limits redirects and response
bytes, and preserves normal TLS hostname verification. The configured search
provider remains on Capacitor HTTP because its endpoint is an explicit user
trust choice and can legitimately be LAN-local.

### Rejected alternatives

- **Reject scheme-only filtering:** it is the current vulnerable behavior.
- **Reject JavaScript DNS preflight plus Capacitor HTTP:** the fetch resolves
  again, retaining DNS-rebinding TOCTOU.
- **Reject disabling redirects without DNS validation:** it still permits
  direct localhost/private/link-local targets and rebinding.
- **Reject a custom raw TLS/HTTP stack:** OkHttp already owns connection,
  certificate, SNI, DNS injection, timeout and response semantics.
- **Reject a hard hostname allowlist:** `web_read` is explicitly an open-web
  reader. Restricting it to search-provider domains would remove the feature.

## Compatibility, security, health and rollback gates

- Android minSdk remains compatible with OkHttp 5.4.0.
- The plugin is Android-only and fails closed on non-native platforms; no
  unsafe browser fallback is advertised as equivalent.
- Unit tests cover action enforcement, literal IPv4/IPv6, special ranges,
  mixed DNS answers, simulated rebinding, credentials, ports, redirects,
  downgrade, loops, response limit and final URL.
- The real Android Gradle compile/test and APK build exercise the pinned
  upstream component. Mocks supplement but do not replace that gate.
- Rollback removes the plugin/adapter and disables `web_read`; it must never
  restore unrestricted arbitrary fetching.

