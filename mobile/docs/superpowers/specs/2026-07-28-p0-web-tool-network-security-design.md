# P0 web-tool network security design

Date: 2026-07-28  
Subsystem: TALOS mobile / security / tool execution / Android

## Contract

`web_search` and `web_read` are outbound actions. The existing executor remains
the sole capability gate:

- `outbound: deny`: schemas are not offered and replayed calls are refused;
- `outbound: ask`: the existing consent surface decides before any network
  body runs;
- `outbound: allow`: the call may proceed;
- malformed arguments are still rejected before consent.

The response remains wrapped as untrusted tool data and audited under the same
wire contract.

## Android `web_read` boundary

```text
model tool call
  -> outbound permission
  -> web_read schema
  -> safeWebRead adapter (Android only)
  -> TalosSafeWeb plugin
  -> TalosSafeWebClient
       -> URL policy (scheme, credentials, port, literal address)
       -> OkHttp 5.4.0 with TalosPublicDns
       -> no proxy, no automatic redirects
       -> bounded manual redirect loop; validate every hop
       -> bounded response bytes
  -> Readability extraction
  -> encrypted source evidence
  -> untrusted tool-result wrapper
```

`TalosPublicDns` delegates resolution to OkHttp's system DNS, validates every
returned A/AAAA address, and returns exactly that validated list to the same
client connection. Any private or special member rejects the entire answer.
This prevents a mixed public/private answer from becoming an alternate route.

`TalosPublicAddressPolicy` rejects non-global IPv4 and IPv6, including
IPv4-mapped forms. The globally reachable well-known NAT64 prefix is accepted
only when its embedded IPv4 address is public; private-use NAT64 synthesis is
rejected.

Manual redirects:

- statuses 301, 302, 303, 307 and 308 only;
- at most five hops;
- relative `Location` is resolved against the current URL;
- each URL is validated before its request;
- HTTPS-to-HTTP downgrade is rejected;
- loops are rejected;
- final provenance records the final validated URL.

The response is capped at 2 MiB before crossing the Capacitor bridge.

## Platform behavior

The current product artifact is Android. `safeWebRead` therefore calls the
registered native plugin only on Android. Browser/non-native execution fails
closed with an actionable code instead of falling back to a request without
DNS pinning. Search-provider calls remain separate and continue to support an
explicitly configured self-hosted SearXNG/custom endpoint.

## Compatibility contracts

- search provider request/response adapters are unchanged;
- `TalosExtractedPage` and Library source evidence schemas are unchanged;
- public HTTP(S) pages on ports 80/443 remain readable;
- TLS hostname validation remains owned by OkHttp/platform TLS;
- no cookies, authorization headers or URL credentials are forwarded;
- no user data, database schema or key changes are introduced.

