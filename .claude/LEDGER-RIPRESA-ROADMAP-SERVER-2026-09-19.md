# Aggiornamento roadmap e ripristino 4174 — 19/09/2026
Owner: docs e operazioni locali. Nessuna modifica al prodotto, commit, push o delega.

## Evidenza iniziale
20:34 UTC: health, app.js e styles.css rifiutano connessione; PID194352 assente, porta4174 senza listener. Log precedente termina dopo avvio riuscito33/33, senza eccezione fatale. Causa non attribuita; possibile dipendenza dal processo di lancio da verificare, non diagnosi.

## File esatti
- .claude/ROADMAP-GLOBALE-RIPRESA-2026-09-19.md: inserire quadro corrente e sequenza raccomandata, mantenere storico e ID univoci.
- .claude/TABELLA-FASI-COMPLETA-2026-09-13.md: inserire rinvio alla ricognizione aggiornata; conservare requisiti/storia, non modificare vecchie prove in nuovi verdi.
- .claude/LEDGER-RIPRESA-ROADMAP-SERVER-2026-09-19.md: registro di questo intervento.
- .claude/ripresa-2026-09-19/restore-4174-20260919T2034Z/avvia.py: avvio operativo una tantum, nessun servizio/task pianificato. Riusa medesimo Node/kernel/public/sessioni, verifica porta libera, log su file e stdin nullo; distacco nativo Windows dal processo lanciatore. Non ferma alcun processo.
- Stessa cartella: process.json, server.log, server.err.log, verification.json; backup dei due markdown con nomi roadmap-before.md e tabella-before.md; sessions-before.zip con dati solo locali.

## Ricerca operativa e decisione
https://docs.python.org/3/library/subprocess.html#subprocess.CREATE_BREAKAWAY_FROM_JOB
https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags
Consultate19/09/2026. Adottare primitive Python/Win32 esistenti, shell=False, DETACHED_PROCESS|CREATE_NEW_PROCESS_GROUP|CREATE_BREAKAWAY_FROM_JOB; nessuna dipendenza o task persistente. Non attribuire lo stop precedente a un job senza prova.
Python 3.14.6; Node C:/Program Files/nodejs/node.exe versione v24.18.0.
RED operativo: connessione rifiutata e PID assente. GREEN: processo distinto, health200, recupero33sessioni, hashHTTP=public dopo uscita del launcher; ricontrollo in comando separato. Stabilità fra turni rimane da confermare. Documenti: unicità33task preservata, sezioni/storico conservati, diff --check. Nessuna suite prodotto necessaria per soli documenti e riavvio a sorgenti invariati.
Rollback: ripristinare solo i due markdown dai backup; eventuale stop solo PID creato e dopo controllo attività. Non ripristinare gli archivi sessioni sopra dati successivi. Rischio dati protetto da copia locale prima dell'avvio.

Esito 2026-09-19T20:37:41+00:00: launcher terminato exit0 senza sessione pendente; PID19300, health200,33sessioni,hashHTTP=public in comando separato. Causa dello stop precedente non attribuita; gate fra turni ancora aperto. Roadmap aggiornata in testa e tabella canonica collegata, storia conservata.
