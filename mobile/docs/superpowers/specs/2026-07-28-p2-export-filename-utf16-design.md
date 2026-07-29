# P2-B design - Well-formed bounded export names

## Goal

The TypeScript staging policy and Android SAF policy must never create an
unpaired surrogate while bounding a suggested filename. Existing sanitation,
180-code-unit maximum, short-suffix preservation, fallbacks, and error
contracts remain unchanged.

## Design

Add one private helper in each runtime:

- TypeScript `safeUtf16Prefix(value, maxCodeUnits)`;
- Java `safeUtf16Prefix(String, int)`.

Each helper:

1. clamps the requested boundary to the string;
2. checks the code unit immediately before and at the boundary;
3. recognizes only a valid high/low surrogate pair;
4. moves the boundary back by one when it would split that pair;
5. returns the prefix at the safe boundary.

`talosSafeExportName()` and `safeDisplayName()` use the helper only for the
bounded stem. Full suffixes are still appended exactly as before.

## Regression fixture

Input:

- 175 ASCII `a` characters;
- `U+1F600 GRINNING FACE`;
- `tail`;
- `.pdf`.

The old 176-unit stem cut leaves only the high surrogate. The corrected result
is the 175 ASCII characters plus `.pdf`, remains under 180 UTF-16 units, and
contains no unpaired surrogate.

## Verification

Prove RED independently in Vitest and the JVM test. Then run both focused GREEN
gates, complete affected service/native suites, typecheck, Java compilation,
and scoped diff check. Full APK gates repeat both runtimes.
