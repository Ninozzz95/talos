# Ledger Fase 8C — import/cache Hugging Face — 2026-08-31

## Perimetro

Ownership desktop: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui`.
La fase gestisce download/import GGUF e stato persistente del manifest; non
collega ancora sessioni, UI, policy o runtime. Nessun processo parte con shell e
nessun file parziale viene marcato `ready`.

## Scostamento motivato dal piano

Il piano madre elenca anche `http-app.mjs` e `server.mjs` per il Task 5. La
ricognizione ha confermato che le rotte runtime e il loro controllo policy sono
già il perimetro esplicito del Task 7; inserirle ora esporrebbe endpoint privi di
session-registry e consenso. Il ledger restringe quindi il Task 5 a store e
transfer, e annota il cablaggio HTTP come dipendenza del Task 7.

## File e simboli

| Azione | File | Simboli pubblici | Scopo |
|---|---|---|---|
| Crea | `harness-ui/src/hf-model-transfer.mjs` | `HfModelTransferError`, `createHfModelTransfer(options)` | inspect/start/pause/resume/cancel/status/verify/importLocal |
| Crea | `harness-ui/tests/hf-model-transfer.test.mjs` | 8 test Node nominati sotto | CLI, allowlist, progress, resume, checksum, cancel, import |
| Modifica | `harness-ui/src/local-model-store.mjs` | `store.setState(id, state)` | transizione atomica `incomplete → ready|failed` |
| Modifica | `harness-ui/tests/local-model-store.test.mjs` | scenario `MODEL-STORE-STATE-01` | stato persistente e aggiornamento atomico |
| Modifica | `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` | Task 5 | esito e wiring HTTP differito al Task 7 |
| Crea | `.claude/CONSEGNA-FASE-8C-HF-MODEL-TRANSFER-2026-08-31.md` | documento di consegna | evidenza, fonti, limiti e rollback |

## Contratto pubblico

```js
export function createHfModelTransfer({
  hfExecutable, spawnImpl, modelStore, rootDir, fsImpl, now,
  allowedRepositories, progressPattern,
}) {
  return { inspect, start, pause, resume, cancel, status, verify, importLocal };
}
```

- `inspect({ repo, revision, include })` richiede revision full-length e repo
  nella allowlist; CLI mancante torna `gated`, mai un falso elenco.
- `start()` registra subito il manifest `incomplete`, invoca `hf download`
  senza shell e ritorna stato durevole. `--revision`, `--local-dir`,
  `--include`, `--quiet` sono argv separati.
- Progress è monotono e deriva solo da righe osservate; nessuna percentuale è
  inventata quando il CLI non la emette.
- `pause()`/`cancel()` fermano il processo e conservano `incomplete`;
  `resume()` riusa la stessa revisione e directory.
- `verify()` controlla dimensioni e SHA-256 di ogni file prima di `setState` a
  `ready`; mismatch → `CHECKSUM_MISMATCH` e stato `incomplete`.
- `importLocal()` copia un GGUF dentro la directory finale, poi usa la stessa
  verifica; nessun download o rete sono necessari.

## Scenari RED permanenti

1. `HF-TRANSFER-REVISION-01` — revisione corta o repo fuori allowlist rifiutati.
2. `HF-TRANSFER-CLI-01` — executable assente → `gated/HF_CLI_MISSING`.
3. `HF-TRANSFER-SPAWN-01` — argv separati, `shell:false`, manifest `incomplete`.
4. `HF-TRANSFER-PROGRESS-01` — progress non può diminuire.
5. `HF-TRANSFER-RESUME-01` — processo interrotto e ripreso senza nuovo manifest.
6. `HF-TRANSFER-CHECKSUM-01` — hash errato non diventa `ready`.
7. `HF-TRANSFER-CANCEL-01` — cancellazione ferma il processo e resta incompleta.
8. `HF-TRANSFER-OFFLINE-01` — import locale verificato resta pronto senza CLI.

## TDD e verifiche

1. RED: `rtk node --test tests/hf-model-transfer.test.mjs`; atteso modulo assente.
2. GREEN mirato: stesso comando → 8/8.
3. Store: `rtk node --test tests/local-model-store.test.mjs`.
4. Regressione: `rtk node --test tests/*.test.mjs`.
5. Sintassi: `rtk node --check src/hf-model-transfer.mjs`.
6. Igiene: `rtk git diff --check` e ricerca trailing whitespace sui file nuovi.
7. Gate reale: `hf` non è presente nel PATH della macchina; registrare `gated`
   è il risultato reale, non un fallimento nascosto.

## Ricerca e decisione upstream

- Hugging Face CLI ufficiale: `hf download REPO_ID [FILENAMES] --revision
  <commit> --local-dir <dir> --dry-run --quiet`; adottato direttamente tramite
  argv senza shell.
- Cache Hub ufficiale: snapshot e blob sono revision-scoped; la revisione piena
  viene conservata nel manifest TALOS.
- `hf cache verify` è documentato ma non sostituisce la verifica locale dei file
  GGUF destinati al runtime; adottiamo hash SHA-256 TALOS prima dello stato ready.
- Hermes/Ollama offrono percorsi semplici di pull; TALOS aggiunge coda
  durevole, motivo di stato, checksum e ripresa fail-closed.

Pin runtime invariato:
`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`.

## Failure, prova utente e rollback

- CLI mancante, allowlist errata, processo non-zero, cancel e checksum errato
  sono stati tipizzati; mai catalogo pronto o file installato fittizio.
- Prova visiva non applicabile: nessuna UI cambia in Task 5.
- Rollback: rimuovere transfer e test, ripristinare `setState` dallo store; le
  fasi 0–4 restano utilizzabili.
