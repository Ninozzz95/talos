# Ledger Fase 8C — contratto runtime locale desktop — 2026-08-30

## Perimetro

Ownership desktop: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui`.
`mobile/` resta riferimento in sola lettura. Nessuna UI, processo, rete o
TALOS-BANCO è stato modificato.

## File e simboli

| Azione | File | Simboli pubblici | Scopo |
|---|---|---|---|
| Crea | `harness-ui/src/runtime-build-manifest.mjs` | `parseRuntimeBuildManifest(value)` | valida runtimeId, versione, commit completo, piattaforma, SHA-256 e origine HTTPS |
| Crea | `harness-ui/src/local-runtime-contract.mjs` | `LOCAL_RUNTIME_STATES`, `parseLocalRuntimeSnapshot(value)`, `parseLocalRuntimeEvent(value)` | contratto snapshot e payload degli eventi |
| Crea | `harness-ui/src/local-runtime-events.mjs` | `parseRuntimeEventEnvelope(value)`, `createRuntimeEventLedger()` | envelope replay-safe e deduplica per sequenza |
| Crea | `harness-ui/tests/runtime-build-manifest.test.mjs` | 3 test Node | RED/GREEN pin, digest, campi sconosciuti e path |
| Crea | `harness-ui/tests/local-runtime-contract.test.mjs` | 4 test Node | snapshot, fit minimo, reasoning/tool-call e stati impossibili |
| Crea | `harness-ui/tests/local-runtime-events.test.mjs` | 3 test Node | envelope, deduplica/replay, sequence invalida |
| Modifica | nessuno | — | fase isolata senza product wiring |

## TDD e comandi

1. RED eseguito prima del codice: `node --test tests/runtime-build-manifest.test.mjs tests/local-runtime-contract.test.mjs tests/local-runtime-events.test.mjs` ha fallito con `ERR_MODULE_NOT_FOUND` per i tre moduli assenti.
2. GREEN eseguito dopo il codice con lo stesso comando: `10` test passati, `0` falliti.
3. Nessuna suite di prodotto richiesta: non sono cambiate route, server o UI.

## Contratto fissato

- Stati runtime: `unavailable`, `detected`, `loading`, `ready`, `stopping`, `failed`.
- Snapshot: backend, modello e contesto sono osservati; `ready` senza modello o
  contesto è invalido; capability mancanti non hanno default impliciti.
- Modelli: l’id non può essere un path assoluto Windows/Unix; i path restano
  server-side.
- Eventi: `text`, `reasoning`, `tool_call`, `status`, `error`, `done`; il
  tool-call deve contenere JSON valido e reasoning/tool non diventano testo
  generico.
- Envelope: `runId`, `turnId`, `runtimeId`, `seq`, `at`, `type`; duplicati
  identici sono ignorati, conflitti sulla stessa sequenza sono rifiutati.

## Ricerca upstream e decisione

Adottiamo il principio di pin e attestazione della release ufficiale
[llama.cpp](https://github.com/ggml-org/llama.cpp/releases/) e il contratto
stream/API documentato dal [server llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).
Adattiamo behind adapter le capability e il fallback osservati da
[Hermes](https://hermes-agent.nousresearch.com/docs/integrations/providers),
senza importarne il provider come fonte di verità. Ollama e LM Studio restano
adapter successivi; Hugging Face resta cache ufficiale con revision completa.

## Gate e rollback

- Prova upstream della fase: il manifest è confrontabile con release e digest,
  ma il pin AVM non viene sostituito in questa fase.
- Prova visiva: **non applicabile**; nessuna superficie utente è stata toccata.
  La verifica desktop/mobile e la prova visiva scatteranno quando il contratto
  sarà collegato a runtime e Model Lab.
- Rollback: eliminare i tre moduli e i tre test della tabella; nessun catalogo,
  sessione, UI o configurazione viene coinvolto.

## Esito

Fase 0 chiusa tecnicamente. La prossima fase è lo store locale del modello,
sempre con RED prima del codice e con download/cache ancora gated fino alla
verifica dell’upstream `hf`.
