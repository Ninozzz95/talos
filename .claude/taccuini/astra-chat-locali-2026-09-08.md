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
| torna-in-fondo-1920.png | Full HD 1920×1080: composer e ritorno centrati, nessuna sovrapposizione con le azioni. |
| torna-in-fondo-2560.png | QHD 2560×1440: misura della chat conservata, colonne e controllo rimangono allineati. |
| torna-in-fondo-3840.png | 4K 3840×2160: ampi margini coerenti con la misura fissa, ritorno al fondo presente. |

Dimensioni dei tre PNG verificate leggendo IHDR: esattamente 1920×1080, 2560×1440, 3840×2160. L'anteprima del tool riduce le due immagini maggiori a 2048px per mostrarle; i file originali non sono ridimensionati. Test di hit-test, tastiera, clic e geometria superati su tutte le sei viewport; 9/9 casi della suite estesa.

Verifica live in sola lettura sulla 4174: «Vai al giro 1» porta allo storico; clic su «Torna in fondo alla conversazione» raggiunge il fondo (scarto subpixel -0,667 px) e nasconde il controllo. Nessun messaggio inviato, nessuna sessione creata. Le tre larghezze sono coperte dalle fotografie automatiche del frontend di produzione con dati controllati.

## Hover: fotografie finali aperte e giudicate

| Immagine | Giudizio visivo |
|---|---|
| red-hover-fondo.png | Pulsante spostato a destra rispetto alla centratura, difetto riprodotto. |
| green-hover-fondo-1024.png | Centratura corretta, versione intermedia precedente al vincolo colore owner. |
| green-hover-fondo-1280.png | Testo visibile attraverso lo sfondo hover: risultato respinto e corretto. |
| green-hover-fondo-1440.png | Centratura corretta; colore intermedio non accettato per consegna. |
| final-hover-fondo-1024.png | Pulsante centrato e interamente visibile, sfondo opaco uniforme. |
| final-hover-fondo-1280.png | Testo sottostante coperto dal pulsante, freccia leggibile e posizione corretta. |
| final-hover-fondo-1440.png | Controllo sopra il composer, sfondo e bordo coerenti al riposo. |
| final-hover-fondo-1920.png | Full HD: margini regolari e pulsante centrale ben distinguibile. |
| final-hover-fondo-2560.png | QHD: misura del controllo conservata, nessuna sovrapposizione con composer. |
| final-hover-fondo-3840.png | 4K: allineamento conservato sulla colonna, freccia integra e sfondo uniforme. |
| live-hover-fix-consegna.jpg | Consegna 4174 scura Full HD: pulsante leggibile sopra il composer nello storico reale. |

Le altre fotografie green-hover ad alta risoluzione sono intermedi non usati per il verdetto. La stabilità temporale dei colori è provata dalle asserzioni sui 45 frame, non dedotta dalla sola foto. Nessuna scrittura nella conversazione dell'owner.
