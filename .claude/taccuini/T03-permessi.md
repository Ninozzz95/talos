# T03-permessi — Permesso «chiede prima» e permesso per attrezzo: la carta di approvazione

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-06 12:21

## Passi

- **il foglio dei permessi** ✅
  - atteso: quattro carte col rischio scritto, e un menu per attrezzo
  - visto: {"carte":[],"attrezziConMenu":5,"opzioni":["Come la sessione","Sempre consentito","Chiedi conferma","Nega sempre"]}

> ⛔ **T03-permessi-D1** (medio): nel foglio compaiono 5 attrezzi: la decisione E7 ne vuole tutti e 43 con «come la sessione» e il filtro «hanno un cancello»
- **permesso per attrezzo** ✅
  - atteso: scrittura E comando passano a «chiedi»
  - visto: Permesso per l'attrezzo scrittura di un file → Chiedi conferma · Permesso per l'attrezzo comando nel terminale → Chiedi conferma

> ⛔ **T03-permessi-D2** (grave): chiudere il cancello sulla sola «scrittura di un file» NON basta: il modello scrive lo stesso con «comando nel terminale» (misurato: printf > src/nuovo.mjs). Chi chiede di essere avvisato prima di una scrittura deve chiudere due cancelli, e non lo sa — prova: sessione 1ee3cb76, processo shell
- **sessione avviata** ✅
  - atteso: una sessione vera che dovrà scrivere un file
  - visto: ac3e0ed2
- **la carta di approvazione** ✅
  - atteso: arriva e dice cosa, perché, e mostra la differenza (E9, E10)
  - visto: {"testo":"Chiede di scriveresrc/nuovo.mjsVuole scrivere il file: src/nuovo.mjsConsenti una voltaPer questa sessioneNegaVale solo per questa richiesta","perche":true,"differenza":false,"pulsanti":["Consenti una volta","Per questa sessione","Nega"]}

> ⛔ **T03-permessi-D3** (grave): la carta non mostra la differenza prima/dopo della scrittura (decisione E10)
- **richiesta di approvazione** ✅
  - atteso: una carta che dice cosa e perché
  - visto: Chiede di scriveresrc/nuovo.mjsVuole scrivere il file: src/nuovo.mjs — Approvato.
- **richiesta di approvazione** ✅
  - atteso: una carta che dice cosa e perché
  - visto: Chiede di scriveresrc/nuovo.mjsVuole scrivere il file: src/nuovo.mjs — Approvato.
- **esito del giro** ✅
  - atteso: conclusa
  - visto: conclusa=true · esito successo · approvazioni 2

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 3 (T03-permessi-D1, T03-permessi-D2, T03-permessi-D3).
