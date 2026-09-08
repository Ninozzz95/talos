# Autocompact: ricerca tecnica e proposta per TALOS

Ricognizione del 08/09/2026. Stato: ricerca completata, proposta da validare; nessuna modifica al motore o alla conversazione. Non è un benchmark né un piano esecutivo già approvato. Le versioni di settembre e lo studio di agosto distinguono aggiornamenti recenti da riferimenti precedenti ancora pertinenti. Data di consultazione non significa data di pubblicazione.

## Risposta alla domanda dell'owner

Sì: l'autocompattazione è una soluzione consolidata al contesto che cresce. Claude Code, Codex, Hermes, OpenCode e Pi la implementano. Per TALOS serve come funzione del ciclo agente, prima che il modello esaurisca spazio, con recupero delle sessioni già troppo grandi. La sola eliminazione delle ripetizioni è una possibile fase preliminare, non sostituisce l'engine.

Compattare senza fermare la produzione incontrollata di tool può solo posticipare il guasto. Riassumere non equivale a conservare ogni informazione nel prompt. La garanzia realizzabile riguarda archivio integro, riferimenti recuperabili, vincoli protetti e budget verificato; la qualità del ricordo del modello richiede prove.

## 1. Causa TALOS verificata nel codice e negli eventi

Il runtime effettivamente configurato è `C:/Users/Antonino/Desktop/projects/AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`, non automaticamente la copia in `harness-ui/src/kernel/`.

| Punto letto | Comportamento osservato | Conseguenza |
|---|---|---|
| Runtime owner, `serveCompattare`, righe 135–161 | Ogni 8 giri, escluso giro 0; minimo euristico 2.000 token. | Non protegge il primo invio di uno storico già saturo. |
| Runtime owner, `stimaTokenConversazione` | Caratteri/4 per contenuto stringa e argomenti. | Non è il conteggio del prompt renderizzato, con template, sistema e catalogo strumenti. |
| Runtime owner, `compattaConversazione`, 196–223 | Invia tutta la cronologia più richiesta di riassunto. Conserva poi sistema, primo compito e sintesi. | Lo stesso input può essere troppo grande anche per il riassuntore. I turni recenti non sono protetti separatamente. |
| Runtime owner, ciclo a 4588 | Usa il catalogo tool anche nella chiamata di sintesi. | L'istruzione testuale «non usare tool» non equivale a disabilitarli nel trasporto. |
| `harness-ui/src/session-registry.mjs:3154` | Il comando manuale usa `modello` globale, poi cambia solo `voce.messaggiFinali` in memoria. | Manca un checkpoint durevole della compattazione manuale; il routing non usa qui il modello della voce. |
| `harness-ui/src/agent-service.mjs:1437` | `compattaSessione` usa il fetch ricevuto, default rete, senza qui risolvere la destinazione locale della sessione. | Il pulsante esistente non è la soluzione sicura al caso locale. Nessun invio cloud eseguito per verificarlo. |
| `session-registry.mjs:169`, guardia di stallo | Guardia esplicitamente osservativa, `interviene:false`. | Rilevare una ripetizione non ne impedisce l'esecuzione. |

Lo snapshot originale versione 2 contiene **398 tool call nello stesso messaggio assistant**, non 398 giri indipendenti. Di queste, 397 hanno `elenca` e argomenti `{}`; una ha `{` incompleto. I 398 risultati sono identici. Il recupero JSON consegnato rimuove il difetto di formato dal contesto inviato, conservando gli originali. Il banco reale ha poi ricevuto dal runtime **30.821 token richiesti / 16.384 disponibili**. Il limite resta aperto.

Quindi aumentare la frequenza «ogni N giri» non basta: un solo batch può gonfiare lo storico oltre finestra. Il valore di 32k non è stato forzato perché la stima di memoria corrente lo respinge. Non è una prova che nessuna diversa configurazione hardware possa supportarlo.

## 2. Cosa fanno davvero i competitor

| Sistema | Meccanismo documentato | Limite da considerare |
|---|---|---|
| Claude Code | Libera vecchi output tool, poi riassume; `/compact` può avere un focus. Interrompe compattazioni ripetute inefficaci. | La documentazione avverte che istruzioni vecchie possono perdersi. Regole persistenti fuori dalla sintesi. |
| Codex | Soglia automatica `model_auto_compact_token_limit`. | Configurazione del prodotto, non prova che ogni backend offra la stessa compattazione. |
| OpenAI Responses | Compattazione nativa nel flusso o endpoint `/responses/compact`; restituisce anche un elemento cifrato opaco. | Non è un riassunto testuale da passare a Nemotron/llama.cpp. |
| Anthropic API | `compact_20260112`, blocco di sintesi, continuazione o pausa dopo compattazione. | Compatibilità specifica, trigger minimo documentato 50k; non è una funzione GGUF universale. |
| Hermes | Controlli prima del turno e nel ciclo; motore sostituibile; pruning prima della sintesi. | Persistono stime e fallback; non tutto è conteggio esatto. |
| OpenCode | Autocompact predefinito, riserva di token, pruning opzionale. | Anche il suo codice contempla lo storico troppo grande da riassumere e restituisce un errore. |
| Pi | Controlla prima del prompt e dopo gli strumenti; conserva parte recente e sintesi; gestisce turni grandi. | Default 16.384 di riserva e 20k recenti sono inadatti a una finestra totale TALOS da 16k. |

Fonti primarie consultate il 08/09:

- [Claude Code: gestione del contesto](https://code.claude.com/docs/en/how-claude-code-works#when-context-fills-up).
- [Codex: configurazione](https://learn.chatgpt.com/docs/config-file/config-reference), [OpenAI: compaction](https://developers.openai.com/api/docs/guides/compaction).
- [Anthropic: compaction](https://platform.claude.com/docs/en/build-with-claude/compaction), [context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing). La prima documenta anche sintesi nulla quando il modello tenta tool: gestire l'esito, non dichiarare successo dal solo evento iniziale.
- [Hermes v2026.9.7: contesto](https://github.com/NousResearch/hermes-agent/blob/v2026.9.7/website/docs/developer-guide/context-compression-and-caching.md). Default compressione attiva al 50%; gateway di sicurezza all'85%. Usa token del provider più stima del delta, con fallback dichiarati. Non copiare queste percentuali senza calibrare TALOS.
- [OpenCode: configurazione](https://opencode.ai/docs/config/#compaction), [codice v1.18.29](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/opencode/src/session/compaction.ts).
- [Pi: compattazione](https://pi.dev/docs/latest/compaction).

## 3. Codice upstream ispezionato e decisione di riuso proposta

| Upstream fissato | Ispezione | Decisione tecnica proposta, non installazione |
|---|---|---|
| Hermes v2026.9.7, `2237be355906fbe6065ce1815711eee52b2d646e`, 07/09 | `ContextEngine`, `ContextCompressor`, facade e summary dispatch; MIT. | Riferimento per controllo completo. Non importare un framework Python con persistenza e routing propri dentro il loop Node come scorciatoia. Un sidecar richiede un contratto e qualificazione separati. |
| Pi 0.85.1, `d981de1229ef899957bbe968bc8dcda02a21f477`, release 05/09 | Pacchetto npm `@earendil-works/pi-coding-agent`, MIT, Node ≥22.19; export pubblici verificati nel sorgente. | **Primo candidato da provare per riuso diretto** della sintesi tramite adapter TALOS. Nessuna ricopia locale del suo algoritmo prima di verificare l'integrazione. |
| OpenCode v1.18.29, `16747470f976aca3d362ad730bcd3fe82ecc2c9a`, release 04/09 | Selezione storico, riserva, sintesi senza tool, gestione overflow. | Adattare i contratti; l'implementazione è accoppiata ai suoi servizi Session/Effect/Provider, non un componente autonomo dimostrato. |
| LangChain JS, documentazione corrente | `summarizationMiddleware`, trigger/keep, tokenCounter personalizzato, limiti chiamate. | Alternativa mantenuta. Non migrare il ciclo agente a LangGraph per il solo riassuntore. La configurazione documenta anche troncamento dell'input da riassumere: non prova conservazione integrale. |
| llama.cpp b10517, `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe` | README del server e binario locale già usato nel banco. | Riusare API del runtime per finestra e conteggio, senza inventare un tokenizer. Gli endpoint vanno provati sul binario installato prima di abilitarli. |

Dettaglio Hermes: `_dedupe_tool_results` conserva una copia recente e sostituisce output testuali duplicati abbastanza grandi con un riferimento. `_sanitize_tool_pairs` tratta orfani e chiamate in corso. `_call_summary_llm` rifiuta testo vuoto o terminato per limite output; il codice ha cooldown e limiti ai tentativi. Ma `_bound_summary_input` tronca e `_sample_summary_input` campiona porzioni: la sintesi non legge necessariamente tutto. Sono compromessi espliciti, non «zero perdita».

Dettaglio Pi: `generateSummaryWithUsage` è un export pubblico, accetta `streamFn`, segnale di annullamento, sintesi precedente e restituisce testo/usage. Serializza la storia come materiale da sintetizzare; rifiuta una risposta che chiama strumenti e sintesi con terminazione `length`. Ciò offre un punto reale per collegare il trasporto TALOS senza concedere credenziali o policy a un secondo runtime. Restano da provare import del pacchetto distribuito, conversione dei nostri messaggi, vincoli sul riassunto e finestre piccole. Non è una integrazione già qualificata.

Riferimenti: [Hermes compressor](https://github.com/NousResearch/hermes-agent/blob/v2026.9.7/agent/context_compressor.py), [Pi export](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/index.ts), [Pi implementazione](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/compaction/compaction.ts), [LangChain middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in#summarization), [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/b10517/tools/server/README.md).

## 4. Ricerca recente: cosa adottare come criterio, cosa non promettere

[The Compaction Cliff](https://arxiv.org/abs/2608.22752), 24/08/2026, studia la perdita di vincoli durante sintesi ripetute. Propone classificazione per tipo e conservazione differenziata; [codice pubblico](https://github.com/searchsim-org/cikm26-knowledge-triage) Python, licenza dichiarata Apache-2.0. I risultati sono dei loro esperimenti e configurazioni, non misure del Claude Code corrente sulla macchina owner, né di TALOS. Criterio utile: vincoli verificabili separati dal riassunto narrativo. Classificatore automatico e relativo costo devono essere valutati, non promossi a garanzia.

[Context Compaction Theory](https://arxiv.org/abs/2608.01326), 02/08, è appena fuori dalla finestra stretta 09/08–08/09. Distingue selezione e generazione e ne analizza il budget. È teoria, non un engine pronto da installare o una prova di superiorità su Nemotron.

[LCM, Voltropy](https://papers.voltropy.com/LCM), riferimento precedente, distingue archivio immutabile e contesto attivo composto da originali recenti e nodi di sintesi. I rimandi consentono recupero dello storico. Gli autori precisano che non garantiscono che il modello recuperi sempre il dato giusto. [hermes-lcm](https://github.com/stephenschoettler/hermes-lcm) è un plugin concreto con SQLite, DAG e strumenti di ricerca/espansione paginata; non è il default Hermes. **Candidato per memoria recuperabile**, da qualificare per TALOS, non da chiamare «modello che non dimentica mai». Il paper usa anche troncamento finale per garantire convergenza: salvare gli originali è distinto dalla completezza del prompt corrente.

Non confondere prompt caching/KV cache, compressione dei pesi, più RAM e autocompattazione semantica: intervengono su problemi differenti. Nessuno di questi da solo dimostra la ripresa del nostro storico.

## 5. Architettura raccomandata per TALOS

Questa è una proposta da discutere, non modifica di decisioni owner o autorizzazione a cambiare kernel.

1. **Un solo responsabile del contesto.** Manuale «Compatta», autocompact, ripresa, cambio modello e recupero overflow devono usare lo stesso servizio. Evitare due compattatori che riscrivono indipendentemente lo storico. Prima di ogni inferenza verificare il budget; controllare nuovamente dopo i risultati degli strumenti. Non aspettare otto giri.
2. **Budget della richiesta reale.** Finestra effettiva del runtime, sistema, schema degli strumenti, messaggi, template e spazio per ragionamento/risposta. Invariante proposta: `token(input renderizzato) + riserva output + margine ≤ finestra effettiva`. Il README b10517 documenta `/v1/chat/completions/input_tokens`; il gate deve confermare risposta e parità sul binario. `/apply-template` + `/tokenize` è un'alternativa da qualificare, soprattutto per multimodale. Per provider senza conteggio: stima etichettata e recupero bounded; mai presentare caratteri/4 come misura esatta.
3. **Archivio e contesto distinti.** Eventi originali append-only; compattazioni come checkpoint derivati con versione, intervallo, hash, modello effettivo, usage e riferimenti recuperabili. Persistenza riuscita prima di sostituire il contesto. Riavvio, Stop e crash non devono perdere l'ultimo stato valido. Nessuna riscrittura retroattiva delle azioni avvenute.
4. **Conservazione per tipo.** Policy e decisioni protette, richiesta attiva e ultimi scambi utili separati dalla sintesi. Gli output grandi diventano riferimenti a contenuti recuperabili e paginati. Una ripetizione può essere rappresentata con contenuto, conteggio e provenienza; mai eseguire di nuovo un'azione per ricostruirne il testo. Non estendere una cache di lettura a comandi con effetti esterni. La fonte non fidata resta non fidata anche nel riassunto.
5. **Sintesi che entra nella finestra.** Richiesta dedicata senza tool e con routing locale conservato. Per uno storico già oltre limite: segmenti di dimensione verificata, sintesi intermedie con provenienza e successiva riduzione, oppure recupero mirato dall'archivio. Non inviare 30k a un modello da 16k chiedendo di riassumerli. Le coppie tool call/result vanno mantenute semanticamente valide; un batch enorme richiede una rappresentazione storica esplicita, non tagli arbitrari fra gli id.
6. **Controllo degli esiti.** Sintesi vuota, troncata, senza riduzione utile o priva di vincoli protetti non diventa checkpoint. Tentativi e durata limitati; errori di contesto non devono produrre quattro richieste identiche. Se il solo materiale indispensabile non entra, fermata leggibile con originale intatto. La configurazione non deve lasciare un ciclo compattazione → overflow → compattazione infinito.
7. **Guardia delle raffiche separata.** Il caso di 398 chiamate nella stessa risposta richiede limite del batch e controllo delle ripetizioni prima dell'esecuzione, oltre al rilevamento tra giri. La politica per sospendere/richiedere intervento appartiene all'owner: la guardia attuale è osservativa per scelta precedente. Compattare non autorizza nuove cancellazioni o uccisioni di processi.
8. **Context Compactor nell'interfaccia.** Autocompact attivo di default come richiesto; finestra reale, contenuto protetto, spazio prima/dopo, modalità e ultimo risultato. Separatore persistente in chat. Barra per fasi reali; avanzamento numerico solo quando misurabile (per esempio segmenti completati), altrimenti indicatore indeterminato. Il passaggio manuale e quello automatico mostrano lo stesso stato, che sopravvive a cambio sessione e reload.

Per API compatibili la compattazione nativa può essere adottata direttamente dietro adapter, preservando gli elementi opachi nel loro protocollo. Per locale e portabilità va qualificato il percorso testuale con Pi e archivio TALOS. Non convertire un blob cifrato in pseudo-memoria testuale e non trasferire una chat locale al cloud implicitamente.

## 6. Come dimostrare che migliora davvero

Prima gate tecnici di budget, persistenza, idempotenza, associazione tool e cancellazione. Poi invii in italiano dal composer, stesso modello, runtime, template, tool e impostazioni. Ogni caso produce eventi grezzi e risultati verificabili; nessuna vittoria dichiarata dal solo conteggio test.

| Scenario da implementare | Prova umana / proprietà verificata |
|---|---|
| AC-01, storico già oltre finestra | Riprendere la copia della chat owner, stesso id, risposta utile senza overflow e senza perdita dell'archivio. |
| AC-02, compattazioni ripetute | «Chiamami Livia. Non modificare file.» Dopo almeno cinque compattazioni: «come ti devi rivolgere a me? leggi README.md e dimmi il codice». Ricordo, vincolo e risultato reale verificati. |
| AC-03, burst | Riprodurre un batch di 398 tool; verificare limite e contesto bounded prima del successivo invio. Controprova: risultati diversi o operazioni autorizzate non sono falsi duplicati. |
| AC-04, output enorme | «Leggi il log e trova il primo errore». Recupero per pagine con dato preciso, non riassunto inventato. |
| AC-05, fallimento compattazione | Risposta vuota/troncata, timeout, annullamento e disco pieno: niente checkpoint parziale, niente riesecuzione di effetti. |
| AC-06, continuità | Cambio sessione, reload e riavvio durante/dopo compattazione; nota unica e stato coerente. |
| AC-07, routing | Chat locale resta locale; downgrade a finestra più piccola rivaluta il budget. Nessuna chiave o cronologia a provider alternativi senza consenso. |
| AC-08, richieste e regole | Refusi, «continua», correzioni e nuovi obiettivi. La sintesi non riattiva compiti annullati e non eleva istruzioni da un file. |

Misure: successo del compito, accuratezza dei dettagli, sopravvivenza dei vincoli, tool realmente eseguiti, token prima/dopo, tempo e costo compattazione, TTFT caldo/freddo, numero di tentativi e richieste rifiutate. Soglie e riserve si fissano dopo misure su almeno i due modelli locali disponibili, non copiando numeri dei cloud da 200k.

Confronto host: stesso modello locale e stessa finestra su TALOS e competitor configurabile. Confronto API/locale misura capacità offerta e qualità con modelli differenti, non isola il solo engine. AVM ON/OFF conserva identici prompt/modello/contesto/evaluator. Su UI: 1024, 1280, 1440, Full HD, QHD e 4K, hover, tastiera, reduced motion e immagini aperte.

**NON VERIFICATO:** integrazione Pi in TALOS, endpoint di conteggio sul binario caricato, prestazioni del DAG LCM, riassunto locale di tutto lo storico lungo e benchmark competitivo. In questo passaggio sono stati letti codice/documentazione e registrate evidenze; nessuna nuova inferenza o modifica prodotto.

## 7. Consegna e prossima decisione

### Aggiornamento esecutivo 08/09 — qualificazione approvata

Il piano di qualificazione è stato approvato dall'owner; esecuzione in `harness-ui/benchmarks/autocompact`, ledger dedicato `LEDGER-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md`. Nessuna scelta definitiva dell'engine o integrazione prodotto.

Pi 0.85.1 è ora installato nel solo banco e la sua API pubblica è esercitata. Prove controllate: la risposta vuota viene restituita dall'API, quella terminata per limite viene rifiutata; il chiamante deve verificare l'annullamento anche dopo il ritorno della sintesi. I controlli del banco impediscono pubblicazione in questi casi. Le precedenti indicazioni «import non verificato» sono quindi superate limitatamente a questa prova.

Hermes v2026.9.7 è stato acquisito integralmente al commit `2237be355906fbe6065ce1815711eee52b2d646e`: 12.173 blob verificati contro l'albero Git ufficiale `c98901d7f46d1ab5213ef00e8ee5df989f9131b7`. Codeload/git/archive rispondevano 429 e jsDelivr limitava il repository a 50 MB. Risolto tramite GitHub GraphQL/Git Blobs, senza cambiare pin. LCM al commit `8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54` acquisito; entrambi i worker Python si avviano dalle copie fissate. Origine e hash in `hermes-materialization.json`, nessuna modifica dell'installazione owner. [Git Trees API](https://docs.github.com/en/rest/git/trees), [GraphQL GitHub](https://docs.github.com/en/graphql/reference/git), consultati 08/09.

Sul Nemotron Q4_0 e sul binario locale b10517, `/v1/chat/completions/input_tokens` risponde con conteggio intero della richiesta. La sintesi TALOS sulla copia recuperata viene rifiutata 3/3: 21.964 token per finestra 16.384. La API Pi diretta viene rifiutata 3/3: 18.208 token. Questi sono conteggi delle richieste del banco, diversi dal precedente errore del giro completo: non una correzione retroattiva di quel dato. La sola chiamata di sintesi non risolve quindi l'input già oltre limite. [Contratto b10517](https://github.com/ggml-org/llama.cpp/blob/dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe/tools/server/README.md).

TALOS supera 3/3 la memoria sintetica dopo cinque compattazioni, con i cinque valori esatti. Il compattatore conserva il primo messaggio utente che contiene i fatti: questo risultato non dimostra la preservazione arbitraria di informazioni riassunte. Lettura file e riavvio del checkpoint del banco hanno prove reali, ma non equivalgono al loop completo del prodotto o dei competitor. Risultati grezzi nella tranche `runs/2026-09-08T15-21-39.086Z`; interrotta durante i successivi scenari Pi, senza attribuire successo al caso incompleto.

Il banco ha 18 test controllati verdi. Questi numeri non sono punteggi competitivi. Rimangono tranche dei due modelli, guasti nativi, tool di recupero LCM, prove complete delle applicazioni e raccomandazione finale con l'owner.

Raccomandazione: progettare l'Autocompact Engine completo; la deduplicazione rimane un operatore controllato al suo interno. Primo gate di riuso: Pi tramite API pubblica; separatamente valutare memoria LCM. Il piano esecutivo deve poi enumerare file, simboli, test RED, migrazioni e rollback; questo documento non li sostituisce.

**Cosa deve fare l'owner:** valutare questa direzione prima delle scelte fondamentali su engine, memoria e intervento sui loop. **Cosa faccio io dopo:** prova isolata del componente upstream e piano esecutivo con misure, prima di innestarlo nel prodotto. **Cosa rimane:** implementazione backend/UI, ripresa dello storico lungo e benchmark. La riduzione delle ripetizioni non è stata applicata.
