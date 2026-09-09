# C26-da-umano — Una persona apre TALOS, parla col modello, naviga, annota e manda i commenti

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-07 20:35

## Passi

- **1 · apro TALOS** ✅
  - atteso: la prima cosa che vedo è comprensibile
  - visto: Primo avvioPrimo avvio · 2 di 41Cartella2Modello3Permessi4Fine La prima cartella
- **2 · avvio una conversazione** ✅
  - atteso: nasce una sessione vera con GLM 5.3 Flash
  - visto: 8cde8922-6
- **3 · il modello risponde** ✅
  - atteso: una risposta leggibile in chat, e il giro si chiude
  - visto: conclusa in 12s · «La cache si svuota a ogni riavvio.»
- **4 · apro una pagina nel Browser** ✅
  - atteso: la pagina si vede: nessun riquadro rotto
  - visto: {"vista":true,"tela":"1280×800","barra":"https://github.com/Ninozzz95/talos","cornice":false}
- **5 · scorro la pagina col mouse** ✅
  - atteso: la pagina si muove sotto le dita
  - visto: rotella mandata
- **6 · annoto un elemento della pagina** ❌
  - atteso: lo spillo compare nel pannello dei commenti
  - visto: {"spilli":0,"composer":""}

> ⛔ **C26-da-umano-D1** (grave): l’annotazione dalla UI non produce nessuno spillo — prova: {"modoAnnota":"false","spilli":0,"composer":""}
- **7 · torno in chat** ✅
  - atteso: se ho lasciato dei commenti, li trovo nel composer — mai inviati da soli
  - visto: (composer vuoto)

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (C26-da-umano-D1).
