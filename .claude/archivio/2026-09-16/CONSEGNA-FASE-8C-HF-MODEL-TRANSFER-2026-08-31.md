# Consegna Fase 8C — import/cache Hugging Face — 2026-08-31

## Esito

Fase 5 completata sul percorso isolato di trasferimento. Il desktop ora ha un
adapter che tratta il download HF come una coda verificabile: revisione e repo
sono controllati prima dell’avvio, il manifest nasce `incomplete`, la pausa e
la cancellazione non lo promuovono, e solo byte/hash corretti lo rendono
`ready`.

## File prodotti e modificati

- `harness-ui/src/hf-model-transfer.mjs`
- `harness-ui/tests/hf-model-transfer.test.mjs`
- `harness-ui/src/local-model-store.mjs` — aggiunto `setState(id, state)` con
  persistenza temporanea + rename.
- `harness-ui/tests/local-model-store.test.mjs` — scenario
  `MODEL-STORE-STATE-01`.
- `.claude/LEDGER-FASE-8C-HF-MODEL-TRANSFER-2026-08-31.md`
- `.claude/CONSEGNA-FASE-8C-HF-MODEL-TRANSFER-2026-08-31.md`

Aggiornato:

- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` — Task 5.

## Cosa è operativo

- `inspect()` rifiuta repository fuori allowlist e revisioni non full-length.
- `hf download` viene invocato con argv separati e `shell:false`, usando
  `--revision`, `--include`, `--local-dir`, `--quiet` e `--dry-run`.
- CLI assente: risultato onesto `gated/HF_CLI_MISSING`.
- `start()` crea il manifest `incomplete`; il progresso è derivato solo dalle
  percentuali ricevute e non può diminuire.
- `pause()` invia SIGTERM e conserva lo snapshot; `resume()` ripete la stessa
  revisione e directory, consentendo alla cache HF di riprendere.
- `cancel()` ferma il processo e lascia `incomplete`.
- `verify()` legge ogni file, controlla dimensione e SHA-256, poi chiama
  `setState(..., 'ready')`; mismatch e file mancanti non passano.
- `importLocal()` funziona offline: copia su `.partial-*`, rinomina dopo la
  copia e verifica prima della pubblicazione.

## Verifica fresca

- RED: `rtk node --test tests/hf-model-transfer.test.mjs` → modulo assente.
- GREEN mirato transfer + store: **14/14**.
- Sintassi: `rtk node --check src/hf-model-transfer.mjs` → pass.
- Suite completa: `rtk node --test tests/*.test.mjs` → **1018/1018**.
- `rtk git diff --check` → pass.
- `hf version` reale: CLI non presente nel PATH; lo stato `gated` è quindi
  verificato tramite il percorso di errore, senza fingere un download.

## Upstream e confronto

- Hugging Face documenta `hf download` con revisione, local-dir e dry-run
  ([CLI ufficiale](https://huggingface.co/docs/huggingface_hub/en/guides/cli));
  il comando è adottato direttamente, senza shell.
- La cache HF è revision-scoped e conserva snapshot/blob per evitare download
  duplicati ([cache ufficiale](https://huggingface.co/docs/huggingface_hub/en/guides/manage-cache));
  TALOS conserva inoltre revisione, hash e stato nel proprio manifest.
- Rispetto a Hermes/Ollama, il vantaggio TALOS è la transizione durevole e
  osservabile (`incomplete`, `paused`, `cancelled`, `verifying`, `ready`) e il
  blocco checksum prima dell’uso.

Pin runtime invariato:
`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`.

## Scostamento dichiarato

Le rotte HTTP e il collegamento a `session-registry` non sono stati aggiunti:
sono il perimetro del Task 7, dove esisteranno policy e consenso per-request.
Esporli ora avrebbe creato endpoint attivi senza il controllo completo.

## Limiti e rollback

- La versione reale del CLI non è disponibile su questa macchina.
- Il parser GGUF e l’eventuale endpoint UI saranno cablati nelle fasi 7–8.
- Nessuna verifica visiva è applicabile: nessuna UI è stata modificata.
- Rollback: rimuovere `hf-model-transfer.mjs` e il relativo test, eliminare
  `setState`/test dallo store; fasi 0–4 restano intatte.
- Nessun commit e nessun push eseguiti.

## Riepilogo semplice per l’owner

Il download non viene più trattato come “file apparso nella cartella”. Parte
come trasferimento incompleto, può essere fermato e ripreso, e diventa
utilizzabile solo dopo il controllo completo dei byte. Se il programma HF non è
installato, il desktop lo dice chiaramente e non mostra un modello finto. La
prossima fase può collegare provider locali già installati (Ollama e LM Studio)
senza confondere il loro rilevamento con l’import HF.
