# Ledger — boot robusto e watcher lazy

Data: 2026-09-01
Stato iniziale: **RED reale riprodotto**

## File e simboli

### Modificare

1. `harness-ui/src/session-registry.mjs`
   - funzione pubblica stabile `createSessionRegistry`;
   - metodo pubblico stabile `ripristina()`;
   - metodo pubblico stabile `resume(sessionId, nuovoMessaggioUtente)`;
   - introdurre un helper interno per attivare una sola volta il watcher della
     voce quando parte o riparte un giro reale;
   - non cambiare le firme pubbliche né il formato JSONL.
2. `harness-ui/tests/session-registry.test.mjs`
   - scenario permanente `SESSION-RESTORE-LAZY-WATCHER-24`.
3. `.claude/CONSEGNA-BOOT-WATCHER-2026-09-01.md`
   - evidenza test, riavvio, risorse e rollback.
4. `.claude/CONSEGNA-OPENROUTER-RESILIENZA-2026-09-01.md`
   - sostituire il vecchio blocco autorizzazione con l'esito reale del gate.
5. `.claude/LEDGER-OPENROUTER-RESILIENZA-2026-09-01.md`
   - registrare l'autorizzazione permanente ai riavvii controllati e il gate.

### Creare

1. `.claude/DOSSIER-RICERCA-BOOT-WATCHER-2026-09-01.md`
2. `.claude/LEDGER-BOOT-WATCHER-2026-09-01.md`
3. `.claude/CONSEGNA-BOOT-WATCHER-2026-09-01.md`

### Eliminare

Nessun file.

## RED atteso

`SESSION-RESTORE-LAZY-WATCHER-24` prepara una sessione persistita, crea un
registro nuovo con uno spy di `guardaWorkspaceFn` e chiama `ripristina()`.
Prima del fix lo spy vale `1`; il contratto richiede `0`. Dopo un follow-up
reale lo spy deve diventare `1`, e un turno successivo deve lasciarlo a `1`.

## GREEN e regressioni

1. `node --test harness-ui/tests/session-registry.test.mjs harness-ui/tests/workspace-watcher.test.mjs`
2. `node --test harness-ui/tests/*.test.mjs`
3. `npm run test:browser` in `harness-ui/frontend`
4. `git diff --check`

## Gate reale e prova umana

1. verificare che il PID target appartenga a `node harness-ui/server.mjs`;
2. avviare nascosto con il runtime owner già misurato e la porta `4174`;
3. health e Doctor;
4. controllare che il processo non accumuli handle/memoria durante il boot;
5. inviare dal composer un task naturale esclusivamente a
   `qwen/qwen3.8-flash`, osservare tool start/result/fine;
6. cambiare modello solo come impostazione sintetica, tornare a Qwen, inviare
   un follow-up reale, ricaricare e verificare cronologia e attribuzione;
7. acquisire e ispezionare gli screenshot completi.

## Rollback

Ripristinare il precedente avvio immediato del watcher dentro `ripristina()` e
rimuovere il test. Non toccare né cancellare `.sessions-store`: i dati owner
restano invariati.

