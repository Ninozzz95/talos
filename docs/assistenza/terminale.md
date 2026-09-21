# Terminale

## Cosa fa

È un terminale **vero**, non la trascrizione di uno.

Le schede sono di due tipi, e ognuna dichiara **chi l'ha aperta e dove sta**:
quelle lanciate dall'agente (con il numero del giro in cui è successo) e quelle
che apri tu. Il piede della scheda ripete il fatto: chi l'ha lanciata, da quanto
va, com'è finita.

Si tiene un massimo di **otto schede** per sessione.

## Cosa non fa

- Non è isolato dal resto del computer. L'etichetta a schermo dice dove sta
  girando; non promette un isolamento che non c'è.
- ⛔ **Un comando nel terminale può scrivere file anche quando l'attrezzo di
  scrittura è negato.** È il limite descritto in
  [I permessi di ogni singolo attrezzo](permessi-per-attrezzo.md).

## Come si usa

- Clic su una scheda per selezionarla; clic centrale (o Ctrl e clic) per
  chiuderla.
- Menu contestuale: chiudi, chiudi le altre, chiudi tutte.
- Da tastiera, dentro l'elenco delle schede: frecce per muoversi, Inizio e Fine
  per gli estremi, Canc per chiudere, F2 per rinominare.
- Alla chiusura di una scheda il fuoco passa a quella che prende il suo posto.
- Il nome della shell resta finché non ne scegli uno tu.

## Se va storto

- **Non si aprono nuove schede** — hai raggiunto il tetto di otto. Chiudine una.
- **Una scheda resta ferma** — il piede dice da quanto tempo e in che stato è.

> Verificato in `harness-ui/frontend/src/components/terminale.js`: il tetto è
> `SCHEDE_MASSIME = 8` (riga 28, «stesso tetto di `SCHEDE_MASSIME_PER_SESSIONE`
> del server»); le voci del menu contestuale sono alle righe 36-37 («Chiudi le
> altre», «Chiudi tutte»); il clic centrale chiude davvero (riga 251, `auxclick`
> con `e.button === 1`) e Ctrl-clic anche (riga 249); F2 rinomina alla riga 269; che ogni scheda dichiari chi l'ha aperta e dove sta
> è ⚠ **non verificato nel codice vivo** — la riga 22 che lo afferma è un **commento**; il nome della shell resta finché
> non se ne sceglie uno (righe 96-115).
