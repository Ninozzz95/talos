# T-LUOGHI-04 — Notifiche: il terzo dei tre modi (G22/G29)

> Prova d'uso sul **4178**, Chrome vero via Playwright, **1440×900** e **1024×800**, scuro e
> chiaro. 06/09/2026.

## La decisione

G22/G29: «Ciò che aspetta te si vede in **tutti e tre i modi**: contrassegno sulla sessione nella
sidebar · pannello notifiche con solo ciò che aspetta te · **notifica di sistema**».
L'audit del 06/09: ❌ «⛔ Il pulsante notifiche **non apre niente**, etichetta «Notifiche: nessuna»;
nessun pannello».

## Cosa ho trovato davvero, aprendo la app

| Modo | L'audit | Verificato dal vivo |
|---|---|---|
| Contrassegno sulla sessione | ❌ | ⚠️ **l'audit era vecchio**: la riga porta «aspetta te» con tono d'allarme quando `inAttesaApprovazione` |
| Pannello «Aspetta te» | ❌ «non apre niente» | ⚠️ **l'audit era vecchio**: `#pannelloNotifiche` si apre e si riempie (fatto il 06/09, T-17, da un'altra sessione) |
| **Notifica di sistema** | ❌ | ✅ **mancava davvero, ed è quello che ho fatto** |

⛔ Due modi su tre erano già lì. L'ho verificato aprendo il pannello, non fidandomi dell'audit.

## La ricerca, prima di scrivere (06/09/2026)

- **MDN, «Using the Notifications API»** e `Notification.requestPermission()`: il permesso **si
  chiede solo da un gesto della persona** — «browsers will explicitly disallow notification
  permission requests not triggered in response to a user gesture» (Firefox dalla 72).
  ⇒ Non si può chiedere all'avvio. Il pulsante sta **dentro il pannello**, e lo preme chi vuole.
- **Pushpad, «The notification prompt can only be triggered by a user gesture»**: il doppio
  consenso — prima un controllo nostro, poi quello del browser — è la forma che non brucia il
  permesso, perché una volta negato non si può richiedere.
- ⛔ Regola aggiunta da me: **non si avvisa mentre la finestra è sotto gli occhi**. Una notifica di
  sistema per una cosa già a schermo è solo rumore.

## Cosa vede una persona

In fondo al pannello «Aspetta te» c'è **«Avvisami anche fuori dalla finestra»** con sotto «Solo
quando TALOS non è in primo piano.». Premendolo, il browser chiede il permesso; dato quello, il
pulsante sparisce e la riga diventa «Attive: TALOS avvisa solo quando non è in primo piano.». Se
il permesso è negato, la riga dice che si riattiva dalle impostazioni del browser e **non** si
ripropone il pulsante.

## Cosa ho trovato dal vivo

| # | Cosa | Gravità | Come è finita |
|---|---|---|---|
| 1 | Il piede del consenso **spariva al primo ridisegno**: `aggiornaPannelloNotifiche` cancella tutto quello che sta dopo la toolbar, e il pannello si ridisegna a ogni aggiornamento dell'elenco sessioni — cioè sempre | grave | Curato: il blocco del consenso è un piede fisso, si preserva e resta ultimo |
| 2 | `montaConsensoNotifiche` veniva chiamata a **ogni apertura** del pannello: un `addEventListener` per apertura vuol dire N richieste di permesso per un clic solo | medio | Curato con una guardia; lo *stato* invece si ridipinge sempre, perché il permesso può cambiare dal browser |

## Passi, clic per clic

- **apro il campanello** ✅ · visto: pannello aperto, «Nessuna notifica: nessun'altra sessione
  chiede attenzione.»
- **il consenso è nel pannello** ✅ · visto: pulsante presente e offerto, «Solo quando TALOS non è
  in primo piano.»
- **⛔ verso contrario — senza permesso** ✅ · atteso: nessuna notifica di sistema · visto: **0
  mandate** (con una spia sul costruttore `Notification`, che registra ogni invio vero)
- **do il consenso** ✅ · visto: permesso «granted», «Attive: TALOS avvisa solo quando non è in
  primo piano.», pulsante nascosto
- **⛔ verso contrario — col permesso ma la finestra visibile** ✅ · atteso: niente · visto: **0
  mandate**
- **errori** ✅ · JS 0

Foto: `scratchpad/luoghi/foto/T-LUOGHI-04-notifiche/` — `*-01-pannello.png`, `*-02-consenso-dato.png`.

## Verdetto

**PASSA CON RISERVA** — 0 difetti aperti, ma la riserva è pesante e sta qui sotto.

⛔ **NON VERIFICATO, per nome:**
- **Una notifica di sistema che parte DAVVERO.** Ho provato i due versi contrari (senza permesso ·
  a finestra visibile) e in tutti e due il conto è zero, che è giusto. Il caso positivo — finestra
  nascosta **e** una sessione vera che aspetta un'approvazione — **non l'ho provato**: serve una
  sessione con un'approvazione appesa, cioè un giro col modello a pagamento. La decisione «quando
  mandarla» è provata da sola nei test unitari (`G29-NOTIFICA-SISTEMA`, cinque casi), l'invio no.
- **Il clic sulla notifica** che riporta la finestra davanti e apre quella sessione: scritto,
  mai eseguito.
- **Il contrassegno sulla riga della sessione** con un'approvazione vera in attesa: la classe c'è
  nel codice, non l'ho vista a schermo.
