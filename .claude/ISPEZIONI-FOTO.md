
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
