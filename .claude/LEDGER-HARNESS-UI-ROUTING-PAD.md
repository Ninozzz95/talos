# Ledger esecutivo — Harness UI routing e Pad

Data: 2026-08-25  
Branch autorizzato: `lane/voce-personale`  
Owner: TALOS UI mobile  
Stato: approvato dall'owner, esecuzione con TDD e gate real-device.

## Compatibilità invarianti

- Rotte `harness` e `harness-session` stabili.
- Contratti `TalosMobileRouteName`, `TALOS_MOBILE_ROUTES` e `SHEET_TITLE_KEY`
  completi; nessun bypass dei test drift.
- Gate `talosHarnessUiAvailable()` debug-only e classe Android assente in release.
- Shadow root dentro la SPA; nessun iframe o navigazione top-level.
- Cinque sessioni demo e `HARNESS_DEFAULT_SESSION_ID` compatibili.
- Funzioni senza backend dichiarate demo; CSP invariata.
- Nessun TALOS-BANCO, execution plane, backend, desktop o motore locale.

## Inventario file

### Creare

1. `.claude/DOSSIER-RICERCA-HARNESS-UI-ROUTING-PAD.md`
2. `.claude/LEDGER-HARNESS-UI-ROUTING-PAD.md`
3. `mobile/src/lib/harnessUiBridge.ts`
4. `mobile/tests/unit/lib/harnessUiBridge.test.ts`
5. `mobile/tests/unit/harness/harnessUiAssetContract.test.ts`
6. `mobile/tests/unit/harness/harnessUiFrontend.test.ts`
7. `mobile/tests/e2e/mobile-harness-ui.e2e.spec.ts`

### Modificare

1. `.claude/CONSEGNA-HARNESS-UI-ROUTING.md`
2. `mobile/src/App.vue`
3. `mobile/src/components/shell/TalosTabletSidebar.vue`
4. `mobile/src/components/shell/TalosMobileToolSheet.vue`
5. `mobile/src/components/shell/TalosMobileSidebar.vue`
6. `mobile/src/components/ui/drawer/DrawerContent.vue`
7. `mobile/src/style.css`
8. `mobile/src/stores/settings.ts`
9. `mobile/src/lib/tabletLayout.ts`
10. `mobile/src/lib/harnessDemoSessions.ts`
11. `mobile/src/screens/HarnessSessionScreen.vue`
12. `mobile/src/i18n/locales/en.ts`
13. `mobile/src/i18n/locales/it.ts`
14. `mobile/public/harness-ui/index.html`
15. `mobile/public/harness-ui/styles.css`
16. `mobile/public/harness-ui/app.js`
17. `mobile/tests/unit/lib/tabletLayout.test.ts`
18. `mobile/tests/unit/lib/harnessDemoSessions.test.ts`
19. `mobile/tests/unit/screens/harnessSessionScreen.test.ts`
20. `mobile/tests/unit/shell/TalosTabletSidebar.test.ts`
21. `mobile/tests/unit/shell/TalosMobileToolSheet.test.ts`
22. `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
23. `mobile/tests/unit/shell/appShell.test.ts`

Eliminare: nessun file.

## Simboli pubblici

- `TALOS_TABLET_HARNESS_RAIL_COLLAPSED = 72`.
- `talosTabletSidebarEffectiveWidth(savedWidth, variant, collapsed): number`.
- `TalosMobileShellPreferences.tablet_harness_sidebar_collapsed: boolean`.
- `TalosTabletSidebar`: prop `collapsed?`, emit `toggleCollapsed`.
- `TalosMobileToolSheet`: prop `lockBodyScroll?`.
- `DrawerContent`: prop `overlayClass?`.
- `harnessDemoSessionById(id): HarnessDemoSession | null`.
- `TalosHarnessSessionSelection { id; title }`.
- `TalosHarnessUiRuntime`: capability methods opzionali `selectSession`,
  `dismissTransientLayers`, `setKeyboardOpen`; gli adapter falliscono chiusi
  durante caricamento/version skew. Il runtime finale espone tutte e tre.
- `currentTalosHarnessUiRuntime()`, `selectTalosHarnessUiSession()`,
  `dismissTalosHarnessUiTransientLayers()`, `setTalosHarnessUiKeyboardOpen()`.
- App: `tabletHarnessRailCollapsed`, `tabletEffectiveRailWidth`,
  `toggleTabletHarnessRail`, `openGlobalSidebar`, `stationLocksBodyScroll`.
- Screen: `selectedSession`, `syncSelectedSession`, listener keyboard removibili.
- Runtime statico: `selectSession`, `dismissTransientLayers`,
  `setKeyboardOpen`, `syncEmbeddedLayout`, `announceVoiceUnavailable`.

Nessuna classe, schema di rete, migration o API backend nuova.

## Fase 0 — ricerca, ledger e primi RED

File: dossier, ledger, consegna e test RED della Fase 1.

Gate: fonti ufficiali e pin esatti registrati; baseline verde; i nuovi test
falliscono per comportamento assente e non per setup. Nessun commit rosso.

## Fase 1 — navigazione globale sopra Harness

Produzione: `mobile/src/lib/harnessUiBridge.ts`, `mobile/src/App.vue`,
`mobile/src/components/shell/TalosMobileToolSheet.vue`,
`mobile/src/components/shell/TalosMobileSidebar.vue`,
`mobile/src/components/ui/drawer/DrawerContent.vue`, `mobile/src/style.css`,
`mobile/public/harness-ui/app.js`.

RED:

- `GLOBAL-SIDEBAR-ABOVE-HARNESS-01`: content e overlay globali hanno livello
  maggiore della station.
- `HARNESS-TOP-LAYER-DISMISS-01`: hamburger chiude prima i transient Harness.
- `HARNESS-OUTER-SCROLL-01`: station Harness blocca lo scroll esterno; le altre no.

Fallimento atteso: `z-50`, nessun dismiss, body sempre `overflow-y-auto`.

GREEN: `npx vitest run tests/unit/lib/harnessUiBridge.test.ts tests/unit/shell/TalosMobileToolSheet.test.ts tests/unit/shell/TalosMobileSidebar.test.ts tests/unit/shell/appShell.test.ts`.

Pad: palette/sheet Harness aperta → hamburger; quattro forme. Commit:
`fix(harness-ui): la navigazione globale resta sopra ogni superficie`.

Precisazione da dispositivo reale 25/8: nel dettaglio telefono la chrome della
station espone la freccia «Torna a Harness», non un hamburger globale; è il
contratto condiviso con le altre station e non va sostituito solo per Harness.
Il gesto palette → hamburger è quindi applicabile a tablet verticale,
tablet orizzontale e forma telefono orizzontale che supera il breakpoint
tablet. In telefono verticale si verificano separatamente palette/backdrop,
ritorno lista → chat e drawer globale completo; la gerarchia resta provata
senza inventare un controllo assente dalla UI finale.

Amendamento 25/8 prima del GREEN: il runtime statico viene caricato in modo
asincrono e le capacità arrivano per fasi. Rendere obbligatori tutti e tre i
metodi già nella Fase 1 avrebbe richiesto implementare session sync e tastiera
prima dei rispettivi RED. Il confine pubblico li tratta quindi come capability
opzionali e ogni helper restituisce `false` quando quella specifica capacità
non è ancora disponibile; a fine piano il runtime le fornisce tutte.

Amendamento 25/8 dopo la prima prova reale: `showModal()` porta il dialogo
Harness nel top layer nativo del browser. In quello stato il dito non può
raggiungere l'hamburger Vue sottostante, quindi `openGlobalSidebar()` non viene
nemmeno eseguita e lo z-index non può risolvere il difetto. La fase resta aperta
e aggiunge la regressione permanente `HARNESS-NATIVE-TOP-LAYER-HITTEST-01`:
palette e sheet incorporati usano dialoghi non modali confinati nello stacking
context della station, con backdrop Harness esplicito; nessuna chiamata
`showModal()` può rientrare nel bundle. Il drawer globale può così ricevere il
primo tocco reale e sovrapporsi a tutto. Decisione upstream: adattare il
contratto `<dialog>` dietro il runtime AVM, perché il top layer standard ha
precedenza intenzionale su ogni z-index e qui contraddice la gerarchia di
navigazione decisa dall'owner.

## Fase 2 — rail comprimibile e local-first

Produzione: `mobile/src/App.vue`,
`mobile/src/components/shell/TalosTabletSidebar.vue`,
`mobile/src/stores/settings.ts`, `mobile/src/lib/tabletLayout.ts`,
`mobile/src/i18n/locales/en.ts`, `mobile/src/i18n/locales/it.ts`.

RED:

- `HARNESS-TABLET-RAIL-COLLAPSE-01`: Harness si comprime a 72px e si riapre;
  hamburger/expand restano raggiungibili, chat invariata.
- `HARNESS-TABLET-RAIL-LOCAL-FIRST-01`: stato Preferences sopravvive a hydrate.

Fallimento atteso: prop/evento/preferenza assenti; larghezza sempre 260–480.
GREEN: `npx vitest run tests/unit/lib/tabletLayout.test.ts tests/unit/shell/TalosTabletSidebar.test.ts tests/unit/shell/appShell.test.ts`.
Pad: comprimi, naviga, riavvia; quattro forme. Commit:
`feat(harness-ui): comprimi la lista sessioni sul tablet`.

## Fase 3 — host, composer e tastiera

Produzione: `mobile/src/components/shell/TalosMobileToolSheet.vue`,
`mobile/src/screens/HarnessSessionScreen.vue`,
`mobile/public/harness-ui/styles.css`, `mobile/public/harness-ui/app.js`.

RED: `HARNESS-EMBEDDED-HEIGHT-01`, `HARNESS-COMPOSER-BOTTOM-01`,
`HARNESS-KEYBOARD-PORTRAIT-01`, `HARNESS-KEYBOARD-LANDSCAPE-01`,
`HARNESS-PHONE-NAV-WIDE-SHORT-01`, `HARNESS-BOTTOM-NAV-END-01`.

Fallimento atteso: `100dvh`, branch JS width-only, composer fuori host e ultimo
controllo coperto. GREEN: `npx vitest run tests/unit/screens/harnessSessionScreen.test.ts tests/unit/harness/harnessUiFrontend.test.ts tests/unit/shell/TalosMobileToolSheet.test.ts`.
Pad: transcript/Board/Review/palette agli estremi, tastiera aperta/chiusa,
quattro forme. Commit:
`fix(harness-ui): composer e tastiera seguono il riquadro reale`.

## Fase 4 — rotta e sessione coincidono

Produzione: `mobile/src/lib/harnessDemoSessions.ts`,
`mobile/src/lib/harnessUiBridge.ts`, `mobile/src/screens/HarnessSessionScreen.vue`,
`mobile/public/harness-ui/index.html`, `mobile/public/harness-ui/app.js`.

RED:

- `HARNESS-ROUTE-SESSION-SYNC-01`: tutti i cinque id aggiornano titolo/selezione.
- `HARNESS-UNKNOWN-SESSION-01`: id sconosciuto mostra stato esplicito.

Fallimento atteso: id diagnostico, titolo statico. GREEN:
`npx vitest run tests/unit/lib/harnessDemoSessions.test.ts tests/unit/lib/harnessUiBridge.test.ts tests/unit/screens/harnessSessionScreen.test.ts`.
Pad: tutte le righe e deep-link invalido. Commit:
`fix(harness-ui): la rotta seleziona la sessione mostrata`.

## Fase 5 — controlli demo e collisioni

Produzione: `mobile/public/harness-ui/index.html`,
`mobile/public/harness-ui/styles.css`, `mobile/public/harness-ui/app.js`.

RED: `HARNESS-COMMAND-FILTER-01`, `HARNESS-COMMAND-KEYBOARD-01`,
`HARNESS-MIC-HONEST-01`, `HARNESS-DEMO-BADGE-NO-COLLISION-01`,
`HARNESS-QUEUE-NO-OVERLAP-01`, `HARNESS-ALL-CONTROLS-01`,
`HARNESS-ALL-SCROLL-ENDS-01`.

Fallimento atteso: filtro visibile, mic inerte, badge/coda sovrapposti, ultimi
controlli coperti. GREEN: `npx vitest run tests/unit/harness/harnessUiAssetContract.test.ts tests/unit/harness/harnessUiFrontend.test.ts`.
Pad: checklist controlli/scroll completa, quattro forme. Commit:
`fix(harness-ui): tutti i controlli demo rispondono senza sovrapporsi`.

## Fase 6 — theme engine TALOS

Produzione: `mobile/public/harness-ui/styles.css`,
`mobile/public/harness-ui/app.js`.

RED `HARNESS-THEME-LIVE-01`: i valori computati seguono token host senza
rimontaggio. Fallimento: alias ancora esadecimali Calm. GREEN:
`npx vitest run tests/unit/harness/harnessUiAssetContract.test.ts tests/unit/harness/harnessUiFrontend.test.ts tests/unit/screens/harnessSessionScreen.test.ts`.
Pad: Calm → Paper/Telemetry → tema originario, quattro forme. Commit:
`fix(harness-ui): il mockup eredita il tema TALOS`.

## Fase 7 — gate completo e consegna

File: `mobile/tests/e2e/mobile-harness-ui.e2e.spec.ts` e
`.claude/CONSEGNA-HARNESS-UI-ROUTING.md`.

Comandi:

1. `npm run typecheck`
2. `npx vitest run`
3. `node --check public/harness-ui/app.js`
4. `npm run build`
5. `npx playwright test tests/e2e/mobile-harness-ui.e2e.spec.ts`
6. `npx playwright test`
7. `npx cap copy android`
8. `gradlew.bat :app:compileDebugKotlin :app:compileReleaseJavaWithJavac`
9. `gradlew.bat :app:installDebug -PtalosSideBySide`
10. `git diff --check`

Gate reale: `dumpsys` pacchetto/focus; quattro forme; dimensioni byte PNG
lette prima dell'etichetta; screenshot ispezionati interamente.

## Checklist finale

- Drawer globale, rail/lista cinque sessioni, titolo e tree.
- Chat/Split/Board, run queue/stop, follow-up/cancel.
- Azioni messaggio/tool/approvazione.
- Composer send, `+`, modello, permessi, ambiente, mic, `/`, `@`, `!`, `!!`.
- Nav Chat/Review/Terminal/Browser/Altro.
- Inspector Context/Files/Agents/topology/capabilities.
- Tutte le 14 voci palette, filtro e vuoto.
- Sheet modello/permessi/ambiente/capabilities/control/tree/references/rename.
- Review, Browser, Board, automations, settings, share/export.
- Ogni scrollport inizio/fine e ultimo controllo scoperto.
- Tastiera composer/palette; globale sopra dialog Harness.
- Tema live e ripristino; debug presente e release assente.

## Git, rollback e consegna

- `git status --short` prima di ogni add; mai `git add -A`.
- Aggiungere solo i file nominati della fase; nessun push senza sì fresco.
- Commit isolato per fase; rollback con revert del solo commit, mai reset.
- Ogni regressione ferma la fase e diventa test permanente.
- La consegna viene aggiornata alla fine di ogni fase, anche se bloccata.
