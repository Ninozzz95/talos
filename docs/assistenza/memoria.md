# Memoria

## Cosa fa

Sono le cose che TALOS deve ricordare oltre la singola conversazione. Ogni
ricordo ha un tipo:

- **Preferenza** — come vuoi che le cose siano fatte.
- **Fatto** — qualcosa di vero sul progetto.
- **Procedura** — come si fa una cosa.
- **Regola** — un vincolo da rispettare.

Si cerca nel testo e si filtra per tipo.

## Cosa non fa

- Non ricorda da sola tutto quello che succede: un ricordo lo scrive l'agente
  quando decide che serve, o lo scrivi tu.
- Un ricordo senza tipo dice «Tipo non registrato» invece di essere messo
  d'ufficio in una delle quattro caselle.
- ⛔ **I ricordi non entrano da soli in quello che il modello legge prima del
  tuo messaggio.** Il preambolo è fatto di **quattro** blocchi — le istruzioni
  del motore, le istruzioni del progetto, la mappa delle cartelle, la scheda di
  lavoro — e la memoria **non è uno di quelli**. Il modello la rilegge da sé, quando serve, con l'attrezzo di
  ricerca nella memoria. È anche il motivo per cui quella lettura è classificata
  R2 e non R1 nell'[Officina attrezzi](officina-attrezzi.md): un ricordo scritto
  oggi verrà riletto in conversazioni future.

  > Verificato in `harness-ui/src/contesto-del-progetto.mjs`, che nel proprio
  > titolo scrive «COS'È ADESSO — **QUATTRO BLOCCHI**, IN ORDINE DI STABILITÀ» e
  > li numera: 1. istruzioni del kernel (`talosHarness.mjs`, `ISTRUZIONI`),
  > 2. istruzioni di progetto, 3. mappa delle cartelle, 4. scheda di lavoro. Quel
  > file compone i blocchi 2-4; il blocco 1 glielo mette davanti il kernel. La
  > prova che li conta è `harness-ui/tests/preambolo-quattro-blocchi.test.mjs`.
  > La classificazione **R2** di `memory.search` si legge in
  > `harness-ui/src/forge-contract.mjs:16`
  > (`'memory.search': { actions: ['read'], risk: 'R2' }`); il deposito è
  > `harness-ui/src/memory-store.mjs`, e i quattro tipi stanno in
  > `harness-ui/frontend/src/components/memoria.js` (`GENERI`, con «Tipo non
  > registrato» per ciò che non si riconosce).
  > ⛔ Correzione del 13/09/2026: questa riga diceva **tre** blocchi, e il codice
  > ne dichiara quattro nel proprio titolo.

## Come si usa

Dalla voce **Memoria** della barra laterale: si creano, si aprono, si modificano
e si eliminano. Le stesse operazioni le può fare l'agente.

## Se va storto

- **Un ricordo che ti aspetti non c'è** — non è stato scritto. La memoria non è
  una registrazione automatica della conversazione.
