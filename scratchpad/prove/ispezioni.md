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

## 10/09 — D-10A, il segnavia e il glifo (foto in `scratchpad/prove/foto/`)

**`2026-09-10-segnavia-glifo-indice.png`** — guardata, scattata DURANTE un giro vero con
`glm-5.3-flash` (invio → +~2 s). Tre cose da verificare, tutte e tre vere a schermo:
· il **segnavia a tre nodi** si vede accanto a «TALOS sta elaborando la risposta… 0s»: due nodi
  pieni, il terzo vuoto, e la linea che li attraversa — alla taglia nuova (72×12) è leggibile, alla
  vecchia (48×8) spariva accanto all'etichetta;
· la testata del messaggio è **«TALOS glm-5.3-flash»** e basta: il glifo non c'è più, come chiesto;
· l'**Indice dei giri** a destra fa `1 · Conta lentamente da 1 a` → *tuo messaggio*, `2 · Risposta`,
  `3 · UnoDueTre…`, `4 · ma che cavolo significa?` → *tuo messaggio*, `5 · Risposta`, `6`, `7`, `8`,
  `9`, `10` — **consecutivo, senza un buco**. È D-10A chiuso, e il numero di ogni riga è lo stesso
  che la chat mostra accanto a quel messaggio.
⛔ Difetti NOTATI nella stessa foto, fuori da ciò che stavo facendo:
· «Finestra del contesto» mostra `—` su Conversazione e Libera **mentre il giro è in corso**, e i
  numeri tornano solo a giro finito (difetto già annotato: resta aperto);
· la **spine del turno di TALOS** è una colonna di tick alta ~340 px (da y≈280 a y≈620) senza un solo
  numero visibile accanto: troppi tick per un turno, e il numero — che è il senso della spine — non
  si legge. Nuovo, da registrare come debito a sé.

**`2026-09-10-logo-barra.png`** — guardata. Il marchio in alto a sinistra è ora 40 px di glifo dentro
uno spazio di 42, senza capsula né bordo, allineato con «TALOS / CODICE». Le due icone a destra
(campanella, comprimi barra) restano della loro taglia: il logo cresce, la riga no.

**`2026-09-10-testata-senza-glifo.png`** — guardata. Solo «TALOS» in maiuscoletto ambrato e
`glm-5.3-flash` in mono accanto. Nessun residuo del glifo, nessuno spazio vuoto al suo posto: la
riga parte dal bordo del testo come le altre.
