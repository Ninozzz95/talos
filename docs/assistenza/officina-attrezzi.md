# Officina attrezzi

## Cosa fa

È dove **tu** costruisci un attrezzo nuovo per l'agente, senza scrivere codice:
si compone mettendo insieme capacità già esistenti e decidendo cosa fa in quali
condizioni.

Le capacità disponibili oggi sono **otto**, e sono queste:

| capacità | cosa fa | rischio |
|---|---|---|
| elenco delle attività | legge | R1 |
| creazione di un'attività | scrive | R2 |
| modifica di un'attività | scrive | R2 |
| elenco delle note | legge | R1 |
| scrittura di una nota | scrive | R2 |
| modifica di una nota | scrive | R2 |
| ricerca nella memoria | legge | **R2** |
| scrittura in memoria | scrive | R3 |

⛔ Memoria ha **solo** ricerca e scrittura: fra le capacità forgiabili non c'è
un «elenca la memoria» né una correzione.

Ogni attrezzo forgiato porta **un livello di rischio**, che nasce dalla capacità
più rischiosa che usa:

- **R1** — legge, e basta.
- **R2** — scrive qualcosa, **oppure legge la memoria**.
- **R3** — scrive nella memoria di lungo periodo.

⛔ «R1 = sola lettura» sarebbe comodo ed è **falso**: *ricerca nella memoria*
legge soltanto, ed è classificata **R2**. Il motivo sta nel prodotto: la memoria
il modello **se la rilegge da solo** in ogni conversazione futura, quindi
leggerla non è innocuo come leggere una nota che rileggi tu quando vuoi. Il
rischio di un attrezzo forgiato è sempre quello della sua capacità **più
rischiosa**.

Ogni attrezzo si può **abilitare e disabilitare** uno per uno.

## Cosa non fa

- Non dà accesso al disco, alla rete o al terminale: le capacità sono solo
  quelle dell'elenco.
- Un attrezzo senza descrizione dichiara «Descrizione non disponibile», e uno
  senza capacità dichiarate lo dice: non vengono dedotte.
- Se lo stato di abilitazione non è registrato, la riga dice «Stato non
  registrato» invece di mostrare un interruttore che mente.

## Come si usa

1. Voce **Officina attrezzi** nella barra laterale.
2. Si sceglie un attrezzo dall'elenco per vederne dettaglio, capacità, rischio e
   data di installazione.
3. Si abilita o disabilita dal dettaglio.

Un attrezzo abilitato compare fra gli attrezzi dell'agente e segue le regole di
[permesso per attrezzo](permessi-per-attrezzo.md) come tutti gli altri.

## Se va storto

- **Un attrezzo forgiato non viene mai usato** — controlla che sia abilitato, e
  che il suo permesso non sia su «Nega».
- **«Capacità non riconosciuta»** — l'attrezzo dichiara una capacità che questa
  versione non conosce.

> Verificato in `harness-ui/src/forge-contract.mjs:10-17`, dove le **otto**
> capacità e il loro rischio stanno in una tabella sola: `tasks.list` R1,
> `tasks.create` R2, `tasks.setStatus` R2, `notes.list` R1, `notes.create` R2,
> `notes.update` R2, **`memory.search` R2** (legge soltanto, e vale R2) e
> `memory.create` R3. Che il rischio di un attrezzo forgiato sia quello della sua
> capacità più rischiosa è la riga 122 (`RISK_ORDER`, si tiene il massimo). Gli
> stessi otto alias sono in `harness-ui/frontend/src/components/officina.js:5`, e
> i nomi umani in `harness-ui/frontend/src/components/nomi-attrezzi.js:49-59`. I
> ripieghi «Descrizione non disponibile», «Nessuna capacità dichiarata»,
> «Capacità non riconosciuta» e «Rischio non registrato» sono alle righe **9, 13, 14
> e 18** di `officina.js` — «Stato non registrato» sta alla 9, fuori dall'intervallo
> che questa riga dichiarava prima.
