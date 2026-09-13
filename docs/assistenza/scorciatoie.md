# Scorciatoie da tastiera

## Cosa fa

Sono **sette**, e funzionano tutte. `Mod` è **Ctrl** su Windows e Linux, **⌘** su
Mac: l'etichetta a schermo cambia da sola a seconda del computer su cui sei.

| combinazione | dove | cosa fa |
|---|---|---|
| `Mod K` | ovunque | Apri i comandi |
| `Mod N` | ovunque | Nuova sessione |
| `Mod ,` | ovunque | Apri le impostazioni |
| `Mod /` | ovunque | Mostra le scorciatoie |
| `Mod ⇧ M` | chat | Cambia il modello |
| `Mod \`` | sessione | Mostra o nascondi il terminale |
| `Mod ⇧ \`` | sessione | Nuova scheda del terminale |

Dentro l'elenco delle schede del terminale ci sono anche i tasti di
[quella schermata](terminale.md): frecce per muoversi, Inizio e Fine per gli
estremi, Canc per chiudere, F2 per rinominare.

## Cosa non fa

- ⛔ **Non si scrive a schermo una scorciatoia che non funziona.** È la regola
  che ha fatto nascere questo elenco: c'era una pillola del modello che
  disegnava `Ctrl ⇧ M` senza che quel tasto aprisse niente, e un pulsante che
  prometteva `Ctrl ,` allo stesso modo. Una scorciatoia scritta è una promessa:
  o funziona, o non si scrive.
- ⛔ **Non si mostrano i simboli del Mac su Windows.** Prima succedeva (`⌘N`,
  `⌘R`, `⌘T` su una tastiera che quel tasto non ce l'ha): oggi l'etichetta segue
  la piattaforma.
- Non sono personalizzabili.

## Come si usa

`Mod /` apre l'elenco completo dentro il prodotto, che è la copia che non
invecchia. Questa pagina serve a saperlo prima di cercarlo.

## Se va storto

- **Una combinazione non fa niente** — controlla di essere nel posto giusto: tre
  delle sette valgono solo dentro una chat o dentro una sessione, non ovunque.
- **Il tasto scritto non è quello della tua tastiera** — è un difetto da
  segnalare: l'etichetta deve seguire la piattaforma.

> Verificato in `harness-ui/frontend/src/components/scorciatoie.js`
> (`SCORCIATOIE`, `suApple`, `etichettaTasto`).
