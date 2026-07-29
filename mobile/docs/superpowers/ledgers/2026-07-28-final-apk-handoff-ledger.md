# Final APK handoff ledger

Date: 2026-07-28  
Subsystem: TALOS mobile / coordinated cross-stack gate  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED (automated) — owner physical-device acceptance remains open  
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/ledgers/2026-07-28-final-apk-handoff-ledger.md`

Modify:

- none

Delete:

- none

This ledger records the coordinated final gate only. It does not expand product
code ownership established by the individual P1-P10 ledgers.

## Automated acceptance evidence

Fresh final commands:

```powershell
npm run test:unit
npx playwright test
npm run typecheck
npm run build
npx cap sync android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat :app:testDebugUnitTest --rerun-tasks
.\gradlew.bat assembleDebug
```

Observed:

```text
Vitest
247 files passed, 2 skipped
2,057 tests passed, 5 skipped

Playwright
74 tests passed

TypeScript
PASS

Vite production build
PASS — 3,212 modules
initial JS 555,473 / 560,000 bytes
initial CSS 129,399 / 150,000 bytes
feature-parity gate 9 / 9

Capacitor Android sync
PASS — 14 plugins discovered and synchronized

Gradle unit tests
PASS
TalosFileExportPolicyTest: 4 passed
ExampleUnitTest: 1 passed

Gradle APK assembly
BUILD SUCCESSFUL
```

The complete default Vitest run uses the repository-owned `maxWorkers: 4`
limit documented in the PDF load-stability ledger. Individual test timeouts
remain unchanged.

## APK provenance and integrity

Build artifact:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
39,897,780 bytes
SHA-256 7D187EB4FECD380067D5E397EE0A39F83B9B8F78A08FCC70CBB20D57E2C59F26
```

Desktop handoff:

```text
C:\Users\ninox\Desktop\TALOS-mobile-final-2026-07-28-r2.apk
39,897,780 bytes
SHA-256 7D187EB4FECD380067D5E397EE0A39F83B9B8F78A08FCC70CBB20D57E2C59F26
```

Verification:

```text
zipalign -c -P 16 4
PASS

apksigner verify --verbose --print-certs
PASS — APK Signature Scheme v2, one Android Debug signer

source/destination byte length
MATCH

source/destination SHA-256
MATCH
```

This is a debug-signed owner-test APK, not a release-store artifact.

## Deferred physical-device gates

ADB is unavailable on this workstation because the installed executable exits
before connecting to a device. That limitation does not invalidate the
automated gates above, but it prevents claiming the following as passed:

- install/update behavior and retained encrypted data;
- cold boot presentation on real Android hardware;
- SQLCipher relock/resume behavior through Android lifecycle transitions;
- Storage Access Framework save/cancel flows against device document providers;
- Custom Tab cookie, back-stack, and resume behavior;
- keyboard/inset behavior on a representative tablet;
- perceived streaming motion and Android reduced-motion behavior;
- speech recognition and system share regression checks.

These remain explicit owner checklist items. No Claude acknowledgement ticket
may be created until the owner reports every manual item successful.

## Git and rollback

- No commit was created.
- The Claude Code live session was not opened or modified.
- The `-r2` handoff APK was copied to a previously absent Desktop path; the
  earlier Desktop build was not overwritten.
- Product rollback remains governed by each individual P1-P10 ledger.
- Removing this evidence ledger does not change runtime behavior.

## R2 amendment - generated Library discovery

The handoff was rebuilt after the owner's physical transcript exposed an
additional retrieval regression:

- explicit `library_search` excluded every generated file;
- a score-zero query returned unrelated uploaded images as matches.

The R2 APK includes the RED-to-GREEN repair, bounded result totals/offsets, and
an end-to-end natural-language search/read regression using the owner's typoed
`ds4` scenario. Generated files remain excluded from automatic ambient
injection and enter the model only through the existing untrusted tool-result
boundary.

Fresh R2 evidence:

- focused generated-Library matrix: 44/44;
- affected tool/executor/controller matrix: 99/99;
- provider schema/wire matrix: 44/44;
- web-source/Library matrix: 144/144;
- complete Vitest: 2,057 passed, 5 skipped;
- complete Playwright: 74/74;
- forced Android app tests: 5/5, including export policy 4/4;
- build id embedded in the APK:
  `0e66f3b @ 2026-07-28T16:46:07.871Z`;
- Desktop source/destination byte length and SHA-256 match;
- Desktop APK independently passes zipalign and signature verification.

## R3 amendment - independent review blockers closed

R2 remained a preserved owner artifact. Its independent post-handoff review
identified additional blockers, which were handled sequentially before R3:

- outbound network tools now require explicit tool capability/consent;
- native web reads enforce public-address policy across DNS resolution,
  connection, and redirects through pinned OkHttp `5.4.0`;
- Library search packs only complete bounded records and supplies exact
  continuation offsets;
- Library matching is NFKC/case-normalized and Unicode-script aware;
- both Library surfaces use 48px minimum touch targets and consistent toggle
  semantics;
- post-picker SAF source validation and partial-destination cleanup are runtime
  tested rather than source-string inspected;
- the export activity ellipsis is canonical `U+2026`;
- TypeScript and Java filename bounding cannot split a UTF-16 surrogate pair.

Fresh final R3 commands and evidence on 2026-07-28:

```text
Vitest
249 files passed, 2 skipped
2,082 tests passed, 5 skipped

Vite production build
PASS - 3,213 modules
initial JS 555,480 / 560,000 bytes
initial CSS 129,354 / 150,000 bytes
feature-parity gate 9 / 9

Playwright
first complete run: 73 / 74; one strict selector became ambiguous after the
intended equal accessible names were added
focused amended journey: 3 / 3
final complete run: 74 / 74

TypeScript
PASS

Capacitor Android sync
PASS - 14 plugins; custom TalosFileExport and TalosSafeWeb registrations intact

Android JVM
PASS - 20 / 20 tests across five reports after --rerun-tasks

Gradle APK assembly
BUILD SUCCESSFUL

git diff --check
PASS - line-ending notices only
```

R3 build provenance:

```text
embedded build id
0e66f3b @ 2026-07-28T18:02:58.506Z

source
mobile/android/app/build/outputs/apk/debug/app-debug.apk

desktop handoff
C:\Users\ninox\Desktop\TALOS-mobile-final-2026-07-28-r3.apk

bytes
43,687,241

SHA-256
4B6A050E0E2876618B9EB0622D7ACD695AA25A1CBAE42BC00A20092418A3B836

zipalign -c -P 16 4
PASS

apksigner verify --verbose --print-certs
PASS - APK Signature Scheme v2, one Android Debug signer

source/destination length and SHA-256
MATCH

packaged-entry audit
1,592 entries; no test-results, findings, docs, Git metadata, Markdown or log
artifact packaged
```

The size increase from R2 was inspected entry-by-entry. The new non-hashed APK
resource is OkHttp's `assets/PublicSuffixDatabase.list`, and the DEX increase
corresponds to the pinned native safe-web dependency. No test output or local
finding was packaged.

The existing R2 file remains unchanged at 39,897,780 bytes and SHA-256
`7D187EB4FECD380067D5E397EE0A39F83B9B8F78A08FCC70CBB20D57E2C59F26`.

R3 status: automated gates CLOSED; independent read-only review in progress;
owner physical-device acceptance OPEN. No Claude acknowledgement ticket exists
or may be drafted before the owner closes every manual item.

## R4 amendment - all R3 review findings closed

R3 remains preserved as an owner artifact. Its independent post-handoff review
identified four further issues, handled sequentially before R4:

- tools with persistent Library side effects now require both `outbound` and
  `write`, with the permission contract represented and tested as a composite;
- Library tooling now has an explicit paginated browse/list path and searches
  the complete extracted text instead of only the 600-character preview;
- chat and global Library search share the same NFKC/case-normalized,
  symbol-aware matching policy, including emoji-only queries;
- all reviewed generated-document, generated-image, web-page, and search-dossier
  filenames use extended grapheme boundaries and a UTF-8 byte budget through
  pinned `unicode-segmenter@0.15.0` rather than raw UTF-16 slicing.

The upstream filename dependency is MIT licensed, recorded in provenance, has
no runtime dependencies, and is loaded as a separate dynamic chunk. Production
dependency audit reported zero vulnerabilities.

Fresh final R4 commands and evidence on 2026-07-28:

```text
Vitest
251 files passed, 2 skipped
2,118 tests passed, 5 skipped

Vite production build and TypeScript
PASS - 3,219 modules
initial JS 556,983 / 560,000 bytes
initial CSS 129,354 / 150,000 bytes
feature-parity gate 9 / 9
unicode grapheme dynamic chunk 7.72 kB (3.86 kB gzip)

Playwright
74 / 74 passed

Capacitor Android sync
PASS - 14 plugins; custom TalosFileExport and TalosSafeWeb registrations intact

Android JVM
PASS - 20 / 20 tests across five reports after --rerun-tasks

Gradle Java compile
BUILD SUCCESSFUL

Gradle APK assembly
BUILD SUCCESSFUL

npm audit --omit=dev
0 vulnerabilities

git diff --check
PASS - line-ending notices only
```

R4 build provenance:

```text
embedded build id
0e66f3b @ 2026-07-28T20:00:17.255Z

source
mobile/android/app/build/outputs/apk/debug/app-debug.apk

desktop handoff
C:\Users\ninox\Desktop\TALOS-mobile-final-2026-07-28-r4.apk

bytes
43,687,328

SHA-256
854A7FAD5C5177CFFD75B333BBD27BBFF986B7AD5C8289BD63CB6C3BE80EF4E5

zipalign -c -P 16 4
PASS

apksigner verify --verbose --print-certs
PASS - APK Signature Scheme v2, one Android Debug signer

source/destination length and SHA-256
MATCH
```

R4 status: automated gates CLOSED; independent post-delivery read-only review
in progress; owner physical-device acceptance OPEN. No commit was created, the
Claude Code live session was not opened or modified, and no Claude
acknowledgement ticket exists or may be drafted before the owner closes every
manual item.

## R5 amendment - owner backlog and post-R4 review closure

R4 remains preserved as an owner artifact. R5 incorporates the later owner
backlog and the closure work prompted by the R4 review, including:

- provider-aware OpenRouter/Gemini image routing and tool capability checks;
- composite permission gates for image generation, Library export, web
  archival and other side effects;
- chat/global Library parity for link presentation, complete-content
  discovery, pagination, file-type affordances, device export and overflow
  menus;
- smooth-reveal integrity at token and word boundaries;
- launcher-icon parity with the themed boot animation final frame;
- Model Lab deep-link routing from the sidebar;
- independent interface and chat font scaling;
- system-default English/Italian localization, unified first-run workspace
  setup and global profile-memory creation;
- persisted Agent Tools eligibility switches with bounded defaults;
- independent dictation-language selection and truthful speech diagnostics,
  where a healthy probe is trace evidence rather than a Recent Issue.

Fresh final R5 evidence on 2026-07-29:

```text
Vitest
259 files passed, 2 skipped
2,195 tests passed, 5 skipped

Vite production build and TypeScript
PASS - 3,239 modules
initial JS 559,798 / 560,000 bytes
initial CSS 132,986 / 150,000 bytes
feature-parity gate 9 / 9

Playwright
first complete run: 69 / 71; both failures were the same stale pre-i18n
lowercase title oracle
focused amended composer-state journey: 2 / 2
final complete run: 71 / 71

Capacitor Android sync
PASS - 14 pinned plugins, including speech recognition 8.1.7

Android JVM after --rerun-tasks
24 / 24 passed across six reports

Gradle APK assembly
BUILD SUCCESSFUL

npm audit --omit=dev
0 vulnerabilities

git diff --check
PASS - line-ending notices only
```

R5 build provenance:

```text
embedded build id
0e66f3b @ 2026-07-29T02:52:27.771Z

source
mobile/android/app/build/outputs/apk/debug/app-debug.apk

desktop handoff
C:\Users\ninox\Desktop\TALOS-mobile-final-2026-07-29-r5.apk

bytes
43,688,247

SHA-256
1DC5D9AF44E7D1996985E1DCDB0F4D2D4B1E3AA1C7E489C7FC9546603F9EDAC3

zipalign -c -P 16 4
PASS

apksigner verify --verbose --print-certs
PASS - APK Signature Scheme v2, one Android Debug signer

source/destination length and SHA-256
MATCH
```

R5 is a debug-signed owner-test APK, not a release-store artifact. Automated
gates are CLOSED and owner physical-device acceptance remains OPEN. A new
independent post-delivery R5 review was started only after the Desktop copy
passed integrity and signature verification. No commit was created, the Claude
Code live session was not opened or modified, and no Claude acknowledgement
ticket exists or may be drafted before the owner closes every manual item.

## R6 amendment - post-R5 review closure and Agent Tools verification

R5 remains preserved as an owner artifact. R6 closes every R5 review finding
and revalidates the owner's Agent Tools request:

- generated image tool payloads remain durable through execution and replay;
- global Library revocation reaches open chat state immediately;
- generated-file sharing and Library actions expose one coherent contract;
- TypeScript-emitted UI copy uses stable error identities plus localized
  presentation;
- export names preserve extended grapheme clusters;
- global and per-chat Library filters share one canonical file/link
  classifier;
- Android per-app locale restoration uses the official AppCompat storage
  bridge on Android 12 and earlier, with native state authoritative on Android
  13 and later;
- every one of the 12 executable chat tools has one Agent Tools toggle,
  persisted eligibility, an explicit enabled-by-default value, pre-schema
  filtering and a live executor recheck.

The complete unit gate initially found two stale provider endpoint assertions
that parsed former English prose. The permanent
`I18N-CONFORMANCE-09` regression now asserts the exact stable
`REQUIRED`, `PROTOCOL` and `CREDENTIALS` identities; production endpoint
validation was not changed.

Fresh final R6 evidence on 2026-07-29:

```text
Focused endpoint conformance
3 files, 10 / 10 passed

Vitest
263 files passed, 2 skipped
2,225 tests passed, 5 skipped out of 2,230

Playwright
71 / 71 passed

TypeScript
PASS

Vite production build
PASS - 3,240 modules
initial JS 555,764 / 560,000 bytes
initial CSS 132,986 / 150,000 bytes
feature-parity gate 9 / 9

Capacitor Android sync
PASS - 14 plugins

Android JVM after sync and --rerun-tasks
26 / 26 passed across six reports
248 / 248 task executions

Gradle APK assembly
BUILD SUCCESSFUL

npm audit --omit=dev
0 vulnerabilities

git diff --check
PASS - exit code 0; only existing CRLF conversion notices
```

The first two Android invocations stopped during toolchain configuration:
ambient Java 11 was below the Android Gradle Plugin minimum, and Java 17 could
not satisfy Capacitor Filesystem's Java 21 toolchain. The successful forced
gate and assembly used the repository-owned pinned Temurin
`21.0.11+10`; neither failed invocation executed application tests or required
a code/dependency change.

R6 build provenance:

```text
embedded build id
0e66f3b @ 2026-07-29T05:17:49.490Z

source
mobile/android/app/build/outputs/apk/debug/app-debug.apk

desktop handoff
C:\Users\ninox\Desktop\TALOS-mobile-final-2026-07-29-r6.apk

bytes
43,688,349

SHA-256
6A4D541A76D9721C4358C7F306A5FAACF889DB5DE5B0EF060BDE1718B97BB029

zipalign -c -P 16 4
PASS on source and Desktop copy

apksigner verify
PASS on source and Desktop copy - APK Signature Scheme v2, one Android Debug
signer

source/destination length and SHA-256
MATCH

packaged-entry audit
1,593 entries; no test-results, findings, docs, Git metadata, Markdown or log
artifact packaged
```

R6 is a debug-signed owner-test APK, not a release-store artifact. Automated
gates are CLOSED and owner physical-device acceptance remains OPEN. No commit
was created, the Claude Code live session was not opened or modified, and no
Claude acknowledgement ticket exists or may be drafted before the owner
reports every manual item successful.

## R7 amendment - additive Library policy and nonblocking tool authorization

R6 remains preserved as an owner artifact. R7 incorporates the approved R8/R9
contracts without changing the established conversation, model-switch or file
ownership semantics:

- Library context is additive and explicitly scoped at global, chat, one-turn
  and file level;
- every send owns one immutable context snapshot, including across model
  changes and retries;
- high-risk automatic context injection is buffered and may perform at most one
  no-tool correction against that same snapshot;
- tool, abort and visible-partial paths are never silently replayed;
- tool authorization can be granted once or permanently and resumes the
  original conversation without detaching it;
- live revocation removes Library access from already-open chat state;
- deterministic abstention is localized when relevance cannot be established;
- parity and provenance documents name the adopted, adapted and rejected
  upstream contracts and the lexical-retrieval limitation.

Fresh final R7 evidence on 2026-07-29:

```text
R8/R9 focused unit matrix
26 files, 338 / 338 passed

Vitest
278 files passed, 2 skipped
2,411 tests passed, 5 skipped
zero failures

Playwright
79 / 79 passed

TypeScript
PASS

feature parity
9 / 9 passed

production build
PASS - 3,258 modules
initial JavaScript 536,264 / 560,000 bytes
initial CSS 136,268 / 150,000 bytes

npm audit --omit=dev
0 vulnerabilities

Capacitor Android sync
PASS - 14 plugins

Android JVM after --rerun-tasks
27 / 27 passed across six reports

Gradle APK assembly after the final source whitespace correction
BUILD SUCCESSFUL - 518 tasks, 27 executed, 491 up-to-date

git diff --check
PASS - line-ending notices only
```

R7 build provenance:

```text
embedded build id
0e66f3b @ 2026-07-29T16:32:45.084Z

source
mobile/android/app/build/outputs/apk/debug/app-debug.apk

Desktop owner-test copy
C:\Users\ninox\Desktop\TALOS-mobile-final-2026-07-29-r7.apk

source/Desktop byte length
43,689,479

source/Desktop SHA-256
4AA893D8B1DDEDCCD87976D1F41591410ECC2C3E32A5A1F143F1519207CAF709

zipalign -c -P 16 4
PASS on source and Desktop copy

apksigner verify
PASS on source and Desktop copy - APK Signature Scheme v2, one Android Debug
signer

source/destination length and SHA-256
MATCH

packaged-entry audit
1,604 entries; no test-results, findings, docs, Git metadata, Markdown or log
artifact packaged
```

R7 is a debug-signed owner-test APK, not a release-store artifact. Automated
pre-review gates are CLOSED and owner physical-device acceptance remains OPEN.
The independent R7 review may start only after the verified Desktop copy above;
its findings must be repaired sequentially and verified before a post-review
APK is produced. No commit was created, the Claude Code live session was not
opened or modified, and no Claude acknowledgement ticket exists or may be
drafted before the owner reports every manual item successful and gives an
explicit final go-ahead.
