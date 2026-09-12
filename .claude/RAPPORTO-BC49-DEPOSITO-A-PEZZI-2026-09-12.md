# BC-49 — deposito del rapporto a parti

Data di lavoro: 12/09/2026. Astra/Codex. Rapporto in `harness-ui/.claude/`: la `.claude/` alla radice è fuori dalle radici scrivibili della sessione. Nessun comando di staging, commit o pubblicazione autorizzato o eseguito.

**Esito: implementazione verificata localmente, BC-49 non chiudibile sul requisito della prova vera.** 580 test verdi; il tentativo con `z-ai/glm-5.3-flash` ha ricevuto HTTP 401 prima del primo token e prima della nascita della figlia. Tetto dei byte implementato, taratura temporale sul fornitore ancora mancante. Entrambe le porte del banco sono chiuse.

## Ricerca prima del codice

Fonti primarie consultate il 12/09/2026; la data di consultazione non è una data di pubblicazione.

1. **Hermes per primo.** [Classificatore](https://github.com/NousResearch/hermes-agent/blob/365e2835d490a053d076daa3b429371d6f35210f/agent/error_classifier.py), commit del clone locale verificato `365e2835d490a053d076daa3b429371d6f35210f`, recuperato anche dal server GitHub: distingue la chiusura durante il ragionamento dall'esaurimento del contesto; non consiglia di comprimere la storia per quella chiusura. [Attrezzi file allo stesso pin](https://github.com/NousResearch/hermes-agent/blob/365e2835d490a053d076daa3b429371d6f35210f/tools/file_tools.py): scrittura completa e modifiche mirate; ricevuta con verifica dell'impronta sul disco. **Non vi ho trovato un protocollo di deposito del rapporto in append**: non attribuisco a Hermes una funzione non verificata. La [configurazione corrente](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) documenta inoltre lo scarico dei risultati voluminosi su disco e un riferimento con anteprima nel contesto. È gestione dei risultati degli attrezzi, distinta dalla generazione degli argomenti.
2. [Anthropic, sistema di ricerca multiagente](https://www.anthropic.com/engineering/multi-agent-research-system), articolo del 13/06/2025: gli agenti possono persistere artefatti esterni e restituire riferimenti brevi; il recupero usa checkpoint e riprese invece di rifare l'intera ricerca. Adatto il principio al giornale già posseduto da AVM.
3. [LangChain Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview): filesystem con backend sostituibili, persistenza e runtime LangGraph. Valutato e scartato come nuova dipendenza per questa correzione: sostituirebbe ciclo agente e persistenza esistenti; non implementa il contratto `research_deposit` né L9.
4. [OpenRouter, streaming](https://openrouter.ai/docs/api_reference/streaming): commenti SSE per mantenere la connessione; gli errori dopo le intestazioni restano dentro uno stream HTTP 200. La pagina non pubblica una soglia numerica universale di inattività. **Misura/documentazione del timeout specifico OpenRouter → Z.ai mancante.**
5. [Z.ai, Chat Completion](https://docs.z.ai/api-reference/llm/chat-completion): `max_tokens` fino a 131.072 per la famiglia dichiarata; `tool_stream` predefinito falso. [Streaming degli attrezzi](https://docs.z.ai/guides/tools/stream-tool): frammenti degli argomenti da ricomporre sul client; non sono checkpoint applicativi già eseguiti. Il ragionamento di GLM-5.3-Flash rimane abilitato, con livelli low/high/max. Nessuna soglia numerica di inattività trovata in queste pagine né nella [guida HTTP](https://docs.z.ai/guides/develop/http/introduction). Non confondo il limite di token con byte o secondi.
6. [Catalogo pubblico OpenRouter del modello](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints), risposta acquisita il 12/09: modello `z-ai/glm-5.3-flash`, endpoint versionati `20260826`, massimo di completamento 131.072 token negli endpoint ispezionati. Non è un limite di byte della risposta HTTP né prova del fornitore effettivamente scelto in una corsa.

Approfondimento del dossier durante la revisione: [Hermes, llm-wiki allo stesso pin](https://github.com/NousResearch/hermes-agent/blob/365e2835d490a053d076daa3b429371d6f35210f/skills/research/llm-wiki/SKILL.md), verificato sia localmente sia via GitHub il 12/09: organizza risultati persistenti in pagine Markdown, indice e giornale, e archivia confronti e sintesi sostanziali. È una pratica concreta di produzione di artefatti durevoli; non stabilisce un tetto di byte per gli argomenti né una garanzia temporale sul modello.

Decisione upstream: **adattare** checkpoint, artefatti e ricevute dietro il contratto AVM; riutilizzare `accodaEvento`, `scriviRapporto`, L9 e il trasporto esistenti. Non importare Hermes o LangGraph come secondo motore. Non modificare il protocollo di trasporto condiviso per simulare checkpoint su JSON incompleto. Pin di riferimento Hermes sopra; nessuna nuova dipendenza da installare.

## Registro di esecuzione prima delle modifiche

Sottosistema posseduto: orchestrazione backend della ricerca, con adattamento minimo al kernel condiviso. Nessun lavoro delegato; nessun altro file di prodotto posseduto.

File esatti previsti:

- Modifica `src/research-orchestrator.mjs`: `componiRapporto` resta il metodo pubblico; estrazione privata `verificaEComponiRapporto` senza cambiare L9; `promptRicerca`, `consegnaDiRipresa`, `riprendi`, `riprendiDaSolaUnaVolta` ricevono istruzioni e progresso delle parti. `componiRapportoRicerca` resta stabile.
- Modifica `src/research-store.mjs`: opzioni additive `separaRiga` per `accodaEvento`, `rigoroso` per `leggiGiornale`. Impediscono che una coda JSON mozzata mangi la prima parte dopo la ripresa e che un errore di lettura sia interpretato come giornale vuoto. Default precedenti invariati.
- Creazione `src/research/deposito-a-pezzi.mjs`: `LIMITE_PARTE_RAPPORTO_BYTE`, `rileggiPartiRapporto`, `depositaParteRapporto`, `consegnaPartiRapporto`. Contratto v1: solo argomento opzionale `parte:{indice,ultima}`. Eventi `deposit_part` e `deposit_finished`.
- Modifica minima `src/kernel/talosHarness.mjs`: proprietà opzionale nello schema esistente; passaggio tramite `componiRapportoRicercaFn`; ricevuta delle parti senza pubblicare un rapporto incompleto; controllo del permesso prima della chiamata che ora può scrivere. Nessun import da `src/research/`. Tutti gli altri nomi e campi restano stabili.
- Creazione `tests/ricerca-deposito-a-pezzi.test.mjs`: ordine/equivalenza, ripetizioni, conflitti, parti mancanti, ripresa con/senza conversazione, JSON mozzato, fallimento scrittura, permessi, Unicode e limiti, finalizzazione e L9, compatibilità del deposito unico e inventario TALOS-BANCO.
- Questo rapporto. Eventuali script ed evidenze del banco saranno in una directory temporanea dedicata, con elenco preciso nel consuntivo.

RED: il nuovo test deve fallire prima del prodotto perché modulo/contratto delle parti assenti. GREEN: `node --test tests/ricerca-deposito-a-pezzi.test.mjs`. Regressioni: i cinque file richiesti dall'owner, più `tests/ricerca-deposito-strutturato.test.mjs`, `tests/research-store.test.mjs`, `tests/research/*.test.mjs`. Verifica finale `git diff --check` limitata ai file posseduti e controllo dello stato dell'albero.

Banco vero: server su porta libera diversa da 4174, store copiato, kernel del repository esplicito, stessa domanda di `dec896c0`, autore `z-ai/glm-5.3-flash`, giudice L9 indipendente. Prova visibile: rapporto finale riletto dalla rotta della ricerca e voce in Libreria; conti da giornale e sessione. Chiusura di tutti i server avviati da questa sessione. Ripristino: applicare al contrario soltanto la patch BC-49 dopo confronto con eventuali nuove modifiche altrui; i giornali e rapporti già prodotti rimangono sul disco.

## Disegno e numeri iniziali

Scelta **(a)**: parti ordinate, comprese affermazioni e fonti; una chiamata per risposta del modello, attesa della conferma prima della successiva. Testo concatenato senza separatori aggiunti, elenchi concatenati senza riordino: il compositore L9 riceve gli stessi argomenti che riceverebbe nel deposito unico. Le fonti numeriche mantengono l'indice globale; alla figlia si chiedono URL esatti. Un'ultima parte vuota può sigillare le parti precedenti. Le parti precedenti non producono né `rapporto.md` né verdetti prematuri.

Tetto iniziale: **4.096 byte UTF-8 del JSON dei quattro argomenti**, non solo prosa; obiettivo nella consegna 3.000 byte per lasciare margine. Massimo 512 parti. L'evento conserva indice, impronta SHA-256 del contenuto normalizzato, dimensione e payload. Ordine e ripetizioni controllati sotto coda per ricerca. Scrittura durevole prima della conferma; l'ultima parte passa nel compositore e nel giudizio L9 immutati, poi il rapporto viene scritto atomicamente e registrato con impronta. Una ripetizione conclusa riusa il documento verificato senza richiedere il giudizio.

**Limite delle misure disponibili:** il JSONL originale ha un solo `tempi-giro` (16 chiamate, 21.725 token fuori, primo token 37.355 ms, primo visibile 45.764 ms), e i delta non portano timestamp individuali. BC-44 riporta i totali dei tre giri e i 189 secondi del terzo; non fornisce durata e byte degli argomenti della singola chiamata. I 77.175 byte sono del documento finale, che include record e verdetti prodotti dal server: non sono una misura verificata dell'argomento generato. Dividere 77.175 per 4.096 dà 19 blocchi di soli byte, **non il numero provato delle chiamate necessarie**. Non esiste dai dati letti un tetto di byte dimostrato capace di garantire meno di 60 secondi, soprattutto includendo ragionamento e attesa. Il banco misurerà questa ipotesi; il controllo a ricezione limita le parti accettate, non può retroattivamente limitare una generazione del fornitore.

Scartata **(b)**: `scrivi` in append esiste, ma la figlia `Research` non può usarlo; servirebbe estendere i permessi, scegliere percorsi e inventare comunque idempotenza/checkpoint per prosa e prove. Scartato il solo **streaming tool calls**: frammenti di JSON non ancora validato non sono parti committate e non sopravvivono automaticamente alla chiusura del fornitore. Evitata una chiusura con tutte le prove insieme: sposterebbe la generazione enorme dalla prosa agli elenchi.

## Registro degli esiti intermedi

Amendamento del registro, prima dell'ulteriore modifica: il test `L8 — lo SCHEMA nomina i tre campi` in `tests/ricerca-deposito-strutturato.test.mjs:407` congela l'elenco esatto delle proprietà. L'esecuzione ha dato 198/199: rosso esclusivamente perché manca `parte` nell'atteso. Aggiungo questo file all'elenco delle modifiche, preservando i tre campi obbligatori. Scenario permanente BC49: proprietà nuova soltanto opzionale, attestazione SHA-256 dell'intero inventario precedente esclusa la descrizione del deposito.

Primo RED: modulo delle parti assente, `ERR_MODULE_NOT_FOUND`. Primo GREEN mirato: 12/12. Consuntivo finale in lavorazione.

Revisione del registro prima di ulteriori cure: aggiungo nel medesimo nuovo test gli scenari «adattatore vecchio ignora parte», «lettura del giornale negata», «perdita dell'ultima parte», «soltanto parti salvate e ripresa automatica», «giudice indipendente su parti» e «documento finale alterato». L'adattatore vecchio deve rifiutare il protocollo nuovo, senza scrivere la singola sezione come rapporto completo; nessun cambiamento alle sue chiamate senza `parte`. Nessun nuovo file di prodotto.

Seconda revisione prima della cura: scenario «coda mozzata seguita da run_resumed». La separazione va applicata anche al fatto di ripresa dentro `registra`, altrimenti il frammento può assorbire il fatto che limita i tentativi automatici. Aggiungo il metodo privato `registra` al perimetro già dichiarato dell'orchestratore. Il test deve conservare sia l'indice della parte sia il fatto di ripresa.

## Cure finali, file per file

Percorsi relativi a `harness-ui/`; ramo verificato `lane/harness-desktop`.

| File | Righe e comportamento |
|---|---|
| `src/research/deposito-a-pezzi.mjs` **nuovo** | 9: limite 4.096 byte. 17: controllo di indice, tipi, elenchi e byte UTF-8. 31: replay con sequenza e SHA-256; rifiuta buchi e contenuti alterati. 55: concatenazione esatta della prosa e degli elenchi. 64: coda per ricerca, checkpoint durevole, ripetizioni idempotenti, chiusura e riuso del rapporto verificato. 120: consegna statica e progresso alla ripresa. |
| `src/research-orchestrator.mjs` | 490: consegna iniziale a sezioni dopo i rami. 606: consegna della ripresa. 1175: separa anche la riga di `run_resumed` dopo una coda mozzata. 1397: instrada il solo nuovo argomento al deposito a parti. 1408: vecchio corpo L9 mantenuto dentro `verificaEComponiRapporto`, senza alterarne algoritmo, giudice o verdetti. 1767: anche una parte salvata è lavoro sufficiente per la ripresa automatica BC-44. 2110: entrambe le vie di ripresa rileggono il progresso delle parti dal giornale. |
| `src/research-store.mjs` | 894: `separaRiga` opzionale, mantiene separata la scrittura dopo un frammento JSON. 931: `rigoroso` opzionale distingue errore di lettura da assenza; il default storico rimane tollerante. Riutilizzati senza modificarli `scriviRapporto` e `scriviAtomico` con flush e rename. |
| `src/kernel/talosHarness.mjs` | 2413: descrizione aggiornata e sola proprietà opzionale `parte`; tutti i campi precedenti restano. 8003: passaggio di `parte` e dei byte degli argomenti originali; permesso controllato prima del compositore. 8045: adattatore vecchio che ignora il nuovo argomento respinto. 8071: conferma della parte senza pubblicare il rapporto incompleto. Ricevuta sul giornale per le parti e sul rapporto per la chiusura. Nessun import da `src/research/`. |
| `tests/ricerca-deposito-a-pezzi.test.mjs` **nuovo** | 21 test, inclusi Unicode, limiti esatti, idempotenza concorrente, buchi, due vie di ripresa, ultima parte già committata, coda JSON mozzata, permessi, guasti, adattatore vecchio, L9 indipendente e compatibilità byte per byte. |
| `tests/ricerca-deposito-strutturato.test.mjs` | 411: elenco delle proprietà aggiornato da tre a quattro; tre campi obbligatori invariati. |
| `.claude/RAPPORTO-BC49-DEPOSITO-A-PEZZI-2026-09-12.md` | Questo rapporto, con dossier, registro preventivo e consuntivo. |

Non sono stati modificati da questa lavorazione `agent-service.mjs`, `http-app.mjs`, `session-registry.mjs`, i file dei fornitori o del catalogo, il frontend né gli altri sottosistemi vietati. L'albero è cambiato durante il lavoro per altre lavorazioni: quei cambiamenti non fanno parte di BC-49.

### Contratto e ripresa

Il modello aggiunge un solo argomento:

```json
{"testo":"# Rapporto\n\nPrima sezione.\n","affermazioni":[],"fonti":[],"parte":{"indice":1,"ultima":false}}
```

`deposit_part` porta `versione:1`, `indice`, `at`, `impronta`, `byte`, `contenuto`. L'impronta normalizza l'ordine delle chiavi JSON, preservando ordine degli elenchi e stringhe. Ripetere la stessa parte non aggiunge un evento; contenuti diversi allo stesso indice sono rifiutati. Il limite comprende anche gli argomenti originali con gli spazi generati dal fornitore, quando la chiamata passa dal kernel.

Il rapporto intero passa al compositore esistente soltanto sull'ultima parte. Prima viene validata la forma completa; una chiusura con riferimenti mancanti non viene committata, così il modello può correggerla. Dopo il checkpoint finale vengono eseguiti L9 e la scrittura atomica; `deposit_finished` conserva impronta del documento e risultato necessario alla ricevuta. Se il processo cade durante L9, il testo è già nel giornale: la ripresa chiede di ripetere soltanto l'ultima chiamata piccola. Se manca l'ultimo pezzo, indica il successivo all'ultimo confermato. Se il rapporto concluso è stato alterato sul disco, una ripetizione non lo sovrascrive.

Il limite 4.096 non viene applicato retroattivamente ai depositi unici: la compatibilità richiesta conserva anche quelli grandi. La consegna nuova chiede sempre le parti, ma non costituisce un limite fisico alla generazione del modello. Il ragionamento può ancora superare 60 secondi; lo streaming del fornitore può ancora cadere.

### Diff non applicati

**`src/http-app.mjs`: diff vuoto, nessun hunk necessario o proposto.** Non serve una rotta nuova: l'attrezzo usa il compositore già collegato dal registro; la rotta di ripresa richiama già `riprendi`. I 19 test di `http-routes-research.test.mjs` sono compresi nel verde finale. Nessuna proposta di estendere il corpo HTTP al rapporto intero.

**`src/agent-service.mjs` e `src/session-registry.mjs`: nessun diff necessario.** Il callback esistente inoltra già l'oggetto ricevuto al compositore, aggiungendo la cartella dal server. Nessun passaggio aggiuntivo da applicare a mano.

Nessun diff del trasporto OpenRouter/Z.ai applicato: abilitare `tool_stream` sul collegamento diretto non basta a ottenere checkpoint applicativi e la sua propagazione tramite OpenRouter non è stata verificata. Nessun cambiamento a frontend o mobile proposto.

## Test con numeri

| Verifica | Esito |
|---|---|
| Primo RED, modulo non ancora implementato | 0/1; `ERR_MODULE_NOT_FOUND` |
| Primo ciclo focalizzato | 12/12 |
| Prima regressione, schema precedente congelato | 198/199; corretto l'atteso additivo |
| Adattatore vecchio che ignorava `parte` | RED 18/19, poi GREEN 19/19 |
| Coda mozzata che assorbiva `run_resumed` | RED 0/1: evento atteso 1, trovato 0; poi GREEN |
| **Suite finale della ricerca** | **580/580**, 0 falliti, 0 saltati; **2.294,1884 ms misurati** |
| Nuovi casi BC-49 nella suite finale | **21/21** |
| `git diff --check` sui file tracciati posseduti | riuscito |
| Spazi finali sui due file nuovi | nessuna riga |
| Sintassi dei tre script del banco con `node --check` | riuscita |

Comando finale, eseguito con `rtk proxy`:

```text
node --test tests/ricerca-deposito-a-pezzi.test.mjs tests/ricerca-motore-nella-corsa.test.mjs tests/ricerca-giornale-e-ripresa.test.mjs tests/research-orchestrator.test.mjs tests/http-routes-research.test.mjs tests/ricerca-permesso-e-consegna.test.mjs tests/ricerca-deposito-strutturato.test.mjs tests/research-store.test.mjs tests/research/*.test.mjs
```

Nell'esecuzione registrata i nomi di `tests/research/*.test.mjs` sono espansi: l'elenco esatto e l'esito sono in `%LOCALAPPDATA%/Temp/bc49-20260912/test-ricerca.json`; output integrale in `test-ricerca.log`.

Il test L9 del nuovo file verifica giudice diverso dall'autore, nessuna chiamata al giudice prima della chiusura, medesimo documento e medesima risposta finale del deposito unico, nessun nuovo giudizio quando si ritenta la chiusura. Il test del banco conserva l'impronta dell'intero inventario precedente, escluse soltanto la nuova proprietà e la descrizione del deposito. Per la vecchia chiamata con solo `testo` il confronto sul disco include CRLF, spazi iniziali/finali e Unicode.

## Tentativo reale autorizzato: bloccato prima della ricerca

Tutti gli orari qui sotto sono UTC del 12/09/2026.

Banco: `C:/Users/Antonino/AppData/Local/Temp/bc49-20260912/`. Store copiato con i JSONL della madre `78247740-8b13-4cd8-86d8-fc89ed2df48c` e della figlia originale `dec896c0-12ae-4f1d-9f82-d03ccc428fdf`, modificando soltanto la cartella nelle intestazioni delle **copie**. Copiata la ricerca originale: **55 eventi, 25 `step_finished` effettivamente contati, 67 file fonte**. Il dato locale differisce dal conteggio di 26 passi riportato in BC-44; qui riporto il conteggio osservato, senza correggere il rapporto precedente.

Server copiato nel banco, dipendenze e sorgenti collegate mediante giunzioni; `TALOS_OWNER_RUNTIME_MODULE` punta esplicitamente al kernel del repository. Un primo avvio su porta 59372 è uscito per un percorso Windows passato a `--import` senza conversione a URL: corretto soltanto nello script del banco. Non aveva ascoltato. Avvio utile su **63619**, PID **10576**, salute HTTP 200.

Alle **12:39:40.313** la rotta del compositore `POST /api/v1/sessions/custom` risponde HTTP 200, sessione **`c2a73d49-3e31-423a-b8f0-f4fdaa665e34`**, autore `z-ai/glm-5.3-flash`. Il messaggio chiede una **nuova** ricerca `deep`, con la domanda letta dal `meta.json` originale:

> Come stanno evolvendo gli harness agentici desktop nel 2026 e quali capacità (controllo computer, mobile, contesto, valutazione) conviene aggiungere a un harness desktop proprietario?

| Misura osservata | Valore |
|---|---|
| Richieste effettive al modello | **1** |
| Avvio richiesta esterna | **12:39:40.631** |
| Risposta esterna | **HTTP 401**, `User not found.` |
| Durata osservata della richiesta respinta | **332 ms**; non è una durata di generazione |
| Byte osservati di ragionamento / prosa / argomenti | **0 / 0 / 0** |
| Primo token / primo testo / primi argomenti | assenti |
| Figlia di ricerca nuova | **non creata** |
| Parti nuove / nuovi eventi di deposito | **0 / 0** |
| Timeout di inattività osservati in questo tentativo | **0**; il 401 impedisce di raggiungere quel punto |
| Stato finale della conversazione madre | `conclusa:true`, `ultimoEsito:errore`, `motivoChiusura:errore` |
| Bilancio L9 / rapporto / voce in Libreria | **non prodotti** |
| Usage e spesa monetaria | **mancanti**, nessun valore inventato |

Il processo carica **0 chiavi dal portachiavi**; la provenienza pubblica della credenziale usata risulta **`ambiente`**. Il fornitore la respinge. La chiave non è stata stampata né salvata nelle evidenze. Nessun accesso alla porta 4174 è stato effettuato, nemmeno in lettura.

L'evento reale della sessione è `RunError`, codice `internal-error`, messaggio `HTTP 401 dopo 4 tentativi: ... User not found.`. La frase «dopo 4 tentativi» viene dal kernel; il monitor ha osservato **una sola richiesta HTTP**: non trasformo quella frase in quattro richieste misurate. Nessuna ripresa BC-44 dal vivo è avvenuta, perché la figlia non era ancora nata. Le prove di ripresa dal pezzo corretto e del limite automatico sono quindi **automate con dipendenze iniettate**, non risultati del fornitore.

Chiusura del PID 10576 alle **12:47:31.039**. `ECONNREFUSED` verificato su 63619 alle **12:47:31.733**; successiva verifica anche su 59372: entrambe chiuse. La richiesta di ispezione del processo tramite CIM è stata negata dall'ambiente; ho terminato il PID restituito dal mio avvio e verificato la porta. Nessun server della sessione resta aperto.

### Evidenze e ripetizione

Nella directory temporanea dedicata:

- `avvio-ricerca.json`: corpo della richiesta locale e risposta con ID.
- `generazioni.jsonl`: una riga con i tempi, i byte e il 401; nessuna credenziale.
- `elenco-sessioni.json`: stato riletto dalla rotta vera.
- `misure.json`: conteggi delle copie e richiesta osservata.
- `banco.json`, `chiusura.json`, `server.log`, `server.err.log`: processo, porta e chiusura.
- `test-ricerca.json`, `test-ricerca.log`: verifiche finali.
- `store/c2a73d49-3e31-423a-b8f0-f4fdaa665e34.jsonl`: eventi reali della conversazione fallita.
- `avvia.mjs`, `monitora.mjs`, `ripeti-prova.mjs`: preparazione del banco, misure e ripetizione con chiusura automatica.
- `inventario-banco.json`: elenco completo delle copie e dei file generati, senza attraversare le giunzioni né leggere contenuti di credenziali.

`stato-corsa.json` documenta un tentativo diagnostico su una rotta GET inesistente, HTTP 404; non è usato come stato della corsa. Il server ha anche creato il proprio file locale di autenticazione del lanciatore: nell'inventario compare solo il percorso, mai il contenuto.

Per ripetere con le credenziali del profilo owner disponibili al processo:

```powershell
rtk proxy node C:/Users/Antonino/AppData/Local/Temp/bc49-20260912/ripeti-prova.mjs
```

Lo script crea ogni volta una directory temporanea nuova, sceglie una porta libera diversa da 4174, copia lo store, manda la stessa domanda dalla rotta del compositore, registra generazioni e deposito, aspetta anche la ripresa automatica e chiude il suo server in `finally`. Ha un limite operativo dichiarato di 90 minuti, non una durata prevista della ricerca. Lo script finale è stato controllato sintatticamente; il suo percorso completo con credenziale valida resta da esercitare.

## Cosa NON ho verificato

1. **Esecuzione completa sul fornitore**, durata e numero effettivo delle generazioni, rapporto finale e bilancio L9 vero di BC-49: bloccati dal 401.
2. **Taratura sotto circa 60 secondi**: mancano tempi/byte per la singola chiamata nel materiale storico letto e manca una nuova generazione valida. I 4.096 byte sono un tetto applicativo iniziale, non un dato di latenza provato.
3. **Limite fisico della generazione**: il modello può violare la consegna; il server rifiuta una parte troppo grande dopo averla ricevuta. Il ragionamento non è limitato da questo tetto e non è stata attivata una troncatura di output nel trasporto. Il criterio «nessuna singola generazione oltre il tetto» non è dunque dimostrato né garantito da questa implementazione.
4. **Caduta vera dopo parti già committate**, ripresa reale e qualità delle sezioni: dimostrate dai test locali soltanto per il protocollo e il recupero, non dal fornitore.
5. **Prova tramite interfaccia grafica** a diverse dimensioni: nessun frontend modificato; il tentativo usa la medesima rotta del compositore, senza prova visuale browser.
6. **Due processi scrittori sullo stesso store**: la serializzazione è per ricerca nel processo che possiede la corsa, come il giornale esistente. Il banco usa una copia e un solo server.
7. **Caduta fra scrittura finale e `deposit_finished`**: le parti restano recuperabili, ma il giudizio può essere rieseguito se la sua conclusione non è stata registrata. Non dichiaro semantica exactly-once del costo del giudice attraverso qualunque crash.
8. **Mobile e suite generale di tutti i sottosistemi**: non eseguite; verificati il contratto del kernel e tutta la suite interessata della ricerca.

## Proposta di testo di commit

```text
BC-49: deposita i rapporti di ricerca a parti recuperabili

Aggiunge parte opzionale a research_deposit, checkpoint ordinati con impronta,
assemblaggio e verifica L9 alla chiusura. Riprende dall'ultima parte confermata
e conserva il deposito unico. Copre idempotenza, permessi e righe JSON mozzate.

Verifica: 580 test della ricerca verdi. Prova upstream bloccata da HTTP 401;
taratura temporale e consegna reale ancora da completare.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** rendere disponibile al processo del banco la credenziale OpenRouter valida del proprio profilo; non incollarla nella conversazione. Può usare il comando di ripetizione sopra, che crea un banco nuovo e non usa 4174. Nessuna decisione sulla chiusura di BC-49 basata soltanto sul verde locale.

**Cosa faccio io:** consegno i sette file elencati, le evidenze e il banco ripetibile; ho completato test e revisione del perimetro e ho chiuso i processi avviati. Non ho eseguito staging, commit o push.

**Cosa rimane:** completare la corsa con il modello vero, misurare byte e durata di ogni generazione, verificare il recupero reale quando si presenta una caduta e accettare o ritarare il tetto. **BC-49 resta aperto sul cancello upstream e sul requisito temporale.**
