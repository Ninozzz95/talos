# Execution ledger - P2-C generated filename grapheme integrity

- Subsystem: TALOS mobile document/image/web-source filename producers
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins:
  - Unicode 17.0.0, UAX #29 revision 47
  - Unicode 17.0.0, UAX #15 revision 57
  - RFC 3629
  - `unicode-segmenter@0.15.0`, MIT,
    git head `fa2356dd197c982cf0b2cc4f8d676f64ba92460a`
  - npm integrity
    `sha512-Xmvwqx4F8nGuCv2eGPJVJq73NMTfpqx2Xe9/v5hQoyAUnERVhX+sRkyYVdYoBUbnTok2FTBOlstUeQ5sRleXSA==`
- Upstream decision: adopt the maintained UAX #29 implementation directly,
  behind one lazy AVM-owned UTF-8 filename adapter.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p2-generated-filename-grapheme-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p2-generated-filename-grapheme-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p2-generated-filename-grapheme-ledger.md`
- `mobile/upstream/licenses/unicode-segmenter-0.15.0-MIT.txt`
- `mobile/src/lib/fileNamePolicy.ts`
- `mobile/tests/unit/lib/fileNamePolicy.test.ts`

Modify:

- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/docs/upstream-provenance.md`
- `mobile/src/lib/documents/documentGenerator.ts`
- `mobile/tests/unit/documents/documentGeneration.test.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/tests/unit/chat/chatController.test.ts`
- `mobile/src/lib/search/webSourceArchive.ts`
- `mobile/tests/unit/search/webSourceArchive.test.ts`

Delete: none.

## Symbols and compatibility

Public addition:

- `talosSafeFileStem(value, maxUtf8Bytes, fallback): Promise<string>`

Private changes:

- `documentGenerator.safeFileName(...)` becomes async;
- `webSourceArchive.safeTitle(...)` becomes async;
- `webSourceArchive.searchDossierName(...)` becomes async.

Stable:

- `generateTalosDocument`
- `createChatController`
- `createTalosWebSourceArchive`
- every tool/schema/repository/permission contract
- document/image/web file extensions and ASCII fallback names
- document and image bytes

## RED tests

- `P2-FILENAME-01 shared policy keeps extended grapheme clusters whole under a UTF-8 budget`
- `P2-FILENAME-02 NFKC runs before separator/control filtering`
- `P2-FILENAME-03 document title cannot persist a lone surrogate`
- `P2-FILENAME-04 generated-image prompt cannot persist a lone surrogate`
- `P2-FILENAME-05 web page and search dossier names cannot persist a lone surrogate`
- `P2-FILENAME-06 ASCII names/extensions remain compatible`
- `P2-FILENAME-08 parallel web archive calls retain synchronous claim order`
- `P2-FILENAME-09 web-read filename reaches the central policy before display-title filtering`

Expected RED on the current product:

- document and image names end in an isolated high surrogate;
- web page/search names do the same at their old code-unit boundary;
- the shared policy module does not exist.

## RED command

```text
npx vitest run tests/unit/documents/documentGeneration.test.ts tests/unit/chat/chatController.test.ts tests/unit/search/webSourceArchive.test.ts tests/unit/lib/fileNamePolicy.test.ts
```

## GREEN and regression gates

```text
npx vitest run tests/unit/lib/fileNamePolicy.test.ts tests/unit/documents/documentGeneration.test.ts tests/unit/search/webSourceArchive.test.ts tests/unit/chat/chatController.test.ts
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
git diff --check
```

The final pre-APK gate additionally repeats Capacitor sync, the complete
Android JVM suite, Java compilation, APK assembly, source/destination hash
comparison, zipalign, and signature verification.

## Real-upstream gate

- lockfile resolves exactly `unicode-segmenter@0.15.0` with the recorded
  integrity;
- focused tests execute the real `splitGraphemes()` path on Unicode 17
  combining, flag, keycap, and ZWJ fixtures;
- production build emits a lazy segmenter chunk and keeps the initial entry
  below 560,000 bytes.

## Human proof

Generate document/image/web-source names crossing the old boundary at emoji,
inspect both Library surfaces, then export one through Android Save-As. No
replacement glyph, partial emoji, missing extension, or unexpected fallback is
accepted.

## Rollback

Remove the dependency/adapter and use fixed ASCII fallback stems. Never restore
raw UTF-16 truncation. No migration or stored-data rewrite is involved.

## Closure record

Research and exact execution ledger completed on 2026-07-28.

RED established on 2026-07-28:

- focused matrix: 58 compatibility tests passed;
- document, generated-image, and web-search dossier scenarios each failed
  with the exact isolated high surrogate rendered as a replacement glyph;
- the shared-policy suite failed collection because
  `@/lib/fileNamePolicy` does not yet exist.

Status: RED. Product implementation may begin.

Ledger amendment before source implementation:

- the installed upstream package inspection confirmed that its MIT copyright
  and permission notice must accompany substantial copies;
- add the exact packaged notice at
  `mobile/upstream/licenses/unicode-segmenter-0.15.0-MIT.txt`;
- no product symbol, runtime behavior, or other ownership entry changes.

Implementation amendment after the first GREEN attempt:

- the existing `WEB-LIB-02` regression test caught an ordering change because
  awaiting grapheme segmentation inside the result-claim loop allowed two
  concurrent searches to interleave;
- preserve the established contract by keeping source-title sanitation and the
  entire claim loop synchronous;
- use the async upstream segmenter only for the actual dossier filename after
  claims are complete, and for the web-read filename after its display title
  is derived;
- add `P2-FILENAME-08` permanently. No file ownership changes.

Pre-closure self-review amendment:

- `rememberPage()` passed its separately sanitized display title into the
  central filename policy; that display sanitizer intentionally removes ZWJ,
  so a family emoji could be split before the UAX #29 boundary saw it;
- add `P2-FILENAME-09` and pass the original untrusted page title directly to
  the central filename adapter. The adapter owns its own path/control/bidi
  sanitation and retains meaningful ZWJ/ZWNJ;
- no file ownership or public contract changes.

Final GREEN evidence on 2026-07-28:

- final focused producer/policy matrix: 65/65;
- affected document/image/search/controller matrix before the ZWJ amendment:
  168/168; the amended web archive suite then passed 8/8;
- final complete Vitest: 251 files passed, 2 skipped; 2,118 tests passed,
  5 skipped; only the four established jsdom canvas notices remained;
- final typecheck: passed through the production build;
- final Vite build: 3,219 modules; initial JavaScript
  556,983/560,000 bytes; CSS 129,354/150,000 bytes;
- real upstream `unicode-segmenter/grapheme` emitted as a 7.72 kB dynamic
  entry, not the initial bundle;
- feature parity: 9/9;
- final complete Playwright: 74/74;
- production dependency audit (`--omit=dev`): zero vulnerabilities and no
  finding for `unicode-segmenter`;
- package and lockfile resolve exact `0.15.0`, MIT, with the recorded registry
  integrity;
- review-identified raw filename slices: none;
- full `git diff --check`: passed with line-ending notices only.

The concurrent web-archive claim order and original ZWJ page-title path remain
covered by permanent regression tests.

Status: **CLOSED**. Full Android pre-APK gates may begin.
