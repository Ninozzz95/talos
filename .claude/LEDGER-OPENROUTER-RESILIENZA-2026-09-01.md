# Ledger a livello di codice — OpenRouter resiliente e switch modello fluido

Data: 2026-09-01  
Stato: **GREEN sintetico, visivo e upstream reale**. Stato iniziale misurato:
timeout Qwen a 180 s e reasoning
incompatibile dopo cambio modello, entrambi conservati nel JSONL reale.

## File esatti

### Creare

- `.claude/DOSSIER-RICERCA-OPENROUTER-RESILIENZA-2026-09-01.md`
- `.claude/LEDGER-OPENROUTER-RESILIENZA-2026-09-01.md`
- `.claude/CONSEGNA-OPENROUTER-RESILIENZA-2026-09-01.md`

### Modificare

- `harness-ui/src/runtime-owner-adapter.mjs`
- `harness-ui/package.json`
- `harness-ui/package-lock.json`
- `harness-ui/src/model-catalog.mjs`
- `harness-ui/src/agent-service.mjs`
- `harness-ui/server.mjs`
- `harness-ui/public/app.js`
- `harness-ui/public/styles.css`
- `harness-ui/tests/runtime-owner-adapter.test.mjs`
- `harness-ui/tests/model-catalog.test.mjs`
- `harness-ui/tests/agent-service.test.mjs`
- `harness-ui/tests/session-registry.test.mjs`
- `harness-ui/tests/response-activity-indicator.test.mjs`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `.claude/DOSSIER-RICERCA-ATTIVITA-RISPOSTA-2026-09-01.md`
- `.claude/LEDGER-ATTIVITA-RISPOSTA-2026-09-01.md`
- `.claude/CONSEGNA-ATTIVITA-RISPOSTA-2026-09-01.md`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`

### Eliminare

- Nessuno.

## Simboli pubblici e compatibilità

- `creaFetchOpenRouterResiliente(fetchDiRete, options)`: adapter streaming
  desktop che conserva firma Fetch/Response e stop utente.
- `normalizzaReasoningPerModello(reasoning, capability)`: elimina valori non
  supportati e impedisce `none` sui modelli mandatory.
- `createOwnerRuntimeAdapter(options)`: resta compatibile; riceve in aggiunta
  una lettura lazy delle impostazioni provider e delle capacità catalogo.
- `createModelCatalog().trova(id)` o equivalente cache-safe: restituisce
  capacità reasoning normalizzate senza esporre il wire OpenRouter alla UI.
- `RunStarted.contesto.modello` e `.reasoning`: estensione compatibile del
  contesto esistente, persistita dal JSONL.
- `state.realSession.currentRunModel`: stato UI ricostruibile soltanto dal
  `RunStarted` corrente; non sostituisce il contratto persistito.
- `effortCompatibilePerModello(modello, effortCorrente)`: helper privato UI che
  produce il patch atomico modello/reasoning prima di mutare la pillola.
- Il contratto `aggiornaImpostazioni` conserva `modello`, `modelId`, reasoning
  e permessi; nessun record storico viene riscritto.

`harness-ui/src/session-registry.mjs` non richiede modifiche per questa slice:
la sua scrittura append-only `impostazioni-sessione` accetta già modello e
reasoning nella stessa operazione e il test di continuità esercita quel
contratto esistente.

## RED permanenti

1. `OPENROUTER-IDLE-01` — una richiesta attiva oltre 180 s ma con keepalive
   non viene abortita; un vero silenzio supera `timeoutSeconds` e fallisce.
2. `OPENROUTER-RETRY-02` — timeout/errore SSE prima del primo output è
   ritentabile; dopo testo/tool output non viene ritentato né duplicato.
3. `OPENROUTER-STOP-03` — stop utente interrompe immediatamente e non viene
   convertito in retry.
4. `MODEL-REASONING-04` — un modello mandatory non riceve `effort:none`; un
   modello normale conserva l'effort supportato.
5. `MODEL-SWITCH-CONTINUITY-05` — Qwen → altro modello → Qwen conserva ordine
   dei messaggi, tool call/result e applica il nuovo modello solo al turno
   successivo.
6. `MODEL-SWITCH-RELOAD-06` — ricarica/ripresa usa modello e reasoning
   persistiti senza tornare a un default.
7. `RUN-MODEL-TRACE-07` — ogni `RunStarted` registra modello/reasoning usati;
   UI e export attribuiscono le risposte al turno corretto.
8. `RESPONSE-ACTIVITY-DOTS-08` — i tre punti si muovono chiaramente con token
   motion; shimmer/barra/sweep estranei non esistono; reduced motion è statico.
9. `OPENROUTER-REAL-QWEN-09` — composer reale, tre tool call, follow-up,
   cambio modello solo di impostazione e reload restano coerenti; la rete usa
   esclusivamente `qwen/qwen3.8-flash`.
10. `RUN-MODEL-RESUME-RACE-10` — un `RunStarted` visto dal vecchio stream
    mentre la POST di follow-up è ancora in corso non viene azzerato dalla
    preparazione del nuovo giro.

## Sequenza TDD e gate

1. Aggiungere i RED e osservare il fallimento mirato.
2. Integrare `eventsource-parser@4.1.0` (MIT), poi implementare adapter
   trasporto e capacità reasoning; focused test.
3. Implementare persistenza/trace per-turno e continuità; focused test.
4. Semplificare il logo ai tre punti animati; contratto + browser test.
5. Suite backend completa, suite browser completa, `git diff --check`.
6. Solo dopo autorizzazione fresca al riavvio: caricare il nuovo backend su
   `4174`, health/Doctor, messaggio reale Qwen autorizzato, switch sintetico a
   modello diverso, ritorno a Qwen con follow-up reale, reload e ispezione
   completa di cronologia/tool trace/modello per turno.

Il gate reale non invia richieste ad altri modelli senza autorizzazione:
l'altro ramo è provato con upstream finto deterministico; la rete reale usa
solo `qwen/qwen3.8-flash`.

## Autorizzazione operativa permanente del 2026-09-01

L'owner autorizza da questo momento il controllo completo dei riavvii del solo
processo desktop in ascolto su `127.0.0.1:4174`, senza richiesta preventiva a
ogni ciclo. Prima e dopo ogni riavvio restano obbligatori: risoluzione del PID
listener, verifica della command line e della cartella di lavoro, controllo
porta e health, e divieto di terminare processi estranei. Push e release non
sono autorizzati da questa regola.

## Gate reale chiuso

- Sessione: `a6f6bd06-cbc7-4a51-8d1a-9e1359aca756`.
- Due turni reali, entrambi con `qwen/qwen3.8-flash`.
- Tool trace reale: `cerca`, `elenca`, `leggi`; due `RunFinished success`.
- Gemini è stato soltanto selezionato e persistito, mai chiamato.
- Follow-up e reload conservano testo, tool trace e attribuzione per turno.

## Rollback

Ripristinare l'adapter Fetch precedente, rimuovere solo i nuovi metadati da
`RunStarted` e ripristinare il loader a tre punti statico. I JSONL restano
compatibili perché i nuovi campi sono additivi; nessuna migrazione distruttiva.
