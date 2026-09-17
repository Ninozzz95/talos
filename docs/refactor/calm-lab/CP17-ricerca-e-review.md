# CP17 — ricerca per risultati, isolamento degli scenari e handoff

La nuova esecuzione 35274718897 sullo SHA `3108a32b1d49749b72f8fb2f02a7bb8ed336d65a` distingue i risultati:

- Impostazioni reali: 45 controlli passati, tutte le 40 preferenze provate e rilette dopo reload, 14 temi, zero pageerror/avvisi console, zero select/checkbox/range nativi visibili nel perimetro.
- Frontend: 1173 pass, 1 skip, 0 fail.
- Prototipo: 153 test Node, 17 contratti controlli, 58 verifiche appearance, 30 combinazioni responsive e 17 percorsi catalogo passati.
- Workspace generale: 61 controlli passati, 2 scenari falliti, zero pageerror e 8 avvisi/errori console conservati. La suite Settings/Models successiva non è stata eseguita perché lo script si arresta sul primo comando fallito. Il gate finale è failure.

La lettura dei report e dello schema reale ha individuato il contratto mancato: `settings-view.ts` rende una lista di risultati e nasconde i pannelli durante la query. Il test cercava la riga originale subito dopo `fill('riprendi')`, senza aprire il risultato `workspaceRestore`. La query rimaneva quindi attiva e nascondeva anche il controllo lingua nello scenario seguente.

Il test ora verifica che il risultato sia visibile, lo apre, verifica la cancellazione della query e mantiene l'assert sulla riga originale. Gli scenari densità/lingua selezionano esplicitamente Aspetto, senza dipendere dallo stato lasciato da altri scenari. Nessuna modifica a prodotto, default o persistenza, nessun assert rimosso, nessun force o retry cieco.

Questa correzione richiede una nuova esecuzione: il successo delle 45 prove tema non viene spacciato per il successo globale del workspace. Tutti i report negativi sono nel dossier consegnato all'owner. La PR rimane Draft, senza merge/tag/release.
