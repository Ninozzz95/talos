# Kit di evidenze per TALOS desktop

**Audit parziale. Nessun benchmark di prodotto, nessuna patch di ottimizzazione TALOS certificata.**

Questo archivio contiene il report, strumenti autonomi di osservabilità, test e log reali dei tentativi di acquisizione. Non contiene il repository TALOS, modelli, chiavi API o binari desktop. Non sostituisce file dell'applicazione. Non installarlo copiando i file sopra la codebase.

## Contenuto

```text
REPORT_IT.html / REPORT_IT.md  Report con 31 fonti primarie e limiti espliciti
README_IT.md                  Istruzioni e limiti del kit
lib/                          Inventario, validazione tracce, statistiche
probes/                       Sonde Node e renderer
protocol/                     Contratto delle tracce e campagna non eseguita
tools/                        CLI di sola analisi/inventario
tests/                        Test Node e smoke test Chromium indipendente
evidence/                     Log reali, ambiente e stato della verifica
research/sources.json         Registro delle fonti
MANIFEST.sha256               Hash dei file del pacchetto, escluso il manifest stesso
LICENSE                       Licenza del solo codice indipendente del kit
```

## Test autonomi

Requisiti per i test Node: Node.js 22 o superiore e Git nel PATH. La verifica effettiva è avvenuta su Linux con Node 22.16.0; Windows non è stato testato. Estrarre in una directory separata e, da quella directory, eseguire:

```sh
npm test
```

Non occorre `npm install`: non vi sono dipendenze npm. I test dell'inventario creano repository Git temporanei, non modificano la configurazione Git globale e non usano il repository TALOS. La fixture che simula una directory mobile serve a verificare che non venga inclusa nell'inventario; non contiene sorgenti TALOS.

Lo smoke test opzionale richiede Python 3, il pacchetto Python `playwright` già disponibile e un eseguibile Chromium locale. Non scarica browser. Impostare `CHROMIUM_PATH` al percorso effettivo dell'eseguibile e poi eseguire:

```sh
python tests/browser_smoke.py
```

Nell'ambiente del collaudo il percorso era `/usr/bin/chromium`. La prova usa una pagina vuota controllata, non il desktop del prodotto. L'eccezione `--no-sandbox` presente nel test si attiva solo per la fixture root del container: non trasferire tale opzione a TALOS o alla navigazione reale.

Risultati finali inclusi: **68/68 test Node e uno smoke test Chromium superati**. `evidence/node-tests.tap` e `evidence/browser-smoke.json` sono le evidenze. Le durate del test runner e della pagina di prova non sono performance di TALOS.

## Inventario di un checkout reale

Servono la radice di un checkout Git e una directory di output già esistente. L'output non deve esistere, perché il comando non sovrascrive file. Esempio con percorsi da sostituire con quelli effettivi:

```sh
node tools/inventory.mjs "C:/src/talos" "C:/audit/inventory.json"
```

Per richiedere una baseline precisa, aggiungere come terzo argomento lo SHA completo atteso:

```sh
node tools/inventory.mjs "C:/src/talos" "C:/audit/pinned-inventory.json" SHA_COMPLETO_ATTESO
```

Il segnaposto `SHA_COMPLETO_ATTESO` deve essere sostituito: non è un hash valido. Il controllo rifiuta hash abbreviati, commit diverso, worktree modificato nei percorsi coperti, file essenziali mancanti e file non inventariati. Il primo comando raccoglie informazioni anche senza imporre questo controllo.

L'inventario legge `harness-ui`, `context-engine` e il percorso noto della release. Non segue symlink o espande submodule. Non ispeziona `mobile`. I nomi dei percorsi derivano dalla struttura documentata, ma **non dimostrano** che ogni file sia raggiungibile dall'app desktop. La verifica non certifica build, test, isolamento o compatibilità del prodotto.

Usare un checkout quiescente: questa non è una snapshot atomica contro modifiche concorrenti o ostili. Il report contiene nomi relativi dei file, hash e metadati di package; non contiene i loro testi. Anche i nomi possono essere riservati e vanno revisionati prima della condivisione. Gli errori operativi delle CLI possono riportare percorsi locali.

## Sonda Node: solo dopo verifica dell'entrypoint desktop

`startNodeProbe({directory, intervalMs, maxPendingSamples})` registra CPU, RSS ed event loop del solo processo in cui è importata. `directory` deve essere assoluta. La frequenza predefinita è un campione al secondo; la coda predefinita ammette otto campioni in attesa. Sono configurazioni del kit, non parametri ottimali misurati per TALOS.

L'oggetto restituito espone `file`, `sample()` e `stop()`. `stop()` è asincrono e idempotente: attenderlo nel percorso di chiusura verificato. L'intervallo non mantiene da solo in vita il processo. Un arresto forzato può lasciare il file privo del record finale: non trattarlo come registrazione completa.

`node-preload.mjs` usa `TALOS_AUDIT_DIRECTORY` e, facoltativamente, `TALOS_AUDIT_INTERVAL_MS`. L'attivazione con `--import` va limitata al processo Node realmente utilizzato dal desktop, dopo averne verificato il comando di avvio. **Non impostare globalmente NODE_OPTIONS, non iniettare in un Electron sconosciuto e non considerare un server isolato un benchmark desktop.** Non è stato determinato un comando TALOS compatibile da fornire come lancio automatico.

Il preload non aggiunge signal handler e segnala genericamente errori di avvio senza arrestare l'app. Una sonda non avviata significa evidenza assente, non consumo zero. La memoria della coda è limitata, ma il file cresce durante la sessione: non c'è rotazione automatica; applicare una policy di spazio e conservazione. L'overhead della sonda non è quantificato.

RSS riguarda il singolo PID. CPU è normalizzata rispetto a un core, non all'intera macchina. Il valore dell'event loop è quello osservato dall'API Node, non una latenza HTTP. La sonda non cattura prompt, file del progetto, variabili di ambiente, cookie, argomenti del processo o credenziali.

## Sonda renderer

Utilizzare `probes/renderer-probe.js` solo nei DevTools di un renderer già accessibile secondo la policy dell'applicazione. Non abilitare porte di remote debugging, Node integration o bypass della sandbox. Dopo aver caricato il contenuto del file nella console:

```js
TalosDesktopAudit.start({capacity: 6000});
// Eseguire la propria osservazione, quindi:
JSON.stringify(TalosDesktopAudit.stop(), null, 2);
```

L'esempio avvia soltanto la sonda. Non guida un agente, non rileva automaticamente il primo token e non genera una traccia di task completa. `mark(event, options)` consente annotazioni manuali; sono esplicitamente marcate `origin: "manual"`. Non sono equivalenti a hook strumentati.

La sonda conserva gli ultimi campioni entro `capacity`, espone il totale e quanti sono stati sovrascritti. I gap rAF non sono FPS. La sospensione del pannello resetta la continuità dei callback per evitare di classificare l'intervallo nascosto come blocco visibile. Le Long Tasks non supportate vengono indicate con `null`. `stop()` rimuove observer, listener e callback; il namespace globale resta disponibile per una nuova sessione. Ricaricare il renderer rimuove il codice iniettato.

## Tracce e analisi

`protocol/trace-template.json` contiene intenzionalmente metadati nulli e nessun evento. Deve essere completato con dati osservati: la CLI lo rifiuta finché non lo è. Un JSON vuoto non è un benchmark riuscito.

```sh
node tools/analyse-trace.mjs "C:/audit/run.json" "C:/audit/run-analysis.json"
```

Sono obbligatori identità della build, task, modello, run, clock, scope e origine. Eventi e metadati devono concordare su run e clock. Ogni richiesta al provider richiede `request_id`; ogni tool richiede `tool_call_id` e l'esito finale. `task_verified` richiede exit code zero del verificatore, il cui log va conservato separatamente.

La CLI analizza una traccia di un task con più richieste e tool; non valida l'intera policy dell'agente. Non autentica crittograficamente i dati. Una falsa dichiarazione dell'osservatore non diventa vera perché supera lo schema. Le metriche mancanti rimangono `null`.

I file NDJSON della sonda Node e gli snapshot renderer sono formati di osservazione differenti: **non sono automaticamente una traccia agentica consumabile dalla CLI**. Serve un driver strumentato verificato che produca il contratto in `protocol/TRACE_CONTRACT.md`. Non si uniscono clock diversi senza un meccanismo esplicito di calibrazione. Il kit non include tale driver, né una calibrazione cross-process.

## Evidenze e riproducibilità

`clone-attempts.json` documenta undici acquisizioni fallite per DNS; `environment.json` contiene il contesto della prova. `collect-preflight.original.py` è lo script storico esattamente usato per quelle evidenze: contiene i percorsi assoluti del laboratorio, non va lanciato come installer e non è il driver della campagna desktop.

I file `browser-smoke-*-attempt*` conservano tentativi precedenti senza esito positivo; `browser-smoke-randomuuid-regression.json` documenta il difetto della sonda poi corretto. `browser-smoke.json` è l'esecuzione finale superata. Il test finale usa la pagina controllata creata in memoria, non aggira il blocco amministrativo sulle URL `file:`.

L'indicatore `executed_product: false` e lo scope `independent_browser_fixture_not_talos` impediscono di confondere queste prove con un collaudo TALOS. La campagna reale in `protocol/campaign.json` resta `NOT_EXECUTED`.

## Compatibilità, licenze e limiti

Compatibilità del kit verificata: Node 22.16.0/Linux e Chromium 144.0.7559.96 nella fixture. Compatibilità TALOS/Windows/Electron: **non verificata**. Il solo fatto di non sovrascrivere file non prova compatibilità di integrazione.

La licenza MIT inclusa riguarda unicamente il codice indipendente di questo kit. Non modifica la licenza di TALOS o dei concorrenti. Nessun loro sorgente è redistribuito. Gli URL e i riferimenti bibliografici sono nel report e nel registro delle fonti.
