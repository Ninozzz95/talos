# Qualificazione Autocompact

Banco locale separato da prodotto, API pubbliche e dipendenze TALOS. Il ledger `.claude/LEDGER-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md` definisce la fase esecutiva.

## Comandi

Da questa directory, Windows, Node >=22.19 e `gh` già autenticato:

```powershell
rtk proxy npm ci --ignore-scripts --no-audit --no-fund
rtk proxy node prepare.mjs --lcm-only
rtk proxy node prepare.mjs --hermes-tree
rtk proxy node --test qualification.test.mjs
rtk proxy node --test measurements.test.mjs native-host.test.mjs
rtk proxy node faults.mjs
rtk proxy node qualification.mjs
rtk proxy node qualification.mjs --run
```

Preparazione: copia recuperata già presente in `scratchpad/prove/recupero-locale-20260908/sessions/8407d564-f7a0-4e4c-b737-ca5851046a50.jsonl`; checkpoint 6, 406 messaggi e hash verificati. Nessuna scrittura nello store owner. `--hermes-tree` ricostruisce il commit completo tramite GitHub Git/GraphQL, verificando ciascun blob. La cache nell'installazione locale viene letta e riusata solo se coincide con l'hash upstream. L'installazione owner non viene aggiornata.

Il run completo comprende 96 casi: 4 bracci × 4 scenari × 2 modelli × 3 repliche. Un modello e una richiesta alla volta. Richiede GGUF presenti, llama.cpp b10517 Vulkan e Python/dependency environment Hermes. Il banco rifiuta l'avvio se esiste già un llama-server: liberarlo dalla app soltanto con consenso owner e nessun giro attivo, poi ricaricarlo al termine.

Filtri: `--models=nemotron|gptoss|all`, `--arms=talos,pi,hermes,lcm`, `--scenarios=resume,memory,tools,continuity`, `--repetitions=1|2|3`. Una selezione ridotta non è la matrice completa. Directory di run separate conservano tutti gli esiti, compresi gli errori.

## Confini e profilo

- Pi 0.85.1: API pubblica `generateSummaryWithUsage`, reserveTokens 5120 → maxTokens 4096 secondo regola upstream 0.8; retry del banco disabilitati. Conversione di tool call/result con id conservati; sistema storico rappresentato come dato da sintetizzare.
- TALOS: `compattaConversazione` del modulo owner `AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`, hash registrato. Il successivo tool loop del banco non è quello del prodotto.
- Hermes: `ContextCompressor`, commit `2237be355906fbe6065ce1815711eee52b2d646e`, home isolata, abort_on_summary_failure=true.
- LCM: `LCMEngine`, commit `8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54`, SQLite isolato; tail 6 messaggi/max 2048 token, leaf chunk 4096, riserva 4096. Modello di sintesi locale esplicito, nessun fallback configurato.
- Trasporto comune non streaming: temperatura 0, seed 193, output 4096, finestra 16384. Il ponte registra la richiesta upstream prima di applicare il profilo. I prompt intrinseci degli engine restano diversi.
- Per il client Hermes che richiede streaming, il ponte adatta il risultato completo in SSE bufferizzato, conservando contenuto, reasoning, finish reason e usage. Non misura tempo al primo token né cancellazione di stream reale. Python usa `-X utf8`, con prova reale del round trip Unicode.
- Protocollo memoria v2: 72 note distinte per ciclo dopo la prima compattazione, senza ripetere i fatti iniziali. La v1 con 24 note poteva rimanere sotto la soglia leaf di LCM anche con force=True. Non aggregare le due versioni.
- Conteggio via endpoint installato `input_tokens`, provato prima dell'inferenza. Fallback caratteri/4 dichiarato e incapace di promuovere il cancello di budget.
- Il worker Python raggiunge il solo ponte locale; il controllo sui socket rifiuta destinazioni esterne. È una protezione del percorso del banco, non un sandbox di sistema certificato.

## Significato degli esiti

`passed-component-case` indica soltanto componente e tool loop comune. **Non promuove l'engine nel prodotto.** `fullQualificationComplete` resta falso finché mancano prove complete di applicazioni/composer, riavvio/store nativi, guasti degli upstream e memoria server/GPU.

La ripresa owner richiede revisione umana dei riferimenti. La memoria sintetica valuta cinque valori su righe etichettate; non è un giudice semantico. I fatti sono nel primo messaggio utente: un engine che lo conserva può superarli senza riassumerli. Nessuna generalizzazione sulla memoria arbitraria.

`leggi` legge realmente solo README.md della fixture. Non espone scritture. La continuità usa un nuovo processo Node per leggere il checkpoint del banco e riavvia il worker Python quando presente. Non dimostra il riavvio completo TALOS/Hermes o il recupero tramite i tool LCM.

`faults.mjs` esercita le quattro API reali con risposte di trasporto controllate: vuoto, troncamento, annullamento, errore prima del rename e nessuna riduzione. Il conteggio in questi test è controllato/euristico, non quello di un modello. L'errore di persistenza è iniettato prima della pubblicazione, non prodotto da un guasto fisico. Il checkpoint riguarda il banco; non dimostra transazioni native dell'app. Un fallback LCM può pubblicare un contesto ridotto anche dopo una risposta invalida: controllare separatamente gli originali archiviati e l'effettiva recuperabilità.

`native-host.mjs` / `python-app-worker.py` usano AIAgent e SessionDB nativi. L'avvio con provider custom e finestra 16384 è rifiutato dal minimo 64000 in Hermes al pin scelto: nessuna falsificazione della finestra o del provider. Sono provati i cancelli di configurazione e l'avvio reale; i successivi metodi di giro/compattazione/persistenza non hanno superato questo prerequisito e non sono qualificati.

## Artefatti

Sotto `scratchpad/prove/autocompact-qualification-20260908`: pin e hash in `sources.json`, `hermes-tree.json`, `hermes-materialization.json`; copie in `datasets.json`; fixture reale in `fixture/README.md`.

Ogni directory `runs/<data>` contiene `checks.json`, `hardware.json`, `requests.jsonl`, `runtime.log`, originali e checkpoint dei casi, sintesi native, `results.jsonl`, `summary.json`. I log contengono cronologia privata: rimangono locali, esclusi dai commit e dai servizi cloud. Nessuna API key owner è passata agli engine.

Dal protocollo v2, `scripts/` conserva gli script del run e `checks.json` include SHA256 degli script e del binario. Gli eventi `memory-sample` misurano il solo processo llama figlio del banco e i contatori GPU dello stesso PID. Il massimo è osservato ogni 5 secondi più il tempo della sonda; un contatore assente resta null. I batch antecedenti non acquisiscono queste misure retroattivamente.

SIGINT/SIGTERM fermano i nuovi passi dopo l'operazione già avviata. Si chiudono soltanto processi creati dal banco. Il rollback conserva modelli su disco, impostazioni e sessioni owner.
