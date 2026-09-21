# Vendored Prism — code-block syntax highlighting

Design notes: `.claude/LEDGER-STREAMING-SCROLL-TERMINALE-2026-09-02.md`
(internal, Italian). Official npm package, MIT licensed, downloaded once
and committed as a static asset — never a `<script src="https://...">`:
the same self-contained, zero-CDN principle already followed by
`vendor/xterm/` and the bundled fonts.

| File | Package | Version | Exposed global |
|---|---|---|---|
| `prism.js` | `prismjs` | 1.30.0 | `window.Prism` |

**Why Prism and not Shiki or highlight.js** — researched 2026-09-02, not
assumed. Shiki renders with VS Code TextMate grammars but is designed to
run ahead of time (build step or server), shipping zero client JS; that is
the wrong shape here, where code blocks arrive token by token in a live
stream and must be highlighted in the browser. highlight.js auto-detects
the language, which we do not need: the markdown fence already declares it
(```python), and guessing would risk labelling a block wrongly — this
project does not display facts it has not verified. Prism is the lightest
of the three, has no dependencies, and vendors cleanly offline.

**How this single file is built** (not shipped this way by the package):
Prism normally loads `prism-core.js` plus one file per language. Rather
than 20 `<script>` tags, the components are concatenated into one file in
**dependency order** — `clike` before `javascript`, `javascript` before
`typescript`/`jsx`, `jsx`+`typescript` before `tsx`, `c` before `cpp`,
`markup` before `markdown`:

```
core markup css clike javascript jsx typescript tsx python bash json
yaml sql rust go java c cpp csharp markdown
```

A preamble sets `window.Prism = { manual: true }` **before** the core.
Without it Prism highlights the whole document by itself on
`DOMContentLoaded`; here the blocks arrive by streaming and `app.js`
decides when each one is final (see `costruisciBloccoCodice`).

**CSP**: this server sends `style-src 'self'` (no `'unsafe-inline'`, see
`http-app.mjs`). Prism is compatible because it only adds *classes* —
it never injects a stylesheet, unlike the xterm DOM renderer, which is
exactly why that one needed the WebGL addon. The theme lives in
`public/styles.css`, written against the TALOS design tokens rather than
using any of Prism's own themes.

**Registration is required**: `/vendor/prism/prism.js` must be listed in
`src/static-files.mjs`. The allowlist there is explicit; an unlisted asset
answers 404 and every code block silently loses its highlighting.

To update: `npm view prismjs version`, `npm pack prismjs`, extract, then
re-concatenate `components/prism-<name>.min.js` in the order above —
the `.min.js` files, not the plain ones, and no `.map` files (no
sourcemaps for a vendored asset, to stay lean).
