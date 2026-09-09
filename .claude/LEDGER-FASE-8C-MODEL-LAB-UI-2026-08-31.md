# Ledger esecutivo — Fase 8C Model Lab UI (2026-08-31)

## Perimetro

Ownership desktop: `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop`.
I file sotto `mobile/public/harness-ui/` sono il bundle statico canonico già
venduto dal server desktop (`config.mjs` → `mobile/public/harness-ui/`); non
si modifica il worktree mobile separato né il codice Android.

Obiettivo: rendere il Laboratorio modelli operativo soltanto dove il server
desktop espone una capability osservata. Il browser non avvia processi, non
riceve segreti e non mostra percentuali o stati inventati.

## Ricerca upstream obbligatoria e decisione

- MDN, Server-sent events: `EventSource` è il client nativo per un canale
  unidirezionale e deve gestire `error`/`close` esplicitamente:
  https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- MDN, Using server-sent events: il formato è `text/event-stream`, gli eventi
  nominati si consumano con `addEventListener` e il client non usa SSE per
  inviare dati al server:
  https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- MDN, AbortController: `abort()` interrompe fetch, response body e stream:
  https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort
- AG-UI Events: reasoning e tool call hanno lifecycle separati e identificatori
  dedicati (`ReasoningMessage*`, `ToolCall*`), quindi non vanno concatenati nel
  testo dell'assistente:
  https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx

Decisione TALOS: adottare le API native `fetch` + `EventSource`, adattare gli
eventi già normalizzati dal server (`Run*`, `TextMessage*`, `ReasoningMessage*`,
`ToolCall*`, `RuntimeFallback`) e mantenere il fallback cloud esplicito. Nessuna
dipendenza frontend nuova e nessun parser proprietario.

## File e simboli

### Modificare

1. `mobile/public/harness-ui/index.html`
   - aggiungere controlli runtime (`#modelLabRuntimeList`,
     `#modelLabRuntimeRefresh`, `#modelLabRuntimeStatus`), import/installati
     (`#modelLabInstalledList`) e una superficie di prova (`#modelLabPrompt`,
     `#modelLabRunButton`, `#modelLabCancelButton`, `#modelLabStream`).
2. `mobile/public/harness-ui/app.js`
   - estendere `state.modelLab` con runtime, modelli locali, sessione di prova,
     stream ed errore;
   - aggiungere `apiPostJson`, `caricaRuntimeModelLab`,
     `caricaModelliLocaliModelLab`, `renderizzaRuntimeModelLab`,
     `renderizzaModelliLocaliModelLab`, `avviaProvaRuntimeModelLab`,
     `annullaProvaRuntimeModelLab`, `collegaEventiProvaModelLab`;
   - usare solo `/api/v1/runtime`, `/api/v1/local-models`,
     `/api/v1/sessions`, `/api/v1/sessions/:id/events`,
     `/api/v1/sessions/:id/cancel`.
3. `mobile/public/harness-ui/styles.css`
   - stile minimo per lista runtime, badge capability, stream separato e stati
     gated/errore; riuso dei token esistenti.
4. `mobile/tests/unit/harness/harnessUiFrontend.test.ts`
   - nuovi test RED/GREEN per stato runtime, modelli locali, no-secret e stream
     separato.
5. `harness-ui/src/http-app.mjs`
   - estendere la risposta esistente di `GET /api/v1/runtime` con `models`
     ottenuti dall'adapter `listModels()` soltanto quando il runtime è
     osservato; un errore di catalogo resta `modelsError`, non rende il runtime
     falsamente disponibile o vuoto.
6. `harness-ui/tests/http-routes-model-lab.test.mjs`
   - estendere `HTTP-LOCAL-RUNTIME-01` con modelli reali e aggiungere il caso
     inverso `HTTP-LOCAL-RUNTIME-MODELS-ERROR-01`.

### Non modificare

- Gli altri file `harness-ui/src/**`: il solo contratto `GET /api/v1/runtime`
  viene esteso perché l'ispezione ha dimostrato che senza `modelId` osservati
  nessuna sessione locale può essere avviata onestamente dalla UI.
- `mobile/` del worktree AVM separato, Android nativo, TALOS-BANCO e
  `AVM-harness-ui`.

## RED → GREEN

- RED 1 `CODE-MODEL-LAB-RUNTIME-STATUS-01`: una risposta `/api/v1/runtime`
  con `detected`/`ready` deve sostituire il badge gated e mostrare backend,
  contesto osservato e timestamp; prima dell'implementazione il DOM non ha i
  controlli e il test fallisce.
- RED 2 `CODE-MODEL-LAB-INSTALLED-01`: `/api/v1/local-models` popola la lista
  con hash, licenza, origine e stato; nessun path assoluto o token appare.
- RED 3 `CODE-MODEL-LAB-STREAM-01`: uno stream AG-UI produce blocchi distinti
  testo/reasoning/tool/errore; reasoning e tool non entrano nel testo normale.
- RED 4 `CODE-MODEL-LAB-GATED-01`: runtime non pronto disabilita run/load/import
  e mostra il motivo reale.
- RED 5 `CODE-MODEL-LAB-NO-SECRET-02`: il bundle non contiene chiavi, header
  Authorization o path assoluti e invia solo identificatori scelti.
- RED 0 `HTTP-LOCAL-RUNTIME-01`: il runtime osservato deve includere i modelli
  restituiti dall'adapter; prima della modifica `models` è assente.

Comandi focalizzati:

```powershell
cd mobile
npm exec vitest run tests/unit/harness/harnessUiFrontend.test.ts
```

Regressioni:

```powershell
cd mobile
npm run typecheck
npm exec vitest run
cd ..
node --test harness-ui/tests/*.test.mjs
node --check mobile/public/harness-ui/app.js
git diff --check
```

## Prova upstream e UI

- Prova reale server: `GET /api/v1/runtime` e `GET /api/v1/local-models` su
  loopback; se Ollama/LM Studio/llama.cpp non sono installati lo stato resta
  `unknown/unavailable`, mai `ready`.
- Prova visiva desktop: Chrome locale a 1440×900 e 1024×800; panoramica,
  runtime disponibile, runtime assente, lista vuota, errore API, reduced-motion,
  reload. Ogni screenshot va ispezionato interamente.
- Confronto competitivo: Hermes (provider/lifecycle), Ollama (semplicità
  endpoint), LM Studio (load/unload osservabili), Claude/Codex (stream con
  reasoning/tool separati). One-up TALOS: stato osservato + motivo gated +
  identità runtime/modello + stream AG-UI tipizzato, senza fallback impliciti.

## Rollback

Ripristinare i quattro file modificati di questa fase. Le API server e i Task
0–7 restano intatti; nessun modello o processo viene rimosso dal rollback UI.

## Stato

- [x] RED osservato
- [x] GREEN focalizzato
- [x] suite regressione focalizzata (8/8 server, 52/52 frontend)
- [ ] prova visiva Chrome
- [x] consegna aggiornata
- [ ] commit (solo su autorizzazione owner)
