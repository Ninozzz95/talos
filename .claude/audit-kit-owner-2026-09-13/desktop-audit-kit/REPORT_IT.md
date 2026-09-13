# TALOS desktop: audit tecnico e confronto ingegneristico

## Esito e perimetro della verifica

**Questo documento contiene un audit documentale parziale e un kit di osservabilità testato separatamente. Non contiene un benchmark empirico di TALOS, una classifica prestazionale o patch di ottimizzazione integrate nella sua codebase.** Non sarebbe corretto presentarlo come completamento dei quattro criteri richiesti.

Il confine comprende esclusivamente il client desktop e i componenti che questo utilizza: shell, interfaccia, processi locali, tool e runtime di inferenza. Un backend condiviso resta pertinente quando opera per il desktop; eseguirlo da solo non equivale a collaudare l'applicazione. Versioni mobili, servizi autonomi, orchestrazioni cloud e interfacce web indipendenti sono esclusi. Le estensioni di IDE locali sono ammesse come concorrenti desktop, ma non assimilate a un'app autonoma.

La data di riferimento è il 13 settembre 2026. Per «ultimo mese» si considera la finestra **13 agosto-13 settembre 2026**. Una documentazione consultata oggi non dimostra che una funzione sia stata introdotta in quella finestra. La disponibilità di una funzione, inoltre, non ne dimostra la superiorità prestazionale.

| Criterio di accettazione | Esito effettivo |
|---|---|
| Almeno 10 competitor espliciti | Sì, confronto documentale di 10 superfici desktop/IDE |
| Performance reali e riproducibili dei prodotti | Non eseguite: nessuna sessione di prodotto |
| Ispezione di ogni componente della codebase desktop | Non soddisfatto: sorgente completo e SHA non acquisiti |
| Miglioramenti plug-and-play verificati contro TALOS | Non soddisfatto: consegnato un kit indipendente, non patch del prodotto |

La conclusione verificabile non è che TALOS sia lento, veloce, sicuro o meno completo dei concorrenti. È che **le evidenze raccolte non consentono ancora di assegnargli quei giudizi**.

## 1. Evidenze disponibili e impedimenti riproducibili

Sono stati accessibili la pagina principale del repository, il manifest `harness-ui/package.json` e la documentazione desktop. Non sono stati acquisiti un checkout completo, un commit immutabile, il codice del main process, il grafo delle importazioni del renderer o un artefatto Windows. Alcuni recuperi successivi dei documenti già letti non sono riusciti. I riferimenti a `main` restano perciò documentazione mutabile, non una baseline di compatibilità. <sup><a href="#s1">[1]</a></sup><sup><a href="#s2">[2]</a></sup><sup><a href="#s3">[3]</a></sup>

Gli undici tentativi registrati di clonazione riguardano TALOS e dieci repository di riferimento: Hermes, Codex CLI, Aider, Goose, OpenCode, Cline, Kilo, Zed, Roo Code e Continue. Tutti hanno restituito errore Git 128 con mancata risoluzione DNS di `github.com`. I tempi presenti nel log misurano quei tentativi falliti, **non l'avvio o la velocità dei prodotti**. Il log contiene comandi, errori, esiti e classificazione della prova: `evidence/clone-attempts.json`.

L'ambiente osservato è Linux x86_64, Node 22.16.0, Python 3.13.5, cinque CPU logiche visibili, quota cgroup equivalente a quattro CPU e limite di memoria di 4 GiB. Non sono disponibili runtime Windows/PowerShell/Wine/Electron; Chromium è presente. Non sono state fornite credenziali di inferenza per la campagna. Questi vincoli sono registrati in `evidence/environment.json`; non descrivono requisiti o difetti di TALOS.

| Misura o conteggio | Risultato | Interpretazione corretta |
|---|---:|---|
| Clonazioni registrate | 11 | Tentativi di acquisizione |
| Clonazioni riuscite | 0 | Nessuna baseline sorgente |
| Esecuzioni TALOS desktop | 0 | Performance non misurate |
| Esecuzioni desktop concorrenti | 0 | Nessun confronto empirico |
| Task agentici lunghi completati | 0 | Nessuna misura di qualità o autonomia |
| Test Node del kit superati | 68/68 | Correttezza del software consegnato, su fixture |
| Smoke test Chromium del kit | 1 superato | Sonda in pagina controllata, non in Electron/TALOS |

I risultati assenti non vengono convertiti in zeri: zero è il numero di esecuzioni, mentre latenza, throughput e consumo di TALOS sono **non misurati**. I log precedenti di tentativi di smoke test non riusciti sono conservati e spiegati nel README; il risultato finale non li cancella.

## 2. Architettura desktop: fatti e confini di inferenza

Il repository presenta TALOS come workspace locale per coding, con terminale, revisione dei file e sessioni persistenti. Le cartelle desktop e quelle condivise richiedono una successiva verifica di raggiungibilità dal client: un semplice elenco di directory non stabilisce quali moduli siano realmente caricati. <sup><a href="#s1">[1]</a></sup>

Il README desktop descrive Windows, Electron 44.3.0, Node incluso, kernel agentico, context engine e llama.cpp b10517 CPU/Vulkan; i modelli GGUF non sono inclusi. Documenta renderer isolato, backend loopback autenticato e distribuzione NSIS/ZIP. Indica che Windows 10 e una macchina senza driver Vulkan non sono ancora stati testati; distingue il fallback per perdita GPU dall'OOM, che richiede una scelta dell'utente. Sono dichiarazioni del progetto, non verifiche eseguite qui. <sup><a href="#s2">[2]</a></sup>

Il manifest consultato dichiara `node-pty`, `ws`, `eventsource-parser`, SDK provider, client MCP, keyring e librerie per documenti/archivi. Ciò giustifica verifiche mirate su terminale, trasporto, provider, strumenti e generazione di artefatti; **non dimostra** che un percorso sia attivo, sincrono, lento o correttamente isolato. Non sono attribuiti a TALOS framework UI, database, editor o algoritmi di indicizzazione non verificati. <sup><a href="#s3">[3]</a></sup>

La decomposizione da utilizzare nell'audit esecutivo è la seguente. È una **mappa di osservazione**, non un diagramma degli import reali:

```text
Interazione utente nel desktop
  -> osservatore renderer
  -> trasporto e backend utilizzati dal desktop
  -> ciclo agentico / contesto / richieste al provider
  -> strumenti locali, processi figli e runtime del modello
  -> risultati e verifica indipendente
  -> aggiornamento visibile nell'interfaccia
```

Tre separazioni sono decisive. Il tempo al primo token include un percorso diverso dal tempo alla prima visualizzazione. L'isolamento del renderer non certifica la sicurezza di shell e tool. La persistenza di una conversazione non dimostra il recupero corretto di una chiamata a tool interrotta. Sono distinzioni di metodo; non costituiscono segnalazioni di bug. Le raccomandazioni Electron sull'isolamento riguardano il relativo confine di sicurezza, non un'automatica protezione di ogni azione agentica. <sup><a href="#s24">[24]</a></sup>

## 3. Confronto con dieci alternative desktop

Nella tabella, «documentato» significa che una fonte primaria descrive la funzione. Non significa verificato in questa campagna. Tutte le celle prestazionali rimangono non misurate. Per ciascun prodotto occorre poi fissare build, modello, sistema operativo, impostazioni e driver del test.

| Prodotto e superficie ammessa | Riferimento funzionale documentato | Confronto utile con TALOS | Limite del confronto |
|---|---|---|---|
| **1. Hermes Desktop**, backend locale | File browser, terminali persistenti, revisione Git/worktree, plugin desktop | Continuità delle sessioni, navigazione e isolamento dei lavori | Documentazione, non esecuzione; gateway remoto escluso <sup><a href="#s4">[4]</a></sup> |
| **2. Codex nell'app desktop ChatGPT** | Workspace desktop e sessioni locali Codex | Supervisione, revisione, browser e ripresa delle attività | Il repository CLI non equivale al sorgente dell'intero desktop <sup><a href="#s5">[5]</a></sup><sup><a href="#s26">[26]</a></sup> |
| **3. Claude Code Desktop**, sessioni locali | Terminale, diff, preview, file, piani e task; worktree Git | Percorso modifica-verifica-revisione e isolamento delle sessioni | Non trasferire al desktop funzioni solo CLI/SDK; cloud/SSH esclusi <sup><a href="#s6">[6]</a></sup> |
| **4. Goose Desktop** | Interfaccia desktop, strumenti estendibili e ricette | Configurazione dei tool e ripetibilità dei workflow | Nessuna prestazione dedotta dal linguaggio del core <sup><a href="#s7">[7]</a></sup><sup><a href="#s31">[31]</a></sup> |
| **5. OpenCode Desktop**, beta | Client desktop e agenti build/plan | Separazione pianificazione/esecuzione e streaming | Desktop beta non significa equivalente alla TUI <sup><a href="#s8">[8]</a></sup> |
| **6. Cline in VS Code** | Modifiche con approvazione, terminale, checkpoint, MCP | Costo delle approvazioni e verificabilità del lavoro | L'IDE host fa parte del consumo desktop; CLI/cloud esclusi <sup><a href="#s9">[9]</a></sup> |
| **7. Kilo in VS Code** | Modalità di lavoro, strumenti locali e MCP | Passaggi tra analisi, modifica, debug e revisione | Superficie dell'estensione; non il servizio cloud <sup><a href="#s10">[10]</a></sup> |
| **8. Cursor Desktop**, agente locale | Agente integrato nell'editor e operazioni sul progetto | Continuità del controllo durante operazioni lunghe | Non assimilare Cloud Agents all'agente sul computer <sup><a href="#s11">[11]</a></sup><sup><a href="#s16">[16]</a></sup> |
| **9. Devin Desktop**, già Windsurf, **Devin Local** | Sessioni locali e integrazione editor/agent | Worktree, terminale, permessi e contesto dei file | Un solo concorrente, non due nomi contati separatamente <sup><a href="#s12">[12]</a></sup> |
| **10. Zed**, agente nativo | Ricerca, modifica, terminale, revisione e MCP | Interazione editor-agent e confini dei processi | Un agente esterno ACP va dichiarato come combinazione distinta <sup><a href="#s13">[13]</a></sup><sup><a href="#s14">[14]</a></sup><sup><a href="#s30">[30]</a></sup> |

### 3.1 Cosa confrontare, senza inventare una graduatoria

**Hermes e Claude Code Desktop** offrono riferimenti concreti per verificare se navigare tra sessioni, chiudere un pannello o creare un lavoro isolato preservi correttamente lo stato. La domanda per TALOS non è quante schede possieda, ma se il medesimo compito mantenga risultati, processi e controllo utente nelle transizioni. Il confronto rimane da eseguire; le funzioni dei concorrenti provengono dalle rispettive guide. <sup><a href="#s4">[4]</a></sup><sup><a href="#s6">[6]</a></sup>

**Goose, Cline e Kilo** sono riferimenti per la superficie dei tool. Il numero di integrazioni non è una misura di efficienza: una campagna deve identificare i tool effettivamente abilitati, separare scoperta e invocazione, conservare esiti e autorizzazioni e contabilizzare gli errori. Confrontare un sistema con conferme attive e un altro con approvazioni disabilitate non isola l'overhead dell'harness. <sup><a href="#s7">[7]</a></sup><sup><a href="#s9">[9]</a></sup><sup><a href="#s10">[10]</a></sup>

**Zed e gli agenti ACP** richiedono particolare attenzione alla composizione: l'editor può ospitare un agente esterno con processo, configurazione e autenticazione propri. Un risultato ottenuto con tale combinazione non è automaticamente una misura dell'agente nativo di Zed. Analogamente, avviare Codex CLI da un terminale non misura l'app desktop Codex. <sup><a href="#s13">[13]</a></sup><sup><a href="#s30">[30]</a></sup><sup><a href="#s26">[26]</a></sup>

### 3.2 Aider, DeepSeek e riferimenti storici

Aider è pertinente come riferimento locale **CLI**, in particolare per la repository map; non viene usato per completare artificialmente il numero di desktop confrontati. La sua mappa dei simboli offre un criterio progettuale da discutere soltanto dopo avere misurato la selezione del contesto di TALOS. Il codice di Aider non è stato acquisito o eseguito. <sup><a href="#s18">[18]</a></sup><sup><a href="#s28">[28]</a></sup>

DeepSeek-V3 è un riferimento di modello e implementazione relativa, non un client desktop equivalente. Un eventuale modello DeepSeek potrebbe essere una variabile controllata della campagna, ma non un undicesimo harness: servirebbero identità dei pesi, quantizzazione, runtime e configurazione esatta. Nessun modello è stato scaricato o usato qui. <sup><a href="#s19">[19]</a></sup>

Roo Code risulta archiviato dal proprietario il **15 maggio 2026**. Il README di Continue dichiara che il progetto non è più mantenuto attivamente e che il repository è in sola lettura. Sono utili riferimenti storici, non prova di leadership attiva nell'ultimo mese. I loro tentativi di clonazione sono documentati separatamente. <sup><a href="#s20">[20]</a></sup><sup><a href="#s21">[21]</a></sup>

## 4. Stato dell'arte nell'ultimo mese: evidenza realmente datata

| Data della voce ufficiale | Cambiamento rilevante | Ambito e cautela |
|---|---|---|
| **19 agosto 2026**, Cursor | Steering che attende il successivo tool call invece di interrompere l'azione; descrizione di `/goal` | La voce mescola harness e cloud: il comportamento e la disponibilità nella specifica build locale restano da verificare <sup><a href="#s16">[16]</a></sup> |
| **20 agosto 2026**, Codex | Snapshot in sola lettura di thread locali condivisibili dall'app macOS | Funzione di supervisione, non dato di velocità; non generalizzare a Windows <sup><a href="#s15">[15]</a></sup> |
| **25 agosto 2026**, Codex nell'app desktop | Site tools/WebMCP nel browser integrato, con condizioni di modello/workspace | Riferimento per il confine browser-tool; non un benchmark del browser <sup><a href="#s15">[15]</a></sup> |

Le novità cloud di Cursor e quelle web/mobile della documentazione OpenAI sono escluse dall'inferenza sulle capacità locali. Questo limita deliberatamente l'ampiezza delle affermazioni sull'ultimo mese.

Il changelog OpenCode consultato descrive a inizio agosto lo spostamento del parsing Markdown fuori dal main thread e correzioni del composer. Il **4 agosto 2026** è però fuori dalla finestra richiesta: è un precedente progettuale, non una novità dell'ultimo mese, e non contiene una misura trasferibile a TALOS. Per gli altri concorrenti la documentazione funzionale non basta a certificare una release recente; la copertura temporale resta incompleta. <sup><a href="#s17">[17]</a></sup>

La rinomina Windsurf in Devin Desktop è datata **2 giugno 2026**; la ricostruzione di Kilo per VS Code su core OpenCode è documentata il **2 aprile 2026**. Entrambe servono a evitare confronti nominalmente obsoleti o doppi conteggi, non a simulare novità di settembre. <sup><a href="#s12">[12]</a></sup><sup><a href="#s29">[29]</a></sup>

## 5. Copertura componente per componente

**Questa è una matrice di verifica funzionale, non l'inventario esaustivo dei moduli reali.** «Non verificato» non significa assente o difettoso. Le righe ripartiscono anche funzioni potenziali richieste dall'ambito, senza affermare che esistano come moduli separati.

| Componente / confine | Evidenza TALOS disponibile | Verifica necessaria e metrica | Riferimento comparativo |
|---|---|---|---|
| Packaging, avvio, chiusura | Documentazione desktop, non build eseguita <sup><a href="#s2">[2]</a></sup> | Artefatto fissato, avvio freddo/caldo, arresto dei processi figli | Hermes, Goose |
| Shell e renderer | Isolamento dichiarato, codice non verificato <sup><a href="#s2">[2]</a></sup> | Processi, listener, focus, sospensione; gap rAF e Long Tasks | Codex, Claude Desktop |
| Trasporto backend | `ws` e parser eventi dichiarati <sup><a href="#s3">[3]</a></sup> | Richieste correlate, buffering, disconnessioni, byte e ritardi | OpenCode |
| Ciclo agentico | Kernel citato nella documentazione <sup><a href="#s2">[2]</a></sup> | Stato di ogni task, retry, step conclusi, risultati verificati | Cursor, Claude Desktop |
| Streaming e decoding visibile | Implementazione non ispezionata | Richiesta, primo token ricevuto, primo token mostrato, interruzione | OpenCode, Cursor |
| Provider e autenticazione | SDK provider dichiarati <sup><a href="#s3">[3]</a></sup> | Configurazione fissata, errori, timeout, cambio provider | Kilo, Cline |
| Inferenza locale | Runtime descritto, non eseguito <sup><a href="#s2">[2]</a></sup> | Identità modello, contatori nativi, CPU/GPU, errori | Goose, Hermes |
| Contesto e compattazione | Context engine citato <sup><a href="#s2">[2]</a></sup> | Evidenze recuperate, budget, ripresa dopo compattazione | Zed; Aider solo progettuale |
| Sessioni persistenti | Descritte dal progetto <sup><a href="#s1">[1]</a></sup> | Ripartenza dopo chiusura/crash, perdita o duplicazione di stato | Hermes, Codex |
| Terminale e PTY | `node-pty` dichiarato <sup><a href="#s3">[3]</a></sup> | Input-output, resize, Unicode, EOF, cancellazione, processi orfani | Hermes, Claude Desktop |
| File explorer | UI e percorsi non verificati | Albero ampio, rename, esclusioni, selezione, latenza osservata | Hermes, Cline |
| Watcher del filesystem | Strategia menzionata nel manifest, non misurata <sup><a href="#s3">[3]</a></sup> | Sequenze create/rename/delete, coerenza finale, lavoro ripetuto | Editor locali concorrenti |
| Editor, diff e Git | File review descritta, componenti ignoti <sup><a href="#s1">[1]</a></sup> | Diff fedele, checkpoint, modifiche concorrenti e worktree | Cline, Hermes, Zed |
| Browser integrato / preview | Presenza e implementazione non stabilite | Distinguere preview, browser esterno, browser automatizzato; fixture localhost | Claude Desktop, Codex |
| Note | Modulo, formato e persistenza non verificati | Salvataggio, isolamento progetto, ricerca, export, riavvio | Confronto solo dopo equivalenza funzionale |
| Libreria di conoscenza | Indicizzazione e retrieval non verificati | Provenienza, aggiornamento, rimozione, risultati obsoleti | Memoria/skills Hermes, con semantiche distinte |
| Librerie per artefatti | Dipendenze documentali/archivi dichiarate <sup><a href="#s3">[3]</a></sup> | Percorsi raggiungibili, output valido, carico su thread e memoria | Preview/artefatti desktop, non mero conteggio formati |
| MCP e tool esterni | Client MCP dichiarato <sup><a href="#s3">[3]</a></sup> | Discovery, esecuzione, timeout, retry, permessi, output voluminosi | Goose, Cline, Kilo, Zed |
| Permessi ed effetti esterni | Policy dei tool non ispezionata | Coerenza conferme, revoca, cancellazione, azioni non reversibili | Claude Desktop, Cline |
| Segreti e profili | Keyring dichiarato <sup><a href="#s3">[3]</a></sup> | Propagazione ai figli, redazione log, isolamento e revoca | Hermes, Devin Local |
| Download e fallback runtime | Procedure documentate, non provate <sup><a href="#s2">[2]</a></sup> | Interruzione/ripresa, integrità, rollback, errore esplicito | Onboarding desktop concorrenti |
| Test, CI e release | Script/guide disponibili, esiti non acquisiti <sup><a href="#s2">[2]</a></sup><sup><a href="#s3">[3]</a></sup> | Test su Windows, installer, log, hash, regressioni | Qualsiasi confronto con build riproducibile |

### 5.1 Terminale, file explorer e browser

Il terminale deve essere osservato sia come processo/PTY sia come pannello grafico: vedere rapidamente il testo non dimostra che la cancellazione abbia terminato il processo. Il risultato corretto di un task richiede il codice di uscita e la verifica degli artefatti, non soltanto la comparsa di una risposta in chat.

Per il file explorer va fissato un manifest della fixture: numero e struttura dei file, contenuti, directory escluse e sequenza di mutazioni. Dopo ogni operazione serve un confronto con lo stato effettivo del filesystem. Un albero visivamente aggiornato ma incompleto è un errore funzionale, non una vittoria di velocità.

Per il browser non si attribuisce a TALOS una funzione non letta nel codice. Un collegamento che apre un browser esterno, una preview HTML e un browser controllabile dal modello sono tre oggetti diversi. La prova utile, quando la funzione è confermata, utilizza un'applicazione locale controllata, operazioni note e un verificatore DOM indipendente; evita account e dati reali.

### 5.2 Note, librerie e persistenza

Il termine «librerie» va distinto tra dipendenze software, raccolta di documenti e memoria utilizzata dall'agente. Una lista di pacchetti non prova la presenza di una libreria di conoscenza. Una nota persistita non prova che venga recuperata correttamente nel contesto del modello.

La verifica deve includere aggiornamento, cancellazione e riapertura del progetto, non solo l'inserimento iniziale. Le risposte dell'agente vanno confrontate con fatti presenti o rimossi dalla fixture. Senza accesso ai moduli reali non vengono inventati schemi SQLite, endpoint, tabelle o callback da modificare.

### 5.3 Task lunghi e intervento umano

Un task lungo non coincide con un timeout alto. Il protocollo deve verificare obiettivi intermedi, cambiamenti su più file, ripresa dopo compattazione, gestione degli errori, eventuale riavvio e accettazione di istruzioni correttive. Le azioni non idempotenti non possono essere considerate sicure soltanto perché la conversazione è stata salvata.

Per misurare il costo dell'intervento umano occorrono istanti separati: richiesta di approvazione, risposta dell'operatore, ripartenza dell'agente. Senza queste osservazioni, attribuire tutto il tempo trascorso al backend sarebbe scorretto. Nessuna campagna di questo tipo è stata eseguita nel presente audit.

## 6. Protocollo empirico pronto da completare, non risultati simulati

### 6.1 Identità della prova

Ogni run deve fissare SHA del sorgente o hash del binario desktop, identità del modello/provider, impostazioni di generazione, fixture con commit, comando di verifica, hardware/driver, policy dei tool e stato iniziale del profilo. Il manifesto `protocol/campaign.json` lascia volutamente vuoti i dati mancanti e indica `NOT_EXECUTED`. Non contiene driver UI fittizi o comandi di lancio presunti.

Servono due campagne distinte: una a **modello e condizioni comuni**, quando i prodotti lo consentono, per isolare l'harness; l'altra con la **configurazione nativa di ciascun prodotto**, che confronta l'esperienza complessiva. I risultati non sono intercambiabili. Un prodotto che non accetta il modello comune va marcato non confrontabile in quella campagna, non sostituito dalla propria CLI.

Le prove vanno eseguite sul medesimo host Windows per TALOS e le alternative compatibili. Il benchmark deve specificare se include il runtime del modello e i processi dell'IDE. Warm-up, cache e ordine dei run devono essere documentati prima di raccogliere risultati. Fallimenti, cancellazioni e timeout restano nel dataset.

### 6.2 Metriche e punti di osservazione

| Metrica | Definizione operativa | Cosa non dimostra |
|---|---|---|
| Primo token ricevuto | Primo token osservato meno partenza della richiesta, sullo stesso clock | Non separa da sola rete, provider e inferenza |
| Prima visualizzazione | Primo token mostrato meno invio utente | Non equivale al tempo del backend |
| Ritardo ingest-render | Visualizzazione meno ingest dello stesso token/richiesta | Richiede correlazione e osservazione affidabili |
| Durata tool | Fine meno inizio per `tool_call_id`, con esito | Non isola dispatcher da lavoro esterno |
| Cancellazione effettiva | Quiescenza verificata meno richiesta di stop | Non basta l'aggiornamento del pulsante |
| Task completato | Verificatore indipendente superato meno invio | La frase «finito» dell'agente non vale come prova |
| RSS / CPU di processo | Contatori per PID e istante | Un singolo Node non è l'intero desktop <sup><a href="#s23">[23]</a></sup> |
| Event loop | Distribuzione del ritardo del loop Node | Non è latenza HTTP o durata del modello <sup><a href="#s22">[22]</a></sup> |
| Fluidità osservata | Gap fra callback rAF e Long Tasks visibili | Non è un contatore diretto di FPS o frame persi <sup><a href="#s25">[25]</a></sup> |
| Token/s | Token effettivi da contatori affidabili e durata definita | Byte, chunk SSE e caratteri non sono token |

Clock monotoni distinti non si sottraggono direttamente. Il formato consegnato usa un singolo clock di osservazione per traccia; rifiuta ID diversi. La cattura su più processi deve convergere a un osservatore comune oppure introdurre una calibrazione esplicita, non presente nel kit. Le marcature manuali sono esplorative e includono ritardo umano; non sono una base adeguata per graduatorie di latenza.

La sonda Node misura il suo processo. Per l'intero desktop occorre acquisire l'albero dei processi e una definizione coerente di memoria condivisa/privata: sommare indiscriminatamente RSS non produce automaticamente memoria fisica univoca. La memoria del modello locale deve essere dichiarata separatamente o inclusa in modo identico per tutti i prodotti. <sup><a href="#s23">[23]</a></sup>

### 6.3 Famiglie di task e verificatori

Le fixture devono essere versionate prima dei run. Una famiglia copre un refactoring multi-file con test e migrazione di API; un'altra una regressione che richiede diagnosi, modifica e test; una terza la continuità del contesto con requisiti introdotti all'inizio e verificati dopo molti passaggi. Una quarta riguarda stop, riavvio e ricostruzione dello stato senza ripetere effetti esterni. Una quinta esercita terminale, file explorer e preview locale.

Per ogni fixture servono test nascosti o comunque indipendenti dalle dichiarazioni dell'agente, verifica del diff finale, conteggio degli interventi e registrazione delle condizioni di termine. Il pacchetto **non include fixture agentiche complete né un runner comparativo end-to-end**: include il contratto da completare quando saranno disponibili le build. I task fittizi dei test unitari non devono mai essere riutilizzati come evidenza di qualità del coding.

Le distribuzioni devono conservare campioni grezzi, numero di osservazioni e fallimenti. I percentili del kit sono descrittivi con interpolazione lineare; non costituiscono test di significatività. Nessun miglioramento percentuale può essere dichiarato senza coppie prima/dopo sulla stessa baseline e controllo delle regressioni funzionali.

## 7. Software effettivamente consegnato

Il pacchetto `desktop-audit-kit` è autonomo e non sovrascrive file TALOS. Le API seguenti sono **API nuove del kit**, non punti di estensione attribuiti al repository.

| File / API | Funzione concreta | Limite esplicito |
|---|---|---|
| `lib/inventory.mjs`: `inventory`, `assertPinnedClean` | Hash SHA-256, identità Git, stato dei percorsi selezionati; rifiuto di SHA non completo, mismatch e inventario incompleto | Non dimostra build o raggiungibilità runtime |
| `lib/trace.mjs`: `analyseTrace` | Controlla clock, run, richieste, tool, esiti e causalità delle coppie misurate | Analizza dati forniti; non avvia l'agente e non certifica l'origine |
| `lib/statistics.mjs`: `summarize` | Campioni validati, mediana, p95/p99 e null su dati assenti | Nessuna inferenza statistica o graduatoria |
| `probes/node-probe.mjs`: `startNodeProbe` | CPU/RSS/event loop, output NDJSON e coda limitata con perdite contabilizzate | Un processo; overhead della sonda non quantificato |
| `probes/node-preload.mjs` | Attivazione esplicita in un processo Node verificato, senza cambiare signal handler o policy | Entrypoint Electron/TALOS non certificato |
| `probes/renderer-probe.js` | Buffer limitati, rAF, Long Tasks, marker manuali e cleanup | Solo DevTools già consentiti; nessuna cattura automatica del token |
| `tools/*.mjs` | CLI per inventario e analisi; output esclusivo senza sovrascrittura | Non sono driver del desktop |
| `tests/` | 68 test Node e smoke test Chromium indipendente | Non eseguono modelli, TALOS o competitor |

La sonda renderer mantiene un numero limitato di osservazioni e rende visibili quelle sovrascritte. La sonda Node limita la coda di scrittura e contabilizza i campioni persi. Queste sono proprietà implementate e testate del **kit**, non ottimizzazioni misurate della UI di TALOS.

Il validatore non fabbrica throughput, RAM complessiva o qualità: quei campi restano `null`. Le fixture sono etichettate come tali e non possono essere riclassificate come tracce desktop attraverso le combinazioni di metadati accettate. Questo protegge da errori di classificazione accidentali, non da un operatore che falsifichi deliberatamente i dati. La verifica del task resta un'asserzione dell'osservatore: occorre archiviare anche il log del verificatore.

### 7.1 Risultati dei test del kit

L'esecuzione finale `node --test tests/*.test.mjs` ha prodotto **68 test superati, zero falliti, zero saltati**. Il test browser finale ha eseguito la sonda in Chromium 144.0.7559.96 su una pagina controllata e ha superato i controlli di lifecycle, marker e osservazioni rAF. I relativi file sono `evidence/node-tests.tap` e `evidence/browser-smoke.json`.

Durante il collaudo, la mancanza di `crypto.randomUUID` in un contesto browser non sicuro ha fatto fallire una prova. La sonda ora usa anche identificatori casuali tramite `getRandomValues`, e un test di regressione copre quel ramo. Tentativi iniziali con `--dump-dom` non hanno prodotto una pagina; una navigazione `file:` è stata bloccata dalla policy del browser. La prova finale usa una pagina vuota controllata, senza leggere risorse bloccate. Nessuna policy amministrativa è stata disattivata.

Solo il Chromium temporaneo della fixture, eseguito come root nel container isolato, utilizza `--no-sandbox`. **Questo flag non deve essere trasferito a TALOS o a una sessione di navigazione reale.** Lo smoke test non valida la sandbox Electron o l'integrazione del renderer del prodotto.

### 7.2 Integrazione e rollback

Il kit può essere estratto fuori dal repository e i test Node non richiedono dipendenze npm aggiuntive. L'inventario opera in lettura sul repository indicato. Il backend e il renderer del prodotto rimangono invariati fino a un'esplicita integrazione, che non è stata eseguita.

Per usare la sonda sul backend del desktop occorre prima verificare l'entrypoint, il runtime Node effettivo e il lifecycle. Non viene fornito un comando che avvii arbitrariamente `server.mjs` e lo presenti come benchmark desktop. Non viene suggerito di impostare globalmente `NODE_OPTIONS` o aprire porte di remote debugging. La sonda renderer richiede DevTools già consentiti: non modifica sandbox, preload, navigazione o autenticazione.

Il rollback della sola osservabilità consiste nell'interrompere la sonda/rimuovere l'import aggiunto e riavviare il processo o renderer interessato. I log restano nella cartella esplicita scelta dall'operatore. Non sono richieste migrazioni dati, ma non viene promessa compatibilità con una build TALOS mai acquisita.

## 8. Ottimizzazioni: decisioni ammissibili e condizioni di accettazione

Non è possibile indicare responsabilmente un collo di bottiglia specifico senza profilo e codice. Non si prescrivono cache, parallelismo, worker Markdown o sostituzioni del terminale come rimedi a problemi non osservati. La sola presenza di un'implementazione simile in un concorrente non dimostra che la stessa modifica migliori TALOS.

La sequenza tecnica applicabile è: fissare la baseline; riprodurre un carico desktop; raccogliere tracce corrette; identificare il percorso responsabile; applicare una modifica minima; ripetere le stesse prove con verificatore invariato. I risultati devono mostrare sia la metrica migliorata sia assenza di regressioni su integrità del testo, ordinamento degli eventi, cancellazione, memoria e output finale.

Per eventuali modifiche al renderer servono prove su UTF-8 spezzato fra chunk, blocchi di codice incompleti, scroll e fine streaming. Per eventuali modifiche ai tool servono errori, timeout, retry e operazioni non idempotenti. Per eventuali modifiche al retrieval serve confrontare la qualità dei risultati, non soltanto ridurre il tempo di ricerca. Sono **condizioni di verifica**, non ipotesi di guadagno o patch già pronte.

Un pacchetto di ottimizzazione realmente accettabile dovrà indicare SHA base, file modificati, diff applicabile, build Windows, esiti dei test desktop, metriche prima/dopo, istruzioni di rollback e hash degli artefatti. In assenza di questi elementi, apporre la dicitura «plug-and-play» nasconderebbe proprio il rischio di incompatibilità che il criterio di accettazione intende evitare.

## 9. Conclusione operativa

Sono disponibili un confronto documentale con dieci alternative desktop, una matrice di copertura di 22 aree, un protocollo di misura, sorgenti di osservabilità e prove riproducibili del kit. Non sono disponibili una baseline TALOS eseguibile, risultati comparativi agentici o patch integrate e misurate.

Le condizioni mancanti per soddisfare il mandato originale sono concrete: sorgente desktop completo a SHA fissato, build/ambiente Windows compatibile, modelli e autorizzazioni di prova, fixture agentiche versionate e driver verificati per ciascun client. Il pacchetto non sostituisce tali condizioni e non afferma che siano già soddisfatte.

## Fonti

Le fonti seguenti sono primarie. La data di consultazione è il 13 settembre 2026; per i documenti senza data di pubblicazione non viene inventata una data di rilascio. Le evidenze locali sono nei file `evidence/` e descrivono esclusivamente le operazioni realmente eseguite.

1. <a id="s1"></a>**Ninozzz95**. [TALOS: repository e README principale](https://github.com/Ninozzz95/talos). main non fissato; descrizione del workspace.

2. <a id="s2"></a>**Ninozzz95**. [TALOS: documentazione desktop](https://raw.githubusercontent.com/Ninozzz95/talos/main/harness-ui/desktop/README.md). main non fissato; documento letto, recuperi successivi non riusciti.

3. <a id="s3"></a>**Ninozzz95**. [TALOS: manifest harness-ui](https://raw.githubusercontent.com/Ninozzz95/talos/main/harness-ui/package.json). main non fissato; dipendenze dichiarate, non grafo runtime.

4. <a id="s4"></a>**Nous Research**. [Hermes: Desktop App](https://hermes-agent.nousresearch.com/docs/user-guide/desktop/). documentazione corrente; data di introduzione delle singole funzioni non stabilita.

5. <a id="s5"></a>**OpenAI**. [Codex: applicazione desktop](https://learn.chatgpt.com/docs/app). documentazione corrente; accesso dal precedente percorso developers.openai.com/codex/app.

6. <a id="s6"></a>**Anthropic**. [Claude Code: Desktop application](https://code.claude.com/docs/en/desktop). solo sessioni locali; cloud e SSH esclusi.

7. <a id="s7"></a>**Goose / AAIF**. [Goose: sito ufficiale](https://block.github.io/goose/index.html). superficie desktop; non eseguita.

8. <a id="s8"></a>**Anomaly**. [OpenCode: repository](https://github.com/anomalyco/opencode). desktop beta; sorgente non acquisito nel container.

9. <a id="s9"></a>**Cline**. [Cline: repository](https://github.com/cline/cline). estensione VS Code; non CLI, cloud o altri prodotti.

10. <a id="s10"></a>**Kilo**. [Kilo: repository](https://github.com/Kilo-Org/kilocode). estensione VS Code locale.

11. <a id="s11"></a>**Cursor**. [Cursor: Agent overview](https://cursor.com/docs/agent/overview). agente locale nel client desktop.

12. <a id="s12"></a>**Cognition**. [Devin Desktop: changelog](https://docs.devin.ai/desktop/changelog). rinomina Windsurf del 2 giugno 2026; solo Devin Local.

13. <a id="s13"></a>**Zed Industries**. [Zed: agenti](https://zed.dev/docs/ai/agents). agente nativo, agenti ACP e terminal threads sono distinti.

14. <a id="s14"></a>**Zed Industries**. [Zed Agent](https://zed.dev/docs/ai/zed-agent). funzioni documentate dell'agente nativo.

15. <a id="s15"></a>**OpenAI**. [ChatGPT & Codex changelog](https://learn.chatgpt.com/docs/changelog). voci desktop del 20 e 25 agosto 2026; non trasferire novita CLI/mobile al desktop.

16. <a id="s16"></a>**Cursor**. [Cursor changelog](https://cursor.com/changelog). 19 agosto 2026: harness e cloud descritti insieme; distinguere le superfici.

17. <a id="s17"></a>**Anomaly**. [OpenCode changelog](https://opencode.ai/changelog). snapshot consultato con voci di inizio agosto: fuori finestra 13 agosto-13 settembre.

18. <a id="s18"></a>**Aider**. [Aider: repository map](https://aider.chat/docs/repomap.html). riferimento progettuale CLI, non decimo client desktop.

19. <a id="s19"></a>**DeepSeek**. [DeepSeek-V3: repository](https://github.com/deepseek-ai/DeepSeek-V3). modello e codice relativo; non un harness desktop equivalente.

20. <a id="s20"></a>**Roo Code**. [Roo Code: repository](https://github.com/RooCodeInc/Roo-Code). archiviato dal proprietario il 15 maggio 2026.

21. <a id="s21"></a>**Continue**. [Continue: repository](https://github.com/continuedev/continue). README: non piu mantenuto attivamente, repository in sola lettura.

22. <a id="s22"></a>**Node.js**. [Node.js: Performance measurement APIs](https://nodejs.org/api/perf_hooks.html). semantica di event-loop monitoring; kit eseguito con Node 22.16.0.

23. <a id="s23"></a>**Node.js**. [Node.js: Process](https://nodejs.org/api/process.html). RSS e CPU di processo; non intero albero Electron.

24. <a id="s24"></a>**Electron**. [Electron: Security](https://www.electronjs.org/docs/latest/tutorial/security). isolamento renderer e sandbox.

25. <a id="s25"></a>**W3C**. [Long Tasks API](https://www.w3.org/TR/longtasks-1/). Long Tasks non equivale a misurare FPS.

26. <a id="s26"></a>**OpenAI**. [Codex: repository open source](https://github.com/openai/codex). codice CLI; non prova di disponibilita dell'intera app desktop.

27. <a id="s27"></a>**Nous Research**. [Hermes Agent: repository](https://github.com/NousResearch/hermes-agent). tentata clonazione del repository ufficiale.

28. <a id="s28"></a>**Aider**. [Aider: repository](https://github.com/Aider-AI/aider). tentata clonazione; strumento locale a terminale.

29. <a id="s29"></a>**Kilo**. [The new Kilo for VS Code is live](https://blog.kilo.ai/p/new-kilo-for-vs-code-is-live). 2 aprile 2026; riferimento architetturale storico.

30. <a id="s30"></a>**Zed Industries**. [Zed: external agents](https://zed.dev/docs/ai/external-agents). agenti esterni con processi e configurazioni separati.

31. <a id="s31"></a>**Goose / AAIF**. [Goose: repository ufficiale corrente](https://github.com/aaif-goose/goose). tentata clonazione; nessuna esecuzione desktop.

