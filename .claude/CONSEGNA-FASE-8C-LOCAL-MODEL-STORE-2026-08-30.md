# Consegna Fase 8C — store locale modelli desktop

## Stato

**Completata.** Il desktop ora ha uno store minimale per manifest locali, senza
runtime, download o UI attivati.

## Cosa garantisce

- Un modello entra nello store solo con manifest completo e coerente.
- Revisioni e hash devono avere lunghezza/formato validi.
- I percorsi assoluti e i tentativi di uscire dalla root vengono bloccati.
- Un id già presente non viene sovrascritto.
- La pubblicazione è atomica: se `rename` fallisce, il manifest non risulta
  installato.
- Un modello può essere bloccato da un solo load alla volta.
- Campi come prompt, token o chiavi vengono rifiutati perché non fanno parte
  dello schema.

## Evidenza

- RED osservato prima dell’implementazione: modulo assente.
- GREEN: `node --test tests/local-model-store.test.mjs` → **5/5 passati**.
- Sintassi verificata con `node --check`.
- Nessuna prova visiva: non è cambiata la UI.

## File

- `harness-ui/src/local-model-store.mjs`
- `harness-ui/tests/local-model-store.test.mjs`
- `.claude/LEDGER-FASE-8C-LOCAL-MODEL-STORE-2026-08-30.md`
- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md`

## Semplificazione deliberata

`config.mjs` non è stato modificato: il root dei modelli verrà collegato nella
fase supervisor, quando esisterà un consumatore reale. Così non introduciamo
configurazione morta o una preferenza non ancora utilizzabile.

## Riassunto semplice

Abbiamo creato il registro sicuro dei modelli locali. Prima di considerare un
modello “presente”, TALOS controlla identità, revisione, dimensioni, hash e
percorso; se qualcosa va storto, non lascia un file mezzo scritto. Questo
prepara il terreno per avviare il runtime senza perdere modelli o stato.
