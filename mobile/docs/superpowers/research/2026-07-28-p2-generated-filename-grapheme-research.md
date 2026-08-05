# P2-C research - Unicode-safe generated filenames

Date: 2026-07-28

Subsystem: TALOS mobile document, generated-image, and web-source filename
producers.

Lane: `<corsia locale>`

Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduced defect

The independent R3 review found three filename producers that still truncate
untrusted/user-visible text with JavaScript `slice()`:

- document titles at 60 UTF-16 code units;
- generated-image prompts at 48 UTF-16 code units;
- web-source titles and search-query stems through `oneLine()`.

With 59 ASCII characters followed by `U+1F600`, the document boundary retains
only the high surrogate. The resulting Library display name is not a
well-formed Unicode string before the later Android export policy can repair
anything. The image boundary reproduces the same defect after 47 ASCII
characters. Raw code-point truncation would fix the surrogate pair but could
still split combining sequences, emoji modifiers, regional-indicator flags,
keycaps, or ZWJ families.

## Current primary standards

### Unicode text segmentation

Source: <https://www.unicode.org/reports/tr29/tr29-47.html>

Pin: Unicode 17.0.0, UAX #29 revision 47, inspected 2026-07-28.

UAX #29 defines extended grapheme clusters as the default boundary for
user-perceived characters and recommends the extended rules. A persisted
display name is user-visible text, so a truncation boundary must occur between
complete extended grapheme clusters rather than between UTF-16 units or scalar
values.

### Unicode normalization

Source: <https://www.unicode.org/reports/tr15/tr15-57.html>

Pin: Unicode 17.0.0, UAX #15 revision 57, inspected 2026-07-28.

NFKC is appropriate inside the filename policy boundary: it maps compatibility
separators such as full-width solidus before path-character filtering. The
document body, prompt, page text, and source URL remain byte-for-byte
unchanged; normalization applies only to the derived display-name stem.

### UTF-8

Source: <https://www.rfc-editor.org/info/rfc3629/>

Pin: RFC 3629, inspected 2026-07-28.

Filesystem/provider limits ultimately apply to encoded names. A JavaScript
code-unit budget gives supplementary and non-Latin text unpredictable encoded
sizes. Each filename stem therefore keeps its existing numeric ceiling but
interprets it as a UTF-8 byte budget, appending an entire grapheme only when
the encoded result still fits.

### Android document display names

Sources:

- <https://developer.android.com/reference/android/content/Intent#ACTION_CREATE_DOCUMENT>
- <https://developer.android.com/reference/android/provider/DocumentsContract.Document#COLUMN_DISPLAY_NAME>

Pins: Android API reference inspected 2026-07-28.

`ACTION_CREATE_DOCUMENT` accepts an initial display name that the user can
change, and `COLUMN_DISPLAY_NAME` is the primary user-visible title. The
Library-generated name is therefore presentation data with a real downstream
SAF contract, not an opaque internal key.

## Maintained upstream evaluation

### Adopt: `unicode-segmenter@0.15.0`

Primary repository:
<https://github.com/cometkim/unicode-segmenter>

Registry provenance inspected with `npm view` on 2026-07-28:

- version: `0.15.0`;
- license: MIT;
- git head: `fa2356dd197c982cf0b2cc4f8d676f64ba92460a`;
- integrity:
  `sha512-Xmvwqx4F8nGuCv2eGPJVJq73NMTfpqx2Xe9/v5hQoyAUnERVhX+sRkyYVdYoBUbnTok2FTBOlstUeQ5sRleXSA==`;
- zero runtime dependencies;
- Unicode data: 17.0.0 / UAX #29 revision 47.

The package exposes `splitGraphemes()` from
`unicode-segmenter/grapheme`, is ESM-first, and documents verification against
the official Unicode segmentation suite. It is loaded dynamically so the
roughly 4.9 kB minified segmenter does not consume the already-tight initial
chat chunk budget.

### Rejected alternatives

- `String.slice()`/`substring()`: reproduce malformed UTF-16.
- `Array.from()` or code-point iteration alone: preserves scalar values but
  splits multi-code-point grapheme clusters.
- host-only `Intl.Segmenter`: Chromium support is mature, but its embedded
  Unicode/ICU version follows the installed Android System WebView and is not
  pinned by the APK. It cannot provide deterministic Unicode 17 conformance
  across owner devices.
- `graphemer@1.4.0`: Unicode 15 and approximately 95 kB minified according to
  its maintained-upstream comparison; stale for this Unicode 17 contract.
- `grapheme-splitter@1.0.4`: Unicode 10 and last published years ago.
- a hand-written partial ZWJ/combining algorithm: fails the direct-upstream
  rule and would reproduce a standards algorithm locally.

## AVM adapter decision

Adopt `unicode-segmenter@0.15.0` directly and adapt it behind one AVM-owned
async policy:

`talosSafeFileStem(value, maxUtf8Bytes, fallback)`.

The adapter:

1. NFKC-normalizes only the derived stem;
2. replaces forbidden path characters with spaces;
3. removes controls, bidi formatting controls, hidden soft-hyphen/BOM, and
   malformed lone surrogates while retaining meaningful ZWNJ/ZWJ sequences;
4. collapses whitespace;
5. iterates real upstream extended grapheme clusters;
6. appends only complete clusters that fit the UTF-8 byte budget;
7. returns an ASCII fallback when nothing safe fits.

Extensions are appended by the owning producer and do not enter the stem
budget. Existing ASCII names, format selection, file bytes, storage,
permissions, and export behavior remain unchanged.

## Health, upgrade, and rollback

- Health gate: exact dependency/version/integrity in the lockfile, focused
  grapheme fixtures, production chunk-budget gate, and full unit/build/E2E
  suites.
- Upgrade gate: review the new package's Unicode pin, license, integrity,
  official-suite claim, bundle delta, and rerun all named filename fixtures.
- Rollback: remove the package and adapter, and temporarily use fixed ASCII
  fallback stems (`document`, `image`, `results`, or host) until another
  UAX #29 implementation is approved. Never restore raw UTF-16 truncation.

