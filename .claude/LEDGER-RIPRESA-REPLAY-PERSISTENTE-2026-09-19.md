# D-TIME-01 — replay persistente, ledger 19/09/2026
Owner: main agent, harness desktop backend + TALOS UI. Nessuna delega, commit o push.

## File e simboli esatti
- harness-ui/src/agent-timeline.mjs (nuovo): creaTimelineAgenti; registra, ripristina, leggi, stato. Journal talos.agent-timeline.v1, record tipo grafo-agenti nel registro JSONL della radice. Ordinamento seq per radice, timestamp osservato, node projection senza prompt completo/argomenti/output/ragionamento.
- harness-ui/src/session-registry.mjs: createSessionRegistry, broadcast, avviaESegui, ripristina, annunciaAgenteAgliAntenati; nuovi nodoTimeline, registraTimeline, radiceTimeline, timelineAgenti. Preservare AG-UI e talos.agenti effimero, _sequenza e contratto children.
- harness-ui/src/http-app.mjs: registro metodi e dispatch GET /api/v1/sessions/:id/agent-timeline; query after/through/limit validata e cursore stabile, errore leggibile.
- harness-ui/frontend/src/components/cronologia-grafo.js (nuovo): creaCronologiaGrafo; reducer sequenziale con seek, solo nodi già osservati. Nessun troncamento120.
- harness-ui/frontend/src/components/grafo-agenti.js: montaGrafoAgenti, mostraIstante, ridisegna, aggiorna, distruggi; lettura paginata con coalescenza, replay a clock congelato, pausa/play/velocità/passaggio evento, stato errore/copertura e arretrati. Ultimo frame rimane in pausa finché non scelto Live. Richieste tardive ignorate dopo smontaggio.
- harness-ui/frontend/src/legacy/app.js: apriGrafoAgenti passa API lettura cronologia; polling già presente riusato, nessun ulteriore stream comandi.
- harness-ui/frontend/src/styles/grafo-agenti.css: timeline compatta responsive, tastiera e riduzione movimento.
- harness-ui/tests/agent-timeline.test.mjs (nuovo): RIPRESA-REPLAY-DUREVOLE, ORDINE, PRIVACY, LEGACY, DISCO, HTTP.
- harness-ui/frontend/tests/unit/cronologia-grafo.test.mjs (nuovo): seek deterministico, gap/duplicati, niente futuro, oltre120, pauseclock.
- harness-ui/frontend/tests/browser/ripresa-replay.spec.mjs (nuovo): riapertura/reload, seek/play/pause, ultimi eventi, errore/retry, durata immobile;1024/1440 chiaro/scuro.
- harness-ui/frontend/scripts/ripresa-run.mjs: additions per nuovi sorgenti/test.
- .claude/ROADMAP-GLOBALE-RIPRESA-2026-09-19.md: stato effettivo e limiti, nessuna spunta senza prova.

## Ricerca primaria e decisione upstream
Consultati live19/09: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing (append-only, ordine e versioni, snapshot non sostitutivi); https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesappendfilepath-data-options (flush e coda scritture); https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame (clock monotono e sospensione in background).
Adattare il registro session-store già esistente con Node24.18.0/fs appendFile flush:true; Dagre3.1.1, Playwright1.62.1/esbuild0.28.2 invariati. Nessun database/event broker nuovo: singolo processo desktop e coda per file già presente; Azure/AWS documentano pattern ma non forniscono un contratto di proiezione del dominio TALOS. Un broker aggiungerebbe processo e migrazione senza risolvere la proiezione/garanzie dei log vecchi.

## Contratto e limiti
Raccolta dal server dalla nascita della sessione, indipendente dalla UI. Append di un nodo al cambiamento operativo; timestamp per riproduzione, seq per ordine. Checkpoint iniziale esplicito parziale per log legacy: non inventare passato. Crash con attività aperta produce discontinuità segnalata. API non scrive; dati privati non duplicati. Un errore disco non blocca chat ma cronologia non dichiarata completa. Seek riproduce stato e statistiche, non esegue strumenti né riavvolge i file fisici (anteprima etichettata contenuto attuale).

## RED / GREEN / prova finale
RED: node scripts/ripresa-run.mjs backend agent-timeline.test.mjs: timelineAgenti assente. Poi unit/browser permanenti prima delle modifiche UI.
GREEN: stesso comando; backend session-registry.test.mjs subagent-orchestrator.test.mjs http-routes-model-lab.test.mjs; unit completo; browser ripresa-replay.spec.mjs e po30 (nome da individuare prima di modifica test). git diff --check. Banco reale HTTP con runtime controllato e store temporaneo, riavvio e hash dati. Provider reale è gate successivo separato: nessuna inferenza owner implicita.
Verifica avversariale main separata (non indipendente): guasti append, query cursore, pagina duplicata, mount tardivo, mancati dati e clock.
Screenshot prima/dopo su banco e confronto con Downloads/talos-sidebar-calm-review.html; mai mockup chat.4174 GET-only; backend consegnato con backup e riavvio solo senza attività owner in corso. Rollback: ripristinare esclusivamente i file propri da ripresa-2026-09-19/replay-before-20260919; record nuovi non riscritti, vecchio codice ignora tipo metadata.

Spec regressione esatta: harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs. Il test timeline effimera va riconciliato con fonte server dichiarata, preservando i suoi assert stato/interazione.

Progressione: RED backend4e466c02:5/5 fallimenti pertinenti (API/method assenti). Backend099e6131 suite registro/orchestratore/API/replay verde. RED UI97af2126: slider0 invece2 (cronologia non caricata). Primo integrato dd516633: errore reale paginazione (sequenza letta dal contenitore invece dal record) e vecchia fixture replay client da riconciliare. RIPRESA-REPLAY-PAGINE-CONTIGUE riprodotto RED unit, fix indicizzato record.seq; permanente. Nessuna consegna di quei run rossi.

Revisione visiva7ece0a94: nel banco HTTP reale dopo reload il seek al primo frame conserva una traslazione della vista precedente e taglia la sommità della card radice. Scenario permanente RIPRESA-REPLAY-INQUADRATURA in ripresa-replay.spec.mjs (rettangolo card interamente nel canvas); modifica prevista mostraIstante in grafo-agenti.js per reinquadrare in modalità Lettura al seek manuale. Il playback continua a conservare la vista fra eventi.

Consegna esatta: harness-ui/public/app.js, harness-ui/public/styles.css, harness-ui/public/build-manifest.json. Script operativo C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\.claude\ripresa-2026-09-19\delivery-replay-20260919T195957Z\aggiorna.ps1; backup public-before e sessions-before, 33 sessioni. Frontend/backend sorgenti controllati per hash: 366. Solo PID71692, guardia attività prima dello stop, avvio hidden.


## D-TIME-01 — consegna replay persistente, 19/09/2026
Il server registra gli eventi operativi del grafo nel JSONL della radice, anche senza grafo aperto. Ordine per sequenza, paginazione con limite superiore fisso, proiezione storica senza campi del futuro. Rimossi i 120 snapshot solo browser. Play/pausa, velocità, evento precedente/successivo, seek e ritorno esplicito in diretta; durata ferma in pausa; arrivi live non spostano il punto scelto. Riavvio e riapertura verificati con server HTTP, registro e store reali, runtime controllato senza inferenza provider.

Prove conservate in harness-ui/frontend/artifacts/ripresa:
- 2026-09-19T19-52-40-242Z-backend-c3edafd3: 431/431, sorgenti backend consegnati identici.
- 2026-09-19T19-53-42-206Z-unit-befe5d5c: 1447/1447 frontend, prima dell'ultima correzione di inquadratura al seek.
- 2026-09-19T19-49-43-164Z-browser-cff7c3a5: 45/45 PO30 e replay, prima dell'ultima correzione di inquadratura.
- RIPRESA-REPLAY-INQUADRATURA: RED f1d1bf97 (sommità card sopra canvas); GREEN finale 2026-09-19T19-58-22-248Z-browser-a73e8728, 8/8, sei scenari replay inclusa integrazione HTTP/riavvio e regressioni mockup/densità. Tutte le cinque immagini replay finali ispezionate; card interamente nel canvas.

4174 aggiornata, PID194352, HTTP200, 33 sessioni recuperate. Riavvio autorizzato eseguito solo dopo controllo assenza chat attive; backup e verifica in .claude/ripresa-2026-09-19/delivery-replay-20260919T195957Z. Bundle finale da a73e8728, verifica hash di 366 sorgenti. app.js SHA256 52b9f6dbf6c84008f1cfbac88c594114e94bc48a8fd17b8c6c762b8825ed5f30; styles.css SHA256 c96134bca97e6aac267278b8736dcb6e522b7f236dcd7bba96126c1b963dc07a. HTTP uguale a public.

Confronto testa a testa finale con i due originali canonici, hash invariati:
- .claude/ripresa-2026-09-19/grafo-live-2026-09-19T20-00-42-010Z-7630e622: 12 screenshot ispezionati singolarmente, 1024/1440/2560 scuro, 13 discendenti/14 nodi con radice. Nessun overflow del contenitore. Lettura >=80%; Adatta consente panoramica più piccola nei contenitori stretti.
- .claude/ripresa-2026-09-19/confronto-live-2026-09-19T20-00-42-011Z-bd7d5931: quattro screenshot ispezionati singolarmente, pagina modello e laboratorio. README 960 px e sidebar presente; persistono doppia navigazione, eccesso di spazio prima della lista e densità filtri (D-LAB-03). Non dichiarata parità visiva completa.
- Le sessioni browser live bloccano non-GET e WebSocket prima della navigazione: zero richieste mutanti, zero socket, zero errori nei rapporti. Nessun mockup chat/composer usato.

Revisione avversariale svolta dal medesimo autore in passaggio separato, NON indipendente: errore disco, schema sconosciuto, sequenza riservata, pagine duplicate/incoerenti, clock retrogrado, seek dopo reload e dati futuri. Correzioni permanenti PAGINE-CONTIGUE, VERSIONE e INQUADRATURA con RED/GREEN. Nessun nuovo difetto bloccante rilevato nella rilettura finale dei reducer e del journal.

Limiti espliciti: il passato non registrato resta unavailable/partial, mai ricostruito come cronologia esatta. Il replay riguarda il grafo della famiglia di sessioni; le altre viste restano attuali, i file fisici non vengono riavvolti. Il journal non tronca gli eventi ma le proiezioni mantengono i limiti già esistenti delle attività recenti. Durata/prestazioni con moltissimi eventi e inferenza reale non certificate da questo lotto. D-TIME-01 implementato e verificato sul banco per le nuove registrazioni; gate R5 reale ancora aperto.

Registrazione finale: 2026-09-19T20:06:27+00:00
