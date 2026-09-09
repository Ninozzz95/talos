# T21-artefatti — Un artefatto vero, dal giro alla Libreria — e i tre pallini guardati DURANTE

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-07 18:42

## Passi

- **sessione avviata** ✅
  - atteso: nasce una sessione vera con GLM 5.3 Flash
  - visto: be3618f2-5
- **O-45 · i tre pallini DURANTE il giro** ✅
  - atteso: l’animazione avanza: tempi diversi fra uno scatto e l’altro, e il riempimento cambia
  - visto: {"scattiConLoader":8,"tempiDiversi":8,"riempimentiDiversi":3,"primo":{"presente":true,"animazioni":[{"nome":"talosLineNodeFill","stato":"running","tempo":2704}],"riempimentoOra":"rgb(192, 139, 60)","etichetta":"TALOS sta elaborando la risposta…"},"ultimo":{"presente":true,"animazioni":[{"nome":"talosLineNodeFill","stato":"running","tempo":8325}],"riempimentoOra":"rgb(192, 139, 60)","etichetta":"Ragionamento in corso…"}}
- **il giro finisce** ✅
  - atteso: la sessione si conclude
  - visto: conclusa=true in 18s
- **O-37 · l’artefatto in Libreria** ❌
  - atteso: l’artefatto creato dal giro compare fra le voci della Libreria del progetto
  - visto: {"aSchermo":[],"vociLibreria":[],"quante":0}

> ⛔ **T21-artefatti-D1** (grave): l’artefatto creato non è arrivato in Libreria (O-37 ancora aperto) — prova: []
- **la Libreria a schermo** ✅
  - atteso: le voci si vedono nella pagina Libreria
  - visto: 1

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T21-artefatti-D1).
