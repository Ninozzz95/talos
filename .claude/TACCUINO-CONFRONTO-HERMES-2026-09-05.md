# TACCUINO — ricognizione tecnica di Hermes Desktop, componente per componente (iniziato il 05/09/2026)

> Parte del `PIANO-CONFRONTO-HERMES-2026-09-05.md`. Fonte: il clone `hermes-agent-v21`
> (`365e283`, 02/09/2026, v0.21.0 «Pantheon») in `%LOCALAPPDATA%\Temp\talos-competitor\`,
> cartella `apps/desktop/src` (667 file `.tsx`; l'app desktop è React + Electron, con e2e
> Playwright propri). Qui si annota ciò che si LEGGE nel codice: file, comportamento, forza,
> debolezza, il nostro +1. Le misure (tempi, gesti, screenshot affiancati) arrivano con gli
> script, dopo il cutover. Niente giudizi senza un file dietro.

## Gruppo 1 · Chat — Composer (nostro: `Composer`, `AttachButton`, `Chip`, `SendButton`, `MessageQueue`, `StatusStrip`)

| Hermes (file in `app/chat/composer/`) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `hooks/use-composer-queue.ts` (`enqueueQueuedPrompt`, `isSteerableEntry`, `$parkedQueueSessions`) + `queue-panel.tsx` | coda di prompt per sessione, con voci «steerable» (reindirizzo) e code parcheggiate per sessione | coda multipla visibile in un pannello, per-sessione | pannello a parte: la coda esce dal filo della chat | la nostra `MessageQueue` è NEL piede, sotto gli occhi; da pareggiare: più di un messaggio in coda con «+N altri» (già nel monolite: `renderizzaBannerCoda`) e il reindirizzo di una voce in coda |
| `hooks/use-composer-undo.ts` (snapshot del draft) | annulla/ripristina il testo del composer da istantanee | undo esplicito oltre a quello del browser | complessità: `syncDraftFromEditor` su un `contentEditable` (`rich-editor.ts`) | il nostro composer è un `<textarea>` nativo: undo di sistema gratis; +1: bozza per sessione ricordata (vedi riga sotto) |
| `hooks/use-composer-draft.ts` («draft providers» sul «suggestion bus», provider di riparazione event-driven) | bozze e suggerimenti da fornitori registrati; suggerimento di «riparazione» quando arriva un errore dal gateway | il suggerimento nasce dagli eventi (errore → proposta di correzione) | bus generico = più strati | il nostro `mostraSuggerimentoComposer` propone già la domanda dall'ultimo attrezzo; +1: bozza NON inviata conservata per sessione (oggi si perde cambiando sessione — da verificare e pareggiare) |
| `hooks/use-composer-esc-cancel.ts` («focus-bus»: con N composer montati solo quello attivo annulla con Esc) | Esc ferma il giro del composer attivo | gestisce più composer (tile) | serve un bus del fuoco | noi abbiamo un composer solo: Esc ferma il giro (già: «Ferma Esc» nella striscia) — verificare Esc dal `textarea` |
| `hooks/use-composer-popout.ts` (`clampPopoutPosition`, zona di popout) | il composer si stacca in una finestrella trascinabile | scrivere a lato mentre si legge | gesto raro, molta meccanica | noi: composer ridimensionabile con misura ricordata (fatto). Non copiare il popout senza una richiesta dell'owner |
| `hooks/use-composer-voice.ts`, `use-auto-speak-replies.ts` | dettatura e lettura automatica delle risposte | voce in entrata e in uscita | — | noi: microfono e «Ascolta la risposta» (fatti); +1 possibile: lettura automatica opzionale (decide l'owner) |
| `attachments.tsx`, `hooks/use-composer-drop.ts`, `drop-affordance.ts`, `chat-drop-overlay.tsx` | allegati con trascinamento e overlay di drop su tutta la chat | il drop è visibile e guidato | — | nostro `AttachButton` («+» = contesto): da pareggiare il drag&drop di file/immagini con overlay nel linguaggio del mockup (riga di lavoro) |
| `hooks/use-at-completions.ts`, `inline-refs.ts`, `path-refs.ts`, `slash-refs.ts`, `completion-drawer.tsx`, `use-emoji-completions.ts` | `@file`, percorsi, `/comandi` con cassetto dei completamenti | completamento inline unificato | — | il nostro foglio «Riferimenti @» (Astra, dialogo) è un dialogo, non inline: +1 da valutare = completamenti inline nel `textarea` (decide l'owner; costo alto) |
| `directive-actions.tsx`, `micro-actions.tsx`, `suggestion-pills.tsx`, `help-hint.tsx` | azioni rapide e pillole di suggerimento sopra il composer | invito all'azione contestuale | rumore se troppe | i nostri chip sono STATO (modello, permesso, giri, costo), non azioni; i suggerimenti stanno nello stato vuoto: coerente con le decisioni B; niente da copiare |
| `model-pill.tsx` | pillola del modello nel composer | uguale al nostro chip | — | pari |
| `enter-submit-dom-race.test.tsx`, `enter-stale-ime-flag.test.tsx`, `short-session-hang-repro.tsx` | test su gare Invio/IME e su un blocco delle sessioni corte | hanno trovato e coperto gare reali | l'editor `contentEditable` porta gare che un `<textarea>` non ha | evidenza a nostro favore: tenere il `<textarea>`; misurare Invio con IME (tastiera italiana con accenti) nel nostro script |

## Gruppo 1-bis · Chat — il filo dei messaggi (nostro: `Turn`, `Message`, `ActivityBundle`, `ToolRow`, `ToolFailure`, `ApprovalCard`, `DiffView`, `TouchedFiles`, `ArtifactCard`, `SystemNote`)

| Hermes (file in `components/assistant-ui/`) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `tool/approval.tsx` (`APPROVAL_TOOLS = terminal, execute_code, patch, write_file`; scelte `once · session · always · deny`; `Ctrl⏎` = esegui una volta; `smartDenied` riduce le scelte a `once · deny`; `replayPendingApproval` alla riconnessione) | scheda di approvazione inline nel filo, con quattro risposte e scorciatoia | quattro risposte (anche «sempre», permanente) e la richiesta rigiocata dopo una caduta del gateway | «always» è permanente per attrezzo: comodo, e pericoloso senza un posto dove revocarlo (Hermes lo mette nelle impostazioni) | la nostra `ApprovalCard` ha tre risposte (una volta · sessione · nega) e il PERCHÉ in chiaro; sopravvive al reload (provato dal vivo); +1 da pareggiare: scorciatoia `Ctrl+Invio` = approva una volta, `Esc` = nega; «sempre» resta fuori per decisione (i permessi si cambiano dal chip) |
| `thread/changed-files-card.tsx` (`DiffCount` +/- per file; «Review» apre il pannello diff `⌘G`; clic sulla riga apre il diff di quel file) | scheda «file toccati» a fine giro | identico nell'intento al nostro `TouchedFiles` | — | pari: la nostra riga ha «Apri» e «Differenza» (→ Review); +1: scorciatoia per la Review (`Ctrl+G`? decide l'owner, oggi non c'è) |
| `thread/assistant-message.tsx` (`CopyButton`, `BranchPicker`, `onBranchInNewChat` con `GitForkIcon`; su errore: Retry · Open Logs · Copy error details) | azioni del messaggio: copia, ramifica in una chat nuova, e su errore riprova/apri log/copia dettagli | «ramifica da qui» e «apri i log» sono azioni vere | — | nostre `MessageActions`: Copia · Ascolta · Ramifica (Ramifica è `data-richiede="fase3"`: BranchTree, K-?); +1 da fare in Fase 3: su un messaggio d'errore, «Riprova» e «Copia dettagli» (oggi la nostra `ToolFailure` ha solo Riprova) |
| `thread/user-edit-composer.tsx`, `thread/message-reactions.tsx` | modifica di un messaggio già inviato (rigioca da lì) e reazioni sul messaggio | «modifica e rigioca» | le reazioni sono decorative | +1 da valutare: «Modifica e rimanda» sul messaggio utente (richiede al kernel un fork da un turno: K-J da aprire) |
| `thread/transcript-window.tsx`, `app/chat/transcript-window.ts`, `transcript-backfill.ts` | finestra virtuale del trascritto con backfill a scorrere | regge migliaia di messaggi | complessità | il nostro filo è DOM pieno: da MISURARE con una sessione da 500 turni (fps allo scroll, memoria); se cade, virtualizzazione = riga di lavoro |
| `tool/run-ticker.tsx`, `tool/run-summary.ts`, `thread/turn-activity.ts`, `thread/status.tsx` | ticker dell'attività («sta leggendo x…») e riepilogo del giro | l'utente sa sempre cosa sta facendo | — | pari: nostra riga di attesa con «cosa sta facendo» (fatta, S-05) e `TurnSpine`; +1 nostro: giri/token/costo nel piede |
| `tool/delegate.tsx`, `tool/delegate-model.ts`, `tool/fallback.tsx`, `tool/fallback-model/` | riga dedicata per la delega a un sub-agente (con il suo modello) e per il ripiego su un altro modello | la delega è visibile come tale | — | nostri «Agenti» nella colonna destra (Astra, B2); +1: la riga attrezzo della delega nel filo (dopo B2, se il kernel emette l'evento) |
| `clarify-tool.tsx`, `mcp-setup-tool.tsx` | l'agente fa una domanda (con scelte) e un attrezzo guida la configurazione di un server MCP | la domanda dell'agente è una scheda, non testo | — | +1 da pareggiare: scheda «Domanda dell'agente» con scelte (kernel: evento dedicato, K-K da aprire); MCP fuori dalle decisioni |
| `embeds/` (YouTube, Spotify, mappe, Twitter, TikTok, Mermaid, SVG, frame con `embed-consent`) | incorporamenti ricchi nel messaggio, con consenso prima di caricare contenuti esterni | il consenso prima dell'embed è la cosa giusta | superficie enorme di terze parti | noi: Mermaid/SVG/tabelle Markdown da valutare (decide l'owner); il resto NO (non è un harness di coding) |
| `ansi-text.tsx`, `markdown-table.tsx`, `message-render-boundary.tsx` | colori ANSI nell'output del terminale, tabelle Markdown, confine d'errore per messaggio | un messaggio rotto non rompe il filo | — | +1 da pareggiare: ANSI nella `ToolRow` del terminale (B1) e un confine d'errore per messaggio (oggi un errore di rendering ferma il replay?) — da provare al contrario |
| `components/find-bar.tsx` | cerca nel trascritto (`Ctrl+F` in app) | trova nel filo lungo | — | manca: riga di lavoro (A6 cerca nelle conversazioni copre il Board, non il filo aperto) |
| `thread/timeline.tsx`, `timeline-timestamp.tsx` | linea del tempo con orari raggruppati | orientamento nel tempo | — | nostra `TurnSpine` con «giro N» e tick; ora del messaggio SOLO al passaggio (decisione B); pari |
| `components/pet/`, `particles/` | mascotte e particelle | — | rumore | non copiare |

## Gruppo 2 · Navigazione — Sidebar (nostro: `Sidebar`, `SessionList`, `SessionItem`, `NavGroup`, `WorkspaceFooter`)

| Hermes (file in `app/chat/sidebar/`) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `sessions-section.tsx`, `session-row.tsx`, `session-row-gesture.ts`, `session-actions-menu.tsx`, `split-submenu.tsx` | righe di sessione con gesti (trascina, tasto destro), menu con Pin/Rinomina/Move to project/Open in split/Export/Archive/Elimina (già visto da Astra il 05/09) | menu completo, «Apri in split» in quattro direzioni | densità del menu | noi: menu della riga (monolite) + Fissate (K-A, Fase 3); +1: la riga dice STATO ONESTO (aspetta te · errore · giri finiti) e giri/modello — Hermes mostra meno fatti per riga (da misurare) |
| `reorderable-list.tsx`, `row-geometry.ts` | riordino manuale delle righe | ordine scelto dall'utente | — | noi: ordine per tempo; +1 possibile = fissate in cima (K-A) |
| `projects/`, `project-dialog.tsx`, `profile-switcher.tsx`, `profile-scope.ts`, `connection-switcher.tsx`, `connection-glyph.tsx`, `use-fleet-roster.ts`, `fleet-rail.ts` | sessioni raggruppate per progetto e per profilo; più connessioni (gateway) e una «flotta» di bot | multi-gateway e multi-profilo | complessità per chi ha un solo progetto | nostro: workspace nel piede + Luoghi; multi-profilo non è nelle decisioni (PROPOSTA, decide l'owner) |
| `cron-jobs-section.tsx` | i cron nella sidebar | automazioni a portata | — | nostre Automazioni sono un Luogo (B5, fatto): pari |
| `filter-menu.tsx`, `section-states.tsx`, `load-more-row.tsx` | filtri e sezioni richiudibili, caricamento a pagine | scala con molte sessioni | — | noi: ricerca «dentro le conversazioni» (A6, da fare nel Board/ricerca) e 74 righe già virtuali? NO: da misurare con 500 sessioni (riga di lavoro) |

## Gruppo 3 · Colonna destra (nostro: `Inspector`, `InspectorCard`, `TurnIndex`, `ProcessRow`, `FileTree`) e Browser (`BrowserScreen`)

| Hermes (file in `app/chat/right-rail/`) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `preview-pane.tsx`, `preview-browser-bar.tsx`, `preview-nav.ts`, `preview-reader.ts`, `preview-drive.ts`, `preview-act.ts`, `preview-script-runner.ts` | il «preview rail»: browser in-app con barra, lettura della pagina (`read_preview`), guida dell'agente (drive/act), esecuzione di script | il browser è NELLA colonna destra e l'agente lo legge davvero | una colonna sola per file, artefatti, browser e console | il nostro Browser è una VISTA a schede (owner 05/09) + colonna con Contesto/File/Agenti/Processi; K-I per l'agente |
| `preview-annotate-card.tsx`, `preview-annotate-host.ts` | annotazione di un elemento della pagina che l'agente poi trova e modifica | «indica e correggi» | — | +1 da pareggiare in Browser (Annota → composer), K-I |
| `preview-console.tsx`, `preview-console-store.ts` | console della pagina nel rail | debug in app | — | manca: riga di lavoro per il Browser a schede (console della scheda) |
| `preview-file.tsx`, `preview-artifact.tsx` | anteprima file e artefatti nella colonna | tutto a destra | — | nostri: ArtifactCard in chat (fatta) + anteprima file in dialogo (Astra): pari, forma diversa per decisione |
| `preview-tour.ts`, `tour-marker.ts` | tour guidato dell'interfaccia | onboarding | — | nostra Intro a quattro passi (H16-H20): pari nell'intento; +1 = «Ripeti il primo avvio» (già nelle Impostazioni) |

## Gruppo 3-bis · Review, Terminale, Palette, Notifiche (nostro: `ReviewScreen`/`ReviewFileTabs`/`DiffView`, `TerminalScreen`/`TerminalPane`, `CommandPalette`, `NotificationPanel`/`Toast`)

| Hermes (file) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `app/right-sidebar/review/index.tsx` (`stageReviewFile(null)` = stage tutto, `unstageReviewFile`, `$reviewRevertTarget` con dialogo di conferma per «revert» di un file o di tutti) | la Review è git: stage/unstage per file, ripristino con conferma, albero dei file (`file-tree.tsx`, `tree-data.ts`) | l'utente chiude il giro DENTRO l'app: stage, revert, commit | la Review è git-only: un file toccato fuori da un repo non ha posto | la nostra Review è per GIRO (schede in alto, diff sotto, «giro N», provenienza dal kernel) e non richiede git; +1 da pareggiare in Fase 3: K-B accetta/scarta per file = il loro stage/revert, con conferma per lo scarto; ambiti Uncommitted · Branch · Ultimo giro = K-D |
| `review/ship-bar.tsx` (`commitChanges(message,{push})`, `generateCommitMessage` «off-thread, VS Code style», il bar sparisce se non c'è niente da committare) | barra commit · commit+push · PR con messaggio generato dal modello | chiude il ciclo fino al PR | il push da un pulsante è un gesto irreversibile a un clic | +1 nostro: il commit resta un ATTREZZO del giro approvato (il push si chiede, regola dell'owner); da valutare «Proponi messaggio di commit» nella Review (decide l'owner) |
| `review/churn-bar.tsx` («digital rain» per riga, **non collegata**: «Not wired in») | — | — | codice morto nel prodotto | niente |
| `app/right-sidebar/terminal/terminals.ts` (`TerminalEntry.kind = user | agent`; `restoreCwd` da OSC 7; scrollback xterm serializzato e rigiocato al riavvio con tetto per non sfondare `localStorage`, «processi NON rianimati: sotto il buffer parte una shell nuova»; le schede agente sono specchi di sola lettura) | terminale a schede: schede utente (PTY vero) e schede agente (specchio del comando dell'agente, `seedAgentTerminalCommand` mostra il comando subito) | la scheda dell'agente non è mai vuota; cwd e cronologia tornano al riavvio; parità dichiarata con VS Code | un solo xterm montato alla radice e «inseguito» con `position:fixed` (`persistent.tsx`): fragile alle trasformazioni CSS | B1 (Astra) + K-G: da pareggiare **tutte e quattro**: scheda per processo dell'agente seminata col comando; scheda utente con PTY; cwd ricordata; scrollback ricordato con tetto. Da MISURARE: latenza tasto→eco, 10.000 righe |
| `terminal/links.ts`, `clipboard.ts`, `selection.ts`, `terminal-context-menu.ts`, `terminal-font.ts` | link cliccabili, copia/incolla, selezione, menu contestuale, font del terminale | dettagli da terminale vero | — | B1: link ai file aperti nella Review/anteprima è il nostro +1 (i percorsi del workspace) |
| `app/command-palette/index.tsx` (gruppi ordinati da `rankGroups`/`scoreItem` in React, non in cmdk; `⌘/⌃`+selezione apre in una scheda nuova, `⇧⌘` stacca; combo live come suggerimento) | palette con ranking proprio, varianti col modificatore, suggerimento di scorciatoia accanto alla voce | ranking curato e prevedibile; ogni voce mostra la sua scorciatoia | pagine «marketplace tema» e «pet» nella palette: rumore | la nostra palette (monolite, `#commandPaletteBtn`, Ctrl+K) va rivista sul mockup: +1 = scorciatoia accanto a ogni voce e gruppi (Sessioni · Luoghi · Azioni) con punteggio; misurare: gesti per «apri sessione X» |
| `components/ui/keyboard-first.ts` («un mouse PRESENTE non è un mouse USATO»: gli overlay aperti da tastiera ignorano l'hover finché il mouse non si muove davvero) | contratto condiviso per palette, menu modello, picker | evita il salto della selezione quando il cursore è fermo sopra la lista | — | +1 da pareggiare, costo basso: nella palette e nei menu ignorare `mouseover` senza movimento (regola H27-H30 tastiera) |
| `components/notifications.tsx` (due pile: primaria in alto al centro, collassata all'ultimo toast con «+N altri», portata sopra i dialoghi; ambientale in basso a destra, tutte visibili; toast con azione) | notifiche a due livelli, sopra le modali | non si perdono dietro un dialogo | — | il nostro `Toast`/`NotificationPanel` (Astra, B7?): pareggiare il «+N altri» e il portale sopra i dialoghi; provare al contrario: toast durante una modale aperta |
| `app/updates-overlay.tsx`, `gateway-connecting-overlay.tsx`, `boot-failure-overlay.tsx` | aggiornamenti, riconnessione al gateway, avvio fallito: schermate dedicate | gli stati di errore d'avvio sono progettati | — | nostra barra `runtime-status` + Doctor (Astra): +1 = schermata onesta se il server non risponde all'avvio (oggi? da provare al contrario spegnendo 4175) |

## Gruppo 4 · Pagine (nostro: `SettingsScreen`, `DoctorScreen`, `ModelLabScreen`, `CapabilityScreen`, `MemoryScreen`, `TasksScreen`, `LibraryScreen`, `ResearchScreen`, `ForgeScreen`, `AutomationsScreen`, `BoardScreen`)

| Hermes (file in `app/`) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `settings/` — `appearance`, `keybind-settings.tsx`, `keys-settings.tsx`, `env-credentials.tsx` + `env-var-actions-menu.tsx`, `custom-endpoints-settings.tsx`, `fallback-models-field.tsx`, `local-models-settings.tsx`, `connections-registry.tsx`, `gateway-settings.tsx`, `computer-use-panel.tsx`, `browser-real-profile-panel.tsx`, `billing/` (piano, ricarica automatica), `about-settings.tsx`, `config-settings.tsx` (editor della config con `config-field.tsx`) | impostazioni a sezioni: aspetto, scorciatoie RIMAPPABILI, chiavi, variabili d'ambiente, endpoint personalizzati, modelli di ripiego, modelli locali, registro connessioni, computer use, profilo browser reale, fatturazione | **le scorciatoie si rimappano**; i modelli di ripiego sono una lista ordinata; le chiavi hanno una UI dedicata con prova | 14 sezioni: molte riguardano il loro gateway/cloud (billing, connessioni) che noi non abbiamo | B6 (Astra): 38 controlli, sei fonti di ricerca con prova. +1 da pareggiare: **scorciatoie rimappabili** (oggi fisse; H27-H30) e **modello di ripiego** (kernel: K-L da aprire); da NON copiare: billing/connessioni |
| `skills/index.tsx`, `mcp-tab.tsx`, `embedded-hub-picker.tsx`, `learning/` | pagina Skill con scheda MCP e un picker dell'hub (skill scaricabili), «learning» = skill apprese dall'agente con archiviazione | skill installabili da un hub; skill apprese dall'uso | dipendenza dall'hub Nous | nostra Capability (Astra, R-04: skill, connettori, plugin, hook). +1 da valutare: «skill apprese» = riga PROPOSTA (P-? del dossier), decide l'owner |
| `agents/index.tsx`, `profiles/` | pagina Agenti (sub-agenti) e profili (crea/rinomina/elimina) | multi-profilo | — | Agenti nella colonna destra (B2). Profili: fuori decisione |
| `artifacts/index.tsx` | pagina Artefatti (galleria di ciò che l'agente ha prodotto) | tutto in un posto | — | la nostra Libreria (B5) è per progetto: pari; +1: la ArtifactCard in chat apre nella Libreria (verificare dopo B5+cutover) |
| `starmap/` (simulazione, asse del tempo, condivisione con codice) | «mappa stellare» delle sessioni nel tempo, condivisibile | spettacolare | decorativa: non serve a lavorare | non copiare; il nostro Board con filtri e conteggi risponde alla stessa domanda («cosa ho fatto») con dati |
| `command-center/` (`maintenance.tsx`), `hud/` (overlay flottante con click-through, trascinamento del composer, «game overlay»), `quick-entry/` (finestra rapida globale) | centro comandi con manutenzione; HUD sopra le altre finestre; inserimento rapido da scorciatoia globale | il quick-entry (scorciatoia di sistema → prompt) è un +1 vero di un'app Electron | noi siamo nel browser: nessuna scorciatoia globale di sistema | +1 nostro possibile SOLO se TALOS Desktop diventa app (Electron/Tauri): riga PROPOSTA; da non promettere nella UI |
| `messaging/` (`platform-icon.tsx`) | collegamenti alle piattaforme di messaggistica (Telegram, Discord, …) | l'agente risponde anche da lì | — | fuori dalle decisioni del desktop (il mobile ha il suo) |
| `components/model-picker.tsx` (`ModelPickerDialog`, «overlay ladder» per stare sopra l'onboarding) | picker dei modelli in dialogo, con gradini di sovrapposizione | funziona anche sopra un altro overlay | — | nostro dialogo Modello (R-01, Astra): provare AL CONTRARIO che si apra sopra l'Intro (H16-H20) e sopra un altro dialogo |
| `components/onboarding/`, `first-run-remote-form.tsx`, `desktop-install-overlay.tsx` | primo avvio con scelta locale/remoto e installazione guidata | onboarding a più vie | — | nostra Intro a quattro passi (cartella, modello, permessi, primo messaggio): pari; +1 nostro: file tree compatto nella modale (owner 05/09) |

## Da misurare con gli script (non dal codice)

- Tempo al primo token e gesti per «nuova sessione → primo messaggio» (Hermes vs TALOS).
- Tastiera: Tab/frecce/Esc su sidebar, composer, coda, dialoghi; anello di fuoco.
- Righe della sidebar con 500 sessioni: fluidità (fps) e memoria.
- Drag&drop di un file: dove finisce e cosa vede l'agente.
- Un dialogo sopra un altro (Modello sopra Intro), un toast sopra un dialogo, il server spento all'avvio: tre prove AL CONTRARIO.
- Onestà: task-trappola (premessa falsa): chi inventa (dal banco del 28/8 Hermes barava 3/3).

## Misure dal vivo — 05/09 notte, gruppo 1 (chat), `node scripts/confronto/confronto.mjs --gruppo=chat`

Strumento: `harness-ui/frontend/scripts/confronto/` (`avvia-hermes.mjs` apre la copia compilata di
Hermes Desktop 0.17.0 con `--remote-debugging-port=9705`; `guida.mjs` apre TALOS su 4175 e si
aggancia a Hermes via `connectOverCDP`, stessa azione sulle due app, foto affiancate in
`artifacts/confronto/chat/<nn>-<blocco>/affiancato.png`, `esiti.json`). Nessun invio al modello.

| Passo | TALOS | Hermes | Esito | Cosa ho visto nelle foto |
|---|---|---|---|---|
| Apri la prima sessione (1 gesto) | filo in 53 ms, 2 turni | 65 ms, 2 turni | PASS | Hermes NON mostra la risposta finale dell'assistente nel trascritto di una sessione conclusa: solo il messaggio utente e due righe «Explored 5 files, ran 3 commands». TALOS mostra tutto |
| Tab dalla pagina al composer | 7 tasti | 6 (e 2 in un giro precedente: dipende da dove cade il clic) | FAIL (misura da fissare) | Hermes ha un «focus chord» (`composer/focus-chord.ts`) per portare il fuoco al composer. **Riga di lavoro**: scorciatoia per il composer (es. `Ctrl+/`), e misura con punto di partenza fisso |
| Scrivi tre righe | 40→80 px, invia visibile | 28→47 px, invia visibile | PASS | pari |
| Azioni del composer con nome | 6 azioni, 0 senza nome (**prima della correzione: il «+» era senza nome**) | 6, 0 senza nome | PASS | Hermes: Add context · Model · Voice dictation · Read replies aloud · Wake word · Start voice conversation. Noi: + · modello · permesso · giri · Voce · Invia. Il chip «Giri» è uno `span` (stato, non azione): giusto |
| Azioni sul messaggio al passaggio | 3 (Copia · Ascolta · Chiedi di nuovo; **prima: solo `title`, nessun nome**) | 2 sul messaggio utente (Edit message · Restore checkpoint) | PASS | **Hermes ha «Modifica messaggio» e «Ripristina checkpoint» sul messaggio UTENTE**: riga K-J (fork da un turno) confermata dal vivo |
| Apri il riepilogo delle attività | +107 caratteri, 3 righe attrezzo | +179 caratteri | PASS | Le righe di Hermes dicono il COMANDO («Ran find . -type f», «Read magazzino.py»); le nostre dicono l'esito e il file («Lettura non riuscita · src/matematica.mjs») ma la ricerca non dice COSA ha cercato. **+1 da fare**: la riga della ricerca mostra la query |
| Barra di stato | «92,1k token · 9 giri · cache 83%» + connessione | nessun conteggio a schermo | PASS | vantaggio nostro netto: Hermes non mostra token, giri, cache né lo stato della connessione |

Densità (foto): a 1440×900 la sidebar di Hermes mostra ~24 sessioni su una riga ciascuna; la
nostra ~6 su due righe (stato · modello · giri). Scelta nostra (più fatti per riga), da tenere
d'occhio con 500 sessioni.

Correzioni fatte durante il giro (cancelli verdi): `aria-label` sul pulsante «+» del composer e
sui tre pulsanti delle azioni del messaggio (mockup + `conversazione.js`); fonte: W3C APG
«Providing Accessible Names and Descriptions» e tecnica ARIA14, WebAIM Million 2025 (27,7% delle
home page con pulsanti senza nome), letti il 05/09/2026.

## Misure dal vivo — 06/09, gruppo 2 (navigazione), `--gruppo=navigazione`: 7/7 PASS

| Passo | TALOS | Hermes | Cosa ho visto |
|---|---|---|---|
| Cerca una sessione dalla casella | 74→37 righe (**prima della correzione: 74→74, la casella non filtrava le sessioni vere**) | 312→24 | Hermes cerca su 312 sessioni istantaneamente; noi su 74. Da misurare con 500 |
| Fatti per riga di sessione | 2 fatti in 66 px (stato · modello · giri · tempo) | 1 in 26 px | scelta nostra: più fatti, metà densità |
| Comprimi la barra laterale | 276→64→276 px (icone) | 360→0→360 px (sparisce) | +1 nostro: in modalità icone i Luoghi restano raggiungibili |
| Ctrl+K palette | 16 voci → 8 con «sess», Esc chiude | 62 voci → 202 (!) con «sess», Esc chiude | Hermes con «sess» MOSTRA PIÙ voci (202): la ricerca apre le sessioni dentro la palette. +1 da valutare: sessioni nella nostra palette (oggi 16 comandi) |
| Pulsanti della testata con nome | 8 pulsanti, 0 senza nome (**prima: 5 senza nome**), 4 tab | 7, 0 senza nome, 3 tab | pari |
| Nascondi la colonna di destra | 340→0→340 px | «Show/Hide right sidebar» | pari |
| Notifiche | «Notifiche: nessuna», si apre (**prima: menu invisibile, T-17**) | nessun pulsante notifiche nella finestra | Hermes affida le notifiche al sistema (`notifications.tsx` = toast); noi abbiamo un pannello «Aspetta te» che elenca le sessioni che chiedono attenzione: +1 nostro |

## Misure dal vivo — 06/09, gruppo 3 (sessione), `--gruppo=sessione` su 4182 (store del kernel vero)

| Passo | TALOS | Hermes | Cosa ho visto |
|---|---|---|---|
| Apri la Review di una sessione con file scritti | 1 file, 1 riga, «Copia i diff» attivo (**prima: riga «−» fantasma e stato vuoto con scheda finta**) | Ctrl+G apre il pannello Review nella colonna destra: «No diffs», azioni View as list · Stage all · Revert all · Refresh tree | La Review di Hermes è git (stage/revert), la nostra è per giro: il nostro +1 è vedere il diff anche senza repo; il loro è chiudere il ciclo (stage → commit). K-B/K-D in Fase 3 |
| Frecce fra le schede dei file | non misurato (una sola scheda) | albero, non schede | — |
| Colonna di destra | Contesto · File · Agenti · Processi, 14 coppie chiave-valore | BRANCH · NEW SESSION · TERMINAL · «1. pwsh.exe» | Hermes tiene TERMINALE e REVIEW nella colonna destra, sempre a portata; noi Terminale e Review sono viste. Il terminale «1. pwsh.exe» con «New terminal» e «Hide terminal» è la parità per B1 (K-G) |
| Albero dei rami | pulsante «Apri l'albero dei rami» (Fase 3) | scheda «BRANCH» accanto alla sessione | Hermes fa del ramo una SCHEDA di sessione: da valutare per BranchTree |
