# P0-B safe web-read SSRF execution ledger

Date: 2026-07-28  
Subsystem: TALOS mobile / security / Android networking  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED — automated gates complete; physical network proof pending  
Commit: forbidden without fresh explicit owner authorization

## Exact ownership

Create:

- `mobile/src/services/safeWebRead.ts`
- `mobile/tests/unit/services/safeWebRead.test.ts`
- `mobile/tests/unit/services/webSearchRuntime.test.ts`
- `mobile/android/app/src/main/java/ai/talos/TalosPublicAddressPolicy.java`
- `mobile/android/app/src/main/java/ai/talos/TalosPublicDns.java`
- `mobile/android/app/src/main/java/ai/talos/TalosSafeWebClient.java`
- `mobile/android/app/src/main/java/ai/talos/TalosSafeWebPlugin.java`
- `mobile/android/app/src/test/java/ai/talos/TalosPublicAddressPolicyTest.java`
- `mobile/android/app/src/test/java/ai/talos/TalosPublicDnsTest.java`
- `mobile/android/app/src/test/java/ai/talos/TalosSafeWebClientTest.java`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-safe-web-read-ssrf-ledger.md`

Modify:

- `mobile/src/services/webSearchRuntime.ts`
- `mobile/android/app/src/main/java/ai/talos/MainActivity.java`
- `mobile/android/app/build.gradle`
- `mobile/docs/upstream-provenance.md`

Delete:

- none

The shared research and design documents were created by P0-A:

- `mobile/docs/superpowers/research/2026-07-28-p0-web-tool-network-security-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-web-tool-network-security-design.md`

## Public classes and functions

- TypeScript `TalosSafeWebReadResponse`
- TypeScript `readTalosSafeWebPage(url)`
- Capacitor plugin `TalosSafeWeb`, method `read`
- Java `TalosPublicAddressPolicy`
- Java `TalosPublicDns`
- Java `TalosSafeWebClient`
- Java `TalosSafeWebPlugin`
- Existing `readTalosPage(url)` remains stable

## RED scenarios

1. `SAFE-WEB-01` non-Android adapter fails closed and never calls a fallback.
2. `SAFE-WEB-02` Android adapter invokes only `TalosSafeWeb`.
3. `SAFE-WEB-03` rejects credentials and non-80/443 ports.
4. `SAFE-WEB-04` rejects IPv4 loopback, private, link-local, CGNAT,
   documentation, benchmark, multicast and reserved ranges.
5. `SAFE-WEB-05` rejects IPv6 loopback, unspecified, unique-local,
   link-local, multicast, documentation, transition and IPv4-mapped private
   forms.
6. `SAFE-WEB-06` permits representative public IPv4/IPv6 and public NAT64.
7. `SAFE-WEB-07` DNS rejects private and mixed A/AAAA answers.
8. `SAFE-WEB-08` simulated rebinding passes the public lookup and rejects the
   later private lookup.
9. `SAFE-WEB-09` manual redirect revalidates a private target before the
   second transport call.
10. `SAFE-WEB-10` rejects HTTPS downgrade, loops and excessive hops.
11. `SAFE-WEB-11` limits the response body and returns final URL/status.
12. `SAFE-WEB-12` `readTalosPage` extracts from the safe final response.

Expected pre-fix state: classes/adapter do not exist and unrestricted
Capacitor HTTP performs the page request.

## GREEN design

- Pin `com.squareup.okhttp3:okhttp:5.4.0`.
- Use a single client with custom validating DNS, no proxy, no automatic
  redirect, normal platform TLS, no cookies and bounded timeouts.
- Resolve and validate every address inside the DNS instance OkHttp uses.
- Revalidate every redirect hop in TALOS code.
- Cap response bytes before crossing the bridge.
- Register one native plugin and fail closed outside Android.

## Focused and regression commands

```powershell
npx vitest run tests/unit/services/safeWebRead.test.ts tests/unit/search/webTools.test.ts
npx vitest run tests/unit/services/webSearchRuntime.test.ts
npm run typecheck

$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'
.\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosPublicAddressPolicyTest --tests ai.talos.TalosPublicDnsTest --tests ai.talos.TalosSafeWebClientTest
.\gradlew.bat :app:testDebugUnitTest --rerun-tasks
.\gradlew.bat :app:assembleDebug

npm run build
npx cap sync android
git diff --check
```

## Real-upstream, human proof and rollback

The Android compile/test/assemble gate must resolve and compile the real pinned
OkHttp artifact; mocks do not close this integration alone. A physical device
test reads a public HTTP redirect to HTTPS, then tries localhost/private/LAN
and confirms no request reaches those targets.

Rollback removes the adapter/plugin and disables `web_read`. It must not restore
the old unrestricted Capacitor HTTP page fetch. Search-provider calls and
their explicit self-hosted endpoint contract remain unchanged.

Ledger amendment: the initial file list placed adapter and integration proof
in one Vitest module. Static module mocking would replace the adapter under
test, so the runtime integration gets its own exact test file. Product scope
and public contracts are unchanged.

## Closure record

- TypeScript RED:
  - `safeWebRead` did not exist;
  - `readTalosPage` still called unrestricted Capacitor HTTP;
  - 2 integration failures, 17 adjacent web-tool passes.
- Android RED: test compilation failed on the absent OkHttp pin and the absent
  address, DNS and client classes.
- Focused TypeScript GREEN: 3 files, 22/22 passed.
- Affected search/tool/controller regression: 8 files, 92/92 passed.
- Focused native GREEN: 12/12 across address policy, DNS and safe client.
- Forced complete app-native gate: 17/17:
  - file export 4;
  - public address policy 3;
  - public DNS 3;
  - safe web client 6;
  - baseline example 1.
- `npm run typecheck`: pass.
- `npm run build`: pass; 3,213 modules, initial JavaScript 555,473 / 560,000
  bytes, CSS 129,399 / 150,000 bytes, parity 9/9.
- `npx cap sync android`: pass; all 14 package plugins synchronized. The local
  `TalosSafeWeb` plugin is registered in `MainActivity` and compiled by Gradle.
- Gradle dependency insight resolves the exact Android release variant
  `com.squareup.okhttp3:okhttp:5.4.0` / `okhttp-android:5.4.0`.
- `:app:assembleDebug`: build successful.
- Scoped `git diff --check`: pass; one non-failing CRLF checkout warning.
- No real private/LAN endpoint was contacted. The physical public redirect and
  blocked-device/LAN observations remain in the rebuilt APK owner checklist.
- No commit or Claude ACK ticket was created.
