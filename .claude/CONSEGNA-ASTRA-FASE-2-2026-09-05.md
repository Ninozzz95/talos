# Consegna Astra — fase 2, 05/09/2026

## B3 · Board

La Board usa le **73 sessioni reali** dello store copiato. Apri [la app locale](http://127.0.0.1:4177) e premi **Board**.

- Filtri di stato, cartella e quattro ordinamenti funzionanti.
- Click o Invio sulla riga apre la chat. Il tasto destro conserva il menu della sessione.
- Cache in percentuale e token, motivi di chiusura reali. I valori mancanti restano dichiarati; il costo attende la fase 3.
- Tabella scorrevole con intestazioni ferme. Errori e recupero visibili in alto.

**Prove:** 6/6 unità Board, 12/12 percorsi reali, 27/27 componenti più 3/3 Board dopo l'ultimo batch, 195/195 parità statica, build deterministica di 30 asset. Aperte e confrontate 21 immagini a 1440/1280/1024, elencate nel [ledger](LEDGER-ASTRA-FASE-2-2026-09-05.md).

**Limite aperto:** verify si ferma su PHASE3-TOKEN-CONTRACT-01: il CSS generato contiene i colori del mockup anche nella base 81cc5cc5. 323/324 test passano. Non ho aggirato il controllo né toccato il CSS condiviso fuori dal componente. B3 è consegnata per revisione; il cancello generale non è dichiarato verde.

I test del modello in chat e l'OAuth non sono stati eseguiti: il runtime del modello non è configurato in questa istanza di confronto. I test in chat futuri useranno il linguaggio naturale concordato.

**Cosa deve fare l'owner:** provare la Board su 4177 e rivedere la consegna.
**Cosa fai tu dopo:** B5, a partire da Memoria.
**Cosa rimane:** B5 → B4 → B6 → B2 → B7 → B1 → B8, contratto CSS, poi OAuth e piano computer-use.

## B5.1 — Memoria pronta per review · 05/09/2026

La pagina Memoria usa GET /api/v1/sessions/:id/memory e le righe del mockup. Nello store di confronto non ci sono ricordi: 4177 e 4179 mostrano entrambi il vuoto. Ricerca su titolo e contenuto completo, quattro generi veri, Leggi/Chiudi da tastiera, data di aggiornamento quando presente, errore/ricarico e risposta obsoleta verificati. Correggi resta hidden data-richiede=fase3: nessuna rotta di scrittura inventata.

| Aspetto | Originale desktop | Componente | Evidenza/verdetto |
|---|---|---|---|
| Dati e scope | lista globale nel foglio capability | stessa API e stesso vuoto, genere conservato con nome italiano | app-vuota/originale-vuota a 1440/1280/1024; parità dei dati vuoti |
| Testo | anteprima a 80 caratteri | anteprima + contenuto intero espandibile e data disponibile | MEMORIA-FIXTURE, testo oltre 80 caratteri trovato e letto; beneficio provato con fixture |
| Accesso | aprire il foglio e scorrere alla memoria | voce Memoria, lista dedicata | screenshot aperti; nessuna modifica della sidebar |
| Stato | messaggio nel mount | caricamento, errore distinto da zero, Aggiorna e guardia sulle risposte obsolete | RED numero falso riprodotto e risolto; MEMORIA-RECUPERO 3 viewport |
| Tastiera e forma | righe passive | tab con frecce/Home/End; Enter/Spazio Leggi/Chiudi; focus visibile | parità struttura/parole/pixel e screenshot lettura aperti |
| Responsive | foglio originale con scorrimento | testo espanso va a capo; a 1024 Aggiorna si dispone sotto i filtri ed è raggiungibile | 21 immagini aperte, nessun taglio del contenuto espanso |
| Persistenza | deposito globale sul disco | sola lettura, ricarico rilegge il deposito | niente richieste di scrittura nella prova; filtri temporanei, non impostazioni persistenti |

Blocchi riusati: MemoryRow, MemoryList, FilterChips, Field, Button, Badge, PageHeader, WhereOnDisk e sprite esistente. Blocchi nuovi 0, token nuovi 0; una sola regola CSS scoped alla riga espansa, definita nel mockup e rigenerata. Il codice mobile MemoryScreen.vue conferma ricerca su titolo/contenuto e quattro generi; i suoi scope/CRUD/stato non sono disponibili nell’endpoint desktop e non vengono simulati.

Cancellli: unità Memoria 3/3; componenti completi 30/30, MemoryRow ripetuto dopo il fix 3/3; live Board+Memoria 21/21, Memoria ripetuta dopo il fix 9/9; statico 195/195; build 30 asset e determinismo verde. verify rimane ROSSO per il solo PHASE3-TOKEN-CONTRACT-01 preesistente (326/327 unità/contratti): index.css generato contiene colori già nella base 81cc5cc5; nessun bypass del test. Ultimo fix cambia solo la testata in caricamento/errore, non il mockup statico. Tutti i 21 PNG del manifesto sono stati aperti; i tre errori sono stati riaperti dopo il fix. Dati fixture separati dai risultati reali.

Richieste a Claude: allineare contratto CSS e generazione canonica; collegamento Note assente (decisione C2, NavItem data-conteggio=note senza data-vaia, nessuno schermoNote nel mockup e nessuna mappa nel ponte). Per §9 non invento una rotta o una pagina e non tocco sidebar/ponte. rigaNota resta da estrarre quando il contenitore è definito. C22/C23 richiedono API per strati, ultima lettura e modifica; non certificati da questa pagina.

Non verificato: lettura di memorie realmente scritte da un modello, chat multi-turn, screen reader su dispositivo, volumi superiori alle quattro fixture, CRUD e uso effettivo nel prompt. TALOS_OWNER_RUNTIME_MODULE assente: nessuna prova modello dichiarata.

**Cosa deve fare l’owner:** aprire http://127.0.0.1:4177 → Memoria e valutare gli screenshot.
**Cosa fai tu dopo:** TaskRow/Attività, prossimo componente B5.
**Cosa rimane:** Note e altre pagine B5, B4 → B6 → B2 → B7 → B1 → B8; debito CSS/rotte fase 3; OAuth e piano computer-use.

## B5.2 · Consegna TaskRow / Attività — 05/09/2026

**Cosa mostra.** Dati GET /api/v1/sessions/:id/tasks: titolo, descrizione integrale, priorità, stato todo/doing/done, aggiornamento. Autore non registrato perché il contratto non lo contiene. Conteggi derivati, filtri per stato e ricerca su titolo/descrizione/priorità/stato. Leggi/Chiudi espande senza cambiare il dato. Stato vuoto globale, caricamento, errore distinguibili; Aggiorna riprova. Risposte obsolete scartate dopo cambio pagina o sessione. Vecchio foglio mantenuto sullo stesso componente.

**Blocchi riusati.** TasksScreen, Topbar, Page, Toolbar, FilterChips, TaskList, TaskRow, campi, badge e pulsanti canonici. Blocchi nuovi: 0. Token aggiunti: 0. Icone aggiunte: 0. Nel CSS canonico solo due regole circoscritte alla lettura espansa: testo a capo e opacità piena dell’attività conclusa. Template e CSS rigenerati. Nessuna nuova dipendenza né chiave di persistenza.

| Aspetto | Originale osservato | Risultato / beneficio verificato | Limite / verdetto |
|---|---|---|---|
| Copertura | Capability → elenco globale con titolo, descrizione, priorità e stato | Stessi campi dell’API, descrizione completa disponibile, data aggiornata in lettura | Creazione/modifica non erano rotte del pannello originale; restano fase 3 |
| Semantica | todo/doing/done e priorità raw | Da fare/In corso/Fatta; fallback espliciti per valori ignoti | Nessun autore, giro o commit inventato |
| Chiarezza/densità | Sezione bassa del foglio Capability, scorrimento necessario | Pagina propria, quattro righe compatte, testo integrale con Leggi | Non sono i figli delegati; rigaFiglio resta per B2/B7 |
| Passi | Aprire Capability e scorrere | Un clic su Attività; ricerca e filtri sul posto | Leggi richiede un clic per il dettaglio esteso, il sommario resta immediato |
| Tastiera | Righe passive | Tab, Home/End e frecce sui filtri; Enter/Spazio su Leggi/Chiudi | Azioni di modifica nascoste, nessun checkbox finto |
| Dimensioni | Originale e proposta aperti alle tre larghezze | 1440/1280/1024: comandi e testo leggibili, campo alto 36 px | Verifica desktop, nessuna certificazione mobile |
| Stato/recupero | Errore nel foglio; riapertura per rileggere | Errore visibile anche nella testata, pulsante Aggiorna; dato invalido non diventa zero | Fixture 503 e risposta ritardata distinte dal backend reale |
| Persistenza/latenza | Dati globali su disco, GET su apertura | Reload rilegge la stessa API; ricerca locale senza scritture o chiamate modello | Filtri temporanei; nessun benchmark prestazionale su grandi volumi |

**Cosa ho guardato.** Originale 4179 e nuova app 4177; 21 PNG aperti, elencati nel piano B5.2, sotto .claude/immagini/astra-fase2/TaskRow: mockup e componente scuri, app vuota/lettura/filtro vuoto/errore e originale vuoto chiari; tre larghezze. Aperta anche la pagina reale scura nel browser dell’app. Corretto il campo ricerca inizialmente senza classi del mockup: scenario permanente ATTIVITA-CAMPO-COERENTE, RED 27 px → GREEN 36 px. Corretta l’icona Da fare e l’opacità della lettura delle attività concluse.

**Prove.** Unità Task 5/5; Attività dal vivo 9/9 (backend reale vuoto, fixture quattro record, tastiera, filtro sul testo oltre l’anteprima, nessuna scrittura, 503, payload [null], riprova e risposta obsoleta). Statico npx playwright test --config=playwright.lab.config.mjs: 195/195. Build deterministica: 30 file. npm run verify: **331/332**, unico fallimento preesistente PHASE3-TOKEN-CONTRACT-01 sui colori raw del CSS generato, riprodotto già su 81cc5cc5; nessun aggiramento. Log locale: C:/Users/Antonino/AppData/Local/Temp/astra-task-verify.log. Gate generale NON dichiarato verde.

**Confini.** Nessuna modifica a chat, review, sidebar, testata della chat, bridge, frammenti, backend o store. Azioni Nuova attività/Mie/Dell’agente/Segna come fatta nascoste con data-richiede="fase3". Il runtime agente non è configurato su questa istanza: sono prove UI/API, non accettazione conversazionale o esecuzione del modello. Note richiede ancora il contenitore e il canale dedicati (§9 già registrato).

**Cosa deve fare l’owner:** può provare Attività su http://127.0.0.1:4177; nessuna operazione necessaria per proseguire. **Cosa fai tu dopo:** Libreria, poi Ricerca/Officina/Automazioni (resto B5). **Cosa rimane:** Note, B4 → B6 → B2 → B7 → B1 → B8; allineamento del contratto CSS condiviso da Claude; OAuth e piano computer-use dopo le schermate.

Chiusura dei componenti: npx playwright test --config=playwright.componenti.config.mjs, porta laboratorio 4178, **33/33**. TaskRow 3/3, incluso controllo permanente del campo a 36 px.

## B5.3 · Consegna LibraryRow / Libreria — 05/09/2026

**Cosa mostra.** Nome, tipo, provenienza e aggiornamento da GET /api/v1/sessions/:id/library. Filtri Tutti/Caricati/Generati, ricerca sui metadata, Dettagli/Chiudi per nome lungo e data completa. Ambito progetto esplicito. La pagina distingue elenco vuoto, filtro senza risultati, caricamento ed errore; Aggiorna riprova. Le risposte obsolete non sostituiscono quelle nuove.

**Blocchi riusati.** LibraryScreen, Topbar, Page, Toolbar, FilterChips, LibraryList, LibraryRow, campi/pulsanti/badge. Nessun tipo di blocco nuovo, nessun token di design o dipendenza nuova. Una regola CSS canonica circoscritta al testo espanso. Un simbolo aggiunto allo stesso sprite: i-image copiato dall’originale public/index.html:47. Il tentativo con i-files è stato respinto dopo apertura degli screenshot perché mostrava una cartella; scenario permanente LIBRERIA-ICONA-IMMAGINE, RED files → GREEN image.

| Aspetto | Originale osservato | Proposta / beneficio | Limite e verdetto |
|---|---|---|---|
| Copertura | Elenco in Capability, nome/tipo/origine | Stessi file e metadata, aggiornamento reso visibile | Nessuna lettura contenuto né mutazione HTTP prevista dall’originale |
| Semantica | document/image raw, provenienza ripetuta | Documento/Immagine, Caricato/Generato; valori ignoti espliciti | Nessun costo, autore o uso in sessioni inventato |
| Clarity/densità | Sezione sotto altri quattro elenchi | Pagina raggiungibile dalla sidebar, ricerca e filtri nello stesso spazio | Un clic per nome esteso nei casi che eccedono la riga |
| Tastiera | Righe passive | Frecce/Home/End sui filtri; Enter/Spazio sui dettagli; focus visibile | Modifica/caricamento/Apri nascosti con data-richiede=fase3 |
| Responsive | Originale vuoto e popolato alle tre larghezze | 1440/1280/1024: controlli raggiungibili, nome lungo a capo in dettaglio | Verifica desktop, nessuna certificazione mobile |
| Errori/recupero | Errore nel foglio Capability | Testata e messaggio coerenti, riprova senza riaprire, payload invalido segnalato | Un errore non è convertito in archivio vuoto |
| Contesto/persistenza | Elenco metadata per progetto | Reload legge ancora lo stesso endpoint; nessuna scrittura | L’API non espone policy: elenco ≠ nel contesto. Filtri temporanei |
| Prestazioni | Caricamento dei metadata senza contenuto | Ricerca locale senza chiamate al modello o lettura implicita del file | Non misurato su volumi grandi; nessuna superiorità prestazionale dichiarata |

**Cosa ho guardato.** Tutti i 24 PNG finali sotto .claude/immagini/astra-fase2/LibraryRow, percorsi esatti nel piano: sei parità mockup/componente scuri, diciotto app/originale chiari. Originale e nuova app usano gli stessi quattro record sintetici nel confronto popolato; vuoto e reload usano il backend reale senza fixture. Nessun file dei progetti creato o modificato. Il pannello originale non consentiva apertura/aggiunta dalla propria API. Il modello mantiene i suoi strumenti e la policy backend; qui non li simulo.

**Verifiche.** Unità Libreria 5/5. Prove reali/intercettate Libreria 9/9: vuoto/reload, provenienza, nome completo, icona immagine, tastiera, nessuna scrittura, 503, payload invalido, riprova e risposta obsoleta. npm run test:lab **195/195**. Build deterministica **30 file**. npm run verify **336/337**, unico fallimento preesistente PHASE3-TOKEN-CONTRACT-01 sui colori raw del CSS generato: gate generale ancora rosso, nessun bypass. Log in C:/Users/Antonino/AppData/Local/Temp/astra-library-verify.log.

**Cosa deve fare l’owner:** può provare Libreria su http://127.0.0.1:4177; nessuna azione necessaria per proseguire. **Cosa fai tu dopo:** Ricerca, Officina e Automazioni. **Cosa rimane:** Note, resto della parte B, contratto CSS condiviso; integrazioni OAuth e piano computer-use dopo le schermate. Il runtime agente è assente: questa consegna non certifica chat o strumenti con un modello reale.

Chiusura componenti B5.3: npx playwright test --config=playwright.componenti.config.mjs, porta 4178, **36/36**. git diff --check pulito.
