# Engineering review — confini, responsabilità e porting

## Architettura attuale osservata

Nel desktop il ponte `bridge/legacy-dom.js` associa le quattro tab ai pannelli. `components/conversazione-figlia.js` descrive un ospite del dettaglio fratello di `railAgenti`, non contenuto nel tabpanel: non eredita quindi la sua visibilità. La CSS della PR tratta questa separazione senza smontare la conversazione né governare le sottoscrizioni.

Queste evidenze motivano una guardia locale, non una riscrittura opportunistica del monolite. Il risultato dipende dalla correttezza degli attributi di selezione. La fixture verifica il contratto DOM, non l'intera catena del routing legacy.

## Responsabilità del laboratorio

| Modulo | Responsabilità e vincoli |
| --- | --- |
| `inspector-state.mjs` | Stato puro: activeTab, selectedAgent, selezione file, contesti per sessione, larghezza e Review |
| `explorer-model.mjs` | Query, validazione nomi, collisioni, intervallo virtuale; testabile senza DOM |
| `lab-data.js` | Fixture e dati iniziali; nessun adattatore di rete |
| `explorer-view.js` | Rendering File, memoria dello scroll, remapping riferimenti e reset |
| `agent-views.js` | Lista/dettaglio e viste minime Context/Processi usate per la regressione |
| `workspace-views.js` | Chat dimostrativa, anteprima, grafo e snapshot Review |
| `controller.js`, `actions.js`, `events.js` | Comandi espliciti, menu, focus, tastiera e pointer lifecycle |
| `build.py` | Produce un HTML offline dai sorgenti; controlla unicità dei marker e riproducibilità |

La selezione dell'agente non decide la tab durante `TAB`. Il contesto dei file è mantenuto per sessione; un cambio di sessione salva/ripristina selezioni e filtri. Lo scroll dei file è distinto da quello del dettaglio agente. Le azioni di Review non mutano file reali.

## Alternative considerate

**Smontare il dettaglio al cambio tab:** eliminerebbe il pannello sovrapposto ma perderebbe stato e posizione della conversazione. Scelta: conservare il DOM in produzione e vincolare solo la visibilità.

**Portare subito il prototipo nel runtime:** richiederebbe contratti per filesystem, task, autorizzazioni e stream, ampliando drasticamente lo scope. Scelta: pubblicare sorgenti riproducibili del laboratorio e documentare esplicitamente il porting ancora da fare.

**Conservare tutti i comandi File in vista:** massima esposizione, ma ridondanza nella sidebar stretta. Scelta: ricerca persistente, selettore di vista e azioni contestuali. Il prezzo è un clic in più per funzioni secondarie, mitigato da menu e shortcut.

**Regex JavaScript completa:** più espressiva, ma non appropriata senza isolamento del costo. Scelta locale: subset limitato con feedback. Per ricerca reale servono un motore e un budget di esecuzione appropriati; il filtro client non è un confine di sicurezza.

## Prestazioni e dati

La prova grande aggiunge 1.000 file ai 13 iniziali. Il numero di righe DOM è limitato dalla finestra virtuale; l'altezza è unica fra CSS e calcolo, anche in modalità compatta. La query viene compilata solo quando cambia. Queste scelte evitano due costi identificati, ma la scansione delle fixture rimane lineare e parte della vista attiva viene ricostruita.

Non sono stati misurati p95 di latenza, frame rate, heap dopo ore, filesystem indexing o stream di centinaia di agenti. I numeri di test attestano percorsi e invarianti, non uno SLA. Il grafo ha otto fixture con posizioni predisposte; il replay non ricostruisce tutti gli stati da un event log.

## Contratti necessari prima di una integrazione reale

Usare identità stabili per workspace, file, sessione, run, task e agente, separate dal nome e dal percorso. Le operazioni sul disco devono essere atomiche, con precondizioni/versioni e autorizzazione lato runtime. La UI deve gestire esiti parziali senza inventare successi.

Gli eventi dovrebbero avere ID, sequenza o versione, origine, timestamp e correlazione, con gestione di duplicati, fuori ordine, riconnessione e cancellazione. File, lista, dettaglio e grafo dovrebbero leggere proiezioni indipendenti, aggiornabili per entità, non riscrivere l'intera sidebar per ogni token.

Review deve ricevere una proposta immutabile collegata a base e revisione, con verifica del conflitto sul runtime. Il pulsante non può autorizzare da solo una scrittura reale. Le etichette di test/costo devono indicare provenienza e dati mancanti.

Questi sono requisiti di porting, **non componenti già implementati**. La snapshot Review della demo dimostra soltanto la separazione fra proposta e file mutabile.

## Sicurezza e compatibilità

HTML dinamico escapato, nessun eseguibile avviato, nessun backend. Il laboratorio non è una sandbox per contenuto arbitrario: non caricare materiale non fidato nei test. I launcher usano `--no-sandbox` per il container; eseguirli solo in ambiente di prova isolato, non come configurazione del browser personale.

Le regole con `:has()` sono protette da `@supports`; `[hidden]` è autonomo. La compatibilità va validata sulle WebView effettivamente distribuite. Nessun supporto mobile è stato aggiunto. Le prove di overflow riguardano finestre desktop da 1280, 1440 e 1920 pixel.
