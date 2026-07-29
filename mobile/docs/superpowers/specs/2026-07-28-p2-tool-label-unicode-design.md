# P2-A design - Tool activity ellipsis integrity

## Goal

Long `library_export` references must end with exactly one
`U+2026 HORIZONTAL ELLIPSIS`, never mojibake, while retaining the established
48-code-unit-prefix behavior and argument redaction.

## Design

1. Characterize the long export-reference branch with an exact expected string.
2. Prove RED against the current three-code-point mojibake suffix.
3. Replace only that suffix with the canonical `…` literal.
4. Run the complete tool-label suite, typecheck, and scoped diff check.

The 48-unit truncation algorithm is intentionally unchanged in this slice.
Unicode-safe bounded filename handling is a separate sequential P2 finding.

## Compatibility

- Tool wire names, labels, icons, and argument schema remain unchanged.
- Short references and redaction behavior remain unchanged.
- Unknown-tool and web/library-read fallbacks remain unchanged.
