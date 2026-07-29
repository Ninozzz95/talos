# P1 source-file extension fidelity research

Date: 2026-07-28  
Subsystem: TALOS mobile document generation / Library  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Owner evidence and local diagnosis

The physical transcript asks TALOS to save
`patch_mock_gps_iterm.py`. The model can only call
`document_create(format: "md")`, so the generated Library item is described as
a Python script but stored as Markdown. If the title already contains `.py`,
the current filename builder appends the selected document extension and
produces `.py.md`.

The ingestion and Library-presentation layers already recognize common source
extensions, including `.py`. The missing contract is solely at generation:
`TALOS_DOCUMENT_FORMATS` exposes only rich documents and three prose/table text
formats.

## Current standards and mature behavior

### ChatGPT Canvas

- Source:
  `https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it`
- Retrieved: 2026-07-28.

For code canvases, ChatGPT detects the language and downloads using the
appropriate extension, explicitly including `.py`, `.js`, and `.sql`.

Decision: **ADAPT** this user-visible contract. TALOS already receives the
requested language as the model tool's validated `format`; it does not need an
unreliable second content-sniffing guess.

### Python UTF-8 source

- Source: `https://peps.python.org/pep-3120/`
- Status pin: Final; Python 3.0.
- Retrieved: 2026-07-28.

Python 3 source defaults to UTF-8. TALOS must therefore encode source bodies as
UTF-8 and verify they decode losslessly before persistence.

### IANA media types

- Source: `https://www.iana.org/assignments/media-types/media-types.xhtml`
- Registry pin: last updated 2026-07-22.
- Retrieved: 2026-07-28.

Use registered types where they exist (`application/json`,
`application/xml`, `text/css`, `text/javascript`, `application/sql`,
`application/yaml`, `application/toml`). The registry has no standard Python,
TypeScript, Java, C, shell, or similar source media type. For those, use
`text/plain`; do not invent an `x-` type as an internal truth.

## Upstream decision

**ADAPT behind the existing AVM document generator.**

- Add a bounded, explicit allowlist of source-text extensions already accepted
  by TALOS ingestion and classified by the Library UI.
- `format` remains the actual final suffix and provider-neutral schema value.
- Encode the body exactly as UTF-8.
- Reopen with fatal UTF-8 decoding and report only byte/text integrity, never
  language syntax or runtime correctness.
- Strip one already-present matching suffix from the title before appending the
  canonical lowercase suffix.
- Keep generated source untrusted, encrypted, write-consent governed, and
  inert. Generation never executes or imports it.

## Rejected alternatives

- **Keep Markdown and instruct the user to rename:** rejected; Library and
  export metadata would remain false.
- **Arbitrary extension string:** rejected; it enables misleading executable
  and binary suffixes and weakens provider schema validation.
- **Content-language guessing:** rejected; the validated requested format is
  available and is more reliable than heuristic detection.
- **Use `text/x-python`:** rejected; it is not registered by IANA.
- **Syntax-check every language:** rejected; no pinned multi-language parser is
  present, and claiming semantic validation from a UTF-8 check would be false.

