# P1 TypeScript UI localization research

Date: 2026-07-29  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Problem confirmed locally

The localization coverage gate parses Vue templates, but it does not cover
human-readable strings produced by TypeScript and then rendered by those
templates. The inspected production paths include:

- attachment and draft errors emitted by composables;
- storage/fault messages emitted by the chat store;
- model probes, generated-file consent, vision routing and tone toasts emitted
  by the chat controller;
- provider/configuration and prompt-enhancement errors emitted below the view;
- session-action failure toasts;
- PIN and secure-key validation failures surfaced by Settings.

Protocol names, error codes, provider wire text, model prompts, tool results
sent to the model and diagnostic evidence are separate contracts. Translating
those values would make replay and adapters locale-dependent and is therefore
out of scope.

## Current primary sources

1. Vue I18n 11 Composition API:
   <https://vue-i18n.intlify.dev/guide/advanced/composition>
   - the Composer exposes `t`;
   - global-scope messages follow the active locale;
   - locale changes propagate through the global composer.
2. Android app resources:
   <https://developer.android.com/guide/topics/resources/providing-resources>
   - application strings should be externalized and selected from the current
     device configuration.
3. Android localization guidance:
   <https://developer.android.com/guide/topics/resources/localization>
   - UI contents belong in resource files;
   - default resources must be complete;
   - hard-coded UI strings should be removed.
4. W3C Internationalization Best Practices for Spec Developers:
   <https://www.w3.org/TR/international-specs/#localization>
   - domain values should remain locale-neutral and be wrapped in display
     strings;
   - natural-language error messages should follow the negotiated UI language
     when possible.

## Upstream decision

**ADAPT** the already pinned `vue-i18n@11.4.8` behind the existing AVM-owned
`@/i18n` boundary.

- Application/composable boundaries receive a `TalosTranslate` function.
- Errors that cross a lower-level boundary retain a stable code and optional
  localization key/parameters.
- The presentation boundary resolves only TALOS-owned messages through the
  active catalog.
- Raw provider messages remain sanitized external detail; TALOS-owned fallback
  and recovery guidance are localized.
- Model prompts, tool wire contracts, diagnostics and persisted error codes are
  deliberately not translated.

No new dependency is warranted. Android resource APIs cannot translate WebView
Vue strings, while a second localization runtime would duplicate the pinned
Vue I18n contract and increase bundle/runtime risk.

## Regression risks and controls

- **Locale switch stale copy:** resolve copy at the operation boundary from the
  current translator, never cache translated strings in module constants.
- **Protocol drift:** static/behavior tests distinguish UI strings from model
  prompts, tool results and codes.
- **Secret reflection:** provider error sanitization remains in place before any
  message reaches UI state.
- **Initial bundle budget:** move English copy from the entry graph into the
  already lazy locale catalogs; the production build remains capped at
  560,000 bytes.
- **Incomplete catalogs:** retain the exact English/Italian structural parity
  gate and add direct Italian behavior assertions for TypeScript emitters.

## Build-budget follow-up

The first production build after the localization GREEN produced a real RED:
the initial JavaScript closure measured 562,034 bytes against the unchanged
560,000-byte ceiling.

Current official sources inspected:

1. Vue async components:
   <https://vuejs.org/guide/components/async>
   - `defineAsyncComponent(() => import(...))` creates a bundler split point;
   - its loader is called only when the wrapper is rendered.
2. Vue performance guidance:
   <https://vuejs.org/guide/best-practices/performance>
   - lazy loading is appropriate for features not needed on initial load;
   - dynamic `import()` lets Rollup/Vite split the feature and dependencies.
3. Vite dynamic-import guidance:
   <https://vite.dev/guide/features.html#dynamic-import>
   - native dynamic imports are supported as build-time code-splitting
     boundaries.

**Upstream decision: ADAPT** Vue's existing async-component primitive without a
new package. `TalosLauncherIconDialog` is an optional response to a post-boot
theme change, yet it was statically imported and rendered at every boot even
when no launcher-icon choice was pending. Keep the controller eager because it
must observe theme changes, but render the dialog's async wrapper only while
`launcherIcon.state.pending` exists. The build contract will permanently
require this dialog to remain outside the initial graph.
