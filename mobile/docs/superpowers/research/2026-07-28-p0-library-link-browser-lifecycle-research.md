# P0 Library link browser lifecycle research

Date: 2026-07-28  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduced contract defect

The owner reported that links opened badly specifically from Library. The
baseline already routes an explicit user tap to `system_browser`, correcting
the earlier isolated/cookieless WebView choice. Current lifecycle inspection
found the remaining fault:

1. `openTalosLinkOnce()` launches the browser;
2. its unconditional `finally` calls `dispose()`;
3. `dispose()` calls `close()` while the browser is still active.

The helper can therefore dismiss the page it has just presented. The same
helper is shared by Library rows, source-document buttons and chat citations.

## Current primary sources

1. Capacitor InAppBrowser API  
   <https://capacitorjs.com/docs/apis/inappbrowser>
   - `openInSystemBrowser` uses Android Custom Tabs;
   - `openInExternalBrowser` leaves the application;
   - `openInWebView` is an owned custom WebView;
   - `close()` explicitly closes browsers opened through system-browser or
     WebView actions.
   - The installed direct pin is `@capacitor/inappbrowser@4.0.1`.

2. Android in-app browsing decision guide  
   <https://developer.android.com/develop/ui/views/layout/webapps/in-app-browsing-embedded-web>
   - WebViews are sandboxed and do not share the user's browser logins;
   - Custom Tabs are intended for external pages and share cookies/passwords
     with the default browser;
   - an external Intent is also valid when leaving the app is intended.

3. Android Custom Tabs overview  
   <https://developer.android.com/develop/ui/views/layout/webapps/overview-of-android-custom-tabs>
   - Custom Tabs use the preferred browser's engine and state;
   - they provide Safe Browsing, shared cookies, integrated back navigation and
     browser-owned lifecycle.

4. OWASP MASTG App Link guidance  
   <https://mas.owasp.org/MASTG/best-practices/MASTG-BEST-0070/>
   - custom schemes are not verified and inputs must be treated as untrusted;
   - prefer verified HTTP(S) navigation for sensitive flows.

## Upstream decision

- **Adopt directly:** retain Capacitor `openInSystemBrowser` for an explicit
  Library/source tap and `openInWebView` for TALOS-controlled isolated browse.
- **Adapt lifecycle:** allow the AVM service to release listener/window
  references without invoking the upstream `close()` action.
- **Reject:** do not use a raw custom scheme, raw `window.location`, or a
  home-grown Android Intent plugin.

## One-up

One canonical helper now serves Library links and citations while preserving
the intent distinction: the user's page keeps the user's browser session;
TALOS reads untrusted pages in isolation. The launcher returns success only
after the official plugin accepted the request, never closes a successful
one-shot page, removes its JS listeners, and still closes/cleans failed or
explicitly owned browser sessions.

