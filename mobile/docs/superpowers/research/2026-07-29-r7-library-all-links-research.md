# R7 research - global Library All includes saved links

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## User contract and local diagnosis

The global Library persists researched pages as encrypted Markdown dossiers and
projects their canonical HTTP(S) addresses as semantic saved-link rows. The
current shared type predicate deliberately excludes `web_source` records from
`All`, and `ContextScreen` renders saved-link rows only when the `Links` chip is
active. Consequently, the default global Library hides every saved link even
though the same record is present and visible under `Links`.

This is a projection defect, not a Vault persistence defect. Making the backing
Markdown transcript visible in `All` would produce the wrong identity and
duplicate one logical page as both a document tile and a link. The global
surface must aggregate its two existing projections:

- ordinary documents and images as file rows or tiles;
- deduplicated saved pages as semantic link rows.

Search must compose with the selected chip and match what a link row actually
shows: page title, host and canonical URL, while retaining the existing
filename/extracted-text fallback for the encrypted saved copy.

## Current official and mature references

Accessed 2026-07-29:

1. OpenAI, File storage and Library in ChatGPT:
   <https://help.openai.com/en/articles/20001052-library-for-chatgpt>
   - describes Library as one place to browse uploaded and generated files;
   - exposes search plus file-type filters;
   - names “Show all file types” as the inclusive state rather than another
     narrow category.
2. Google Drive Help, Search for files:
   <https://support.google.com/drive/answer/2375114?hl=en>
   - filter chips narrow the current result set;
   - chips can be composed with filename or content search;
   - multiple filters and search terms keep one predictable result contract.
3. Apple iPhone User Guide, Share content in Messages:
   <https://support.apple.com/en-ca/guide/iphone/iphb66cfeaad/ios>
   - “all content” is the containing set;
   - Photos, Links and Documents are stable type-specific projections.
4. W3C WAI-ARIA Authoring Practices, Button Pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/button/>
   - a persistent filter chip is a toggle button with `aria-pressed`;
   - its accessible label stays stable while the pressed state changes.

## Upstream decision

**ADAPT** the mature inclusive-browse contract: TALOS `All` contains every
logical Library item, while Images, Files and Links remain narrow,
mutually-exclusive type projections. Search composes with the active chip and
uses the existing AVM-owned Unicode normalization/scoring boundary.

TALOS keeps its one-up evidence behavior: researched pages retain encrypted
Markdown copies, but those storage records are never rendered as document
tiles. One canonical URL is one row, the newest retained copy owns its action,
and a dossier with several canonical results may project several saved links.
The header count represents these logical visible identities rather than raw
storage rows.

**REJECT** changing `web_source` into a document, duplicating its backing
transcript in `All`, flattening link rows into generic tiles, searching only the
backing filename, adding a second store, or adding a new dependency. Those
options respectively regress type identity, duplicate content, lose link
semantics, hide discoverable addresses, split persistence, or add no needed
capability.

No upstream package or protocol is integrated. The current product contracts
are pinned by access date and permanent local unit plus browser conformance
tests.
