# R7 research - Native filename grapheme runtime

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduced root cause

`TalosFileExportPolicy.safeGraphemePrefix()` uses
`java.text.BreakIterator.getCharacterInstance()`. The implementation is
runtime-dependent:

- JDK 21 implements current extended grapheme behavior and passes the existing
  regional-indicator fixture;
- the installed Temurin JDK 17.0.4 runs the exact same policy/test sources but
  reports a boundary between the two code points of the Italian flag;
- the 180-code-unit filename truncation then retains one regional indicator,
  producing a visibly broken name before `.pdf`.

Fresh standalone JDK 17 evidence:

```text
JUnit 4.13.2
Tests run: 9, Failures: 1
neverRetainsHalfAFlagAtTheBoundedFilenameStem
expected 174 x "a" + ".pdf"
received 174 x "a" + one regional indicator + ".pdf"
```

The normal TypeScript path is already bounded with pinned
`unicode-segmenter`, but the native policy is a security/compatibility boundary
for direct bridge calls and provider-returned display names. It cannot depend
on a JDK release-specific `BreakIterator` improvement.

## Current primary sources

Accessed 2026-07-29:

1. Unicode UAX #29 revision 47:
   <https://www.unicode.org/reports/tr29/tr29-47.html>
   - extended grapheme clusters are the user-perceived boundary;
   - GB12/GB13 keep regional indicators paired;
   - GB9/GB11 cover combining, modifier, and ZWJ sequences.
2. Java SE 17 `java.util.regex.Pattern`:
   <https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/regex/Pattern.html>
   - `\X` is the standard Unicode extended-grapheme-cluster matcher;
   - `Pattern` claims UTS #18 RL2.2 support.
3. Android `java.util.regex.Pattern`:
   <https://developer.android.com/reference/java/util/regex/Pattern>
   - the Android API documents `\X` as “Any Unicode extended grapheme
     cluster”.
4. Android API 29 libcore primary source, representative of the legacy engine
   used within TALOS's API 26+ range:
   <https://android.googlesource.com/platform/prebuilts/fullsdk/sources/android-29/+/refs/heads/main/java/util/regex/Pattern.java>
   - Android delegates Java regex compilation/matching to native ICU.
5. ICU regular expressions:
   <https://unicode-org.github.io/icu/userguide/strings/regexp.html>
   - ICU defines `\X` as one grapheme cluster.

## Upstream decision

**ADOPT directly** the standard `java.util.regex.Pattern` `\X` contract.
Compile one static immutable pattern and advance by successive matcher ends.
Only accept a complete match when its UTF-16 end index is at or below the
existing stem budget.

**REJECT** keeping `java.text.BreakIterator`: the reproduced JDK 17 result is
not extended-grapheme-safe. **REJECT** a handwritten subset of GB rules:
regional indicators alone would fix this fixture while leaving newer
combining/emoji rules fragmented. **REJECT** bundling ICU4J: Android already
provides ICU behind its regex engine and a second multi-megabyte runtime would
duplicate it.

This change adds no package, permission, API, schema, storage format, or bundle
weight. The installed JDK 17 direct gate, pinned JDK 21 Gradle gate, and
physical Android API 26+ Save-As check cover the three relevant engines.
