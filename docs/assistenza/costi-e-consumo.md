# Costi e consumo

## Cosa fa

È la sezione delle Impostazioni che risponde a «quanto sto consumando»,
raggruppando quello che il prodotto ha **davvero registrato**:

- **per giorno** — quanto è stato consumato in ciascuno degli ultimi giorni;
- **per modello** — quanto è costato ciascun modello, accanto al suo nome.

Le misure sono i **token**: quelli in ingresso, quelli in uscita, e quelli
riletti dalla cache.

## Cosa non fa

- ⛔ **Non dice una cifra in denaro, ed è una scelta.** Il progetto ha già pagato
  due volte per aver creduto a un numero in valuta calcolato in casa: una
  colonna del costo che attribuiva spesa a una riga che per costruzione non
  chiama nessuna API, e un conto più fine della propria risoluzione — cioè
  rumore con il simbolo dell'euro davanti.

  ⇒ Qui si contano i **token**, che sono un dato nostro, registrato e
  verificabile. **La cifra in denaro la dà il fornitore**, sul suo estratto
  conto: è l'unico posto dove è vera.
- **Un consumo non misurato è un trattino**, mai uno zero.
- **Le sessioni senza data** vengono contate a parte, invece di essere
  attribuite d'ufficio a un giorno qualunque.
- Il totale di una sessione è quello della **sessione intera**, non dell'ultimo
  invio. È una distinzione che è costata: su tre invii veri, sommare solo
  l'ultimo dava 7.716 token invece dei 23.060 spesi davvero.

## Come si usa

Impostazioni → **Costi e consumo**.

Le due domande a cui serve rispondere sono: «quale modello mi sta costando?» e
«cos'è successo quel giorno lì?». Per il dettaglio di una singola sessione c'è
la [Board](board.md), che porta le stesse misure riga per riga.

Se il consumo ti sembra alto, i due sospetti abituali sono il preambolo (vedi
[Cosa legge il modello](contesto-del-progetto.md)) e gli
[allegati](allegati.md) pesanti, che si pagano a ogni messaggio successivo.

## Se va storto

- **Un modello non compare** — le sue sessioni non hanno un modello dichiarato:
  il prodotto non lo indovina.
- **I numeri sembrano bassi** — la cache riduce molto il costo delle riletture,
  e il riuso è contato a parte proprio per questo.

> Verificato in `harness-ui/frontend/src/components/costi-consumo.js`
> (`consumoPerGiorno` riga 105, `consumoPerModello` riga 110, `riepilogoConsumo`
> riga 121; in tutto il file non c'è una sola cifra in valuta).
> `usageDellaSessione` è **definita** in
> `harness-ui/frontend/src/components/consumo-sessione.js` e qui solo importata
> (riga 42). Il caso dei 7.716 token contro i 23.060 spesi davvero è documentato
> in `consumo-sessione.js:9-10`, con l'id della sessione su cui è stato misurato.
