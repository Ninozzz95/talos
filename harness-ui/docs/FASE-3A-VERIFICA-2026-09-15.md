# Fase 3A — evidenza di verifica

Data: 2026-09-15

## TDD

RED funzionale valido:

- workflow run `34958725499`;
- dipendenze backend + context engine installate correttamente;
- 5/5 test batch fallivano perché la nuova route rispondeva `405`;
- nessuna produzione batch era ancora presente.

Un run precedente (`34958652610`) non è conteggiato come RED: il test non partì perché mancavano le dipendenze del context engine.

## Produzione

Commit produzione:

- `18a856136513aa08a4643b86f0065dec90478a8b` — `feat(phase3): add bounded batch deletion API`.

Il batch:

- accetta soltanto `library`, `notes`, `tasks`, `memory`, `research`;
- mantiene `projects` fuori dal contratto distruttivo;
- valida completamente il body prima della prima mutazione;
- limita a 250 id unici e non vuoti;
- applica 64 KiB soltanto alla nuova route;
- esegue gli elementi serialmente e conserva l'ordine;
- continua dopo un errore individuale, senza rollback globale;
- riusa i mutatori già esistenti delle API singole/store.

Durante il primo tentativo GREEN il test >64 KiB ha rilevato che il parser storico distruggeva il socket prima di poter inviare il `413`. Il parser è stato esteso con un'opzione: il comportamento storico resta il default per tutte le rotte esistenti, mentre il batch drena senza accumulare e può restituire la busta `PAYLOAD_LIMIT`.

## GREEN

Run focalizzato allargato `34959401886`:

- contratto batch: 5/5 pass;
- regressioni HTTP adiacenti: 203/203 pass;
- inventario rotte 404/405: pass;
- CRUD Note/Attività/Memoria: pass;
- session routes: pass;
- Research routes: pass;
- Research export routes: pass.

Run finale sul cleanup del patcher temporaneo `34959485794`: success.

La review successiva ha aggiunto test avversariali per:

- body >64 KiB in transfer chunked, senza `Content-Length`;
- query string sulla route batch;
- id Research con traversal.

Il gate finale su questi test e sulle regressioni adiacenti è `34959647906`.

## Diff/scope

Il patcher GitHub Actions usato per applicare deterministicamente la modifica al grande `http-app.mjs` è stato rimosso dal branch prima della PR.

Diff rispetto al `main` di partenza `80149f1ebe6a1d4c8716e222700c3e3a5e0492d6`:

- `.github/workflows/phase3a-batch.yml`
- `harness-ui/docs/FASE-3-PIANO-ESECUTIVO-2026-09-15.md`
- `harness-ui/docs/FASE-3A-VERIFICA-2026-09-15.md`
- `harness-ui/src/http-app.mjs`
- `harness-ui/tests/http-routes-batch-phase3.test.mjs`
- `harness-ui/tests/http-routes-batch-phase3-review.test.mjs`

Nessun file `mobile/**` modificato.
