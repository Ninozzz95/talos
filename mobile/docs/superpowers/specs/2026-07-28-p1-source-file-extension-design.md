# P1 source-file extension fidelity design

Date: 2026-07-28  
Status: approved by the owner's autonomous fix instruction

## Contract

`document_create` accepts the existing rich formats plus a fixed set of
plain-source formats already supported by TALOS ingestion:

```text
txt json xml js jsx ts tsx vue css scss php py rb go rs java kt kts
swift c h cpp hpp cs sh bash zsh ps1 sql yaml yml toml ini
```

For these formats:

- `body` is required by the existing non-empty check;
- bytes are the exact UTF-8 encoding of `body`;
- filename ends in exactly one canonical lowercase `.<format>`;
- the original title remains display input except for one matching final suffix;
- verifier uses fatal UTF-8 decode and reports characters/lines;
- Library ingestion re-verifies extension/media-type/UTF-8 compatibility.

Registered media types are used for JSON, XML, JavaScript, CSS, SQL, YAML and
TOML. All other source formats use `text/plain`.

## Compatibility

- Existing `md`, `csv`, `html`, `docx`, `xlsx`, `pptx`, and `pdf` behavior is
  unchanged.
- Existing generated filename grapheme/UTF-8 budgets remain authoritative.
- Source suffix is appended outside the stem budget.
- A title ending in an unrelated suffix keeps it:
  `migration.v2` + `py` -> `migration.v2.py`.
- No code execution, syntax claim, schema migration, or native capability.

