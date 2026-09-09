# Research prompt — sandboxed model-generated HTML canvas inside an Android Capacitor WebView app

> Custodito 2026-08-27. Prompt commissionato per una ricerca indipendente
> (in stile [[revisioni-difficili-si-commissionano]]): incollare per intero
> in un'altra sessione/motore, poi valutare qui la risposta contro il codice
> vero — non prenderla al valore nominale.

## Context

I'm building a feature for TALOS, a mobile AI assistant app built with
Capacitor (Android WebView, `androidScheme: 'https'`, appId `ai.talos`).
The feature: let the LLM generate a self-contained interactive HTML/CSS/JS
document (e.g. an interactive spirograph, a physics simulation with
sliders, a live chart) and render it inside a chat message, similar to
Claude Artifacts and OpenAI ChatGPT's "Visualizations" feature. The model
would author raw HTML/CSS/JS — not a constrained declarative schema.

I need you to independently verify three technical claims I've derived
from research (cite your own sources, don't just take my word for it —
correct me where I'm wrong), then help me design the safest achievable
architecture given Android's real constraints.

## The three claims to verify or refute

**Claim 1 — `srcdoc`/`blob:`/`data:` iframes inherit the embedding
document's CSP, and a `<meta http-equiv="Content-Security-Policy">` tag
written inside `srcdoc` content is ignored.**
Sourced from MDN's CSP `sandbox` directive page and the CSP3 spec
discussion of policy inheritance. If true, this means I cannot deliver a
sandboxed document via `<iframe sandbox="allow-scripts" srcdoc="...">`
and give it its own independent CSP — it would be bound by whatever CSP
governs the PARENT page.

**Claim 2 — TALOS's own top-level app CSP is `script-src 'self'` with
zero inline scripts allowed** (verified against the built output — the
production bundle emits no inline `<script>` tags). Loosening this to
allow inline scripts anywhere in the app (e.g. adding `'unsafe-inline'`
or a broadly-scoped nonce to make an in-page srcdoc iframe's JS runnable)
would apply to the WHOLE app, not just the sandboxed iframe — meaning any
future XSS anywhere in the real UI would become exploitable, since CSP
cannot be scoped "only for this one iframe" when the content lives under
the same origin/document tree via `srcdoc`.

**Claim 3 — Android System WebView does not support out-of-process
iframes or multi-process site isolation, unlike desktop Chrome.**
Sourced from a 2026 web search citing Chromium's own `android_webview`
architecture docs. Claude Artifacts' documented security model explicitly
"depends heavily on full-site process isolation" (per third-party
technical write-ups of how Artifacts works) — if WebView lacks that,
then even a genuinely separate origin rendered inside the same WebView
instance shares the same renderer process as the host app, meaning the
isolation guarantee is weaker than what Claude/ChatGPT rely on on
desktop, even with an identical `sandbox` attribute and an independent
CSP.

Please confirm, refute, or refine each claim with current (2026) primary
sources — Chromium source/docs, W3C/WHATWG specs, Android security
documentation, or credible technical write-ups. I'd rather be told I'm
wrong with a citation than proceed on an unverified assumption.

## If the claims hold: architecture I'm considering, please critique it

Serve the sandboxed content from a **second local origin** inside the
app (e.g. `https://sandbox.talos.local`), distinct from the main app's
origin, using something like AndroidX `WebViewAssetLoader` or a
`shouldInterceptRequest` override on a custom `WebViewClient` to answer
requests for that host with real, independently-set HTTP response
headers (so its CSP is NOT inherited from the main app — it has its own).

Proposed CSP for that second origin, strict enough that even if the
model's JS is fully malicious it cannot exfiltrate anything or persist
anything:
- `script-src 'unsafe-inline'` (required — the model authors inline
  `<script>`, no external script host exists to nonce/hash against
  reliably per-generation) — but see below, I'd like your opinion on
  whether a per-render hash-based CSP (`script-src 'sha256-...'` computed
  server-side... except there's no server, it's all on-device — computed
  at render time in the app and injected into the response headers for
  that exact document) is feasible and better than blanket
  `'unsafe-inline'`.
- `connect-src 'none'` — no fetch/XHR/WebSocket/EventSource at all.
- `img-src data: blob:` only — no remote images.
- `style-src 'unsafe-inline'` (styling needs inline `<style>`/`style=`).
- `font-src 'none'`, `frame-src 'none'`, `object-src 'none'`,
  `base-uri 'none'`, `form-action 'none'`, `worker-src 'none'`.
- The iframe element itself: `sandbox="allow-scripts"` — deliberately
  WITHOUT `allow-same-origin`, `allow-popups`, `allow-top-navigation`,
  `allow-forms`, or `allow-modals`, so the document is also forced into
  an opaque origin (fails all same-origin checks, no
  `localStorage`/`document.cookie`/cross-frame access) even before CSP
  is considered.
- No `postMessage` bridge back to the host app at all in v1 — the
  content is fire-and-forget presentational, all interactivity
  (sliders, drag, animation) is self-contained client-side JS reacting
  to its own DOM, no communication with TALOS's native capabilities or
  the chat state.
- Feature gated behind an explicit opt-in toggle in settings (off by
  default), matching how other elevated-risk features in this app are
  gated.

Questions for you:

1. Is `WebViewAssetLoader` (or your recommended alternative — a
   `shouldInterceptRequest` override, a tiny embedded local HTTP server
   via something like NanoHTTPD wrapped in a Capacitor plugin, Capacitor's
   own `server` config options) actually capable of serving a genuinely
   second origin with independently-controlled response headers from
   inside an Android app process, distinct from the origin the main
   Capacitor webDir is served from? Concretely, how would you implement
   this on Android in 2026 — which API, which gotchas?
2. Given Android WebView's lack of out-of-process iframes (Claim 3): is
   the residual risk here (a Chromium renderer-process sandbox-escape bug
   reachable purely from web content, no native code) realistic enough to
   weigh heavily, or mostly theoretical today? Cite any 2025-2026
   WebView/Chromium CVEs that were reachable from JS alone inside a
   sandboxed iframe (not requiring a separate native-code exploit chain)
   so I can calibrate real vs. theoretical risk.
3. Is there prior art I should study — how do existing Android apps that
   render untrusted third-party HTML today (email clients like K-9 Mail /
   Thunderbird for Android, note apps, RSS readers, or other AI apps that
   already ship an "artifacts"-like feature on mobile) actually sandbox
   it? What do they do that I'm not considering?
4. Any recommendation on `Trusted Types`, Android's `Safe Browsing`
   WebView integration, or other defense-in-depth layers worth adding on
   top of the CSP + sandbox attribute?
5. If TALOS ever ships a desktop or iOS build later (not committed yet),
   does WKWebView (iOS) have the same out-of-process-iframe limitation as
   Android WebView, or is it closer to desktop Safari/Chrome's isolation
   model? I'd like to know if this is an Android-specific gap or a
   mobile-WebView-in-general gap.
6. Overall verdict: given everything above, is the separate-local-origin
   design sound as "the best achievable" given Android's real
   constraints, or is there a meaningfully safer alternative architecture
   I'm missing entirely (e.g. rendering server-side and shipping only a
   static image/video, a constrained declarative visualization DSL
   instead of raw HTML/JS, a native Canvas-drawing mini-language, etc.)?

Please be concrete and cite sources for every factual claim — no
unsupported assertions. Where you're uncertain, say so explicitly rather
than presenting a guess as settled.
