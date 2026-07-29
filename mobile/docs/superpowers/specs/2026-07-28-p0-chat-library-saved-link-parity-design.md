# Design - P0 chat/global saved-link parity

Date: 2026-07-28

## Subject, audience, and job

Subject: an encrypted research Library inside TALOS mobile.  
Audience: a user returning to evidence found during one conversation.  
Single job: recognize the page, open the retained evidence, or revisit the
original address without confusing a storage transcript for the page itself.

## Visual system

- Background `Abyss` `#0b0f11`
- Surface `Graphite` `#121a1e`
- Border `Mineral` `#1f3238`
- Primary text `Ice` `#dcefef`
- Secondary text `Steel` `#7f9aa1`
- Action `Signal cyan` `#6ad4d4`
- Headline/body: existing Instrument Sans.
- Host/date utility text: existing Instrument Sans at the established compact
  metadata size; no new font role.

No palette or typography is added to the product. The distinctive element is
structural: one quiet row exposes both halves of TALOS evidence, retained copy
and live original, without turning either into decorative chrome.

```text
┌──────────────────────────────────────────────────┐
│  globe   Page title                     ↗        │
│          example.com · today                      │
│          tap body: retained encrypted copy        │
└──────────────────────────────────────────────────┘
```

## Contract

1. `TalosMobileSavedLinkRow` is the only saved-link row markup.
2. It receives one `TalosSavedLinkRow` plus a caller-formatted date label.
3. It emits distinct `openCopy` and `openBrowser` events.
4. Both controls have independent accessible names and at least 48px targets.
5. Global Library preserves `talos-library-links` and
   `talos-library-link-open`.
6. Chat Library adds `talos-chat-media-links`,
   `talos-chat-media-link-copy`, and `talos-chat-media-link-open`.
7. Chat derives rows from its already session-scoped `mine` collection through
   `talosSavedLinkRows()`, including multi-link dossiers and legacy transcript
   fallback.
8. Chat calls the tab `Links (n)`, where `n` is the canonical visible-address
   count, not the count of backing markdown files.
9. Opening a chat retained copy uses the existing in-panel document viewer.
10. Opening the original uses `openTalosLinkOnce(..., 'system_browser')`.
11. A rejected browser open becomes an actionable panel error; no silent tap.
12. Non-source files and all global Library actions remain unchanged.

## Critique before build

A favicon, domain color, or card thumbnail would make the row feel more like a
generic bookmark manager and would require a privacy-leaking network request.
The globe silhouette plus host is quieter, deterministic, and specific to the
evidence contract. A third “source transcript” label is also redundant: the
row body already opens that copy. The final direction therefore keeps one
recognizable icon and spends the interaction budget on the meaningful dual
destination.
