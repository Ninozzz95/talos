# V01-scorrimento-e-browser — Le cure di oggi, provate su una sessione vera

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-06 14:26

## Passi

- **sessione avviata** ✅
  - atteso: una sessione vera che deve leggere una pagina
  - visto: f8015222
- **lo scorrimento mentre scrive (O-19)** ✅
  - atteso: il fondo del testo resta intorno a meta' schermo, mai incollato al composer
  - visto: campioni [28,28,36,36,36,48] — dentro la fascia 30-75%: 4/6
- **esito del giro** ✅
  - atteso: conclusa
  - visto: conclusa=true · esito successo
- **aprendo una sessione (O-20)** ✅
  - atteso: si parte dal fondo della conversazione
  - visto: {"distanzaDalFondo":0,"altezza":684}
- **la lettura si apre come pagina (O-28)** ✅
  - atteso: cornice visibile con l'indirizzo vero, due modi a schermo
  - visto: {"schede":1,"modiVisibili":2,"corniceVisibile":true,"frameSrc":"https://example.org/","frameCaricata":"si","avviso":""}
- **il testo dell'agente (O-28)** ✅
  - atteso: ripulito, col sorgente richiuso sotto
  - visto: {"visibile":true,"sorgenteSotto":true,"contieneTag":false,"prime":"HTTP 200 · https://example.org/ Example Domain This domain is for use in documentation examples with"}

## Verdetto

**PASSA** — difetti trovati: 0.
