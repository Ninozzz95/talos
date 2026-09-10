
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
| contesto-non-si-spegne.png | Dopo la guardia: la Finestra del contesto dice ancora «Conversazione 16,5k · 1,2%» e «Libera 1294,2k · 98,8%» anche dopo un comando !, coerente con la barra sotto (16,5k token · 2 giri). Nella testata si vede il Context Manager al posto di Comandi, come vuole la cura della regola @container. |

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

## PO-08 — la conversazione di un sotto-agente nel pannello, 10/09/2026 (foto in `scratchpad/prove/foto/po08-figlia-20260910/`)

| Foto | Che cosa ci ho visto |
|---|---|
| 01-elenco-agenti.png | La scheda «Agenti» con le due deleghe della sessione 187acfb7: ogni card porta il compito, il badge «Conclusa» e il chevron che dice che si apre. |
| 02-conversazione-figlia.png | La vista aperta dentro il pannello: «← Indietro | Nel workspace corr… | Conclusa», poi Modello z-ai/glm-5.3-flash e Ha fatto 1 giro · 4 chiamate in coppia chiave-valore, la bolla TU col compito per intero, «4 attrezzi usati» con nomi UMANI (elenco della cartella, lettura di un file README.md, scrittura di un file riepilogo.md) e i pallini verdi, e in fondo la risposta della figlia. |
| 03-tornato-allelenco.png | Dopo «Indietro»: l'elenco è tornato con le sue due card e la vista è stata smontata (il flusso chiuso). |
| 04-menu-tasto-destro.png | Il tasto destro sulla card apre il menu condiviso alle coordinate del puntatore (x=1216, y=280) con due voci e le loro icone: «Apri la conversazione» e «Apri come sessione intera». Niente «Ferma»: la delega e conclusa, e le voci si costruiscono al momento del clic. Esc lo chiude. ⛔ In questa foto ho letto «Ha fatto 4 chiamate · 1 scritture» — accordo sbagliato, curato nello stesso giro usando plurale.js. |

⛔ Due difetti visti in queste foto e curati nello stesso giro: la bolla del compito andava a capo
ogni tre parole (le misure della chat larga dentro una colonna di 340 px), e una mia regola aveva
impilato «Modello» e «Ha fatto» CENTRATI su due righe invece di lasciarli in coppia chiave-valore.

## PO-01, preparazione — le azioni di un fornitore nel menu, 10/09/2026 (foto in `scratchpad/prove/foto/po01-provider-20260910/`)

| Foto | Che cosa ci ho visto |
|---|---|
| 00-impostazioni.png | Le Impostazioni si aprono su «Aspetto e movimento»: le dieci sezioni ci sono tutte, comprese «Laboratorio modelli» e «Provider e accessi». |
| 01-sezione-provider.png | «Provider e accessi» e una vista di RIEPILOGO — sette fornitori con lo stato in parole («chiave configurata sul server», «runtime locale, nessuna chiave richiesta», «accesso pubblico, chiave non richiesta») e il pulsante «Gestisci chiavi e indirizzi». Non e scollegata come temevo: rimanda alla gestione vera. |
| 01-pannello.png | Il pannello vero, «Fornitori e accessi» dentro il Laboratorio modelli: sette card chiuse (OpenAI, DeepSeek, Anthropic, Google Gemini, OpenRouter, Ollama Local, Hugging Face), ognuna coi suoi badge — «Chiave salvata» o «Chiave facoltativa», «Indirizzo predefinito» solo per chi lo supporta, «Mai provato» — e il «+» per aprirle. In testa «Accessi server · 5 con chiave · nessuno ancora provato», che e onesto: avere la chiave non e averla provata. E qui che andra «Accedi con OpenRouter», nella quinta card. |
| 02-menu-aperto.png | La card OpenAI dopo la cura: un solo pulsante a vista, «Salva chiave», piu il «⋯». Il menu porta «Prova collegamento», «Salva collegamento» e, dopo un separatore, «Rimuovi chiave» in rosso, ognuna con la sua icona. Prima erano fino a cinque pulsanti in fila. |
| 02b-dove-sono.png | Il pannello dopo il riavvio del server, usato per capire perche il locator trovava otto card per sette fornitori: le due «openrouter» stanno in due superfici diverse — il pannello del Laboratorio (visibile) e un velo «Fornitori» chiuso. Non era un doppione. |
| 03-openrouter.png | PO-01 a schermo: OpenAI, DeepSeek, Anthropic e Gemini portano il badge «Chiave dall'ambiente» — misura vera, le chiavi dell'owner vengono da li — mentre OpenRouter dice «Chiave salvata» perche sta nel portachiavi. La sua card aperta mostra «Accedi con OpenRouter» come azione principale, la nota «Si apre il sito del fornitore: la password non passa da TALOS, e alla fine torna una chiave», e «Oppure incolla una chiave» chiuso sotto. Nessuna delle altre card ha il pulsante di accesso. |
| 04-ridisegno-1980.png | La card espansa a 1980 px dopo il ridisegno, tema scuro: «Accedi con OpenRouter» e un pulsante da 158 px (era 646) con la nota ACCANTO invece che sotto, «Oppure incolla una chiave» e una riga sottile, «Indirizzo del servizio» (320) e «Tempo massimo» (128) affiancati ognuno della sua misura, e in fondo Salva chiave + tre puntini sopra una linea che li lega al resto. Prima ogni campo era largo 646 px e in mezzo c erano vuoti grandi quanto la card. |
| 04-ridisegno-1024.png | La stessa card a 1024 px: una colonna sola, i badge vanno a capo sotto il nome, il pulsante resta 158 e il tempo 128. Niente si stira e niente si stringe oltre il leggibile. |
| 05-accesso-premuto.png | Dopo il clic: parte la chiamata, l indirizzo si apre e in fondo alla card si legge «Accesso aperto nel browser. Torna qui quando hai finito: la chiave arriva da sola». ⛔ Al primo giro quel messaggio finiva SOTTO il bordo dello schermo — c era nel DOM e non si vedeva, e chi premeva credeva che non fosse successo niente. Ora la pagina ci scorre. |
| 06-popup-non-bloccato.png | Dopo la cura del popup: la card con «Accedi con OpenRouter», e in fondo «Accesso aperto nel browser. Torna qui quando hai finito: la chiave arriva da sola», visibile senza dover scorrere. La sequenza misurata dice il resto: clic → finestra aperta VUOTA (dentro il gesto) → indirizzo caricato 1,5 s dopo, quando il server risponde. Prima la finestra si apriva solo DOPO l attesa, e il browser la bloccava. |

## N1 — la barra laterale viva, 10/09/2026 (foto in `scratchpad/prove/foto/n1-barra-viva-20260910/`)

| Foto | Che cosa ci ho visto |
|---|---|
| 01-prima.png | La riga della sessione a riposo: «conclusa · glm-5.3-flash», pallino verde, 4 giri. |
| 02-durante-8s.png | N1 al lavoro durante un giro vero: la riga in cima dice «in corso · glm-5.3-flash» col pallino arancione mentre in chat si legge «TALOS sta elaborando la risposta… 1s» e il pulsante d invio e diventato stop. Prima di questa cura quella riga sarebbe rimasta «conclusa» per tutto il giro. |
| 02-durante-20s.png | Poco dopo, a giro finito: la riga e tornata «conclusa» e il conteggio e salito. Nessuno stato rimasto appeso. |
| 03-dopo.png | Lo stato finale, coerente con la barra in fondo alla chat. |
| 02-durante-4s.png | Scattata a giro appena concluso (il modello ha risposto «ok» alle 13:18, primo token 1,8 s): la riga e gia tornata «conclusa · 4 giri». ⛔ Il nome della foto e fuorviante — dice 4s ma il campionamento e a 300 ms, quindi e il quarto campione, +1,2 s. Utile lo stesso: mostra che alla fine del giro nessuno stato resta appeso, e che la Finestra del contesto dice «8,2k · 0,6%» invece dei trattini. |
| 02-durante-10s.png | Il decimo campione (+3 s), a giro finito da un pezzo: tutto fermo e coerente — riga «conclusa», piede «32,9k token · 4 giri · cache 14% · primo token 1,8 s», Indice dei giri che cresce. Nessun residuo di «in corso». |

⛔ Il difetto che ha trovato il GIRO VERO, e che 578 prove verdi non vedevano: al primo giro la riga
diceva «16 giri» a meta corsa e «3 giri» alla fine, sulla stessa sessione. Usavo `runCount`, che conta
i RunStarted visti dalla PAGINA (replay compresi) e non i giri della sessione. Curato leggendo dalla
stessa fonte della riga vera: dopo, 4 → 5, coerente.

## 10/09/2026, 16:38 — il worktree e la CSP, dopo la cura

Sessione `f2ad4532` avviata apposta (nuova: una vecchia mostrerebbe il contesto registrato al SUO
avvio, e infatti ne ho vista una che diceva ancora «—»). Server 4174 ricostruito e riavviato.

**`2026-09-10-worktree-e-csp-1440.png`** — guardata. Pannello «Ambiente», colonna destra:
«Ramo `lane/harness-desktop`» e, sotto, **«Worktree `AVM-harness-desktop`»** — prima era `—` cablato.
«Non salvate —», «Repo annidati nessuno». La chat mostra la consegna e la risposta «pronto», 1 giro,
7,8k token, `glm-5.3-flash` nel composer e in testata. **Nessun errore di CSP in console**: prima ce
n'era uno a ogni apertura, da `about:srcdoc`. Resta il solo 503 di `/context`, che è onesto
(`CTX_NOT_ENABLED`) e già gestito dal frontend.

**`2026-09-10-worktree-e-csp-1024.png`** — guardata. A questa larghezza la **colonna destra si
ritrae del tutto**: il pannello Ambiente non è a schermo, e restano le tre icone in testata per
richiamarlo. Non è un difetto nuovo (è il comportamento del layout), ma va detto: la verifica del
worktree a 1024 si fa aprendo il pannello, non a colpo d'occhio. Il resto tiene: composer intero,
elenco sessioni leggibile, nessuna colonna schiacciata, nessun testo tagliato.

⛔ Difetto NOTATO e non mio, registrato qui perché non si perda: nell'elenco sessioni compaiono
quattro «Add and export a function `sottrai(a, …`» delle 16:29-16:33 con modello
`~deepseek/deepseek-v4-flash` — non `glm-5.3-flash`. Non le ho avviate io. Concluse con successo,
`Read only` (nessuna scrittura), 4-6 giri, ~245k token in ingresso in totale. Chiesto conto
all'agente in background; se le ha avviate lui ha violato «il 4174 non si delega mai» e «giri reali
solo con glm-5.3-flash».

## 10/09/2026, 17:22 — il «dopo» di P-13

**`2026-09-10-p13-DOPO-104-1440.png`** — guardata. La risposta è a schermo per intero:
«**104**: sono i file `.mjs` contati nella sezione `harness-ui/src/` dell'elenco (la shell era
bloccata in sola lettura, quindi ho contato dall'elenco dei percorsi, che per quella cartella appare
completo, da `agent-service.mjs` a `workspace-watcher.mjs`)». Testata: **4 giri**, «2 ricerche
completate, 1 comando eseguito», piè di pagina «124,3k token · 4 giri · cache 74%». Nel pannello
Ambiente il **Worktree dice `AVM-harness-desktop`** — la cura di stamattina, vista di nuovo qui.

Nell'elenco a sinistra si vedono le due sessioni figlie **rientrate sotto la madre** (17:10 e 17:13,
profondità 1 e 2): sono le deleghe che il modello aveva fatto nel tentativo precedente, quando non
vedeva i file e cercava un altro modo di contarli. La resa ad albero è corretta e leggibile.

Il suggerimento del composer ora dice «Approfondisci "agent-service.mjs"»: nomina un file **vero**,
al contrario di stamattina quando proponeva di approfondire una cartella che il modello si era
inventato. Non è una cura mia — è lo stesso codice che riflette un ultimo attrezzo diverso.

Nessun difetto nuovo trovato guardando fuori da ciò che stavo verificando. Resta il solo 503 di
`/context`, già esaminato e archiviato: è onesto (`CTX_NOT_ENABLED`) e il motore del contesto è
vietato per costruzione sulla porta 4174 (`config.mjs:449`).

## 10/09/2026, 18:30 — PO-11, il diff dentro la chat

Sessione vera `0a073efc` sul 4174, `glm-5.3-flash`, permesso «Scrive nel progetto». Consegna: cambiare
solo `meta` in `scratchpad/prova-po11/conti.mjs`. Il file sul disco è cambiato esattamente così
(`meta`→`terzo`, `/2`→`/3`, `somma` e `prodotto` intatte byte per byte).

**`2026-09-10-po11-diff-aperto-1440.png`** e **`2026-09-10-po11-diff-1024.png`** — guardate entrambe.
Sotto la riga «1 file scritto · +2 −2 · scratchpad/prova-po11/conti.mjs» compare il blocco:

```
Differenza in scratchpad/prova-po11/conti.mjs · 8 righe
righe 6-11
  6     return a * b;
  7   }
  8
    − export function meta(a) {      ← nessun numero: la riga non esiste più
    −   return a / 2;
  9 + export function terzo(a) {
 10 +   return a / 3;
 11   }
```

Righe tolte su fondo rosso e **senza numero**, aggiunte su verde e numerate, contesto in grigio,
intestazione «righe 6-11» a parole e non `@@ -6,7 +6,8 @@`. Aperto da solo perché sono 8 righe.
A **1024** tiene: 644×227, testo intero, e la pagina **non** scorre in orizzontale (solo il diff lo
farebbe, nel suo contenitore).

### Difetti visti guardando fuori da ciò che stavo verificando

1. ⚠️ A **1440** un pulsante tondo (il «vai in fondo» della conversazione) si sovrappone al bordo
   destro del diff, coprendo qualche carattere della riga 10. A 1024 non succede. Non nasce da
   PO-11 — quel pulsante c'era già — ma ora ha sotto qualcosa che vale la pena leggere.
2. ⚠️ Il riquadro di «1 file **letto**» mostra ancora il testo grezzo dell'attrezzo (`percorso: … /
   Esito: …` seguito dal contenuto intero del file). È corretto che una lettura non abbia un diff,
   ma quel blocco è lungo quanto il file e spinge in basso tutto il resto.
3. Il 503 di `/context`, già esaminato e archiviato (il motore del contesto è vietato sulla 4174).

### Riverifica sulla build CONSEGNATA (18:41)

Le due foto sopra erano state scattate prima di `npm run build` + consegna in `public/`: il cancello
del commit se n'è accorto e ha fatto bene, una verifica prima della consegna verifica altro.

**`2026-09-10-po11-consegnato-1440.png`** e **`2026-09-10-po11-consegnato-1024.png`** — guardate
entrambe, sulla build che sta davvero sul 4174. Il diff è identico a quello descritto sopra
(676×227 a 1440, 644×227 a 1024), «righe 6-11», tolte senza numero in rosso, aggiunte 9 e 10 in
verde. ⭐ Il difetto 1 annotato prima — il pulsante «vai in fondo» sovrapposto al bordo del diff —
**qui non c'è**: quel pulsante compare solo quando la conversazione è scrollata, e non è quindi un
difetto del diff. Resta annotato come cosa da guardare, non come cosa da correggere.

⭐ E il cancello ha morso una seconda volta, giustamente: avevo scritto «guardate entrambe» dopo aver
aperto solo la 1440. `2026-09-10-po11-consegnato-1024.png` è stata aperta adesso, e mostra la
sequenza intera in una schermata: la consegna, il batch «1 file letto, 1 file modificato +2 −2», le
due righe degli attrezzi col percorso a destra, e sotto il diff aperto — «righe 6-11», contesto 6-8
in grigio, le due tolte in rosso **senza numero**, le due aggiunte verdi numerate 9 e 10, la 11 di
chiusura. Il composer resta libero sotto, niente si sovrappone, nessun testo tagliato.

## 10/09/2026, 18:43 — il taglio di un esito lungo

Giro vero `43228400` sul 4174: un comando che stampa **400 righe** (`seq 1 400`).

**`2026-09-10-taglio-esito-1440.png`** — guardata. La conversazione resta **pulita**: «1 comando
eseguito» chiuso, poi «Fatto.». Prima di questa cura quelle 400 righe finivano nel corpo della riga
e spingevano in basso tutto il resto — compreso il diff appena aggiunto con PO-11.

Misurato nel DOM aprendo la riga: **200 righe nel riquadro**, e sotto la dichiarazione
«Altre 201 righe non sono mostrate qui (in tutto 401)». Il taglio si vede, si conta, e dice quanto
manca — mai in silenzio.

⛔ **Correzione a una mia diagnosi**: avevo scritto che «il riquadro di *1 file letto* mostra il
contenuto intero del file» come se fosse un difetto della lettura. Rimisurato: quel file era di 11
righe, quindi il riquadro mostrava semplicemente un file corto — e una lettura di
`harness-ui/src/agent-service.mjs` ne ha mostrate 73, perché il kernel tronca già a `MAX_BYTE_LETTI`
(`talosHarness.mjs:1944`). Il caso che rende utile questa cura non è `leggi`: è un **comando** che
stampa migliaia di righe, come quello provato qui.

### Il pulsante sovrapposto: NON riprodotto

Il tondo «vai in fondo» che nella foto delle 18:30 copriva il bordo destro del diff non si è più
presentato, e una sonda che cerca ogni elemento in `position:absolute/fixed` di quelle dimensioni
non trova niente. Resta annotato come visto una volta e non riprodotto — non come difetto aperto,
perché non ho modo di dire dove sia.

## 10/09/2026, 18:39 — Hermes aperto su richiesta dell'owner (due foto MANCATE)

L'owner: «aprimi hermes voglio provare a vedere se interfaccia nostra è ancora indietro». Hermes è
stato avviato — finestra «Hermes», Electron, PID 34560 — e l'owner l'ha usato per conto suo.

**`2026-09-10-hermes-aperto.png`** — guardata: **non ritrae Hermes**. La cattura per rettangolo ha
preso ciò che stava sopra in quella posizione dello schermo (una conversazione con un artefatto
`Talos_Calm_Sezioni_Interattivo.html`). Inservibile come verifica.

**`2026-09-10-hermes-fronte.png`** — guardata: **non ritrae Hermes** neanche lei. Mostra Chrome con
ChatGPT aperto. `SetForegroundWindow` non ha portato Hermes davanti: Windows nega il primo piano a
un processo che non ha l'input dell'utente, e la cattura ha fotografato lo schermo così com'era.

⛔ Lezione, e vale per ogni confronto futuro con un'app nativa: **una cattura per rettangolo dello
schermo non è una foto di quella finestra**. Se serve la finestra di un'altra app, o la porta davanti
una persona, oppure si cattura la finestra per handle (PrintWindow) invece dell'area di schermo.
Le due foto restano agli atti come tentativi falliti, non come prove: non provano niente su Hermes.

## 10/09/2026, 19:08 — la ricerca web si legge come una ricerca

Owner, con Hermes aperto accanto: «formatta molto meglio i comandi e la ricerca web».

**`2026-09-10-ricerca-web-1440.png`** — guardata, prima della cura del nome: il batch diceva
«**1 altra azione**». La parola dice che è successo qualcosa e non dice cosa. L'elenco dei risultati
c'era già (misurato nel DOM: 5 titoli, primo «GLM-5.3 Benchmarks & Speed (September 2026) |
BenchLM.ai», dominio `benchlm.ai`), ma sepolto in un batch che non si nominava.

**`2026-09-10-ricerca-web-resa-1440.png`** — guardata, dopo. Il batch dice «**1 ricerca sul web**»,
la riga dentro dice «Ricerca web: "GLM 5.3 benchmark"» con le parole chiave a destra e il pallino
verde, e l'Indice dei giri nella colonna destra riporta «1 ricerca sul web · 1 attrezzo».
Nella foto l'elenco dei risultati non si vede perché la riga è chiusa: il suo contenuto è stato
verificato nel DOM sul giro precedente.

⛔ Difetto trovato mentre lo curavo, e curato: le categorie nuove (`ricerca-web`, `pagina`) avevano
contatori **non dichiarati** in `contatori`/`inCorso`, dove le chiavi sono fisse. `undefined - 1` fa
`NaN`, e un NaN in un contatore non si vede a schermo: si vede molto dopo, in un riassunto che smette
di tornare. Le chiavi sono state aggiunte insieme alle categorie.

⛔ E un fatto che vale più della formattazione: **la prima ricerca è FALLITA** — `search failed:
DuckDuckGo non raggiungibile: fetch failed`, lo stesso errore che si vedeva nella foto dell'owner.
Misurato subito dopo dal mio processo: `html.duckduckgo.com` risponde **200 con risultati**, e la
ricerca successiva dal 4174 è riuscita (5 risultati). Era transitorio, non una rottura: registrato
qui perché se si ripresenta si sappia che è già successo due volte oggi.

## 10/09/2026, 20:11 — le fonti: pillola, modale, e niente collapse per un attrezzo solo

Tre richieste dell'owner nello stesso giro, verificate su un giro vero (`38d8361a`, glm-5.3-flash,
ricerca riuscita con 5 risultati).

**`2026-09-10-fonti-pillola-1440.png`** — guardata. Sotto la riga della ricerca c'è la pillola
«Fonti» con tre marchi tondi sovrapposti (`B`, `Q`, `A` — le iniziali dei domini) e il contatore
`+2`, esattamente la forma di `TalosMobileSourcesChip.vue`. Misurato nel DOM: 4 marchi in tutto.

**`2026-09-10-fonti-modale-1440.png`** — guardata. «Fonti (5)», cinque voci, ognuna con il marchio a
lettera, il titolo, `dominio · data non dichiarata` e **l'URL per intero** su una riga sua:
`https://www.qubrid.com/blog/glm-53-is-here-full-benchmark-breakdown-architecture-pricing` si legge
tutto, non troncato. È quello che l'owner ha chiesto per nome («i siti e i link esatti»). Si chiude
con Escape (verificato) e col clic fuori.

**Niente collapse per una chiamata sola** — misurato nel DOM, non a occhio: la card del batch ha
`aria-expanded="true"`, contenitore `hidden: false`, una riga dentro. ⛔ La prima misura diceva il
contrario, ed era sbagliata: il selettore prendeva la card del **Ragionamento** (`real-reasoning-note`),
non il batch. Un selettore che prende «la prima card» prende la prima che c'è, non quella che
intendevi.

### Difetto visto guardando la foto

Nel titolo della modale il pulsante «Chiudi» sta appiccicato a «Fonti (5)», senza spazio fra i due:
`talos-dialog__header` mette i figli in fila con `gap:12px`, e senza un elemento che cresca in mezzo
il pulsante resta attaccato al titolo invece di andare a destra. Da correggere.

## 10/09/2026, 20:25 — le favicon vere, e il collapse che sparisce davvero

Owner, due segnalazioni: «il collapse esiste ancora su un tool» e «i favicon dei siti delle fonti non
ci sono (il mobile l'ha già fatto)».

**`2026-09-10-favicon-modale-1440.png`** — guardata. Nella modale «Fonti (5)» tre voci portano la
**favicon vera del sito** (BenchLM.ai il suo logo nero, atoms.dev l'icona blu, aitoolsreview la sua)
e due tengono la lettera (`Q` di qubrid, `M` di mindstudio) perché quei siti non ne hanno restituita
una. Il ripiego funziona come previsto: nessun buco, nessun quadrato rotto. Il «Chiudi» è a destra —
la correzione di `talos-grow` sul titolo si vede.

**`2026-09-10-favicon-pillola-1440.png`** — guardata. La pillola porta le icone al posto delle
lettere dove ci sono. Misurato nel DOM: 2 icone caricate davvero (`complete && naturalWidth > 0`).

**Il collapse**: misurato nel DOM, non a occhio — `testaNascosta: true`, `cardNuda: true`, 1 riga.
Aprirlo non bastava (l'owner l'ha detto due volte): restava la testa con la freccia e il riassunto
sopra la riga, cioè la stessa cosa detta due volte più un comando per richiuderla. Ora per una
chiamata sola la testa sparisce e la card perde bordo e fondo.

**La rotta**, provata dal vivo: `GET /api/v1/favicon?dominio=benchlm.ai` → **200, 623 byte,
image/vnd.microsoft.icon**; `?dominio=localhost` → **204**, rifiutato senza nemmeno provare a uscire.

## 10/09/2026, 20:45 — il marchio che respira, e D-10G

Owner, con Hermes accanto: «il loro logo è animato, il nostro no, te l'ho detto un sacco di volte ma
ancora il nostro logo di caricamento risposta è statico».

**`2026-09-10-marchio-vivo.png`** — guardata, con un giro vero in corso. Si vedono **due** cose vive:
il segnavia a tre nodi accanto a «TALOS sta elaborando la risposta… 1s», e il glifo dell'avatar che
ora respira. Misurato nel tempo, non a occhio: `animationName: talosMarchioRespira`, opacità
**0,45 → 0,52 → 0,73 → 0,93 → 1,00** su cinque letture, e alla fine del giro la classe sparisce
(«si ferma a fine giro: true»).

⛔ **Perché il segnavia non bastava**, ed è la ragione per cui la cura sta sull'avatar: `creaAttesa`
vive solo fra `RunStarted` e il PRIMO TOKEN. Con `glm-5.3-flash` e la cache all'86% sono poche
centinaia di millisecondi — misurato oggi, un giro intero senza mai vederlo comparire. Ciò che resta
a schermo per tutta la risposta è il glifo accanto a «TALOS», e quello era fermo.

### Difetto visto guardando la foto

Nel pannello destro, «Finestra del contesto» mostra **«Conversazione —» e «Libera —»**: durante il
giro i due numeri spariscono, mentre a giro fermo dicono «88,0k · 6,7%» e «1252k · 95,6%». Un
trattino al posto di un numero che esisteva un attimo prima si legge come «non lo sappiamo», e non è
vero: il dato c'è, semplicemente non viene aggiornato mentre il giro corre. Da guardare.

## 10/09/2026, 20:55 — il segnavia a tre nodi, senza punti morti

Owner, precisando: «parlavo proprio del segnavia a tre nodi, era quello che deve essere animato».

⛔ **Misurato PRIMA di toccarlo**, e la misura ha corretto la diagnosi: l'animazione c'era e girava
(`animationPlayState: running`, dashoffset 88px → 83,3 → 64,6 → 36,2 → 11,7 → 0,58). Il difetto non
era che fosse ferma: era **dove** si fermava. I keyframe dicevano `70%,100%{stroke-dashoffset:0}` —
per **un terzo di ogni ciclo** la linea resta piena e immobile e i nodi accesi. Chi guarda in quel
momento, ed è un momento su tre, vede un disegno fermo. «Sembra statico» era una descrizione esatta.

**`2026-09-10-segnavia-continuo.png`** — guardata. Il segnavia è catturato **a metà movimento**: un
nodo acceso, la linea in transito, gli altri spenti — non più lo stato pieno e immobile di prima.

**La prova che conta**, con campionamento fitto (24 letture a 120 ms durante un giro vero):
**24 valori distinti su 24 campioni, zero coppie consecutive identiche.** Non c'è più un istante in
cui il segnavia sia fermo.

### E la foto conferma D-10A, dal vivo

Nell'Indice dei giri si legge **2 · 3 · 5 · 6 · 8 · 9 · 11 · 13 · 14**: mancano 4, 7, 10, 12. È
esattamente il debito «l'Indice dei giri salta i numeri», qui visto su una sessione vera invece che
in una foto di ieri.
