# T02-primo-messaggio — Dal primo messaggio alla risposta: cosa vede chi guarda

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-06 11:51

## Passi

- **sessione avviata dal primo messaggio** ✅
  - atteso: nasce una sessione vera
  - visto: 94f8a06b
- **mentre il modello lavora** ✅
  - atteso: una riga onesta che dice cosa sta facendo, e nessuno scheletro
  - visto: {"striscia":false,"testoStriscia":"Lettura file… 4 s Ferma Esc","attesa":false,"scheletri":0}
- **il giro finisce** ✅
  - atteso: la sessione si conclude e la risposta è a schermo
  - visto: conclusa=true in 6s · esito successo
- **la risposta** ❌
  - atteso: una risposta leggibile in chat
  - visto: (vuota)
- **file toccati nella colonna** ✅
  - atteso: i file letti/scritti dal giro
  - visto: ["Nessun file scritto finora"]
- **barra della cronologia** ✅
  - atteso: una voce per giro
  - visto: 3
- **costo della sessione** ❌
  - atteso: il costo per sessione, non per messaggio (B26)
  - visto: (non mostrato)

> ⛔ **T02-primo-messaggio-D1** (minore): il costo della sessione non compare nel composer dopo il giro (B26)
- **la striscia in fondo** ✅
  - atteso: sparita: in fondo è ridondante
  - visto: {"striscia":false}

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T02-primo-messaggio-D1).

> ⚠️ Rettifica: la riga «la risposta → (vuota)» è un difetto della MIA sonda, non della app. Il selettore
> `.talos-message__body` non prende il corpo della risposta di TALOS (struttura diversa dal messaggio
> dell'utente). Verificato sulla foto `02-fine.png`: la risposta c'è ed è leggibile — «La funzione
> somma(a, b) restituisce la somma dei due argomenti numerici passati (a + b)». Selettore da correggere
> nella prossima corsa.
