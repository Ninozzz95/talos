# Research dossier - localized tool consent

Date: 2026-07-29
Subsystem: TALOS mobile tool authorization / localization

## Local diagnosis

- tool definitions expose English `title` and `description` strings because
  those schemas are sent to model providers;
- `executeTalosTool` correctly passes the complete typed tool definition to the
  consent boundary;
- `chatController.askOnce` copies those provider-facing strings directly into
  `pendingToolConsent`;
- the consent sheet localizes its buttons and accessible label, but renders the
  English title and description props unchanged;
- the raw input is already shown verbatim, which is required for an informed
  authorization and must not be translated or reformatted.

The fault is a missing presentation adapter, not a missing locale in the modal
component and not a reason to localize provider wire schemas.

## Current primary sources

1. Android Developers, **Localize your app**, inspected 2026-07-29:
   <https://developer.android.com/guide/topics/resources/localization>
   - UI strings should be externalized from behavior;
   - every default string needs a locale counterpart and sufficient translator
     context;
   - localized apps should be tested on real devices and representative
     resolutions.
2. OWASP, **Transaction Authorization Cheat Sheet**, inspected 2026-07-29:
   <https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html>
   - authorization must let the user identify and acknowledge significant
     transaction data;
   - the prompt should clearly state what is being authorized;
   - state transitions must remain sequential and fail closed.
3. W3C, **WCAG 2.2 - Language of Parts**, inspected 2026-07-29:
   <https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts>
   - human-language text needs a programmatically determinable language so
     assistive technologies can present it correctly.
4. Vue I18n, **Message Format Syntax** and **TypeScript Support**, inspected
   2026-07-29:
   <https://vue-i18n.intlify.dev/guide/essentials/syntax>
   <https://vue-i18n.intlify.dev/guide/advanced/typescript>
   - locale messages are the canonical presentation resource;
   - named keys keep runtime selection separate from source prose.

Exact upstream pin retained:

- `vue-i18n@11.4.8`;
- existing `TalosTranslate` adapter and complete English/Italian catalogs.

No dependency is added.

## Upstream decision

**Adapt through an AVM-owned stable-name presentation map.**

- retain English tool titles/descriptions in provider schemas;
- map each canonical tool name to locale-message keys only at the human consent
  boundary;
- translate title and description at the moment the sheet is opened;
- keep the exact input object unchanged and visible;
- keep unknown-tool and custom generated-file prompts usable through a raw-copy
  fallback;
- guard every currently offered tool with a completeness test.

Rejected alternatives:

- translating provider schemas: changes model behavior and duplicates wire
  contracts per locale;
- translating English prose by value: brittle, ambiguous, and incompatible
  with revised descriptions;
- hiding arguments behind a generic localized sentence: violates informed
  authorization;
- localizing inside the consent component by guessing from title text: makes
  the view own protocol parsing and cannot cover custom prompts safely.

## Security and accessibility constraints

- the localization adapter cannot change tool name, actions, input, queue
  order, session-scoped grant, allow, or deny behavior;
- dynamic user/model values remain verbatim;
- the Italian title becomes part of the already localized dialog `aria-label`;
- missing mappings must fail a test for known tools while runtime fallback
  keeps a future tool confirmable and fail-closed.
