# C27-rompi-il-browser — Il curioso: indirizzi sbagliati, doppi clic, dieci schede, chiusure a metà

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-07 21:05

## Passi

- **1 · un dominio che non esiste** ✅
  - atteso: lo dice in italiano, senza schermo bianco né errori JS
  - visto: {"schede":1,"vista":false,"tela":null,"cornice":false,"avviso":"Il nome del sito non esiste. Controlla l’indirizzo.","bloccato":false,"url":"https://questo-dominio-non-esiste-davvero-12345.example/"}
- **2 · una frase al posto di un indirizzo** ✅
  - atteso: non ci prova nemmeno: lo dice
  - visto: {"avviso":"Non è un indirizzo: scrivi un sito (es. localhost:5173 o example.org).","schede":1}
- **3 · dieci invii di fila sullo stesso indirizzo** ✅
  - atteso: non nascono dieci browser: al massimo una scheda viva per pagina
  - visto: {"schede":2,"vista":false,"tela":null,"cornice":true,"avviso":"","bloccato":false,"url":"https://example.org/","schedeServer":0}
- **4 · avanti e indietro fra cornice e vista viva, tre volte** ✅
  - atteso: nessun residuo: o la cornice o la tela, mai le due insieme
  - visto: {"vista":false,"cornice":true,"schedeServer":0}
- **5 · chiudo la scheda mentre carica** ✅
  - atteso: niente resta appeso, e la app non si rompe
  - visto: {"schede":2,"vista":false,"tela":null,"cornice":true,"avviso":"","bloccato":false,"url":"https://example.org/"}
- **6 · otto pagine una dietro l’altra** ✅
  - atteso: il tetto del server tiene, e la app lo dice invece di rompersi
  - visto: {"schedeUI":9,"schedeServer":1,"avviso":""}
- **7 · clic negli angoli, Escape, Tab, doppio clic** ✅
  - atteso: la vista regge e non lancia niente
  - visto: {"schede":9,"vista":true,"tela":"1280×800","cornice":false,"avviso":"","bloccato":false,"url":"https://github.com/Ninozzz95/talos/commit/ebe2c94646e4d5e7e8df71b109e62299f9553b57","erroriJs":0}
- **8 · ricarico TALOS mentre il browser è aperto** ✅
  - atteso: la app riparte pulita, e il Chromium non resta orfano
  - visto: {"schede":0,"vista":false,"tela":null,"cornice":false,"avviso":"","bloccato":false,"url":"","schedeServer":0,"finestra":false}

## Verdetto

**PASSA** — difetti trovati: 0.
