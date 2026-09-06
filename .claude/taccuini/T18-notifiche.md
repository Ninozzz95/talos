# T18-notifiche — Le notifiche: solo ciò che aspetta te

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:34

## Passi

- **la campanella** ✅
  - atteso: un pannello di notifiche con solo ciò che aspetta te (G22/G29)
  - visto: {"etichetta":"Notifiche: nessuna","titolo":"Notifiche: nessuna"}
- **il pannello** ❌
  - atteso: si apre e dice cosa aspetta te
  - visto: null

> ⛔ **T18-notifiche-D1** (grave): la campanella non apre nessun pannello di notifiche — prova: {"pastiglia":null,"etichetta":"Notifiche: nessuna","titolo":"Notifiche: nessuna","pannello":null}
- **quante aspettano davvero** ✅
  - atteso: confronto col dato dell API
  - visto: 0 sessioni con inAttesaApprovazione
- **il contrassegno sulla sessione** ✅
  - atteso: G22: uno dei tre modi
  - visto: 0 contrassegni

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T18-notifiche-D1).

## ⚠️ Rettifica: T18-notifiche-D1 è un difetto della MIA sonda

Il pannello **si apre**: `foto/T18-notifiche/01-notifiche.png` mostra un fumetto **«Notifiche —
Nessuna notifica: nessun'altra sessione chiede attenzione.»** con la sua «×». Cercavo un `.talos-popover`
o un `[role="dialog"]`, e quel fumetto non è né l'uno né l'altro. **D1 è ritirato.**

## Ispezione della foto

- La campanella dichiara lo stato **nel suo `aria-label`**: «Notifiche: nessuna». È la cosa giusta:
  chi usa la tastiera o un lettore di schermo sa il numero senza aprire.
- Il testo del fumetto è esattamente ciò che G29 chiede — **solo ciò che aspetta te**, e quando non
  c'è niente lo dice in una frase, senza inventare un registro di tutto.
- Il dato torna: `/api/v1/sessions` dà **0 sessioni con `inAttesaApprovazione`**, e il pannello dice
  «nessuna».

> ⛔ **T18-notifiche-D2** (minore): il fumetto si apre **sopra il pulsante «Nuova»** e lo copre per
> intero. È l'azione più usata della barra laterale, coperta dal pannello che le sta accanto
> — prova: `01-notifiche.png`, il pulsante arancione è dietro il fumetto

### ⛔ NON VERIFICATO, per nome

- **Il contrassegno sulla sessione nella barra laterale** e la **notifica di sistema** (G22 le vuole
  tutte e tre): non ho avuto nessuna sessione in attesa di approvazione **mentre** guardavo, quindi il
  caso pieno non l'ho visto. Il caso vuoto è corretto.
- **Il pannello con più di una voce**, e la sua distinzione fra «aspetta te» e «è successo qualcosa».

## Verdetto (rivisto dopo l'ispezione della foto)

**PASSA CON RISERVA** — 1 difetto (minore). Nel caso vuoto la campanella si comporta esattamente come
deciso; il caso pieno resta da provare.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
