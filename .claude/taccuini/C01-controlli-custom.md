# C01-controlli-custom — Casella, interruttore, cursore e menu: disegnati dal tema, non dal sistema

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-07 10:11

## Passi

- **accendo la selezione** ✅
  - atteso: barra visibile, conteggio NASCOSTO (0 selezionate), casella 20px disegnata da noi
  - visto: {"barra":true,"conteggioVisibile":false,"conteggio":"","premuto":"true","tutte":"Seleziona tutto","spuntate":0,"casella":{"w":20,"h":20,"raggio":"6px","fondo":"rgb(43, 44, 48)","appearance":"none","spuntaScala":"matrix(0, 0, 0, 0, 0, 0)","spuntaFondo":"rgb(21, 20, 17)","spuntata":false}}
- **spunto una riga** ✅
  - atteso: conteggio «1 selezionata», casella col fondo ACCENTO e la spunta a scala 1
  - visto: {"barra":true,"conteggioVisibile":true,"conteggio":"1 selezionata","premuto":"true","tutte":"Seleziona tutto","spuntate":1,"casella":{"w":20,"h":20,"raggio":"6px","fondo":"rgb(192, 139, 60)","appearance":"none","spuntaScala":"matrix(1, 0, 0, 1, 0, 0)","spuntaFondo":"rgb(21, 20, 17)","spuntata":true}}
- **seleziona tutte** ✅
  - atteso: conteggio con il totale, il pulsante diventa «Deseleziona tutto»
  - visto: {"barra":true,"conteggioVisibile":true,"conteggio":"2 selezionate","premuto":"true","tutte":"Deseleziona tutto","spuntate":2}
- **deseleziono tutte** ✅
  - atteso: zero spuntate e il conteggio sparisce
  - visto: {"barra":true,"conteggioVisibile":false,"conteggio":"","premuto":"true","tutte":"Seleziona tutto","spuntate":0}
- **spengo la selezione** ✅
  - atteso: barra via, pulsante non premuto
  - visto: {"barra":false,"conteggioVisibile":false,"conteggio":"","premuto":"false","tutte":"Seleziona tutto","spuntate":0}
- **gli interruttori** ✅
  - atteso: pillola del tema col pomello disegnato, appearance none
  - visto: {"w":63,"h":36,"appearance":"none","fondo":"rgba(192, 139, 60, 0.14)","pomello":{"w":"24px","fondo":"rgb(192, 139, 60)","trasla":"matrix(1, 0, 0, 1, 27, 0)"},"acceso":true}
- **il select** ✅
  - atteso: appearance base-select dove il motore la sa fare
  - visto: {"appearance":"base-select","base":true,"h":0}
- **errori di pagina** ✅
  - atteso: nessuno
  - visto: []

## Verdetto

**PASSA** — difetti trovati: 0.
