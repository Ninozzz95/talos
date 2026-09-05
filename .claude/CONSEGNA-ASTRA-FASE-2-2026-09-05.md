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


## B5.4 ReportRow / Ricerca — consegna 05/09/2026
La pagina Ricerca approfondita legge il progetto della sessione reale. Titolo intero sempre leggibile, cinque stati in italiano, filtro per stato e ricerca nel titolo completo; Dettagli aggiunge l'ora di avvio. Pulsante Aggiorna, caricamento, errore esplicito, riprova; risposte obsolete escluse anche uscendo verso Board e rientrando. Il precedente foglio Capability usa lo stesso ReportRow. Nessuna rotta nuova.

| Aspetto | Originale osservato | Proposta verificata / beneficio | Regressione / verdetto |
|---|---|---|---|
| Copertura dati | Titolo, data ridotta, cinque stati grezzi, ambito progetto | Stessi quattro campi, titolo senza tagli, ora completa disponibile, stati italiani distinti | Parità preservata; nessuna fonte o valutazione aggiunta senza dati |
| Consultazione / passi | Nel lungo Capability hub, scroll fino alla ricerca; nessun filtro | Altro → Ricerca approfondita; ricerca su titolo/stato e sei filtri | Zero click per leggere il titolo; Dettagli solo per l'ora. RICERCA-TITOLO-NON-TRONCATO corretto con RED→GREEN |
| Forma / densità / responsive | Modale, testi piccoli, contenuto circondato da sezioni estranee | Stesso linguaggio del mockup, lista centrale; 1440/1280 toolbar su una riga, 1024 su due, titolo mai troncato | Foto originali e finali aperte a tre larghezze; nessuna modifica alla Topbar Chat |
| Tastiera / semantica | Elenco passivo e stati grezzi | Pulsanti nativi, lista, tabs con roving tabindex, Enter/Space, Home/End, aria-expanded | Verificato in Playwright; non dichiarata conformità completa a screen reader o WCAG |
| Limiti / qualità | Nessun totale né fonti dall'API | Numero di voci elencate e limite 20 visibili; Conclusa non significa fonti certificate | Gap backend dichiarato: report/fonti/paginazione non esposti in HTTP; controlli dipendenti hidden fase3 |
| Errori / recupero / persistenza | Messaggi nel foglio, caricatore non proteggeva completamente dal cambio sessione | Errore distinto da zero, Aggiorna, payload non valido respinto, generazione per mount e sessione | 503/[null]/retry/risposta obsoleta provati. Dati ricaricati dal backend dopo reload; filtri locali alla pagina, non preferenze persistite |
| Latenza / sicurezza | GET elenco; nessuna azione di creazione UI | Stesso GET, filtro locale senza nuove chiamate, testo via textContent | Nessun benchmark di latenza né qualità modello eseguito; nessuna mutazione API dalle interazioni provate |

Prove: unitari specifici 5/5; live Ricerca 9/9 dopo la correzione del titolo; suite componenti completa 39/39; build deterministica 30 file e git diff --check verdi. npm run verify: **341/342**, resta solo PHASE3-TOKEN-CONTRACT-01 (colori raw del CSS generato, preesistente su 81cc5cc5 come già documentato in B3). Log locale: C:/Users/Antonino/AppData/Local/Temp/astra-research-verify.log. Il cancello complessivo NON è dichiarato verde.

Evidenza visiva: 27 screenshot finali nella cartella .claude/immagini/astra-fase2/ReportRow/ (mockup, componente, app-vuota, originale-vuota, fixture-elenco, fixture-dettagli, fixture-filtro-vuoto, app-errore, originale-fixture × 1440/1280/1024), tutti aperti; più due catture iniziali 1280x720. Il confronto dark mockup/componente è identico; confronto light originale/app sugli stessi cinque record di fixture o sullo stesso vuoto reale. Contatore sidebar 0 nelle fixture intenzionale: arriva dall'API reale prima dell'intercettazione della sola lista, non è un valore prodotto nel backend. Controllo aggiuntivo manuale nel browser integrato: pagina finale dark 4177, vuoto reale. Le cinque ricerche popolate NON sono ricerche realmente eseguite.
Blocchi nuovi 0, token nuovi 0, simboli sprite nuovi 0. Una regola CSS nel mockup, limitata a ReportRow; template e CSS rigenerati. Backend/store/public/ponte e superfici Claude invariati.

Restano richieste Fase 3: lettura del rapporto e fonti; paginazione/totale; errori di filesystem che research-store oggi nasconde; nessuna simulazione di queste capacità. Il gate di chat naturale con runtime vero resta da fare nell'ambiente owner: il server di confronto non ha quel runtime. OAuth e piano computer-use restano registrati, dopo le schermate.

Cosa deve fare l'owner · Guardare Ricerca approfondita su http://127.0.0.1:4177/ (Altro) e gli screenshot popolati; il progetto locale al momento ha zero ricerche.
Cosa fai tu dopo · Officina attrezzi, poi Automazioni per completare B5, quindi l'ordine B4 → B6 → B2 → B7 → B1 → B8.
Cosa rimane · Chiusura owner, limite CSS condiviso da allineare con Claude, gap Fase 3 e parti B residue. Nessun push.

Cancello statico finale B5.4: **195/195**. Componenti **39/39**, live Ricerca **9/9**. Verify generale **341/342** per il difetto CSS preesistente dichiarato sopra.


## B5.5 Officina / ForgeList — consegna 05/09/2026
Pagina collegata al GET globale /tool-forge. Titoli e descrizioni completi, capacità in italiano, stato distinto dall'azione; rischio e data installazione riportati dal backend. Abilita/Disabilita usa il POST esistente e rilegge il risultato. Una richiesta alla volta, sessione catturata; cambi di pagina e risposte obsolete gestiti. Nessun codice JS, costo, esecuzione o ricevuta inventati.

| Aspetto | Originale osservato | Proposta / beneficio verificato | Verdetto e limiti |
|---|---|---|---|
| Copertura | Titolo, descrizione, capacità tecniche, stato, Abilita/Disabilita nel foglio lungo | Stessi dati/azioni; capacità in italiano, data completa e rischio dal contratto; stato ignoto non concede azioni | Parità dei comportamenti esposti; nessuna nuova capacità backend dichiarata |
| Ricerca / passi | Scroll nel Capability hub, azione diretta per riga | Accesso Altro → Officina; filtro per stato, ricerca anche per identificatore tecnico; selezione e comando nel dettaglio | Per una voce non selezionata serve selezione + azione. Il foglio conserva l'azione diretta per riga; non dichiarato guadagno di click per ogni uso |
| Forma / densità | Testi piccoli nella modale originale, sezioni estranee attorno | Stesso mockup, descrizioni e titoli senza tagli, capacità sempre visibili | 1440/1280 dettaglio a lato; 1024 sotto e pagina scorre. Azione raggiunta e provata anche sotto la piega |
| Tastiera / semantica | Pulsanti di azione nativi | Tabs e listbox, frecce/Home/End; selezione non invia richieste; azione separata dalle opzioni | Verificato, nessuna attestazione completa WCAG/screen reader |
| Stato / recupero | Fallimento con toast; riga ricaricata dopo successo | Errore di lista distinto da vuoto, Aggiorna; errore di salvataggio nomina la voce e mantiene stato; riprova reale | 503, payload [null], POST fallito, cambio selezione, uscita/rientro in volo, risposta obsoleta provati |
| Persistenza / sicurezza | Enable booleano globale nello store | Stesso endpoint: nuovo stato solo dopo POST+GET, poi reload; nessun doppio POST mentre occupato | Prova reale HTTP → registry → store temporaneo. Fixture dichiarate, nessun flow/modello eseguito; dati owner invariati |
| Prestazioni / limiti | Nessuna API definizione né storico | Stesso GET, ricerca locale; CodeBlock nascosto fase3, limite della definizione visibile | Non misurata latenza/superiorità esecutiva; errori filesystem nascosti dallo store restano gap backend |

Regressioni permanenti corrette con RED→GREEN: OFFICINA-SELEZIONE-DOPO-SALVATAGGIO e OFFICINA-SALVATAGGIO-ID, coperte rispettivamente da OFFICINA-PERSISTENZA e OFFICINA-RECUPERO. Live 9/9, ulteriore recupero con navigazione in volo 3/3; unitari specifici 4/4; suite componenti completa 42/42; build deterministica 30 file, diff --check verde. Verify: **345/346**, unico rosso preesistente PHASE3-TOKEN-CONTRACT-01 del CSS condiviso (stesso di B3, non aggirato). Log C:/Users/Antonino/AppData/Local/Temp/astra-forge-verify.log.

Visivo: 27 PNG finali a 1440/1280/1024 e due iniziali in .claude/immagini/astra-fase2/ForgeList/, tutti aperti. Mockup/componente identici in dark; app/originale confrontate in light con vuoto reale e stessi tre record nello store isolato. Ulteriore ispezione manuale in browser integrato, pagina dark reale 4177. Le tre voci popolate sono fixture validate, non attrezzi creati da un modello owner. Conteggio sidebar zero nella prova popolata: lista inoltrata al server isolato, contatore separato resta quello del server 4177.
Blocchi riusati ForgeScreen, Topbar di pagina, Page, Toolbar, FilterChips, ForgeList, DetailPanel, CodeBlock nascosto; blocchi/token/simboli nuovi **0/0/0**. Due regole CSS per testi lunghi nel mockup; template/CSS rigenerati. Backend, public, ponte, frammenti e superfici Claude non modificati.

Cosa deve fare l'owner · Provare Altro → Officina attrezzi su http://127.0.0.1:4177/; l'ambiente locale ha zero attrezzi, i casi popolati sono negli screenshot.
Cosa fai tu dopo · Automazioni per chiudere B5, poi B4 → B6 → B2 → B7 → B1 → B8.
Cosa rimane · Gate di chat naturale con runtime owner; limite CSS condiviso e richieste Fase 3; OAuth e piano computer-use dopo le schermate. Nessun push.

Chiusura B5.5: test:lab 195/195. La suite componenti 42/42 è partita per omissione della variabile sulla porta di default 4176; processo terminato, controllo mirato ripetuto esplicitamente su 4178: ForgeList 3/3. Nessun uso della 4174. Porte dei due server di confronto sempre 4177/4179.

## B5.6 — Automazioni, renderer pronto per review

Elenco reale, ricerca, filtri, dettagli, pausa/attivazione ed eliminazione persistenti. Nuova automazione crea davvero un record in pausa; il suo aspetto legacy resta da convertire in B7 (difetto registrato e screenshot aperto). Non dichiaro chiuso il flusso visivo completo prima di questa correzione.

Prove: 5/5 unità, 15/15 percorsi reali isolati, 45/45 componenti. Statico 194/195 alla prima corsa +1/1 caso ripetuto per errore filesystem nella scrittura della PNG Toast; verify 350/351, unico errore CSS condiviso preesistente. Build 30 asset e diff pulito. Tutte le 36 immagini aperte in immagini/astra-fase2/AutomationRow/, confronto originale/proposta dettagliato nel ledger. Nessuno scheduler o modello eseguito.

Cosa deve fare l'owner · Nessuna azione; prova facoltativa Altro → Automazioni, 4177.
Cosa fai tu dopo · Capability.
Cosa rimane · B4 → B6 → B2 → B7 → B1 → B8, Browser, CSS condiviso, poi OAuth e piano computer-use.

## Raccordo con la rimozione upstream dello strato parallelo

Raccordo verificato: npm run verify interamente verde (build, contratti/unità, determinismo 30 file, laboratorio 195/195); parità ForgeList 3/3. La rimozione del vecchio test CSS arriva dal commit upstream che elimina lo strato parallelo, non da un aggiramento locale. Corretto un import dopo la rilocazione del dizionario e uno spazio finale; nessun cambiamento visivo.
Cosa deve fare l'owner · Nulla.
Cosa fai tu dopo · Capability.
Cosa rimane · B4, B6, B2, B7, B1, B8 e Browser; poi OAuth e piano computer-use.

Rettifica del controllo precedente: uno spazio finale in automazioni.js era stato segnalato dal controllo cached senza testo visibile. Corretto in questo commit.

## R-02 recepita
Board, Memoria, Attività, Libreria, Ricerca, Officina e gli undici mockup citati sono accettati e uniti dall'orchestratore. Automazioni consegnata d5dfbb76; il suo modulo di creazione resta nel lavoro B7. Correzione degli output di test in verifica: artifacts ignorata, copia delle prove solo alla consegna. Import nomi-attrezzi già riallineato e verify verde nel raccordo9f12edd.
OAuth e computer-use sono PROPOSTE nel ledger, non implementazioni in coda. Nessun costo stimato senza misura. Cutover e sblocco del contratto restano all'orchestratore.
Cosa deve fare l'owner · Nulla per proseguire.
Cosa fai tu dopo · Chiudere la verifica R-02 e completare Capability.
Cosa rimane · B4→B6→B2→B7→B1→B8→Browser K-I.

R-02 verificata: regressione RED→GREEN1/1; statico195/195 a1440/1280/1024. SHA256 prima/dopo:472 PNG identiche, zero nuovi file nella cartella consegne. Output di esecuzione presenti in artifacts/astra-mockup; nessuna modifica UI né screenshot da promuovere in questa correzione. Diff --check verde. Restano fuori staging le PNG già sporche prima della correzione: non riscrivo prove approvate né modifiche altrui.
Cosa deve fare l'owner · Nulla.
Cosa fai tu dopo · Capability.
Cosa rimane · B4→B6→B2→B7→B1→B8→Browser K-I. OAuth e computer-use solo PROPOSTE.

## B4.1 consegna ToolList + DetailPanel — 05/09/2026
Componente innestato sul catalogo HTTP e sul salvataggio impostazioni esistente. Ricerca per nome umano e tecnico, tre filtri, descrizione integra, stima e dipendenza separate dal permesso, quattro scelte con conferma server, ricarica e recupero. Nessuna nuova dipendenza, token, icona o blocco; riusati ToolList, DetailPanel, Toolbar, FilterChips, ScopeNote, PendingList. Quattro regole CSS circoscritte nel mockup canonico; template/CSS rigenerati.

| Aspetto | Originale → proposta | Prova e verdetto |
|---|---|---|
| Copertura | Inventario nel foglio + permessi in altro foglio → selettore nel dettaglio, canale originale conservato | Quattro valori, POST/registry/JSONL/reload verificati. B4.1 funzionale; B4 completa ancora aperta |
| Chiarezza | Descrizioni e uso piccoli nella modale → testo intero e separazione offerto/dipendenza/policy | Originale e app con sei voci equivalenti aperti alle tre larghezze; beneficio leggibilità e ricerca |
| Accesso | Lista senza selezione → frecce/Home/End e selettore nativo | Fuoco mantenuto dopo salvataggio senza rubarlo se la persona si sposta; test permanente |
| Responsive/densità | Modale centrata → lista/dettaglio affiancati a1440/1280, sovrapposti a1024 | A1280 la sesta riga con uso può richiedere scroll interno; ricerca mostra un risultato e dettaglio. Non si afferma meno passi in ogni situazione |
| Errori | Toast generico → errore persistente con nome attrezzo e ripristino valore confermato | GET503/null e POST503, selezione diversa e Board/ritorno provati. Toast legacy ancora privo di stile: scenario B7-TOAST-FUORI-REGIONE, da chiudere prima del cutover |
| Persistenza e latenza | Endpoint invariato → azioni serializzate e risposta obsoleta scartata | Salvataggio HTTP vero su registry e file isolati; nessun benchmark di velocità dichiarato |

Verifiche finali: unità Capability3/3; componenti48/48; prova app12/12 a1440/1280/1024; npm run verify verde: build,53 unità/contratti, determinismo30file, statico195/195. Diff --check verde. Parità ToolList: immagini a1440/1280 identiche SHA256;1024 sotto soglia invariata, aperte entrambe. Aperto anche browser reale4177: runtime assente correttamente dichiarato, nessun falso catalogo. Le sei voci del test sono fixture dichiarate; API/registry/JSONL sono reali. Catalogo completo43 e chiamata al modello non verificati perché runtime locale non configurato: nessuna superiorità su tale copertura dichiarata. CAP-LISTA-LUNGA verifica altezza480 e End su sei voci, non uno stress test43.
Prove selezionate e aperte, copiate manualmente da artifacts (23 PNG):
- .claude/immagini/astra-fase2/ToolList/app-catalogo-1024.png
- .claude/immagini/astra-fase2/ToolList/app-catalogo-1280.png
- .claude/immagini/astra-fase2/ToolList/app-catalogo-1440.png
- .claude/immagini/astra-fase2/ToolList/app-dettaglio-1024.png
- .claude/immagini/astra-fase2/ToolList/app-dettaglio-1280.png
- .claude/immagini/astra-fase2/ToolList/app-dettaglio-1440.png
- .claude/immagini/astra-fase2/ToolList/app-dipendenza-1440.png
- .claude/immagini/astra-fase2/ToolList/app-errore-lettura-1440.png
- .claude/immagini/astra-fase2/ToolList/app-errore-salvataggio-1440.png
- .claude/immagini/astra-fase2/ToolList/app-non-osservabile-1440.png
- .claude/immagini/astra-fase2/ToolList/app-ricaricata-1440.png
- .claude/immagini/astra-fase2/ToolList/originale-catalogo-1024.png
- .claude/immagini/astra-fase2/ToolList/originale-catalogo-1280.png
- .claude/immagini/astra-fase2/ToolList/originale-catalogo-1440.png
- .claude/immagini/astra-fase2/ToolList/originale-permessi-1024.png
- .claude/immagini/astra-fase2/ToolList/originale-permessi-1280.png
- .claude/immagini/astra-fase2/ToolList/originale-permessi-1440.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1024x800-app.png
Cosa deve fare l’owner · Nulla per continuare; prova su http://127.0.0.1:4177/ → Capability.
Cosa fai tu dopo · B4 Skill/Connettori/Plugin/Hook, poi coda R02.
Cosa rimane · B4 estensioni; B6; B2; B7 (anche modulo creazione automazioni e ToastRegion); B1; B8; Browser K-I. OAuth/computer-use restano PROPOSTE. Nessun push.

## B4.2 consegna ExtensionList — 05/09/2026
Skill, Connettori MCP, Plugin e Hook innestati negli endpoint originali. Ricerca per nome, id e metadati, dettaglio completo dei dati disponibili, tab e lista da tastiera, errori persistenti, aggiornamento e fiducia confermata dal server. Riusati Page, Tabs, Toolbar, ToolList, DetailPanel, KeyValue e badge; zero nuovi blocchi, token, icone o dipendenze. Quattro regole CSS circoscritte per lista e testo intero; template/CSS rigenerati. Locale aggiunto anche mostraInventarioEstensioni; sei export del piano invariati.

| Aspetto | Originale → proposta | Prova e verdetto |
|---|---|---|
| Copertura | Inventari nel foglio Control/Capability → quattro pannelli con gli stessi GET e POST trust | Skill senza fiducia inventata; comando/argomenti/allowlist MCP, tool/hook/avvisi plugin, eventi hook presenti. Canali originali conservati |
| Semantica | Etichetta attivo derivata dalla fiducia → Fidato/Da fidare | Fiducia non significa connessione o esecuzione. Per hook il comando non è esposto dall’API: percorso di origine e limite dichiarati |
| Chiarezza | Righe piccole senza ricerca → filtro, descrizione e metadati leggibili | Originale e proposta aperti a1440/1280/1024; etichette senza troncamento dopo correzione |
| Azioni e accessibilità | Fida sulla riga → selezione e revisione del dettaglio prima di Fida | Per altre righe può aggiungere un passo: beneficio è leggere i dati prima di fidare, non una riduzione universale. Tab manuali, frecce/Home/End; fuoco ritorna al dettaglio confermato |
| Stato, errori e recupero | Risposta effimera → errore persistente con bersaglio e retry | Manifesto corrotto/riparato reali, POST503 controllato, nessuna falsa conferma e nessuna scrittura concorrente |
| Persistenza | Registro esistente → stesso id/hash | MCP/plugin/hook restano fidati dopo reload, manifesto MCP cambiato richiede nuova fiducia; warnings plugin restano visibili |
| Responsive | Modale → affiancati a1440/1280, sovrapposti a1024 | Fida raggiungibile; testi interi. Nessun benchmark di latenza o confronto prestazionale dichiarato |

Verifiche: unità4/4; componenti60/60; prova app15/15 alle tre larghezze; persistenza rafforzata dopo reload per tutti e tre i tipi nuovamente3/3. npm run verify verde (build, contratti/unità, determinismo e statico195/195). Prove HTTP con createHttpApp, registry, manifesti e file di fiducia reali in directory temporanee isolate; contenuti di esempio dichiarati, nessuna estensione o processo MCP eseguiti. Istanza4177 senza cataloghi mostra vuoto onesto. Nessuna superiorità end-to-end sui competitor dichiarata: i +1 documentati sono i criteri locali verificati.
Regressioni permanenti chiuse: EXT-REGIA-JSON, EXT-ICONA-ESISTENTE, EXT-ETICHETTE-INTEGRE, EXT-FOCUS-FIDUCIA, EXT-RISPOSTA-OBSOLETA, EXT-RECUPERO. Limite ereditato: trust macchina/id (non isolamento progetto); hash hook sul comando. Nessuna modifica backend.
Prove selezionate e aperte, copiate manualmente da artifacts (29 PNG):
- .claude/immagini/astra-fase2/ExtensionList/app-skills-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-mcp-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-plugins-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-hooks-1440.png
- .claude/immagini/astra-fase2/ExtensionList/originale-plugins-1440.png
- .claude/immagini/astra-fase2/ExtensionList/originale-hooks-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-skills-1280.png
- .claude/immagini/astra-fase2/ExtensionList/app-mcp-1280.png
- .claude/immagini/astra-fase2/ExtensionList/app-plugins-1280.png
- .claude/immagini/astra-fase2/ExtensionList/app-hooks-1280.png
- .claude/immagini/astra-fase2/ExtensionList/originale-plugins-1280.png
- .claude/immagini/astra-fase2/ExtensionList/originale-hooks-1280.png
- .claude/immagini/astra-fase2/ExtensionList/app-skills-1024.png
- .claude/immagini/astra-fase2/ExtensionList/app-mcp-1024.png
- .claude/immagini/astra-fase2/ExtensionList/app-plugins-1024.png
- .claude/immagini/astra-fase2/ExtensionList/app-hooks-1024.png
- .claude/immagini/astra-fase2/ExtensionList/originale-plugins-1024.png
- .claude/immagini/astra-fase2/ExtensionList/originale-hooks-1024.png
- .claude/immagini/astra-fase2/ExtensionList/app-fidata-plugins-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-modificata-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-errore-fiducia-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-errore-lettura-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-vuota-1440.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1024x800-app.png
Cosa deve fare l’owner · Nulla per proseguire; può provare Capability su http://127.0.0.1:4177/.
Cosa fai tu dopo · B6 Diagnostica, Impostazioni e Model Lab.
Cosa rimane · B6→B2→B7 (anche creazione automazioni e ToastRegion)→B1→B8→Browser K-I. OAuth/computer-use restano PROPOSTE. Nessun push.

## B6.1 consegna Doctor — 05/09/2026
SeverityCount e CheckCard innestati sul GET /api/v1/doctor esistente, dal comando Doctor del foglio Control. Tutti i segnali originali sono conservati; la pagina mostra11 categorie ordinate per gravità, una sintesi annunciabile, errori persistenti, Ricontrolla e download JSON del risultato effettivamente visto. Riusati DoctorScreen, Topbar, Page, SeverityCount e CheckCard; zero nuovi blocchi, token, icone, dipendenze o regole CSS. Locali aggiunti paginaDoctor, mostraDoctor, caricaDoctor, esportaDoctor; eseguiDoctor/riassuntoDoctor/refreshDoctorBadge preservati. Template e CSS rigenerati.

| Aspetto | Originale → proposta | Evidenza e verdetto |
|---|---|---|
| Copertura e chiarezza | Badge e toast3,3s → risultato persistente, categorie e dettaglio | Originale e nuova app aperti a1440/1280/1024 sullo stesso backend: servizio agente e catalogo non pronti, Git disponibile,73 sessioni ripristinate |
| Semantica | Desktop genericamente da controllare → tipo ambiente esplicito; configurazione separata dall’esecuzione | Chiave/navigazione/ricerca non sono prove di connessione. Shell desktop dichiarata senza attestare isolamento WSL2 |
| Errori e recupero | Toast → errore con Ricontrolla | GET503, risposta invalida, dati parziali, retry e ultimo risultato conservato provati; export disabilitato finché manca un dato valido |
| Accessibilità | Feedback effimero → status/alert separati, titolo e gravità testuali | DOCTOR-FOCUS RED→GREEN: Ricontrolla conserva il focus se la persona non si sposta; nessuna informazione affidata al solo colore |
| Responsive e densità | Sintesi breve →11 schede scrollabili | Topbar resta su una riga, controlli accessibili alle tre larghezze, fondo pagina esaminato. A1024 l’ora in testata segue la regola comune di occultamento; resta nel JSON esportato |
| Persistenza e prova | Nessun report scaricabile → JSON del risultato e ora di ricezione | Download letto e confrontato; reload esegue un controllo fresco. Nessuna nuova chiave localStorage né invio dei dati |

Verifiche: unità Doctor4/4; prova app12/12; npm run verify verde:61 unità/contratti, determinismo30file, statico195/195; componenti63/63. Esame visivo:6 originali/proposta,3 fondi pagina,3 casi errore/parziale/scarti,6 immagini di parità. Prove correnti vere su4177; errori e sessioni scartate sono risposte controllate dichiarate. Nessuna chiamata al modello o prova remota provider dichiarata. Nessun pulsante di riparazione inventato.
Prove aperte e copiate manualmente da artifacts (18 PNG):
- .claude/immagini/astra-fase2/Doctor/originale-1440.png
- .claude/immagini/astra-fase2/Doctor/app-1440.png
- .claude/immagini/astra-fase2/Doctor/app-dettagli-1440.png
- .claude/immagini/astra-fase2/Doctor/originale-1280.png
- .claude/immagini/astra-fase2/Doctor/app-1280.png
- .claude/immagini/astra-fase2/Doctor/app-dettagli-1280.png
- .claude/immagini/astra-fase2/Doctor/originale-1024.png
- .claude/immagini/astra-fase2/Doctor/app-1024.png
- .claude/immagini/astra-fase2/Doctor/app-dettagli-1024.png
- .claude/immagini/astra-fase2/Doctor/app-errore-1440.png
- .claude/immagini/astra-fase2/Doctor/app-parziale-1440.png
- .claude/immagini/astra-fase2/Doctor/app-scarti-1440.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1024x800-app.png
Cosa deve fare l’owner · Nulla per continuare. Prova su http://127.0.0.1:4177/ → Comandi → Agenti, regole e Doctor → Doctor.
Cosa fai tu dopo · Impostazioni e Model Lab (B6).
Cosa rimane · B6 Impostazioni/ModelLab→B2→B7 (creazione automazioni e ToastRegion inclusi)→B1→B8→Browser K-I. OAuth/computer-use solo PROPOSTE. Nessun push.

## B6.2 consegna SettingsNav e SettingRow — 05/09/2026
Merge richiesto dal richiamo RICERCA-WEB-NON-PREVISTA eseguito: fast-forward a 8c686aec (solo documenti). Nessuna schermata ricerca web nuova: la configurazione search-source resta nella sezione Strumenti agente e permessi di Impostazioni. Ricerca approfondita già consegnata resta invariata.

Riusati SettingsNav, SettingsSection, SettingRow, Select, Switch, KV, Card, Page e Topbar; nessun nuovo blocco, token, icona o dipendenza. Aggiunti solo elementi CSS talos-setting__control e talos-settings__actions. Tutti38 controlli originali trasferiti con id e listener, comprese14 scelte tema; gli output dei cursori sono conservati. Riepiloghi e azioni originali riusati. Template e CSS rigenerati dal canonico.

| Aspetto | Originale → proposta | Evidenza / verdetto |
|---|---|---|
| Copertura | 38 controlli → stessi38, medesime opzioni e store | Cambio di ogni controllo con mouse/tastiera e reload alle tre larghezze. Nessun id duplicato. Effetto grafico completo ancora da provare nella tranche B8 |
| Ricerca e passi | Nessuna ricerca preferenze → filtro per nome e opzioni | bilanciata trova Qualità in una sola operazione; risultato vuoto esplicito e ripristino della sezione |
| Accessibilità | Cursori privi di nome →38 label esplicite, valore e unità | Nomi accessibili esatti; frecce verticali/Home/End e un solo tab nella sequenza di focus |
| Semantica | Provider descritti genericamente → runtime locale/accesso pubblico/chiave configurata | Ollama e Hugging Face distinti sui dati reali; configurazione non presentata come prova connessione |
| Responsive/densità | Titolo sessione sovrapposto nel riepilogo → testo a capo entro KV | Originale e proposta aperti a1440/1280/1024; topbar su una riga, campi senza sovrapposizioni |
| Persistenza/recupero | Store originale → medesimo store e ripristino movimento | Tutti38 valori ritrovati; reset movimento conserva tema. Nessun nuovo messaggio che prometta salvataggio riuscito |

Cancelli verdi su sorgenti fermi: npm run verify =63 unità/contratti,30 file deterministici,195/195 statici; componenti69/69; prove app15/15 (più3/3 ricognizione originale). Dati reali server4177 e store browser isolato Playwright. Non è una prova agente tramite modello e non viene dichiarata tale. Screenshot:27 originali e30 app esaminati, più12 parità; gli stati finali cambiati sono stati riaperti. Le foto della configurazione ricerca web attuale restano diagnostiche in artifacts perché il suo innesto è ancora da fare. Copiate solo33 prove selezionate elencate sotto.

Ancore delle regressioni corrette (righe al momento di questa consegna):
- SET-BOOT: harness-ui/frontend/src/legacy/app.js:3588, selettore $$ ripristinato; percorso di avvio/navigazione coperto da tests/parity/impostazioni-vivo.spec.mjs:5.
- SET-NOME-UNIVOCO: harness-ui/frontend/src/components/impostazioni.js:17, rimozione della vecchia associazione label; tutti38 nomi verificati in tests/parity/impostazioni-vivo.spec.mjs:12.
- SET-PROVIDER-LOCALE: harness-ui/frontend/src/legacy/app.js:3413, confronto con execution=runtime locale, contratto effettivo.
- SET-RIEPILOGO-INTEGRO: harness-ui/frontend/src/styles/index.css:533 (generato dal canonico), wrapping dei KV, test permanente :26.
- Race degli artefatti Playwright: verifica invalidata da due suite concorrenti sulla stessa directory temporanea; cancelli rieseguiti in sequenza senza modificare asserzioni. Non era un difetto prodotto.

Limiti aperti: B6 NON completa. Fonte/chiave/prova ricerca web e sei schede ModelLab richiedono i prossimi innesti. La persistenza delle preferenze non prova tutti gli effetti: preset/movimento restano B8; dimensioni e stili Chat/composer necessitano raccordo col perimetro orchestratore. Restano B7-DIALOGO-CREAZIONE-AUT e B7-TOAST-FUORI-REGIONE. Nessuna modifica a sidebar/testata/Chat/Review/ponte/frammenti/public. Nessun push.

Prove aperte e selezionate:
- .claude/immagini/astra-fase2/Impostazioni/originale-appearance-1440.png
- .claude/immagini/astra-fase2/Impostazioni/app-aspetto-1440.png
- .claude/immagini/astra-fase2/Impostazioni/originale-movimento-1440.png
- .claude/immagini/astra-fase2/Impostazioni/app-movimento-1440.png
- .claude/immagini/astra-fase2/Impostazioni/app-ricerca-1440.png
- .claude/immagini/astra-fase2/Impostazioni/originale-providers-1440.png
- .claude/immagini/astra-fase2/Impostazioni/app-providers-1440.png
- .claude/immagini/astra-fase2/Impostazioni/originale-appearance-1280.png
- .claude/immagini/astra-fase2/Impostazioni/app-aspetto-1280.png
- .claude/immagini/astra-fase2/Impostazioni/originale-movimento-1280.png
- .claude/immagini/astra-fase2/Impostazioni/app-movimento-1280.png
- .claude/immagini/astra-fase2/Impostazioni/app-ricerca-1280.png
- .claude/immagini/astra-fase2/Impostazioni/originale-providers-1280.png
- .claude/immagini/astra-fase2/Impostazioni/app-providers-1280.png
- .claude/immagini/astra-fase2/Impostazioni/originale-appearance-1024.png
- .claude/immagini/astra-fase2/Impostazioni/app-aspetto-1024.png
- .claude/immagini/astra-fase2/Impostazioni/originale-movimento-1024.png
- .claude/immagini/astra-fase2/Impostazioni/app-movimento-1024.png
- .claude/immagini/astra-fase2/Impostazioni/app-ricerca-1024.png
- .claude/immagini/astra-fase2/Impostazioni/originale-providers-1024.png
- .claude/immagini/astra-fase2/Impostazioni/app-providers-1024.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1024x800-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1024x800-app.png

Cosa deve fare l’owner · Nulla per proseguire. Impostazioni provabili su http://127.0.0.1:4177/.
Cosa fai tu dopo · Completare fonte/chiave/prova dentro Impostazioni, poi ModelLab.
Cosa rimane · B6→B2→B7→B1→B8→Browser K-I; OAuth e computer-use solo PROPOSTE.

## B6.3 FonteRicerca — consegna verificata 05/09/2026
Dentro Impostazioni → Strumenti agente e permessi: cinque fonti originali più off, scelta persistita sul server, chiave/sostituzione/rimozione nel portachiavi, indirizzo, collegamenti sicuri e prova reale tramite le rotte esistenti. Nessun endpoint né storage aggiunto. Nuovo modulo FonteRicerca; riusati ChoiceCards, SettingRow, Field, Button, Card, token esistenti. Zero nuovi blocchi visivi, zero token CSS, zero dipendenze. Mockup rigenerato:16 schermate,113 blocchi.

| Aspetto | Originale → proposta | Beneficio verificato / limite |
|---|---|---|
| Copertura | Tutte6 scelte e azioni conservate | Aggiunta chiave facoltativa custom già supportata dal server |
| Prova | Query fissa → testo libero | Invio e retry con frasi naturali; configurazione distinta da connessione verificata |
| Tastiera | Radio tabulabili → gruppo con frecce e ingresso unico | Focus restituito al controllo; nessun richiamo se la persona cambia pagina |
| Errori | Segnalazione generica → errore nel pannello, retry e campi conservati | Risposta malformata non diventa successo; vecchi risultati invalidati |
| Layout | Confronto originale/app1440/1280/1024 | Stesse scelte, forma canonica; campi lunghi scorrono, esito/errore completamente nel viewport |
| Persistenza | Backend originale conservato | Ricarico browser e riapertura store su file; chiave esclusa dal JSON della scelta |
| Limiti | Indirizzo unico per fonte attiva | Cambiare fonte azzera indirizzo come prima; nessuna promessa di prestazioni/superiorità globale |
Verdetto: innesto verificato nel perimetro. Preserva funzioni e migliora configurazione custom, prova e recupero; accettazione visiva finale dell’owner distinta dai cancelli.

Verifiche fresche: build;66 unità/contratti;30 asset deterministici;195/195 statici;72/72 componenti (TALOS_LAB_PORT4178);36/36 percorsi app (18 FonteRicerca +18 Impostazioni, incluso SET-RACCORDO-ATTRIBUTI dopo reload); originale3/3 e backend HTTP/store10/10 nella stessa fase. Nessuno skip né retry automatico. Il test di configurazione usa HTTP/store reali isolati con chiavi artificiali e portachiavi in memoria; la risposta del motore di ricerca è una fixture dichiarata, non una chiamata pagata. GET4177 reale verificato separatamente. Nessuna esecuzione agente dichiarata senza modello disponibile.
Regressioni permanenti: FONTE-ESITO-SCADUTO, FONTE-ESITO-VISIBILE (incluso1024 e margine di scorrimento12px), FONTE-LETTURA-TERMINATA, FONTE-RECUPERO, FONTE-CONCORRENZA. Tutte nel test fonte-ricerca-vivo; normalizzatori unitari rifiutano risposte invalide. Immagini finali aperte personalmente,29 selezionate sotto; le restanti sono diagnostiche negli artifacts ignorati. Parità FonteRicerca identica nelle tre larghezze.
Raccordo866a8a9f unito in7fa26452; ulteriore merge prima consegna già aggiornato. CSS Chat/composer conservato; attributi/variabili originali e provenienza Hermes registrati nel ledger alla voce Raccordo B6. B8 resta responsabile della verifica degli effetti tema/scena/movimento. Nessuna modifica ad AGENTS, ponte, frammenti o public; nessun push.

Prove aperte e selezionate:
- .claude/immagini/astra-fase2/FonteRicerca/originale-scelte-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-scelte-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-custom-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-custom-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-prova-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-prova-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-scelte-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-scelte-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-custom-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-custom-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-prova-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-prova-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-scelte-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-scelte-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-custom-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-custom-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-prova-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-prova-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-tavily-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-brave-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-searxng-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-lettura-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-salvataggio-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1024x800-app.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1440x900-mockup.png

Cosa deve fare l’owner · Può provare Impostazioni su http://127.0.0.1:4177/. Nessuna azione necessaria per proseguire.
Cosa fai tu dopo · Innestare le sei schede e gli accessi del Model Lab, preservando tutte le funzioni originali.
Cosa rimane · B6 ModelLab → B2 → B7 → B1 → B8 → Browser K-I. OAuth e computer-use restano PROPOSTE.

## R05 — consegna verificata05/09
Policy attiva usa etichettaPermesso condivisa. Tutti gli undici valori d’aspetto usano le etichette dei controlli originali; nessuna mappa privata. Valori salvati e permessi effettivi invariati. RED riprodotti e regressioni permanenti SET-NOMI-PERMESSI/SET-NOMI-ASPETTO verdi.
Gates freschi:42/42 prove live (24 Impostazioni+18 FonteRicerca), npm run verify verde (build30 asset,66 contratti,30 file deterministici,195 statici),72/72 confronti componenti; git diff --check verde. Sei screenshot R05 aperti alle larghezze1440/1280/1024, permessi/aspetto: .claude/immagini/astra-fase2/R05-Impostazioni/. Nessun taglio delle etichette osservato. Prima: nomi tecnici e diciture discordanti documentati dalle prove RED e dalle immagini Settings/FonteRicerca; dopo: etichette umane coerenti. Gli screenshot delle policy usano sessioni vuote controllate, quelli d’aspetto l’inventario esistente: non sono un confronto pixel a parità di dati. Nessuna esecuzione agente rivendicata.
Cosa deve fare l’owner · Nessuna azione necessaria. Impostazioni disponibili su http://127.0.0.1:4177/.
Cosa fai tu dopo · Riprendere il catalogo Model Lab già salvato, poi le altre schede.
Cosa rimane · B6 Model Lab → B2 → B7 → B1 → B8 → Browser K-I. OAuth e computer-use restano proposte.

## B6.4 CatalogoModelli — componente innestato,05/09
Catalogo nel pannello originale del Model Lab, forma ListRow/DetailPanel del mockup. Ricerca per nome/ID/fornitore, filtro, aggiornamento forzato, dettaglio completo; tutte le righe raggiungibili con Mostra altri. Prezzi per milione di token e valori originali apribili da tastiera. Fonte e data visibili; nessun accesso dichiarato dal solo elenco. Fornitori e accessi usa il canale originale, senza aprire anche il velo dimostrativo.
Riusati ListRow, DetailPanel, Field, Select, Button, Card e token esistenti. Zero blocchi o token nuovi; zero dipendenze. Nuovo modulo catalogo-modelli.js, sette export elencati nel piano; quattro funzioni monolite restano compatibili. Nessuna modifica backend/storage.
| Aspetto | Originale → componente | Esito e limite |
|---|---|---|
| Copertura | Elenco fermo a120 → continuazione | Test131 righe, ultima selezionabile; nessuna riga scartata dal filtro |
| Selezione | Primo dettaglio senza prima riga marcata → coerenti | Stato annunciato, accento visivo e focus conservato |
| Prezzi | Decimali senza unità → USD per milione + originale per token | Test0,8/1,6USD, zero distinto da mancante |
| Errori | Errore distinto dalla ricerca vuota | 503 e risposta malformata recuperabili, query conservata |
| Layout | Pannello originale confrontato alle tre larghezze | Campi leggibili, dettaglio non compresso, scorrimento per contenuti lunghi |
| Stato | Catalogo non prova le credenziali | Nessun badge Accesso pronto o azione Usa senza rotta |
| Persistenza | Catalogo e filtri restano in memoria della pagina come prima | Refresh cache server invariato; nessuna promessa di filtri persistiti al reload |
12/12 prove live finali, inclusi GET reali4177; fixture dichiarate per131 righe, prezzi ed errori. Originale3/3 osservato prima innesto. Nessuna esecuzione modello rivendicata. Regressioni permanenti: CAT-ETICHETTA-INTEGRA, CAT-ERRORE-TOKEN, CAT-SELEZIONE-VISIBILE, CAT-DETTAGLIO-SPAZIO, CAT-FORNITORI-CANALE. Statico aggiornato alle fixture osservate conserva i passi HF/installati, nessuno skip.
27 screenshot app/originale aperti e selezionati in .claude/immagini/astra-fase2/CatalogoModelli/. La cornice Model Lab è ancora quella legacy senza stile: questo commit consegna il componente catalogo, NON tutte le sei schede. La cornice e gli altri renderer sono il passo successivo obbligatorio.
Cosa deve fare l’owner · Nessuna azione necessaria. Catalogo su http://127.0.0.1:4177/ → Impostazioni → Laboratorio modelli → Catalogo API.
Cosa fai tu dopo · Innestare cornice, memoria/runtime e le altre schede del Model Lab.
Cosa rimane · B6 restante → B2 → B7 → B1 → B8 → Browser K-I; OAuth e computer-use proposte.

B6.4 cancelli finali: npm run verify verde (69/69 contratti,195/195 statici, build30 asset e30 file deterministici);75/75 componenti su4178;12/12 Catalogo live e42/42 Impostazioni/FonteRicerca dopo innesto. git diff --check verde. Sei immagini parità finali aperte e aggiunte:33 prove selezionate complessive. Nessun push.
Cosa deve fare l’owner · Nessuna azione necessaria.
Cosa fai tu dopo · Runtime/memoria e completamento Model Lab.
Cosa rimane · Restanti schede B6 → B2 → B7 → B1 → B8 → Browser K-I.


## R06 — Testata Model Lab e filtri vuoti (05/09/2026)
La testata ora riusa PageHead, KeyValue, Badge e Tabs del mockup. Quattro righe ordinate; sei schede con selezione visibile, frecce/Home/End e attivazione manuale. Il valore fisso Gated è sostituito dalla disponibilità effettivamente osservata: verifica in corso, fallita, nessun runtime raggiunto, nessun modello disponibile, runtime disponibili. Tutti gli ID e gli handler delle sei sezioni sono preservati. CSS aggiunto nel file canonico e rigenerato; nessun token nuovo, nessuna nuova rotta, nessun frammento legacy modificato.
Confronto visivo: aperti originale-catalogo-1440/1280/1024 e le 9 immagini R06. Rispetto al precedente innesto, label e valori non si incollano e le schede sono distinguibili. Rispetto all’originale, maggiore leggibilità e stato osservato al posto di una promessa tecnica fissa. A 1024 la striscia scorre orizzontalmente, come la variante Tabs approvata; tastiera verificata fino a Download. Nessuna superiorità su tutti i competitor dichiarata.
Evidenze: .claude/immagini/astra-fase2/R06-ModelLab/testata-{1440,1280,1024}.png; ricerca-vuota-{1440,1280,1024}.png; fornitore-vuoto-{1440,1280,1024}.png. Il secondo stato vuoto è la combinazione di un fornitore reale del catalogo di prova con una ricerca che non ha modelli presso quel fornitore; non si inventa un provider vuoto nell’API. Cancellando la ricerca tornano 65 risultati. Fixture distinte dalle prove con GET reale.
Limite esplicito: R06 veste la cornice esistente; non chiude le sei schede del Model Lab. MemoryMeter già avviato riprende dopo questo commit, poi completare runtime/prova/installati/HF/download/accessi secondo il brief.
Cosa deve fare l’owner: nessuna operazione necessaria; può vedere la correzione su http://127.0.0.1:4177, Impostazioni → Laboratorio modelli → Catalogo API.
Cosa fai tu dopo: riprendere MemoryMeter e completare B6, mantenendo questa cornice.
Cosa rimane: resto B6 → B2 → B7 (setupModalResize e Intro con albero compatto) → B1 Terminale K-G → B8 → Browser K-I. OAuth e computer-use restano proposte successive.

Cancellli finali R06: verify 73/73 unit, 195/195 statici, 30 asset e build deterministica; componenti 78/78 su 4178; Catalogo/R06 vivo 21/21 su 4177, compresi GET reale, tutte le sei schede e reload. git diff --check verde. R06 correzione testata e stati vuoti CHIUSA; B6 complessivo APERTO.


## B6.5 — MemoryMeter, pannello memoria e disco (05/09/2026)
Innesto nel Model Lab: il blocco MemoryMeter del mockup sostituisce le quattro metriche e il pannello memoria originali. Riusa Card, Badge, Button, KeyValue e meter HTML, stesso sprite e stessi token. Nessun token nuovo. Mantiene i due pulsanti originali e i loro listener, GET capacità, GET runtime e POST unload con runtimeId llama.cpp; le chiamate passano da apiGet/apiPost, Toast e Connessione sono quelli dell’orchestratore. R06 e R07 preservati.
La RAM totale/libera è distinta dal disco disponibile/riservato/allocabile. Valori in GiB, data della misura, nessuna memoria per processo o modello inventata. Il mockup prima attribuiva la riserva del disco alla RAM: corretto. Durante una lettura fallita le vecchie misure spariscono; durante la verifica del runtime non si dichiara un modello assente. Liberazione e rimisura non si sovrappongono. Se unload fallisce, resta possibile riprovare e lo stato non finge un successo. RAM alta: segnale cromatico preservato e frase esplicita aggiunta.
Confronto originale/proposta: stesse capacità e azioni; cinque valori separati contro quattro con riserva ambigua, azioni vicine ai dati, avvisi testuali e numerici oltre al colore, zero distinto da dato mancante. Screenshot originali e proposta aperti a 1440/1280/1024, compresi errore misura, errore runtime, errore unload, scaricamento, capacità reale e RAM piena. Foto in .claude/immagini/astra-fase2/MemoryMeter/. Verdetto del componente: miglioramento dimostrato su chiarezza e recupero dagli errori; nessuna superiorità globale sui competitor rivendicata.
Limite reale: GET capacità e rimisura esercitati contro il server 4177; nessun motore locale pronto era disponibile per una liberazione reale. Scaricamento, errori, concorrenza e retry sono provati con risposte HTTP controllate. Non dichiaro eseguito un modello locale. La Panoramica completa e le altre sezioni B6 non sono ancora chiuse.
Cosa deve fare l’owner: nessuna operazione necessaria; può provare Impostazioni → Laboratorio modelli → Panoramica su http://127.0.0.1:4177.
Cosa fai tu dopo: completare runtime e Prova nella Panoramica, poi Provider, Installati, Hugging Face e Download.
Cosa rimane: resto B6 → B2 → B7 → B1 Terminale K-G → B8 → Browser K-I; OAuth e computer-use restano proposte successive.

| Aspetto | Originale | MemoryMeter | Evidenza / verdetto |
|---|---|---|---|
| Copertura | RAM totale/libera, disco, scarica e rimisura | Stessi dati e comandi, più riserva disco separata | MEM-RAM-DISCO e MEM-SCARICA-CORPO verdi; conservata |
| Semantica | Riserva disco non chiaramente distinta, vecchi valori dopo errore | GiB espliciti, dato mancante distinto da zero, nessuna attribuzione al modello | MEM-CONTRATTO, MEM-ERRORE-MISURA, MEM-PRESSIONE-RAM; corretta |
| Accessibilità | Barra con testo percentuale | Meter nativo etichettato, soglie e avviso in parole, pulsanti nativi mantenuti | Parità tre larghezze; copertura semantica ampliata |
| Responsività | Metriche alte e azioni dopo ulteriore scorrimento | Righe compatte, azioni nel medesimo blocco, parole intere | Foto app/originale a 1440/1280/1024 aperte; migliorata |
| Attesa/errori | Lettura runtime saltava aggiornamento memoria su errore; Rimisura concorrente | Attesa dichiarata, errore visibile e operazioni serializzate | MEM-INIZIALE, MEM-ERRORE-RUNTIME, MEM-SCARICA-CONCORRENZA; corretta |
| Recupero/persistenza | Capacità riletta all’avvio, unload con rotta nativa | Stessa fonte riletta al reload, errore unload non perde retry | MEM-RAM-DISCO reload, MEM-ERRORE-SCARICA, MEM-SERVER-REALE; conservata |
| Limiti | Nessuna misura RAM per processo esposta | Non la inventa; unload reale non eseguito senza motore disponibile | Dichiarato, nessun confronto di latenza o prestazioni rivendicato |

Chiusura B6.5 MemoryMeter: 79/79 unit, 195/195 statici, 81/81 componenti; suite viva combinata 93/93 (memoria, Catalogo/R06, Impostazioni, FonteRicerca). Build 30 asset e determinismo verdi. 36 immagini selezionate e conservate; confronto con originale e mockup aperto. Le chiamate unload restano prove HTTP controllate, GET capacità reale verificato.
Cosa deve fare l’owner: nulla; può provare la Panoramica su 4177.
Cosa fai tu dopo: runtime e Prova, poi le altre schede B6.
Cosa rimane: resto B6 → B2 → B7 → B1 → B8 → Browser K-I.

## B6.6 — RuntimeCard nel Model Lab
Mostra ogni motore con stato osservato, modelli disponibili, stato di caricamento, indirizzo e data. Un motore raggiunto senza modelli non viene più indicato come irraggiungibile. Per Ollama/LM Studio l’elenco disponibile non viene spacciato per modelli caricati; llama.cpp distingue avvio, arresto e guasto. Aggiorna conserva la selezione e consente recupero dopo errore.
Riuso Card, Badge, KeyValue, Button, Select; componente RuntimeCard nuovo, zero token aggiunti. Mockup canonico rigenerato, nessuna modifica ai frammenti legacy, ponte, backend, Chat/Review/sidebar/testata. Screenshot originali e proposta a 1440/1280/1024 aperti; schede affiancate quando c’è spazio, dati interi a 1024. Dettagli/matrice nel ledger B6.6.
Prova reale: GET runtime e nuova lettura sul server locale; qui Ollama e LM Studio risultano irraggiungibili, nessuna inferenza eseguita. Prove di errore/attesa e selezione usano HTTP controllato. Il prompt libero della Prova era ignorato dall’originale: manca un contratto backend locale che accetti consegna+runtime+modello. Registrato il raccordo, non dichiarato funzionante.
Cosa deve fare l’owner: nulla; può leggere la Panoramica su http://127.0.0.1:4177.
Cosa fai tu dopo: Provider → Installati → Hugging Face → Download; poi raccordo Prova.
Cosa rimane: resto B6 → B2 → B7 → B1 → B8 → Browser K-I.

Chiusura RuntimeCard: 84/84 unit, 195/195 statici, 84/84 componenti; build deterministica 30 asset, 69/69 prove vive combinate (runtime, memoria, catalogo/R06) dopo build esplicita. 36 immagini conservate: originale, app, errori, vuoto, attesa, nomi lunghi, arresto e confronto pixel del componente. Screenshot aperti alle tre larghezze. git diff --check verde.
Cosa deve fare l’owner: nulla; può provare Panoramica su 4177.
Cosa fai tu dopo: Provider, Installati, Hugging Face e Download.
Cosa rimane: resto B6, raccordo Prova, B2 → B7 → B1 → B8 → Browser K-I.

## B6.7 — ProviderCard, consegna 05/09/2026

Sette fornitori reali da GET /api/v1/providers. Riusati Card, Badge, Button, Field, disclosure e token del mockup; nuovo ProviderCard con le quattro funzioni esportate annotate nel piano. Nessun token né dipendenza aggiunti. Il dialogo canonico usa la stessa fabbrica del laboratorio; le schede native chiamano le API già presenti.

| Aspetto | Originale osservato | Consegna | Prova / verdetto |
|---|---|---|---|
| Hugging Face | Salva chiave senza campo, timeout non supportato | Token facoltativo inseribile, timeout assente | PROV-HF-TOKEN: beneficio verificato |
| Anthropic/Gemini | Tempo editabile senza Salva | Salva tempo massimo sulla rotta esistente | PROV-TIMEOUT, ricarico 45 secondi |
| Bozze | Aprire altra scheda ridisegna e cancella | Nodi input preservati anche chiudendo la scheda; nessuna chiave in storage browser | PROV-DRAFT / TASTIERA |
| Stato | Catalogo raggiunto può dire Credenziale accettata | Chiave presente, servizio raggiunto, esecuzione distinti; limite OpenRouter esplicito | PROV-SONDA / TUTTI |
| Recupero | Feedback perso dopo rilettura; ripristino senza bottone | Feedback conservato, errore in vista, Aggiorna e Ripristina indirizzo operativi | PROV-ERRORE-CHIAVE / RIPRISTINO / LISTA / ERRORE-IN-VISTA |
| Attesa | Azioni concorrenti sulla stessa scheda | Comandi e input disabilitati durante operazione sul fornitore | PROV-ATTESA |

Ricerca e pin: sezione B6.7 del ledger; WCAG Error Identification riaperto oggi, applicato al difetto visto a 1024/1280. RED geometrico fallito a 1024 (feedback sotto viewport), poi GREEN sulle tre larghezze. Le prove delle mutazioni usano risposte controllate e chiavi fittizie; nessuna credenziale reale modificata. Upstream OpenRouter catalogo pubblico HTTP 200 / 431 modelli verificato senza Authorization: non è certificazione della chiave. Esecuzione modello e OAuth non certificati da questa consegna. Richiesta backend: verifica dedicata OpenRouter /key; nessun cambiamento backend in questo commit.

Screenshot selezionati e aperti:
- .claude/immagini/astra-fase2/ProviderCard/originale-hf-1440.png
- .claude/immagini/astra-fase2/ProviderCard/app-hf-1440.png
- .claude/immagini/astra-fase2/ProviderCard/app-errore-salva-1440.png
- .claude/immagini/astra-fase2/ProviderCard/comp-app-1440.png
- .claude/immagini/astra-fase2/ProviderCard/comp-mockup-1440.png
- .claude/immagini/astra-fase2/ProviderCard/originale-hf-1280.png
- .claude/immagini/astra-fase2/ProviderCard/app-hf-1280.png
- .claude/immagini/astra-fase2/ProviderCard/app-errore-salva-1280.png
- .claude/immagini/astra-fase2/ProviderCard/comp-app-1280.png
- .claude/immagini/astra-fase2/ProviderCard/comp-mockup-1280.png
- .claude/immagini/astra-fase2/ProviderCard/originale-hf-1024.png
- .claude/immagini/astra-fase2/ProviderCard/app-hf-1024.png
- .claude/immagini/astra-fase2/ProviderCard/app-errore-salva-1024.png
- .claude/immagini/astra-fase2/ProviderCard/comp-app-1024.png
- .claude/immagini/astra-fase2/ProviderCard/comp-mockup-1024.png

Cosa deve fare l’owner: guardare Provider in Impostazioni → Laboratorio modelli su http://127.0.0.1:4177; nessuna configurazione necessaria per proseguire.
Cosa fai tu dopo: Installati, Hugging Face e Download.
Cosa rimane: raccordo Prova libera col runtime locale (richiesta già nel ledger), resto B6, B2, B7, B1, B8 e Browser K-I.

ProviderCard — verifica finale: npm run verify verde (87 unitari, build deterministica30asset, 195 statici); test:componenti87/87; Provider30/30 più GET reale3/3. Le tre prove reali aggiunte, aperte e archiviate:
- .claude/immagini/astra-fase2/ProviderCard/app-server-reale-1440.png
- .claude/immagini/astra-fase2/ProviderCard/app-server-reale-1280.png
- .claude/immagini/astra-fase2/ProviderCard/app-server-reale-1024.png

Regressione B6 finale: Catalogo / cornice / MemoryMeter / RuntimeCard 81/81, oltre ai 33 scenari Provider.
Cosa deve fare l’owner: verificare la consegna su 4177.
Cosa fai tu dopo: raccordo visivo Runtime richiesto dalla review R-08/R-09, poi Installati.
Cosa rimane: resto B6 e consegne B2, B7, B1, B8, Browser K-I.
