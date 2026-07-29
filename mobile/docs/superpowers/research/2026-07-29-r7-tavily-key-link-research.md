# R7 research - Tavily registration and API-key link

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## User contract and local diagnosis

Settings already lets the owner select Tavily and paste a key into OS secure
storage, but gives no direct route to create a Tavily account or obtain that
key. The app must add that route without reading, pre-filling, logging or
putting a credential in a URL.

The repository already has the correct user-navigation boundary:
`openTalosLinkOnce(url, "system_browser")` normalizes HTTPS URLs, invokes the
pinned official Capacitor InAppBrowser adapter on native, uses a
`noopener,noreferrer` tab on web, and releases listeners without closing a
successful user-owned page.

## Current official sources

Accessed 2026-07-29:

1. Tavily Quickstart:
   <https://docs.tavily.com/documentation/quickstart>
   - directs users to the Tavily Platform to sign in or create an account;
   - says API keys are copied from the dashboard;
   - currently states 1,000 free credits each month without a credit card.
2. Tavily API introduction:
   <https://docs.tavily.com/documentation/api-reference/introduction>
   - all API endpoints authenticate with an API key;
   - the official "Get your free API key" target is the Tavily Platform.
3. Tavily API-key management:
   <https://docs.tavily.com/documentation/best-practices/api-key-management>
   - keys are created, rotated and revoked in the Tavily Dashboard;
   - keys must not be hardcoded and belong in secure secret storage.
4. The official Platform links above target
   <https://app.tavily.com/>, which currently redirects unauthenticated and
   authenticated users through the platform home flow.

## Upstream decision

**ADOPT directly** Tavily's official platform root as the one stable account
and dashboard destination:

```text
https://app.tavily.com/
```

**ADAPT** it behind the existing AVM-owned `openTalosLinkOnce` boundary with
`system_browser`, because account creation, password managers, existing login
cookies and API-key management are user-owned browser actions.

The control is shown only while Tavily is selected and sits next to the key
setup. Its URL is a source constant with no query, fragment, key, draft or
account identifier. A failed open produces localized in-app feedback.

**REJECT** an embedded isolated WebView for account login, raw `window.open`
from the component, a Tavily SDK, OAuth automation, key scraping, deep-link
guessing, and credential prefill. No new dependency, permission, native code,
provider call or stored field is required.
