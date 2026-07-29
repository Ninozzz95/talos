# P1 TypeScript UI localization design

## Outcome

Every TALOS-owned sentence that TypeScript sends to visible chat, toast,
Settings, attachment, draft or fault UI is resolved through the active
English/Italian catalog. Stable codes, wire contracts, model instructions and
external provider detail remain locale-neutral.

## Boundary

`TalosTranslate` is the minimal application contract:

```ts
type TalosTranslate = (
    key: string,
    parameters?: Record<string, string | number>,
) => string
```

The real application supplies `talosT`; components supply the `t` returned by
`useTalosI18n`; focused tests supply a deterministic catalog resolver.

Errors produced below a view may expose:

```ts
interface TalosTranslatableError {
    uiMessageKey: string
    uiMessageParameters?: Record<string, string | number>
}
```

The UI resolver recognizes only that typed metadata or an explicit bounded map
of stable TALOS validation codes. It does not translate arbitrary provider
text and never reflects secrets.

## User-visible paths

1. Attachment and composer-draft composables receive a translator and emit
   localized bounded copy.
2. The chat store receives a translator for storage failures and structured
   fault recovery actions.
3. The chat controller receives a translator for model/probe failures,
   generated-file consent/toasts, vision routing, tone suggestions and message
   retries.
4. Session action, app-lock and model/settings catches resolve typed errors
   through the shared UI-error boundary.
5. Chat configuration, provider and prompt-enhancement errors carry stable
   localization metadata rather than hard-coded display prose.

## Non-goals

- translating model system prompts or tool descriptions/results;
- translating provider-returned error bodies;
- rewriting historical user/assistant content;
- changing error codes, provider adapters or persistence schemas;
- changing the current English/Italian locale set.

## Acceptance

- Italian operations emit Italian attachment, draft, storage, provider/model,
  prompt-enhancement, PIN and action failure copy.
- English behavior remains semantically unchanged.
- catalog structures and placeholders remain exact.
- no raw `TALOS_*` code replaces friendly UI copy unless diagnostics explicitly
  appends it.
- focused tests, affected regressions, typecheck, production build and
  localization E2E pass without raising the initial-entry budget.

