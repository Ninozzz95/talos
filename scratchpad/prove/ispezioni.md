# Ispezioni recupero locale

Percorso foto: prove/foto/astra-chat-locali-20260908/. Indice completo delle fasi precedenti: .claude/taccuini/astra-chat-locali-2026-09-08.md.

## Recupero locale: immagini aperte e giudicate il 08/09

| Immagine | Giudizio visivo |
|---|---|
| regressione-recupero-attesa-ritrovata.png | Attesa e Stop coerenti. Fixture con toast SSE e tema transitorio: prova semantica, non riferimento estetico. |
| recupero-reale-avviato.jpg | Banco 4317: nota di recupero e attesa visibili; inizio chat sopra la piega. |
| recupero-reale-limite-contesto.jpg | Banco 4317: limite 30.821/16.384 leggibile; titolo errore sopra la piega, cattura diagnostica incompleta. |
| recupero-reale-risposta.jpg | Prova controllata: risposta Livia sotto la nota, attesa conclusa e Invio disponibile. |
| recupero-reale-lettura.jpg | Prova controllata: un file letto e sole-47 visibili, risposta conclusa e composer libero. |
| live-recupero-consegna.jpg | 4174 dopo riavvio: chat owner leggibile, errori storici conservati. Non prova la ripresa: nessun invio consentito qui. |
| storico-recuperato-1024.png | Nota leggibile e in colonna; nessuna sovrapposizione col composer. Replay unico verificato dal test. |
| regressione-recupero-hover-fondo-1024.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| regressione-recupero-torna-in-fondo-1024.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| storico-recuperato-1280.png | Nota leggibile e in colonna; nessuna sovrapposizione col composer. Replay unico verificato dal test. |
| regressione-recupero-hover-fondo-1280.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| regressione-recupero-torna-in-fondo-1280.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| storico-recuperato-1440.png | Nota leggibile e in colonna; nessuna sovrapposizione col composer. Replay unico verificato dal test. |
| regressione-recupero-hover-fondo-1440.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| regressione-recupero-torna-in-fondo-1440.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| storico-recuperato-1920.png | Nota leggibile e in colonna; nessuna sovrapposizione col composer. Replay unico verificato dal test. |
| regressione-recupero-hover-fondo-1920.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| regressione-recupero-torna-in-fondo-1920.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| storico-recuperato-2560.png | Nota leggibile e in colonna; nessuna sovrapposizione col composer. Replay unico verificato dal test. |
| regressione-recupero-hover-fondo-2560.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| regressione-recupero-torna-in-fondo-2560.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| storico-recuperato-3840.png | Nota leggibile e in colonna; nessuna sovrapposizione col composer. Replay unico verificato dal test. |
| regressione-recupero-hover-fondo-3840.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| regressione-recupero-torna-in-fondo-3840.png | Pulsante rotondo centrato, sfondo opaco, composer accessibile. Geometria e colori invarianti verificati sui frame. |
| green-hover-fondo-1920.png | Intermedio precedente al vincolo colore, aperto e respinto come riferimento finale; sostituito dalle foto final-hover. |
| green-hover-fondo-2560.png | Intermedio precedente al vincolo colore, aperto e respinto come riferimento finale; sostituito dalle foto final-hover. |
| green-hover-fondo-3840.png | Intermedio precedente al vincolo colore, aperto e respinto come riferimento finale; sostituito dalle foto final-hover. |

PNG alti conservati a 1920×1080, 2560×1440 e 3840×2160. Le fotografie reali sono del banco con inferenza effettiva; quelle della suite usano eventi controllati. Il file originale owner è rimasto intatto.

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
