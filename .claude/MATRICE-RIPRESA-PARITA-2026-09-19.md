# Matrice di parità desktop — audit in corso

Release: desktop-v0.1.13/a898162feff3ed8ad4cb0586344fe9d9e390d1a5. Corrente iniziale: a89be85374acf3a83b767b61e3ee44589f40f4a6. Non confondere presenza nel codice, test su fixture e percorso reale certificato.

Percorsi abbreviati della tabella, tutti sotto harness-ui: A=`frontend/src/legacy/app.js`; H=`src/http-app.mjs`; S=`src/session-registry.mjs`; C=`frontend/src/components/`; K=`src/kernel/talosHarness.mjs`; D=`desktop/`. «Stessi file» significa collocazione, non equivalenza semantica. Le rotte sono state riscontrate nella tabella metodi di H e nei gestori; gli ingressi UI devono ancora essere esercitati dove il verdetto è NV.

NV = non ancora verificata end-to-end; NI = nuova incompleta. Il run browser interrotto non promuove alcuna riga a completata. Le prove sotto sono i cancelli da collegare ai risultati nominativi, non esiti dichiarati.

| ID / requisito | Sorgente release → corrente | Ingresso UI | API/effetto | Persistenza | Prova | Verdetto |
|---|---|---|---|---|---|---|
| CHAT-01 nuovo turno | A/H/S/K → stessi file | Nuova sessione/composer | POST sessions, flusso eventi | session-store JSONL | OPENROUTER-REAL-QWEN-09 + reload reale | NV: credenziali reali escluse dal banco |
| CHAT-02 continua dopo ricarica | A/S → stessi file | Selezione sessione, composer | sessions/:id/resume, eventi | JSONL e impostazioni sessione | SESSION-MODEL-CHANGE-RELOAD-02; conversazione multigiro | NV |
| CHAT-03 stop | A/S/K → stessi file | Primario Stop | sessions/:id/stop | eventi conclusione/interruzione | RUN-PRIMARY-STOP-03; annullamento reale | NV |
| CHAT-04 accoda/annulla/invia | A/S → stessi file | Composer durante run, coda | queue, queue/annulla, queue/invia | coda della sessione | RUN-QUEUE-04, coda-condivisa | NV |
| CHAT-05 reindirizza | A/S/K → stessi file | Reindirizza durante run | sessions/:id/redirect | eventi + nuovo giro | RUN-REDIRECT-05/FAILURE-06/STOP-RACE-16 | NV |
| CHAT-06 modifica/elimina messaggio | A/H/S → stessi file evoluti dopo release | Menu bolla persona/modello | DELETE sessions/:id/messages/:messageId; modifica da accertare | lapide nel registro | messaggio-utente-e-file-del-giro; reload | NV: non dedurre modifica dall'esistenza di DELETE |
| CHAT-07 Markdown/ragionamento/scroll | A/C/conversazione.js → stessi file | Risposta e toggle ragionamento | Rendering eventi reali | replay dei messaggi | chat-lunga-p0, scroll-p0, ragionamento-compresso | NV |
| COMP-01 modello e permessi | A/C/permessi.js → stessi file | Chip Modello/Permessi | sessions/:id/settings | sessione e preferenze | SESSION-SETTINGS-RELOAD-01 | NV |
| COMP-02 immagini/allegati | A/H/K → stessi file | Allega/incolla/composer | POST chat-images, strumenti file | .chat-images, sessione | chat/file reali; contenuti non fidati | NV |
| COMP-03 migliora prompt | A/H/src/prompt-enhancer-provider.mjs → stessi file | Migliora testo | sessions/:id/migliora-prompt | testo composer, provider sessione | chiamata reale al provider scelto | NV |
| COMP-04 shell ! | A/H/K → stessi file | Prefisso !, modello occupato | sessions/:id/shell | eventi comando/cwd | comando reale, exit code, cancel, approvazioni | NV |
| TERM-01 schede PTY | C/terminale.js,C/terminale-xterm.js,src/terminal-registry.mjs → stessi file | Scheda Terminale | sessions/:id/terminals, terminal-ws | processo PTY e stato schede | terminale-p0, terminale-una-scheda-sola | NV |
| TERM-02 clipboard/tastiera | C/terminale-xterm.js → stesso file | Selezione, Ctrl+C/V, menu | clipboard OS e byte PTY | clipboard Windows | Electron reale; selezione vs SIGINT | NV: browser con clipboard simulata non basta |
| BROW-01 Pagina/Testo | C/browser.js,H,src/browser-frame.mjs → stessi file | Scheda Browser, URL, modalità | browser/incorniciabile, proxy, leggi | stato per scheda | browser-p0; reload/cambio scheda | NV |
| BROW-02 browser controllato | C/browser-vivo.js,src/browser-vivo.mjs → stessi file | Comandi browser vivo | browser/vivo/apri/gesto/chiudi | sessione browser | gesto reale, policy e chiusura processi | NV |
| SET-01 ricerca/impostazioni/temi | A,C/impostazioni.js,C/impostazioni-campi.js → stessi file | Impostazioni e ricerca | preferenze effettive | localStorage impostazioni | anteprima-tema, _fase2-niente-perso | NV: master su banco vuoto rosso |
| LAB-01 catalogo provider | A,C/provider-card.js,src/provider-registry.mjs → stessi file | Laboratorio/Fornitori | GET providers/models | filtri UI + credenziali separate | lab-provider, lab-provider-filtri | NV; monogrammi presenti nel bundle |
| LAB-02 configura/verifica/rimuovi chiave | A/H/src/provider-credential-store.mjs → stessi file | Configura, Salva, Verifica accesso | providers/:id/key(s),test,runtime | keyring OS + runtime JSON | dialog/tastiera + Electron con profilo isolato | NV: banco usa keyring in memoria |
| LAB-03 ricerca HF e filtri | A/renderizzaHfConMockup,C/hf-catalogo.js → stessi file | Hugging Face, cerca e faccette | GET huggingface/search | stato ricerca/faccette | lab-hf-lista; ritorno/reload | NV |
| LAB-04 download storico HF | A/apriDettaglioHf,avviaDownloadHf → stessi simboli | Riga HF → aside → variante | POST huggingface/download | .local-models, transfer store | payload e download upstream reale | NV; catena sorgente conservata |
| LAB-05 nuova pagina HF | assente → C/scheda-modello.js,A/apriPaginaModello | Lista → pagina modello → variante → coda | apiGet e apiPost collegati | sessionStorage revisione risolta, variante, filtri | 31 scenari HF verdi in 241a753c; mutazione d53ca3a3 | Verificato su banco HTTP; download upstream completo ancora NV |
| LAB-06 README/immagini/compatibilità | assente → C/scheda-modello.js | Tre schede pagina | repo, image proxy, capacity/fit | consenso preferenze | PAGINA-01…14, SSRF e consenso | 31 test pagina verdi (241a753c), ingresso reale coperto; proxy invariato; confronto visivo 76fa9ae0 con scarti ancora aperti |
| LAB-07 coda pausa/riprendi/annulla | A,C/download-coda.js → stessi file evoluti | Download | downloads/:id/pause,resume,cancel | trasferimenti e file parziali | lab-download; operazioni reali | NV |
| LAB-08 rinomina/elimina installato | A/H,src/local-model-store.mjs → C/modelli-installati.js e coda | Azioni modello e download pronto | local-models/:id/rename,delete | manifest nome + pesi | lab-installati-azioni; MODEL_LOCKED; testo durante polling | MODEL_LOCKED verificato sullo store reale isolato (6699f56f) e ingresso UI (3cc86291); altri percorsi reali ancora NV |
| LAB-09 carica/scarica memoria | A/H → stessi file | Sistema/modello installato | runtime/load,unload | processo locale, file conservati | RAM reale, stop, MODEL_LOCKED | NV |
| LAB-10 misure sistema | A/H → stessi file | Laboratorio/Sistema | model-lab/capacity, runtime | osservazione con timestamp | lab-sistema; stale/errori | NV |
| LAB-11 preferiti/confronto/viste/banco/nuove chat | requisiti mockup → copertura da censire | Controlli mockup e prodotto | API/effetti da mappare singolarmente | da definire nei lotti | nessun controllo decorativo; flusso reale per ciascuno | NI; G7, non esclusi |
| LEFT-01 elenco/gerarchia/selezione/pin | A/C/session-item.js → stessi file; PR32 non integrata | Sidebar sinistra | GET sessions/children, eventi | sessioni + preferenze locali | elenco-dopo-lo-stop; identità/focus | NV |
| LEFT-02 feed aggregato | assente → assente; sorgenti PR32 verificati | Controller sidebar nuovo da integrare | /api/v1/sidebar/events, talos.sidebar.v1 | snapshot/delta, epoch/revision | riconnessione/stale/contatori/finestre | NI; R4 |
| RIGHT-01 File albero/ricerca/azioni | A/H/src/workspace-files.mjs → stessi file e scheda corrente | Rail File → riga/dettaglio | tree,tree/file,tree/search,tree/rename/delete/move/copy/create/open | filesystem workspace | po30-scheda-file, po30-ricerca-file + file fisici | NV |
| RIGHT-02 Agenti lista/dettaglio | A/S/src/subagent-orchestrator.mjs → C/dettaglio-agente.js | Rail Agenti → figlio | sessions/:id/children, eventi figli | sessioni parent/child | po30-dettaglio-agente, colonna-destra-p0 + figlio reale | NV |
| RIGHT-03 Contesto/Processi | A/S → stessi file | Rail Contesto/Processi | context e processes | context store / processi vivi | context-compactor, colonna-destra-p0 | NV; demo PR33 non prova questi ingressi |
| RIGHT-04 Review e file modificati | A/C/review.js/H → stessi file | Review, link file fine giro | git/status,git/branch; stage/unstage | Git workspace, eventi | bc80-sommario-revisione, REVIEW-REAL-41 | NV; nessun commit da eseguire |
| RIGHT-05 grafo centrale | demo PR33 → runtime da collegare | Lista e dettaglio Agenti | eventi/children reali | ricostruzione da sessioni | graph layout/navigazione/scala e reload | NI; R4 |
| DATA-01 Libreria | A/H/src/library-store.mjs → stessi confini | Libreria → dettaglio/azioni | library/file/anteprima/rivela/apri, PATCH/DELETE, batch | file e indice workspace | CRUD, export fisico, batch e reload | NV |
| DATA-02 Note/Attività/Memoria | A/H → stessi file | Sezioni e menu lista | notes/tasks/memory CRUD, task/stato, batch | store dedicati | Markdown, autore/conteggi e persistenza | NV |
| RESEARCH-01 ricerca approfondita | A/H/src/research-orchestrator.mjs → stessi file | Ricerca → rapporto/fonti | research,pausa,ripresa,riverifica,esporta | ricerca e artefatti | giro multilingua/multiturno, export reale | NV |
| TOOLS-01 strumenti/hook/MCP/plugin | A/H/K → stessi confini | Hub capability, approvazioni e composer | tools/hooks/mcp/plugins/trust | trust store + file impronte | tool reale, trust-at-use e revoca | NV; SEC23 corretto nel solo confine processo |
| EXPORT-01 chat/file/ricerca | A/H → stessi file | Export e link artefatto | sessions/:id/export,file,research/:id/esporta | file scaricato sul disco | byte/formato, nome, apribilità | NV |
| SHELL-01 finestra/profili/deep link | D/main.mjs,D/profile.mjs → stessi file | App installata, Apri con TALOS | IPC, workspace-launches | profilo Electron e data root | pacchetto isolato: launch/reload/stop | NV |
| SHELL-02 installazione/disinstallazione/chiavi | D e src/pulizia-dati.mjs → stessi confini | Installer/uninstaller | gestione file e scope keyring | dati/chiavi mantenuti o rimossi secondo scelta | PR20–22 + installer reale isolato | NV; non modificare la corsia installer implicitamente |

## Evidenze già registrate

- `ripresa-2026-09-19/pr-inventory.json`: censimento 36 PR con head effettivo.
- `pr-details/23-files.json`…`36-files.json`: diff API e SHA dei blob.
- `pr32-archive-comparison.json`: tutti i 20 file sorgenti dell'archivio coincidono con i blob della PR32 attuale; manifest.json è metadata, non un file Git della PR. Restano otto file della PR non inclusi nell'archivio: valutarli prima dell'integrazione.
- `pr-source-placement.json`: confronto meccanico con normalizzazione CRLF/LF. Un file diverso può contenere un porting; un file assente può avere equivalenza altrove. Non è un verdetto sulle capacità.
- `sec23-28cc0dd6/result.json`: 23 test verdi, mutazione doppio filtro rossa, ripristino verde e hash identico. Regressioni backend complete ancora da eseguire.

## Limiti del censimento

La matrice copre le famiglie richieste; non certifica ancora ogni singolo comando/menu/stato. R1 rimane aperto finché il dettaglio PR, i requisiti dei mockup e le prove runtime non hanno ciascuno una riga. Nessuna «presente e verificata» è assegnata solo dal nome del test. Il primo screenshot del golden master mostra il velo d'avvio: non è prova della geometria sotto il velo.

## Aggiornamento integrato 14:20 UTC
- Grafo centrale collegato a lista e dettaglio, API sessioni/children; filtri conservati, stati sconosciuti espliciti, letture obsolete segnalate, reset fra sessioni. Nove scenari verdi b8d400c5; layout Dagre reale 200 nodi. La prova browser usa fixture HTTP e non certifica orchestrazione multi-turno reale.
- Riepiloghi Capacità macchina/Accessi server/Modelli osservati/Runtime locale **rimossi per decisione documentata dell’owner** il 19/09. Non sono regressioni né requisiti da reintrodurre. La scheda Sistema e le API sottostanti restano.
- Build e unit 49fffdb5: 1431/1431, zero esclusioni. Bundle consegnato a 4174, 14 asset HTTP verificati e 207 sorgenti confrontati.
- Il confronto visivo completo HF (14 immagini, 7 coppie) 76fa9ae0 dimostra sidebar presente e README centrato, ma rivela contenitore esterno troppo largo e differenze in linguette/intestazione: correzione ancora in corso. Sidebar sinistra PR32 rimane da integrare.


## R1: riconciliazione PR32 del 19/09, secondo passaggio
Revisione meccanica assegnata all'agente runtime, controllata dal root sui simboli assenti e sull'inventario API salvato. Pin PR32: 69bf67399a41bee167fa489ae6da635495c08aed. Nessuna integrazione dichiarata dal solo archivio fedele.

| ID comportamento (sotto LEFT-01/02) | Corrente / ingresso | Contratto mancante e prova necessaria | Verdetto |
|---|---|---|---|
| LEFT-01-ID | session-registry.elenca, session-item.identitaSessione/ordinaSessioniAdAlbero | ID/nome/genealogia REST presenti; prova E2E selezione e rinomina con reload | Presente nel codice, E2E ancora aperta |
| LEFT-01-DOM | aggiornaElencoSessioniReali usa replaceChildren | PR32 sidebar-view: conservare nodi/focus/scroll a delta; test identità oggetto DOM e tastiera | Non portato |
| LEFT-01-PIN | legacy-dom nasconde Fissate | Pin locali talos-desktop-sidebar-v1, albero completo segue pin; reload/due finestre | Non portato |
| LEFT-02-FEED | GET /api/v1/sessions + stream per sessione | /api/v1/sidebar/events, talos.sidebar.v1, snapshot autorevole, delta/epoch/revision | Assente |
| LEFT-02-RECONNECT | polling 15s e rilettura all'apertura stream attivo | Gap/epoch/duplicati, snapshot dopo reconnect, REST tardivo non sovrascrive SSE | Assente |
| LEFT-02-FRESHNESS | nessun heartbeat specifico sidebar | Heartbeat e stale45s, errore leggibile/fallback senza stato inventato | Assente |
| LEFT-02-ACTIVITY | eventi talos.agenti legati a padre/sessione | Proiezione attivitaSidebar aggregata e limitata senza contenuti/argomenti | Non equivalente al feed corrente |
| LEFT-02-RESOURCES | cache/poll contatori 15s | Invalidazione resources:true dopo scritture confermate e tool; più finestre | Non portato |
| LEFT-02-TRANSPORT | SSE solo sessione | cleanup, HEAD, buffer1MiB, heartbeat e chiusura; test sul socket | Non portato |
| LEFT-01-STABILITY | session-item scandisce slice/find; novità timestamp futuro non esclusa | PR32 algoritmo albero e guard timestamp; 22 prove stabilità 5/50/200/1000 | Non portato |

Otto file PR32 esterni all'archivio esaminati: quattro workflow sidebar-apply/bootstrap/finalize/race-final (infrastruttura temporanea della PR; finalize include pubblicazione e non va eseguito/importato automaticamente); due documenti checkpoint/refactor; session-item.js e il relativo session-item-stabilita.test.mjs. Questi ultimi due contengono comportamento/test da integrare. Restano tredici file aggiunti assenti e sette file modificati divergenti fra i venti sorgenti dell'archivio; la convergenza richiede confronto a tre versioni, non sostituzione dei monoliti.

## R1: audit aggiuntivo HF
- RIPRESA-HF-ORDINAMENTI-ADAPTER/HTTP: errore createdAt confermato e corretto; 16 prove focused verdi e quattro ricerche reali upstream riuscite in hf-sort-upstream-1789834986491.json. Backend4174 ancora precedente.
- RIPRESA-HF-FACCETTA-ZERO/PERSISTENTE: perdita del filtro di seconda pagina confermata RED unit e correzione 14/14 unit; prova browser rientro in attesa del runner unico.
- RIPRESA-HF-FILTRI-DIGITATI e RIPRESA-HF-RIPROVA-CONCORRENTE: test aggiunti, correzioni/gate ancora da completare.
- Close dopo cambio tab: possibile ambiguità fra commento e history; preservare contratto Back/Forward fra tab già provato, non dichiarare regressione di release senza confronto.
- Accesso null nella pagina: copy ignoto da completare; non equivale a bypass del gate backend. Nessun blocco indiscriminato del download introdotto.
- Infinite loading con faccetta rara: richieste seriali ma potenzialmente molte pagine; rischio rate-limit nominativo, già dichiarato nel ledger, non finto completamento.
