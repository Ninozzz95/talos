# Autocompact — risultati della qualificazione del componente

08/09/2026. Matrice definitiva v2 conclusa alle 18:27 UTC (20:27 Europe/Rome), dopo il riallineamento di tre domande della prova strumenti. **Nessun candidato promosso nel prodotto.** I 96 casi documentano i componenti nelle condizioni seguenti; il confronto completo delle applicazioni non è stato superato. Nessuna API pubblica, modale o funzione TALOS modificata.

## Evidenze e custodia

Radice privata: `scratchpad/prove/autocompact-qualification-20260908`, nella worktree `AVM-harness-desktop`.

- `selected-cases-v2.json`: 96 casi, ciascuno con file, riga, SHA256 del file e della riga, esito originale e valutazione manuale separata. Matrice 2 modelli × 4 componenti × 4 scenari × 3 repliche.
- 132 risultati grezzi conservati: 96 selezionati e 36 esclusi. Anche le directory parziali dei processi interrotti rimangono nell'archivio.
- 36 esclusioni: 24 casi del banco con difetti SSE/UTF-8, 6 memorie protocollo v1 sostituite da v2 per tutti i componenti, 1 duplicato LCM/continuità, 2 errori infrastrutturali ripetuti una sola volta, 3 strumenti TALOS/Nemotron con domanda libera sostituiti dal protocollo comune a riga vincolata. Nessuna esclusione motivata solo da un risultato negativo.
- Stati automatici immutati: 18 `passed-component-case`, 74 `failed`, 4 `needs-reference-review`. Tre delle quattro risposte da revisionare inventano l'incarico; una è genericamente compatibile. Nessuna diventa una ripresa precisa riuscita. I fallimenti comprendono anche formato/lingua: non equivalgono tutti a perdita di fatti.
- Archivio definitivo `.claude/evidenze-private/autocompact-2026-09-08-v2.zip`: 54.819.130 byte, 2.860 artefatti più manifest, ogni voce riletta e verificata SHA256. Hash ZIP `a8672a47738203fe7a23813442121f888a1fa91ce0f76cdca4f4ce6b25fe446f`. Indice e regole in `CUSTODIA-BENCHMARK-AUTOCOMPACT-2026-09-08.md`. Archivio e indice v1 restano immutati come provenienza.

Il controllo delegato ha verificato i riferimenti, hash e risultati dell'indice, le 96 identità uniche e le esclusioni; ha rilevato la discrepanza di domanda poi corretta con tre prove nuove. Nessun agente ha modificato algoritmi, prodotto o piani. Materiale locale privato: nessuna pubblicazione né backup remoto dichiarato.

## Configurazione fissata

| Elemento | Configurazione effettiva |
|---|---|
| Macchina | Ryzen 7 7800X3D, 8 core/16 thread; 32 GB RAM nominali; Radeon RX 9070 XT |
| Sistema | Windows 11 Pro, build 26200; driver GPU 32.0.31041.1004 |
| Runtime | llama.cpp b10517 Vulkan; commit `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe` |
| Finestra e generazione | 16.384 token; output massimo 4.096; contesto attivo qualificabile massimo 12.288; temperatura 0; seed 193 |
| Caricamento | GPU layers 99; flash attention; cache K/V q8_0; Jinja; un modello alla volta |
| Slot runtime | Props: 4 slot e KV unificata; nessun override `-np`; non significa quattro volte la memoria KV |
| Linguaggi | Node 24.18.0; Python 3.11.15 in UTF-8 mode; inventario delle 81 distribuzioni Python conservato |
| TALOS | `compattaConversazione` reale; blocco costanti/funzione identico al kernel canonico corrente, verificato anche con tre callback controllate |
| Pi | 0.85.1, API pubblica `generateSummaryWithUsage`; reserveTokens 5120 per ottenere output 4096; retry disattivato nel banco |
| Hermes | v2026.9.7, commit `2237be355906fbe6065ce1815711eee52b2d646e`; sorgenti integri, 12.173 blob verificati |
| LCM | 1.0.0-rc.1, commit `8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54`; SQLite isolato, tail 6/max 2048 token, leaf 4096, riserva 4096 |

GGUF Nemotron: `nvidia_Nemotron-Cascade-2-30B-A3B-Q4_0.gguf`, 18.272.326.080 byte, SHA256 `a49ff5da4be50235d5aa6c8b7956ff00cc23968f2853145af84b03b1d44c1a71`.

GGUF GPT-OSS: `gpt-oss-20b-Q4_K_M.gguf`, 11.624.759.488 byte, SHA256 `c27536640e410032865dc68781d80a08b98f8db5e93575919af8ccc0568aeb4f`. Il campo revision del suo manifest è un hash di file, non un commit Hugging Face verificato. I manifest originali dei due modelli sono in `custody-models.json`.

SHA256 binario llama-server: `5dd2e389a320e144c60873bbcb1036920d200f07e29c6f70deb5cd8e8df09781`. I batch 15:21 e 16:09 conservano checks/configurazione e richieste ma non la directory scripts: è un limite di riproducibilità dei primi casi. Gli snapshot degli script sono presenti da 16:35; quelli dei quattro moduli esterni e l'inventario Python da 17:26. La directory upstreams alla radice, le dipendenze installate e i pesi restano separati dal ZIP; sono incluse sei copie del plugin LCM dalle fixture native, esplicitate nel manifest v2. Non si dichiara un pacchetto autosufficiente offline.

L'endpoint `input_tokens` del binario installato è stato provato prima delle inferenze. I raw registrano richiesta completa, conteggio e risposta del server. Il fallback caratteri/4 è esplicitamente euristico e non può promuovere il controllo di budget. Il profilo comune viene applicato dal trasporto; i prompt propri dei componenti restano diversi. Il riferimento ufficiale è il [server llama.cpp al pin usato](https://github.com/ggml-org/llama.cpp/blob/dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe/tools/server/README.md), consultato 08/09/2026.

## Risultati per scenario

Memoria e continuità riportano fatti semanticamente corretti nelle repliche 1/2/3. Un trattino Unicode o Thursday può mantenere il significato ma fallisce l'identificatore/lingua esatti richiesti. «Troncato» indica che la domanda finale non è stata eseguita: non è un punteggio di richiamo pari a zero.

| Modello / componente | Ripresa oltre limite | Memoria dopo cinque compattazioni | File reale dopo compattazione | Continuità del checkpoint del banco |
|---|---|---|---|---|
| Nemotron / TALOS | 3 rifiuti HTTP400 | 5/5 · 5/5 · 5/5 | 3/3 codice corretto, 0 formati esatti | 5/5 · 5/5 · 5/5 |
| Nemotron / Pi API | 3 rifiuti HTTP400 | 5/5 · 5/5 · 5/5; tutti 4/5 esatti | 3/3 codice corretto, 2 formati esatti | 5/5 · 4/5 · 4/5 |
| Nemotron / Hermes | 3 casi, 6 rifiuti HTTP400 | Prima sintesi troncata in 3/3 | Non raggiunto: sintesi troncata | Non raggiunta: sintesi troncata |
| Nemotron / LCM | 1 risposta generica compatibile; 2 incarichi inventati | 0/5 · 4/5 · 0/5 | 3/3 codice corretto, 0 formati esatti | 4/5 · 5/5 · 5/5 |
| GPT-OSS / TALOS | 3 rifiuti HTTP400 | 5/5 · quinta sintesi troncata · 5/5 | 3/3 codice corretto, 3 formati esatti | 5/5 · 5/5 · 5/5 |
| GPT-OSS / Pi API | 3 rifiuti HTTP400 | Terza sintesi troncata · 3/5 · 5/5 | 3/3 codice corretto, 1 formato esatto | 5/5 · 4/5 · 3/5 |
| GPT-OSS / Hermes | 3 casi, 6 rifiuti HTTP400 | Prima sintesi troncata in 3/3 | Non raggiunto: sintesi troncata | Non raggiunta: sintesi troncata |
| GPT-OSS / LCM | Incarico inventato · sintesi troncata/errori formato · risposta finale vuota | Prima compattazione respinta in 3/3 per sintesi troncata | Non raggiunto: sintesi troncata | Non raggiunta: sintesi troncata |

### Ripresa

Checkpoint recuperato versione 6, 406 messaggi; SHA256 finale ancora `b469c103933f7c71f30090309fc6aeb4d335d2c8639a156e8226a68e5bc22311`. La cronologia contiene 397 risultati che ripetono lo stesso elenco di sette file. Non contiene un incarico dell'utente di correggere test o parser. L'istruzione generale di sistema sui test non trasforma i saluti e «cosa vedi?» in quell'incarico.

| Richiesta effettiva di sintesi | Nemotron | GPT-OSS | Limite |
|---|---:|---:|---:|
| TALOS | 21.964 | 19.533 | 16.384 |
| Pi API | 18.208 | 18.242 | 16.384 |
| Hermes | 30.230 | 28.711 | 16.384 |

La causa di TALOS è l'overflow HTTP400, anche quando l'errore esterno viene chiamato `SUMMARY_INTERRUPTED`. Hermes ritorna alla cronologia precedente dopo il fallimento e il banco registra `SUMMARY_NO_REDUCTION`. Queste etichette esterne non sostituiscono la causa nei raw. Nessuno dei tre riesce a sintetizzare questa cronologia intera nella finestra pattuita.

### Memoria e strumenti

I cinque fatti artificiali sono nome Livia, ramo quercia-47, ticket AQ-193, progetto Aurora, consegna giovedì. Le domande sono naturali, seguite da un formato breve richiesto per valutazione riproducibile. Il protocollo v2 aggiunge 72 note per ciclo, senza reintrodurre i fatti. Ogni memoria valutabile ha cinque compattazioni realmente riduttive.

TALOS conserva il primo messaggio utente, che contiene tutti e cinque i fatti. Il suo risultato positivo non dimostra superiorità nel riassumere fatti distribuiti arbitrariamente. Pi viene provato come API di sintesi: l'adapter reintroduce il riassunto precedente nei messaggi, ma non passa il parametro `previousSummary`; non è la modalità incrementale nativa dell'app Pi. Quel percorso rimane da qualificare separatamente. [API Pi al pin scelto](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/compaction/compaction.ts), consultata 08/09.

LCM/Nemotron conserva nei tre database 368 messaggi ciascuno e tutti i 76 originali della fixture identici; le 18 risposte ausiliarie sono stop/non vuote. Il richiamo dal contesto attivo resta debole. Il loop comune non espone i tool di recupero LCM: queste prove non dimostrano perdita dell'archivio o inefficacia della ricerca nativa. La selezione del backlog segue il [codice LCM fissato](https://github.com/stephenschoettler/hermes-lcm/blob/8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54/compaction.py), consultato 08/09.

Il codice sole-47 proviene da `leggi` su README.md reale; sono conservati tool call, risultato e risposta. I 15 casi che raggiungono una lettura restituiscono il codice corretto. Alcuni aggiungono testo vietato dal formato esatto. Non sono una suite di tutti i tool: l'unico strumento esposto è la lettura confinata alla fixture. Zero scritture è una proprietà dell'allowlist, non una prova di rifiuto autonomo del modello davanti a tool di scrittura.

Le tre prove TALOS/Nemotron/tools iniziali chiedevano una risposta libera. La review ha impedito di confrontarle come successi del formato vincolato. Batch `2026-09-08T18-25-30.282Z`: tre nuove prove con la stessa domanda degli altri bracci, tutte con una lettura reale e codice corretto, ma risposta «Codice: Codice di verifica della prova locale: sole-47.». Sono tre fallimenti del formato. I tre successi del vecchio protocollo restano nel raw, esclusi dalla matrice v2; non sono stati riscritti retroattivamente.

### Continuità e host completi

La continuità avvia un nuovo processo Node per leggere il checkpoint JSON del banco e riavvia il worker Python quando presente. Non è un riavvio completo di TALOS, Pi o Hermes. Non prova transazioni fra checkpoint esterno e DB LCM.

Sono stati tentati 12 avvii reali AIAgent/SessionDB: 2 modelli × Hermes con/senza plugin × 3. Tutti rifiutano 16.384 < 64.000 con provider custom/llama.cpp. Il [controllo upstream](https://github.com/NousResearch/hermes-agent/blob/2237be355906fbe6065ce1815711eee52b2d646e/agent/agent_init.py), verificato 08/09, contiene un'eccezione specifica per LM Studio; non è stata simulata cambiando nome al provider. I giri, tool e riavvii nativi non hanno superato il prerequisito, quindi non sono qualificati. Il rifiuto iniziale non certifica che il plugin sia stato selezionato operativamente più avanti.

## Guasti e incidenti conservati

Due esecuzioni da 20 guasti controllati ciascuna, su API upstream reali e trasporto artificiale. La seconda, `faults/2026-09-08T16-45-04.267Z`, usa le guardie corrette. Conteggio caratteri/4 dichiarato; non sono inferenze dei due GGUF.

- Vuoto/troncato: la guardia esterna rifiuta la pubblicazione in tutti i componenti. Pi rifiuta nativamente il troncamento ma può restituire vuoto; TALOS può restituire sintesi troncata; Hermes conserva il contesto precedente.
- LCM può già aver scritto un nodo sintetico invalido nel suo DB prima del rifiuto del checkpoint esterno. Nei dieci database controllati restano 76/76 messaggi originali identici. Non equivale ad atomicità o recuperabilità certificata.
- Annullamento ed errore di persistenza prima del rename: il checkpoint precedente del banco resta invariato. Non sono guasti fisici del disco o cancellazione dello streaming reale delle app.
- Risposta artificialmente troppo lunga: TALOS/Pi/Hermes non riducono e vengono rifiutati; LCM produce invece un contesto ridotto tramite estratti e il banco lo pubblica. L'etichetta storica `no-reduction` descrive l'iniezione, non l'effetto LCM. Il contesto effettivamente non ridotto è respinto dal test AQ-03.

Regressioni del banco riprodotte e corrette con test permanenti: SSE richiesto da Hermes (AQ-19), Unicode Python su Windows (AQ-20), motivo di troncamento ausiliario perso nell'adapter (AQ-21), attribuzione temporale dei campioni (AQ-M03). 26/26 test controllati verdi. I batch precedenti mantengono le proprie versioni, non vengono riscritti.

**AQ-R01, runtime:** batch Nemotron `17:30`, Pi memoria/2 termina durante la terza sintesi con `bad allocation` e `GGML_ASSERT(batch.slot_batched || batch.size() == 0) failed`; memoria/3 non arriva all'inferenza. Si conserva generation 2 e generation 0 rispettivamente. L'ultimo campione riuscito osserva RSS 20,843 GiB, GPU dedicata 11,592 GiB e condivisa 5,731 GiB. Non identifica l'allocazione fallita né il picco esatto. L'errore successivo della sonda CIM è un dato assente, non zero RAM.

Una sola ripetizione su runtime fresco, stesso profilo, batch `17:58`: repliche 1/2 mappate esplicitamente a matrice 2/3. Entrambe completano cinque sintesi, generation 5, sei risposte HTTP200 stop/non vuote, senza crash. Non cancellano il problema di stabilità del primo tentativo.

GPT-OSS: 12 HTTP400 per overflow e 4 HTTP500 per parsing `peg-native` in LCM/ripresa; 21 risposte length a 4096 token, nessun errore di trasporto o crash documentato. Gli HTTP500 non sono classificati come overflow né come server spento.

## Token, durata e memoria

| Matrice selezionata | Token input riportati | Token output riportati | Rifiuti HTTP |
|---|---:|---:|---:|
| Nemotron, 48 casi | 532.673 | 147.850 | 12 |
| GPT-OSS, 48 casi | 379.178 | 119.354 | 16 |

Sono somme dell'usage ricevuto nelle risposte; gli errori senza usage non implicano costo nullo. Esclusioni, ripetizioni diagnostiche e avvii non sono sommati alla matrice selezionata. Durate, numero di richieste e token di ogni replica sono nell'indice; min/mediana/max per scenario sono in `aggregates`. Per le cinque compattazioni Nemotron concluse: TALOS 96,0–116,1 s; Pi 141,7–206,0 s; LCM 230,5–274,2 s. Prompt, risultato, cache e complessità differiscono: non è una classifica di velocità a qualità equivalente.

Massimi campionati fra i casi selezionati: Nemotron RSS 23.562.158.080 byte, GPU dedicata 12.447.461.376, condivisa 6.154.719.232; GPT-OSS RSS 14.210.809.856, dedicata 11.710.107.648, condivisa 39.194.624. Non sommare RSS e GPU. Sono contatori del processo llama, non l'intero costo Node/Python o picchi assoluti. Campionamento 5 secondi più tempo della sonda; i batch anteriori alla correzione di scope non consentono un'attribuzione affidabile al confine fra due casi. Questi massimi sono descrittivi della campagna. Nessuna misura energetica o costo monetario inventato.

## Costi d'integrazione e raccomandazione

| Scelta | Confine e dipendenze osservate | Lavoro da qualificare prima del prodotto |
|---|---|---|
| TALOS corrente | Funzione Node già presente | Budget di richiesta completa, storico oltre finestra, rifiuto vuoto/troncato, persistenza, stop e recupero |
| Pi diretto tramite adapter TALOS | Pacchetto Node MIT, 165 dipendenze installate nel banco | Modalità incrementale supportata, segmentazione, riserve, guardie, storico e checkpoint TALOS; costo delle dipendenze CLI/TUI |
| Hermes | Compattatore Python MIT e ambiente separato | Compatibilità host 16k, supervisione sidecar, packaging, routing sintesi, tool/store e riavvio nativi |
| Hermes + LCM | Costo host più plugin MIT e SQLite | Migrazioni, indicizzazione, tool di recupero con policy, transazioni tra store, gestione sintesi invalide e qualità del contesto attivo |
| Engine di orchestrazione TALOS | Proprietà TALOS su budget, originali, checkpoint, policy ed evidenza | Scelta del sintetizzatore versionato, contratti e prove di recupero; la sua superiorità non è ancora misurata |

**Raccomandazione:** non integrare nessuno dei quattro come soluzione pronta alle condizioni provate. È motivato mantenere in TALOS il controllo di budget, archivio originale, checkpoint, policy e recupero, usando componenti mantenuti attraverso adapter dove superano i cancelli. Non è dimostrato che riscrivere ogni algoritmo di sintesi dia un vantaggio. Pi ha il confine tecnico più vicino all'attuale processo Node, ma questa prossimità non lo promuove sul piano della correttezza. LCM offre un archivio che nelle prove resta integro, con costo ulteriore di host/recupero ancora da qualificare.

Questa è una raccomandazione per la decisione dell'owner, non una scelta architetturale già applicata. Le condizioni da decidere per una fase successiva sono: restare a 16k oppure qualificare separatamente un profilo maggiore; quali funzioni upstream adottare; quale persistenza canonica possiede il prodotto. Non si cambiano silenziosamente GGUF, riserva o provider per migliorare i risultati.

## Limiti e chiusura operativa

Tre repliche, seed fisso, una macchina, due GGUF: nessuna generalizzazione a qualunque modello, confronto AVM ON/OFF o pretesa di battere le app concorrenti. L'ordine non è randomizzato e cache/pressione memoria non sono uniformate. Il ponte SSE è bufferizzato; manca una prova reale di latenza primo token e annullamento streaming. Il valutatore esatto verifica valori, non associazioni fra etichette: la revisione manuale delle risposte è separata e non ha trovato falsi pass per scambio di etichette nei casi promossi.

Nemotron ripristinato su 4174 tramite rotta esistente a 16.384 token: primo HTTP200 ready alle 18:10:20 UTC e UI Panoramica dopo reload conferma modello caricato. Dopo le tre prove aggiuntive il ripristino definitivo è HTTP200 ready alle 18:28:53 UTC (`restoration/load-final.json`). Nessuna nuova domanda nella sessione owner. La scheda Installati mostra invece uno stato incoerente e la verifica compatibilità usa un contesto diverso: rilievo registrato nel ledger, non corretto in questa qualificazione. La UI osserva circa 1 GiB libero; questo non costituisce una qualificazione di stabilità sotto carico.

Screenshot ispezionati a viewport 1920×1080, 2560×1440 e 3840×2160. Il browser ha restituito JPEG nonostante il suffisso operativo `.png`; dimensioni dei file 1920×1080, 2560×1440 e **3840×2089**. La terza cattura è parziale rispetto al viewport 4K; non viene attestata come immagine 3840×2160 completa. Il secondo tentativo con clip ha mostrato duplicazione visiva nella cattura e non viene promosso come prova di layout. Override del viewport rimosso. Queste immagini provano solo lo stato di ripristino, non un collaudo UI completo.

Rimangono non qualificati: percorsi completi dalle app/composer e ripresa nativa; guasti fisici/persistenza atomica fra store; modalità Pi incrementale; recupero tramite tool LCM; stabilità di lunga durata e pressione memoria; parità con l'intero catalogo strumenti. Nessuna modale Context Compactor è stata introdotta.

**Cosa deve fare l'owner:** esaminare il verdetto e decidere con Astra l'architettura della fase successiva. **Cosa faccio io dopo:** tradurre quella decisione in ledger di integrazione e cancelli reali. **Cosa rimane:** engine prodotto, backend, modale, autocompattazione e collaudo dalla chat; futura documentazione pubblica dopo revisione dei dati custoditi.
