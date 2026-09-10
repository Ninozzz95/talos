
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

<<<<<<< HEAD
## PO-06 — il `!` dal composer, 10/09/2026 (foto in `scratchpad/prove/foto/po06-shell-20260910/`)

| Foto | Che cosa ci ho visto |
|---|---|
| ingresso.png | L'app apre da sola la sessione conclusa più recente, composer visibile: `?session=` invece rompe l'avvio e il composer non nasce. |
| prima-01-chat-a-riposo.png | Stato di partenza: card «1 altra azione» chiusa, allegato .docx con Scarica, contesto 16,5k su 1294,2k liberi. |
| prima-02-dove-finisce.png | ⛔ Il difetto: dopo `!echo` la vista salta al Terminale, che mostra un prompt VUOTO — il comando non gira lì. In basso l'avviso «Comando inviato» promette una cosa che quella schermata non mostra. |
| prima-03-chat-dopo-il-comando.png | ⛔ In chat resta solo «1 comando eseguito», una card CHIUSA: né il comando, né l'output, né l'esito. Nel DOM il testo dell'esito misura 0×0. E la Finestra del contesto è passata a «− / −» mentre la barra sotto dice ancora 16,5k: due letture diverse dello stesso fatto. |
| dopo-01-chat-a-riposo.png | Stessa partenza dopo la cura, nessuna regressione visibile nella conversazione già presente. |
| dopo-02-dove-finisce.png | La cura: si resta in chat, bolla «TU · Comando eseguito da te» col comando in monospazio, card aperta, riga «Riuscito · in Linux (WSL), non su Windows · 2.0 s» e sotto il solo output. Nessun avviso a coprire l'angolo. |
| dopo-03-chat-dopo-il-comando.png | Tornando in chat a mano tutto resta al suo posto: la bolla e l'esito non dipendono dalla vista attiva. |
| contrario-01-comando-fallito.png | Il verso contrario: «1 comando eseguito (1 errore)», riga «Non riuscito · codice 1», pallino ROSSO e il messaggio di `cat` (che arriva da stderr) leggibile. ⛔ Difetto visto qui: la riga di stato è TRONCATA («non su Win…») perché il comando ripetuto a destra le ruba spazio. |
| contrario-02-cronologia.png | Il composer dopo le frecce: ↑ riporta il comando col suo `!`, ↓↓ torna al foglio bianco, e un messaggio normale su due righe resta intatto quando si preme ↑. |
| bolla-blocco-comando.png | La bolla come l'ha chiesta l'owner: intestazione «Comando» a sinistra e «Copia» a destra, il comando in monospazio dentro il blocco, e sotto la riga di stato con l'output. Prima le due etichette erano appiccicate («ComandoCopia»): le regole del blocco vivevano solo dentro il testo dell'assistente. |
| riga-intera-comando-fallito.png | La riga di stato non si tronca piu: «Non riuscito · codice 1 · in Linux (WSL), non su Windows · 214 ms» per intero, pallino rosso, comando nel blocco con Copia e l'errore di cat leggibile sotto. |
| context-manager-pulsante-assente.png | Dopo il merge: nella testata della chat ci sono ramo, comandi, layout e play — il pulsante Context Manager NON c'e. Non e un problema del merge: una regola @container lo nasconde sotto gli 820px, e col pannello destro aperto la colonna centrale ne misura 824. |
| context-manager-modale-1024.png | Alla viewport laptop, quella dove il pulsante spariva: ora c'e e la modale si apre — «CONTESTO DELLA CHAT · Context Manager · Solo questa chat. Gli originali restano disponibili», con Gestisci automaticamente spuntato, le tre misure a «Non disponibile» e la frase onesta «Context Manager non e ancora attivo per questa conversazione». Il fumetto in alto e il NOSTRO tooltip a tema, verificato: al passaggio del mouse il title viene migrato in data-tip. |
| context-manager-modale-1440.png | Stessa modale a schermo largo, 760x746: nessuna differenza di composizione, e la testata non trabocca (824 su 824). |

⛔ Difetti annotati e NON ancora curati, visti in queste foto: la riga di stato troncata dal comando
ripetuto a destra; la Finestra del contesto che si spegne a «− / −» dopo un comando diretto mentre la
barra in basso dichiara ancora i token; i numeri dell'Indice dei giri che saltano (2, 3, 5, 6, 8…).
=======
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

## 09/09/2026 — F5c punto 2, la misura nella modale (Claude)

Processo desktop isolato, chat fixture, misura SEMINATA nello SQLite dal test (3200 / 16.384, riserva 2048,
metodo «motore», esatto, misurata alle 08:05Z): è una fixture dichiarata, non un conteggio reale — prova
che la modale mostra il dato quando esiste, non che il kernel lo produca (quello lo provano i test del motore).
- `tcec-desktop-measure-1920x1080.png` — aperta: la riga dice «3200 / 16.384 token — Conteggio del motore (esatto) · misurata alle 10:05», la barra sotto è al 20%, i tre valori sono numeri veri e non più «Non disponibile»; l'ora è quella locale della misura seminata (08:05Z → 10:05).
- `tcec-desktop-measure-2560x1440.png` — aperta: stessa riga e stessi numeri, modale centrata, la barra di avanzamento della compattazione «Completati 1 di 3» sotto la misura è coerente con la fixture.
- `tcec-desktop-measure-3840x2160.png` — aperta: identica composizione a 4K; dietro la modale si vede la barra «Compattazione contesto in corso» nella chat, coerente con lo stato.
Non difetti, verificati: «3200» e «2048» senza separatore delle migliaia contro «16.384» con — è la regola CLDR dell'italiano (raggruppa da cinque cifre in su), non un'incoerenza del formato. Nessuna dicitura «cambiato dopo la misura» perché la revisione coincide: giusto così.

## 09/09/2026 — D1, i giri VERI su Context Manager con z-ai/glm-5.3-flash (Claude)

Processo desktop isolato, cronologia seminata di 40 scambi, un messaggio dal composer per giro. Ogni fotogramma «durante» è stato scattato ogni 4 secondi; i fotogrammi byte-identici sono dichiarati tali con l'hash e non riaperti. Tutti gli altri sono stati aperti uno per uno.

### Giro 1 (19:39) — il primo giro vero, morto su «La sintesi non dichiara testo e stato finale»
- `D1-01-prima-modale.png` — aperta: modale «Context Manager» con «Misura non ancora disponibile» tre volte, come atteso prima di qualunque richiesta; automazione spuntata
- `D1-03-dopo-chat.png` — aperta: carta di errore generica «Questa forma di errore non è ancora tradotta», barra «Compattazione non riuscita»; colonna destra dice «Finestra del contesto 1310,7k» contro i 16.384 del trial: due fonti di verità (registrato)
- `D1-04-dopo-modale.png` — aperta: misura 70.903 / 16.384 «Stima euristica · misurata alle 19:39» — il primo difetto (byte contati come token) letto a schermo; job «Compattazione non riuscita · La sintesi non dichiara testo e stato finale»
- `D1-02-durante-01.png` — aperta: t+4s, «TALOS sta elaborando la risposta…», barra «Compattazione contesto in corso» già presente sotto il messaggio
- `D1-02-durante-02.png` — aperta: t+8s, «Il modello ci sta ancora lavorando…», barra indeterminata
- `D1-02-durante-03.png` — aperta: t+12s, «Ci sta mettendo più del solito — resta in attesa…», sessione «in corso»
- `D1-02-durante-04.png` — aperta: t+16s, stesso stato, la barra resta indeterminata
- `D1-02-durante-05.png` — aperta: t+20s, stesso stato
- `D1-02-durante-06.png` — aperta: t+24s, la carta di errore «Il giro si è interrotto per un errore» sopra la barra «Compattazione non riuscita», sessione ancora «in corso»
- `D1-02-durante-07.png` — aperta: carta di errore, sessione passata a «errore», piede 6,0k token
- `D1-02-durante-08.png` — byte-identica a D1-02-durante-07.png (sha256 2f594498d62b), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-09.png` — byte-identica a D1-02-durante-07.png (sha256 2f594498d62b), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-10.png` — aperta: stato finale stabile: errore non tradotto («internal-error»), barra «Compattazione non riuscita» con pulsante Context Manager
- `D1-02-durante-11.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-12.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-13.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-14.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-15.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-16.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-17.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-18.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-19.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-20.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-21.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-22.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-23.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-24.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-25.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-26.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-27.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-28.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-29.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-30.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-31.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-32.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-33.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-34.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-35.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-36.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-37.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-38.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-39.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-40.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-41.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-42.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-43.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-44.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-45.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-46.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-47.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-48.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-49.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-50.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-51.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-52.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-53.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-54.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-55.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-56.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-57.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-58.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-59.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1-02-durante-60.png` — byte-identica a D1-02-durante-10.png (sha256 149e8e6cd7ed), stesso stato a schermo, verificata con l'hash e non riaperta

### Giro 2 (19:53) — dopo contatore e ragionamento: muore su «Una citazione non corrisponde agli originali»
- `D1b-01-prima-modale.png` — aperta: modale prima del giro: misura non disponibile, come atteso
- `D1b-03-dopo-chat.png` — aperta: carta di errore generica; piede 11,3k token (due tentativi di sintesi pagati)
- `D1b-04-dopo-modale.png` — aperta: misura 20.305 / 16.384 (contatore tarato: era 70.903); job fallito «Una citazione non corrisponde agli originali» — terzo difetto letto a schermo
- `D1b-02-durante-01.png` — aperta: t+4s, elaborazione e barra di compattazione presenti
- `D1b-02-durante-02.png` — aperta: t+8s, «Il modello ci sta ancora lavorando…»
- `D1b-02-durante-03.png` — aperta: t+12s, «Ci sta mettendo più del solito»
- `D1b-02-durante-04.png` — aperta: t+16s, stesso stato di attesa
- `D1b-02-durante-05.png` — byte-identica a D1b-02-durante-04.png (sha256 5923b74fb67d), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-06.png` — byte-identica a D1b-02-durante-04.png (sha256 5923b74fb67d), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-07.png` — aperta: carta di errore comparsa, sessione «in corso»
- `D1b-02-durante-08.png` — byte-identica a D1b-02-durante-07.png (sha256 e48f4936deec), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-09.png` — byte-identica a D1b-02-durante-07.png (sha256 e48f4936deec), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-10.png` — aperta: stato finale: errore, barra «Compattazione non riuscita», piede 11,3k token
- `D1b-02-durante-11.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-12.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-13.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-14.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-15.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-16.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-17.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-18.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-19.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-20.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-21.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-22.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-23.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-24.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-25.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-26.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-27.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-28.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-29.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-30.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-31.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-32.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-33.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-34.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-35.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-36.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-37.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-38.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-39.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-40.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-41.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-42.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-43.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-44.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-45.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-46.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-47.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-48.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-49.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-50.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-51.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-52.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-53.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-54.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-55.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-56.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-57.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-58.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-59.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1b-02-durante-60.png` — byte-identica a D1b-02-durante-10.png (sha256 447b812412ad), stesso stato a schermo, verificata con l'hash e non riaperta

### Giro 3 (20:02) — dopo le citazioni elise: muore su «La sintesi non è stata completata» (finish_reason length)
- `D1c-01-prima-modale.png` — aperta: modale prima del giro: misura non disponibile
- `D1c-03-dopo-chat.png` — aperta: carta di errore generica, barra «Compattazione non riuscita»
- `D1c-04-dopo-modale.png` — aperta: misura 20.305 / 16.384; job fallito «La sintesi non è stata completata» — quarto difetto (budget di uscita non dichiarato) letto a schermo
- `D1c-02-durante-01.png` — aperta: t+4s, elaborazione e barra presenti
- `D1c-02-durante-02.png` — aperta: t+8s, attesa
- `D1c-02-durante-03.png` — aperta: t+12s, attesa
- `D1c-02-durante-04.png` — aperta: t+16s, attesa
- `D1c-02-durante-05.png` — aperta: t+20s, attesa, stesso stato
- `D1c-02-durante-06.png` — byte-identica a D1c-02-durante-05.png (sha256 ce9380b00c41), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-07.png` — aperta: carta di errore comparsa
- `D1c-02-durante-08.png` — byte-identica a D1c-02-durante-07.png (sha256 15748dedab74), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-09.png` — byte-identica a D1c-02-durante-07.png (sha256 15748dedab74), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-10.png` — aperta: stato finale: errore, barra «Compattazione non riuscita», piede 11,2k token
- `D1c-02-durante-11.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-12.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-13.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-14.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-15.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-16.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-17.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-18.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-19.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-20.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-21.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-22.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-23.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-24.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-25.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-26.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-27.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-28.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-29.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-30.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-31.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-32.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-33.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-34.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-35.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-36.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-37.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-38.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-39.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-40.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-41.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-42.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-43.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-44.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-45.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-46.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-47.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-48.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-49.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-50.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-51.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-52.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-53.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-54.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-55.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-56.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-57.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-58.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-59.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta
- `D1c-02-durante-60.png` — byte-identica a D1c-02-durante-10.png (sha256 7b0c762eef36), stesso stato a schermo, verificata con l'hash e non riaperta

### Giro 4 (20:12) — dopo le QUATTRO cure: compattazione riuscita, risposta vera, tutte le foto aperte una per una
- `D1d-01-prima-modale.png` — aperta: modale prima del giro, «Misura non ancora disponibile» tre volte, automazione spuntata, come atteso
- `D1d-02-durante-01.png` — aperta: t+4s, «TALOS sta elaborando la risposta…», barra «Compattazione contesto in corso» indeterminata sotto il messaggio
- `D1d-02-durante-02.png` — aperta: t+8s, «Il modello ci sta ancora lavorando…», barra ancora indeterminata
- `D1d-02-durante-03.png` — aperta: t+12s, la barra è DETERMINATA a metà (1 segmento su 2 fatto), piede 10,5k token
- `D1d-02-durante-04.png` — aperta: t+16s, barra piena (2 su 2), piede 20,0k token: i due segmenti sono stati sintetizzati
- `D1d-02-durante-05.png` — aperta: t+20s, la barra è SPARITA e al suo posto c'è il separatore «Contesto compattato · Vedi contesto»; il modello è a «Ragionamento in corso», piede 24,0k
- `D1d-02-durante-06.png` — aperta: t+24s, separatore presente, ragionamento in corso, nessun doppione del separatore
- `D1d-02-durante-07.png` — aperta: t+28s, stesso stato, un solo separatore
- `D1d-02-durante-08.png` — aperta: t+32s, «Ragionamento in corso», separatore unico, piede fermo a 24,0k
- `D1d-02-durante-09.png` — aperta: t+36s, stesso stato di attesa della risposta
- `D1d-02-durante-10.png` — aperta: t+40s, stesso stato
- `D1d-02-durante-11.png` — aperta: t+44s, stesso stato, sessione ancora «in corso»
- `D1d-02-durante-12.png` — aperta: t+48s, stesso stato; la risposta arriva subito dopo (primo token a 61,2 s, misurato dal piede)
- `D1d-03-dopo-chat.png` — aperta: la risposta VERA di glm-5.3-flash in cinque punti sulle regole R1-R40 e il «prossimo passo più urgente»; sessione «conclusa · 1 giro»; piede «35,0k token · 1 giro · primo token 61,2 s»
- `D1d-04-dopo-modale.png` — aperta: «10.163 / 16.384 token — Stima euristica · misurata alle 20:12 · il contesto è cambiato dopo la misura» (la risposta è arrivata dopo la misura: giusto così), «Contesto aggiornato · Completati 2 di 2», automazione spuntata

Visto fuori dal compito, registrato e non curato qui: la colonna destra dice «Finestra del contesto 1310,7k · Conversazione 11k · 0,8%» — è la finestra del CATALOGO, mentre la modale usa i 16.384 del profilo di prova: due fonti di verità sullo stesso schermo. E il primo token a 61,2 s è il costo della strada sincrona (la chat aspetta la compattazione quando il contesto non entra): accettabile per la prova, da misurare prima dell'attivazione.
>>>>>>> codex/talos-context-engine
