# Domande per il redesign di TALOS — una per decisione, con la prova e il consiglio

> Owner, 04/09: «voglio più domande, almeno 30 per categoria di screenshot rilevato, stiamo facendo
> un passo importante e tu lo stai sottovalutando».
>
> Come si usa: ogni domanda ha un **consiglio** già scritto. Se sei d'accordo non rispondere: vale
> il consiglio. Rispondi solo dove vuoi qualcosa di diverso — così ne discutiamo dieci invece di
> duecento, ma nessuna resta decisa da me in silenzio.
>
> Le prove stanno in `.qa-runs/confronto-2026-09-04/` (indice sfogliabile: `indice.html`).
> Decisioni già prese e non più in discussione: **restiamo sul nostro scuro con l'ambra,
> disciplinato**; **le righe sessione mostrano il titolo e il resto al passaggio**; la sidebar la
> propongo io aggregando Hermes e Codex invece di scegliere fra i due.

---

## A · SIDEBAR E NAVIGAZIONE (30)

Prove: `hermes-v3/01-home.png`, `codex/03-codex-app.png`, `talos-v2/01-…` e `05-chat-vuota.png`.

**A1.** La sidebar ha tre blocchi (azioni · luoghi · cronologia) o due (azioni · cronologia) con i luoghi altrove? — *Consiglio:* tre blocchi, è l'unico modo di far emergere le otto sezioni che oggi sono sepolte.
**A2.** Quante voci di primo livello al massimo? — *Consiglio:* 5-7 visibili sempre, il resto dietro «Altro» (la ricerca 2026 sulle sidebar dice 5-7, oltre si smette di leggerle).
**A3.** Le sezioni si chiamano con il nome della cosa (Memoria) o dell'azione (Ricorda)? — *Consiglio:* il nome della cosa: è un luogo, non un verbo.
**A4.** «Capability» resta questo nome o diventa «Attrezzi e connettori»? — *Consiglio:* «Capability» come deciso, con sottotitolo esplicativo dentro la pagina.
**A5.** Le sessioni si raggruppano per progetto (come Codex) o restano una lista piatta? — *Consiglio:* piatta di default, con un interruttore «raggruppa per progetto» in cima alla lista: con 73 sessioni serve, ma non deve essere l'unico modo.
**A6.** Le sessioni fissate esistono? — *Consiglio:* sì, sezione «Fissate» sopra le sessioni, come Hermes.
**A7.** Come si fissa? — *Consiglio:* dal menu della riga e con trascinamento; niente scorciatoia segreta tipo shift-click come loro.
**A8.** Il vuoto delle fissate cosa dice? — *Consiglio:* un'istruzione («Fissa una sessione dal suo menu»), mai «nessun elemento».
**A9.** La ricerca è un campo sempre visibile o una scorciatoia? — *Consiglio:* campo visibile in cima, che apre la ricerca vera con Ctrl K.
**A10.** La ricerca cerca solo i titoli o dentro le conversazioni? — *Consiglio:* dentro le conversazioni (è la riga W1-04), e lo dice nel segnaposto.
**A11.** Il pulsante «Nuova» resta pieno e ambra? — *Consiglio:* sì, è l'unica azione primaria della sidebar.
**A12.** Mostriamo la scorciatoia accanto alle voci? — *Consiglio:* sì, come Hermes: è l'unico posto dove si imparano.
**A13.** La sidebar si può comprimere a sole icone? — *Consiglio:* sì, con le etichette al passaggio; oggi il pulsante c'è già.
**A14.** Da comprimere, cosa resta? — *Consiglio:* le icone dei luoghi e l'avatar del workspace; le sessioni spariscono.
**A15.** Larghezza? — *Consiglio:* 260-280 px (la ricerca dice 200-280; noi abbiamo titoli lunghi).
**A16.** La barra di selezione multipla resta sempre visibile? — *Consiglio:* no, compare solo quando entri in selezione dal menu.
**A17.** Il suggerimento «Tieni premuta una chat per le azioni» resta? — *Consiglio:* no: si scopre col tasto destro, non con una riga fissa.
**A18.** «SESSIONI REALI» come si chiama? — *Consiglio:* «Sessioni». La parola «reali» è nostra, non della persona.
**A19.** Le sezioni hanno un'icona? — *Consiglio:* sì, ma monocromatica e discreta: il colore lo teniamo per lo stato.
**A20.** Il workspace corrente dove si vede? — *Consiglio:* in fondo alla sidebar come oggi, ma cliccabile per cambiarlo.
**A21.** Mostriamo quante sessioni ci sono per sezione? — *Consiglio:* solo dove il numero cambia decisione (Attività aperte, ricerche in corso); non ovunque.
**A22.** Le sessioni in corso salgono in cima? — *Consiglio:* sì, un gruppo «In corso» sopra tutto quando ce n'è almeno una.
**A23.** Quante sessioni prima del «mostra altre»? — *Consiglio:* 20, poi si carica scorrendo.
**A24.** L'ordine è per data o per attività? — *Consiglio:* per ultima attività, non per creazione.
**A25.** Si può trascinare una sessione dentro un progetto? — *Consiglio:* sì, quando il raggruppamento è acceso.
**A26.** Il menu della riga sessione: quali voci? — *Consiglio:* Apri, Rinomina, Fissa, Fork, Esporta, Elimina — le stesse del tasto destro di oggi.
**A27.** Le azioni della riga si vedono al passaggio o sempre? — *Consiglio:* al passaggio, come Hermes.
**A28.** Il Doctor sta nella sidebar o nelle impostazioni? — *Consiglio:* nella sidebar, perché è dove guardi quando qualcosa non va.
**A29.** Le notifiche restano un'icona in alto? — *Consiglio:* sì, ma con il numero e un pannello che elenca cosa aspetta te.
**A30.** La sidebar si sposta a destra come in Hermes? — *Consiglio:* no. Una preferenza in più per un guadagno nullo.

---

## B · CHAT, COMPOSER E STATO VUOTO (30)

Prove: `talos-v2/05-chat-vuota.png`, `hermes-v3/01-home.png`, `codex/03-codex-app.png`.

**B1.** Lo stato vuoto mostra il logo o dice cosa può fare l'app? — *Consiglio:* dice cosa può fare, con tre esempi cliccabili; Hermes ruota una frase, Codex nomina il progetto.
**B2.** L'hero nomina il progetto («Cosa costruiamo in AVM-harness-desktop?»)? — *Consiglio:* sì, come Codex: è la cosa più concreta che possiamo scrivere lì.
**B3.** Gli esempi sono fissi o dipendono dal progetto? — *Consiglio:* dipendono: se c'è una suite di test, il primo esempio la nomina.
**B4.** Il «+» resta un simbolo? — *Consiglio:* sì, e serve **solo** ad allegare, come deciso.
**B5.** «Capability» diventa un pulsante con la parola? — *Consiglio:* sì, ma nella **sidebar**, non nel composer: nel composer resterebbe un secondo bottone che compete col «+».
**B6.** Cosa allega il «+»? — *Consiglio:* file del workspace, file dal disco, immagini, e l'ultimo screenshot.
**B7.** Si può incollare un'immagine? — *Consiglio:* sì, e trascinarla: è lo standard (Claude Code lo fa).
**B8.** Dichiariamo i tetti (quanti file, quanto grandi)? — *Consiglio:* sì, scritti nel foglio, non scoperti sbattendoci.
**B9.** Un allegato dichiara quanto contesto costa? — *Consiglio:* sì, in token stimati: è il nostro +1, nessuno lo fa.
**B10.** La pillola del modello resta nel composer? — *Consiglio:* sì, con la scorciatoia Ctrl Shift M scritta nel foglio.
**B11.** Il permesso resta una pillola accanto? — *Consiglio:* sì, con il colore del rischio.
**B12.** Mostriamo i giri usati nel composer? — *Consiglio:* sì, ma solo dal 50% del tetto in poi, e in grigio finché non è vicino.
**B13.** Il messaggio si invia con Invio o Ctrl+Invio? — *Consiglio:* Invio invia, Shift+Invio va a capo (come tutti).
**B14.** Durante un giro, Invio cosa fa? — *Consiglio:* indirizza il giro in corso, come Hermes; è la funzione che ci manca di più.
**B15.** Come si accoda un messaggio? — *Consiglio:* Ctrl+Invio, con una riga sotto il composer che dice quanti ce ne sono in coda.
**B16.** Escape cosa fa durante un giro? — *Consiglio:* ferma il giro (oggi non lo fa), con conferma solo se ci sono modifiche non salvate.
**B17.** Il pulsante di invio diventa «ferma» durante il giro? — *Consiglio:* sì, come già facciamo.
**B18.** Mostriamo il ragionamento? — *Consiglio:* sì, in un blocco che si apre, spento di default.
**B19.** Le chiamate agli attrezzi si vedono in linea o raccolte? — *Consiglio:* raccolte in un blocco per giro, apribile: oggi riempiono la conversazione.
**B20.** Il nome dell'attrezzo a schermo è umano? — *Consiglio:* sì, già deciso e già fatto; il nome tecnico resta nel dettaglio.
**B21.** Un attrezzo che fallisce come si mostra? — *Consiglio:* riga rossa con il motivo e un pulsante «riprova», mai un blocco JSON crudo.
**B22.** La citazione di una fonte web come si mostra? — *Consiglio:* titolo cliccabile e dominio, mai l'URL nudo.
**B23.** I file toccati si vedono in fondo al messaggio? — *Consiglio:* sì, come elenco compatto con «apri» e «vedi differenza».
**B24.** La conversazione ha un indice dei giri? — *Consiglio:* sì, nella colonna di destra, per saltare al giro N.
**B25.** Si può copiare un messaggio in markdown? — *Consiglio:* sì, e anche l'intero giro con gli attrezzi.
**B26.** Il messaggio dell'utente si può modificare e rilanciare? — *Consiglio:* sì, crea un fork della sessione (l'albero c'è già).
**B27.** Mostriamo il costo per messaggio? — *Consiglio:* no per messaggio, sì per sessione: per messaggio è rumore.
**B28.** Lo scorrimento resta ancorato in fondo? — *Consiglio:* sì, con il pulsante «torna in fondo» quando ti allontani (già c'è).
**B29.** Il composer si ridimensiona? — *Consiglio:* sì, come oggi, e ricorda l'altezza.
**B30.** La dettatura vocale resta? — *Consiglio:* sì se funziona; se non funziona si toglie: oggi il microfono c'è e non l'ho verificato.

---

## C · CAPABILITY: ATTREZZI, SKILL, CONNETTORI, PLUGIN (30)

Prove: `talos-v2/06-capability-*.png` (dodici sezioni in un foglio), `hermes-v3/01-capability-skills.png`, `04-capability-mcp.png`, `05-capability-browse-hub.png`, `codex/06-plugin.png`.

**C1.** Capability diventa una **pagina** invece di un foglio? — *Consiglio:* sì. È il difetto più grande: dodici sezioni in uno scorrimento unico.
**C2.** Le sezioni diventano schede in alto (Attrezzi · Skill · Connettori · Plugin · Libreria · Memoria · Note · Attività · Ricerca · Officina)? — *Consiglio:* schede per le prime quattro, voci di sidebar per le altre sei: sono luoghi, non dettagli.
**C3.** La scheda mostra il numero come Hermes («Skills 61»)? — *Consiglio:* sì, il numero è informazione.
**C4.** Gli attrezzi si possono spegnere singolarmente? — *Consiglio:* sì, per sessione, con il permesso per attrezzo già esistente esposto sulla stessa riga.
**C5.** La riga attrezzo mostra il costo in token? — *Consiglio:* sì, è il nostro +1; e in cima il totale.
**C6.** Il totale dice anche quanto pesa sul contesto? — *Consiglio:* sì, in percentuale della finestra del modello scelto.
**C7.** C'è una ricerca fra gli attrezzi? — *Consiglio:* sì, con un esempio nel segnaposto come loro.
**C8.** Si ordinano per uso? — *Consiglio:* sì, «più usati in questa sessione» — abbiamo già il conteggio da O-02.
**C9.** C'è un pannello di dettaglio a destra? — *Consiglio:* sì, con descrizione, costo, permesso e ultime chiamate.
**C10.** La descrizione dell'attrezzo resta in inglese? — *Consiglio:* mostriamo la nostra in italiano e teniamo quella del kernel come «testo inviato al modello», dichiarato.
**C11.** Diciamo quali attrezzi il modello scelto NON supporta? — *Consiglio:* sì (è la lezione di Gemma 3): mostrare un attrezzo che non viene offerto è una bugia.
**C12.** Le skill si possono accendere e spegnere? — *Consiglio:* sì, come OpenCode (allow/deny/ask), non solo leggere.
**C13.** Si può creare una skill dalla sessione corrente? — *Consiglio:* sì: «trasforma questo lavoro in una skill» — Anthropic ha una skill che crea skill, noi abbiamo la sessione già registrata.
**C14.** Serve un mercato di skill? — *Consiglio:* non subito. Prima le nostre; il mercato è una riga a parte (loro ne hanno nove di registri, noi zero: è una gara diversa).
**C15.** I connettori MCP mostrano da dove vengono? — *Consiglio:* sì: progetto, utente o gestito, come Claude Code.
**C16.** Mostriamo il timeout e l'allowlist per connettore? — *Consiglio:* sì, e il costo in token del suo schema.
**C17.** Un connettore si può spegnere per sessione? — *Consiglio:* sì.
**C18.** I plugin dichiarano cosa portano dentro? — *Consiglio:* sì: quante skill, quanti hook, quali attrezzi, prima di fidarsi.
**C19.** La fiducia di un plugin è per progetto o globale? — *Consiglio:* per progetto, con l'impronta, come già facciamo per gli hook.
**C20.** La Libreria diventa una sezione della sidebar? — *Consiglio:* sì (punto critico O-09).
**C21.** Un file in Libreria dichiara il costo in token? — *Consiglio:* sì.
**C22.** La Memoria distingue gli strati (di lavoro, episodica, semantica)? — *Consiglio:* sì, come Hermes: oggi mostriamo solo il genere.
**C23.** Si può correggere una memoria a mano? — *Consiglio:* sì, e vedere quando è stata usata l'ultima volta.
**C24.** Note e Attività restano separate? — *Consiglio:* sì: una è testo, l'altra ha uno stato.
**C25.** Le Attività mostrano chi le ha create (tu o l'agente)? — *Consiglio:* sì.
**C26.** La Ricerca approfondita diventa una sezione? — *Consiglio:* sì, con i rapporti come elenco e non come righe in un foglio.
**C27.** L'Officina attrezzi mostra il codice dell'attrezzo creato? — *Consiglio:* sì, in sola lettura, con «disabilita» in evidenza.
**C28.** Le voci non implementate restano a schermo? — *Consiglio:* sì ma in fondo e come elenco piatto, non come righe con pastiglia: sono una promessa, non una funzione.
**C29.** Diciamo dove vivono i file (`.harness-ui-skills/`, ecc.)? — *Consiglio:* sì, in piccolo: è ciò che rende l'app ispezionabile.
**C30.** La portata di una modifica è dichiarata («vale per le sessioni nuove»)? — *Consiglio:* sì, in fondo alla pagina come Hermes.

---

## D · IMPOSTAZIONI (30)

Prove: `talos-v2/37…47-impostazioni-*.png` (otto schede), `hermes-v3/02…30-impostazioni-*.png` (diciassette sezioni), `codex/06-plugin.png`.

**D1.** Le impostazioni restano una vista a schede o diventano una finestra con navigazione a sinistra? — *Consiglio:* finestra con navigazione a sinistra, come entrambi: le schede in alto non reggono oltre le otto voci.
**D2.** Quante sezioni? — *Consiglio:* dieci, in due gruppi (comportamento · infrastruttura), come Hermes.
**D3.** Serve una ricerca dentro le impostazioni? — *Consiglio:* sì: con dieci sezioni si cerca, non si naviga.
**D4.** Sotto-sezioni (come «Tools & Keys → Tools / Settings» di Hermes)? — *Consiglio:* sì dove servono, mai più di due livelli.
**D5.** Esportare e importare le impostazioni? — *Consiglio:* sì, e ripristinare: loro hanno le tre icone in fondo.
**D6.** Ogni impostazione dichiara la portata (sessione nuova o subito)? — *Consiglio:* sì, sulla riga.
**D7.** I modelli ausiliari per mestiere (visione, compattazione, titoli, approvazione…)? — *Consiglio:* sì: è la cosa più forte che ho visto oggi, e noi ne abbiamo uno solo.
**D8.** Il valore corrente si scrive in monospazio? — *Consiglio:* sì: distingue il valore dall'etichetta senza colori.
**D9.** «Riporta tutto al principale» per i modelli ausiliari? — *Consiglio:* sì.
**D10.** Il pannello scorciatoie esiste? — *Consiglio:* sì, con ricerca, raggruppate per area.
**D11.** Le scorciatoie si riassegnano? — *Consiglio:* sì, cliccandole, con «ripristina tutte».
**D12.** Ctrl+/ apre le scorciatoie? — *Consiglio:* sì, stesso gesto loro: è già uno standard.
**D13.** Sezione «Sicurezza» separata dai permessi di sessione? — *Consiglio:* sì: la policy è per sessione, le impostazioni di sicurezza sono globali.
**D14.** Timeout dell'approvazione configurabile? — *Consiglio:* sì (loro 300 s): oggi la nostra richiesta può restare appesa.
**D15.** Redazione dei segreti prima che il modello li veda? — *Consiglio:* sì, acceso di default. Non ce l'abbiamo.
**D16.** Allowlist dei comandi come campo? — *Consiglio:* sì, e per progetto.
**D17.** Interruttori sugli URL privati? — *Consiglio:* sì, spenti di default, con la spiegazione del perché.
**D18.** Checkpoint dei file prima delle modifiche? — *Consiglio:* sì come opzione (loro spenta): per noi è la proposta P-11.
**D19.** Sezione «Provider» con lo stato di ogni chiave? — *Consiglio:* sì, con un pallino di salute e l'ultima verifica.
**D20.** Le chiavi si vedono mai in chiaro? — *Consiglio:* mai; solo «impostata il …» e «rimuovi».
**D21.** Sezione «Costi»? — *Consiglio:* sì: loro hanno «Billing», noi non diciamo nulla sulla spesa.
**D22.** Mostriamo il consumo per giorno e per modello? — *Consiglio:* sì, dai dati che già registriamo.
**D23.** Sezione «Aspetto» con temi e movimento? — *Consiglio:* sì, come oggi, più la scelta della densità.
**D24.** Densità (compatta / comoda)? — *Consiglio:* sì: due valori, non tre.
**D25.** Dimensione del testo? — *Consiglio:* sì, tre scatti; c'è già un fattore di scala nel CSS.
**D26.** Sezione «Memoria e contesto» con la dimensione della finestra? — *Consiglio:* sì, e quanto ne occupano attrezzi e istruzioni.
**D27.** Chat archiviate? — *Consiglio:* sì, invece di eliminare: con 73 sessioni serve.
**D28.** Profili (insiemi di preferenze) come Hermes? — *Consiglio:* sì ma dopo: è una riga a sé, oggi è nelle nostre «non implementate».
**D29.** Il Doctor dentro le impostazioni o fuori? — *Consiglio:* fuori (sidebar), con un collegamento da qui.
**D30.** «Informazioni» con versione, cartelle e licenze? — *Consiglio:* sì, e con «apri la cartella dei dati».

---

## E · PERMESSI E SICUREZZA (30)

Prove: `talos-v2/20-foglio-permessi.png`, `hermes-v3/10-impostazioni-safety.png`.

**E1.** Le quattro carte del permesso restano? — *Consiglio:* sì: sono più chiare della tendina di Hermes.
**E2.** L'etichetta di rischio resta? — *Consiglio:* sì, è una cosa che loro non hanno.
**E3.** Il livello consigliato è marcato? — *Consiglio:* sì, «Consigliato» su Workspace write.
**E4.** Full access richiede una conferma in più? — *Consiglio:* sì, una spunta «ho capito cosa comporta», con scritto cosa comporta.
**E5.** Il permesso per attrezzo resta sotto la policy? — *Consiglio:* sì, e la riga dice che vince sulla policy.
**E6.** Nome e descrizione vanno su due righe? — *Consiglio:* sì: oggi sono incollati, è un difetto aperto.
**E7.** Gli attrezzi con permesso proprio sono solo cinque? — *Consiglio:* mostriamo tutti e 43 con «come la sessione» e filtriamo per «hanno un cancello».
**E8.** Si vede cosa ha fatto un attrezzo di recente? — *Consiglio:* sì, ultime tre chiamate nel dettaglio.
**E9.** La card di approvazione dice perché chiede? — *Consiglio:* sì, già fatto per i file di controllo.
**E10.** Mostriamo il contenuto che sta per essere scritto? — *Consiglio:* sì, differenza prima/dopo per una scrittura.
**E11.** L'approvazione ha un conto alla rovescia? — *Consiglio:* sì se mettiamo il timeout, altrimenti no.
**E12.** Si può approvare «sempre per questa sessione» dalla card? — *Consiglio:* sì, tranne per i file di controllo.
**E13.** Si vede l'elenco delle approvazioni date? — *Consiglio:* sì, nel Doctor o in una sezione «Registro».
**E14.** Le ricevute firmate si mostrano? — *Consiglio:* sì, sono un nostro differenziatore e oggi non si vedono.
**E15.** I file di controllo si elencano da qualche parte? — *Consiglio:* sì, nella sezione sicurezza: sono la lista di cosa non si tocca senza permesso.
**E16.** I repo annidati si mostrano nell'ambiente? — *Consiglio:* sì, già fatto oggi.
**E17.** Diciamo quando il workspace è una radice enorme? — *Consiglio:* sì, avviso esplicito: è la causa di due guasti veri.
**E18.** La sessione dichiara il permesso in ogni giro? — *Consiglio:* sì, già facciamo.
**E19.** Un cambio di permesso a metà chat si annota nella conversazione? — *Consiglio:* sì, già facciamo.
**E20.** Il rifiuto di un attrezzo si vede come errore o come nota? — *Consiglio:* nota, non errore: non è un guasto.
**E21.** Si può negare un attrezzo per sempre? — *Consiglio:* sì, e si vede nell'inventario.
**E22.** Mostriamo la trifecta (dati privati + contenuto non fidato + uscita)? — *Consiglio:* sì, quando scatta: oggi il kernel la calcola e nessuno la vede.
**E23.** Il comando shell si mostra intero prima di approvare? — *Consiglio:* sì, e con la cartella in cui gira.
**E24.** Le variabili d'ambiente passate si vedono? — *Consiglio:* sì, con i valori nascosti.
**E25.** C'è una modalità «osserva e basta» per una sessione? — *Consiglio:* è Read only, già c'è: va solo nominata meglio nel foglio.
**E26.** L'accesso alla rete è separato dal filesystem? — *Consiglio:* sì, come Codex: sono due assi diversi.
**E27.** Si può bloccare l'uscita verso domini non elencati? — *Consiglio:* sì, allowlist, mai denylist.
**E28.** Il registro delle azioni si esporta? — *Consiglio:* sì, in JSONL: è già il nostro formato.
**E29.** Un permesso concesso scade? — *Consiglio:* sì, alla fine della sessione, dichiarato.
**E30.** Si può revocare tutto con un gesto? — *Consiglio:* sì, «riporta a Workspace write» sempre visibile nel foglio.

---

## F · NUOVA SESSIONE E SCELTA DEL WORKSPACE (30)

Prove: `talos-v2/54-nuova-sessione-modale.png`, `talos-modale/02-modale-nuova-sessione.png`, `codex/03-codex-app.png` (progetti).

**F1.** Resta una modale grande o diventa una pagina? — *Consiglio:* modale, ma in due passi invece che due colonne dense.
**F2.** Primo passo «dove», secondo «come»? — *Consiglio:* sì: oggi chiediamo tutto insieme e la modale è piena.
**F3.** Le cartelle recenti restano in cima? — *Consiglio:* sì, sono la scorciatoia più usata.
**F4.** Le scelte rapide (Desktop, Download, Documenti) restano? — *Consiglio:* solo se sono davvero usate: oggi sono cartelle di Windows, non «più usate».
**F5.** Mostriamo i progetti (cartelle già usate) come Codex? — *Consiglio:* sì, con quante sessioni ognuno.
**F6.** L'albero delle cartelle resta dentro la modale? — *Consiglio:* sì, ma più stretto: oggi occupa metà schermo per una cosa che si fa una volta.
**F7.** Si può incollare un percorso? — *Consiglio:* sì, campo in cima (c'è già).
**F8.** La cartella scelta si vede accanto al pulsante di conferma? — *Consiglio:* sì: oggi è in basso a sinistra, lontana dal pulsante che la usa.
**F9.** Avvisiamo se la cartella è enorme (radice di un disco, Desktop, Home)? — *Consiglio:* sì, con il motivo: è la causa di due guasti veri.
**F10.** Diciamo quanti file ha la cartella scelta? — *Consiglio:* sì, in modo approssimato e non bloccante.
**F11.** Il modello si sceglie qui o dopo? — *Consiglio:* qui, con il valore di default già scelto e cambiabile in chat.
**F12.** Il cursore del ragionamento resta? — *Consiglio:* sì, è buon design: è una scala vera con i nomi.
**F13.** «Mostra ragionamento» resta un interruttore? — *Consiglio:* sì, ma sposta in impostazioni: qui è rumore.
**F14.** Il planner opzionale resta nella creazione? — *Consiglio:* no: diventa un modello ausiliario nelle impostazioni.
**F15.** Le quattro carte del permesso restano nella creazione? — *Consiglio:* sì, è il momento giusto per scegliere.
**F16.** Il default è Workspace write? — *Consiglio:* sì, mai Full access.
**F17.** Si può dare un nome alla sessione da qui? — *Consiglio:* no: il titolo lo scrive il primo messaggio (già facciamo).
**F18.** Si può partire da una sessione esistente (fork)? — *Consiglio:* sì, voce «continua da…».
**F19.** Si può scegliere un ramo git? — *Consiglio:* sì se il workspace è un repo, con il ramo corrente mostrato.
**F20.** Avvisiamo se ci sono modifiche non committate? — *Consiglio:* sì, in piccolo: è il momento in cui conta.
**F21.** I repo annidati si segnalano qui? — *Consiglio:* sì, con «fiducia separata».
**F22.** Il comando di prova (suite di test) si imposta qui? — *Consiglio:* sì, con rilevamento automatico e possibilità di correggere.
**F23.** Si vede quanto contesto occuperà l'insieme di attrezzi? — *Consiglio:* sì, una riga: «43 attrezzi, ~7,5k token per giro».
**F24.** Si possono spegnere attrezzi già da qui? — *Consiglio:* no: troppa scelta nel momento sbagliato. Si fa dopo, in Capability.
**F25.** Il pulsante finale nomina la cartella? — *Consiglio:* sì, già facciamo ed è giusto.
**F26.** Si può annullare senza perdere la scelta? — *Consiglio:* sì, la modale ricorda l'ultima configurazione.
**F27.** Serve un «riapri l'ultima sessione» in evidenza? — *Consiglio:* sì, in cima allo stato vuoto.
**F28.** Quando la sessione è pendente, si vede nella sidebar? — *Consiglio:* sì, già fatto oggi.
**F29.** Si può creare una sessione senza cartella? — *Consiglio:* no: senza workspace metà attrezzi non ha senso, e va detto.
**F30.** Il primo messaggio suggerito dipende dal progetto? — *Consiglio:* sì, come nello stato vuoto.

---

## G · VISTE DELLA SESSIONE: BOARD, TERMINALE, COLONNA DI DESTRA, ALBERO (30)

Prove: `talos-v2/33-vista-terminale.png`, `34-vista-board.png`, `28-albero-sessione.png`, `51…53-context-rail-*.png`, `23-foglio-ambiente.png`, `25-foglio-controllo.png`.

**G1.** Chat, Terminale e Board restano tre schede in alto? — *Consiglio:* sì, ma con il nome scritto e non solo l'icona.
**G2.** La Board diventa una destinazione di sidebar? — *Consiglio:* sì: è un cruscotto, non una vista della sessione corrente.
**G3.** La Board mostra le sessioni come righe o come carte? — *Consiglio:* righe: sono dati, e le carte sprecano spazio.
**G4.** Quali colonne? — *Consiglio:* titolo, stato, modello, giri, token, ultima attività, cartella.
**G5.** Le colonne si ordinano? — *Consiglio:* sì, e la scelta si ricorda.
**G6.** Si filtra per stato? — *Consiglio:* sì, con pastiglie in cima (in corso, conclusa, errore, interrotta).
**G7.** La Board mostra il costo? — *Consiglio:* sì, stimato e dichiarato tale.
**G8.** Il terminale resta una vista a schede? — *Consiglio:* sì, ed è la riga W1-01 (più schede).
**G9.** Il terminale mostra da quale cartella parte? — *Consiglio:* sì, sempre visibile.
**G10.** Il terminale dice se è isolato (WSL) o no? — *Consiglio:* sì: è una promessa di sicurezza, va vista.
**G11.** La colonna di destra resta con tre schede? — *Consiglio:* sì, ma rinominate: «Contesto», «File toccati», «Sotto-agenti».
**G12.** «File» mostra l'albero o i file toccati dal giro? — *Consiglio:* i file toccati, con l'albero dietro un interruttore: è la domanda vera durante un lavoro.
**G13.** Si vede la differenza di un file dal pannello? — *Consiglio:* sì, prima/dopo, è già in Review.
**G14.** La scheda Ambiente resta un foglio o entra nella colonna? — *Consiglio:* entra nella colonna: è contesto, non una finestra.
**G15.** Mostriamo ramo, worktree e repo annidati sempre? — *Consiglio:* sì, in tre righe compatte.
**G16.** Il Control plane resta un foglio separato? — *Consiglio:* diventa la pagina Doctor nella sidebar.
**G17.** L'albero della sessione resta un foglio? — *Consiglio:* sì, ma raggiungibile anche dalla colonna di destra.
**G18.** L'albero mostra i fork? — *Consiglio:* sì, già fa: va solo reso leggibile.
**G19.** Si vede il consumo per giro nell'albero? — *Consiglio:* sì, token e giri per nodo.
**G20.** Il registro dei processi dove vive? — *Consiglio:* nella colonna di destra, scheda «Processi», accanto ai file.
**G21.** I processi mostrano durata ed esito? — *Consiglio:* sì, e l'avviso di stallo quando tacciono.
**G22.** Le approvazioni in attesa si vedono fuori dalla chat? — *Consiglio:* sì, con un contrassegno sulla sessione nella sidebar.
**G23.** La Review resta una vista separata? — *Consiglio:* sì, è la nostra e funziona.
**G24.** La Review si apre da tastiera? — *Consiglio:* sì, con una scorciatoia dichiarata.
**G25.** Le automazioni diventano una destinazione? — *Consiglio:* sì, come «Programmate» di Codex.
**G26.** Le automazioni mostrano la storia delle esecuzioni? — *Consiglio:* sì, è la riga W2-02.
**G27.** Serve una vista «tutti i file toccati oggi»? — *Consiglio:* sì, ma dopo: è comoda, non urgente.
**G28.** Le sessioni interrotte si distinguono dalle concluse? — *Consiglio:* sì, già facciamo con lo stato.
**G29.** Il pannello notifiche elenca cosa aspetta te? — *Consiglio:* sì, e solo quello.
**G30.** La barra di stato in fondo resta? — *Consiglio:* sì, ma deve dire il vero: oggi mostra il consumo della sessione precedente su una sessione nuova.

---

## H · DOCTOR, ERRORI, PRIMO AVVIO, VOCE DELL'INTERFACCIA (30)

Prove: `codex/01-doctor.txt` (197 righe), `talos-v2/25-foglio-controllo.png`, `talos-v2/01…04-intro-*.png`, `hermes-v3/10-impostazioni-safety.png`.

**H1.** Il Doctor diventa una pagina? — *Consiglio:* sì, con i controlli raggruppati.
**H2.** Ogni controllo ha una severità (ok, nota, avviso, guasto)? — *Consiglio:* sì, come Codex.
**H3.** C'è un conteggio finale per severità? — *Consiglio:* sì: «21 ok · 2 avvisi · 0 guasti» si legge in un secondo.
**H4.** Ogni avviso dice cosa fare? — *Consiglio:* sì, la riga di rimedio è la cosa migliore del loro Doctor.
**H5.** Il rimedio è eseguibile con un pulsante? — *Consiglio:* dove è sicuro sì (riavvia il server, apri la cartella), altrimenti mostra il comando.
**H6.** Il Doctor dice quanto spazio occupa l'app? — *Consiglio:* sì: loro dichiarano 2,17 GB di rollout, noi non diciamo niente sullo store.
**H7.** Il Doctor si esporta in JSON? — *Consiglio:* sì, per incollarlo in una segnalazione.
**H8.** Il Doctor si apre da solo quando qualcosa è rosso? — *Consiglio:* no: contrassegno sì, apertura automatica no.
**H9.** Mostriamo la versione del server e della pagina? — *Consiglio:* sì, ed è la riga W0-09: oggi una pagina nuova su un server vecchio dice «Risorsa non trovata».
**H10.** Il disallineamento propone il riavvio? — *Consiglio:* sì, con il pulsante.
**H11.** Gli errori dicono cosa fare o solo cosa è successo? — *Consiglio:* entrambi, in due frasi.
**H12.** Un errore mostra mai un blocco JSON? — *Consiglio:* mai in prima battuta; dietro «dettagli tecnici» sì.
**H13.** Gli errori hanno un codice citabile? — *Consiglio:* sì, piccolo e copiabile.
**H14.** «Giri esauriti» resta un errore? — *Consiglio:* no, è una nota con la diagnosi (già fatto oggi).
**H15.** Le note di sistema in chat si distinguono dai messaggi? — *Consiglio:* sì, e non usano la faccia dell'assistente.
**H16.** L'intro al primo avvio resta a quattro passi? — *Consiglio:* sì, ma saltabile e ripetibile dalle impostazioni.
**H17.** L'intro parte solo se manca qualcosa? — *Consiglio:* sì, già fa.
**H18.** L'intro chiede la chiave o offre il modello locale? — *Consiglio:* entrambi, con il locale in evidenza: è la nostra differenza.
**H19.** Alla fine dell'intro si apre una sessione? — *Consiglio:* sì, con un compito di esempio pronto.
**H20.** Diciamo cosa NON facciamo (niente telemetria, niente cloud)? — *Consiglio:* sì, una riga nell'intro: è un vantaggio vero.
**H21.** La lingua dell'interfaccia è italiana ovunque? — *Consiglio:* sì; le descrizioni che vanno al modello restano in inglese e si dichiara perché.
**H22.** I nomi tecnici spariscono da ogni schermo? — *Consiglio:* sì (già in corso), con una mappa unica.
**H23.** Le maiuscole tutte-in-alto restano? — *Consiglio:* sì ma solo per le etichette di sezione, mai per i contenuti.
**H24.** I numeri hanno sempre un'unità? — *Consiglio:* sì: «13 giri», «7,5k token», mai un numero nudo.
**H25.** Le stime sono marcate come stime? — *Consiglio:* sì, sempre la parola «stima».
**H26.** I tempi sono assoluti o relativi? — *Consiglio:* relativi fino a 24 ore, poi la data.
**H27.** Serve una modalità ad alto contrasto? — *Consiglio:* sì, dopo il redesign, come tema aggiuntivo.
**H28.** Tutto è raggiungibile da tastiera? — *Consiglio:* sì, ed è un cancello del redesign, non un extra.
**H29.** Il focus è sempre visibile? — *Consiglio:* sì, anello ambra su fondo scuro.
**H30.** Rispettiamo «riduci il movimento»? — *Consiglio:* sì, già lo facciamo per lo sfondo: va esteso a tutto.

---

## Come rispondere

Segna solo i numeri dove vuoi qualcosa di diverso dal consiglio (per esempio: «A5 raggruppa sempre
per progetto · C14 sì al mercato · F16 default On request»). Tutto il resto lo prendo come approvato
e diventa il mockup.
