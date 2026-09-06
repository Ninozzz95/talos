# T08-browser — Il Browser: dev server locale, proxy, annotazione, e cosa mostrano le «Letture della sessione»

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 13:59

## Passi

- **sessione avviata** ✅
  - atteso: una sessione vera che farà leggere una pagina all agente
  - visto: 399d198d
- **esito del giro** ✅
  - atteso: la sessione conclude e l agente ha letto la pagina
  - visto: conclusa=true · esito=successo
- **le «Letture della sessione»** ✅
  - atteso: la pagina letta dall agente compare, con indirizzo e provenienza
  - visto: {"visibile":true,"riepilogo":"Testo acquisito dall’agente · 1 pagina","titolo":"blocked: TALOS_WEB_URL_BLOCKED:port","provenienza":"Agente · 06/09, 16:00 (Roma) · 35 caratteri","schede":["blocked: TALOS_WEB_URL_BLOCKED:port"]}
- **cosa contiene il testo acquisito** ✅
  - atteso: il TESTO leggibile della pagina, non il sorgente HTML (O-28)
  - visto: sorgente=false · leggibile=false · 35 caratteri · inizio: blocked: TALOS_WEB_URL_BLOCKED:port
- **i due modi «Leggibile» / «Sorgente»** ❌
  - atteso: la cura dichiarata in O-28 lato interfaccia
  - visto: ["Chat","Terminale","Review","Browser","blocked: TALOS_WEB_URL_BLOCKED:port","Rileggi","Annota","Nota locale","Copia testo","Consenti una volta","Nega","Annulla navigazione","Conserva nota","Annulla","Annota un elemento","Svuota","Porta i commenti nella chat","01 · Agente · 16:00blocked: TALOS_WEB_URL_BLOCKED:port127.0.0.1:4197"]

> ⛔ **T08-browser-D1** (medio): non esiste nessun interruttore «Leggibile / Sorgente»: chi guarda non ha modo di leggere la pagina, solo il markup — prova: ["Chat","Terminale","Review","Browser","blocked: TALOS_WEB_URL_BLOCKED:port","Rileggi","Annota","Nota locale","Copia testo","Consenti una volta","Nega","Annulla navigazione","Conserva nota","Annulla","Annota un elemento","Svuota","Porta i commenti nella chat","01 · Agente · 16:00blocked: TALOS_WEB_URL_BLOCKED:port127.0.0.1:4197"]
- **il campo dell indirizzo** ✅
  - atteso: si può aprire una pagina scrivendo l indirizzo
  - visto: true
- **la pagina viva nel proxy** ✅
  - atteso: una cornice che mostra il dev server, passata dal proxy locale
  - visto: {"cornice":{"src":"http://127.0.0.1:4188/api/v1/browser/proxy?url=http%3A%2F%2F127.0.0.1%3A4197%2F","visibile":true,"larghezza":750,"altezza":614},"posizione":"Pagina aperta da te · viva dentro TALOS","avviso":"","bloccato":"In attesa di teConsentire questa lettura? L’agente chiede di leggere https://example.org/docume
- **dentro la cornice** ✅
  - atteso: la pagina del dev server, e la stessa origine (il proxy) la rende leggibile
  - visto: Bottega dei numeri — dev
- **il pannello degli spilli** ✅
  - atteso: compare quando la pagina è annotabile (dev server locale via proxy)
  - visto: {"visibile":true,"testo":"Commenti sulla paginaNessun commentoAnnota un elementoSvuotaPorta i commenti nella chatOgni commento porta all’agente il selettore, l’HTML, gli stili e, quando "}
- **accendo l annotazione** ✅
  - atteso: il pulsante passa a «Smetti di annotare»
  - visto: Smetti di annotare
- **annoto un elemento della pagina** ✅
  - atteso: compare uno spillo col selettore stabile dell elemento
  - visto: cliccato #bottone-primi · {"testo":"Commenti sulla pagina1 commentoSmetti di annotareSvuotaPorta i commenti nella chat1#bottone-primiTogli«Calcola i primi»Ogni commento porta all’agente il selettore, l’HTML, gli stili e, quando la pagina li espone, il file del componente. Niente parte da solo: i commenti finiscono nel composer.","voci":1}
- **il pacchetto finisce nel composer** ✅
  - atteso: il testo si scrive nel composer e NON parte da solo
  - visto: pulsante=Porta i commenti nella chat · prima="" · dopo="Annotazioni sulla pagina http://127.0.0.1:4197/ («Bottega dei numeri — dev») — 1 commento.
#1 — (senza commento)
Element" · giro=false

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T08-browser-D1).

## Il cancello sulle porte: la lettura dell'agente non è nemmeno partita

L'agente ha chiamato `naviga` su `http://127.0.0.1:4197/` (il dev server acceso da me sulla stessa
macchina) e il kernel l'ha **respinto**. Quello che arriva a schermo, come **titolo della lettura** e
come **testo acquisito**, è la stringa grezza:

```
blocked: TALOS_WEB_URL_BLOCKED:port
```

> ⛔ **T08-browser-D2** (grave): un rifiuto del cancello web arriva a schermo come **codice grezzo in
> inglese maiuscolo**, messo al posto del **titolo** della pagina e al posto del **testo**. Non dice
> cosa è successo («l'indirizzo ha una porta non standard»), non dice cosa fare, non dice che è stato
> TALOS a rifiutare e non il sito. Viola H11-H13 (due frasi in italiano, niente gergo in prima
> battuta) e H22 (nessun nome tecnico a schermo) — prova: `foto/T08-browser/03-annotazione.png`,
> riquadro «Cronologia», voce `01 · Agente · 16:00`

> ⛔ **T08-browser-D3** (medio): il cancello blocca **il dev server della persona stessa**
> (`127.0.0.1:4197`) mentre l'interfaccia, dieci centimetri più in basso, apre **la stessa identica
> pagina** nella cornice viva passando dal proxy locale. Due politiche opposte sullo stesso indirizzo
> nella stessa schermata: l'agente non può leggere ciò che io sto guardando — prova: la cornice viva
> in `03-annotazione.png` mostra `127.0.0.1:4197` mentre la Cronologia dice `blocked`

## O-28, misurato dal vivo su una pagina che il cancello lascia passare

Rifatta la lettura su `https://example.com/` (taccuino **`T08b-lettura-pagina.md`**, sessione
`00134c16`). **La segnalazione dell'owner è confermata, e la causa è quella scritta nel registro:**

- il testo acquisito è il **sorgente**: `<!doctype html><html lang="en"><head><title>…` e perfino il
  blocco `<style>body{background:#eee;width:60vw;…}</style>` per intero;
- il **titolo** della lettura non è il titolo della pagina (`Example Domain`, presente nel sorgente):
  è **`HTTP 200 · https://example.com/`**, cioè lo stato HTTP;
- la **prima riga del testo ripete il titolo** (`HTTP 200 · https://example.com/`), quindi la stessa
  cosa si legge due volte a due centimetri di distanza;
- 591 caratteri su una pagina di quattro righe. Su una pagina vera è il rapporto che l'owner ha visto:
  «438747 caratteri tolti nel mezzo».

⛔ **La vista non sbaglia**: mostra fedelmente ciò che il modello ha ricevuto. Sbaglia la **cattura**,
che sta nel kernel (`naviga`) — fuori dalla mia lane, e va segnalata lì.

> ⛔ **T08-browser-D4** (grave): il testo che l'agente riceve da `naviga` è l'HTML grezzo, e la vista
> «Letture della sessione» lo ripropone tale e quale: il modello paga in token il markup e legge
> quello invece del contenuto — prova: `foto/T08b-lettura-pagina/01-lettura.png`

> ⛔ **T08-browser-D5** (medio): il titolo della lettura è lo **stato HTTP**, non il titolo della
> pagina, che pure è dentro il sorgente acquisito — prova: `01-lettura.png`, «HTTP 200 ·
> https://example.com/»

## Ispezione delle foto — quello che invece funziona, e va detto

Foto lette: `03-annotazione.png`, `02-pagina-viva.png`, `04-pacchetto.png`, `T08b/01-lettura.png`.

La metà **viva** del Browser è la funzione meglio riuscita che ho visto in tutta la campagna, e
funziona per intero, senza una sbavatura:

- il dev server locale si apre nella cornice **passando dal proxy**
  (`…/api/v1/browser/proxy?url=http%3A%2F%2F127.0.0.1%3A4197%2F`), quindi stessa origine e pagina
  ispezionabile: il `document.title` letto da dentro la cornice è davvero `Bottega dei numeri — dev`;
- il pannello **«Commenti sulla pagina»** compare da solo perché la pagina è annotabile;
- «Annota un elemento» accende la modalità, il clic su `#bottone-primi` crea lo **spillo numerato 1**
  disegnato **sopra l'elemento vero** dentro la pagina, con il selettore stabile (`#bottone-primi`) e
  il testo dell'elemento («Calcola i primi»);
- «Porta i commenti nella chat» scrive il pacchetto **nel composer** e **non lo invia**:
  `Annotazioni sulla pagina http://127.0.0.1:4197/ («Bottega dei numeri — dev») — 1 commento.` — il
  contratto «mai inviato da solo» è rispettato, misurato (`send-btn.is-stop` = false).

## Verdetto (rivisto dopo l'ispezione delle foto)

**PASSA CON RISERVA** — difetti: 5 (D1 medio, D2 grave, D3 medio, D4 grave, D5 medio).
La pagina viva, il proxy, l'annotazione e il pacchetto nel composer **funzionano tutti**. Quello che
non funziona è la metà **lettura**: ciò che l'agente riceve è markup, e ciò che l'interfaccia mostra
quando qualcosa va storto è un codice in inglese al posto di una frase.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
