# Registro baseline 817a21a9

Esecuzione completa: 626 prove, 555 passate, 45 fallite, 1 timeout, 25 saltate. Tre spec escluse separatamente. Nessuna regressione attribuita come preesistente. Dettagli e artefatti nel JSON omonimo.

| Prova | Esito | File:riga | Classificazione |
|---|---|---|---|
| FASE2-NIENTE-PERSO · nessun id, nessun gancio, nessun controllo in meno | failed | harness-ui/frontend/tests/browser/_fase2-niente-perso.spec.mjs:81 | non ancora attribuito |
| FASE2-VESTITO — le dieci sezioni hanno il vestito del mockup (tema dark) | failed | harness-ui/frontend/tests/browser/_fase2-vestito.spec.mjs:174 | non ancora attribuito |
| FASE2-VESTITO — le dieci sezioni hanno il vestito del mockup (tema light) | failed | harness-ui/frontend/tests/browser/_fase2-vestito.spec.mjs:174 | non ancora attribuito |
| IMP-MOCKUP — le dieci sezioni del mockup | failed | harness-ui/frontend/tests/browser/_impostazioni-parita.spec.mjs:28 | non ancora attribuito |
| ANTEPRIMA-01 — la colonna e' 300 px, e i blocchi stanno nell'ordine del mockup | failed | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:500 | non ancora attribuito |
| ANTEPRIMA-02 — la larghezza e' un TETTO, non una misura | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:620 | non eseguito: motivazione da verificare |
| ANTEPRIMA-03 — i testi sono quelli del mockup, e seguono la LINGUA DELLA RADICE | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:647 | non eseguito: motivazione da verificare |
| ANTEPRIMA-04 — il canvas e' quello VERO dell'engine, e la didascalia dice la scena vera | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:719 | non eseguito: motivazione da verificare |
| ANTEPRIMA-05 — il movimento ridotto: si FERMA e RIPARTE (i due versi) | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:772 | non eseguito: motivazione da verificare |
| ANTEPRIMA-06 — tema chiaro e scuro: i COLORI sono i token, le misure sono del mockup | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:835 | non eseguito: motivazione da verificare |
| ANTEPRIMA-07 — sotto i 1080 px la colonna esce, come nel mockup | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:887 | non eseguito: motivazione da verificare |
| ANTEPRIMA-08 — ferma(): il canvas si stacca, la colonna esce, e la radice non la resuscita | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:898 | non eseguito: motivazione da verificare |
| ANTEPRIMA-09 — la traccia stretta del mockup (1200 px): la colonna scende a 250, e la foto | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:923 | non eseguito: motivazione da verificare |
| MUT-01 — senza la didascalia, la colonna non ha la sua terza fascia | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:966 | non eseguito: motivazione da verificare |
| MUT-02 — senza la classe del canvas, il canvas resta nudo: classe dell'engine e opacita' piena | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:975 | non eseguito: motivazione da verificare |
| MUT-03 — con la lingua fissa, la colonna non segue piu' la radice | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:1000 | non eseguito: motivazione da verificare |
| MUT-04 — senza il verso di ritorno, l'anteprima resta ferma per sempre | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:1008 | non eseguito: motivazione da verificare |
| MUT-05 — senza il tetto nel foglio, la colonna si allarga quanto la traccia | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:1036 | non eseguito: motivazione da verificare |
| FOGLIO-01 — il foglio della colonna non dichiara transizioni o animazioni | skipped | harness-ui/frontend/tests/browser/anteprima-tema.spec.mjs:1059 | non eseguito: motivazione da verificare |
| BACKGROUND-MOTION-COMPOSITOR-02 — lo sfondo si muove senza mutare lo style della radice a ogni frame | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:225 | non ancora attribuito |
| LAG-INTERACTION-DIALOG-38 — una modale pausa lo sfondo e la chiusura lo riprende | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:373 | non ancora attribuito |
| FILE-EXPLORER-TOOLBAR-05 — la sidebar Files espone i quattro comandi e li disabilita senza sessione | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:485 | non ancora attribuito |
| LAG-REPLAY-TEXT-32 — molti delta storici fanno un solo commit visuale finale | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:642 | non ancora attribuito |
| cold start does not expose invented runtime telemetry | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:829 | non ancora attribuito |
| OPEN-WITH-TALOS-BROWSER-01 — il fragment prepara il workspace senza inventare Full access | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:869 | non ancora attribuito |
| Nuova automazione comunica in linguaggio naturale quando non ci sono attività | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:1276 | non ancora attribuito |
| REDUCED-MOTION-02 — l’indicatore resta leggibile e CALMO con movimento ridotto, mai fermo | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:1542 | non ancora attribuito |
| RUN-PRIMARY-STOP-03/RUN-QUEUE-04 — durante il run il primario ferma, Enter accoda e il testo abilita Reindirizza | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:1581 | non ancora attribuito |
| TOOL-LIFECYCLE-SAME-ROW-01 — start, argomenti ed esito aggiornano la stessa riga | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:1852 | non ancora attribuito |
| TOOL-DESCRIPTION-LIFECYCLE-04 — la descrizione del modello resta nella stessa riga dopo la conclusione | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:1893 | non ancora attribuito |
| TOOL-BATCH-AGGREGATION-01 — cinque letture diventano un solo totale grammaticalmente corretto | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:1937 | non ancora attribuito |
| TOOL-LIFECYCLE-ERROR-01 — l’errore conclude la riga e aggiorna il batch correlato | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:1972 | non ancora attribuito |
| WAITING-LOADER-MOTION-01 — il loader reale è quello del mobile e avanza fra due fotogrammi | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:2035 | non ancora attribuito |
| WAITING-LOADER-REDUCED-MOTION-01 — ridurre il movimento CALMA il loader, non lo congela | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:2080 | non ancora attribuito |
| lo streaming porta l’ultimo output verso il centro della conversazione | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:2124 | non ancora attribuito |
| CHAT-FULL-WIDTH-01 — allarga solo messaggi e bolle, mai il composer | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:2254 | non ancora attribuito |
| COMPOSER-SHAPE-FULL-WIDTH-01 — il toggle full width preserva ogni forma del composer | timedOut | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:2328 | non ancora attribuito |
| COMPOSER-MOCKUP-HEIGHT-01 — ogni forma desktop conserva l’altezza canonica del mockup | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:2375 | non ancora attribuito |
| CHAT-FULL-WIDTH-SHORT-BUBBLE-01 — una domanda breve non viene stirata | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:2425 | non ancora attribuito |
| LAG-LIVE-INCREMENTAL-40 — i blocchi già chiusi non vengono ricreati a ogni delta, la coda sì e il testo finale è completo | failed | harness-ui/frontend/tests/browser/baseline-shell.spec.mjs:2598 | non ancora attribuito |
| BC78-2 (1440x900, dark) — dove la barra taglia, si vede che continua | failed | harness-ui/frontend/tests/browser/bc78-barra-e-dettaglio.spec.mjs:40 | non ancora attribuito |
| BC78-2 (1440x900, light) — dove la barra taglia, si vede che continua | failed | harness-ui/frontend/tests/browser/bc78-barra-e-dettaglio.spec.mjs:40 | non ancora attribuito |
| CTX-UI-DESKTOP-ROUNDTRIP pulsante, SQLite e replay della chat vera | failed | harness-ui/frontend/tests/browser/context-compactor.spec.mjs:64 | non ancora attribuito |
| FACCETTE-07 — con il tema CHIARO la barra si vede lo stesso, e non nasce nessun errore a runtime | failed | harness-ui/frontend/tests/browser/lab-faccette.spec.mjs:562 | non ancora attribuito |
| AZ-FOTO — «Elimina» e «Rinomina» a schermo nei due temi a 1024 e 1440, fotografati e mai eseguiti | skipped | harness-ui/frontend/tests/browser/lab-installati-azioni.spec.mjs:509 | non eseguito: motivazione da verificare |
| PAGINA-10 — le foto: due temi, due larghezze, e zero errori in console | failed | harness-ui/frontend/tests/browser/lab-pagina-modello.spec.mjs:863 | non ancora attribuito |
| FILL-02 — un chip FILTRA davvero, si toglie, e i conteggi non si rimpiccioliscono | failed | harness-ui/frontend/tests/browser/lab-provider-filtri.spec.mjs:205 | non ancora attribuito |
| FILL-03 — OR dentro una faccetta, AND fra faccette, e la ricerca è una terza faccetta | failed | harness-ui/frontend/tests/browser/lab-provider-filtri.spec.mjs:243 | non ancora attribuito |
| PROV-03 — «Configura» apre la MODALE col nome del fornitore e i campi veri, e «Verifica accesso» fa partire la sonda VERA | failed | harness-ui/frontend/tests/browser/lab-provider.spec.mjs:393 | non ancora attribuito |
| SCHEDA-01 — le tre schede: ruoli, `aria-controls`, pannello unico, e la prima riga di README | failed | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:472 | non ancora attribuito |
| SCHEDA-02 — si cambia scheda: dal clic, dalla tastiera, e la rotta lo sa | skipped | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:553 | non eseguito: motivazione da verificare |
| SCHEDA-03 — l'indice del README: ogni voce porta al suo titolo, col fuoco | skipped | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:589 | non eseguito: motivazione da verificare |
| SCHEDA-04 — i file: il confronto delle impronte, il troncamento onesto, la copia INTERA | skipped | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:648 | non eseguito: motivazione da verificare |
| SCHEDA-05 — importato dal computer: non si inventa una scheda, e la rotta del repository NON si chiama | skipped | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:756 | non eseguito: motivazione da verificare |
| SCHEDA-06 — il verdetto di memoria: i nove casi, i due numeri diversi, e `<meter>` fatto bene | skipped | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:791 | non eseguito: motivazione da verificare |
| SCHEDA-07 — regge il vuoto, l'errore e i dati storti — e li DICHIARA | skipped | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:935 | non eseguito: motivazione da verificare |
| SCHEDA-08 — le foto: i due temi, le due larghezze, e zero errori in console | skipped | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:1045 | non eseguito: motivazione da verificare |
| SCHEDA-09 — il montaggio: la pagina si apre dalla ROTTA dentro un contenitore che scorre | skipped | harness-ui/frontend/tests/browser/lab-scheda-modello.spec.mjs:1150 | non eseguito: motivazione da verificare |
| SIS-07 — «disponibile» e «raggiunto» misurano due cose diverse, dallo stesso carico | failed | harness-ui/frontend/tests/browser/lab-sistema.spec.mjs:426 | non ancora attribuito |
| OSS-3 — gli errori del sandbox di una pagina ospitata NON sono nostri (dark) | failed | harness-ui/frontend/tests/browser/p0bis-c.spec.mjs:629 | non ancora attribuito |
| OSS-3 — gli errori del sandbox di una pagina ospitata NON sono nostri (light) | failed | harness-ui/frontend/tests/browser/p0bis-c.spec.mjs:629 | non ancora attribuito |
| OPENROUTER-REAL-QWEN-09 — composer, tool trace, cambio modello, follow-up e reload restano coerenti | skipped | harness-ui/frontend/tests/browser/real-qwen-conversation.spec.mjs:21 | non eseguito: motivazione da verificare |
| BC63-R1-CENTRALE — il tasto centrale sulla linguetta la CHIUDE (è il gesto di ogni browser) | failed | harness-ui/frontend/tests/browser/schede-gesti.spec.mjs:83 | non ancora attribuito |
| BC63-R1-CANC — Canc chiude la scheda che ha il fuoco, e il fuoco non si perde | failed | harness-ui/frontend/tests/browser/schede-gesti.spec.mjs:94 | non ancora attribuito |
| BC63-R1-F2 — F2 apre la rinomina, Invio conferma e il nome RESTA | failed | harness-ui/frontend/tests/browser/schede-gesti.spec.mjs:104 | non ancora attribuito |
| BC63-R1-DOPPIOCLIC — il doppio clic apre la rinomina, Esc annulla e il nome di prima torna | failed | harness-ui/frontend/tests/browser/schede-gesti.spec.mjs:118 | non ancora attribuito |
| BC63-R1-INERTE — durante la rinomina la linguetta è INERTE: un doppio clic dentro il campo non butta via ciò che hai scritto | failed | harness-ui/frontend/tests/browser/schede-gesti.spec.mjs:135 | non ancora attribuito |
| BC62-01 — entrare nella vista Terminale non crea schede: una per sessione, anche passando da A a B e ritorno, anche dopo una ricarica | failed | harness-ui/frontend/tests/browser/terminale-una-scheda-sola.spec.mjs:27 | non ancora attribuito |
| BC62-02 — al contrario: «Nuovo» crea ESATTAMENTE una scheda in più | failed | harness-ui/frontend/tests/browser/terminale-una-scheda-sola.spec.mjs:60 | non ancora attribuito |
| @visual 24-scenario visual matrix stays inside the desktop contract | failed | harness-ui/frontend/tests/browser/visual-matrix.spec.mjs:264 | non ancora attribuito |
| WORKSPACE-CHOOSER-REAL-21 — UI e browser directory reale condividono il contratto | skipped | harness-ui/frontend/tests/browser/workspace-chooser-real.spec.mjs:3 | non eseguito: motivazione da verificare |
