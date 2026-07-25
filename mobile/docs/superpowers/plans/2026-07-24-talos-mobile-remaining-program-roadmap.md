# TALOS Mobile — Remaining-Program Roadmap (reconciled)

- **Owner:** Antonio Rizzo (Ninozz95) · **Agent:** Fable (full-owner mobile lane `lane/kimi-mobile`)
- **Date:** 2026-07-24 · **Reconciled at HEAD:** `44a3b5c` (post F1–F6 + R1–R3 + Claude-style redesign + R7 cleanup)
- **Desktop main:** `C:/Users/ninox/Desktop/AVM` = READ-ONLY reference (frozen at `5dd0c0be` for style parity)
- **Status legend:** ✅ shipped · 🟢 actionable now (no external blocker) · 🟡 actionable, owner-gated decision · 🔴 BLOCKED (host toolchain / authorization) · 🔵 standing rule / Codex-owned

> **Why this document exists.** The earlier inline roadmap was built from memory + one ledger and was
> incomplete. This version is reconciled from a full sweep of the implementation corpus (see Sources)
> via four parallel review agents, then cross-checked against what has actually shipped through HEAD.

## Sources swept (method: 4 parallel extraction agents, open items only)
1. `plans/2026-07-22-talos-mobile-desktop-parity-master-plan.md` (P0–P7 master plan)
2. `research/2026-07-23-mobile-roadmap-end-dual-gap-report.md` (dual gap report, feature-parity delta)
3. `specs/2026-07-23-claude-functional-parity-proposal-v2.md` (Claude functional-parity v2, 4792 lines)
4. `architecture/talos-avm-feature-gap-full-implementation-plan.md` + `architecture/talos-avm-agent-roadmap-checklist.md` (desktop/backend program status)
5. `plans/2026-07-21-talos-mobile-chat-fv2-06-v2-plan.md` (FV2-06 mobile chat/model-lab plan — checklist unticked = doc-lag; work shipped)
6. Desktop planning: `AVM/docs/planning/2026-07-21-avm-open-threads-and-roadmap.md` + `…-fe-work-order-fable.md`

---

## 0. Baseline — what is SHIPPED (do not re-plan)
F1 shell · F2 chat/composer/streaming/intro/app-lock · F3 settings/stations/tone/drawer · F4 functional block
(gestures, **session export**, **Memory station**) · F5 (mic liveness, **live-edge pill**, PIN modal, **Tasks/Notes/Doctor
stations**) · F5.1 (**archive**, hold-menu) · F6 tablet split view · R1–R3 device remediation · Claude-style redesign
(**local account + predisposed OAuth**, grouped Settings, FABs, contextual back, uniform radius, serif, **local TTS**) ·
R7 (settings-scroll + contextual-back bugfix, cleanup/coherence pass). Chat + Model Lab parity = master-plan **P0/P1
COMPLETE**. Sensitive-text censor **removed** by owner directive (do not reintroduce).

---

## 1. Mobile-lane phases — ACTIONABLE (in proposed order)
These need no external toolchain and no new authorization; I can build, gate, commit and APK them in-lane.

| # | Fase | Scope (1 riga) | Stato | Doc |
|---|------|----------------|-------|-----|
| ~~N1~~ | ~~Wizard creazione account guidato~~ | Onboarding a step: benvenuto → nome+avatar → tema opz. → PIN opz. → OAuth predisposto → fine; local-first, no fake auth | ✅ **DONE 2026-07-24** (`5d27efa`, APK R8, SF-critic passato) | spec + code-ledger 2026-07-24 |
| **N1.5a** | **File uploader — fix funzionale vision (root-cause)** | Anthropic+Gemini ora dichiarano `image` in discovery (web-research: tutti i Claude e i Gemini generateContent sono multimodali) → allegare immagini a Claude/Gemini non è più bloccato dal gate. RED→GREEN adapter tests. | ✅ **DONE 2026-07-24** (`5a05305`, APK R10) | — |
| **N1.5b** | **File uploader — parity + ONE-UP UX (owner: "anche meglio")** | thumbnail immagini reali, label Vision-vs-Text sul chip, messaggi errore friendly (wire `attachmentErrorMessage`, no codici `TALOS_*`), toggle "Vision routing" reso funzionale (oggi inerte), camera/paste/drag, Ollama `/api/show` per vision per-modello. (Refutato: MIME NON scartato.) Sottosistema vault/firma/persistenza già solido. Ricerca web competitor PRIMA. | 🟢 **next** | — |
| ~~Nav~~ | ~~Back di sistema → sidebar~~ | Owner: Back al top di una station riapre la sidebar (menu principale), non chiude su chat; resolver puro testato | ✅ **DONE 2026-07-24** (`769a64e`, APK R9) | — |
| N2 | Residui chat-surface | Per-message evidence drawer (sources/used_context/mutation badges); temporary/non-persisted chat toggle; welcome prompt library; command palette (valutare, non portare cieco) | 🟢 | — |
| N3 | Contenuto stazioni non-bloccate | Tools registry viewer (read-only health); Skills registry viewer (locale, exec gated); Calendar **drafts** locali (write esterno double-gated P6); Deep Research **queue UI** (contenuto pieno dipende da search bloccata) | 🟢 / 🟡 | — |
| N4 | TTS neurale provider-backed | Estende il TTS locale con voci OpenAI/ElevenLabs, gated su key+rete; fallback voce device | 🟡 (key/rete) | — |
| **N4.5** | **Blocchi di ragionamento espandibili (owner 2026-07-24)** | Come Claude/ChatGPT: catturare il reasoning dalla risposta (Anthropic thinking blocks, OpenAI reasoning, Gemini thinking, Ollama think — via stream), salvarlo come parte distinta del messaggio, render **collassabile "Reasoning"** (chiuso di default), mostrato SOLO quando il modello lo restituisce. Stato attuale: solo lato INPUT (toggle+effort inviati); output NON parsato/mostrato. Parity+one-up. | 🟢 actionable | — |
| N5 | Context Vault P2 / RAG locale | Context-set locali, chunk metadata, retrieval, citazioni sopra l'attachment vault già fatto | 🟡 (decisione M2 sovereign-core = owner-gated) | — |
| N6 | Refactor rendering messaggi + sweep select | Toggle Sezioni↔Bolle (assistant full-width default, user bolla+collapse) in Appearance; sweep di eventuali `<select>` nativi residui nel mobile | 🟢 (mockup da approvare) | — |

## 2. BLOCKED / gated — non completabili in-lane finché non si sbloccano
| Item | Perché è fermo | Sblocca chi |
|------|----------------|-------------|
| **P7 device-verify + APK release signing** | Toolchain Android/ADB assente sull'host (adb `0xC0000135`); APK oggi è solo debug | Owner/host (installare SDK+ADB) |
| **P5 Forge / inference locale (Zethos)** | Toolchain Rust/NDK assente; benchmark runtime Android non eseguibili | Codex/host |
| **P6 connettori esterni** (Google Workspace, invio email, write calendar) **+ sync desktop↔mobile** | P6 non autorizzato; richiede backend + OAuth pin + decisione sync | Owner (autorizzare P6) + Codex backend |
| **Browser evidence parity completa** | Richiede trusted-node Playwright/HMI + verifica su device fisico | Codex (integrazione) |
| **models_runtime / benchmarks on-device** | Harness Z14 + toolchain assenti | Codex/host |

## 3. Programma grande — Claude Functional-Parity v2 (piattaforma agentica)
Spec `2026-07-23-claude-functional-parity-proposal-v2.md` = **proposta**, tutto PENDING. Sanzionata "dopo il
completamento funzionale mobile". La piattaforma agentica è l'**obiettivo trasversale**, non una singola fase;
matura progressivamente e culmina nello Slice 10.

| Slice | Scope (1 riga) | Note |
|-------|----------------|------|
| **0 — Audit & baseline** | Inventario capability, sequence diagram, dependency map, threat model, gap matrix, ADR iniziali | **precondizione obbligatoria, nessuna migrazione ampia prima** |
| 1 | Run model + event stream read-only (Run/Task/RunEvent, SSE resumable, timeline) | legacy chat resta live |
| 2 | Tool registry + capability discovery (schemi versionati, validazione Ajv/Zod, adapter read-only) | |
| 3 | Policy, approval & local writes (decisioni policy, UX approvazione, file diff, checkpoint, audit) | |
| 4 | Sandbox & execution session (isolamento, lifecycle processo, log indicizzati, secret broker) | |
| 5 | Repo intelligence & multi-strategy editing (ripgrep, LSP, AST solo dove serve, three-way merge) | |
| 6 | Research & citations (scope, search/fetch, snapshot, citazione a livello claim, difese injection) | |
| 7 | File generation (1 formato più richiesto: manifest→parse→render→checks→preview→download checksummato) | |
| 8 | Static artifact runtime (artifact statici/interattivi, origin separata, CSP, versioni immutabili, rollback) | |
| 9 | AI/connector artifacts (capability token, approvazioni write, audit connector) | gated su Slice 3/8 |
| 10 | Multi-agent & durable workflows (task graph osservabile, budget per-agente, recovery crash worker) | ultimo / condizionale |

## 4. Cross-cutting / Codex-owned (io rispecchio, non implemento in-lane)
- 🔴 **Browser reliability** (PROD-CRITICAL): WAL+busy_timeout per "database is locked", poi Stage-2 Playwright-builtin — Codex.
- **Backend residuals** (desktop essenzialmente costruito): connettori email/calendar/web-search reali, embeddings memoria, benchmark threshold, backup/restore-export, alcuni a11y desktop — Codex/backend.
- 🔵 **Desktop→mobile parity mirror** (regola permanente): ogni modifica FE desktop rilevante → mirror-ticket Codex→Fable. Ogni mia implementazione mobile rilevante → mirror-draft verso desktop via Codex.
- **Desktop STYLE alignment (Part B del gap report):** congelato dietro il freeze desktop `5dd0c0be`; attuabile solo "quando l'owner apre la finestra desktop".

## 5. Richieste owner separate (in coda, non nella spec parity v2)
- **#27 TALOS self-knowledge** — TALOS conosce sé stesso (creatore ing. Antonio Rizzo/Ninozz95, architettura); NON presente nella spec Claude-parity → workstream a sé, memoria canonica da desktop main.
- **Refactor rendering messaggi** (vedi N6) — owner request, mockup da approvare.

## 5.bis Composer immersivo ChatGPT-style (owner 2026-07-24, 3 screenshot) — feature
Due toggle in **Appearance**, entrambi con funzionalità IDENTICHE al composer attuale (vincoli ingegneristici TALOS):
- **Toggle "Immersive composer"**: unfocused = pill compatta singola riga `[+] · input · mic · send` (NO modello);
  al focus si ESPANDE (box più alto) e la riga in basso mostra `[+] · modello+effort · mic · send` (widen leggero).
- **Toggle "+ alternativo (dropdown)"**: il `+` apre un DROPDOWN stile ChatGPT (Fotocamera / Foto / File / Plugin /
  Livello di ragionamento) invece del bottom-drawer attuale.
Convive con il `composer_drawer` esistente. Persistere in settings.shell (nuovi flag). Ricerca web + TDD + frontend skill.

## 6. UI polish backlog (owner 2026-07-24)
- ✅ **Padding laterale Settings** — ridotto a `px-3` (TabsList + detail-pane) — DONE (APK R11).
- ✅ **File resta nel composer dopo invio** — ROOT CAUSE: `chat.send` ritorna `accepted` solo a fine streaming, il testo si puliva subito ma gli allegati solo dopo → lingering per tutta la generazione. FIX: callback `onPersisted` che pulisce il composer all'istante del commit del turno utente (TDD). DONE (APK R11).
- ✅ **Animazioni di chiusura + bug back composer-drawer (owner 2026-07-24)** — R12: leave-fade su wizard/intro. R13: **BUG risolto** — il "+" composer-drawer col back gesture CHIUDEVA L'APP (`toolDrawerOpen` era locale, App.vue non lo vedeva → cadeva su exit); ora c'è un **registry overlay-back LIFO** (`useTalosOverlayBack`) consultato da App.vue → il back chiude il drawer; + il drawer ora **anima in uscita** (requestClose riusa il transform di enter, reduced-motion aware). DONE (APK R13).
- ✅ **Errori uploader friendly** (R13) — mapper `attachmentErrorMessage` sempre applicato + nessun leak di codici `TALOS_*` (fallback generico). DONE.
- ✅ **Mark in-app tinto per preset** — GIÀ a posto: `.talos-short-logo{color:var(--talos-accent)}` + mark `background:currentColor` → cambia già col preset. Confermato.
- ✅ **Sub-tab Appearance sticky + swipe + flush** (R13/R14) — strip Design/Motion/Voice/Visibility `sticky` (fix flush: `-top-4` compensa il `p-4` dello scroller `TalosMobileScreen`, verificato screenshot) + **swipe sx/dx cambia sezione** (TabsRoot controllato, dominanza orizzontale; TDD). 
- ✅ **Drawer composer: slide-out completo** (R14) — la chiusura ora scivola tutto fuori (`translate-y-full` 300ms ease-in-out, setTimeout sincronizzato), non più il micro-24px "che si blocca".
- ⬜ **Icona LAUNCHER per tema preset — BLOCCO (owner 2026-07-24, approccio approvato)** — l'app-icon cambia colore col preset via **activity-alias** (uno per preset) + plugin `@capacitor-community/app-icon`. UX owner: al cambio preset un **dialog "l'app deve riavviarsi — Riavvia ora / Più tardi"**; con "più tardi" lo switch avviene al pause/close (l'icona cambia al prossimo avvio). Nota: su Android lo switch alias **uccide comunque l'app** → il restart è nativo, non un limite. Serve: 14 set adaptive-icon (tooling `android-assets`) + 14 alias nel manifest + plugin + dialog + defer. Blocco a sé, vincoli ingegneristici TALOS. Sequenza da decidere (consiglio: dopo la Libreria).
- ⬜ **Libreria documenti cross-chat tipo ChatGPT (owner 2026-07-24)** — vault globale consultabile da TUTTE le chat (file inviati E generati), stile "Files/Library" ChatGPT. Esiste già un vault per-context; serve la superficie "libreria" globale. Vincoli ingegneristici TALOS (ricerca web competitor PRIMA).
- ⬜ **Font per tema preset + font sistema vs chat (owner 2026-07-24, NON urgente)** — ogni theme preset (calm/forge/Signal Command…) può avere il proprio font; distinguere il font **UI/sistema** dal font **chat** (due impostazioni separate in Appearance, oltre allo "Stile carattere" attuale). Da sequenziare.
- **Icona theme-aware** — launcher: aggiungere il layer `<monochrome>` all'adaptive icon (Android 13+ themed icons,
  Material You, nativo/gratuito, segue il tema OS); NON usare lo switch programmatico dell'icona legato al tema
  (invasivo). (ricerca web 2026-07-24)
- **Mark in-app tinto per preset di tema (owner 2026-07-24)** — il brand mark in-app cambia colore con l'accent del
  preset attivo (calm/forge/Signal Command → il proprio `--talos-accent`); via currentColor/token, zero plugin.
- **Sub-tab Appearance sticky + swipe (owner 2026-07-24, screenshot)** — la strip Design/Motion/Voice/Visibility resta
  STICKY (pinned in alto durante lo scroll) e cambia tab con SWIPE orizzontale sx/dx (pattern moderno). Valutare
  estensione ad altre superfici a tab (Model Lab provider). Ricerca web swipeable-tabs PRIMA (gesture vs vertical
  scroll, reka Tabs + sticky `top-0`).

---

## Appendice A — Riconciliazione gap-report (PLANNED → stato reale)
Molti item marcati "PLANNED" nel report del 23/07 sono stati poi chiusi da F4/F5/F5.1:

| Item gap-report | Stato reale a HEAD |
|-----------------|--------------------|
| Memory / Tasks / Notes / Doctor stations | ✅ (F4/F5) |
| Session export · live-edge pill · archive | ✅ (F4 / F5 / F5.1) |
| Sensitive-text blur | ❌ rimosso per direttiva owner (non reintrodurre) |
| Per-message evidence drawer · temporary chat · welcome prompt library · command palette | ⬜ aperti → **N2** |
| Tools/Skills registry viewer · Calendar drafts · Deep Research content | ⬜ aperti → **N3** |
| Context Vault chunk retrieval / RAG | ⬜ aperto, gated M2 → **N5** |
| Folders/favorites (oltre archive) | ⬜ aperto (parziale) |

## Appendice B — Nota di attendibilità
`mobile/docs/feature-parity.json` è il manifest canonico ma il suo `desktop_revision` è fermo a una revisione
precedente: NON è affidabile come specchio dello stato attuale finché non viene rigenerato contro `5dd0c0be`
(è esso stesso un task di P7). Questa roadmap si basa quindi su ledger + evidenza dei gate, non sul manifest.
