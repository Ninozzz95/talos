# P2-E research - Device export names at grapheme boundaries

Date: 2026-07-29  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Local diagnosis

The prior export hardening correctly prevents a 180-code-unit truncation from
creating an unpaired UTF-16 surrogate. It does not guarantee a user-perceived
character boundary:

- TypeScript `safeUtf16Prefix()` may retain one regional-indicator code point
  from a two-code-point flag;
- Java `safeUtf16Prefix()` has the same behavior;
- both export sanitizers remove U+200C ZWNJ and U+200D ZWJ before truncation,
  although those code points are meaningful parts of writing-system and emoji
  grapheme clusters.

The normal path crosses both policies: TypeScript proposes the Android SAF
display name and Java validates it again. Web downloads use the TypeScript
result only.

## Current primary sources

1. Unicode Standard Annex #29 revision 47 / Unicode 17:
   <https://www.unicode.org/reports/tr29/tr29-47.html>
   - extended grapheme clusters represent user-perceived characters;
   - GB9 retains Extend/ZWJ, GB11 retains emoji ZWJ sequences, and GB12/GB13
     retain paired regional indicators.
2. OpenJDK JDK-8292992:
   <https://bugs.openjdk.org/browse/JDK-8292992>
   - since JDK 20, character `BreakIterator` conforms to UAX #29 extended
     grapheme clusters;
   - the release fixture explicitly treats a flag and family ZWJ sequence as
     whole graphemes.
3. Android `java.text.BreakIterator`:
   <https://developer.android.com/reference/java/text/BreakIterator>
   - character-boundary analysis covers supplementary and combining
     sequences as user-facing characters.
4. Android libcore implementation:
   <https://android.googlesource.com/platform/libcore/+/7280299/luni/src/main/java/java/text/BreakIterator.java>
   - Android's Java boundary delegates to the platform ICU implementation.
5. Existing pinned upstream:
   `unicode-segmenter@0.15.0`, Unicode 17 / UAX #29 revision 47, MIT.
   Package provenance, integrity and license are already recorded in
   `docs/upstream-provenance.md`.

## Upstream decision

**ADOPT directly** the already pinned `unicode-segmenter/grapheme` entry in the
existing lazy device-save chunk. Do not add a second JavaScript segmenter and
do not use host-dependent `Intl.Segmenter`.

**ADAPT** Java/Android's maintained `java.text.BreakIterator` behind
`TalosFileExportPolicy`. The installed Android ICU version can vary by OS, so
the TypeScript Unicode-17 policy remains authoritative on the normal product
path. Java sees that already-bounded name under 180 units and leaves it
unchanged; its iterator is defense in depth for direct/malformed bridge calls.
The regression fixtures use long-established flag, combining and ZWJ rules
rather than Unicode-17-only additions.

No new package, permission, storage schema or wire contract is needed.

## Security and compatibility

- Keep NFKC-before-filtering, path separator/control/bidi removal, leading-dot
  defense, short-suffix preservation and the 180-code-unit ceiling.
- Continue removing U+200B, U+200E/U+200F and bidi embeddings/isolates.
- Preserve only U+200C/U+200D because UAX #29 uses them inside meaningful
  graphemes; neither is interpreted as a path separator by the SAF label
  boundary.
- The TypeScript function remains synchronous because every caller and test
  already relies on that contract. Its module is itself dynamically imported,
  so the static segmenter dependency stays outside the initial graph.

