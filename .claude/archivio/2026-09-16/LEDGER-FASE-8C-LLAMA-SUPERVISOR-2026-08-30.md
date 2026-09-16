# Ledger Fase 8C — supervisor llama-server — 2026-08-30

## Perimetro

Ownership desktop: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui`.
La fase realizza soltanto la primitiva di lifecycle del sidecar. Nessuna route,
UI, mobile, TALOS-BANCO o inferenza reale viene collegata.

## File e simboli

| Azione | File | Simboli pubblici | Scopo |
|---|---|---|---|
| Crea | `harness-ui/src/llama-server-supervisor.mjs` | `LlamaServerSupervisorError`, `createLlamaServerSupervisor(options)` | spawn controllato, health polling, stop e log |
| Crea | `harness-ui/tests/llama-server-supervisor.test.mjs` | 5 test Node | loopback/shell, health, crash, stop, path |
| Modifica | `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` | Task 2 | wiring rimandato al Task 7 per evitare configurazione morta |

## Contratto

`createLlamaServerSupervisor({ binaryPath, modelStore, spawnImpl, fetchImpl,
portAllocator, now, healthTimeoutMs, pollIntervalMs })` restituisce:

- `start({ modelId, modelPath, port })` — avvia con `--host 127.0.0.1`,
  `--jinja`, `--metrics`, `--props`, chiave effimera server-side e `shell:false`;
- `health()` — restituisce stato HTTP o errore tipizzato senza lanciare;
- `stop()` — invia `SIGTERM`, libera il lock e rende il supervisor unavailable;
- `status()` — espone stato/porta/runtime, mai chiave o path assoluti;
- `subscribeLogs(listener)` — osservatore stdout/stderr disiscrivibile.

## TDD e comandi

1. RED: `node --test tests/llama-server-supervisor.test.mjs` falliva con
   `ERR_MODULE_NOT_FOUND`.
2. GREEN: stesso comando → **5 passati, 0 falliti**.
3. Sintassi: `node --check src/llama-server-supervisor.mjs` → pass.
4. Regressione: `node --test tests/*.test.mjs` → **996 passati, 0 falliti**.

## Sicurezza e upstream

- Binding fissato a `127.0.0.1`; la porta deve essere compresa tra 1024 e 65535.
- Il browser non riceve API key, path modello o stdout del processo tramite
  `status()`.
- Non vengono usati `--tools`, MCP, shell o comandi concatenati.
- Il comportamento segue la documentazione server di
  [llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md);
  il pin/release SHA-256 resta quello deciso nella Fase 0.

## Failure, rollback e gate reale

- Health `503` continua il polling; timeout e processo morto diventano errori
  tipizzati e stato `failed`.
- Stop ripetuto è idempotente; un lock modello viene sempre liberato.
- Il gate con binario reale è **deferred al Task 9** perché il binario pinato non
  è ancora configurato nella lane desktop; non viene simulato come pass.
- Rollback: eliminare i due file creati; nessun consumatore esistente viene
  coinvolto.
- Prova visiva: non applicabile, nessuna UI modificata.

## Esito

Fase 2 chiusa come primitiva isolata. Il wiring in `server.mjs`/`config.mjs`
partirà solo insieme ad adapter, route e policy del Task 7.
