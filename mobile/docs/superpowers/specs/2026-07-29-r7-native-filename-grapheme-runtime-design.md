# R7 design - Runtime-independent native filename boundary

## Goal

Every native filename truncation must stop before a complete Unicode extended
grapheme cluster on JDK 17, the JDK 21 Android build host, and supported Android
API 26+ runtimes.

## Implementation

Inside `TalosFileExportPolicy`:

- replace the private `BreakIterator` dependency with one
  `Pattern.compile("\\X")`;
- create a matcher for the normalized/sanitized display name;
- advance while `matcher.find()` and `matcher.end() <= maxCodeUnits`;
- return the substring ending at the last accepted complete match.

The fast path when the complete value fits remains unchanged. The sanitizer,
NFKC ordering, forbidden/control/bidi policy, extension detection,
180-code-unit ceiling, fallback, media type, source validation and copy
contracts remain byte-for-byte compatible.

## Permanent scenarios

- `NATIVE-FILENAME-EGC-01 JDK 17 does not retain half a flag`
- `NATIVE-FILENAME-EGC-02 combining sequence stays whole at the limit`
- `NATIVE-FILENAME-EGC-03 keycap/emoji modifier/ZWJ clusters stay whole`
- Existing path, suffix, sanitizer, media type, source re-check and byte-copy
  tests remain green.

## Rollback

Restore only the private prefix implementation/import and focused fixtures.
No stored filename or user file is rewritten.
