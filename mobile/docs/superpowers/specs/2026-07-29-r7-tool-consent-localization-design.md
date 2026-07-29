# Design - localized tool consent copy

Date: 2026-07-29
Status: ready for RED

## Canonical flow

```text
typed tool definition + exact input + unresolved actions
  -> executor authorization boundary
  -> controller consent presentation adapter
       canonical tool name -> title/description locale keys
       unknown/custom tool -> supplied copy unchanged
  -> pending consent sheet
       localized title and description
       exact unmodified input
       existing localized allow/deny controls
```

## Contracts

- `TALOS_TOOL_CONSENT_KEYS` owns title and description keys for every tool the
  application can offer.
- `talosToolConsentCopy` accepts only the presentation fields and a
  `TalosTranslate` adapter; it does not import or mutate global locale state.
- `askToolConsent` and `askOnce` accept an optional stable tool name so custom
  prompts without a protocol name keep their already-localized copy.
- English and Italian catalogs remain structurally exact.
- raw arguments, actions, queueing, session grants, cancellation, and audit
  behavior remain unchanged.

## Human-visible proof

With the application locale set to Italian and write permission set to “ask,”
a natural-language document request opens one sheet whose title and
description are Italian, whose JSON contains the exact requested filename and
format, and whose deny action prevents the tool. The same journey in English
uses the English catalog.
