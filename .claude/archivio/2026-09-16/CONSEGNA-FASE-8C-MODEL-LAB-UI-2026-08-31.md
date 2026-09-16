# Consegna — Fase 8C Model Lab UI (2026-08-31)

## Esito semplice

Il Laboratorio modelli desktop ora legge lo stato reale dei runtime locali e
dei manifest installati dal server. Se un runtime non è raggiungibile o non
ha modelli osservati, i controlli restano disabilitati e spiegano il motivo.
Quando esiste un runtime osservato con un modello, la UI permette di avviare
una sessione locale reale e mostra lo stream in blocchi distinti (risposta,
ragionamento, tool call, errore). Nessuna chiave o percorso assoluto viene
mandato al browser.

## Modifiche effettuate

- `harness-ui/src/http-app.mjs`: `GET /api/v1/runtime` include `models: []` e,
  quando possibile, i modelli restituiti da `listModels()`; gli errori sono
  esposti solo come codice `modelsError`.
- `harness-ui/tests/http-routes-model-lab.test.mjs`: copertura modelli runtime
  e fallimento catalogo.
- `mobile/public/harness-ui/index.html`: pannello runtime, selettori backend/
  modello, prova/cancel, stream e lista manifest installati.
- `mobile/public/harness-ui/app.js`: caricamento runtime/manifest, gating,
  avvio sessione locale, SSE `EventSource`, blocchi separati e cleanup.
- `mobile/public/harness-ui/styles.css`: stili tokenizzati per stati runtime,
  manifest e blocchi stream.
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`: 5 scenari Model Lab
  nuovi (runtime, installati, gating, stream, no-secret).
- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md`: Task 8
  aggiornato con il buco server scoperto e chiuso.
- `.claude/LEDGER-FASE-8C-MODEL-LAB-UI-2026-08-31.md`: ledger esecutivo.

## Ricerca e decisione upstream

Sono state consultate le fonti ufficiali MDN su SSE/EventSource e
AbortController e la specifica AG-UI sugli eventi reasoning/tool. La scelta è
riusare le API native del browser e gli eventi già normalizzati dal server,
senza dipendenze nuove: SSE è un canale server→browser, mentre cancel resta un
POST separato con il contratto già esistente.

Confronto sintetico: Hermes offre provider/fallback centralizzati; Ollama è
semplice ma con capability parziali; LM Studio espone lifecycle load/unload;
Claude/Codex separano attività e risposta. TALOS aggiunge evidenza osservata,
gating esplicito, identità runtime/modello e blocchi AG-UI tipizzati senza
fallback impliciti.

## Verifica

- `node --test harness-ui/tests/http-routes-model-lab.test.mjs` → **8/8**.
- `npm exec vitest run tests/unit/harness/harnessUiFrontend.test.ts` → **52/52**.
- RED osservato prima dell'implementazione per il nuovo contratto runtime e
  per i quattro comportamenti UI.
- `node --test harness-ui/tests/*.test.mjs` → **1037/1037** pass, 0 fail.
- `npm run typecheck` (mobile) → exit 0; `node --check mobile/public/harness-ui/app.js`
  e `git diff --check` → puliti.
- Smoke server locale: `/api/v1/runtime` e `/` → HTTP 200; con i runtime non
  installati la risposta resta `unknown`/`RUNTIME_UNREACHABLE` e `models: []`.
- La suite mobile completa non è un gate chiuso di questa fase: contiene
  fallimenti preesistenti fuori perimetro (conformance Git Bash, shadcn e
  asset Android) ed è stata interrotta dopo la loro rilevazione.
- La verifica visiva Chrome 1440×900 e 1024×800, reload/reduced-motion e prova
  contro un runtime reale non sono ancora chiuse: appartengono al gate CDP del
  Task 9. In questa lane non sono stati avviati runtime locali né modificato il
  worktree mobile separato.

## Gating noto

- Il wiring server desktop non collega ancora `hf-model-transfer`: importazione
  `.gguf` resta correttamente disabilitata se la sorgente approvata non esiste.
- Se Ollama, LM Studio o llama.cpp non sono installati, la UI mostra `unknown`/
  `non raggiunto`; non simula un modello pronto.
- La prova runtime usa il primo task reale restituito da `/api/v1/tasks`; non
  esegue comandi dal browser e il cancel passa sempre dalla route server.

## Rollback

Ripristinare gli otto file di codice/test elencati sopra. Le route e i moduli
Task 0–7 restano invariati salvo l'estensione non distruttiva di
`GET /api/v1/runtime`.

## Stato consegna

- [x] Ledger aggiornato
- [x] Test RED/GREEN focalizzati
- [ ] Suite completa e CDP visivo (Task 9)
- [ ] Commit (non eseguito: manca autorizzazione esplicita in questa fase)
- [ ] Push (mai eseguito)
