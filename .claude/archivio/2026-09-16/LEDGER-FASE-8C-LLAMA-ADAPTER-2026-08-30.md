# Ledger Fase 8C — adapter llama-server e stream — 2026-08-30

## Perimetro

Ownership desktop: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui`.
L’adapter consuma il supervisor e normalizza l’API llama.cpp; non esegue tool,
non applica policy, non modifica UI/mobile e non abilita fallback cloud.

## File e simboli

| Azione | File | Simboli pubblici | Scopo |
|---|---|---|---|
| Crea | `harness-ui/src/local-runtime-llama-server.mjs` | `LlamaServerRuntimeError`, `createLlamaServerRuntime(options)` | probe, modelli, load/unload, SSE, cancel, health, metrics |
| Crea | `harness-ui/tests/local-runtime-llama-server.test.mjs` | 5 test Node | API, SSE, separazione canali, errori e abort |
| Modifica | `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` | Task 3 | esito e gate della fase |

## Contratto e flusso

- `probe()` legge `/v1/props`; `listModels()` legge `/v1/models` e richiede
  `data[]`.
- `load()`/`unload()` delegano al supervisor; nessun processo viene creato qui.
- `generateStream()` invia `stream:true` a `/v1/chat/completions`, legge SSE
  line-by-line e produce envelope TALOS con `text`, `reasoning`, `tool_call`,
  `error`, `done`.
- `reasoning_effort`, `reasoning_format` e `parse_tool_calls` vengono inviati
  solo se richiesti esplicitamente dal chiamante.
- Tool-call frammentate vengono accumulate; JSON non valido diventa
  `TOOL_CALL_MALFORMED`, mai testo eseguibile.
- Markup `<think>`/`<tool_call>` nel content diventa `REASONING_MARKUP_LEAK` e
  non viene emesso come testo normale.
- `cancel(requestId)` abortisce il controller associato; nessun tool viene
  eseguito dall’adapter.

## TDD e comandi

1. RED: import del modulo assente (`ERR_MODULE_NOT_FOUND`).
2. GREEN: `node --test tests/local-runtime-llama-server.test.mjs` → **5 passati, 0 falliti**.
3. Sintassi: `node --check src/local-runtime-llama-server.mjs` → pass.
4. Regressione completa: `node --test tests/*.test.mjs` → **1001 passati, 0 falliti**.

## Ricerca e decisione upstream

Il parser segue l’SSE e i campi reasoning/tool-call documentati dal
[server llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).
La normalizzazione TALOS usa l’envelope fissato nella Fase 0. Hermes resta
riferimento per provider/fallback, ma l’adapter non incorpora esecuzione tool o
fallback impliciti.

## Failure, rollback e prova utente

- HTTP non-2xx, JSON invalido, SSE corrotto e abort sono errori o eventi
  tipizzati; non diventano cataloghi vuoti o testo normale.
- Rollback: rimuovere adapter e test; supervisor e store restano riutilizzabili.
- Gate reale binario: rimandato al Task 9, quando il pin llama.cpp sarà
  configurato; nessun pass simulato.
- Prova visiva: non applicabile, nessuna UI modificata.

## Esito

Fase 3 chiusa. Il prossimo passo è il probe di fit GGUF/backend/contesto, che
consumerà `probe()` e `listModels()` senza ancora caricare modelli nel browser.
