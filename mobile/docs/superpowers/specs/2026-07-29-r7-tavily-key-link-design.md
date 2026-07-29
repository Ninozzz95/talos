# R7 design - Tavily registration and API-key link

Date: 2026-07-29

## Behavior

When `settings.state.search.source === "tavily"`:

- render one localized `Get a Tavily API key` action above the API-key field;
- on an explicit tap, open exactly `https://app.tavily.com/` with
  `openTalosLinkOnce(..., "system_browser")`;
- disable only that action while its open is pending;
- if opening fails, render a localized status and leave every setting/key
  untouched.

The action is absent for Brave, SearXNG, custom and no selected source.

## Security

- Never append the current key draft or saved-key state to the URL.
- Never read a saved key to open the platform.
- Never log an account, key or query parameter.
- Keep save/replace/clear behavior on `secureKeyStore`.
- Use the user-owned system browser, not the isolated TALOS reader.

## Accessibility and localization

- Use a real button with an external-link icon marked decorative.
- English and Italian labels describe the destination and purpose.
- Pending state prevents duplicate launches.
- Failure feedback uses the existing polite status region.

## Acceptance

- Unit proof captures the exact URL and `system_browser` presentation.
- Unit proof covers a false/failed open and source-specific visibility.
- Browser proof clicks through Settings and observes a popup to the exact
  Tavily origin without contacting the real site.
- Existing secure-key, source-selection and browser-adapter suites remain
  green.
