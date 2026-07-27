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
