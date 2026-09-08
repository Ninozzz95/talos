# Qualificazione Autocompact — consegna del banco concluso

08/09/2026. Banco isolato implementato in `harness-ui/benchmarks/autocompact`. Nessuna API pubblica, modale o funzione prodotto modificata.

## Consegna finale

Matrice definitiva v2 del componente conclusa: **96 casi selezionati**, 132 grezzi conservati, 36 esclusioni motivate. **Nessun engine promosso.** Confronto completo delle applicazioni non qualificato: l'host Hermes rifiuta il profilo 16k e i test del checkpoint del banco non provano il riavvio nativo. Rapporto da leggere: `RISULTATI-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md`; indice privato `scratchpad/prove/autocompact-qualification-20260908/selected-cases-v2.json`.

GPT-OSS: 48/48 casi registrati, 9 pass esatti, 38 fallimenti, 1 risposta da revisione poi giudicata non supportata. Nemotron: 48/48 selezionati; i due casi coinvolti nel crash sono stati ripetuti una volta, stesso profilo, cinque compattazioni concluse in entrambi; gli insuccessi originali restano nei grezzi. La revisione semantica distingue perdita di fatti da lingua e formato.

Archivio di custodia definitivo verificato: `.claude/evidenze-private/autocompact-2026-09-08-v2.zip`, 2.860 artefatti più manifest, SHA256 `a8672a47738203fe7a23813442121f888a1fa91ce0f76cdca4f4ce6b25fe446f`. Dettagli in `CUSTODIA-BENCHMARK-AUTOCOMPACT-2026-09-08.md`. La v1 resta conservata; la v2 include tre prove strumenti riallineate alla domanda comune e dichiara le copie LCM delle fixture native incluse. Nessuna pubblicazione o copia remota.

Nemotron ripristinato sulla **4174**, finestra 16384, HTTP200 ready definitivo alle 18:28:53 UTC; Panoramica runtime conferma modello caricato dopo reload al primo ripristino. La scheda Installati ha una discrepanza di stato/compatibilità registrata separatamente; non è stata modificata. Screenshot ispezionati a 1080p/1440p/viewport 4K; il file della terza cattura è 3840×2089, quindi parziale. 26/26 test del banco verdi; controllo indipendente dei riferimenti dell'indice e dell'archivio. Nessun nuovo giro nella conversazione owner.

**Cosa deve fare l'owner:** decidere con Astra l'architettura successiva sulla base del rapporto. **Cosa faccio io dopo:** ledger e cancelli dell'integrazione scelta. **Cosa rimane:** engine prodotto, backend, modale, autocompattazione, recupero nativo e collaudo dalla chat; documentazione pubblica in una fase separata.

## Registro storico delle consegne intermedie

Le sezioni seguenti conservano ciò che era noto durante la campagna. Le indicazioni «in corso», «da avviare» e i PID storici sono superati dalla consegna finale sopra; i batch e i limiti metodologici restano parte della provenienza.

## Verificato

- Pi 0.85.1: pacchetto reale e API pubblica esercitati.
- Hermes v2026.9.7: commit `2237be355906fbe6065ce1815711eee52b2d646e`, 12.173 blob verificati. Blocco HTTP 429 risolto con GitHub Git/GraphQL. Installazione owner invariata.
- LCM `8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54`: plugin reale acquisito. Entrambi i worker Hermes/LCM si avviano con home isolate e moduli dal pin.
- Copia checkpoint 6, 406 messaggi, SHA-256 `b469c103933f7c71f30090309fc6aeb4d335d2c8639a156e8226a68e5bc22311`.
- Consenso owner per liberare temporaneamente il modello inattivo della 4174 e ripristinarlo a fine prove. Liberato tramite UI, nessun giro attivo nelle sei sessioni osservate.
- 26 test verdi, nessuno saltato, inclusi processo Python reale/Unicode, adattamento SSE, sintesi ausiliaria troncata e attribuzione campioni memoria. Limiti e confini nel README.

## Prima tranche reale

Artefatti: `scratchpad/prove/autocompact-qualification-20260908/runs/2026-09-08T15-21-39.086Z`. Nemotron Q4_0, hash GGUF verificato, finestra 16384, temperatura 0, seed 193, output 4096. Endpoint di conteggio installato funzionante.

| Componente / scenario | Esito osservato |
|---|---|
| TALOS / ripresa | 3/3 rifiuti: richiesta di sintesi 21.964 token contro finestra 16.384 |
| Pi API / ripresa | 3/3 rifiuti: richiesta di sintesi 18.208 token contro finestra 16.384 |
| TALOS / memoria sintetica | 3/3 con cinque riferimenti esatti dopo cinque compattazioni; 120, 118, 92 secondi |
| TALOS / file | 3/3 letture reali; risposte raw ricontrollate da agente in sola lettura, tutte con codice corretto |
| TALOS / continuità del banco | 3/3; nuovo processo lettore del checkpoint, non riavvio completo dell'app |

La prima tranche si è terminata senza summary finale durante i successivi scenari Pi. I 15 casi conclusi sono salvati; non si attribuisce successo al caso interrotto. Le correzioni del banco successive all'avvio non vengono attribuite retroattivamente a questa tranche.

## Aggiornamento esecutivo delle 18:40 circa

Pi/Nemotron, batch `2026-09-08T16-09-49.722Z`, 9/9 casi conclusi. Memoria: repliche 1/2 conservano 5/5 fatti semanticamente ma traducono giovedì in Thursday (4/5 esatti); replica 3 termina la quinta sintesi con finish_reason=length. Strumenti: tre letture reali, due formati esatti; la prima restituisce il codice corretto con testo aggiuntivo. Continuità resta del banco, non dell'app; sono presenti anche risposte con riferimenti personali sbagliati. Nessuna promozione.

Batch `2026-09-08T16-24-51.889Z`: **escluso dal confronto**. Due difetti del banco, ora coperti da AQ-19/AQ-20, rifiutavano streaming Hermes e alteravano UTF-8 nel worker Python. Tutti i grezzi rimangono conservati. La ripetizione corretta è `2026-09-08T16-35-51.581Z`, ancora in esecuzione. I tre casi Hermes/ripresa corretti sono rifiutati realmente: richiesta di sintesi 30.230 token > 16.384. La prima memoria Hermes si interrompe con sintesi troncata, respinta dall'upstream.

Protocollo v2 della memoria: aumentate a 72 le note intermedie per ottenere backlog sufficiente anche per LCM. I sei casi memoria TALOS/Pi v1 saranno ripetuti sul medesimo protocollo v2; non vengono confrontati automaticamente a condizioni diverse.

Host completo Hermes, con e senza plugin configurato: 12/12 avvii AIAgent (2 modelli × 2 configurazioni × 3) rifiutati dal minimo 64.000 token. Evidenza `native-host-gate-1788885443572/results.jsonl`. Il vincolo appartiene al codice upstream, non alla GPU né al trasporto; il provider del banco è custom/llama.cpp. Giri/tool/riavvii nativi restano non eseguiti per questo prerequisito. Non si attribuiscono loro punteggi inventati.

Guasti controllati: 20 caratterizzazioni in `faults/2026-09-08T16-36-41.379Z`. TALOS restituisce anche una sintesi troncata; Pi la rifiuta; Hermes torna alla cronologia precedente. LCM restituisce contesti ridotti anche per alcuni guasti di sintesi, da analizzare con archivio/recupero separati. Tutti gli original.json sono invariati. Gli errori di persistenza/annullamento lasciano il checkpoint del banco invariato in tutti e quattro i bracci. Non sono prove di filesystem guasto o persistenza nativa delle app.

Verifica SQLite indipendente del delegato: LCM conserva 76/76 originali identici in tutti i cinque guasti. Nel caso troncato il nodo sintetico contiene però esattamente il testo ricevuto con finish_reason=length. AQ-21 riproduce e corregge la perdita di quel metadato nel wrapper del banco; la seconda esecuzione dei 20 guasti respinge ora anche LCM empty/truncated. Il caso di output troppo lungo LCM riduce tramite estratti ed è registrato come pubblicato: va distinto dal caso di contesto finale non ridotto, che la guardia rifiuta. Il DB LCM può essere già cambiato prima della guardia esterna, quindi questa prova non certifica atomicità tra i due store.

Memoria: Ryzen 7 7800X3D, RX 9070 XT, driver 32.0.31041.1004, Windows 11 Pro build 26200; inventario in `hardware-inventory.json`. Campionamento massimo osservato, non picco assoluto. AQ-M03 corregge una possibile attribuzione del campione alla replica successiva; i batch precedenti mantengono il limite documentato.

## Aggiornamento 19:33 circa: 42/96 casi del componente conclusi

Il batch Nemotron/Hermes/LCM `16:35` è stato interrotto a 22/24, senza summary: i risultati completi restano validi con i limiti dello snapshot, quello parziale non viene valutato. Hermes: tre riprese rifiutate 30.230 > 16.384; gli altri nove casi falliscono alla prima sintesi con finish_reason=length. Il codice finale SUMMARY_NO_REDUCTION era la guardia esterna: la causa reale è il troncamento, verificato nei raw.

LCM, memoria v2: tre repliche, cinque compattazioni effettive ciascuna, tutti i conteggi esatti. Richiamo dei cinque fatti: **0/5, 3/5, 0/5 esatti**, **0/5, 4/5, 0/5 semantici**. La seconda replica traduce giovedì ma perde anche il nome Livia. Tutte le 18 risposte ausiliarie sono stop/non vuote. SQLite conserva 368 messaggi per replica, inclusi 76/76 originali esatti. Questa è una misura del richiamo nel contesto attivo; il tool loop comune non espone il recupero LCM, quindi non certifica perdita dell'archivio o fallimento dei suoi tool di ricerca.

LCM, ripresa: una risposta genericamente compatibile e due risposte con obiettivi di correzione inventati. La cronologia reale contiene 397 copie dello stesso elenco di sette file e nessun incarico di correggere parser o test. LCM, strumenti: tre letture reali del file, codice sole-47 corretto in tutte; tre violazioni del formato breve richiesto. Nessuna equivalenza fra queste violazioni e un tool non funzionante.

La continuità LCM è stata completata nel batch `2026-09-08T17-26-00.757Z`: **1/3 esatto, 2/3 semanticamente completo**; nella replica 1 il nome viene sostituito con Aurora. Replica 2 conserva i fatti ma cambia trattino e lingua. Sono riavvii del checkpoint del banco, mai dell'app Hermes. La replica 1 precedente resta diagnostica e non viene contata due volte. Originale recuperato invariato, tre casi registrati su tre.

Il processo operativo avviato con WMI ha completato questa tranche; l'exit 2 dei due casi falliti ha fermato prudentemente la coda. Dopo verifica del summary integro, i sei casi memoria Nemotron TALOS/Pi sono stati avviati separatamente, PID 18712. GPT-OSS non ancora avviato. Server 4174 PID 21016, health 200 e pagina visibile; modello da ricaricare al termine, nessuna inferenza concorrente della app.

Provenienza estesa: quattro copie esterne con hash verificati e inventario Python salvato nel nuovo batch. L'equivalenza del compattatore TALOS con il kernel corrente è verificata; l'equivalenza del loop completo non viene dichiarata. Tre agenti hanno controllato separatamente raw/richiamo, guasti/archivi e riproducibilità/misure. Nessun agente ha modificato prodotto o piani.

## Costi di integrazione osservabili — confronto ancora provvisorio

| Candidato | Confine provato | Lavoro residuo nel prodotto |
|---|---|---|
| TALOS | Funzione Node e callback locale | Budget prima della sintesi, storico oltre finestra, checkpoint transazionale e stop |
| Pi | Pacchetto Node MIT; 165 dipendenze installate nel banco | Adapter messaggi, segmentazione/riserve, verifica vuoto/annullamento, archivio TALOS; dipendenze CLI/TUI da valutare |
| Hermes | Compattatore Python MIT | Sidecar/host, dipendenze, ciclo di vita, routing ausiliario, archivio/store |
| Hermes + LCM | Plugin MIT, motore e SQLite caricati | Costo host più DB/migrazioni, indicizzazione, tool di recupero, policy e sessioni |

Nessuna stima in giorni inventata. Raccomandazione provvisoria: non promuovere un engine. La API Pi da sola non risolve la ripresa oltre limite; servono le prove degli altri candidati e una scelta di architettura con l'owner.

**Cosa deve fare l'owner:** nessuna scelta ora. **Cosa faccio io dopo:** casi mancanti e ripristino modello 4174. **Cosa rimane:** confronto completo, guasti nativi, decisione engine, backend, modale e verifica dalla chat.
