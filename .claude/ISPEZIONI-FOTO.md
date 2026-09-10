
## Immagini chat — 08/09/2026, verifica Astra
Copie byte-identiche delle catture recenti sul server 4174. Originali e manifest conservati in .claude/immagini/immagini-chat-2026-09-08. Aperte personalmente con view_image prima della copia.
- chat-1080p-verificata.png: 1920×1080; scheda integra fuori dalla bolla, figura riconoscibile, composer e dettagli raggiungibili.
- dialogo-1080p-verificata.png: 1920×1080; dialogo centrato, immagine intera senza ritaglio, chiusura visibile e focus restituito.
- chat-1440p-verificata.png: 2560×1440; scheda integra fuori dalla bolla, figura riconoscibile, composer e dettagli raggiungibili.
- dialogo-1440p-verificata.png: 2560×1440; dialogo centrato, immagine intera senza ritaglio, chiusura visibile e focus restituito.
- chat-4k-verificata.png: 3840×2160; scheda integra fuori dalla bolla, figura riconoscibile, composer e dettagli raggiungibili.
- dialogo-4k-verificata.png: 3840×2160; dialogo centrato, immagine intera senza ritaglio, chiusura visibile e focus restituito.

## Accesso pieno — 08/09/2026
- full-access-1080p.png: risposta completa e diff visibili, composer raggiungibile, titolo lungo correttamente troncato.
- full-access-1440p.png: lettura e scrittura esterne documentate in chat, nessuna sovrapposizione fra composer e risposta.
- full-access-4k.png: pagina completa nelle dimensioni vere, testata su una riga, dettagli e controllo Accesso pieno visibili.

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

⛔ Difetti annotati e NON ancora curati, visti in queste foto: la riga di stato troncata dal comando
ripetuto a destra; la Finestra del contesto che si spegne a «− / −» dopo un comando diretto mentre la
barra in basso dichiara ancora i token; i numeri dell'Indice dei giri che saltano (2, 3, 5, 6, 8…).
