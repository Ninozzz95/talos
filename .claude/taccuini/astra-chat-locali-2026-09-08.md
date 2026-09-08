# Ispezioni chat e locale — 08/09/2026

Immagini aperte singolarmente con view_image. Cartella `scratchpad/prove/foto/astra-chat-locali-20260908/`.

| Immagine | Giudizio visivo |
|---|---|
| red-1.png | Stop presente, nessuna attesa sotto il messaggio. Difetto confermato. |
| red-2.png | Testo precedente visibile, ragionamento nuovo scomparso. Difetto confermato. |
| red-3.png | Sessione chiusa con attesa «preparando» ancora presente. Stato contraddittorio. |
| red-4.png | Chat lunga a 1024, nessun ritorno al fondo sopra il composer. |
| red-5.png | Chat lunga a 1440, ritorno al fondo assente nello storico. |
| red-6.png | Chat lunga a 1280, spazio del ritorno al fondo privo del controllo. |

I toast di riconnessione nelle prime immagini provengono dalla fixture SSE finita; non sono presentati come esito di un'inferenza reale.

| Immagine | Giudizio visivo |
|---|---|
| green-attesa-ritrovata.png | Ragionamento ritrovato sotto il messaggio, Stop coerente e riga leggibile. |
| green-torna-in-fondo-1440.png | Pulsante rotondo centrale sopra il composer; contorno e freccia leggibili. |
| green-torna-in-fondo-1280.png | Pulsante accessibile nella colonna stretta; flottante sullo storico come previsto. |
| green-torna-in-fondo-1024.png | Pulsante interamente visibile, separato dal composer anche senza colonna destra. |
| live-fondo-1440.jpg | Cattura durante adattamento del viewport, incompleta; non usata come prova finale. |
| live-fondo-1440-stabile.jpg | Tema scuro reale: pulsante coerente, composer libero, testata su una riga. |
| live-consegna-fondo.jpg | Dopo riavvio 4174: controllo presente sopra il composer, leggibile nel tema scuro. |

Verifica live in sola lettura sulla 4174: «Vai al giro 1» porta allo storico; clic su «Torna in fondo alla conversazione» raggiunge il fondo (scarto subpixel -0,667 px) e nasconde il controllo. Nessun messaggio inviato, nessuna sessione creata. Le tre larghezze sono coperte dalle fotografie automatiche del frontend di produzione con dati controllati.
