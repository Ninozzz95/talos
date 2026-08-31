# Consegna Fase 8C — supervisor llama-server desktop

## Stato

**Completata come primitiva isolata.** Il supervisor sa avviare e fermare un
`llama-server` locale in modo controllato, ma non è ancora collegato a route o
interfaccia.

## Comportamento fissato

- Avvio solo su `127.0.0.1` con porta validata.
- Nessuna shell e nessun comando concatenato.
- Argomenti minimi: modello, loopback, porta, chiave effimera, `--jinja`,
  `--metrics`, `--props`.
- Health polling da `503` a `200` prima dello stato `ready`.
- Crash, timeout e path relativo generano errori tipizzati.
- Stop idempotente con `SIGTERM`, rilascio del lock e stato `unavailable`.
- Log osservabili server-side; chiave e path non compaiono nello status.

## Verifica

- RED osservato prima del codice: modulo assente.
- Test mirati: **5/5 passati**.
- Suite completa Harness: **996/996 passati**.
- Sintassi e `git diff --check`: puliti.
- Nessuna verifica visiva: nessuna UI modificata.

## Decisione di piano

`server.mjs` e `config.mjs` restano invariati in questa fase. Collegarli ora
creerebbe impostazioni senza consumatore; il wiring è esplicitamente nel Task 7,
quando esisteranno adapter, policy e route reali.

## Gate ancora aperto

Il binario llama.cpp pinato non è stato avviato in questa fase. Il gate reale
health/start/stop sarà eseguito nel Task 9 con versione, build, backend e hash
registrati; nessun pass viene simulato.

## Riassunto semplice

Abbiamo costruito il “custode” del motore locale: lo avvia solo in locale, aspetta
che risponda davvero, riconosce i guasti e lo spegne senza lasciare processi
appesi. Non è ancora visibile nell’app perché prima devono essere pronti il
collegamento dati e le regole di utilizzo.
