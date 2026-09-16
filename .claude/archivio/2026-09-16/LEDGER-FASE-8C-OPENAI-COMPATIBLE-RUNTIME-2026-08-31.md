# Ledger Fase 8C — adapter Ollama/LM Studio — 2026-08-31

## Perimetro

Ownership desktop: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui`.
Questa fase rileva runtime locali già avviati e normalizza modelli/load/stream;
non installa software, non scarica modelli e non modifica UI, sessioni o
policy. Nessun binding viene aperto o cambiato dall’adapter.

## File e simboli

| Azione | File | Simboli pubblici | Scopo |
|---|---|---|---|
| Crea | `harness-ui/src/openai-compatible-runtime.mjs` | `OpenAiCompatibleRuntimeError`, `createOpenAiCompatibleRuntime(options)` | detect, list, inspect, load, unload, generateStream, health |
| Crea | `harness-ui/tests/openai-compatible-runtime.test.mjs` | 9 test Node nominati sotto | rilevamento, normalizzazione, lifecycle, stream e failure |
| Modifica | `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` | Task 6 | esito e gate provider |
| Crea | `.claude/CONSEGNA-FASE-8C-OPENAI-COMPATIBLE-RUNTIME-2026-08-31.md` | documento di consegna | fonti, prove, limiti e rollback |

Nessun cambiamento a `model-catalog.mjs` o `config.mjs`: l’ispezione ha mostrato
che il catalogo OpenRouter e la configurazione cloud sono già contratti
separati; modificarli ora introdurrebbe wiring inutilizzato. Il cablaggio al
catalogo avverrà nel Task 7/8, con policy.

## Contratto pubblico

```js
export function createOpenAiCompatibleRuntime({ fetchImpl, now, endpoints }) {
  return { detect, listModels, inspect, load, unload, generateStream, health };
}
```

- `detect(provider)` usa endpoint nativi: Ollama `/api/tags`, LM Studio
  `/api/v1/models`; forma inattesa o rete assente → `unknown`/errore tipizzato.
- `listModels(provider)` restituisce solo modelli osservati con `source`,
  `observedAt`, `verifiedContext` e capability dichiarate dall’upstream.
- `inspect(provider, modelId)` richiede una corrispondenza esatta nella lista;
  non promuove un id arbitrario.
- `load/unload` esistono solo per LM Studio e hanno esito positivo quando la
  risposta conferma lo stato; Ollama resta JIT/provider-managed.
- `generateStream` normalizza NDJSON Ollama e SSE OpenAI-compatible LM Studio in
  eventi `text`, `reasoning`, `tool_call`, `done`, `error`; tool/reasoning non
  vengono eseguiti dall’adapter.
- Nessuna credenziale viene inserita nel browser; eventuale token è un header
  server-side passato dal chiamante e mai restituito nell’output.

## Scenari RED permanenti

1. `OPENAI-RUNTIME-DETECT-OLLAMA-01` — `/api/tags` valido → Ollama observed.
2. `OPENAI-RUNTIME-DETECT-LMSTUDIO-01` — `/api/v1/models` valido → LM Studio observed.
3. `OPENAI-RUNTIME-DETECT-UNKNOWN-01` — shape ambigua → unknown, mai Ollama/LM Studio.
4. `OPENAI-RUNTIME-MODELS-01` — normalizza id, contesto, source e capability.
5. `OPENAI-RUNTIME-LIFECYCLE-01` — LM Studio load/unload richiede conferma stato.
6. `OPENAI-RUNTIME-STREAM-01` — NDJSON Ollama separa testo, thinking e tool call.
7. `OPENAI-RUNTIME-STREAM-LM-01` — SSE LM Studio separa canali e chiude su `[DONE]`.
8. `OPENAI-RUNTIME-ERROR-01` — HTTP/rete/JSON malformato diventa errore tipizzato.
9. `OPENAI-RUNTIME-NO-SECRETS-01` — auth header non compare nel risultato o nei log.

## TDD e verifiche

1. RED: `rtk node --test tests/openai-compatible-runtime.test.mjs`; atteso modulo assente.
2. GREEN mirato: stesso comando → **9/9**.
3. Sintassi: `rtk node --check src/openai-compatible-runtime.mjs`.
4. Regressione: `rtk node --test tests/*.test.mjs`.
5. Igiene: `rtk git diff --check`.
6. Smoke reale: probe loopback `127.0.0.1:11434` e `127.0.0.1:1234` solo se
   provider installati; assenza registrata come `not installed`, nessuna
   installazione automatica.

## Ricerca e decisione upstream

- Ollama API: `/api/tags`, `/api/chat` e streaming NDJSON adottati direttamente
  ([docs](https://docs.ollama.com/api/tags), [streaming](https://docs.ollama.com/api/streaming)).
- LM Studio REST v1: `/api/v1/models`, `/api/v1/models/load`, `/api/v1/models/unload`
  adottati direttamente ([overview](https://lmstudio.ai/docs/developer/rest),
  [list](https://lmstudio.ai/docs/developer/rest/list),
  [load](https://lmstudio.ai/docs/developer/rest/load)).
- Hermes ispira la superficie provider-uniforme; TALOS aggiunge `source`,
  `observedAt`, `verifiedContext` e `failureReason`, mantenendo i wire format
  dietro l’adapter.

Pin runtime llama.cpp invariato:
`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`.

## Failure, prova utente e rollback

- Un provider non installato o non raggiungibile resta `unknown/not installed`.
- Modello non elencato, load non confermato, stream corrotto e HTTP non-2xx
  falliscono in modo tipizzato.
- Prova visiva non applicabile: nessuna UI cambia in Task 6.
- Rollback: rimuovere adapter, test, ledger e consegna; fasi 0–5 restano intatte.

## Esito

Fase 6 chiusa sul contratto adapter e sui mock upstream. I provider installati
non sono stati alterati; il gate smoke su porte loopback resta per il Task 9.
