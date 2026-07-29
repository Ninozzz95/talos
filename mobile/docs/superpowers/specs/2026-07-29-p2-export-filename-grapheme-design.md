# P2-E design - Grapheme-safe device export names

## Goal

Every browser-download and Android SAF suggested filename must end its bounded
stem at a complete Unicode extended grapheme cluster while preserving the
existing sanitation, suffix, fallback and 180-UTF-16-unit contracts.

## TypeScript boundary

`saveVaultFileToDevice.ts` imports `splitGraphemes` from the pinned
`unicode-segmenter/grapheme` entry. Private
`safeGraphemePrefix(value, maxCodeUnits)` appends complete clusters until the
next cluster would exceed the budget. `talosSafeExportName()` remains
synchronous and otherwise unchanged.

The sanitizer keeps ZWNJ and ZWJ, but continues removing the other zero-width
and bidi controls already denied by the filename policy.

## Java/Android boundary

`TalosFileExportPolicy.safeGraphemePrefix(String, int)` uses
`BreakIterator.getCharacterInstance(Locale.ROOT)` and returns the greatest
reported boundary at or below the code-unit budget. `safeDisplayName()` retains
the same public/package-visible contract and suffix logic.

## Named scenarios

- `EXPORT-NAME-EGC-01 TypeScript never retains half a flag at the stem limit`
- `EXPORT-NAME-EGC-02 Java never retains half a flag at the stem limit`
- `EXPORT-NAME-EGC-03 both policies preserve meaningful ZWJ and ZWNJ`
- `EXPORT-NAME-EGC-04 suffix and 180-code-unit limits remain compatible`
- `EXPORT-NAME-EGC-05 the real segmenter remains outside the initial graph`

## Verification

Establish independent Vitest and JVM REDs, implement each runtime, rerun both
focused suites, then the affected service/Android suites, typecheck, production
build, Java compilation, APK-unit gate and diff check. Physical Android
Save-As remains a manual acceptance item.

