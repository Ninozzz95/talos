# Ledger Fase 8C — probe runtime locale e fit — 2026-08-31

## Perimetro

Ownership desktop: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui`.
La fase misura compatibilità e capacità prima del load; non avvia processi, non
scarica modelli, non modifica UI/mobile e non sceglie automaticamente un backend.

## File e simboli

| Azione | File | Simboli pubblici | Scopo |
|---|---|---|---|
| Crea | `harness-ui/src/local-runtime-probe.mjs` | `LocalRuntimeProbeError`, `createLocalRuntimeProbe(options)` | ispezione modello, backend, fit e qualifica con consenso |
| Crea | `harness-ui/tests/local-runtime-probe.test.mjs` | 8 test Node nominati sotto | validazione header, capability, risorse, consenso e misura |
| Modifica | `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` | Task 4 | contratto effettivo, stato TDD e gate |
| Crea | `.claude/CONSEGNA-FASE-8C-LOCAL-RUNTIME-PROBE-2026-08-31.md` | documento di consegna | esiti, fonti, limiti e rollback |

Nessun file viene eliminato. `machine-capacity.mjs`, `local-model-store.mjs` e
`local-runtime-llama-server.mjs` restano compatibili e non vengono modificati.

## Contratto pubblico

```js
export function createLocalRuntimeProbe({
  runtime,
  modelStore,
  readHeader,
  measureMachine,
  now,
  clockMs,
}) {
  return { inspectModel, measureBackend, fit, qualify };
}
```

- `inspectModel(modelId)` valida il manifest nello store e l’header restituito
  da `readHeader(path)`. Richiede magic `GGUF`, versione `3`, byte di lavoro e
  contesto addestrato positivi. Legge contesto e `chat_template_caps` osservati
  da `/props`; non restituisce il sorgente del template o path assoluti.
- `measureBackend()` espone backend osservato solo se `/props` lo dichiara;
  backend e termica assenti restano `{ state: 'unknown', value: null }`.
- `fit(modelId, options)` applica in ordine storage, RAM, contesto richiesto e
  profilo agente. Stati: `compatible`, `chat-only`, `blocked`, `unknown`.
- `qualify(options)` richiede `consent === true`, rifiuta fit non compatibili e
  consuma una generazione minima. Registra TTFT; tok/s resta `unknown` se stream
  e metriche upstream non espongono un conteggio osservato.

## Scenari RED permanenti

1. `LOCAL-RUNTIME-PROBE-GGUF-01` — header illeggibile →
   `MODEL_HEADER_UNREADABLE`.
2. `LOCAL-RUNTIME-PROBE-GGUF-02` — magic/versione/valori GGUF invalidi →
   `MODEL_HEADER_INVALID`.
3. `LOCAL-RUNTIME-PROBE-CAPS-01` — capability osservate false restano false e
   template source non viene esposto.
4. `LOCAL-RUNTIME-PROBE-CAPS-02` — capability assenti restano unknown/null.
5. `LOCAL-RUNTIME-PROBE-CONTEXT-01` — contesto sotto 65.536 nel profilo agente
   → `chat-only`.
6. `LOCAL-RUNTIME-PROBE-MEMORY-01` — RAM libera inferiore ai byte di lavoro →
   `blocked/memory`.
7. `LOCAL-RUNTIME-PROBE-BACKEND-01` — backend e termica non dichiarati →
   unknown/null.
8. `LOCAL-RUNTIME-PROBE-CONSENT-01` — qualifica senza consenso non invoca mai
   `generateStream`; con consenso registra TTFT e non inventa tok/s.

## TDD e verifiche

1. RED: `rtk node --test tests/local-runtime-probe.test.mjs`; atteso import
   `ERR_MODULE_NOT_FOUND`.
2. GREEN mirato: stesso comando → **8 passati, 0 falliti**.
3. Sintassi: `rtk node --check src/local-runtime-probe.mjs` → pass.
4. Regressione: `rtk node --test tests/*.test.mjs` → **1009 passati, 0 falliti**.
5. Igiene: `rtk git diff --check` → pass.
6. Gate upstream reale: differito al Task 9; nessun binario/modello configurato
   viene simulato come prova reale.

## Ricerca e decisione upstream

- `llama.cpp/ggml/include/gguf.h`: adozione del magic ufficiale `GGUF` e della
  versione corrente `3`.
- `llama.cpp/tools/server/README.md`: adozione diretta di `GET /props`,
  `default_generation_settings.n_ctx`, `chat_template_caps` e `/metrics`.
- `llama.cpp/common/chat.h` e `common/jinja/caps.h`: adozione dei capability
  names `supports_tools`, `supports_tool_calls`, `supports_system_role`.
- Hugging Face GGUF: parser upstream `@huggingface/gguf` valutato ma non aggiunto
  ora; il probe mantiene `readHeader` iniettato perché Task 5 decide il percorso
  import/cache e deve pinare una sola implementazione reale.
- Issue llama.cpp #27129: motivazione fail-closed; un HTTP 200 non prova che il
  template abbia ricevuto gli strumenti.

Pin runtime ereditato e invariato:
`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`.

Decisione: adattare upstream dietro il contratto TALOS. Nessun parser GGUF,
stimatore GPU o sensore termico proprietario viene inventato in questa fase.

## Failure, prova utente e rollback

- Store/model/header/probe/measurement invalidi generano errori tipizzati o
  stato `unknown`; non diventano numeri o capability fittizi.
- `qualify` senza consenso e fit `blocked|unknown|chat-only` non eseguono il
  modello.
- Prova visiva: non applicabile, nessuna superficie UI cambia. La UI consumerà
  questi stati nel Task 8.
- Rollback atomico: rimuovere modulo, test, ledger e consegna; le fasi 0–3
  restano intatte.

## Esito

Fase 4 chiusa sul contratto sintetico. Il gate reale con GGUF e binario pinato
resta correttamente nel Task 9; nessun pass reale è stato simulato. Nessun
commit e nessun push sono stati eseguiti.
