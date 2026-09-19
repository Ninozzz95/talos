# Ledger — runtime agenti in background (2026-09-19)

## Perimetro e proprietà

- Sottosistema: `harness-ui` backend/runtime desktop.
- File creato: `.claude/LEDGER-RIPRESA-AGENTI-RUNTIME-2026-09-19.md`.
- File modificato: `harness-ui/src/subagent-orchestrator.mjs`.
- File modificato: `harness-ui/src/session-registry.mjs`.
- File modificato: `harness-ui/tests/subagent-orchestrator.test.mjs`.
- File modificato: `harness-ui/tests/session-registry.test.mjs`.
- Nessun file frontend, kernel canonico, adapter desktop, dipendenza o lockfile viene modificato.

## Problema osservato

`creaSubagentOrchestrator().delegaSottoTask()` restituisce una Promise che si risolve soltanto nel callback terminale `onConclusioneFn`. Il kernel attende `onDelega`, quindi la tool-call `delega_sottotask` tiene occupato il giro della madre per tutta la vita della figlia. La madre non può proseguire mentre la figlia lavora.

## Contratto e simboli

### `harness-ui/src/subagent-orchestrator.mjs`

- Modificare `creaSubagentOrchestrator(options)` aggiungendo i callback opzionali `onFiglioCreatoFn` e `onFiglioConclusoFn`.
- Modificare `delegaSottoTask({ sessionPadreId, task, cartella })` affinché:
  - conservi invariati i rifiuti sincroni di modello, percorso, profondità e concorrenza;
  - ritorni solo dopo che `avviaESeguiFn` ha restituito un `sessionId` reale;
  - su avvio valido risolva subito `{ esito: 'avviato', childId, riassunto }`;
  - gestisca in background il risultato terminale con `esitoDelegaDaRisultato`, senza promuovere l'avvio a successo finale;
  - aggiorni `voceFiglia.esitoDelega` ed `evidenzaDelega` e chiami `onFiglioConclusoFn` una sola volta, anche se il callback terminale arriva prima del ritorno di `avviaESeguiFn`;
  - non lasci rejection non gestite se un callback di notifica fallisce.
- Modificare `elencaFigli(sessionPadreId)` aggiungendo solo campi reali forniti da `statisticheFiglioFn`: `parentId`, `conclusaAlle`, `ultimaAttivitaAlle`, `approvalPendingCount`, `ultimoEsito`, `motivoChiusura`, `usageSessione`, `operazioneCorrente` ed eventuale `erroreConsegnaDelega`.
- Compatibilità stabile: `contaFigliAttivi`, `analizzaEvidenzaDelega`, `esitoDelegaDaRisultato`, `esitoDelegaDaEventi`, limiti di concorrenza/profondità, eredità modello/permessi e forma dei rifiuti.

### `harness-ui/src/session-registry.mjs`

- Aggiungere la funzione interna `statisticheFiglio(voce)` per derivare stato, utilizzo e tempi soltanto da eventi/istanti reali; `null` quando non misurato.
- Aggiungere la funzione interna `operazioneAgenteDaEvento(voce, evento)` che produce categorie semantiche limitate senza argomenti, output o messaggi grezzi.
- Aggiungere la funzione interna `annunciaAgenteAgliAntenati(voce, reason, operation)` che emette verso ogni antenato:
  - `type: 'CUSTOM'`;
  - `name: 'talos.agenti'`;
  - `value: { version: 1, sessionId, parentId, childId, reason, emittedAt, agent, operation }`, dove `sessionId` è il destinatario, mentre `parentId` resta il padre diretto reale.
- Modificare `broadcast(voce, evento)` per:
  - attribuire timestamp reali agli eventi delle figlie;
  - rendere `talos.agenti` effimero come `talos.coda`;
  - propagare creazione, attività e termine a tutti gli antenati mantenendo `parentId` immediato;
  - non inoltrare raw args, output tool, testo modello o segreti.
- Aggiungere `operazioneCorrenteDaEventi(voce)` per ricostruire tool, ragionamento, risposta o approvazione ancora attivi dopo reload senza contenuto privato.
- Aggiungere la funzione interna `accodaRisultatoFiglio(...)` che inserisce il terminale reale nella FIFO canonica persistita della madre come voce `origine: 'delega'` e `childId`, distinguibile da input utente.
- Il testo canonico del risultato usa `talos.subagent-result.v1` in JSON, include il `childId`, limita il riassunto del task a 240 caratteri, marca esplicitamente l'output come non fidato ed esegue l'escape di `<`, `>` e `&`.
- Modificare `voceDiCoda`, `annunciaCoda`, `codaMessaggiFn`, `inviaDallaCoda` e il ripristino della coda per conservare `origine`/`childId` sul disco e nell'evento durevole `QueuedMessageDelivered`.
- Quando la madre è già conclusa, scrivere prima la nuova cronologia canonica e poi svuotare la coda; al ripristino riconciliare per contenuto l'eventuale finestra di crash fra le due scritture per ottenere consegna almeno una volta senza duplicazione.
- Collegare `onFiglioCreatoFn`/`onFiglioConclusoFn` alla singola istanza di `creaSubagentOrchestrator`.
- Modificare `ferma(sessionId)` soltanto quanto serve a non perdere risultati interni già persistiti; lo stop continua a mettere in pausa la FIFO e ad abortire il controller scelto.
- Compatibilità stabile: `createSessionRegistry`, `elencaFigli`, `accodaMessaggio`, `statoCoda`, `inviaDallaCoda`, `iscriviti`, `ferma`, SSE `_sequenza` e replay degli eventi durevoli.

## RED

- `harness-ui/tests/subagent-orchestrator.test.mjs` — `delegaSottoTask ritorna avviato subito e consegna il terminale separatamente`: oggi resta pending fino alla figlia.
- `harness-ui/tests/subagent-orchestrator.test.mjs` — `callback terminale sincrono prima del sessionId non perde il risultato`: oggi la sola Promise finale nasconde la separazione avvio/termine.
- `harness-ui/tests/session-registry.test.mjs` — `madre prosegue mentre la figlia è viva e il terminale entra nella FIFO canonica`: oggi `onDelega` resta pending.
- `harness-ui/tests/session-registry.test.mjs` — `talos.agenti propaga create/tool/completed fino alla radice senza raw args/output`: oggi l'evento non esiste.
- `harness-ui/tests/session-registry.test.mjs` — `risultato figlio sopravvive nel record coda con origine delega`: oggi non viene accodato.
- `harness-ui/tests/session-registry.test.mjs` — `elencaFigli espone statistiche reali e null onesti`: oggi i campi non esistono.
- `harness-ui/tests/session-registry.test.mjs` — `nipote notificata alla radice senza appiattire parentId e stop radice indipendente`: oggi non esiste propagazione live.
- `harness-ui/tests/session-registry.test.mjs` — `madre conclusa prima della figlia conserva una sola consegna canonica durevole`: oggi il terminale tardivo non raggiunge lo storico.
- `harness-ui/tests/session-registry.test.mjs` — `DELEGA RECOVERY: crash durante redirect attivo conserva una sola copia canonica`: una fotografia coda precedente al checkpoint non deve riconsegnare il risultato, mentre il checkpoint deve restare riprendibile.
- `harness-ui/tests/session-registry.test.mjs` — `DELEGA DURABILE: cronologia salvata svuota la FIFO anche se fallisce il solo evento di provenienza`: dopo il commit della cronologia, trattenere la stessa voce in memoria permetterebbe una seconda consegna manuale.
- `harness-ui/tests/session-registry.test.mjs` — `DELEGA RECOVERY: checkpoint successivo resta autorevole sui risultati già compattati`: soltanto le consegne durevoli successive alla base canonica possono colmare una finestra di crash; gli eventi precedenti non devono resuscitare contenuto rimosso o riassunto.

## GREEN e regressioni

- Focus: `node --test tests/subagent-orchestrator.test.mjs` da `harness-ui`.
- Focus: `node --test tests/session-registry.test.mjs --test-name-pattern="delega|talos.agenti|risultato figlio|elencaFigli"` da `harness-ui` (oppure filtro prima del file secondo la CLI Node installata).
- Regressione backend interessata: `node --test tests/subagent-orchestrator.test.mjs tests/session-registry.test.mjs`.
- Gate coordinato dal root: suite backend completa, build/frontend e browser. Nessun server o porta `4174` da questo lotto.
- Integrità: `git diff --check -- .claude/LEDGER-RIPRESA-AGENTI-RUNTIME-2026-09-19.md harness-ui/src/subagent-orchestrator.mjs harness-ui/src/session-registry.mjs harness-ui/tests/subagent-orchestrator.test.mjs harness-ui/tests/session-registry.test.mjs`.

Risultati freschi del 19/09/2026:

- RED osservato: i due test di ritorno immediato rispondevano `timeout-test` anziché `avviato`.
- RED osservato: `snapshotFiglio` era assente e ogni notifica ricalcolava l'elenco di tutte le sorelle.
- RED osservati: l'invio manuale duplicava l'evento conversazionale, perdeva la provenienza della delega e dichiarava l'avvio anche quando `RunRedirectRequested` non era persistibile.
- RED osservato: dopo `QueuedMessageDelivered` un crash poteva conservare una fotografia FIFO stale accanto allo stesso risultato canonico.
- RED osservato: dopo il commit della cronologia, il fallimento del solo evento di provenienza lasciava il risultato ancora inviabile nella FIFO viva.
- RED osservato: il ripristino riappendeva ogni vecchia consegna delegata anche a un checkpoint successivo che l'aveva legittimamente compattata.
- GREEN: `node --test tests/subagent-orchestrator.test.mjs` — 30/30.
- GREEN mirato: i quattro scenari `DELEGA DURABILE/RECOVERY` di persistenza, crash redirect e checkpoint autorevole — 4/4.
- Regressione del file interessato: `node --test tests/session-registry.test.mjs` — 361/361.
- Sintassi: `node --check src/session-registry.mjs` e `node --check src/subagent-orchestrator.mjs` — entrambe riuscite.

## Ricerca upstream e decisione

- WHATWG HTML Living Standard, Server-Sent Events, letto il 19/09/2026: `text/event-stream`, eventi nominati e ripresa tramite `Last-Event-ID`. Decisione: adattare sul canale SSE già esistente; `talos.agenti` è stato effimero ricostruibile dall'API e non riceve un `_sequenza` non recuperabile dal disco.
- MCP Tasks Extension draft `2026-07-28`, letto il 19/09/2026: una chiamata asincrona restituisce un task già creato con stato `working`; gli stati terminali e le notifiche sono separati; cancellazione cooperativa. Decisione: adattare il modello `accepted/working` dietro il contratto AVM esistente, senza dichiarare compatibilità MCP né aggiungere una dipendenza.
- Hermes Agent, `Delegation & Parallel Work` e `Subagent Delegation`, letti il 19/09/2026: la delega top-level torna subito, lavora in background, consegna il risultato alla conversazione più tardi e rende visibili i fallimenti; la chiusura del processo non è esecuzione durevole. Decisione: adattare direttamente la semantica, conservando i limiti AVM, la session map e la FIFO persistita già esistenti.
- Claude Code Subagents è stato cercato come secondo riferimento ufficiale; la decisione non richiede dipendenze o wire format proprietari.
- Pin upstream: nessun nuovo pacchetto. Restano le versioni bloccate in `harness-ui/package.json`, incluso `eventsource-parser@4.1.0`; il contratto interno è `talos.agenti` versione `1`.

## Prova umana e limiti

- Una madre che chiama `delega_sottotask` riceve una ricevuta di avvio e può continuare il giro; la figlia rimane visibile e operativa.
- La vista può animare creazione, attività tool/approvazione e termine tramite eventi reali; al reload ricostruisce dagli endpoint e dai record sessione.
- Il risultato terminale della figlia entra nella conversazione canonica della madre al successivo confine sicuro; se la madre ha già concluso viene aggiunto allo storico persistito senza riaprire un giro. Se la FIFO utente è stata fermata, le voci già presenti restano in pausa.
- La prova con provider reale multi-turno resta un gate separato se non sono disponibili credenziali/provider; i test non fingono tale prova.

## Cancellazione, recovery e rollback

- Stop di una figlia continua ad abortire il suo controller e il terminale viene riportato come non concluso/fallito, non come successo.
- Stop della madre conserva e mette in pausa le voci FIFO, inclusi risultati delle figlie già arrivati.
- Un riavvio non rende durevole l'esecuzione della figlia: una figlia viva diventa `interrotta`, come oggi. I risultati già entrati nella FIFO restano nel record `coda`.
- Rollback: rimuovere i callback asincroni e la propagazione `talos.agenti`, ripristinare il contratto sincrono precedente e togliere soltanto i test nominati sopra. Nessuna migrazione dati necessaria: `origine` è un campo additivo ignorabile dai lettori precedenti.

## Addendum di revisione avversariale — 19/09/2026

La lettura successiva alla prima GREEN ha trovato quattro regressioni permanenti da chiudere prima del gate coordinato:

- `harness-ui/src/session-registry.mjs` — aggiungere `codaId` al `QueuedMessageDelivered` prodotto da `codaMessaggiFn` e riconciliare in `ripristina()` una voce di delega già consegnata ma ancora presente nell'ultimo record `coda`; il risultato durevole va inoltre aggiunto una sola volta a `messaggiPendente`/`messaggiFinali` così un crash prima del terminale della madre non lo espelle dal contesto canonico.
- `harness-ui/src/session-registry.mjs` — estendere internamente `persistiCheckpointRipresa`, `resume`, `reindirizza` e il record `reindirizzamentoPendente` con `{ codaId, origine, childId }` soltanto per `inviaDallaCoda`; `RunStarted`/`RunRedirectApplied` diventano l'unica presentazione della voce inviata a mano e portano la provenienza reale della delega. `QueuedMessageDelivered` resta riservato alla consegna FIFO operata dal kernel.
- `harness-ui/src/session-registry.mjs` — in `inviaDallaCoda`, non rimuovere né dichiarare accettata la voce prima della prova durevole che la ripresa/il redirect l'ha acquisita; un `false` di scrittura sincrona restituisce `SESSION_STORE_WRITE_FAILED` e lascia la FIFO intatta. Un redirect fermato prima di `RunRedirectApplied` rimette la voce nella FIFO.
- `harness-ui/src/subagent-orchestrator.mjs` — estrarre `snapshotFiglio(sessionId)` e farlo usare sia da `elencaFigli` sia da `snapshotAgente`: un evento di una figlia calcola statistiche/attività per quella figlia una volta sola, senza scandire tutte le sorelle.

Nuovi RED permanenti:

- `harness-ui/tests/session-registry.test.mjs` — `DELEGA RECOVERY: crash dopo QueuedMessageDelivered conserva una sola consegna canonica e svuota la coda stale`.
- `harness-ui/tests/session-registry.test.mjs` — `INVIA CODA: input utente usa un solo evento conversazionale; delega conserva origine e childId su RunStarted`.
- `harness-ui/tests/session-registry.test.mjs` — `INVIA CODA: delega su madre attiva conserva provenienza su RedirectApplied e RunStarted`.
- `harness-ui/tests/session-registry.test.mjs` — `INVIA CODA: fallimento della prova durevole non avvia il redirect e non rimuove la voce`.
- `harness-ui/tests/session-registry.test.mjs` — `INVIA CODA: Stop prima dell'applicazione rimette la voce nella FIFO in pausa`.
- `harness-ui/tests/subagent-orchestrator.test.mjs` — `snapshotFiglio calcola soltanto la figlia richiesta, senza statistiche delle sorelle`.

Focused GREEN: `node --test tests/subagent-orchestrator.test.mjs`; `node --test --test-name-pattern="DELEGA RECOVERY|INVIA CODA|AGENTI LIVE|DELEGA DURABILE" tests/session-registry.test.mjs`. Regressione dei due file interessati e gate completi restano coordinati dal root. Rollback dell'addendum: rimuovere i campi opzionali `codaId`/`origine`/`childId`, `snapshotFiglio` e i quattro test nominati; i record precedenti restano leggibili perché i campi sono additivi.

### Regressioni di contratto nel gate completo ec9ef9e3
RED nominativi: TRE PROVE 1/3 e 2/3, cartella madre omessa/ripetuta, cartella con spazi, TRE DELEGHE SU TRE: atteso `concluso`, ricevuto `avviato`. Non sono attribuiti a preesistenza: cambio contrattuale intenzionale richiesto owner. Ownership aggiuntiva agent_runtime limitata a `harness-ui/tests/delega-parallelo-sequenza-cartella.test.mjs` e `harness-ui/tests/delega-percorso-e-scheda-agenti.test.mjs`. Aggiornare prove perché controllino avvio non bloccante E successiva conclusione reale nei figli, preservando workspace/permessi/modello e correlazione id. Nessuna modifica prodotto. Root possiede `harness-ui/tests/corsia2-errore-del-reindirizzamento-a-schermo.test.mjs`, test CORSIA2-ATTESA-CABLAGGIO: distinguere ramo risultato delega e ramo utente, ordine nascondi/append/mostra resta protetto anche dalle prove DOM 70/70. Ricerca/pin identici al dossier runtime e graph; GREEN tre file focused, poi intera suite backend; rollback mirato solo test. Nessun runner completo concorrente.

### Gate 5ede85e0 — teardown ricerca FIG-02
Il giro completo precedente ec9ef9e3 passa FIG-02; 5ede85e0 rileva attività asincrona dopo fine test, rename meta.json dopo rimozione della fixture. Non attribuito a preesistenza: race osservata da stabilire nel teardown. Ownership agent_runtime estesa soltanto a `harness-ui/tests/bc76-figlie-di-madre-locale.test.mjs`, helper teardown/FIG-02. Ricerca primaria: https://nodejs.org/api/test.html#extraneous-asynchronous-activity (consultata ora). Decisione: attendere la vera chiusura della risorsa nel test, primitive Node24.18.0 già fissate; nessun sleep arbitrario, nessuna soppressione unhandledRejection, nessuna cancellazione delle asserzioni anti-cloud. RED è il rapporto nominativo 5ede85e0; GREEN focused e suite completa. Rollback solo diff del test. Se richiede prodotto, fermare e riferire al root prima di editarlo.

### Review finale delle prove aggiornate
Root ha riletto i diff dei tre file di test delegati: ricevute distinte prima della conclusione, task/cartella/modello/permessi invariati, terminali verificati separatamente. La correzione FIG-02 legge `terminata` dal research-store prima della rimozione, non inghiotte rejection e non sostituisce il completamento con un ritardo fisso. GREEN focused: parallelo10, percorso11, FIG3; root corsia2 11. Fonti Node test sulle attività asincrone post-test registrate sopra. Nuovo giro completo avviato dopo congelamento dei file; aggiornare il risultato a fine run.

Il backend in memoria sulla4174 rimane quello antecedente: blocco automatico della creazione dello script di riavvio registrato nel piano operativo. Non confondere hash dei file su disco con moduli già caricati nel PID7696.

### Backend finale 1eabbc53 — 16:02 UTC
Suite completa fresca: **3899 test,3891 passati,0 falliti,8 skip**. Correzioni dei test di contratto e teardown confermate nell'insieme. Rapporto con nomi di tutti gli skip: `ripresa-2026-09-19/backend-finale-1eabbc53.json`. Skip riguardano upstream RTK non installato al pin, due fixture GGUF assenti nel banco, symlink Windows EPERM, tre corpus GET pubblici assenti e store sessione lunga assente. Nessuno skip vale come gate superato. Resta aperta attivazione backend4174 per blocco automatico già descritto; nessun riavvio effettuato.
