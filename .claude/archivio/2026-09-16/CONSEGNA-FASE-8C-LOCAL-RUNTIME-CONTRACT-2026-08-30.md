# Consegna Fase 8C — contratto runtime locale desktop

## Stato

**Completata la Fase 0 del piano runtime locale.** È stato fissato il contratto
che useranno supervisor, adapter, sessioni e Model Lab. Non è ancora stato
avviato alcun runtime LLM e non è stata cambiata la UI.

## Cosa è stato fatto

- Pin runtime: validazione di `runtimeId`, versione, commit completo, piattaforma,
  SHA-256 e origine HTTPS.
- Snapshot: stati canonici, backend/modello/contesto osservati, capability
  esplicite e rifiuto di stati impossibili.
- Stream: eventi separati per testo, reasoning, tool call, stato, errore e fine;
  envelope con identità di run/turn, sequenza e timestamp.
- Replay: duplicati identici vengono deduplicati; conflitti sulla stessa
  sequenza vengono rifiutati.
- Sicurezza: nessun path assoluto, segreto o default permissivo entra nel
  contratto.

## Evidenza di verifica

- RED osservato: i test fallivano perché i tre moduli non esistevano.
- GREEN: `node --test tests/runtime-build-manifest.test.mjs tests/local-runtime-contract.test.mjs tests/local-runtime-events.test.mjs` → **10 passati, 0 falliti**.
- Nessun test visivo: questa fase è solo contratto dati e non modifica la
  superficie desktop/mobile.

## Ricerca aggiornata

La review del 30/08/2026 ha consultato release/API di
[llama.cpp](https://github.com/ggml-org/llama.cpp/releases/),
[server llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md),
[LM Studio](https://lmstudio.ai/docs/developer/rest),
[Hermes](https://hermes-agent.nousresearch.com/docs/integrations/providers) e
[Hugging Face cache](https://huggingface.co/docs/huggingface_hub/guides/manage-cache).
Decisione: llama.cpp resta il sidecar primario pinato; Hermes/Ollama/LM Studio
sono riferimenti/adapters, mentre policy, tool e audit restano TALOS.

## File toccati

- `harness-ui/src/runtime-build-manifest.mjs`
- `harness-ui/src/local-runtime-contract.mjs`
- `harness-ui/src/local-runtime-events.mjs`
- `harness-ui/tests/runtime-build-manifest.test.mjs`
- `harness-ui/tests/local-runtime-contract.test.mjs`
- `harness-ui/tests/local-runtime-events.test.mjs`
- `.claude/LEDGER-FASE-8C-LOCAL-RUNTIME-CONTRACT-2026-08-30.md`
- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md`

## Cosa resta

La prossima fase implementerà il manifest/store dei modelli locali. Il runtime
non è ancora installato, nessun modello è stato scaricato e nessun fallback
cloud è stato abilitato. Il rollback della fase è la rimozione dei tre moduli e
dei tre test; non sono coinvolte sessioni o impostazioni esistenti.

## Riassunto semplice

Abbiamo costruito il “contratto” che impedisce a runtime e interfaccia di
scambiarsi dati ambigui: ogni stato è dichiarato, ogni evento è ordinato e le
parti sensibili non passano al browser. I test dimostrano che il contratto
accetta il caso corretto e blocca gli errori principali. Ora si può costruire lo
store dei modelli senza inventare dati o perdere gli eventi durante uno stream.
