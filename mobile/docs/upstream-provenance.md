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
| `@capacitor/core` | 8.4.2 | MIT | bridge nativo | Android/iOS, Node 20+ |
| `@capacitor/cli` | 8.4.2 | MIT | `cap sync/add` | allineata a core |
| `@capacitor/android` | 8.4.2 | MIT | piattaforma Android | richiede JDK 17+, Android SDK, AGP 8.x |
| `@capacitor/app` | 8.1.1 | MIT | lifecycle/back button | plugin ufficiale |
| `@capacitor/keyboard` | 8.0.5 | MIT | tastiera virtuale | plugin ufficiale |
| `@capacitor/status-bar` | 8.0.3 | MIT | safe area/status bar | plugin ufficiale |
| `@capacitor/preferences` | 8.0.1 | MIT | preferenze semplici | solo non-segrete; Vault e M2 |
| `vue` | 3.5.40 | MIT | UI framework | allineata al desktop |
| `vue-router` | 5.2.0 | MIT | routing shell | history Capacitor-safe |
| `@vueuse/core` | 14.3.0 | MIT | composable utility | gia in uso desktop |
| `vite` | 8.1.5 | MIT | build | allineata al desktop |
| `@vitejs/plugin-vue` | 6.0.8 | MIT | SFC | con vite 8 |
| `typescript` | 7.0.2 | Apache-2.0 | tipizzazione | erasable-syntax per type stripping |
| `vitest` | 4.1.10 | MIT | unit test M1+ | solo dopo autorizzazione install |
| `shadcn-vue` CLI | 2.8.0 | MIT | generatore Drawer/Dialog | output hand-authored nel repo |
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

## Compatibilita host (da K0 audit 2026-07-18)

- Node 24.18.0 e npm 11.16.0 presenti; type stripping attivo. Il baseline
  documentato per eseguire direttamente i package `.ts` e Node 22.18.0.
- JDK 17.0.4 presente ma fuori PATH (PATH = Java 8, JAVA_HOME = JDK 11):
  Capacitor 8/AGP richiedono JDK 17 esplicito.
- Android SDK, Android Studio, adb, emulatore, Rust/rustup: assenti. Gate
  APK/emulatore/dispositivo fisico bloccati finche la toolchain non esiste.

## Rollback

- Ogni pin e revocabile restituendo la riga in questo file e rimuovendo la
  dipendenza dai package interessati; nessun artefatto M0 dipende da questi
  pacchetti (M0 e dependency-free), quindi il rollback di M0 = eliminazione
  dei file M0, senza effetti su desktop/core/validator.
- Per M1+: il rollback di una dipendenza richiede la rimozione dal lockfile
  mobile, la riesecuzione dei gate focalizzati e la registrazione del motivo
  nel manifest M1.
