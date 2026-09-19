# BRIEF — CORSIA D · elimina e rinomina i modelli installati

> FASE 4-bis, owner 19/09/2026: «**Download non ha tutte le opzioni: non posso eliminare i modelli
> installati, non posso rinominarli. Questo è tutto previsto dal backend su 4174**».
> Metodo: quello delle Impostazioni. Modello: **Opus 5, high**.

## ⛔ COSA ESISTE GIÀ (misurato il 19/09/2026)

- ⛔ **Il backend LE HA, ed è verificato alla fonte** — `harness-ui/src/http-app.mjs:1251`:
  ```
  { schema: /^\/api\/v1\/local-models\/([^/]+)\/(rename|copy-path|delete)$/, metodi: ['POST'] }
  ```
  e il deposito è `harness-ui/src/local-model-store.mjs` (con una richiesta del 06/09
  «INST-DELETE-FILE»: «*«Elimina» toglieva solo i manifest e […]»* — leggi quel commento, dice cosa
  è già stato pagato).
- **Da noi**: `components/download-coda.js` (407 righe, FASE 4) e `components/modelli-installati.js`
  (265) mostrano la coda e gli installati; la riga di un modello completato ha «**Vedi modello**» e
  basta. **Nessuna azione di eliminazione o rinomina.**
- Il mockup **non le ha** (l'owner l'ha detto lui stesso): qui **non c'è parità da fare**, c'è una
  funzione del prodotto da portare a schermo.
- ⛔ E la riga del download **non deve perdere** quello che ha: i contatori coerenti, «Riprendi» dove
  il trasporto riprende, lo stop solo dove è accettato, le percentuali solo se calcolabili.

## Il tuo compito

Portare a schermo **«Elimina»** e **«Rinomina»** per un modello installato, **collegate alle rotte
vere** (`POST /api/v1/local-models/<id>/delete` e `…/rename`), con:
- **l'eliminazione a due passi** (la prima conferma non cancella: arma; la seconda esegue), il fuoco
  su «Annulla», e la **frase che dice cosa sparisce davvero** (il file sul disco, non un manifest);
- **la rinomina in un campo** che dice cosa cambia (il nome mostrato? il file? — **misura la rotta e
  dillo**: `rename` sul deposito può toccare il manifest E il file, e la differenza conta);
- **il verso che deve fallire**: chiave o id inesistente, modello in uso, rete assente → lo stato
  d'errore si vede, e **non** si finge riuscito.

## I tuoi file — e SOLO questi

- `harness-ui/frontend/src/components/download-coda.js`
- `harness-ui/frontend/src/components/modelli-installati.js`
- `harness-ui/frontend/tests/browser/lab-download.spec.mjs` (le asserzioni si **rileggono** se cambia
  la riga: si adatta il **bersaglio**, mai il significato)
- un nuovo `harness-ui/frontend/tests/browser/lab-installati-azioni.spec.mjs`

⛔ **NON toccare**: `src/legacy/app.js`, `index.template.html`, `lab-cornice-v3.js`,
`provider-card.js`, `catalogo-*.js`, `misura-memoria.js`, `src/styles/*` (la chiedi), `public/*`,
gli altri spec. ⛔ **E il 4174 non si scrive**: le rotte di eliminazione/rinomina **non si provano
sul server dell'owner** — si provano sul **tuo** server isolato, con lo store isolato.

## Ricerca — fatta per questo passo (19/09/2026), e vale come metro

- **Le azioni distruttive vogliono due passi**: prima si arma, poi si conferma; il fuoco parte su
  «Annulla»; il pulsante finale è **disabilitato finché non è armato**; il pannello vive **dentro la
  riga** a cui appartiene, non in fondo alla sezione.
- **Etichette verbo + nome** («Elimina modello»), mai «Conferma»/«OK» nudi su un'azione distruttiva;
  «Annulla» resta «Annulla».
- **ESC chiude sempre** (WCAG 2.1.2); su un form con dati **non si chiude dal velo**.
- Uno stato d'errore **onesto**: non sopravvive a un'operazione riuscita, e dice cosa è successo.
  Fonti: <https://vercel.com/geist/modal> · <https://docs.cognite.com/aura-design-system/primitives/dialog> ·
  <https://dev.to/wdsega/component-deep-dive-47-modal-dialog-focus-trap-and-scroll-lock-are-non-negotiable-2ff3> ·
  <https://appmaster.io/it/blog/tasks-in-background-progress-updates-ui-patterns> (lette il 19/09/2026).
- ⛔ **E la ricerca che serve a TE, da fare per prima**: **cosa fa esattamente `rename`** sul deposito
  (`local-model-store.mjs`) e **cosa tocca `delete`** — leggilo nel sorgente, non dedurlo, e riportalo.

## Cosa dichiara finito il tuo lavoro

1. «Elimina» e «Rinomina» **funzionanti sulle rotte vere**, viste sul **4174** (nei due temi, 1024 e
   1440, **foto a pagina intera, guardate** — l'azione sul 4174 si **fotografa**, non si esegue).
2. Il **verso che fallisce** provato: id inesistente → lo stato d'errore si vede.
3. La riga del download **non perde** niente di quello che la FASE 4 le ha dato (contatori, etichette,
   percentuali): lo dichiari col confronto prima/dopo.
4. Il tuo spec nuovo verde, `lab-download` riletto verde, i cancelli degli altri verdi.
5. Per ogni difesa, **il rosso provato** (baseline verde, una rottura sola, ripristino al byte).

## Regole di casa

⛔ Niente `npm run build`/`public/`/commit · **4174 sola lettura** (non-GET fermate e contate) ·
**porta tua, 4218** · i selettori **dal sorgente** · ciò che non si collega **si elenca**.
