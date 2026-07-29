# P2-A research - Unicode-safe tool activity punctuation

Date: 2026-07-28

## Local finding

`src/lib/tools/toolLabels.ts` contains one literal three-code-point mojibake
sequence in the long `library_export` detail branch:

- actual code points: `U+00E2 U+20AC U+00A6`;
- intended code point: `U+2026 HORIZONTAL ELLIPSIS`;
- the adjacent long-query branch already contains the intended `U+2026`.

The result is user-visible while the export tool runs. A UTF-8 read of the file
confirmed the code points directly; this is not a PowerShell display artifact.

## Current primary source

- Unicode Standard 17.0, Chapter 6, inspected 2026-07-28:
  <https://unicode.org/versions/Unicode17.0.0/core-spec/chapter-6/>

The Unicode Standard identifies `U+2026 HORIZONTAL ELLIPSIS` as the ordinary
character intended to represent an ellipsis in text.

## Upstream decision

Adopt directly: use the literal Unicode `…` already used by the neighboring
query branch and asserted elsewhere in this codebase.

Reject:

- retaining the mojibake sequence, because it is three unrelated characters;
- replacing it with three ASCII full stops, because that would diverge from the
  existing activity-label convention;
- introducing an encoding/typography dependency for one canonical Unicode
  punctuation character.

## Pin and rollback

Pin: Unicode 17.0 Chapter 6 as inspected on 2026-07-28.

Rollback is the two-file product/test delta only. There is no persistence,
protocol, or native migration.
