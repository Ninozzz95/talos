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
