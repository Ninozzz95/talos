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
8. `.claude/TACCUINO-VISIVO-HARNESS-UI-PAD.md`

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

Amendamento 25/8 dopo il primo GREEN: la Fase 1 aveva lasciato il chunk iniziale
a 613.909 byte su un massimo invariato di 614.000. La nuova logica local-first
ha portato il dato a 614.590: test e typecheck verdi, ma build correttamente
rossa. La soglia non viene alzata. `TalosMobileConfirmDialog`, già mostrato solo
quando esiste una richiesta di consenso immagine, passa allo stesso confine
asincrono degli altri dialoghi opzionali di `App.vue`; il comportamento resta
invariato e il suo codice non grava più sul primo paint. Gate aggiunto:
`INITIAL-CHUNK-BUDGET-01`, `npm run build` deve restare <= 614.000 byte.

Amendamento visivo 25/8: ogni screenshot del piano entra nel taccuino dedicato
con due passaggi obbligatori — composizione intera e poi dettagli/interazioni.
Per ogni file si registrano dimensioni reali, stato mostrato, difetti anche
fuori fase e destinazione della cura. Nessun nome file vale come prova. Nella
forma telefono orizzontale il processo viene riavviato dopo `wm size`: la
protezione anti-rimbalzo da tastiera del composable tablet può altrimenti
conservare lo split precedente e produrre uno screenshot etichettato in modo
falso. Gate permanente: `PAD-VIEWPORT-COLD-START-01`.

Regressione scoperta sul Pad 25/8 dopo il riavvio local-first:
`HARNESS-COLLAPSED-NO-CHAT-CONTENT-01`. Il ramo `v-else` di
`TalosTabletSidebar` montava `ChatsScreen` quando la condizione composta
`variant === 'harness' && !collapsed` diventava falsa. Risultato reale: lista
Chat compressa in 72px sotto i soli due controlli Harness. Il rail Harness
compresso non deve montare né `HarnessScreen` né `ChatsScreen`; Chat continua
a montare soltanto con `variant === 'chat'`. RED: entrambi gli stub assenti.

## Fase 3 — host, composer e tastiera

Produzione: `mobile/src/screens/HarnessSessionScreen.vue`,
`mobile/public/harness-ui/styles.css`, `mobile/public/harness-ui/app.js`.

RED: `HARNESS-EMBEDDED-HEIGHT-01`, `HARNESS-COMPOSER-BOTTOM-01`,
`HARNESS-KEYBOARD-PORTRAIT-01`, `HARNESS-KEYBOARD-LANDSCAPE-01`,
`HARNESS-PHONE-NAV-WIDE-SHORT-01`, `HARNESS-BOTTOM-NAV-END-01`.

Fallimento atteso: `100dvh`, branch JS width-only, composer fuori host e ultimo
controllo coperto. GREEN: `npx vitest run tests/unit/screens/harnessSessionScreen.test.ts tests/unit/harness/harnessUiFrontend.test.ts tests/unit/shell/TalosMobileToolSheet.test.ts`.
Pad: transcript/Board/Review/palette agli estremi, tastiera aperta/chiusa,
quattro forme. Commit:
`fix(harness-ui): composer e tastiera seguono il riquadro reale`.

Amendamento strumentato 25/8 prima del RED: `TalosMobileToolSheet` misura già
correttamente il viewport e la sua freccia indietro è visibile nelle due forme
telefono; non va modificato né duplicato. Il rettangolo errato è dentro lo
shadow host. A telefono verticale, senza tastiera, il DOM reale misura host
761px ma `.app-shell`/`.workspace-shell` 873px; il composer termina a y=904
contro il fondo host y=857. Con tastiera nativa aperta, `innerHeight` e
`visualViewport.height` diventano entrambi 544px: l'euristica basata sulla loro
differenza resta zero, `body.keyboard-open` non viene applicata, app-shell è
545px dentro un host di 433px e il composer termina a y=576, sotto il viewport.

Causa e contratto GREEN:

- nell'incorporamento, app-shell e workspace consumano `height:100%` del vero
  host, mai `100dvh`; `100dvh` resta corretto soltanto per il mockup statico;
- l'header esterno ha già consumato la safe area superiore: il topbar embedded
  non somma una seconda volta `env(safe-area-inset-top)` (95px misurati oggi);
- `HarnessSessionScreen` inoltra gli eventi ufficiali Capacitor Keyboard al
  ponte AVM già tipizzato; il runtime espone realmente `setKeyboardOpen`,
  conserva lo stato nativo contro i successivi resize e lo pulisce al destroy;
- `HARNESS-PHONE-NAV-WIDE-SHORT-01` diventa una prova di non regressione: una
  sola freccia shell resta visibile in landscape, nessuna seconda freccia
  viene aggiunta dentro Harness.

Scenari permanenti aggiunti: `HARNESS-EMBEDDED-SAFE-AREA-01` e
`HARNESS-KEYBOARD-NATIVE-RESIZE-01`. `TalosMobileToolSheet.vue` esce quindi
dall'elenco produzione della fase: l'ispezione reale ne ha dimostrato la
correttezza; modificarlo sarebbe intervenire sul contenitore sano.

Amendamento build 25/8: `HARNESS-KEYBOARD-LISTENER-TYPES-01`. Capacitor espone
overload distinti per `keyboardWillShow` e `keyboardWillHide`; un helper che
accettava l'unione dei nomi era verde in Vitest ma correttamente respinto da
`vue-tsc` con TS2769. Nessun cast: le due chiamate restano nei rispettivi
overload ufficiali e condividono soltanto la funzione che conserva/rimuove il
`PluginListenerHandle`. Gate permanente: `npm run build`.

Amendamento Pad 25/8, telefono landscape dopo il primo GREEN parziale:
`HARNESS-WIDE-SHORT-HOST-01`. Misure reali a freddo: `innerWidth=872`,
`innerHeight=392`, `tablet=false`, host 872x297. Il mockup resta però nel ramo
desktop perché usa soltanto `max-width:780`: topbar 103px (safe area superiore
consumata di nuovo), nav inferiore assente e composer 160px che copre l'intero
stage. Con tastiera nativa: `innerHeight=144`, header shell 96px, host 49px;
il composer termina fuori dall'area visibile e nello screenshot restano solo
header, run-strip e tastiera.

Correzione del piano: `TalosMobileToolSheet.vue` rientra nella produzione della
fase esclusivamente per il caso tastiera+landscape. La freccia non era errata e
resta unica nello stato normale; mentre la tastiera è aperta e l'altezza è
critica, l'header cede temporaneamente lo spazio al composer e ritorna al hide.
Il runtime misura il rettangolo del vero host con `ResizeObserver`, applica una
classe wide-short sotto 900x500 e la rimuove al destroy; nessuna soglia tablet
Vue viene duplicata. CSS wide-short: safe area interna azzerata, topbar/run più
compatti, nav inferiore presente, composer a una riga con target essenziali;
con tastiera nav/topbar/run spariscono e il composer resta interamente visibile.
Screenshot RED conservati: `phase3-phone-landscape-wide-short-red.png` e
`phase3-phone-landscape-keyboard-red.png`.

Regressione visiva del primo wide-short GREEN:
`HARNESS-KEYBOARD-LANDSCAPE-SAFE-AREA-01`. Il composer era finalmente visibile,
ma la rimozione temporanea dell'header faceva iniziare il corpo station a y=0:
missione e badge demo finivano sotto orologio, rete e batteria Android. Quando
l'header cede, il body della station conserva quindi un solo
`env(safe-area-inset-top)`; nessun contenuto Harness può occupare la status bar.

Amendamento Pad 25/8 durante l'ispezione integrale della navigazione globale:
`GLOBAL-SIDEBAR-SHORT-LANDSCAPE-01`. Nella forma telefono landscape il drawer
globale misura 393px CSS di altezza, ma il suo contenitore centrale misura
293px con 489px di contenuto e `overflow-y:visible`; nessun antenato è
scrollabile. La voce Harness è presente nel DOM a y=456–504, quindi fuori dal
viewport, e uno swipe reale non sposta l'elenco. Il problema rende la rotta
irraggiungibile proprio nella forma che questa fase deve accettare.

Il file di produzione `mobile/src/components/shell/TalosMobileSidebar.vue` e il
test `mobile/tests/unit/shell/TalosMobileSidebar.test.ts` entrano quindi nella
Fase 3. RED: il contenitore flex che possiede Chat/Recenti/Strumenti/footer non
ha `overflow-y-auto overscroll-contain`. GREEN: quel contenitore è l'unico
scrollport di fallback quando la sua altezza non basta; a portrait il footer
resta in fondo tramite `mt-auto`, mentre a landscape tutte le voci, Harness e
footer diventano raggiungibili. Prova Pad: apertura drawer, scroll fino a
Harness, navigazione reale e ritorno, nella forma telefono landscape.

Amendamento Pad 25/8, prova contraria con quattro swipe fino al fondo:
`HARNESS-COMPOSER-AFTER-SCROLL-01`. Il primo screenshot portrait mostrava il
composer nel punto giusto, ma dopo 612px di scroll il suo rettangolo passava da
y=648–793 a y=37–181 e spariva sopra il viewport. Misura DOM: `.composer-wrap`
è `position:absolute` dentro `.chat-view`, ma `.chat-view` è anche lo
scrollport (`scrollTop=611.6`); quindi il composer scorre insieme al transcript.

RED permanente in `mobile/tests/unit/harness/harnessUiFrontend.test.ts`:
`.chat-view` non separa ancora il contenitore fisso dal contenuto scorrevole.
GREEN: `.chat-view` possiede geometria e composer con `overflow:hidden`;
`.conversation` diventa lo scrollport alto 100% con `overflow-y:auto`. Il
padding finale già esistente resta il cuscinetto che porta l'ultimo messaggio
sopra il composer. Prova Pad obbligatoria: inizio, quattro swipe, fondo reale,
composer sempre visibile e ultimo contenuto interamente raggiungibile.

Esito strumentato finale della matrice 25/8: nelle quattro forme il composer
resta nel rettangolo Harness a inizio e dopo lo scroll; in telefono landscape
il fondo reale misura `scrollTop=1181.45` su un massimo di 1182 e il rettangolo
del composer resta invariato a y=264.73–336.73 CSS. Con la tastiera nativa
aperta, header e nav non essenziali cedono spazio, il composer resta intero
sopra Gboard e la status bar Android rimane libera. Tutti i 42 PNG, compresi i
RED e i GREEN intermedi, sono stati aperti e ispezionati per intero; nessun
fotogramma intermedio viene usato come prova finale.

La lettura certosina ha scoperto cinque scenari distinti che non appartengono
alla geometria host/composer e vengono aggiunti, senza anticiparne il fix, alla
Fase 5:

- `HARNESS-PALETTE-BADGE-COLLISION-01`: il badge demo copre/affolla la X della
  palette in telefono landscape, con e senza tastiera;
- `HARNESS-PALETTE-BACK-01`: Back Android con palette aperta chiude il layer
  transitorio ma propaga anche la navigazione dal dettaglio alla lista; il
  primo Back deve soltanto chiudere il layer;
- `HARNESS-NESTED-SCROLL-TRAP-01`: uno swipe iniziato nel diff `<pre>` resta
  intrappolato perché il figlio usa `overscroll-behavior:contain`; il transcript
  non avanza finché il gesto non parte fuori dal codice;
- `HARNESS-BOARD-MOBILE-HONESTY-01`: Board mobile parla di campagne
  TALOS-BANCO e server locale non disponibile senza dichiarare subito che
  l'intera superficie è demo-only e non collegata;
- `HARNESS-DEMO-BADGE-CONTENT-01`: oltre alla palette, il badge si sovrappone
  al testo della conversazione in landscape e con tastiera, quindi il gate
  collisioni deve coprire contenuto dinamico, non soltanto pulsanti.

## Fase 4 — rotta e sessione coincidono

Produzione: `mobile/src/lib/harnessDemoSessions.ts`,
`mobile/src/lib/harnessUiBridge.ts`, `mobile/src/screens/HarnessSessionScreen.vue`,
`mobile/public/harness-ui/index.html`, `mobile/public/harness-ui/app.js`,
`mobile/src/screens/HarnessScreen.vue`, `mobile/src/i18n/locales/en.ts`,
`mobile/src/i18n/locales/it.ts`.

Simboli pubblici/compatibili: aggiungere
`findHarnessDemoSession(id: string): HarnessDemoSession | null`; mantenere
`HARNESS_DEMO_SESSIONS`, `harnessDemoSessionsIn`,
`TalosHarnessSessionSelection` e `selectTalosHarnessUiSession` stabili. Il
runtime statico implementa `selectSession(selection)` sul contratto già
tipizzato; nessun secondo bridge e nessun nuovo formato di sessione.

RED:

- `HARNESS-ROUTE-SESSION-SYNC-01`: tutti i cinque id aggiornano titolo/selezione.
- `HARNESS-UNKNOWN-SESSION-01`: id sconosciuto mostra stato esplicito e non
  carica/esegue il mockup.
- `HARNESS-NATIVE-RAIL-ACTIVE-01`: il rail Harness nativo espone visivamente e
  semanticamente la riga che coincide con `route.params.id`.
- `HARNESS-SESSION-LABEL-DRIFT-01`: header, riga attiva e ogni etichetta
  `Session topology` visibile riportano lo stesso titolo selezionato.
- `HARNESS-UNKNOWN-SESSION-VISUAL-01`: il deep-link invalido usa l'empty-state
  TALOS centrato, con titolo, spiegazione e azione reale di ritorno alla lista;
  nessun testo grezzo appoggiato al bordo del riquadro.

Fallimento atteso: id diagnostico, titolo statico. GREEN:
`npx vitest run tests/unit/lib/harnessDemoSessions.test.ts tests/unit/lib/harnessUiBridge.test.ts tests/unit/screens/harnessScreen.test.ts tests/unit/screens/harnessSessionScreen.test.ts tests/unit/harness/harnessUiFrontend.test.ts`.
Pad: tutte le righe e deep-link invalido. Commit:
`fix(harness-ui): la rotta seleziona la sessione mostrata`.

Esito strumentato 25/8: i cinque id hanno prodotto tuple coerenti
`URL = data-harness-session-id nativo = data-session-id statico`; titolo e
ogni `[data-current-session-title]` coincidono. Il primo deep-link invalido era
funzionalmente fail-closed ma visivamente grezzo: scenario permanente
`HARNESS-UNKNOWN-SESSION-VISUAL-01`, passato a GREEN con empty-state TALOS e
azione di ritorno reale. Matrice: 15 PNG ispezionati integralmente; tutte e
quattro le forme coperte, cinque sessioni nel tablet landscape, valido+invalido
nelle altre tre. Il corpo conversazione condiviso resta una fixture demo
esplicitamente documentata, non un backend inventato.

## Fase 5 — controlli demo e collisioni

Produzione:

1. `mobile/src/App.vue`
2. `mobile/src/components/shell/TalosMobileToolSheet.vue`
3. `mobile/src/lib/harnessUiBridge.ts`
4. `mobile/src/i18n/locales/en.ts`
5. `mobile/src/i18n/locales/it.ts`
6. `mobile/public/harness-ui/index.html`
7. `mobile/public/harness-ui/styles.css`
8. `mobile/public/harness-ui/app.js`
9. `mobile/src/components/shell/TalosMobileScreen.vue`
10. `mobile/src/screens/HarnessSessionScreen.vue`

Test:

1. `mobile/tests/unit/lib/harnessUiBridge.test.ts`
2. `mobile/tests/unit/shell/TalosMobileToolSheet.test.ts`
3. `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
4. `mobile/tests/unit/shell/TalosTabletSidebar.test.ts`
5. `mobile/tests/unit/shell/appShell.test.ts`
6. `mobile/tests/unit/screens/harnessScreen.test.ts`
7. `mobile/tests/unit/screens/harnessSessionScreen.test.ts`
8. `mobile/tests/unit/harness/harnessUiAssetContract.test.ts`
9. `mobile/tests/unit/harness/harnessUiFrontend.test.ts`
10. `mobile/tests/unit/shell/TalosMobileScreen.test.ts`

Simboli pubblici modificati: `TalosMobileToolSheet.hideChrome?: boolean`,
`TalosMobileScreen.edgeToEdge?: boolean` e
`TalosHarnessUiRuntime.dismissTransientLayers?(): boolean`. Il simbolo adapter
`dismissTalosHarnessUiTransientLayers(): boolean` resta stabile ma ora riporta
l'esito reale. In `App.vue` si aggiunge il computed interno
`stationHidesSheetChrome`; `wireSheetActions(type)` aggiunge soltanto la
navigazione locale `control -> settings`. `TalosHarnessUiPlugin` resta il puro
cancello debug-only preesistente e non cambia. Nessuna rotta o API cambia.

RED: `HARNESS-COMMAND-FILTER-01`, `HARNESS-COMMAND-KEYBOARD-01`,
`HARNESS-MIC-HONEST-01`, `HARNESS-DEMO-BADGE-NO-COLLISION-01`,
`HARNESS-QUEUE-NO-OVERLAP-01`, `HARNESS-ALL-CONTROLS-01`,
`HARNESS-ALL-SCROLL-ENDS-01`, `HARNESS-PALETTE-BADGE-COLLISION-01`,
`HARNESS-PALETTE-BACK-01`, `HARNESS-NESTED-SCROLL-TRAP-01`,
`HARNESS-BOARD-MOBILE-HONESTY-01`, `HARNESS-DEMO-BADGE-CONTENT-01`.

Decisioni owner e scenari aggiunti 25/8:

- `CODE-PRODUCT-NAME-01`: tutte le stringhe prodotto visibili dicono Codice/Code;
  identificatori tecnici compatibili restano invariati.
- `CODE-SESSION-FIRST-HEADER-01`: nel dettaglio non viene resa la testata del
  foglio; la prima riga visibile è la topbar della sessione selezionata.
- `CODE-SINGLE-SAFE-AREA-01`: rimuovendo la testata esterna, la topbar Codice
  consuma una sola volta la safe-area e non finisce sotto la status bar.
- `CODE-OTHER-STATIONS-CHROME-01`: tutte le altre stazioni conservano testata,
  Back e azioni esistenti.
- `CODE-PHONE-UP-01`: nel dettaglio telefono un unico Back/Up visibile precede
  il titolo sessione e torna con Vue Router alla lista Codice; la testata
  esterna non ricompare, il tablet non duplica il controllo e il callback host
  viene rimosso allo smontaggio.
- `CODE-MOBILE-GUTTER-01`: il corpo host Codice elimina il gutter esterno da
  16px su telefono e conserva soltanto quello interno responsive; le altre
  stazioni mantengono il padding storico e il tablet edge-to-edge non cambia.
- `CODE-PALETTE-LANDSCAPE-01`: nella forma telefono larga e bassa l'intero
  dialog comandi, inclusi bordo inferiore e ultimo scroll raggiungibile, resta
  dentro il viewport dinamico. RED misurato sul Pad: bottom `399.85px` con
  viewport `392px`; GREEN CSS: margine superiore 8px e altezza massima
  `calc(100dvh - 40px)` per il dialog e
  `calc(100dvh - 140px)` per l'elenco risultati. La misura GREEN reale al fondo
  e' `scrollTop 405/405`, ultimo pulsante a `352.27px` e bordo contenitore a
  `359.45px`, dentro il viewport da `392px`.
- `CODE-TOAST-WIDE-SHORT-01`: ogni azione demo nella forma telefono larga e
  bassa mostra il proprio feedback interamente sopra la bottom navigation.
  RED reale: toast presente nel DOM a `320.67–380.12px` ma coperto dalla nav;
  GREEN: `bottom: calc(var(--mobile-nav-h) + 8px)`, build/deploy e screenshot
  completo richiesti.
- `CODE-TOAST-NO-CONTROL-OVERLAP-01`: lo screenshot con timer congelato ha
  mostrato il toast finalmente sopra la nav ma ancora sopra microfono e invio
  del composer (`toast 277.27–336.73px`, `composer 264.73–336.73px`). Nella
  prima correzione l'offset sopra composer ha liberato i controlli Chat, ma la
  prova inversa Automazioni ha mostrato il toast `189.27–248.73px` sopra
  `Nuova automazione` (`203.73–239.73px`). Correzione finale wide-short: toast
  compatto su una riga, subito sotto topbar + run strip e allineato a destra;
  con tastiera aperta, dove quei due blocchi spariscono, sopra il composer.
  Prova inversa obbligatoria nelle altre tre forme.
- `CODE-REVIEW-WIDE-SHORT-01`: lo scroll massimo di Review deve lasciare
  visibile l'ultima riga reale del diff, senza una coda vuota prodotta dal
  minimo desktop di 420px. GREEN limitato alla forma larga e bassa:
  `min-height: min(180px, calc(100dvh - 180px))`; prova inversa su tablet e
  telefono portrait obbligatoria.
- `CODE-TERMINAL-DEMO-TRUTH-01`: la superficie statica non deve mai dichiarare
  una PTY reale attiva. RED: `pty attiva`; GREEN: badge neutro `pty demo`, con
  assenza permanente della stringa precedente e screenshot nelle quattro forme.
- `CODE-SETTINGS-REACHABLE-01`: in modalita' embedded la schermata Impostazioni
  deve essere raggiungibile senza la sidebar sessioni nascosta. Il comando
  esistente `Agents, hook e doctor` apre il pannello di controllo, che espone
  `Impostazioni Codice`; il tocco chiude il pannello e attiva
  `[data-view="settings"]`. RED comportamentale in
  `mobile/tests/unit/harness/harnessUiFrontend.test.ts`; GREEN con prova Pad in
  tutte le quattro forme, toggle movimento e scroll fino all'ultima card.
- `CODE-ASSET-CACHE-01`: `HarnessSessionScreen.vue` deriva gli URL di
  `index.html`, `styles.css` e `app.js` dal `TALOS_APP_BUILD` e richiede l'HTML
  con `cache: no-cache`. Il primo allarme sull'entry principale era un errore di
  procedura: `assembleDebug` senza `-PtalosSideBySide` aveva prodotto e
  installato `ai.talos`, mentre CDP osservava il vecchio processo
  `ai.talos.dev` (ultimo aggiornamento 12:55). Non era una cache WebView e non
  giustifica alcun bypass nativo. Test permanente in
  `harnessSessionScreen.test.ts`; gate reale: APK verificato con `aapt2` come
  `ai.talos.dev`, reinstallazione senza `pm clear`, nuova entry/chunk misurati,
  CSSOM con le regole nuove e screenshot del toast realmente sopra la nav.
- `CODE-WIDE-SHORT-SCROLL-01`: ogni vista non-Chat della forma larga e bassa
  conserva padding e `scroll-padding-bottom` pari alla nav persistente; il
  Browser non aggiunge il vecchio fondo vuoto. RED reale: fine della preview
  nascosta/coda di circa 80px. GREEN Pad: preview e shell a `324.81px`, nav a
  `324.73px`, ultimo contenuto raggiungibile.
- `CODE-MODE-STATE-TRUTH-01`: i toggle Chat/Split/Board espongono selezione e
  `aria-pressed=true` soltanto quando quella superficie è realmente visibile.
  RED: Browser visibile con Chat ancora attiva. GREEN: Browser produce zero
  toggle attivi e tre `aria-pressed=false`; il comando Chat ripristina una sola
  selezione vera.

Fallimento atteso: nome Harness ancora visibile, doppia testata, filtro
visibile, mic inerte, badge/coda sovrapposti, Back propagato e ultimi controlli
coperti. GREEN: `npx vitest run tests/unit/lib/harnessUiBridge.test.ts tests/unit/shell/TalosMobileToolSheet.test.ts tests/unit/shell/TalosMobileSidebar.test.ts tests/unit/shell/TalosTabletSidebar.test.ts tests/unit/shell/appShell.test.ts tests/unit/screens/harnessScreen.test.ts tests/unit/screens/harnessSessionScreen.test.ts tests/unit/harness/harnessUiAssetContract.test.ts tests/unit/harness/harnessUiFrontend.test.ts`.
Pad: checklist controlli/scroll completa, quattro forme. Commit:
`fix(harness-ui): Codice risponde senza testate o sovrapposizioni duplicate`.

Stato 25/8: implementazione e matrice Pad completate. Gli 88 screenshot sotto
`C:\Users\Antonino\AppData\Local\Temp\talos-code-phase5-20260825` sono stati
ispezionati integralmente. Gate mirato fresco: 10 file e 111 test passati;
typecheck, syntax check, build/parity, Capacitor copy e compilazioni debug
Kotlin/release Java e `git diff --check` verdi. Documentazione di fase
consolidata; resta soltanto il commit isolato prima di aprire la Fase 6.

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
