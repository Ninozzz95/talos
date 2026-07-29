# P2-F research - Library filter parity

Date: 2026-07-29  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Local diagnosis

The same encrypted vault record has three different classification paths:

- the global Library treats `metadata.kind === "web_source"` as a link only
  when the Links chip is active, but also exposes its Markdown backing file in
  All and Files;
- Media in this chat correctly removes that backing record from All, Images
  and Files, then projects it through `talosSavedLinkRows()` in Links;
- `library_list` independently classifies the same record as `link`.

The disagreement is caused by duplicated predicates. The global UI tests MIME
before source kind, the chat UI carries a local source exception, and the tool
adapter contains a third ternary. A source with an image-looking or Markdown
MIME can consequently acquire two visible identities. This is a presentation
bug; the encrypted transcript must remain stored and openable as retained
evidence.

## Current primary and mature-product sources

Accessed 2026-07-29:

1. OpenAI, File storage and Library in ChatGPT:
   <https://help.openai.com/en/articles/20001052-library-for-chatgpt>
   - Library filtering is by explicit file type;
   - uploaded and generated artifacts remain durably reusable;
   - generated images retain a stable Images identity.
2. Google Drive Help, Search for files:
   <https://support.google.com/drive/answer/2375114?hl=en>
   - a Type filter chip narrows the current result set directly;
   - chips compose with text search rather than changing an item's type.
3. Apple Support, Share content in Messages:
   <https://support.apple.com/en-ca/guide/iphone/iphb66cfeaad/ios>
   - conversation content is exposed through distinct Photos, Links and
     Documents categories;
   - absent categories are omitted rather than filled with another type.
4. W3C WCAG 2.2, Understanding SC 3.2.4:
   <https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html>
   - repeated functions and identities across product surfaces should be
     identified consistently.
5. W3C ARIA APG Button Pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/button/>
   - a persistent two-state filter button exposes `aria-pressed` while its
     accessible label remains stable.

## Upstream decision

**ADAPT behind one AVM-owned classifier.** The mature products establish stable
type filters and separate link/document identities, but no upstream package is
needed to classify TALOS's existing `media_type` plus `metadata.kind`.

`talosLibraryFileType(file)` becomes the canonical `image | document | link`
boundary. Source kind has precedence over MIME because it expresses the
artifact's product identity; MIME continues to describe the retained bytes.
`matchesTalosLibrarySurfaceTab(file, tab)` owns the UI projection used by both
global and chat-scoped Libraries. The tool adapter consumes the same classifier
while preserving its wire-level `file_type=all` behavior.

No dependency, network call, schema migration or stored-row rewrite is
introduced. Reclassifying by filename, duplicating the source transcript as a
file tile, or deleting the retained transcript are rejected because they are
respectively spoofable, inconsistent, and destructive to evidence.

