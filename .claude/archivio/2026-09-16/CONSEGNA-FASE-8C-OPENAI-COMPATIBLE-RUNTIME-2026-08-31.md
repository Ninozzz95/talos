# Consegna Fase 8C — adapter Ollama/LM Studio — 2026-08-31

## Esito

Fase 6 completata sul layer adapter. TALOS desktop riconosce Ollama e LM
Studio solo tramite le loro API native documentate, elenca modelli osservati,
normalizza contesto/capability e separa testo, ragionamento e tool-call durante
lo streaming. Un endpoint ambiguo resta `unknown`.

## File prodotti

- `harness-ui/src/openai-compatible-runtime.mjs`
- `harness-ui/tests/openai-compatible-runtime.test.mjs`
- `.claude/LEDGER-FASE-8C-OPENAI-COMPATIBLE-RUNTIME-2026-08-31.md`
- `.claude/CONSEGNA-FASE-8C-OPENAI-COMPATIBLE-RUNTIME-2026-08-31.md`

Aggiornato:

- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` — Task 6.

Nessuna modifica a `model-catalog.mjs` o `config.mjs`: restano dedicati al
catalogo OpenRouter e alla configurazione cloud; il wiring locale arriverà con
policy e sessioni nel Task 7.

## Cosa è operativo

- Ollama: `GET /api/tags`, modelli e metadati `details` normalizzati.
- LM Studio: `GET /api/v1/models`, esclusi gli embedding dalla lista LLM;
  capability vision/tool-use/reasoning riportate solo se dichiarate.
- Ogni modello porta `source`, `observedAt`, `verifiedContext` e motivo di
  errore quando la misura non è disponibile.
- LM Studio load/unload accettano l’esito solo con stato upstream confermato.
- Ollama resta provider-managed/JIT: load/unload espliciti sono rifiutati.
- Streaming Ollama NDJSON e LM Studio SSE emette eventi separati `text`,
  `reasoning`, `tool_call`, `done`, `error`.
- Nessun token di autorizzazione viene aggiunto o restituito dall’adapter.

## Verifica fresca

- RED: `rtk node --test tests/openai-compatible-runtime.test.mjs` → modulo assente.
- GREEN mirato: **9/9**.
- Sintassi: `rtk node --check src/openai-compatible-runtime.mjs` → pass.
- Suite completa: `rtk node --test tests/*.test.mjs` → **1027/1027**.
- `rtk git diff --check` → pass.

## Upstream e confronto

- [Ollama list models](https://docs.ollama.com/api/tags) e [streaming](https://docs.ollama.com/api/streaming):
  adottati direttamente (`/api/tags`, `/api/chat`, NDJSON).
- [LM Studio REST overview](https://lmstudio.ai/docs/developer/rest), [list](https://lmstudio.ai/docs/developer/rest/list)
  e [load](https://lmstudio.ai/docs/developer/rest/load): adottati gli endpoint
  v1 nativi raccomandati dal provider.
- Hermes offre una superficie provider uniforme; TALOS aggiunge la distinzione
  osservato/unknown, il contesto verificato e il motivo di fallimento senza
  mascherare differenze tra provider.

Pin runtime llama.cpp invariato:
`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`.

## Limiti dichiarati

- Nessun Ollama o LM Studio reale è stato installato o modificato. Lo smoke su
  `127.0.0.1:11434` e `127.0.0.1:1234` è rinviato al Task 9 e verrà registrato
  come `not installed` se le porte sono inattive.
- L’adapter non esegue tool e non applica fallback: il Task 7 lo collegherà a
  sessioni e policy fail-closed.
- Nessuna UI cambia, quindi non esiste una verifica visiva per questa fase.
- Nessun commit e nessun push eseguiti.

## Riepilogo semplice per l’owner

Ora il desktop sa distinguere due motori locali senza confonderli. Se uno dei
due risponde con dati incompleti, TALOS lo segnala invece di inventare capacità.
I messaggi in streaming restano separati: testo, ragionamento e richieste di
tool non finiscono nello stesso blocco. La prossima fase collegherà questi
adapter alle sessioni, ai permessi e al fallback esplicito.
