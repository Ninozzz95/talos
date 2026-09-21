# Delega a un sotto-agente

## Cosa fa

TALOS può affidare un pezzo di lavoro a una **sessione figlia**: lavora in una
cartella sua, con i suoi giri, e al padre riporta **solo il risultato**.

Serve a non far passare tutto il materiale di un sotto-lavoro dentro la
conversazione principale: la figlia legge, prova, sbaglia e ritenta per conto
suo, e quello che torna su è l'esito.

Le figlie si guardano dalla scheda **Agenti** del pannello di destra. La
conversazione di una figlia si apre **lì dentro**, con un «Indietro» che riporta
all'elenco: la chat del padre non si muove di un pixel.

Per ogni figlia si vedono lo stato, il modello, quanti giri ha fatto e quante
chiamate ad attrezzi. Gli stati sono quattro:

- **In corso** — sta lavorando.
- **Conclusa** — ha finito.
- **Non riuscita** — si è fermata su un errore.
- **Interrotta** — chiusa a metà.

## Cosa non fa

- ⛔ **Le figlie non sono infinite.** Ne possono lavorare **dieci insieme** sotto
  lo stesso padre: oltre quel numero la delega viene **rifiutata**, e il rifiuto
  dice perché.
- ⛔ **Una figlia non può delegare all'infinito.** La profondità massima è
  **due**: una figlia può avere le sue figlie, ma lì la catena si ferma. Anche
  questo rifiuto è esplicito.
- **Il modello di una figlia non si indovina.** Finché la figlia non dichiara su
  cosa sta girando, al suo posto c'è un trattino: un nome di ripiego sarebbe un
  modello inventato.
- Quando degli eventi non si riescono a collegare a niente, vengono **scartati e
  contati**, non nascosti: la riga dice quanti.

## Come si usa

Non si avvia a mano: è il modello che decide di delegare, quando il lavoro si
divide bene. Tu lo vedi succedere nella scheda **Agenti**, e da lì puoi entrare
nella conversazione di ciascuna figlia.

Vale la pena saperlo per due motivi: capire perché un pezzo di lavoro non
compare nella chat principale, e sapere dove guardare quando una delega non
torna.

## Se va storto

- **«limite di 10 figli concorrenti raggiunto»** — troppe deleghe insieme.
  Aspetta che qualcuna finisca.
- **«profondità di delega massima raggiunta (limite 2)»** — la catena era già a
  due livelli. Non è un guasto: è il tetto.
- **Una figlia resta «In corso» e non finisce** — aprila dalla scheda Agenti e
  guarda i suoi giri: è la stessa diagnosi di una sessione qualunque.

> Verificato in `harness-ui/src/subagent-orchestrator.mjs:25` e `:35`
> (`LIMITE_FIGLI_CONCORRENTI = 10`, `LIMITE_PROFONDITA_DELEGA = 2`) e alle righe
> 255-260, dove nascono **le due frasi esatte** riportate qui sopra. Sono
> minuscole perché arrivano dal server come `motivo` e l'interfaccia non le
> ritocca — `harness-ui/frontend/src/components/conversazione-figlia.js:270`: «Il
> motivo è il messaggio del server, non una frase nostra». I quattro stati sono
> alle righe 79-84 dello stesso componente (`ETICHETTA_STATO_FIGLIA`: «In corso»,
> «Conclusa», «Non riuscita», «Interrotta»). L'attrezzo si chiama
> `delega_sottotask` (`harness-ui/src/kernel/talosHarness.mjs:1806`).
> ⛔ Correzione del 13/09/2026: le due frasi erano citate con l'iniziale maiuscola
> e senza «(limite 2)».
