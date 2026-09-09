# LEDGER — Il bundle canonico è cambiato, il commento no (02/09)

> Trovato ispezionando la lane dopo che Codex ha esaurito i crediti (owner:
> *"ispeziona la lane desktop... e dammi il punto della situazione"*).
> Non una scoperta isolata: è il motivo per cui questo file esiste.

## Il fatto, verificato non presunto

Al mio ultimo commit (`6527ffa6`), `config.mjs#loadConfig` risolveva
`publicDir` di default a `mobile/public/harness-ui/` (DEC-053, 26/8).
Al commit `16677c48` ("feat(harness-ui): chiude i tre blocchi runtime
desktop", 31/8 22:02), la riga è cambiata a `./public/`
(`harness-ui/public/`) — **senza toccare il commento sopra**, che
continuava a descrivere DEC-053 come se fosse ancora vera.

Confermato dal vivo, non dedotto: il server (`127.0.0.1:4174`) serve
`app.js` da **530.197 byte**, combacia esattamente con
`harness-ui/public/app.js` — `mobile/public/harness-ui/app.js` (435.708
byte) è fermo al 31/8 ore 14:52, ~95KB e ~36 ore indietro.

## Non un refuso — verificato leggendo lo STESSO commit

`16677c48` porta ANCHE `harness-ui/public/talos/brand/` (font e logo
propri, prima presi in prestito dal mobile) e due script nuovi,
`harness-ui/scripts/build-ui.mjs`/`verify-ui-manifest.mjs`, che hanno
`harness-ui/public` come sorgente CABLATA (`SOURCE = ... join(ROOT,
'public')`, il manifest scrive `source: 'harness-ui/public'`). Il
desktop si è dato un bundle proprio — font, logo, pipeline di build e
verifica — invece di continuare a dipendere da quello del mobile.
Direzione ragionevole per un prodotto che matura. Il problema non è la
decisione: è che nessun commento/ledger l'ha mai dichiarata come tale.

## Il piano stesso lo conferma, un giorno dopo — non era del tutto silenzioso

`PIANO-COMPLETO-DESKTOP-2026-08-31.md`, sezione Fase 2 (01/09), dice
esplicitamente: *"Il desktop non modificherà `mobile/public/harness-ui`,
il cui riallineamento resta responsabilità della lane mobile."* — quindi
al livello del PIANO la separazione è stata dichiarata, solo un giorno
dopo il commit che l'ha resa vera nel codice. Restavano stonati solo
due punti più vecchi, scritti PRIMA di questa dichiarazione: il
commento di `config.mjs` (mai più toccato da allora) e la sezione
"Fase 5 — parità Model Lab mobile" dello stesso piano (scritta il
31/8, mai aggiornata dopo).

## Corretto in questo giro (solo documenti, zero comportamento cambiato)

- `harness-ui/src/config.mjs`: commento riscritto, racconta cosa è
  successo davvero, cita il commit, lascia esplicitamente aperta la
  domanda sul ponte `adb reverse` verso il telefono che DEC-053
  proteggeva (vedi sotto).
- `PIANO-COMPLETO-DESKTOP-2026-08-31.md`, sezione Fase 5: i tre percorsi
  `mobile/public/harness-ui/*` corretti a `harness-ui/public/*`, con una
  nota che spiega perché — questa è l'UNICA sezione ancora aperta
  (⏳, non ✅) che usava il percorso sbagliato; le sezioni P0 più in alto
  nello stesso file sono storia di lavoro già FATTO (verificato contro
  la tabella "Addendum P0 UX", tutte ✅) e sono state lasciate intatte
  di proposito — riscriverle avrebbe falsificato cosa è successo
  davvero, non solo corretto un percorso.
- `harness-ui/tests/windows-open-with-talos.test.mjs`: 4 test falliti,
  causa isolata (un `resolve('harness-ui/scripts/windows')` presumeva
  il cwd della radice repo) — ancorato a `import.meta.url`, verificato
  5/5 da ENTRAMBE le cartelle di lancio. Non legato al bundle canonico,
  trovato nella stessa sessione di verifica.
- Rimosso `harness-ui/console.error(e))'` — un file da 0 byte, residuo
  di un redirect di shell finito male.

## Aperto, NON deciso qui — serve l'owner

DEC-053 esisteva anche per un motivo che il nuovo bundle non copre da
solo: servire la STESSA pagina al telefono via tunnel `adb reverse`
(piano §3, mai implementato). Se quell'intento è ancora vivo, il
telefono aggancerebbe ora un bundle esplicitamente desktop (font/logo
propri) — va ripensato, non presunto. `mobile/public/harness-ui/`
resta sul disco, stantio, non cancellato: nessuno l'ha dichiarato morto
per iscritto, e non lo dichiaro morto qui.

## Verificato

Backend completo dopo tutte le correzioni di questo giro: **1259/1259**
(`node --test tests/**/*.test.mjs`, dalla radice `harness-ui/`).

## Stato

✅ Documentazione riconciliata con la realtà del codice. 🔜 La domanda
sul ponte adb-reverse resta aperta, per l'owner.
