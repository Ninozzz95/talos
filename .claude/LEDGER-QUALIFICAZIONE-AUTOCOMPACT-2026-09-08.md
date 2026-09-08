# Qualificazione Autocompact — ledger esecutivo

08/09/2026. Owner: piano di qualificazione approvato esplicitamente. Sottosistema: benchmarks e documentazione. Nessuna API o funzione di prodotto viene modificata. Decisione owner: pausa delle nuove chiamate ripetitive senza progresso e richiesta di intervento; nessuna terminazione dei processi attivi. Questa politica sarà implementata nella fase prodotto, non simulata come già consegnata.

## Fonti e integrazione

Ricerca: `.claude/RICERCA-AUTOCOMPACT-ENGINE-2026-09-08.md`, riletta e approfondita 08/09. Fonti riconfermate prima degli edit: Pi SDK https://pi.dev/docs/latest/sdk; Hermes https://github.com/NousResearch/hermes-agent/tree/2237be355906fbe6065ce1815711eee52b2d646e; LCM https://github.com/stephenschoettler/hermes-lcm/tree/8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54; llama.cpp b10517 dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe. Pi pacchetto reale 0.85.1, MIT; API pubblica generateSummaryWithUsage. Hermes e LCM: sorgenti upstream integri in checkout isolati, MIT. Nessuna copia riscritta degli algoritmi. Dipendenze del banco separate dal package del prodotto.

## File posseduti

Creare:
- `harness-ui/benchmarks/autocompact/engines.mjs`
- `harness-ui/benchmarks/autocompact/README.md`
- `harness-ui/benchmarks/autocompact/package.json`
- `harness-ui/benchmarks/autocompact/package-lock.json`
- `harness-ui/benchmarks/autocompact/prepare.mjs`
- `harness-ui/benchmarks/autocompact/cases.mjs`
- `harness-ui/benchmarks/autocompact/runtime.mjs`
- `harness-ui/benchmarks/autocompact/qualification.mjs`
- `harness-ui/benchmarks/autocompact/qualification.test.mjs`
- `harness-ui/benchmarks/autocompact/python-worker.py`
- `.claude/LEDGER-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md`
- `.claude/CONSEGNA-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md`

Modificare: `.claude/RICERCA-AUTOCOMPACT-ENGINE-2026-09-08.md` con evidenze della qualificazione. Nessuna cancellazione. `.gitignore`, AGENTS.md, installazione Hermes dell'owner e store della 4174 esclusi.

Output del banco sotto `scratchpad/prove/autocompact-qualification-20260908`: `sources.json`, `datasets.json`, `runtime.json`, `requests.jsonl`, `results.jsonl`, `checks.json`, `summary.json`, `runtime.log`. Checkout upstream, dipendenze installate e database temporanei sono artefatti derivati; il manifest sources registra pin e hash. I log della cronologia privata rimangono locali e non vengono committati né inviati a servizi cloud.

## Simboli e contratto del banco

`cases.mjs`: export `loadRecoveredHistory`, `makeMemoryHistory`, `scoreRecall`, `validateSummary`, `writeCheckpoint`, `readCheckpoint`, `fixtureTools`. `runtime.mjs`: export `startRuntime`, `createRecorder`, `countRequest`, `complete`, `runReadOnlyTurn`. `prepare.mjs` e `qualification.mjs`: entrypoint CLI, nessun export pubblico. `python-worker.py`: entrypoint JSON stdin/stdout, funzioni interne di selezione upstream. Nessuna migrazione e nessun nuovo contratto pubblico TALOS. JSONL/checkpoint e routing del prodotto restano invariati.

Precisazione del confine benchmark: `runtime.mjs` espone anche `createLoopbackBridge`, unico trasporto per gli upstream Python, con credenziale effimera del banco e endpoint ammessi. Il confronto di componenti non viene etichettato come confronto completo delle applicazioni: il cancello dal composer TALOS rimane separato. Preflight salva prerequisiti mancanti e non genera punteggi per casi non eseguiti. Il riavvio del checkpoint del banco non dimostra da solo persistenza nativa dei competitor.

## RED, GREEN e prove reali

RED `AQ-01 checkpoint originale invariato`, `AQ-02 sintesi vuota o troncata rifiutata`, `AQ-03 nessuna riduzione rifiutata`, `AQ-04 errore persistenza conserva checkpoint`, `AQ-05 richiamo valutato sui riferimenti esatti`, `AQ-06 lettura confinata alla fixture`, `AQ-07 annullamento non pubblica checkpoint`. Comando: `node --test harness-ui/benchmarks/autocompact/qualification.test.mjs`; prima esecuzione deve fallire per modulo mancante, poi esercitare i singoli scenari. `git diff --check` alla consegna.

Cancello upstream: import del vero pacchetto Pi; caricamento delle versioni fissate Hermes/LCM; runtime llama reale con lo stesso GGUF, contesto 16384 e configurazione per tutti i bracci; richieste/risposte conservate anche negli errori. Non chiamare benchmark completo una prova di funzione o un mock. Esiti di framework e qualità dei modelli separati.

Scenari: ripresa checkpoint versione 6 (406 messaggi), memoria dopo cinque compattazioni, lettura reale di README.md, continuità dopo riavvio. Due modelli presenti, tre repliche per scenario/braccio. Se un prerequisito fallisce, il risultato è fallito/non eseguibile con evidenza, non successo e non test saltato silenziosamente. Domande in linguaggio naturale. Prove controllate di guasti separate dalle inferenze reali.

Prova visibile: composer del banco TALOS per il riferimento applicativo; per gli upstream, registrare esplicitamente componente/host usato. Nessuna funzione nuova viene promossa senza il successivo gate UI completo. Screenshot 1920x1080, 2560x1440, 3840x2160 quando si verifica la chat.

Rollback: arrestare esclusivamente processi creati dal banco, lasciare sorgenti e sessione owner intatti. Gli artefatti permettono replay; nessuna disinstallazione globale. Nessuna modifica ai modelli o alle impostazioni della 4174.

## Stato

Consegna preparazione: README, dossier e consegna aggiornati; 18 test controllati verdi. Prima tranche Nemotron: 15 casi conclusi prima della terminazione del processo (12 TALOS + 3 Pi ripresa). Il caso Pi memoria non concluso non viene promosso. Nuova esecuzione nascosta persistente avviata per i soli nove casi Pi mancanti; il modello della 4174 resta temporaneamente scaricato con consenso owner. Il ripristino è un passo obbligatorio prima di chiudere la campagna.

Hermes acquisito integralmente: 12.173 blob tutti verificati sul commit `2237be355906fbe6065ce1815711eee52b2d646e`, albero `c98901d7f46d1ab5213ef00e8ee5df989f9131b7`. Manifest completo locale `hermes-materialization.json`; la versione installata dell'owner resta invariata. Nessun blocco download residuo.

Revisione restante: AQ-17, risultato strumento negato o con suffisso non deve superare il banco; AQ-18, profilo Python deve dichiarare richiesta upstream e applicare temperatura=0, seed=193, max_tokens=4096 come il trasporto comune; AQ-12 deve comprendere anche interruzione durante lettura body. Per isolare quest'ultimo comportamento `runtime.mjs` aggiunge export `recordedRequest`. Un conteggio euristico viene conservato ma non promuove un checkpoint qualificato (`EXACT_COUNT_REQUIRED`). Nessuna modifica delle dipendenze prodotto.

Revisione delegata 08/09: AQ-16, SIGINT/SIGTERM durante sintesi poteva pubblicare un checkpoint e avviare la domanda seguente. Correzione del solo banco: AbortController comune, segnale controllato dopo ogni operazione lunga e passato alla pubblicazione; l'inferenza già avviata può terminare, ma non partono nuove richieste dopo lo stop. Nuovo test permanente di annullamento tra sintesi e checkpoint. Risultati del processo già avviato conservano la propria revisione del banco; le modifiche non vengono attribuite retroattivamente.

Trasporto acquisizione definitivo: jsDelivr rifiuta file non in cache perché il repository supera 50 MB; GitHub GraphQL autenticato tramite `gh` già configurato permette leggere 50 blob per richiesta, verificati contro l'albero ufficiale. I binari passano dal Git Blobs REST. Nessuna credenziale esportata o salvata nei log. Fonte GraphQL GitHub riletta 08/09. Il checkout completo richiede 12.173 hash corrispondenti; il primo scan ha verificato 4.503 file in cache.

Separazione per testare la conversione: nuovo file `engines.mjs`, export `toPiMessages`, `summarizeWithPi`, `createEngine`; funzioni interne `startPythonWorker`, `piResponse`, `modelDescriptor`. `AQ-13` esercita API pubblica Pi distribuita con risposte controllate e `AQ-15` la conservazione di testo/coppie tool nella conversione. `qualification.mjs` usa questi adapter di benchmark, senza scrivere protocolli nel prodotto. Il profilo Pi usa reserveTokens=5120 per ottenere maxTokens=4096 via regola upstream 0.8; il budget del contesto attivo rimane 12288.

Acquisizione Hermes: dopo 429 di codeload/raw, mirror pubblico jsDelivr al medesimo commit. La provenienza resta l'albero Git ufficiale; ogni byte dal mirror viene accettato solo se il Git blob hash coincide. Prima prova reale `agent/context_compressor.py`: 281432 byte, hash `e54c69eb5915ba7a4a4809f204c0a9ec04180cb2` uguale all'API GitHub. Normalizzazione CRLF dei soli byte di cache ammessa esclusivamente quando produce l'hash upstream esatto. Nessun algoritmo sostituito. Download riprendibile, massimo quattro richieste contemporanee; status ready solo dopo tutti i blob verificati.

08/09 prosecuzione: consenso owner ricevuto per scaricare temporaneamente il modello inattivo della 4174 e ricaricarlo dopo le prove. UI: tutte le sei sessioni in errore/interrotte/concluse, nessun giro attivo; modello Nemotron selezionato. Questo sostituisce la precedente attesa di consenso.

Adattamento preparazione dopo HTTP 429 anche su zipball ufficiale: Git Trees API restituisce il commit richiesto e l'albero completo non troncato `c98901d7f46d1ab5213ef00e8ee5df989f9131b7`, 12.173 blob. `prepare.mjs` aggiunge `--hermes-tree`: ricostruzione esatta da blob Git verificati SHA-1; riuso in sola lettura dei byte dell'installazione locale solo quando l'hash coincide; mancanti da raw.githubusercontent.com al commit fissato. Nessuna sostituzione della versione installata. Manifest derivati `hermes-tree.json` e `hermes-materialization.json`. Fonte riletta prima dell'edit: https://docs.github.com/en/rest/git/trees (08/09), Node child_process e README llama.cpp b10517. I file/simboli di prodotto restano esclusi.

Scenari aggiuntivi prima del trasporto: `AQ-11 conteggio prima del proxy Python`, `AQ-12 errore trasporto conservato`, `AQ-13 API pubblica Pi vuota/troncata/annullata`, `AQ-14 fallback conteggio dichiarato`. I test controllati non rappresentano inferenze reali. Il trasporto deve registrare errori e ripulire solo il processo proprio anche se avvio/props falliscono. Le inferenze dei componenti saranno distinte dal confronto completo delle applicazioni, ancora da eseguire.

Preparazione: RED modulo mancante osservato, primo GREEN 7/7. Pi 0.85.1 installato nel solo banco (165 pacchetti), import reale riuscito; prima misura import 9,4 s, RSS processo 146 MB: singola osservazione, non media né costo marginale attribuibile interamente a Pi. Hermes codeload e git clone rifiutati HTTP 429; nessun pin sostituito. La 4174 ha un llama-server attivo (PID 8112, parent 26680), non toccato; richiesta owner pendente per scaricarlo temporaneamente solo in assenza di giri attivi.

Revisione meccanica delegata: AQ-05 accettava sottostringhe. Nuovi scenari permanenti `AQ-08 sottostringhe e negazioni non valgono come richiamo`, `AQ-09 link fuori fixture rifiutato`, `AQ-10 checkpoint temporanei ripuliti e ingresso annullato`. La valutazione richiamo usa righe Nome/Ramo/Ticket/Progetto/Consegna con valori esatti; risposte libere restano nei log, non diventano automaticamente punteggi corretti. Fonti 08/09 prima della correzione: Node fs promises rename/realpath (https://nodejs.org/api/fs.html), MDN String.normalize (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize). Non è un giudice semantico LLM. Modifiche limitate a cases.mjs e qualification.test.mjs già posseduti.

AQ-08 RED riprodotto: tre risposte errate valutate corrette. AQ-09 inizialmente non eseguibile con symlink di file (EPERM Windows); usa junction di directory per esercitare il confine realpath senza privilegi aggiuntivi. Questa prova verifica il ramo di contenimento, non dimostra tutte le varianti di link del filesystem.

**Cosa deve fare l'owner:** nessuna azione per la preparazione. **Cosa faccio io dopo:** banco reale e registrazione degli esiti. **Cosa rimane:** qualificazione completa e scelta architetturale con l'owner; integrazione prodotto successiva.
