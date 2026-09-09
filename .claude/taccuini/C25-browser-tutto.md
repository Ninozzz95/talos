# C25-browser-tutto — Il browser sul 4174: cornice, vista viva, clic, tasti, rotella, annotazione, chiusura

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-07 20:25

## Passi

- **1 · un sito che vieta la cornice** ✅
  - atteso: vista viva con la tela dipinta, nessun iframe
  - visto: {"vistaVisibile":true,"tela":{"w":1280,"h":800},"cornice":false,"url":"https://github.com/Ninozzz95/talos","schede":8,"avviso":""}
- **2 · scorrimento con la rotella** ✅
  - atteso: la pagina si muove: l’immagine cambia
  - visto: impronte diverse: true
- **3 · un clic su un link vero** ✅
  - atteso: la prova trova un link nella pagina, lo clicca, e l’indirizzo cambia
  - visto: link «Issues» a (120,160) · https://github.com/Ninozzz95/talos → https://github.com/Ninozzz95/talos/issues
- **4 · la tastiera** ✅
  - atteso: i tasti arrivano alla pagina
  - visto: impronte diverse: true
- **5 · l’annotazione dentro la pagina viva** ✅
  - atteso: l’elemento sotto il punto ha selettore, tag, testo e stili
  - visto: {"ok":true,"codice":null,"messaggio":null,"trovato":true,"selettore":"div.prc-PageLayout-Content-xWL-A > div","tag":"div","testo":"Issues Search Issues is:issue state:open","stili":11}
- **6 · un sito che si lascia incorniciare** ✅
  - atteso: torna la cornice, la vista viva si fa da parte
  - visto: {"vistaVisibile":false,"tela":null,"cornice":true,"url":"https://example.org/","schede":10,"avviso":""}
- **7 · chiudere la scheda spegne il browser** ✅
  - atteso: con l’ultima scheda se ne va anche il Chromium
  - visto: {"prima":1,"dopo":0,"finestra":false}
- **8 · riaprire dopo aver chiuso** ✅
  - atteso: la vista viva torna, con la tela dipinta
  - visto: {"vistaVisibile":true,"tela":{"w":1280,"h":800},"cornice":false,"url":"https://github.com/Ninozzz95/talos","schede":11,"avviso":""}

## Verdetto

**PASSA** — difetti trovati: 0.
