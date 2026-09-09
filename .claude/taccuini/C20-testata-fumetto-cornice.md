# C20-testata-fumetto-cornice — Un fumetto solo, il titolo dentro la testata, e nessun riquadro rotto nel Browser

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-07 17:32

## Passi

- **fumetto della barra dei giri** ✅
  - atteso: un fumetto nostro, zero title nativi
  - visto: {"conTitle":0,"fumettiVisibili":1}
- **testata · Chat** ✅
  - atteso: titolo dentro la testata (y fra 0 e 40), largo al massimo 420, schede in riga
  - visto: {"schermo":"schermoChat","testataH":60,"titoloY":18,"titoloW":420,"schedeY":9,"tagliato":true}
- **testata · Terminale** ✅
  - atteso: titolo dentro la testata (y fra 0 e 40), largo al massimo 420, schede in riga
  - visto: {"schermo":"schermoTerminale","testataH":60,"titoloY":18,"titoloW":420,"schedeY":9,"tagliato":true}
- **testata · Review** ✅
  - atteso: titolo dentro la testata (y fra 0 e 40), largo al massimo 420, schede in riga
  - visto: {"schermo":"schermoReview","testataH":60,"titoloY":18,"titoloW":420,"schedeY":9,"tagliato":true}
- **testata · Browser** ✅
  - atteso: titolo dentro la testata (y fra 0 e 40), largo al massimo 420, schede in riga
  - visto: {"schermo":"schermoBrowser","testataH":60,"titoloY":18,"titoloW":420,"schedeY":9,"tagliato":true}
- **Browser · github.com** ✅
  - atteso: niente cornice, il testo dell’agente a schermo e una riga che dice perché
  - visto: {"url":"https://github.com/Ninozzz95/talos","avviso":"La pagina dichiara «frame-ancestors» e non include TALOS. Qui sotto c’è il testo che ha le","cornice":false,"testoVisibile":true}

## Verdetto

**PASSA** — difetti trovati: 0.
