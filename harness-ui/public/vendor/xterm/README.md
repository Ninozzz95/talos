# Vendored xterm.js — real interactive terminal

Design notes: `.claude/LEDGER-TERMINALE-REALE.md` (internal, Italian).
Official UMD builds, MIT licensed, downloaded once and committed as
static assets — never a `<script src="https://...">`: same
self-contained, zero-CDN principle already followed by the rest of
this bundle (`mobile/public/harness-ui/` is not an ES module — `app.js`
is a classic `<script>` — so the UMD builds are used here, which attach
to `globalThis`, not the `.mjs` ones).

| File | Package | Version | Exposed global |
|---|---|---|---|
| `xterm.js` | `@xterm/xterm` | 6.0.0 | `window.Terminal` |
| `xterm.css` | `@xterm/xterm` | 6.0.0 | — (stylesheet) |
| `addon-fit.js` | `@xterm/addon-fit` | 0.11.0 | `window.FitAddon.FitAddon` (the module is named after the package; the class is nested inside it) |
| `addon-webgl.js` | `@xterm/addon-webgl` | 0.19.0 | `window.WebglAddon.WebglAddon` (same nesting quirk) |

**Why WebGL, not the default DOM renderer**: found live, 28/8
(`LEDGER-TERMINALE-REALE.md`). xterm.js core (v6) ships only a DOM
renderer — no bundled canvas renderer anymore. The DOM renderer colors
text by dynamically injecting a `<style>` block with `.xterm-fg-N`
rules; this server's CSP is `style-src 'self'` (no `'unsafe-inline'`,
deliberately — see `http-app.mjs`), so that injected stylesheet is
silently dropped by the browser and every character renders in the
same default color. `@xterm/addon-webgl` paints via raw GPU pixels —
no CSS involved, so it isn't affected, and it's xterm.js's own
recommended, most-performant renderer (the one VS Code ships). Loaded
with a try/catch + `onContextLoss` fallback: if WebGL is unavailable,
the terminal stays fully usable via the DOM renderer, just without
ANSI colors — declared honestly, never silently degraded. `@xterm/addon-canvas`
was tried first and rejected: its latest release (0.7.0) still
peer-depends on `@xterm/xterm@^5`, incompatible with the `6.0.0` used
here (verified via `npm install`, not assumed).

To update: `npm view @xterm/xterm version` / `npm view
@xterm/addon-fit version` / `npm view @xterm/addon-webgl version`,
download the new package, copy `lib/xterm.js` + `css/xterm.css` (or
`lib/addon-fit.js` / `lib/addon-webgl.js`) here — NOT the `.mjs` files
(they would require `type="module"` on `app.js`, a bigger change than
needed) and NOT the `.map` files (no sourcemaps for a vendored asset,
to stay lean).
