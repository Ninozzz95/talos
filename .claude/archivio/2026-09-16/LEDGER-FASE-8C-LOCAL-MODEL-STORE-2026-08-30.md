# Ledger Fase 8C — store locale modelli — 2026-08-30

## Perimetro

Ownership desktop: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui`.
La lane mobile e il runtime nativo restano in sola lettura. La fase non avvia
processi, non scarica modelli, non cambia UI e non abilita inferenza.

## File e simboli

| Azione | File | Simboli pubblici | Scopo |
|---|---|---|---|
| Crea | `harness-ui/src/local-model-store.mjs` | `LOCAL_MODEL_STATES`, `LocalModelStoreError`, `createLocalModelStore(options)` | manifest validati, persistenza atomica e lock in memoria |
| Crea | `harness-ui/tests/local-model-store.test.mjs` | 5 test Node | traversal, collisione, lock e interruzione atomica |
| Modifica | `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` | Task 1 | registra che `config.mjs` resta invariato finché il runtime non viene collegato |

## Contratto

`createLocalModelStore({ rootDir, fsImpl, now })` restituisce:

- `inspect(id)` — legge e valida il manifest, restituisce `null` se assente;
- `register(manifest)` — valida e pubblica tramite file temporaneo + `rename`;
- `lock(id)` / `unlock(id)` — impediscono due load simultanei dello stesso id;
- `remove(id)` — rimuove il manifest, ma rifiuta un modello sotto lock.

Manifest esatto: `id`, `repo`, `revision`, `files[]`, `bytes`, `sha256`,
`license`, `path`, `state`, `updatedAt`. Revision e digest devono essere
completi; i byte totali devono coincidere con la somma dei file; path assoluti,
traversal e campi sconosciuti sono rifiutati.

## TDD e comandi

1. RED: il test iniziale falliva con `ERR_MODULE_NOT_FOUND` per
   `src/local-model-store.mjs`.
2. GREEN: `node --test tests/local-model-store.test.mjs` → **5 passati, 0 falliti**.
3. Sintassi: `node --check src/local-model-store.mjs` → pass.
4. Regressione completa prevista a fine fase: `node --test tests/*.test.mjs`.

## Ricerca e decisione upstream

La persistenza atomica segue il pattern già presente in
`harness-receipt-keypair.mjs` (file temporaneo + `rename`). La cache futura
seguirà la raccomandazione ufficiale Hugging Face di revision completa e
snapshot integro; questo store non scarica e non interpreta cache Hub. Il
manifest osservabile e il lock sono un’estensione TALOS del registry centralizzato
usato da Hermes.

## Failure, rollback e prova utente

- File temporaneo lasciato da un crash: il target non appare in `inspect`.
- Hash/revision/path/collisione/lock errati: errore tipizzato, nessuna scrittura
  parziale.
- Rollback: eliminare `harness-ui/src/local-model-store.mjs` e
  `harness-ui/tests/local-model-store.test.mjs`; nessun altro modulo dipende
  ancora dallo store.
- Prova visiva: non applicabile, nessuna superficie utente modificata.

## Esito

Fase 1 chiusa. Il prossimo passo è il supervisor `llama-server`; solo lì il
root modelli verrà portato in `config.mjs`, insieme al processo loopback e ai
gate di avvio/arresto.
