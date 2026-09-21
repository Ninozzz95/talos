# Estensioni: skill, server MCP, plugin, hook

## Cosa fa

Sono i quattro modi per aggiungere qualcosa a TALOS **dal tuo progetto**. Ognuno
si dichiara in un posto preciso dentro la cartella del progetto:

| tipo | cosa aggiunge | dove si dichiara |
|---|---|---|
| **Skill** | istruzioni che l'agente carica quando servono | cartella `.harness-ui-skills/` |
| **Server MCP** | attrezzi forniti da un programma esterno | file `.harness-ui-mcp.json` |
| **Plugin** | attrezzi e agganci insieme | cartella `.harness-ui-plugins/` |
| **Hook** | un comando che parte a un momento preciso | file `.harness-ui-hooks.json` |

Gli agganci possibili sono quattro: **prima** di usare un attrezzo, **dopo**
averlo usato, all'**avvio** della sessione, alla **fine** della sessione.

## Cosa non fa

- ⛔ **La fiducia è separata dalla presenza.** Un'estensione dichiarata non è
  automaticamente attiva: finché non la marchi come fidata, la riga dice «Da
  fidare». Le skill fanno eccezione: sono solo istruzioni, e la loro
  riga dice «Disponibile».
- ⛔ **L'inventario di un hook non mostra il comando che eseguirà.** Dice quando
  parte, e ti dice esplicitamente di **guardare il file del progetto prima di
  fidarti**. È voluto: fidarsi di un comando che non hai letto è la cosa che
  questo elenco esiste per impedire.
- **Per i server MCP, la connessione non è osservata** da questo inventario:
  vedi cosa è dichiarato, non se risponde.
- Le istruzioni complete di una skill non stanno qui: stanno nel suo file dentro
  il progetto.

## Come si usa

1. Metti i file nel progetto, nei posti della tabella.
2. Apri l'inventario delle estensioni e aggiorna.
3. Leggi cosa dichiarano. Per hook, MCP e plugin, **apri il file del progetto**.
4. Solo dopo, marca come fidato.

## Se va storto

- **Un'estensione non compare** — il file o la cartella non sono nel posto
  giusto, o non sono nella cartella della sessione aperta.
- **«Fiducia non osservata»** — lo stato non è stato letto: aggiorna
  l'inventario.
- **Un hook non parte** — controlla che sia fidato e che l'evento sia quello che
  credi.

> Verificato in `harness-ui/frontend/src/components/estensioni.js`: gli `ORIGINI`
> (riga 3) sono esattamente `.harness-ui-skills/`, `.harness-ui-mcp.json`,
> `.harness-ui-plugins/`, `.harness-ui-hooks.json`; gli `EVENTI` (riga 2) sono i
> quattro «Prima di usare un attrezzo», «Dopo aver usato un attrezzo», «All'avvio
> della sessione», «Alla fine della sessione», e il server accetta solo quelli
> (`harness-ui/src/hook-registry.mjs:49`, `EVENTI_VALIDI`). Gli stati della
> fiducia sono alla riga 7: «Disponibile» per le skill, altrimenti «Fidato» / «Da
> fidare» / «Fiducia non osservata». Che l'inventario non mostri il comando di un
> hook è la riga 11 («Non esposto dall'inventario. Verificalo nel file del
> progetto prima di fidarti.»), e la connessione MCP «Non osservata da questo
> inventario» è alla riga 10.
