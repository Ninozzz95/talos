# Lotto accorpato: Agenti e grafo operativo

Mandato aggiornato: due consegne integrate, Model Lab e sidebar Agenti/grafo; nessuna delega, commit o push. Le verifiche già valide vengono riutilizzate. R0/R1/R3/R5 restano criteri di accettazione, non ulteriori passaggi cerimoniali. Gli altri requisiti della roadmap non sono cancellati.

## Ricognizione e ricerca prima delle modifiche

`inspector.js:disegnaAgenti` ricrea tutta la lista e non ha ricerca né ingresso grafo. `dettaglio-agente.js:creaDettaglioAgente` conserva Panoramica/File/Eventi/Conversazione ma manca l'ingresso grafo. `app.js:caricaFigliSessione` legge children; il catch azzera le righe anche quando esiste uno snapshot valido e manca la guardia della sessione nel ramo errore. Queste sono regressioni da caratterizzare, non ragioni per sostituire i monoliti.

La PR33 effettiva 55f2d1b26a51aaeaf0bbb3b05b6ea8dad3ffc32f, archivio verificato ec8d9a452c21f9b465e0ea44b6c43c73bedf2c5ce5dc6df88b20a5658f68371224, usa posizioni predisposte e otto agenti demo. Si adattano linguaggio visivo e ingressi; non si portano fixture, dipendenze finte, retry simulato o replay inventato.

Ricerca primaria 19/09/2026: [Dagre API](https://github.com/dagrejs/dagre/wiki), [licenza](https://github.com/dagrejs/dagre/blob/master/LICENSE), [tastiera W3C](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/), [Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture). Decisione: adottare direttamente @dagrejs/dagre 3.1.1 e graphlib 4.0.5 dietro un adapter TALOS, per layout reale da relazioni padreId/forkDa. Pin registry sha512-zroZB1dFOFiGgv4Xcrn1DckB1o4aOikPqD2NDQPV0WM//CXGcS6xiD0rNkqHmw6FEg4tabt4nxPLwgCWT+Vb2A==; MIT. Il layout manuale della demo non gestisce dati arbitrari; Graphviz richiede un processo/WASM e un confine superflui per questi grafi; Cytoscape comporta un secondo renderer invece dei controlli HTML nativi del prodotto. Esbuild 0.28.2 e Playwright 1.62.1 invariati. Copiare entrambe le licenze nella build e registrarle nel manifest.

## File esatti e simboli

| File | Intervento |
|---|---|
| harness-ui/frontend/package.json | pin diretto Dagre |
| harness-ui/frontend/package-lock.json | albero esatto e integrità |
| harness-ui/frontend/scripts/copy-vendored-assets.mjs | copyVendoredAssets: licenze Dagre e graphlib |
| harness-ui/frontend/scripts/ripresa-run.mjs | creaSnapshot: includere i tre nuovi sorgenti/prove nominati sotto |
| harness-ui/frontend/src/components/grafo-agenti.js | nuovi modelloGrafoAgenti, layoutGrafoAgenti, montaGrafoAgenti; normalizzazione da sessioni/children, filtri, selezione, collasso, zoom/pan, aggiornamento e distruzione |
| harness-ui/frontend/src/components/inspector.js | disegnaAgenti: ricerca e filtro persistenti durante il refresh, comando grafo solo quando collegato; conservare menu e apertura |
| harness-ui/frontend/src/components/dettaglio-agente.js | creaDettaglioAgente: callback additiva apriGrafo e bottone; preservare quattro sezioni |
| harness-ui/frontend/src/legacy/app.js | import, apriGrafoAgenti, chiudiGrafoAgenti, aggiornaGrafoAgenti; montaggio centrale nella chat; callback da lista/dettaglio; caricaFigliSessione conserva snapshot e segnala errore; distruzione al cambio sessione |
| harness-ui/frontend/src/styles/grafo-agenti.css | nuova vista centrale e controlli della lista, token TALOS e geometria responsive |
| harness-ui/frontend/src/styles/main.css | import del nuovo foglio |
| harness-ui/frontend/tests/unit/grafo-agenti.test.mjs | normalizzazione, relazioni, cicli, duplicati, filtri, pin/layout Dagre e scala |
| harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs | RIPRESA-GRAFO-INGRESSI, FILTRI, NAVIGAZIONE, ERRORE, foto/geometry e test ricerca lista durante aggiornamento |

Delivery separata e verificata: harness-ui/public/app.js, styles.css, build-manifest.json, vendor/dagre/LICENSE-dagre, vendor/dagre/LICENSE-graphlib, asset-manifest.json se generato diverso. Il ledger della delivery elencherà gli esatti file effettivamente cambiati prima della copia.

## Contratti e prove

Emendamento prima dell'adeguamento del contratto di packaging: aggiungere il file esatto `harness-ui/frontend/tests/contract/vendored-assets.test.mjs`, scenario PHASE1-ASSET-ALLOWLIST-01. Il totale atteso passa da 30 a 32 per le due licenze nominative, mantenendo controlli hash/ordine ed esistenza; aggiungere confronto byte del testo MIT con i pacchetti installati. Simboli interni aggiunti al ledger: filtriAgenti (WeakMap), datiGrafoAgenti, GRAFO_APERTO_KEY, figliLettura/figliErrore/figliAggiornati. Backup antecedente al prodotto: ripresa-2026-09-19/agenti-backup-134712-14da0e59. RED browser bc228be3: entrambi i nuovi ingressi assenti. GREEN focalizzato 71e0c486: entrambi presenti. Unit Dagre reale: quattro verdi, 200 nodi circa 32 ms sul banco (non SLA generale).

Nessuna nuova API. GET sessions, children, eventi e file rimangono proprietari del backend. Le relazioni sono soltanto quelle restituite dal backend; non si inferiscono dipendenze dal testo. I dati esterni passano per textContent. Il grafo resta centrale e il dettaglio destro resta apribile; File/Contesto/Processi/Review continuano ad avere i propri ingressi. Filtri non distruggono identità, focus o testo digitato. Errori di rete mostrano lo snapshot come non aggiornato; risposte vecchie non possono contaminare un'altra sessione.

RED: RIPRESA-GRAFO-INGRESSI fallisce perché manca il comando nella lista; NAVIGAZIONE manca il grafo, FILTRI manca la ricerca. Aggiungere i test prima del prodotto. GREEN unico browser: po30-dettaglio-agente + colonna-destra-p0 + lab-*; unit completa dopo implementazione. Gate upstream: layout con Dagre reale, coordinate finite/non sovrapposte, almeno 200 nodi, bundle con licenze. Gate umano: screenshot chiaro/scuro 1024 e 1440, ispezionati individualmente, comandi tastiera e ritorno. Non si chiamano modelli o subagenti dal banco: fixture HTTP per UI e backend reale per contratti già esistenti, dichiarando il limite.

Replay storico completo, dipendenze e messaggi fra agenti richiedono evidenze backend non offerte dalla fixture: nessun controllo finto viene consegnato; restano requisiti espliciti nella roadmap. La prova di orchestrazione reale multi-turno è un gate distinto ancora aperto, non sostituito da questo test.

Rollback: backup byte/hash dei file del lotto prima dell'edit; ripristino solo delle modifiche del lotto, preservando l'HF già consegnato e ogni file precedente. Public conserva backup integrale prima di ogni delivery; nessun riavvio necessario per soli asset. Revisione avversariale separata dello stesso autore, non indipendente.

## Emendamento 14:15 UTC — contenitore flottante
RED 63b4ce6c: a 1024 l’inspector flottante intercetta i clic del grafo (due foto fallite). Correggere apriGrafoAgenti in app.js riusando closePanels; spostare focus sul comando centrale. Conservare apertura dettaglio sul pannello. Nessun nuovo protocollo. Ricerca primaria: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ (chiusura della superficie modale prima del ritorno al contenuto), adattare il controller già presente, nessuna dipendenza. Il test FOTO rimane invariato e deve diventare verde.

Il percorso inverso nodo → dettaglio deve richiamare openPanel(inspector): apriConversazioneFiglia monta il dettaglio ma non apre il pannello flottante. Stesso callback apriGrafoAgenti/onApri, stessi test FOTO senza forzare clic.

## Revisione avversariale separata — stesso autore, non indipendente
Controllati identità/relazioni backend, textContent, hash dipendenze, stato sconosciuto esplicito, reset sessione, risposte tardive, errore lettura e conservazione filtri. Trovati e corretti contaminazione fra sessioni e pannello flottante che intercettava il grafo. Ultimo GREEN b8d400c5: 9/9 scenari; otto immagini grafo/dettaglio 1024 e 1440 chiaro/scuro ispezionate singolarmente. Nessun overflow evidente; a 1024 il dettaglio è volutamente modale e il grafo sottostante oscurato. Limiti aperti: esecuzione orchestrata reale, prestazioni oltre il campione di 200 nodi, parità integrale PR33 e feed sinistro PR32. Non è una certificazione di rilascio.

## Estensione autorizzata: grafo operativo, 19/09 14:45 UTC
Il mandato più recente autorizza due agenti Sol xhigh per implementazione di lotti distinti; root integra e revisiona. Nessun commit/push. Ownership root in questo passaggio: `harness-ui/frontend/src/components/grafo-agenti.js`, `harness-ui/frontend/src/styles/grafo-agenti.css`, `harness-ui/frontend/tests/unit/grafo-agenti.test.mjs`, `harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs`. App.js sarà ripreso solo alla consegna del lotto HF; integrazione eventi nominativa nel seguito.
Ricerca primaria attuale: WHATWG HTML SSE https://html.spec.whatwg.org/multipage/server-sent-events.html ; MDN reduced motion https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion ; W3C https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html ; Hermes https://hermes-agent.nousresearch.com/docs/guides/delegation-patterns ; Claude Code https://code.claude.com/docs/en/agent-teams e https://code.claude.com/docs/en/sub-agents ; Paperclip https://docs.paperclip.ing/guides/day-to-day/dashboard/ e https://docs.paperclip.ing/guides/org/agents/ . Consultate il 19/09/2026.
Decisione: adattare segnali di lavoro/attesa/errore, attività recente e drill-down osservati nei prodotti ai dati TALOS; mantenere renderer HTML/SVG e Dagre 3.1.1/graphlib 4.0.5 già fissati. Non importare runtime concorrenti per disegnare telemetria. Usare animazioni native CSS solo per operazioni realmente attive e transizioni di posizione; disattivare con reduced-motion e snapshot obsoleto. Nessun progresso percentuale stimato da chiamate e nessun costo monetario senza fonte.
Simboli nuovi `telemetriaGrafoAgenti`, `attivitaNodoGrafo`; modificati `stato`, `modelloGrafoAgenti`, `layoutGrafoAgenti`, `montaGrafoAgenti/ridisegna`: contatori sullo scope dichiarato, durata con fine verificata, chiamate/file con copertura esplicita, ultimi eventi reali cliccabili, nodi/archi stabili e attrezzatura corrente. Contratti esistenti callback, persistenza filtri, tasti, collapse/pan/zoom restano.
RED nominativi RIPRESA-GRAFO-TELEMETRIA, RIPRESA-GRAFO-ATTESA, RIPRESA-GRAFO-MOVIMENTO: export assente/stato attesa ignorato/nessun tracking animato. GREEN node --test tests/unit/grafo-agenti.test.mjs; browser po30-dettaglio-agente; regressione colonna-destra-p0 e unit completa dopo integrazione. Browser single runner dopo HF. Prova visibile: screenshot chiaro/scuro1024/1440, pixel di arco prima/durante, stato running e geometriche, hit test nodi, cambio dati senza perdere focus/zoom. Costi/tokens assenti restano dichiarati non disponibili. Rollback byte nel backup nominativo prodotto da questo passaggio (manifest.json). Revisione finale root separata dal proprio passaggio di implementazione, non indipendente per questi file.

### Collegamento eventi dopo consegna HF
File esatto aggiuntivo già censito: harness-ui/frontend/src/legacy/app.js. Ownership restituita dall’agente HF alle 14:46. Simboli `handleRealEvent`, `datiGrafoAgenti`, `collegaEventiSessione`, `nuovaGenerazioneSessione`, nuovo `agentiInDiretta`/`applicaEventoAgenti`. Il payload CUSTOM talos.agenti è un’invalidazione/snapshot effimero sul flusso della sessione: version1, sessionId destinatario, parentId effettivo, childId, agent. Conservarne le relazioni, rifiutare destinatario diverso e generazione vecchia; aggiornare subito lista/grafo/dettaglio senza fetch per ogni token. Snapshot HTTP su riconnessione e fallback esistente. RED RIPRESA-AGENTI-EVENTO prima della modifica al collegamento; regressione anche eventi di sessione estranea e nipoti. Una conclusione del padre non deve interrompere la ricezione dei figli. Aggiornare stato parent dal ciclo reale della sessione, non da catalogo vecchio. Riutilizzare queue refresh sinistra già coalescente.

Telemetria consumo: stesso elenco file; `attivitaNodoGrafo`/`telemetriaGrafoAgenti` leggono esclusivamente usageSessione.prompt_tokens + completion_tokens entrambi validi. Contatore aggregato con copertura separata; nessun prezzo stimato. Fonte contratto locale consumo-sessione.js e Paperclip costs già consultata. RED RIPRESA-GRAFO-CONSUMO fallisce undefined vs180; GREEN dopo aggiunta, campo costo resta null esplicito.

Ulteriore controllo collegamento parent: `datiGrafoAgenti` legge toolCallNomi ed eventiAttrezzi già deduplicati della madre; chiamate reali, file sconosciuti restano null. `handleRealEvent` programma refresh grafico su ToolCallStart/Result, StateDelta, Approval e terminali dopo il relativo aggiornamento di stato. Test RIPRESA-GRAFO-MADRE verifica operazione in corso e completamento senza figli/eventi finti.

Unit c6fad41f:1424pass,1fail file icone-ripiego prima di registrare13test. Causa riprodotta: editor Python Windows aveva trasformato app.js in CRLF; .gitattributes prescriveLF, estrattoretest usa delimitatoriLF. Normalizzati solo5file root di questo lotto secondo contratto; nessuntest indebolito, nessun comportamento prodotto cambiato.

Revisione critica: `stato` usava regex su narrativa esitoDelega; «Nessun errore nei test» produceva rosso. Scenario RIPRESA-GRAFO-ESITO: usare enum esatti ultimoEsito/esitoDelega e motivoChiusura fermata prima dello stato finale. Stessi file root già censiti, ricerca stati operativi Paperclip/contratto locale registro, nessuna nuova dipendenza.

### Provenienza dei risultati asincroni
File esatti aggiuntivi: `harness-ui/frontend/src/components/coda-messaggi.js`, `harness-ui/frontend/tests/unit/coda-messaggi.test.mjs`. Modificare normalizzaStatoCoda preservando origine/childId solo quando dichiarati; descriviCoda antepone provenienza. Nuovo descriviRisultatoDelega valida schema talos.subagent-result.v1 del JSON di notifica emesso dal registry, mai esegue contenuti. App.js `QueuedMessageDelivered` disegna una nota «Risultato del sotto-agente» e non un messaggio TU, nessuna falsa attesa risposta a padre già fermo. RED RIPRESA-CODA-ORIGINE (campi persi) e RIPRESA-CODA-RISULTATO (export assente); regressioni coda e grafo browser. Ricerca: Hermes risultati background e WHATWG/SSE già nel dossier; adapter di presentazione sul contratto interno, nessuna dipendenza.

### Integrazione operazione corrente (review coordinatore)
File esatti: `harness-ui/frontend/src/components/grafo-agenti.js` (`attivitaNodoGrafo`), `harness-ui/frontend/tests/unit/grafo-agenti.test.mjs`, `harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs`. Il backend consegna `operazioneCorrente` tipizzata: adattare solo kind/status noti con etichette locali, senza fidarsi di label esterne. RED `RIPRESA-GRAFO-OPERAZIONE`: reasoning/response restano invisibili. GREEN node --test tests/unit/grafo-agenti.test.mjs; browser po30. Contratto legacy attrezzoCorrente preservato; no nuova dipendenza; fonti e pin del lotto invariati. Rollback: annullare il solo adattamento e relativo test. Correggere selettore prova provenienza al vero `[data-turno=utente]`, non classe inesistente.

### RIPRESA-GRAFO-RICONNESSIONE — difetto P1 emerso in review
File esatti: `harness-ui/frontend/src/legacy/app.js` (`caricaFigliSessione`, `source.onopen`), `harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs`. Snapshot effimeri di nipoti potevano prevalere per sempre sui dati HTTP. RED: nipote terminata durante disconnessione rimane active dopo onopen. Correzione: rilettura elenco a riconnessione, riconciliazione children dei genitori discendenti conosciuti, cancellazione solo delle cache sostituite da snapshot riusciti; guardia generazione/lettura preservata. Contratto talos.agenti v1 invariato; WHATWG SSE già consultata impone ricostruzione stato per messaggi effimeri. GREEN browser po30, unit frontend; rollback solo questo diff prima di consegna.

### Richiesta owner: indicatori di stato animati e migliore gerarchia
File esatti: `harness-ui/frontend/src/components/grafo-agenti.js` (`montaGrafoAgenti`, `layoutGrafoAgenti`, `ridisegna`), `harness-ui/frontend/src/styles/grafo-agenti.css`, `harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs`. RED permanente `RIPRESA-GRAFO-INDICATORI`: pallini stato assenti; verificare running→done→error, colore distinto, testo, animazione reale e reduced-motion. GREEN browser po30 completo, unit grafico, screenshot 1024/1440 chiaro/scuro e confronto live con PR33.
Ricerca 19/09: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html (colore accompagnato da testo), https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion (disattivare movimento non necessario). Adottare CSS nativo, mantenere Dagre 3.1.1/graphlib4.0.5, nessuna nuova dipendenza.
Piano visivo: palette Calm esistente background #1e1f20, panel #242628, text #f1f0ec, ambra #c89541; indicatori verde/rosso dai token success/danger. Instrument Sans per testo, JetBrains Mono solo valori richiesti. Testata compatta con quattro stati cliccabili, misure secondarie in linea senza seconda carta a larghezza intera. Nodo con riga stato+durata, compito 2 righe, modello, operazione corrente, tre misure separate, collasso nel piede. Pallino ambra pulsa mentre active, done appare con transizione singola, error segnala transizione; niente pulsazione perpetua di successi storici. Movimento sospeso se snapshot non aggiornato. Rollback solo diff di questa sezione, backup originale mockup invariato.
Revisione brief: mantenere nero Calm (esplicito owner), evitare grandi KPI decorativi; ogni numero resta reale e copertura dichiarata. Le tre misure del nodo usano etichette separate per leggibilità. Questa revisione root non è indipendente.

### Rettifica dal confronto diretto del mockup (richiamo owner)
Il piano visivo precedente viene corretto: la carta mantiene l'ordine originale PR33 **titolo+pallino / ruolo-modello / badge stato+durata / operazione+collasso**; misure aggiunte in una riga compatta. Screenshot originale letto: `grafo-live-2026-09-19T15-20-13-640Z-36a260c9/mockup-1440x900-dark.png`.
Inventario: ambito/ricerca/stato, adatta/zoom/segui/isola/chiudi presenti; pallino e badge da portare; minimappa assente da portare con navigazione reale; Affianca file assente da collegare alla lettura file API esistente; timeline demo da sostituire con cronologia degli snapshot REALI osservati dalla apertura (limite dichiarato), senza fingere replay storico. Collegamenti dipendenza/messaggio del mockup restano requisito runtime Fase D: nessun arco inventato.
Estensione file esatti: stessi tre file UI sopra, più `harness-ui/frontend/src/legacy/app.js` (`apriGrafoAgenti`, callback `onLeggiFile` verso GET tree/file). `montaGrafoAgenti` aggiunge callback opzionale; nessun cambiamento API backend. RED `RIPRESA-GRAFO-MOCKUP`: minimappa, affiancamento file API e cursore degli stati osservati assenti. GREEN browser po30; ricerca SVG DOM e range HTML nativi da MDN, nessuna dipendenza; pin invariati. Preview solo textContent; file non fidati non renderizzati HTML; stato di loading/errore e risposta obsoleta scartata; snapshot osservati max120 con deduplica, cancellati alla chiusura. Rollback: solo diff lotto frontend; nessuna mutazione owner.

Review stati padre: `datiGrafoAgenti` usava ultimoEsito del catalogo a 15 secondi, quindi RunError poteva mostrare temporaneamente concluso. Stessi file app.js e po30: RED `RIPRESA-GRAFO-MADRE-ERRORE`, proiezione tipizzata del lifecycle dopo dedup e azzerata al cambio sessione; stop distinto, nessun testo di errore copiato. GREEN browser po30 e unit.

### Provenienza nella consegna manuale (contratto revisionato)
Stessi file app.js e po30. Simboli `mostraRisultatoDelega`, `handleRealEvent`, `nuovaGenerazioneSessione`: centralizzare nota e dedup per codaId. `RunStarted.input` e `RunRedirectApplied` portano origine/childId/codaId per invio manuale; `QueuedMessageDelivered` resta automatico. RED `RIPRESA-AGENTI-CODA-MANUALE` prova che resume/redirect non attribuiscono il risultato a TU né lo mostrano due volte. GREEN browser po30+coda, frontend unit. Metadati sono server-origin e il risultato resta testo non fidato; stessa ricerca/pin della coda.

### RIPRESA-GRAFO-ARCHI-SEMANTICI — revisione visiva finale
File esatti: `harness-ui/frontend/src/styles/grafo-agenti.css` (selettore `[data-attivo]`, keyframes `talos-grafo-flusso`); `harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs` (scenario MOVIMENTO). Il tratteggio resta riservato a `data-arco=ramo`, anche durante attività. RED: delega attiva ha stroke-dasharray diverso da none. GREEN: MOVIMENTO misura animazione pixel reale, semantica e reduced-motion. Ricerca primaria già consultata: SVG/MDN e WCAG Use of Color nel dossier sopra. Decisione: primitive SVG/CSS native, nessuna dipendenza nuova; pin Dagre 3.1.1 invariato. Rollback: ripristino mirato delle due regole CSS; mockup originale intatto. Prova visibile: confronto finale mockup/4174.

### Revisione avversariale root e prove aggiornate, 19/09 ore 17:45
Revisione separata dall'implementazione, non indipendente per il frontend scritto da root. Backend consegnato da agent_runtime e riletto da root: corrette perdita del risultato dopo crash, duplicazione/provenienza nelle consegne manuali, rilettura dei nipoti dopo riconnessione, scansione superflua delle sorelle, resurrezione di risultati già compattati. La ricostruzione considera soltanto eventi successivi al checkpoint/finale autorevole.
- `2026-09-19T15-35-56-200Z-browser-30bbe588`: RED resume/redirect manuali (2 fallimenti pertinenti).
- `2026-09-19T15-40-26-813Z-browser-143f05ce`: GREEN 70/70 (grafo, coda condivisa, attese, reindirizzamento; entrambi i casi manuali).
- `2026-09-19T15-27-38-924Z-browser-0c28d1b2`: 160 pass, 1 skip; Model Lab completo selezionato, grafo e colonna destra. Lo skip non costituisce prova.
- `2026-09-19T15-43-41-853Z-browser-8c29f023`: RED semantica arco delega attivo (5px,5px anziché none). Animazione corretta con opacità, preservando stile topologico.
- Ispezionati screenshot fixture 1024 scuro e 1440 chiaro di 143f05ce: nodi/controlli contenuti, minimappa leggibile anche in chiaro; il toast temporaneo di riconnessione va lasciato esaurire nelle foto finali.
Gate ancora da eseguire: suite backend completa finale, unit/build finale, consegna verificata, confronto screenshot 4174 contro originali immutati. Nessuna prova provider reale multi-turn o Electron dichiarata.

### Riconciliazione puntuale UI originale PR33 (richiamo owner)
Fonte immutata: `ripresa-2026-09-19/mockup-pr33-original.html`, funzioni `graphView` e rendering nodi. Non si assume che un'estensione sostituisca i requisiti originali.

| Elemento mockup | Collocazione nel prodotto / prova / residuo |
|---|---|
| Titolo nodo, ruolo/modello, punto stato, badge, durata, operazione, collasso | Renderer `GrafoAgenti`, test INDICATORI/MOVIMENTO; dati mancanti esplicitati |
| Ambito Sessione/Workspace | Sessione corrente / Cartella corrente, filtri reali |
| Ambito Esecuzione | Residuo G5: serve identità del singolo run nella topologia persistente; non attestato dal solo sessionId |
| Ricerca, stato, azzeramento | FILTRI; conservazione durante aggiornamento |
| Adatta, zoom, trascinamento, segui attivo, isolamento | INGRESSI/FILTRI/MOVIMENTO e test unit; controlli tastiera |
| Affianca file | MOCKUP; file reali dell'agente con errori/letture tardive gestiti, titolo chiarisce contenuto attuale |
| Minimappa | MOCKUP; posizioni reali, viewport, ricentratura e tastiera |
| Timeline, Evento + | MOCKUP; cronologia realmente osservata dall'apertura, massimo 120 stati, torna in diretta. Replay persistente prima dell'apertura resta G5 |
| Delega / dipendenza / messaggio | Delega e fork derivati da relazioni reali; dipendenze e messaggi interagente restano G5/D-MSG-01 fino a disponibilità di eventi canonici. Non inventati a partire dal testo |
| Statistiche e tracking aggiuntivi richiesti owner | Conteggi di stati/strumenti/file/token con copertura, operazione e attività recente; nessun costo o progresso percentuale inventato |

Le righe residue sono requisiti aperti, non eccezioni di parità approvate. Il mockup demo non prova il runtime.

### RIPRESA-GRAFO-TITOLO-SENZA-TOOLTIP — richiesta owner successiva
File esatti: `harness-ui/frontend/src/components/grafo-agenti.js`, funzione `montaGrafoAgenti`/aggiornamento `ui.apri`; `harness-ui/frontend/tests/browser/po30-dettaglio-agente.spec.mjs`, scenario INGRESSI. Contratti: titolo visibile troncato e pulsante per dettaglio invariati, aria-label preservata; rimuovere soltanto title HTML che genera tooltip kilometrico. RED: title presente sul pulsante titolo e/o antenati. GREEN: INGRESSI apre ancora dettaglio, nuova asserzione no tooltip, build/unit frontend; consegna asset4174 senza riavvio e nuova coppia screenshot. Ricerca primaria MDN global attribute title: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/title (consultata ora), nativo e nessuna dipendenza; upstream renderer Dagre3.1.1 invariato. Rollback: ripristino mirato assegnazione title. Owner autorizza direttamente rimozione, nessuna conferma richiesta.

La prima asserzione solo-title non riproduce il difetto: `tooltip.js` migra automaticamente title in `data-tip` su hover e mostra `#talosTip` dopo350ms. Prova rafforzata PRIMA della modifica: assenza testo in entrambi gli attributi e popup nascosto dopo450ms. Nessuna modifica al gestore globale dei tooltip; il testo va eliminato alla fonte, solo titolo nodo.


### Verifica finale — tooltip titoli grafo, 19/09/2026 16:04 UTC

- Scenario permanente `RIPRESA-GRAFO-TITOLO-SENZA-TOOLTIP`: RED effettivo `2026-09-19T16-01-49-059Z-browser-3256ae7a`, GREEN `2026-09-19T16-02-34-320Z-browser-32b27909` (1/1, build riuscita), unit grafo 10/10. Il primo controllo sul solo attributo title non era sufficiente: il tooltip condiviso migra il contenuto in data-tip; la regressione verifica entrambi e la mancata apertura di talosTip dopo hover.
- Il titolo conserva aria-label e apertura del dettaglio. Rimossi title e data-tip dal titolo del nodo.
- Asset aggiornati senza riavvio: `delivery-2026-09-19T16-03-43-375Z-2f796b1c`; snapshot di 207 sorgenti verificato, 14 asset HTTP corrispondenti, health 200, backup conservato.
- Confronto finale: `.claude/ripresa-2026-09-19/grafo-live-2026-09-19T16-03-44-709Z-4031299e/confronto.html` e `report.json`. Sei screenshot ispezionati individualmente, mockup e 4174 a 1024x800, 1440x900 e 2560x1440. Zero errori, overflow, richieste mutanti o WebSocket; mockup invariato. Hover verificato prima degli screenshot del prodotto. Contenuti differenti: fixture nel mockup, sessione reale nel prodotto; nessuna dichiarazione di parità completa.
- Il backend aggiornato resta da attivare: il controllo automatico ha rifiutato la creazione dello script di riavvio controllato con il messaggio generico blocked by policy. Nessun riavvio eseguito, nessun aggiramento. Le nuove funzioni backend non sono dichiarate operative sulla 4174.
