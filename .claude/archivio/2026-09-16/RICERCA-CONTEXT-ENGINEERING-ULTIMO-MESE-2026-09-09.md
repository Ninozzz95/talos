# Context engineering — ricognizione tecnica del mese

Versione 1.0. Ricerca e verifica: 2026-09-09T08:56:22Z, 10:56:22 Europe/Rome.
Finestra per i nuovi paper: **9 agosto–9 settembre 2026**, inclusi. Documentazione e codice consultati il 9 settembre sono distinti dalle pubblicazioni uscite nel mese. Destinazione: dossier interno TALOS; nessuna pubblicazione automatica.

## Esito operativo

Il contesto breve richiede un controllo di fattibilità separato dalla soglia automatica. La richiesta manuale può arrivare prima del 75% e con automazione disattivata. Se non esistono scambi precedenti riducibili senza spezzare l'ultimo, TALOS deve spiegare perché non procede, senza caricare il modello, consumare una sintesi o pubblicare una versione. Se una sintesi eseguita non riduce la richiesta effettiva, resta valido il contesto precedente. Queste sono le regole TALOS implementate e provate in questa consegna, non soglie copiate da altri prodotti.

La ricerca suggerisce di giudicare l'engine sulla correttezza delle risposte e delle decisioni correnti dopo molte compattazioni, oltre che sui token risparmiati. Nessuna fonte prova che TALOS sia già superiore; i risultati dei paper sono risultati dei rispettivi autori, non benchmark eseguiti sul nostro hardware.

## Metodo e limiti

Consultati articoli originali arXiv, corpo del paper e sezioni sui limiti; documentazione ufficiale GitHub, Anthropic e Google; sorgenti mantenuti Hermes, Pi e Codex. Ricerca per agent memory, context compaction, state tracking, long-running agents, con filtro temporale e verifica della data effettiva di deposito. Il filtro del motore di ricerca da solo non certifica la data di un lavoro.

Per il codice si conservano commit e simboli ispezionati. Le pagine documentali prive di data di pubblicazione verificabile sono indicate come documentazione corrente consultata oggi. Non viene dedotto il funzionamento interno di ChatGPT dal codice di Codex. Nessun prompt non pubblico viene importato o trattato come standard del prodotto corrente. La ricognizione non certifica l'assenza di altri lavori rilevanti nel mese.

## Paper del mese: risultati e limiti

### 1. The Compaction Cliff in Long-Running AI Agent Memory

Saber Zerhoudi, Jelena Mitrovic, Michael Granitzer; deposito **24 agosto 2026**, arXiv:2608.22752v1. Gli autori riportano forte perdita di regole dopo compattazioni ripetute e propongono Knowledge Triage, con conservazione differenziata per tipo di conoscenza. Il 96% di richiamo dopo cinque cicli è un risultato del loro metodo e del loro banco. La baseline basata su un prompt di compattazione su Sonnet 4.6 non è una misura dell'attuale applicazione Claude o di ogni endpoint nativo. [Paper e metadati](https://arxiv.org/abs/2608.22752), [testo completo](https://arxiv.org/html/2608.22752v1).

I limiti includono corpus pubblici diversi dagli ambienti aziendali, errori di classificazione, prove multiciclo limitate a parte delle famiglie di modelli e costo della replicazione delle regole. Conservare una regola nel testo non garantisce che il modello la rispetti. Implicazione proposta per TALOS: verificare separatamente conservazione letterale e comportamento; mantenere provenienza e ambito dei fatti fissati. Non adottare automaticamente un classificatore come autorità sulle istruzioni.

### 2. Can Agent Memory Systems Track Evolving State?

Xinyi Fan e coautori; deposito **20 agosto 2026**, arXiv:2608.19652v1. StateMemBench contiene 234 scenari e distingue stato corrente, stato superato e altri errori. StateMem registra sostituzioni e dipendenze. Gli autori riportano, fra gli altri, accuratezza 0,205→0,363 su DeepSeek-V4-Flash e 0,149→0,233 su Qwen-3.5-9B: miglioramenti relativi consistenti, ma valori assoluti ancora lontani da affidabilità totale. [Paper](https://arxiv.org/abs/2608.19652), [metodo e limiti, appendice H](https://arxiv.org/html/2608.19652v1).

Il banco è sintetico e allineato al problema del metodo; le conversazioni sono più corte di molte sessioni reali, le prove non coprono tutti i modelli frontier e alcune condizioni usano una sola esecuzione. Proposta TALOS: domande su decisioni revocate, valori dipendenti e nomi simili; valutazione distinta del richiamo storico e della risposta valida oggi. Non introdurre una nuova architettura di memoria senza qualificazione e decisione dell'owner.

### 3. What Makes Agent Memory Useful for Reliable Unanswerable Question Handling?

Chuanyuan Tan e coautori; deposito **28 agosto 2026**, arXiv:2608.27924v1. Confronto di quattro metodi di memoria, tre dataset e due modelli. I benefici della memoria dipendono dalla rappresentazione e non sono universali; trasferire fra dataset può essere più fragile che trasferire fra modelli. [Paper](https://arxiv.org/abs/2608.27924), [testo e limiti](https://arxiv.org/html/2608.27924v1).

La valutazione riguarda domande senza risposta disponibile e un ambiente ReAct con ricerca/consultazione su Wikipedia; non dimostra qualità su file, terminale, immagini o web dinamico. Implicazione TALOS: quando manca la fonte, non costruire una falsa citazione né trasformare una sintesi in prova dell'originale. Aggiungere casi con risposta assente e fonti ambigue al banco realistico, misurando anche risposte correttamente sospese e richieste di chiarimento.

### 4. Towards a Formal Definition of Agent Memory

Hongyao Tang; deposito **12 agosto 2026**, arXiv:2608.11654v1. Formalizza memoria, conoscenza derivabile, copertura delle domande e compromesso fra utilità e capacità. Considera precisione in presenza di affermazioni false e una formulazione sequenziale. [Paper](https://arxiv.org/abs/2608.11654), [testo completo](https://arxiv.org/html/2608.11654v1).

È un quadro teorico con un esempio illustrativo sull'Odissea, non un motore produttivo qualificato. Per TALOS suggerisce una valutazione utile: quante domande verificabili restano risolvibili a pari budget, con quante risposte false. Un rapporto di compressione più alto può peggiorare questa metrica; nessuna percentuale di risparmio è sufficiente da sola.

**Fuori finestra:** Context Compaction Theory, arXiv:2608.01326v1, è del 2 agosto 2026. È un riferimento teorico precedente, non una novità dell'ultimo mese in questa ricognizione. [Data verificata](https://arxiv.org/abs/2608.01326).

## Competitor e framework: ciò che è verificabile

| Fonte fissata o consultata | Comportamento verificato | Forza e limite per il confronto |
|---|---|---|
| Hermes `context_compressor.py`, commit `26f4a674e0ec3c7eacfd81481d35e84166d82af5`, modifica del file 09/09/2026 07:38:25Z | `compress` righe 4263–4271 restituisce i messaggi invariati se insufficienti, anche con `force`; distingue una finestra non compattabile. Il manuale può saltare il controllo economico di fattibilità successivo. | Evita sintesi strutturalmente inutili. I limiti dipendono dalla testa protetta e dalla coda: non sono una soglia universale da copiare. Il codice esaminato include anche fallback, pruning e gestione media; il confronto deve misurare l'intero percorso scelto. [Sorgente](https://github.com/NousResearch/hermes-agent/blob/26f4a674e0ec3c7eacfd81481d35e84166d82af5/agent/context_compressor.py). |
| Pi 0.85.1, commit di riferimento `d981de1229ef899957bbe968bc8dcda02a21f477` | `prepareCompaction` restituisce `undefined` se sia la cronologia da sintetizzare sia il prefisso del turno sono vuoti. Gestisce esplicitamente i turni divisi. | API del componente ispezionabile e riutilizzabile nel banco. Le sue scelte di finestra/coda e la validazione della sintesi non vanno confuse con le garanzie dell'intera applicazione. Riferimento già fissato, non dichiarato ultima release. [Sorgente](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/compaction/compaction.ts). |
| Codex `compact.rs`, commit `9ec33e19260907aad207185a624bd8b936d5afa8`, modifica file 08/09/2026 21:41:02Z | Il percorso ispezionato rende espliciti task, trigger e costruzione della cronologia compattata. `build_compacted_history` contempla anche una sintesi mancante con un segnaposto. | Buon riferimento per lifecycle e osservabilità. Un ramo Rust non rappresenta ogni percorso remoto/native; TALOS mantiene il proprio cancello contro sintesi vuote. Nessuna deduzione sull'implementazione di ChatGPT. [Sorgente](https://github.com/openai/codex/blob/9ec33e19260907aad207185a624bd8b936d5afa8/codex-rs/core/src/compact.rs). |
| GitHub Copilot CLI, documentazione consultata 09/09 | Avvio automatico circa 80%, attesa circa 95%, comando manuale e annullamento. Conserva messaggi arrivati durante la sintesi; checkpoint consultabili. Output tool oltre 20 KiB viene normalmente esternalizzato con anteprima, soglia configurabile. | Esplicita costo del contesto e continuità della coda. Documenta perdita di dettagli e impossibilità di invertire la compattazione completata: il ripristino TALOS con originali conservati è un requisito da provare, non una superiorità già dimostrata. [Documentazione](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/context-management). |
| Anthropic compaction API, consultata 09/09 | Il trigger `compact_20260112` ha soglia predefinita 150.000 e minima 50.000 token. | Gestione nativa utile per modelli compatibili, ma quel parametro non è utilizzabile su una finestra locale da 16.384. Non prova che la UI Claude vieti ogni compattazione manuale sotto 50.000 token. [Documentazione](https://platform.claude.com/docs/en/build-with-claude/compaction). |
| Google ADK, consultata 09/09 | Documenta configurazioni per intervalli e sovrapposizione oppure soglie token e ritenzione eventi, a seconda del linguaggio; il modello di sintesi è configurabile. | Rende distinti trigger, ritenzione e summarizer. Le opzioni differiscono fra SDK: non trattare l'esempio Python come contratto TypeScript. Non è necessario importare l'intero framework nel desktop TALOS. [Documentazione](https://adk.dev/context/compaction/). |

## Decisioni sugli upstream

Questa ricognizione **non cambia** le dipendenze approvate: SQLite, runtime, SDK e adattatori restano quelli fissati nel manifest TCEC. Si adattano i controlli strutturali osservati nei competitor al contratto TALOS. Non si importa il runtime Hermes, Codex o ADK per correggere un confine nel planner esistente. Pi rimane un braccio del banco. Le ottimizzazioni native restano disattivate finché non qualificate per provider e profilo.

I nuovi paper forniscono ipotesi e casi di valutazione, non un'autorizzazione a cambiare scope della memoria, politica di consenso o modello di sintesi. Nessuna nuova libreria di classificazione viene adottata senza versione, licenza, prove sul corpus TALOS e approvazione quando cambia una decisione di prodotto.

## Applicazione al caso breve e prove della correzione

| Scenario TALOS | Esito richiesto e osservato nella prova controllata |
|---|---|
| `CTX-SMALL-COMPLETE-TURN` | Un singolo scambio resta integro. Con due scambi il fallback manuale conserva intero l'ultimo, inclusi tool e risultati. RED prima della patch, GREEN dopo. |
| `CTX-SMALL-NO-INFERENCE` | Chat vuota, sole istruzioni, sola domanda e un solo scambio: nessun caricamento del modello, nessun job/versione, originali identici. RED prima della patch. |
| `CTX-MANUAL-BELOW-TRIGGER` | Il manuale funziona sotto la soglia automatica anche con automazione spenta. Caratterizzazione già verde, mantenuta. |
| `CTX-SMALL-NO-REDUCTION` | Sintesi più ingombrante dei due scambi: respinta, originali conservati, stessa richiesta idempotente senza altra inferenza. Caratterizzazione verde. |
| `CTX-SMALL-AUTO-NOOP` | Istruzioni lunghe, cronologia breve: l'anticipo non blocca la richiesta se entra nella finestra; overflow reale resta esplicito. RED prima della patch. |
| `CTX-UI-SMALL-NOOP` | Il pulsante mostra una spiegazione accessibile come stato informativo, senza finto avanzamento. RED prima della patch; GREEN nei tre viewport. |
| `CTX-UI-DESKTOP-ROUNDTRIP` | Click nella UI compilata, rotta HTTP reale, SQLite reale: codice `CTX_NOTHING_TO_COMPACT`, zero job prima della successiva fixture di versione. Separatore e fatti persistono al reload. Inferenza LLM non eseguita. |

Non si dichiara che ogni contesto breve debba essere compattato: se il risultato sarebbe identico o maggiore, pubblicarlo sarebbe una regressione. Non si dichiara neppure che un contesto sotto una percentuale arbitraria sia sempre inutile da compattare. Il primo controllo riguarda la struttura; il secondo riguarda la misura effettiva prima/dopo.

## Verifiche ancora necessarie per qualificare l'engine

Queste sono indicazioni di valutazione e mappature ai requisiti già approvati, non nuovi risultati:

1. Nel banco a cinque e venti cicli, distribuire fatti, negazioni, decisioni ritirate e dipendenze in tutta la cronologia. Valutare separatamente citazione storica e decisione corrente.
2. Inserire domande a cui l'archivio non può rispondere. Penalizzare riferimenti inventati e risposte sicure prive di fonte; conservare anche gli insuccessi.
3. Distinguere byte originali conservati, correttezza della sintesi, recupero della fonte e comportamento del modello. Un hash prova il primo punto soltanto.
4. Misurare output tool con informazione decisiva in fondo, immagini e cambio provider. Il caricamento differito deve mantenere strumenti raggiungibili con le stesse autorizzazioni.
5. Conservare richiesta serializzata, metodo di conteggio, finestra, riserva e consumo. Stimare il risparmio sullo stesso materiale; includere sintesi e recupero nel costo totale.
6. Eseguire i due GGUF singolarmente, tre repliche per scenario, e le prove dei provider configurati separatamente. Il successo con un adapter simulato non qualifica il modello.

La consegna attuale aggiunge protezioni verificabili e una UI collegata. Restano aperti i collegamenti e i cancelli elencati nella consegna cumulativa: qualificazione reale, recupero semantico effettivo, contabilità comune completa, catalogo/tool-output nel dispatch, revisione finale e approvazione dell'attivazione generale.

**Owner:** nessuna scelta aggiuntiva richiesta per questa correzione. **Io dopo:** continuare integrazione e qualificazione con questi criteri. **Rimane:** dimostrare sul banco reale qualità e costi; nessuna promessa di superiorità prima delle misure.
