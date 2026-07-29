# P2-B research - Well-formed UTF-16 export filenames

Date: 2026-07-28

## Local finding

Both export-name policy implementations retain an extension and truncate the
stem at a 180-UTF-16-code-unit budget:

- TypeScript `talosSafeExportName()` uses `name.slice(0, stemLimit)`;
- Java `TalosFileExportPolicy.safeDisplayName()` uses
  `name.substring(0, stemLimit)`.

If `stemLimit` lands between a high and low surrogate, each implementation
creates a lone high surrogate followed by the extension. The defect is
deterministic with 175 ASCII characters, one supplementary emoji, trailing
text, and `.pdf`.

## Current primary sources

- Unicode Standard 17.0, Chapter 3, inspected 2026-07-28:
  <https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/>
- Unicode Standard, Chapter 5.4, inspected 2026-07-28:
  <https://www.unicode.org/versions/Unicode16.0.0/core-spec/chapter-5/>
- ECMAScript living specification, String value, inspected 2026-07-28:
  <https://tc39.es/ecma262/#sec-ecmascript-language-types-string-type>
- Java SE 17 `Character`, inspected 2026-07-28:
  <https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Character.html>
- Unicode Standard Annex #29 revision 47, inspected 2026-07-28:
  <https://www.unicode.org/reports/tr29/>

Unicode defines supplementary code points in UTF-16 as a high-surrogate code
unit followed by a low-surrogate code unit. Its well-formedness rules do not
allow either half to be isolated. ECMAScript strings and Java strings expose
16-bit code-unit indexing, so raw `slice`/`substring` boundaries must account
for the pair explicitly. Java's `Character.isSurrogatePair` is the direct
standard-library predicate.

UAX #29 defines extended grapheme clusters for user-perceived characters. That
is a broader UI-segmentation contract than the present storage-boundary defect:
a combining sequence split at a valid scalar boundary remains well-formed
Unicode, while a split surrogate pair does not.

## Upstream decision

Adapt behind the existing AVM-owned export-name adapters:

- preserve the established 180-code-unit maximum and suffix rules;
- before slicing the stem, detect whether the boundary separates a valid high
  and low surrogate;
- if so, move the boundary back by one code unit;
- implement the same predicate in TypeScript and Java and lock parity with the
  same regression fixture.

Reject for this slice:

- raw `slice`/`substring`, because they reproduce the defect;
- changing the budget to 180 code points, because that can materially increase
  the provider-facing UTF-16/byte length;
- `Intl.Segmenter`, Java `BreakIterator`, or an ICU dependency, because complete
  grapheme segmentation is not needed to restore encoding well-formedness and
  would introduce runtime/version parity risk.

## Pin and rollback

Pins: Unicode 17.0 encoding definitions, ECMAScript living String definition,
and Java SE 17 `Character` API as inspected on 2026-07-28.

Rollback restores only the two private boundary helpers/calls and paired tests.
No protocol, storage, permission, or native registration changes.
