
## Immagini chat — 08/09/2026, verifica Astra
Copie byte-identiche delle catture recenti sul server 4174. Originali e manifest conservati in .claude/immagini/immagini-chat-2026-09-08. Aperte personalmente con view_image prima della copia.
- chat-1080p-verificata.png: 1920×1080; scheda integra fuori dalla bolla, figura riconoscibile, composer e dettagli raggiungibili.
- dialogo-1080p-verificata.png: 1920×1080; dialogo centrato, immagine intera senza ritaglio, chiusura visibile e focus restituito.
- chat-1440p-verificata.png: 2560×1440; scheda integra fuori dalla bolla, figura riconoscibile, composer e dettagli raggiungibili.
- dialogo-1440p-verificata.png: 2560×1440; dialogo centrato, immagine intera senza ritaglio, chiusura visibile e focus restituito.
- chat-4k-verificata.png: 3840×2160; scheda integra fuori dalla bolla, figura riconoscibile, composer e dettagli raggiungibili.
- dialogo-4k-verificata.png: 3840×2160; dialogo centrato, immagine intera senza ritaglio, chiusura visibile e focus restituito.

## Consumi Context Engine — 09/09/2026, istanza isolata

Catture aperte personalmente con view_image: chat fixture sul backend HTTP/SQLite/SSE reale, nessuna inferenza. Il totale a piede chat è 2,0k token, 1 giro, cache 40%; la finestra del contesto conserva la misura del turno, 0,1k, senza sommarvi il consumo della sintesi. Separatore singolo e composer visibili. Copie byte-identiche, senza ritocchi.
- tcec-desktop-usage-1920x1080.png: tre colonne integre; contatore leggibile sotto composer; tooltip Context preesistente e toast di riconnessione non sovrappongono i controlli.
- tcec-desktop-usage-2560x1440.png: totale e separatore mantengono posizione coerente; nessun controllo tagliato; grandi spazi della chat breve, non contenuti fittizi.
- tcec-desktop-usage-3840x2160.png: larghezza del messaggio e composer contenuta anche su 4K; barra dei consumi presente, nessuna duplicazione del separatore.

## Context Compactor — 09/09/2026, istanza isolata

Screenshot aperti personalmente dopo la patch, runner desktop HTTP/SQLite reale con conversazione fixture e nessuna inferenza. L'owner ha richiesto prove separate dal 4174: la porta è effimera, non il server personale. Copie byte-identiche agli originali del runner, senza ritocchi. Il tema chiaro effettivo del browser è coerente con il tema del dialogo; le misure assenti restano dichiarate.

- tcec-desktop-small-1920x1080.png: dialogo centrato, messaggio di contesto insufficiente leggibile su due righe, pulsanti e chiusura raggiungibili, nessuna barra di progresso fittizia.
- tcec-desktop-small-2560x1440.png: stesso pannello e spaziatura, contenuto visibile senza sovrapposizioni, fatti/versioni/fonti distinti e footer integro.
- tcec-desktop-small-3840x2160.png: larghezza CSS coerente con la UI, nessun allargamento arbitrario del testo, controlli contenuti nel dialogo; immagine ispezionata e non dedotta dalla prova 1080p.

## Accesso pieno — 08/09/2026
- full-access-1080p.png: risposta completa e diff visibili, composer raggiungibile, titolo lungo correttamente troncato.
- full-access-1440p.png: lettura e scrittura esterne documentate in chat, nessuna sovrapposizione fra composer e risposta.
- full-access-4k.png: pagina completa nelle dimensioni vere, testata su una riga, dettagli e controllo Accesso pieno visibili.

## 09/09/2026 — F5c, le sei foto scattate da Astra alle 16:13 e mai annotate (crediti finiti)

Aperte da Claude il 09/09 alle 16:5x, tutte e sei, dopo aver preso in carico il lavoro. Provengono
dal processo desktop ISOLATO con chat fixture («fixture», modello `no-inference`): nessuna prova sul
4174, nessuna inferenza reale.

### La modale, tre risoluzioni — APERTE tutte e tre
- `tcec-manager-modal-1920x1080.png` — aperta: titolo «Context Manager», automazione spuntata, misure «Non disponibile», spiegazione del caso troppo breve leggibile.
- `tcec-manager-modal-2560x1440.png` — aperta: stessa composizione della 1080p, nessun elemento tagliato o sovrapposto.
- `tcec-manager-modal-3840x2160.png` — aperta: stessa composizione; la modale resta ~800 px come tutti i dialoghi, non si allarga col viewport.
La modale si chiama **«Context Manager»** (titolo, sopra l'eyebrow «Contesto della chat»): la
rinomina chiesta dall'owner è a schermo. «Gestisci automaticamente» è **spuntato** — l'automazione è
attiva di default, come deciso. Le tre misure (Token in ingresso · Finestra del modello · Riservati
alla risposta) dicono «Non disponibile» sotto «Misura non ancora disponibile»: non è un difetto della
foto, è il punto aperto n. 2 della consegna v004 (misura corrente da derivare dal corpo preparato),
dichiarato e non nascosto. «Nessuna compattazione in corso», «Compatta ora» / «Aggiorna», e sotto la
spiegazione del caso troppo breve («Non ci sono scambi precedenti da compattare mantenendo intero
l'ultimo scambio. Nessun messaggio è stato modificato.»): è il comportamento chiesto il 09/09
mattina, e non è un errore generico. Quattro sezioni chiuse: Da non dimenticare · Versioni · Fonti ·
Impostazioni avanzate. Le tre risoluzioni sono coerenti: stessa composizione, la modale non si
allarga col viewport (a 4K resta ~800 px, come tutti i dialoghi dell'app — non è un difetto di questa
modale). La maniglia di ridimensionamento in basso a destra tocca il bordo del pulsante «Chiudi»:
è la stessa forma degli altri dialoghi, la annoto e non la tocco qui.

### La barra nella chat, tre risoluzioni — APERTE tutte e tre
- `tcec-manager-progress-1920x1080.png` — aperta: «Compattazione contesto in corso» sotto l'ultimo scambio, barra a metà, pulsante «Context Manager» a destra.
- `tcec-manager-progress-2560x1440.png` — aperta: stessa barra e stesso testo, colonna destra coerente («finestra non dichiarata», «Libera –»).
- `tcec-manager-progress-3840x2160.png` — aperta: stessa composizione, piede «120 token · 1 giro · cache 40%» come nelle altre due.
A modale chiusa, la barra vive **nella chat**, sotto l'ultimo scambio: «**Compattazione contesto in
corso**» (la dicitura dell'owner delle 16:07, non più «Sintesi in corso»), barra di avanzamento
circa a metà, e a destra il pulsante «Context Manager» che riapre la modale. È esattamente il
collegamento persistente che la v004 dava per «ancora da completare». La colonna destra dice
«finestra non dichiarata» e «Libera –»: coerente con le misure non disponibili della modale, un solo
stato raccontato in due posti. Piede: «120 token · 1 giro · cache 40%» — è la chat fixture prima
della pubblicazione della sintesi, quindi i 2,0k della prova F5a non ci sono ancora e non devono
esserci. Le tre risoluzioni coincidono nella composizione.

Visto fuori dal compito, non un difetto di questa fetta: nella barra a sinistra le due sessioni si
chiamano entrambe «fixture» con la stessa ora «02:00» — è il dato della fixture, non un errore.

⛔ Cosa queste foto NON provano: che la barra sparisca alla fine con un solo separatore e i consumi
aggiornati (Astra stava verificando esattamente quello quando i crediti sono finiti). Lo prova la
suite browser `context-compactor.spec.mjs`, rilanciata da Claude dopo questa ispezione.
