# TALOS Mobile - Upstream Provenance

Registro delle decisioni upstream per la lane mobile. Ogni riga registra
versione, licenza, provenance, compatibilita e rollback. Regola: adottare
l'upstream reale pinnato; adattare solo contratti, identita e policy AVM;
mai ricreare localmente un comportamento che un upstream approvato possiede.

Fonti primarie ispezionate il 2026-07-18 (charter §3):

- Capacitor v8 architettura e plugin boundary: <https://capacitorjs.com/docs>
- Android offline-first data layer: <https://developer.android.com/topic/architecture/data-layer/offline-first>
- Android data-layer repository boundary: <https://developer.android.com/topic/architecture/data-layer>
- Rust Android Tier-2 targets e NDK LTS: <https://doc.rust-lang.org/rustc/platform-support/android.html>
- shadcn-vue Dialog/Drawer composizione responsive: <https://www.shadcn-vue.com/docs/components/dialog>, <https://v3.shadcn-vue.com/docs/components/drawer>
- Kimi Code K3 configurazione: <https://moonshotai.github.io/kimi-code/en/configuration/config-files.html>
- JSON Schema Draft 2020-12 e oggetti chiusi:
  <https://json-schema.org/draft/2020-12>,
  <https://json-schema.org/understanding-json-schema/reference/object>
- Design Tokens Community Group Format Module stabile `2025.10`:
  <https://www.designtokens.org/TR/2025.10/format/>
- Node.js type stripping, baseline documentata `v22.18.0`:
  <https://nodejs.org/download/release/v22.18.0/docs/api/typescript.html>

## Pin congelati (M0/M1 research manifest, 2026-07-18)

| Dipendenza | Versione | Licenza | Uso previsto | Compatibilita |
|---|---:|---|---|---|
| `@capacitor/core` | 8.4.2 | MIT | bridge nativo | Android/iOS; Capacitor 8 CLI richiede Node 22+ |
| `@capacitor/cli` | 8.4.2 | MIT | `cap sync/add` | allineata a core |
| `@capacitor/android` | 8.4.2 | MIT | piattaforma Android | richiede JDK 21 (capacitor.build.gradle -> JavaVersion.VERSION_21), Android SDK, AGP 8.13.0 |
| `@capacitor/app` | 8.1.1 | MIT | lifecycle/back button | plugin ufficiale |
| `@capacitor/keyboard` | 8.0.5 | MIT | tastiera virtuale | plugin ufficiale |
| `@capacitor/status-bar` | 8.0.3 | MIT | safe area/status bar | plugin ufficiale |
| `@capacitor/preferences` | 8.0.1 | MIT | preferenze semplici | solo non-segrete; Vault e M2 |
| `vue` | 3.5.40 | MIT | UI framework | allineata al desktop |
| `vue-router` | 5.2.0 | MIT | routing shell | history Capacitor-safe |
| `@vueuse/core` | 14.3.0 | MIT | composable utility | gia in uso desktop |
| `vite` | 7.3.6 | MIT | build (baseline mobile compatibile con gli SFC upstream congelati) | pin amendment 2026-07-20 |
| `@vitejs/plugin-vue` | 6.0.8 | MIT | SFC | con vite 7 |
| `typescript` | 5.9.3 | Apache-2.0 | compilatore classico richiesto da vue-tsc@3.3.7 | pin amendment 2026-07-20 |
| `vitest` | 4.1.10 | MIT | unit test M1+ | solo dopo autorizzazione install |
| `shadcn-vue` CLI | 2.8.0 | MIT | generatore Drawer/Dialog | sorgente generato e posseduto nel repo; hash upstream e adattamenti TALOS revisionati sono registrati separatamente |
| `reka-ui` | 2.10.1 | MIT | primitive headless | stessa base del desktop |
| `vaul-vue` | 0.4.1 | MIT | drawer gesture | dipendenza Drawer shadcn-vue |
| `tailwindcss` | 4.3.3 | MIT | utility CSS | token bridge come desktop |
| `@tailwindcss/vite` | 4.3.3 | MIT | integrazione | con tailwind 4 |
| `@lucide/vue` | 1.25.0 | ISC | icone | stessa famiglia desktop |
| `zod` | 4.4.3 | MIT | contratti runtime | allineata a validator |
| `@playwright/test` | 1.61.1 | Apache-2.0 | E2E M1+ | stessa pin del desktop |
| `jsdom` | 29.1.1 | MIT | DOM test | harness unit |

**Decisione (charter §3):** ADOPT Capacitor, Vue, shadcn-vue (sorgente
generato), reka-ui e vaul-vue direttamente alle versioni esatte. ADAPT solo
contratti, identita e policy AVM. Non ricreare Drawer, Dialog, lifecycle
Android, code di persistenza o bridge nativi quando un upstream approvato li
possiede. M2 encryption, M3 inference, M6 cryptography e M7 WASM runtime
restano **unpinned e bloccati** finche le loro decisioni dedicate di
ricerca/sicurezza non vengono approvate.

## Decisione pin toolchain build (amendment Codex 2026-07-20)

Al primo install+build reale i pin `typescript@7.0.2` e `vite@8.1.5` non
compilano il progetto. Amendment autorevole Codex
`CODEX-TO-KIMI-M1-PIN-AMENDMENT.md`:

- **ADOPT `typescript@5.9.3`** (Apache-2.0): compilatore classico compatibile
  con `vue-tsc@3.3.7`, che risolve `typescript/lib/tsc`. Baseline richiesta dal
  gate `vue-tsc -b`.
- **ADOPT `vite@7.3.6`** (MIT): baseline mobile di produzione; il suo transform
  SFC risolve i props base reka-ui degli SFC upstream congelati senza alias,
  `@vue-ignore`, patch o modifica delle export map.
- **DEFER `typescript@7.0.2` (toolchain nativa/tsgo):** non esporta l'API
  Strada `typescript/lib/tsc` usata da `vue-tsc`; rivalutabile solo quando
  `vue-tsc` dichiara e prova una API compatibile. Nessun secondo compiler
  installato ora.
- **DEFER `vite@8.1.5` (Rolldown):** richiede un conformance gate dedicato che
  compili i 24 file upstream senza workaround. Fino ad allora resta upgrade
  differito.
- **REJECT** upgrade di `reka-ui`, modifica di `Button.vue`, `paths` speciali,
  `@vue-ignore`, patch di `node_modules`: la combinazione conservativa risolve
  la causa senza intaccare provenance o hash conformance (24/24 invariata).

Rollback: ripristinare le due righe pin ai valori precedenti e rigenerare il
lockfile; nessun altro file cambia. Le altre dipendenze e i 24 file
hash-locked restano invariati.

## Decisione contratti M0 (remediation 2026-07-18)

- **ADAPT JSON Schema Draft 2020-12:** envelope e payload applicano semantica
  equivalente a `required`, discriminatore costante e
  `additionalProperties: false`; le revisioni sono coerenti a livello di
  snapshot.
- **ADAPT il contratto V6 esistente:** `TalosMobileDesignTokens` usa la stessa
  struttura portabile `TalosThemeIdentity` del desktop. Canvas, DOM, FPS, DPR
  e implementazione dell'animazione restano desktop-owned.
- **DEFER DTCG 2025.10:** e il formato upstream preferito per un futuro adapter
  di scambio interoperabile, ma non sostituisce silenziosamente il wire
  contract V6 attuale. La migrazione richiede fixture desktop/mobile e una
  versione di envelope dedicata.
- **REJECT Ajv/Zod per M0:** nessuna nuova dipendenza e necessaria per questo
  gate circoscritto. I due parser restano indipendenti e sono vincolati da test
  differenziali comuni; l'adozione di un validatore schema upstream verra
  rivalutata quando il contratto diventera un workspace package pubblicabile.

## Stato installazione

- M0: **zero dipendenze installate**. I package `contracts` e `design-tokens`
  non hanno dipendenze; i test usano `node --test` con type stripping nativo.
- M1 prodotto: nessuna installazione autorizzata al momento del charter; la
  generazione del progetto Capacitor/shadcn-vue avviene solo in
  `.tools/research/kimi-mobile-m1/` (usa-e-getta) dopo sblocco finestra
  installazioni.

## Chat thread parity P1.3-A (2026-07-22)

- **ADOPT `markdown-it@14.3.0`** (MIT, integrity
  `sha512-RCEsPjR+sr0x+AuYp601tKTkgFG4YEPLCzHST3cQ/fhlJkqAkz1L2/Qbp1j9qw5SBwQHFBoW8+hoN5xssOF0Tw==`)
  as the frozen desktop CommonMark renderer.
- **ADOPT `dompurify@3.4.12`** (MPL-2.0 OR Apache-2.0, integrity
  `sha512-zQvGet8Z2sWbQhCmfFz/T5QWH2oBmjnqK3qvOjaqaNLrLEF912WamU+ohnTp0TCep/MFVHpdJuCZEdFOdTnEFg==`)
  as the final HTML allowlist boundary. This supersedes the initial 3.4.11
  resolution after GitHub-reviewed advisory `GHSA-c2j3-45gr-mqc4`; 3.4.12 is
  the patched release and the fresh npm audit reports zero vulnerabilities.
- **ADOPT `@types/markdown-it@14.1.2`** (MIT, integrity
  `sha512-promo4eFwuiW+TfGxhi+0x3czqTYJkG8qB17ZUJiVF10Xm7NLVRSLUsfRTU/6h1e24VvRnXCx+hG7li58lkzog==`)
  as build-time types only.
- **ADOPT `@capacitor/clipboard@8.0.1`** (MIT, integrity
  `sha512-iOlbTi8MojKyLnYE+M27priXid7vHd0PlDwyHohPzkuQ8Rkp6q7ykwZmPEUD+OnU/Ink7Qw/pUOfKgraKmA6Eg==`)
  behind the TALOS user-gesture adapter. Its peer range `@capacitor/core >=8`
  is satisfied by the frozen `8.4.2` core.
- **REUSE `reka-ui@2.10.1`** for the message overflow menu; no new focus or
  menu state machine is introduced.

The Markdown renderer and Reka overflow menu remain separate dynamic Vite
entries outside the initial bundle.
The native Clipboard plugin is not considered registered until a separately
inventoried `npx cap sync android` gate is complete.

## SheetJS CE document generation (2026-07-27)

- **ADOPT `xlsx@0.20.3`** (Apache-2.0) from the authoritative SheetJS CDN:
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- The public npm registry is rejected because its latest `xlsx` package is the
  stale `0.18.5` release. SheetJS advisories require `0.19.3+` for prototype
  pollution and `0.20.2+` for ReDoS.
- The exact upstream tarball is vendored at
  `upstream/sheetjs/xlsx-0.20.3.tgz` and installed through a `file:` spec, as
  recommended by the upstream installation guide for build stability.
- Frozen artifact: 2409319 bytes; SHA-256
  `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`;
  integrity
  `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`.
- `tests/unit/upstream/sheetJsConformance.test.ts` fails closed on dependency,
  lockfile, version, license, size or hash drift. Existing document tests prove
  real XLSX generation, reopen and Library ingestion.
- Rollback never restores `0.18.5`: XLSX generation is disabled and CSV remains
  available until a reviewed replacement is selected.

## Android safe web-read boundary (2026-07-28)

- **ADOPT `com.squareup.okhttp3:okhttp:5.4.0`** (Apache-2.0), published on
  Maven Central, behind the AVM-owned `TalosSafeWeb` Capacitor adapter.
- Runtime dependency provenance from the published POM: Kotlin stdlib
  `2.1.21`, Okio `3.17.0`.
- Purpose: use a custom `Dns` whose validated A/AAAA results are the same
  addresses OkHttp connects to; disable proxy and automatic redirects; retain
  platform TLS/hostname verification and bounded timeouts.
- Conformance: pure address-policy fixtures, mixed/rebinding DNS fixtures,
  runtime redirect/limit tests, Android compilation and APK assembly.
- Capacitor HTTP remains only for configured search-provider endpoints. It is
  rejected for arbitrary `web_read` because its public API can disable
  redirects but cannot pin a validated DNS answer to the connection.
- Rollback disables `web_read` and removes the plugin/dependency. It must not
  restore unrestricted model-selected native fetching.

## Unicode-safe generated filenames (2026-07-28)

- **ADOPT `unicode-segmenter@0.15.0`** (MIT), registry integrity
  `sha512-Xmvwqx4F8nGuCv2eGPJVJq73NMTfpqx2Xe9/v5hQoyAUnERVhX+sRkyYVdYoBUbnTok2FTBOlstUeQ5sRleXSA==`,
  upstream git head `fa2356dd197c982cf0b2cc4f8d676f64ba92460a`.
- Provenance: <https://github.com/cometkim/unicode-segmenter>. The pinned
  package declares Unicode 17.0.0 / UAX #29 revision 47, ESM, zero runtime
  dependencies, and verification against the official Unicode segmentation
  suite.
- Purpose: split extended grapheme clusters before document, generated-image,
  web-source, browser-download and Android SAF display-name stems are bounded.
  The AVM adapters retain extensions and existing ASCII fallbacks, apply
  filename security policy, and never rewrite source content.
- The exact upstream notice is retained at
  `upstream/licenses/unicode-segmenter-0.15.0-MIT.txt`.
- The segmenter entry is dynamically imported. The build gate must prove it is
  emitted outside the initial chat chunk and that the existing 560,000-byte
  budget remains green.
- Host-only `Intl.Segmenter` is rejected as the sole boundary because its
  Unicode/ICU version follows the installed Android System WebView rather than
  the APK pin. Older `graphemer` and `grapheme-splitter` releases are rejected
  for stale Unicode data and larger bundles.
- The native SAF defense-in-depth boundary adopts the standard
  `java.util.regex.Pattern` `\X` extended-grapheme matcher. Java SE 17 and the
  Android API both document that contract; supported legacy Android releases
  implement Java regex through platform ICU. This replaces
  `java.text.BreakIterator`, which was empirically shown on the installed
  legacy Temurin Java 17 probe to split a regional-indicator flag. No ICU4J/runtime package
  is bundled.
- Upgrade requires new Unicode version/license/integrity review, official
  grapheme fixtures, bundle-budget verification, and all three producer gates.
- Rollback removes the dependency and uses fixed ASCII stems until a reviewed
  replacement exists; raw UTF-16 truncation must not return.

## Orbitron boot wordmark and launcher geometry (2026-07-29)

- **REUSE `@fontsource/orbitron@5.3.0`** (SIL OFL-1.1), already pinned for
  the in-app TALOS wordmark; package publish hash `8eea555d30e69adc`.
- Provenance:
  <https://github.com/fontsource/font-files/tree/main/fonts/google/orbitron>
  and the Orbitron authors identified by the packaged license.
- Purpose: Orbitron remains the boot and in-app `TALOS` wordmark at weight 600
  with `0.35em` tracking. The Android launcher deliberately excludes all text
  and renders only the exact rested shield plus lit DAG from the final boot
  frame.
- The boot-only outline, shared mark geometry and source pin are recorded in
  `src/assets/talosBootFinalFrame.json`; the exact packaged notice is retained
  at `upstream/licenses/orbitron-5.3.0-OFL-1.1.txt`.
- No new runtime package is introduced. Android adaptive-icon guidance is
  adopted directly: 108 dp layers, meaningful symbol dimensions within
  48-66 dp, a centered 66 dp safe zone and a monochrome layer. The CSS glow is
  rejected for the launcher because Android requires clean adaptive foreground
  edges and VectorDrawable has no blur filter.
- Upgrade requires license/provenance review for the boot wordmark, generator
  conformance, Android resource compilation and physical circle/squircle plus
  themed-icon comparison. Rollback restores the prior generated mark geometry
  without changing launcher aliases or stored theme preferences.

## Tablet Settings scroll contract (2026-07-29)

- **ADOPT W3C CSS scrolling semantics directly** from CSS Overflow Level 3,
  Flexbox Level 1 and Overscroll Behavior Level 1; no package is added.
- **REUSE `reka-ui@2.10.1`** (MIT) for the existing vertical tabs roles,
  selection and keyboard behavior. TALOS owns only the bounded pane layout.
- The category rail is structural; one `min-h-0 flex-1 overflow-y-auto
  overscroll-contain` tablist owns vertical gestures. This follows the existing
  global-sidebar pattern and avoids an unbounded inner scroll container
  suppressing its scroll chain.
- Sources:
  <https://www.w3.org/TR/css-overflow-3/>,
  <https://www.w3.org/TR/css-flexbox-1/#min-size-auto>,
  <https://www.w3.org/TR/css-overscroll-1/>,
  <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>, and
  <https://www.reka-ui.com/docs/components/tabs>.
- Upgrade requires the focused unit layout contract and real-browser
  short-viewport scroll/keyboard gate. Rollback restores only the previous
  rail classes; no setting or persisted sidebar width changes.

## Tavily key-acquisition link (2026-07-29)

- **ADOPT Tavily's official Platform root**,
  `https://app.tavily.com/`, as the Settings destination for sign-up, sign-in
  and dashboard API-key management. Tavily's current Quickstart and API
  introduction link directly to this host.
- **REUSE `@capacitor/inappbrowser@4.0.1`** through the existing AVM-owned
  `openTalosLinkOnce(..., "system_browser")` adapter. No Tavily SDK or new
  runtime package is introduced.
- Tavily's key-management guidance is adopted: the URL contains no query,
  fragment, draft, saved-key state or account identifier, while the actual key
  remains exclusively in TALOS secure storage.
- Sources:
  <https://docs.tavily.com/documentation/quickstart>,
  <https://docs.tavily.com/documentation/api-reference/introduction>, and
  <https://docs.tavily.com/documentation/best-practices/api-key-management>.
- Upgrade requires rechecking Tavily's official target, exact-URL unit/E2E
  gates and native system-browser acceptance. Rollback removes only the
  source-specific action and translations; stored keys remain untouched.

## Memory disclosure deduplication (2026-07-29)

- **ADAPT current competitor transparency contracts** without importing a
  package: OpenAI exposes personalization sources through a consistently
  identified book control, Claude exposes past-chat citations plus a dedicated
  Memory panel, and Gemini exposes memory controls and an explicit usage check.
- TALOS retains `metadata.used_memories` on every injected turn and its
  dedicated Memory station, but renders the localized inline pill only on the
  earliest relevant message in the materialized chronological window. Older
  pages may move that one pill earlier; they never duplicate it.
- W3C WCAG 2.2 SC 3.2.4 consistent-identification guidance is adopted for the
  surviving label and icon. No message schema, provider payload, dependency or
  persistence marker is added.
- Sources:
  <https://help.openai.com/en/articles/8590148-memory-faq>,
  <https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context>,
  <https://support.google.com/gemini/answer/16598469>, and
  <https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html>.
- Upgrade requires unit proof for pagination relocation and a real multi-turn
  adapter/reload E2E. Rollback restores only repeated visual pills; persisted
  provenance remains unchanged.

## Global Library inclusive All projection (2026-07-29)

- **ADAPT current inclusive Library/search contracts** without importing a
  package: OpenAI describes Library as one browse/search surface with an
  inclusive “Show all file types” state; Google Drive composes search terms
  with type-filter chips; Apple exposes Links and Documents as narrow
  projections inside the containing shared-content set.
- TALOS `All` aggregates its existing non-link file projection and canonical,
  deduplicated saved-link rows. A researched page keeps its encrypted Markdown
  evidence copy but is never duplicated as a document tile. Search matches the
  visible title, host and URL plus the retained copy's existing text fields.
- W3C APG Button Pattern guidance is retained for the stable-label
  `aria-pressed` filter buttons. No schema, repository, persistence dependency
  or external protocol is added.
- Sources:
  <https://help.openai.com/en/articles/20001052-library-for-chatgpt>,
  <https://support.google.com/drive/answer/2375114?hl=en>,
  <https://support.apple.com/en-ca/guide/iphone/iphb66cfeaad/ios>, and
  <https://www.w3.org/WAI/ARIA/apg/patterns/button/>.
- Upgrade requires a four-chip mixed-content unit matrix plus a real
  composer-to-tool-to-Vault reload browser gate. Rollback restores only the
  global projection; stored dossiers remain unchanged.

## Reasoning row semantic icon (2026-07-29)

- **ADOPT DIRECTLY `Brain` from the existing `@lucide/vue@1.25.0` pin**
  (ISC), registry integrity
  `sha512-hkEetV+v48ScIn3uwqwWQ66sI8foeP2q6OMI09GzLFH4SfvBlfe3JHYlMBdBCqFC7WRlhFsndyDn/awRKRc2OQ==`.
- Lucide identifies Brain with mind, intellect, AI, think, thought and insight
  semantics, while Sparkles is associated with stars, effects, filters and
  magic. The Reasoning disclosure therefore uses Brain without introducing a
  custom asset, vendor mark, package or lockfile change.
- W3C decorative-image guidance is retained: the localized visible Reasoning
  label names the action and the adjacent icon remains inside the existing
  `aria-hidden="true"` wrapper, avoiding a duplicate announcement.
- Sources:
  <https://lucide.dev/icons/brain>,
  <https://lucide.dev/icons/sparkles>, and
  <https://www.w3.org/WAI/tutorials/images/decorative/>.
- Upgrade requires exact Brain/absence-of-Sparkles unit assertions plus the
  real provider-to-persistence-to-reload/drawer/export browser gate. Rollback
  restores only the icon import/render; stored reasoning remains unchanged.

## Composer and Settings interaction motion (2026-07-29)

- **ADAPT the existing pinned `vue@3.5.40` and `reka-ui@2.10.1` primitives
  behind TALOS Motion V6 tokens**; no dependency or lockfile change.
- Vue's transition guidance and web.dev's rendering guidance support
  compositor-only `transform` and `opacity` motion. TALOS commits final text
  layout before the first frame, measures only the composer's old/new edge,
  and never animates height, font metrics or text scale.
- Reka Tabs retains its existing automatic-activation and keyboard semantics.
  The supported preventable `closeAutoFocus` event is adapted only for
  navigation into a subsequent Settings workflow; ordinary drawer dismissal
  continues to restore the invoking trigger as required by the WAI-ARIA dialog
  pattern.
- W3C WCAG 2.3.3 and MDN `prefers-reduced-motion` guidance are applied through
  the existing category gates and an OS-level final-state override. Android's
  animation guidance is used only as a platform interaction reference; no
  Compose/native animation layer is added.
- Sources:
  <https://vuejs.org/guide/built-ins/transition.html>,
  <https://reka-ui.com/docs/components/tabs>,
  <https://www.reka-ui.com/docs/components/drawer>,
  <https://web.dev/articles/animations-guide>,
  <https://developer.android.com/develop/ui/compose/animation/composables-modifiers>,
  <https://developer.android.com/develop/ui/compose/animation/shared-elements/customize>,
  <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions>,
  <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion>,
  and <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>.
- Upgrade requires compositor-property unit enforcement, focus and rapid
  reversal races, phone/tablet browser coverage, OS/category reduced-motion
  coverage and the immutable initial-chunk budget. Rollback restores only the
  owned Motion V6 projection, composer, Settings and sidebar focus-handoff
  files; no data migration is involved.

## Vue I18n localization runtime (2026-07-28)

- **ADOPT `vue-i18n@11.4.8`** (MIT), registry integrity
  `sha512-0ULeHP6Z9CGvAm67S77ZEp41cfGXIREGL8qfhos2BMgcQQewtQcDKuojt6jjasAD/S8GwfTp2ySPmDSpwvrCMQ==`.
- Provenance: <https://github.com/intlify/vue-i18n> and the package published
  through npm. The exact upstream notice is retained at
  `upstream/licenses/vue-i18n-11.4.8-MIT.txt`.
- Purpose: load exact typed `en` and `it` catalogs before Vue mounts, switch
  application chrome reactively, and keep provider/model protocol content
  outside the UI localization boundary.
- Android per-app locale synchronization remains behind the AVM-owned
  `TalosLocale` adapter and existing pinned AppCompat `1.7.1`; provider wire
  formats never become the internal locale contract.
- Android 12/API 32 and lower adopt AppCompat's official disabled,
  non-exported `AppLocalesMetadataHolderService` with
  `autoStoreLocales=true`. The AVM adapter performs the documented one-time
  handoff from the pre-existing TALOS preference. Because AppCompat cannot
  discover TALOS's older Capacitor Preferences key, the adapter records
  `talos.mobile.locale.native-migration.v1=1` only after the custom-store
  handoff succeeds (or native state is already authoritative). Android 13+
  native Settings then remains authoritative, including the empty
  follow-System locale list; a failed handoff leaves the marker absent so the
  next healthy launch retries.
- `npm audit --omit=dev --json` reported zero production vulnerabilities after
  installation. The install also reported eleven development-only findings
  (one moderate and ten high), which remain visible for the final dependency
  audit and are not represented as production-cleanup completion.
- Upgrade requires catalog parity, uncovered-chrome, Android locale-resource,
  typecheck, bundle-budget and physical language-switch gates. Rollback removes
  the runtime/adapter and falls back to the complete English catalog; it must
  not leave mixed-language chrome.

## Localized new-chat welcome library (2026-07-29)

- **ADAPT Unicode CLDR `48.2`, tag `release-48-2`** behind the AVM-owned
  `talos.welcome/1` parser. Only the exact EN/IT flexible day-period intervals
  from `common/supplemental/dayPeriods.xml` are represented; the full CLDR data
  set is not shipped and no runtime dependency is added.
- **REUSE `@lucide/vue@1.25.0`** (ISC, integrity
  `sha512-hkEetV+v48ScIn3uwqwWQ66sI8foeP2q6OMI09GzLFH4SfvBlfe3JHYlMBdBCqFC7WRlhFsndyDn/awRKRc2OQ==`)
  for the exact static PartyPopper, Heart, Ghost, Snowflake, Gift and Clock
  allowlist. No custom SVG, emoji or second icon package is introduced.
- **ADAPT Vue `defineAsyncComponent`** with zero-delay loading/error fallback
  and local async-state ownership. Vue `Suspense` is rejected for this single
  leaf because its current official status remains experimental and its
  production runtime exceeded the immutable initial-chunk budget.
- Google Conversation Design, W3C decorative-image guidance, WCAG 2.3.3,
  Open WebUI and LibreChat were inspected as design references. TALOS uses
  original, concise offline copy; competitor strings, model-generated
  greetings, remote copy services and personal-data inference are rejected.
- Node's mandatory JSON import attribute is respected in production dynamic
  imports. The Playwright oracle reads the same packaged JSON bytes through
  `readFileSync`/`JSON.parse` to avoid transform-specific import-attribute
  behavior.
- Sources:
  <https://unicode.org/reports/tr35/tr35-dates.html>,
  <https://raw.githubusercontent.com/unicode-org/cldr/release-48-2/common/supplemental/dayPeriods.xml>,
  <https://vuejs.org/guide/components/async.html>,
  <https://vuejs.org/guide/built-ins/suspense.html>,
  <https://developers.google.com/assistant/conversation-design/greetings>,
  <https://www.w3.org/WAI/tutorials/images/decorative/>,
  <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions>,
  and <https://nodejs.org/api/esm.html#import-attributes>.
- Upgrade requires exact minute-boundary, schema, EN/IT semantic-index,
  accessibility, async fallback, manifest-boundary, immutable bundle-budget,
  browser and physical Android checks. Rollback restores the fixed localized
  fallback and removes only the five welcome dynamic boundaries.

## Additive Library context policy and immutable sends (2026-07-29)

- **ADAPT Open WebUI full-context/focused Knowledge modes** and **Google
  NotebookLM source selection** into explicit broad, relevant-only,
  ask-before-egress and on-demand modes at global, chat and one-turn scope:
  <https://docs.openwebui.com/features/workspace/knowledge/> and
  <https://support.google.com/notebooklm/answer/16215270>.
- **ADAPT OpenAI Vector Store query rewriting/ranking/score thresholds**,
  **Azure AI Search history-aware agentic retrieval**, and **Anthropic
  Contextual Retrieval** as the retrieval-quality contract, without adopting a
  provider wire format as TALOS state:
  <https://platform.openai.com/docs/api-reference/vector-stores>,
  <https://learn.microsoft.com/en-us/azure/search/search-agentic-retrieval-concept>,
  and <https://www.anthropic.com/news/contextual-retrieval>.
- **ADAPT MCP Elicitation**, **OWASP prompt-injection separation**, and **NIST
  least privilege/audit** for explicit decisions, untrusted Library bodies,
  live revocation, dedicated policy capability, optimistic revisions, receipts,
  audit, and bounded undo:
  <https://modelcontextprotocol.io/specification/draft/client/elicitation>,
  <https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html>,
  and <https://csrc.nist.gov/projects/role-based-access-control>.
- OpenAI's user-managed Library retention surface was inspected for ownership
  and deletion expectations:
  <https://help.openai.com/en/articles/20001052-library-for-chatgpt>.
- No upstream runtime is integrated. TALOS keeps a provider-neutral,
  versioned policy/selector/send-snapshot boundary and preserves legacy broad
  users without a storage rewrite. Provider, model, session, turns, selected
  files, authorization and artifact ownership are frozen before asynchronous
  retrieval; live restrictive policy is rechecked immediately before egress.
- R8 intentionally uses a deterministic multilingual lexical adapter with a
  positive threshold and abstention. The already pinned development dependency
  `@huggingface/transformers@4.2.0` is not promoted into an implicit runtime
  model: no exact model revision, offline cache, APK-size, low-end Android
  memory/latency, multilingual quality, licence or download-consent gate has
  been approved.
- Direct provider vector-store state, automatic migration away from broad
  compatibility, and an unpinned remote embedding download are rejected.
  Upgrade requires a separate ledger with a pinned semantic model and real
  cold/warm physical-device evidence. Rollback removes only the optional R8
  policy/guard adapters and retains the established Library and send-ownership
  contracts.

## Nonblocking tool authorization checkpoints (2026-07-29)

- **ADAPT MCP Elicitation `2025-11-25`** for request identity,
  decline/cancel, out-of-band sensitive authorization, and manual
  retry/cancel/resume recovery:
  <https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation>.
- **ADAPT RFC 8785 JCS (June 2020)** for deterministic validated-input
  canonicalization before SHA-256 request binding:
  <https://www.rfc-editor.org/rfc/rfc8785.html>.
- **ADAPT LangChain HITL checkpoint semantics**, with the inspected
  conditional-interrupt floor `langchain>=1.3.3`, but do not add LangChain as a
  runtime dependency:
  <https://docs.langchain.com/oss/python/langchain/human-in-the-loop>.
- ChatGPT Apps, Claude Code permissions, OpenHands security, AutoGen HITL, and
  Android runtime-permission UX were inspected as current primary references:
  <https://help.openai.com/en/articles/11487775-connectors-in-chatgpt>,
  <https://code.claude.com/docs/en/permissions>,
  <https://docs.openhands.dev/sdk/guides/security>,
  <https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html>,
  and <https://developer.android.com/training/permissions/requesting>.
- No upstream runtime is integrated. TALOS keeps its provider-neutral bounded
  TypeScript loop, SQLCipher repository, capability policy, evidence, audit,
  and recovery ownership. The established durable-interrupt semantics are
  adapted behind `talos.tool.authorization-grants/1` and
  `talos.tool.authorization-checkpoint/1`.
- Direct LangGraph/OpenHands/AutoGen integration is rejected because it would
  introduce a second runtime and product-state owner. The former parked-Promise
  consent is also rejected because it blocks the composer and cannot survive a
  process loss.
- Upgrade requires grant precedence, exact-call binding, whole-round preflight,
  process-reload, uncertain-side-effect, EN/IT accessibility, real-provider,
  and physical Android gates. Rollback never deletes unresolved encrypted
  authorization activity.

## Compatibilita host (ultimo gate 2026-07-22)

- Node 24.18.0 e npm 11.16.0 presenti; runtime M1 pinnato a
  `engines.node >=24.18.0 <25` (Capacitor 8 CLI richiede solo Node 22+).
- Requisito compilazione Android: JDK 21 (il `capacitor.build.gradle`
  generato fissa `JavaVersion.VERSION_21`; supera il precedente requisito
  documentato). Il gate usa Eclipse Temurin `21.0.11+10` come archivio
  portabile sotto `.tools/jdk`, senza installazione host o modifica permanente
  di `JAVA_HOME`; SHA-256 archivio Adoptium
  `d3625e7cadf23787ea540229544b6e2ab494b3b54da1801879e583e1dfee0a64`.
- Android SDK e adb sono presenti nel profilo utente con Platform 36,
  Build Tools 35.0.0/36.0.0 e Command-line Tools `latest`; le variabili
  `ANDROID_HOME`/`ANDROID_SDK_ROOT` vengono impostate solo nel processo di
  build. `gradlew test assembleDebug --no-daemon` e riuscito; debug APK
  SHA-256 `fbba81cae06b2bdaa145ab73d4ed3177e8843311c5fb47d38cd1457e2708d3bd`.
  La verifica device resta aperta: `adb.exe` termina sull'host con
  `0xC0000135` prima di enumerare dispositivi, quindi install e launch non sono
  ancora dichiarati verdi.

## Rollback

- Ogni pin e revocabile restituendo la riga in questo file e rimuovendo la
  dipendenza dai package interessati; nessun artefatto M0 dipende da questi
  pacchetti (M0 e dependency-free), quindi il rollback di M0 = eliminazione
  dei file M0, senza effetti su desktop/core/validator.
- Per M1+: il rollback di una dipendenza richiede la rimozione dal lockfile
  mobile, la riesecuzione dei gate focalizzati e la registrazione del motivo
  nel manifest M1.
