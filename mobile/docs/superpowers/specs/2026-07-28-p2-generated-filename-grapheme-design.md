# P2-C design - Grapheme-safe generated filenames

Date: 2026-07-28

Status: authorized by the owner's autonomous sequential-fix instruction.

## Goal

Every R3-review-identified filename producer must create a well-formed,
filesystem-safe stem at an extended-grapheme boundary and under a deterministic
UTF-8 byte budget.

## Shared policy

Create `src/lib/fileNamePolicy.ts` with:

```ts
talosSafeFileStem(
    value: string,
    maxUtf8Bytes: number,
    fallback: string,
): Promise<string>
```

The function is async because it dynamically imports the pinned
`unicode-segmenter/grapheme` entry. It normalizes and sanitizes before
segmentation, then accumulates complete graphemes while a reusable
`TextEncoder` proves the UTF-8 budget.

Invalid budgets fail closed to a safely sanitized fallback. Unpaired UTF-16
surrogates are removed before segmentation. ZWJ and ZWNJ remain because they
are meaningful parts of emoji and writing-system graphemes; bidi
embedding/override/isolate controls do not.

## Producer integration

- `documentGenerator.safeFileName()` becomes async and derives its 60-byte
  stem through the shared policy before appending the requested format.
- the `generate_image` save path derives its 48-byte stem through the same
  policy before appending `jpg` or `png`.
- `webSourceArchive` derives both 200-byte page-title stems and 60-byte search
  dossier stems through the same policy. Source URLs and page bodies remain
  unchanged.

The web archive may keep separate bounded evidence helpers for non-filename
text. They are not permitted to feed a persisted file name.

## Compatibility

- ASCII input produces the same names and punctuation as before.
- Forbidden path characters continue to become spaces.
- Existing fallbacks and extensions stay exactly `document`, `image`,
  `results`, host, and the current format.
- No schema, database migration, repository contract, permission, or Android
  plugin changes.
- The segmenter is a lazy Vite chunk and must not push the initial JS entry
  above its existing 560,000-byte gate.

## Named acceptance scenarios

- `P2-FILENAME-01 shared policy keeps extended grapheme clusters whole under a UTF-8 budget`
- `P2-FILENAME-02 NFKC runs before separator/control filtering`
- `P2-FILENAME-03 document title cannot persist a lone surrogate`
- `P2-FILENAME-04 generated-image prompt cannot persist a lone surrogate`
- `P2-FILENAME-05 web page and search dossier names cannot persist a lone surrogate`
- `P2-FILENAME-06 ASCII names/extensions remain compatible`
- `P2-FILENAME-07 unicode-segmenter remains outside the initial chunk budget`

Fixtures include a supplementary emoji at the old boundary, a combining
accent, a keycap, a regional-indicator flag, and a family ZWJ sequence.

## Human-visible proof

On the physical APK:

1. generate a document whose long title crosses the limit at an emoji;
2. generate an image whose long prompt crosses the limit at an emoji/ZWJ
   family;
3. save a web-read page with a long non-Latin/emoji title;
4. verify Library and per-chat Library show clean complete glyphs, correct
   extensions, and no replacement character;
5. export one item through Android Save-As and verify the proposed name is
   equally clean.

## Rollback

Remove the dependency and adapter and use fixed ASCII stems until a reviewed
replacement is available. No stored owner data is rewritten.

