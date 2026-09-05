# PIANO — il mockup diventa la app (05/09/2026, Fable 5.1)

> Ordine dell'owner: «collegare il mockup all'applicazione vera, esattamente come
> il mockup: non deve cambiare nulla, tranne che è funzionante. Non andiamo
> avanti finché questo non funziona.»

## §1 — Ispezione del lavoro di Opus (04–05/09): cosa c'è davvero

**Il mockup approvato** (`.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html`, 190 KB) è
autosufficiente: 15 schermate + 3 dialoghi, 93 blocchi `data-c`, **276 classi**
`talos-*` in un solo `<style>` da 51 KB con i token Calm dichiarati in testa, uno
sprite SVG di 29 icone, e una **regia** di 12 KB (schermate, tab, dialoghi con
focus, maniglie di ridimensionamento in token + localStorage, densità, tema
chiaro, lingua).

**Cosa ha costruito Opus** (30 commit, `harness-ui/frontend/`): un frontend
*parallelo* — 30 fabbriche di componenti, 10 «superfici», uno store, un DOM finto,
un guscio. Misurato contro il mockup:

| misura | valore |
|---|---|
| classi del mockup **assenti** nel CSS di Opus | **159 su 276** |
| classi presenti **solo** nel CSS di Opus | 69 |
| blocchi `data-c` del mockup **senza fabbrica** | **72 su 93** |
| funzionalità del monolite riportate (streaming, invio, approvazioni, terminale, review, albero file, impostazioni, Model Lab, capability, automazioni, palette, voce, intro) | **nessuna** |
| rotta di avvio chiamata | `/api/v1/bootstrap` — **non esiste**, 404 |

⇒ Non è il mockup: è un terzo disegno che prende in prestito i token. E non è
un'applicazione: elenca sessioni (quando la rotta esiste) e basta. Quello che
l'owner ha visto sulla 4175 — un guscio vuoto in un terzo dello schermo con «La
vista chat non è ancora stata portata» — è esattamente ciò che c'è.

**Cosa invece regge e si tiene:** il lavoro backend (`terminal-registry.mjs`,
`apriDichiarando`, la rotta `/metrics`, la scadenza delle schede) è vero e
verificato; le 30 fabbriche del design system sono provate ma **nessuno le usa**.

## §2 — Il fatto che decide il piano

`public/app.js` (764 KB, 13.968 righe, **407 funzioni**, un `handleRealEvent` di
561 righe con dentro mesi di difetti curati e verificati dall'owner: dedup
`_sequenza`, follow-up dopo F5, scroll che segue, batch di attrezzi, ripresa) è
**già costruito per essere montato in un DOM ospite**: `ROOT()` legge
`window.__talosHarnessRoot` (lo fa il mobile dentro uno shadow root) e trova i
suoi elementi per **160 id** e **~40 attributi `data-*`**, non per struttura.

⇒ **Si tiene il cervello e si cambia il corpo.** Il markup e il CSS diventano
quelli del mockup, byte per byte; `app.js` continua a fare tutto quello che fa
oggi, agganciato agli id che già cerca. Nessun comportamento viene riscritto:
ogni cambiamento visibile viene dal mockup, e solo da lì. È lo strangler fig
fatto sul confine giusto — la facciata è il contratto id/`data-*`, si instrada
per **schermata** (confine di prodotto), zero logica nella facciata.
Fonti (05/09/2026): oneuptime.com/blog/post/2026-01-30-strangler-fig-pattern/view ·
beckmoulton.medium.com/the-2026-strangler-fig-smart-micro-frontends-for-ui-decoupling-4a955eff3a85
(i tre fallimenti tipici: la facciata che accumula logica, la decomposizione su
confini tecnici invece che di prodotto, le modifiche che toccano entrambi i
sistemi — questo piano li evita per costruzione).

## §3 — Le fasi

### Fase 0 — Il bersaglio congelato e il cancello di parità (½ giorno)
1. Dal mockup nascono `public/index.html` (sprite + guscio + 15 schermate + 3
   dialoghi, **senza** la barra di regia e l'inventario componenti, che sono
   del mockup e non del prodotto) e `public/styles.css` (il `<style>` del
   mockup, 51 KB, al posto dei 234 KB di oggi). I token restano quelli.
2. **Cancello di parità**: uno script che rende la app (senza dati) e il mockup
   alle tre viewport desktop e confronta, schermata per schermata, la sequenza
   dei `data-c`, le classi e lo screenshot (pixelmatch). È la regola «non deve
   cambiare nulla» resa **meccanica**: rosso se un pixel o una classe divergono.
3. Il contratto congelato si scongela **una volta**: nuova fixture per html/css,
   ma le asserzioni su `hostGlobals`, `storageKeys`, i **23 eventi**, i **19
   endpoint** e i frame del terminale restano identiche — quello è il
   contratto di comportamento, e deve continuare a valere.

### Fase 1 — Il ponte degli id (1 giorno)
1. Sul markup del mockup si piantano i 160 id e i `data-*` che `app.js` cerca,
   mappati 1:1 sull'elemento del mockup che ha quel ruolo (tabella in §5).
2. Dove il mockup **non ha** un pezzo che il monolite ha (Model Lab, intro,
   vista browser, barra comandi dell'albero file, palette comandi) si monta un
   contenitore nascosto con lo stesso id — così `app.js` non si rompe — e il
   pezzo finisce in un **elenco di lacune** che decide l'owner (§6).
3. `setView()` (37 righe) impara a mostrare le schermate del mockup
   (`data-schermo`/`data-vista`): è l'**unica** funzione di navigazione toccata.
4. Risultato: `app.js` parte dentro il corpo del mockup; sessioni, streaming,
   invio, approvazioni, terminale, review **funzionano** — ma i pezzi che
   `app.js` disegna da sé escono ancora col markup vecchio dentro i contenitori
   nuovi. Brutto e temporaneo, e **misurato** dal cancello.

### Fase 2 — La ri-pelle, un renderer alla volta (3–4 giorni)
Ogni funzione di `app.js` che crea DOM viene fatta emettere **il markup esatto
del blocco del mockup**, e chiude solo quando il cancello di parità è verde su
quella schermata con dati veri. In quest'ordine, perché la chat è il modello per
tutte le altre:

| schermata | funzioni di `app.js` | blocchi del mockup |
|---|---|---|
| Sidebar | `aggiornaElencoSessioniReali`, `statoSessione`, contatori | SessionItem, NavItem, NavGroup, WorkspaceFooter |
| Topbar | `aggiornaSottotitoloSessione`, titolo, viste | Topbar, Tabs |
| Chat | `appendRealTaskStart`, `appendUserFollowUp`, `ensureAssistantMessageElement`+streaming, `apriBatchSeServe`/`appendToolNote`, `appendApprovalCard`, `appendStatusNote`, `appendArtifactCard`, `mostraAttesaRisposta` | Turn, TurnSpine, Message, ActivityBundle, ToolRow, ToolFailure, ApprovalCard, DiffView, SignedReceipt, SystemNote, TouchedFiles, skeleton |
| Piede della chat | `syncRunComposerState`, `renderizzaBannerCoda`, `aggiornaPillola*`, `aggiornaContatoreUsage` | StatusStrip, MessageQueue, Composer, AttachButton, Chip, SendButton, StatusBar |
| Chat vuota | `costruisciConversationHero` | EmptySessionScreen, SuggestionList |
| Terminale | `montaTerminaleSeServe`, `impostaChipTerminale` + schede W1-01 | TerminalPane |
| Review | `renderRealReviewList`, `updateRealReview` | ReviewPane, ReviewFileList, DiffView |
| Colonna destra | `aggiornaPannelloAmbiente`, albero file, `caricaAlberoSessione`, W1-02 `/processes` | InspectorCard, TurnIndex, TouchedFiles, ProcessRow |
| Board | `renderSessionsBoard` + `/metrics` | DataTable, FilterChips, Select |
| Capability | i 12 `caricaPannello*` | Tabs, ToolList, DetailPanel, PendingList, ScopeNote |
| Memoria · Attività · Libreria · Ricerca · Officina · Automazioni | i `riga*` | MemoryRow, TaskRow, LibraryRow, ReportRow, ForgeList+CodeBlock, AutomationRow |
| Impostazioni · Doctor | `inizializzaSettingsNavigation`, `eseguiDoctor` | SettingsNav, SettingsSection, SettingRow, Switch, SeverityCount, CheckCard |
| Dialoghi | `openRealTaskSheet`/`creaWorkspaceChooser`, `openSheet('permissions')`, `openSheet('sessionTree')`, gli altri `openSheet` | veloNuova (Steps, FolderPicker), veloPermessi (ChoiceCards, ToolPermissionList), veloAlbero (BranchTree), Dialog generico |

Più le meccaniche della regia del mockup, portate dentro `app.js` al posto delle
sue (piccole, e migliori): maniglie in token con `localStorage` (mantenendo la
chiave `talos-harness-panel-widths` del contratto), sidebar a icone, densità,
tema chiaro, lingua.

### Fase 3 — Il cutover (½ giorno)
`public/` **è** la app. Il codice di Opus che contraddice il piano
(`frontend/src/app/surfaces/*`, `shell.js`, `etichette.js`,
`adattatore-sessioni.js`) si cancella: codice senza chiamanti. Le 30 fabbriche
e il laboratorio restano come riferimento provato dei componenti (decide
l'owner se tenerli, §6).

## §4 — Il cancello di chiusura: «funzionante al 100%»

Una lista, derivata dall'inventario del monolite, si spunta **solo dal vivo**
sul backend vero (porta di prova, store copiato) con lo screenshot confrontato
al mockup: 7 viste · 12 fogli · 23 tipi di evento · 19 gruppi di endpoint ·
terminale WS con schede · invio/coda/redirect/stop/resume/fork/compact ·
persistenza impostazioni (7 chiavi) · notifiche · palette · voce · intro.
Niente si chiude su un test verde.

## §5 — Il ponte degli id (le voci principali; la tabella intera nasce in Fase 1)

| id/attributo che `app.js` cerca | elemento del mockup |
|---|---|
| `#app` | `.talos-shell` |
| `#sessionsPanel`, `#sessionList`, `#newSessionBtn`, `#sessionSearch`, `#notificationsBtn` | `.talos-sidebar`, `.talos-sidebar__sessions`, `#voceNuova`, `.talos-field__input`, IconButton campanella |
| `[data-view="chat|terminal|diff|dashboard|automations|settings|browser"]` | `#schermoChat`, `#schermoTerminale`, `#schermoReview`, `#schermoBoard`, `#schermoAutomazioni`, `#schermoImpostazioni`, (browser: lacuna) |
| `#conversation`, `#conversationEmptyState` | `.talos-conversation__column`, `#schermoVuota` |
| `#composerForm`, `#composerInput`, `#queuedMessage`, `#runStateToggle` | `.talos-composer`, `.talos-composer__input`, `.talos-queue`, `.talos-send` |
| `#realTerminalMount`, `#terminalStatusChip` | `.talos-terminal__body`, `.talos-terminal__foot` |
| `#inspectorPanel`, `#inspector-tab-*`, `[data-inspector-section]` | `.talos-inspector`, `#railTabs`, `#rail*` |
| `#sessionsBoardList`, `#automationListReal` | DataTable della Board, AutomationRow |
| `#sheetDialog`, `#sheetBody`, `#sheetTitle`, `#sheetEyebrow`, `#closeSheet` | `.talos-dialog` (header/body/footer) |
| `#toastRegion` | da aggiungere (il mockup non ha i toast) |
| `#commandDialog`, `#introDialog`, `#modelLab*`, `#fileTree*` | contenitori nascosti + **lacune §6** |

## §6 — Le decisioni che sono dell'owner

1. **Le lacune del mockup**: Model Lab, intro al primo avvio, vista browser,
   palette comandi, barra comandi dell'albero file, toast. Il monolite le ha, il
   mockup no. Si portano *come sono* dentro un `talos-dialog`/`Page` del mockup
   (parità di funzione, disegno minimo), oppure si disegnano prima nel mockup.
2. **Il codice di Opus**: cancellare superfici e guscio (proposta), tenere o
   no le fabbriche del design system e il laboratorio.
3. **Modello ed effort per fase** (§7).

## §7 — Modello ed effort, con le basi

- **Fase 0 e Fase 1** (fondamenta, dove un errore è strutturale) e **la chat di
  Fase 2** (è il modello per tutte le altre schermate): **Fable 5.1, xhigh** —
  servono insieme il mockup intero e le 14 mila righe di `app.js` nella stessa
  testa. ≈ 2 giorni.
- **Le altre schermate di Fase 2**: una alla volta, **un agente Opus 5 high per
  schermata**, con il cancello di parità come criterio di accettazione e la mia
  review sullo screenshot contro il mockup. Il problema di ieri non era il
  modello: era la direzione. ≈ 3 giorni.
- **Fase 3**: Fable 5.1, high. ½ giorno.

⛔ Il servizio Git (agente in volo su W1-05): quando atterra **non si tocca e non
si rivede** finché questo piano non è chiuso, come ordinato.
