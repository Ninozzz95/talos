# Ledger Fase 7 — sessioni runtime locale, policy e fallback

## Perimetro

Integrare gli adapter runtime già verificati nelle sessioni desktop del
registro Harness UI. La build resta desktop-only; `mobile/` è riferimento in
sola lettura. Il provider locale è selezionato esplicitamente per richiesta.
OpenRouter è fallback solo con consenso esplicito e con chiave configurata.

## Ricerca upstream vincolante

- OpenRouter Provider Routing e Model Fallbacks:
  https://openrouter.ai/docs/guides/routing/provider-selection
  https://openrouter.ai/docs/guides/routing/model-fallbacks
- llama.cpp server (health e HTTP server):
  https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp
- Adapter già pin­nati nelle Fasi 2–6: Ollama `/api/tags` + `/api/chat`, LM
  Studio `/api/v1/models`, `/api/v1/models/load`, `/api/v1/models/unload`,
  `/v1/chat/completions`.

Decisione upstream: adattare i contratti esistenti dietro gli adapter AVM;
nessun protocollo proprietario nuovo. L'abort usa `AbortController` nativo.

## RED

1. `SESSION-LOCAL-START-01`: `sessionRegistry.avvia(... provider:'local')`
   rifiuta runtime/model mancanti con errore tipizzato e non richiede una
   chiave OpenRouter.
2. `SESSION-LOCAL-STREAM-01`: una sessione locale traduce testo,
   ragionamento, tool-call e fine in eventi AG-UI nel buffer della sessione.
3. `SESSION-LOCAL-CANCEL-01`: `ferma()` abortisce il generatore locale e
   chiude il giro con esito `fermato`, senza lasciare la sessione appesa.
4. `SESSION-LOCAL-FALLBACK-01`: un errore runtime senza consenso non chiama
   OpenRouter; con `fallbackConsent:true` e chiave presente emette l'evento
   di fallback e usa l'esecuzione cloud già esistente.
5. `SESSION-LOCAL-META-01`: elenco e persistenza espongono provider, runtimeId,
   modelId e fallback scelto senza perdere i campi cloud esistenti.
6. `HTTP-LOCAL-RUNTIME-01`: GET runtime/local-models e POST import/load/unload
   hanno allowlist, envelope e errori fail-closed.
7. `HTTP-LOCAL-CANCEL-01`: POST `/api/v1/sessions/:id/cancel` delega a
   `ferma()` e mantiene la semantica HTTP esistente.
8. `OPENAI-COMPATIBLE-ABORT-01`: Ollama/LM Studio propagano `signal` e
   supportano `cancel(requestId)` senza catturare l'abort come rete guasta.

## File autorizzati

### Modificare

- `harness-ui/src/session-registry.mjs`
- `harness-ui/src/http-app.mjs`
- `harness-ui/src/openai-compatible-runtime.mjs`
- `harness-ui/src/local-model-store.mjs`
- `harness-ui/tests/session-registry.test.mjs`
- `harness-ui/tests/http-routes-model-lab.test.mjs`
- `harness-ui/tests/openai-compatible-runtime.test.mjs`
- `harness-ui/tests/local-model-store.test.mjs`
- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md`

### Creare

- `.claude/CONSEGNA-FASE-8C-LOCAL-SESSION-POLICY-2026-08-31.md`

Nessun altro file è nel perimetro di questa fase.

## Simboli pubblici

- `createSessionRegistry({ localRuntimes })`
- `sessionRegistry.avvia(..., { provider, runtimeId, modelId, fallbackConsent })`
- `sessionRegistry.ferma(sessionId)` (semantica esistente, ora valida anche
  per runtime locali)
- `createHttpApp({ localRuntimes, localModelStore, localModelTransfer })`
- `createOpenAiCompatibleRuntime().cancel(requestId)` e `signal` su
  `generateStream()`.

## GREEN e regressione

- `node --test harness-ui/tests/session-registry.test.mjs`
- `node --test harness-ui/tests/http-routes-model-lab.test.mjs`
- `node --test harness-ui/tests/openai-compatible-runtime.test.mjs`
- `node --test harness-ui/tests/*.test.mjs`
- `git diff --check`

Gate upstream reale: runtime Ollama/LM Studio presenti e raggiungibili, o
errore `RUNTIME_UNREACHABLE` dichiarato; nessun modello o risposta finta.
Prova umana: endpoint runtime, avvio locale, stream, stop e fallback esplicito
dal browser desktop. Rollback: revertire i file elencati senza toccare i
manifest dei modelli locali.
