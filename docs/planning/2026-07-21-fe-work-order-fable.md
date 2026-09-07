# FE Work-Order → Fable (tabella di marcia)

Fonte: work-order utente relayato 2026-07-21. Ordine consigliato (riordinabile): **C → B → A → D → E → F/G**.
Per OGNI item: chiudere il report con `mobile-relevant: sì/no + cosa` (Codex relaya il mirror a Kimi); **commit dell'utente**.

Legenda consapevolezza: ✅ noto · 🟡 parz. noto · 🆕 nuovo.

---

## C) SWEEP TalosThemedSelect — ✅ noto — **FATTO (2026-07-21)**
Rimpiazzare gli ~~8~~ **26** native `<select>` di Settings/Theme con `TalosThemedSelect` (basta dropdown bianchi OS su tema scuro). Aggiornare i selettori E2E (combobox/option, **non** `selectOption`).

**Esito:** 26 select migrati in 9 file (settings: SearchPanel 2, SettingsCenter 3, Appearance 5, Browser 1, ModelsPanel 2; theme-engine: ThemePresets 1, ThemeAdvanced 1, ThemeCustomize 5, ThemeMotion 6). `TalosThemedSelect` esteso (`noneLabel` per le opzioni `value=""`, wrapper `<div>` per class fallthrough). Test riscritti reka-aware; E2E: helper `selectThemedOption` + fix `chooseModelProfile` (debito dal drop picker). **Full vitest 168/1337 verde**; E2E authored+syntax-OK (Codex gira Playwright al gate). Ledger: `docs/superpowers/ledgers/2026-07-21-themedselect-sweep-ledger.md`.
`ui/Select.vue` residuo SOLO nel context-set del composer (fuori scope). **mobile-relevant: parziale** — Kimi usa già select tematizzati (12/12); nessun nuovo mirror atteso.

## B) COMPOSER ICON-CONTROLS + TOOLTIP — ✅ noto — **FATTO**
- Settings→Appearance: composer di DEFAULT a icon-controls (`composer_mode` default → `minimal`).
- Tooltip custom all'hover di OGNI icona composer (modello, effort, context, attach, browse, temporary, improve, send) — label umane, a11y invariata.
**Esito:** `TalosSlimComposer.vue` icone con `ui/Tooltip.vue` (portalizzato, self-contained); default `composer_mode: 'minimal'` in `talosChatLayout.ts` con audit E2E completo (~6 spec riallineati). Full vitest verde. **mobile-relevant: sì** — mirror composer icon+tooltip a Kimi.

## A) MESSAGE-RENDERING (bolle → sezioni) — ✅ noto — **FATTO**
- Default: risposte assistant = SEZIONI full-width, NO bolla, larghezza piena della sezione chat.
- Messaggi utente: restano bolla; se lunghi → troncati con Espandi/Riduci.
- Settings→Appearance: toggle "Sezioni / Bolle" (Bolle = stile attuale, niente si perde).
**Esito:** `message_style` ('sections'|'bubbles', default 'sections') in `talosChatLayout.ts`/`talosTypes.ts`; `TalosChatSurface.vue` (`messageSurfaceClass` + collapse utente), toggle in Appearance, whitelist `themeEngineState.ts` (`message_style`). Full vitest verde. **mobile-relevant: sì** — mirror stile messaggi a Kimi. Mockup: artifact `be2515e3-…`.

**Chiusura regressioni desktop/API (2026-07-22):** il backend Laravel ora valida e sanitizza realmente `chat_layout.message_style` con i soli valori `sections|bubbles`; il round-trip bubbles→sections, GET/reload e il rifiuto atomico di valori sconosciuti sono coperti in `TalosSettingsApiTest`. La sezione assistant ha un override scoped `max-width: none` che non modifica user bubble, assistant bubble o browser-task. Il RED Chromium 1920×1080 misurava parent 1120 px, sezione 760 px, gap destro 360 px; il GREEN impone gap ≤1 px e `max-width: none` anche dopo switch, salvataggio e reload. Screenshot headless Sections/Bubbles/Sections ispezionati. Gate freschi: Laravel Settings **74 test / 920 assert**, Vitest **175 file / 1369 test**, build production verde, Playwright Chromium **1/1**. Ledger: `2026-07-22-chat-message-style-regression-ledger.md`.

## D) VOCE / STT — ✅ noto — **PARZIALE (Fase 1 FE integrata; gate prod aperti)**
- Bottone mic nel composer → dettatura speech-to-text nell'input.
- Lib upstreamabile (famiglia Whisper), estremamente reliable. In-browser (default, privacy) + cloud (worker BE) + auto.
**Esito:** contratto engine `lib/talosDictation.ts` (server-whisper cloud-ready + fault mapping `TALOS_STT_*`), browser Whisper `lib/talosDictationBrowser.ts` (`@huggingface/transformers` q8, lazy via doppio dynamic import → mai in entry chunk), composable `useTalosDictation.ts` (MediaRecorder push-to-talk, mode FE-owned localStorage condiviso), mic in `TalosSlimComposer.vue`, selettore "Dictation" in Appearance. **Chunk-budget fix:** engine estratto dietro dynamic import + `talosDictationModes.ts` minimale (entry-safe) → entry sotto 512 kB. Handoff BE: `2026-07-21-fable-to-codex-stt-cloud-endpoint.md` (Codex ACK). Ledger: `2026-07-22-stt-dictation-ledger.md`. **mobile-relevant: sì** — mirror mic+STT a Kimi (Fase 1 FE già usabile in locale).

**Audit integrazione (2026-07-22):** la slice non è ancora chiusa rispetto all'acceptance originale. `useTalosDictation` espone `error` e `cancel()`, ma il workspace inoltra al composer soltanto stato/supporto/toggle: mancano quindi errore visibile, cancel e retry espliciti. Serve inoltre un gate browser reale microfono → primo download modello → trascrizione nell'input. L'audit dipendenze passa da 6 finding nel baseline a 10 dopo Transformers.js: i 4 high aggiuntivi sono nella catena Node-only di build (`onnxruntime-node` → `adm-zip`, `sharp`), assente dal bundle browser e dall'immagine runtime finale, ma senza fix upstream disponibile al momento dell'audit. La promozione production richiede una decisione di rischio/remediation registrata; il solo lazy-loading non chiude il finding.

**Avanzamento driver (2026-07-22):** il mic è ora immediatamente a destra del Prompt Enhancer. Il gate dedicato Playwright 1.61.1 / Chromium 149 registra con `getUserMedia` + `MediaRecorder` nativi su device audio virtuale Chromium, verifica geometria Enhancer→Mic, multipart audio non vuoto, inserimento trascrizione e ritorno a `idle`. Ledger: `2026-07-22-composer-dictation-driver-ledger.md`. Il gate mocka soltanto la risposta del worker STT non ancora disponibile, quindi D resta correttamente parziale: non prova ancora primo download/trascrizione Whisper reale né chiude errore/cancel/retry visibili e rischio dipendenze.

## E) AUTO-PROMPT BROWSE — ✅ — **FATTO (FE-only, 2026-07-22)**
In chat NON-browser, se compare un URL → prompt smooth prod-ready "abiliti la navigazione?" (un tap → Browse on). Mai spurio su testo non-URL, dismissable, rispetta il gating Browse.
**Esito:** `lib/talosUrlDetect.ts` (`talosFirstUrl` — richiede scheme `http(s)://`, trim punteggiatura, valida `new URL()`; `talosUrlHost`); `TalosComposerDock.vue` banner `data-testid="talos-auto-browse-prompt"` (border `--talos-accent-border` / bg `--talos-accent-soft`, host-only, "Enable Browse" + "Dismiss"); `TalosWorkspace.vue` `autoBrowseUrl` computed (gate `browserMode.enabled || browseSetupFault`, dedup via `dismissedAutoBrowseUrl`) + `acceptAutoBrowse` (riusa `openBrowse`, auto-abilita+naviga) / `dismissAutoBrowse`. **FE-only**: nessun endpoint BE (riusa la macchina Browse esistente). Full vitest **175/1368 verde**, chunk gate 4/4, entry **511.75 kB**. Mockup: artifact `ed52f11b-…`. **mobile-relevant: sì** — mirror banner auto-browse a Kimi.

## F) BROWSER STAGE-2 (FE) — 🆕 — [dipende dal contratto worker di Codex]
- Snapshot SCROLLABILE (lo stage guida uno scroll del worker → nuovo frame).
- Retry affordance in `useTalosBrowse`: recoverable → "Recupera/Riprova" (no restart); terminal → "Riavvia".
- Target click da x/y → ref (aria-snapshot).

**Stato integrazione:** aperto. Il verbo backend/worker Stage-2a scroll è disponibile da `564b275`, quindi la parte FE scroll può partire. Stage-2b ref/locator e la classificazione finale recoverable/terminal restano dipendenze di contratto; non sono inclusi nel drop Fable integrato.

## G) UPLOAD tray (Parte 2 FE) — 🆕 — [BE vision-passthrough già fixato]
- Thumbnail/preview per immagini allegate; label vision-only vs testo; motivi di fallimento chiari.

**Stato integrazione:** aperto. Il wiring multimodale backend è atterrato in `5dd0c0b`; thumbnail, label di trattamento e fault specifici nel tray non sono inclusi nel drop Fable integrato.

---

**Già fatti (contesto):** FV2-06.0 composer model+effort picker, TalosThemedSelect+Provider, prod-gate acronimi (rail+title bar), sweep C.
**Backend fixato oggi (affidabile):** recovery-lock (WAL) + upload immagini (vision-passthrough).

## Chiusura audit FE all'integrazione

| Item | Stato verificato | Residuo esplicito |
|---|---|---|
| C — themed selects | Fatto | Nessun native `<select>` in Settings/Theme. |
| B — icon controls/tooltips | Fatto | Gate E2E Appearance/Theme al merge. |
| A — message sections | Fatto | Nessun residuo: persistenza Laravel e gate E2E visuale desktop 1920×1080 Sections↔Bubbles + reload coperti; collapse utente resta nella suite. |
| D — voice/STT | Parziale | Posizione Enhancer→Mic e cattura browser/MediaRecorder coperte; restano error/cancel/retry visibili, Whisper reale, decisione audit dipendenze e cloud worker. |
| E — auto Browse | Fatto FE | Gate capability/dismiss/dedup al merge. |
| F — Browser Stage-2 FE | Aperto | Scroll UI, retry UX e poi click ref quando il contratto Stage-2b è pronto. |
| G — upload tray | Aperto | Preview/thumbnail, tipo di trattamento e fault specifici. |

Nessun item parziale/aperto va presentato come debito chiuso solo perché il relativo backend è disponibile.
