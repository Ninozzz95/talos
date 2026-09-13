# Allegati

## Cosa fa

È il **«+»** del composer, e serve a una cosa sola: **attaccare qualcosa a un
messaggio**. Le vie sono quattro:

| via | cos'è |
|---|---|
| **File del progetto** | un file della cartella di questa sessione |
| **File dal disco** | un file qualunque del computer |
| **Immagine** | una foto o uno schema da guardare |
| **Ultima schermata** | l'ultimo screenshot che hai scattato |

Si può anche **incollare** e **trascinare**: entrambe funzionano.

⭐ Ogni allegato dichiara **quanto contesto costa**, in token stimati. È il
motivo per cui vale la pena guardarlo prima di inviare: un file lungo si paga a
ogni messaggio successivo, non solo a quello in cui lo attacchi.

## Cosa non fa

- **La stima è una stima, e lo dice.** Il conto vero lo fa il modello quando
  riceve il messaggio: qui c'è un ordine di grandezza, non una fattura.
- **I tetti ci sono e sono scritti**, non si scoprono sbattendoci:
  - al massimo **10 allegati** per messaggio;
  - al massimo **200.000 caratteri** per allegato — circa 50.000 token, oltre i
    quali un file da solo si mangerebbe mezza finestra.
- **Un'immagine va caricata prima di inviare.** Se l'invio parte prima che il
  caricamento sia finito, il prodotto lo dice — «L'immagine non è stata
  caricata. Allegala di nuovo prima di inviare» — invece di mandare un
  riferimento vuoto.
- Il «+» **non** è il posto dove si governano gli attrezzi: quello è
  [Capability](permessi-per-attrezzo.md).

## Come si usa

1. Nel composer, premi **+** e scegli la via.
2. Guarda il costo dichiarato accanto a ogni allegato.
3. Se un allegato è pesante, toglilo o sostituiscilo con un pezzo più piccolo:
   spesso basta la parte di file che c'entra davvero.

Per far leggere al modello un documento **senza** allegarlo a ogni messaggio, le
strade sono altre due: un file di istruzioni nel progetto (vedi
[Cosa legge il modello](contesto-del-progetto.md)) oppure la
[Libreria](libreria.md), che il modello apre quando le serve.

## Se va storto

- **«L'immagine non è stata caricata»** — riallegala e aspetta che finisca.
- **Non riesci ad aggiungerne un altro** — sei a dieci.
- **La conversazione è diventata costosa di colpo** — guarda cosa hai allegato:
  un allegato grosso resta nel contesto dei messaggi che seguono.

> Verificato in `harness-ui/frontend/src/components/allegati.js`
> (`VIE_ALLEGATO`, `TETTI_ALLEGATI`: `quanti: 10`,
> `caratteriPerAllegato: 200_000`) e in
> `harness-ui/frontend/src/components/immagini-chat.js`.
