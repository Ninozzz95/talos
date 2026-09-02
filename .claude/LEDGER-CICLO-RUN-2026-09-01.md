# Ledger a livello di codice — ciclo run, ragionamento, stop e reindirizzamento

Data: 2026-09-01  
Dossier vincolante: `DOSSIER-RICERCA-CICLO-RUN-2026-09-01.md`.

## File ammessi

### Creare

- `.claude/DOSSIER-RICERCA-CICLO-RUN-2026-09-01.md`
- `.claude/LEDGER-CICLO-RUN-2026-09-01.md`
- `.claude/CONSEGNA-CICLO-RUN-2026-09-01.md`

### Modificare

- `harness-ui/src/agui-events.mjs`
  - esportare `runRedirectRequested`, `runRedirectApplied`,
    `runRedirectCancelled`, `runRedirectFailed`.
- `harness-ui/src/session-registry.mjs`
  - aggiungere alla voce `reindirizzamentoPendente`;
  - aggiungere il metodo pubblico `reindirizza(sessionId, testo)`;
  - mantenere `accodaMessaggio`/`svuotaCoda` compatibili;
  - non drenare `codaMessaggi` mentre un redirect è pendente;
  - dopo la conclusione autoritativa del run, ripartire con
    `messaggiFinali + user message` nella stessa voce/sessione;
  - fare in modo che `ferma(sessionId)` annulli un redirect pendente e
    sblocchi in fail-closed un'eventuale approvazione in attesa.
- `harness-ui/src/http-app.mjs`
  - aggiungere `POST /api/v1/sessions/:id/redirect` con lo stesso body
    validato `{messaggio}` della coda;
  - nessuna nuova origine, verbo HTTP o capacità.
- `harness-ui/public/index.html`
  - identificare il pulsante primario del composer;
  - riusare il controllo `queueToggle` come azione esplicita
    `Reindirizza`, non come interruttore decorativo.
- `harness-ui/public/app.js`
  - aggiungere `runRealeAttivo` e `syncRunComposerState`;
  - aggiungere `reindirizzaSessioneReale`;
  - rendere il loader uno stato visibile “elabora/ragiona/prepara”;
  - sincronizzare `RunStarted`, `ReasoningMessageStart/End`,
    `RunFinished`, `RunError` e gli eventi redirect;
  - `Enter` attivo continua a chiamare `accodaMessaggioReale`;
  - click primario attivo chiama `stopRealSession`;
  - click `Reindirizza` non crea un run concorrente.
- `harness-ui/public/styles.css`
  - stato visivo del reasoning indicator con token esistenti;
  - stato stop e redirect del composer;
  - variante ridotta senza animazione e senza perdita del testo di stato.
- `harness-ui/tests/agui-events.test.mjs`
  - contratto degli eventi redirect.
- `harness-ui/tests/session-registry.test.mjs`
  - scenari di stato e gare descritti sotto.
- `harness-ui/tests/http-routes-sessions.test.mjs`
  - contratto HTTP redirect positivo e inverso.
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
  - ciclo visivo/DOM completo.
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
  - aggiornare solo dopo il GREEN intenzionale del bundle.
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`

### Vietato

- Nessun file sotto `mobile/`.
- Nessun cambiamento al runtime owner esterno.
- Nessun riavvio o interruzione del server owner `127.0.0.1:4174`.
- Nessun push.

## Simboli pubblici e compatibilità

- Restano stabili: `accodaMessaggio`, `svuotaCoda`, `ferma`, `resume`,
  `QueuedMessageDelivered`, `/queue`, `/queue/annulla`, `/stop`.
- Nuovi: `sessionRegistry.reindirizza`, endpoint `/redirect`, quattro eventi
  `RunRedirect*` additivi.
- Il runtime owner continua a ricevere `codaMessaggiFn` e `segnaleStop` nella
  stessa forma; nessun protocollo provider entra nel dominio TALOS.

## RED obbligatori

1. `REASONING-INDICATOR-01`: `ReasoningMessageStart` mostra testo visibile
   “TALOS sta ragionando” anche con ragionamento nascosto; End cambia stato e
   primo testo/tool lo rimuove.
2. `REASONING-REDUCED-MOTION-02`: il messaggio resta presente, l'animazione è
   disattivata.
3. `RUN-PRIMARY-STOP-03`: `RunStarted` trasforma il pulsante Invia in Stop;
   il click chiama una sola volta `/stop`; terminale lo ripristina.
4. `RUN-QUEUE-04`: durante un run, Enter con testo usa `/queue`, non
   `/redirect` e non `/resume`.
5. `RUN-REDIRECT-05`: durante un run con testo compare Reindirizza; il click
   usa `/redirect`, conserva il testo finché il server accetta e non crea un
   secondo run dal browser.
6. `RUN-REDIRECT-FAILURE-06`: errore HTTP lascia il testo nel composer e
   ripristina i controlli.
7. `REGISTRY-REDIRECT-07`: redirect pendente abortisce il controller, non
   drena FIFO, poi riparte stesso `sessionId` con storia + correzione.
8. `REGISTRY-REDIRECT-DUPLICATE-08`: seconda richiesta pendente rifiutata;
   nessuna doppia ripartenza.
9. `REGISTRY-STOP-CANCELS-REDIRECT-09`: Stop esplicito annulla il redirect;
   nessun resume tardivo.
10. `REGISTRY-APPROVAL-10`: redirect/stop durante approvazione sblocca la
    promessa in fail-closed.
11. `HTTP-REDIRECT-11`: body valido raggiunge il registro; id mancante,
    sessione conclusa/body vuoto tornano errore naturale e deterministico.
12. `REDIRECT-REPLAY-12`: replay degli eventi non duplica bubble o richiesta.
13. `RUN-REDIRECT-NO-FLICKER-13`: il `RunFinished` del giro interrotto non
    rimette temporaneamente Invia mentre il redirect è ancora pendente.
14. `REGISTRY-REDIRECT-TIMEOUT-14`: un timeout prima del primo token conserva
    la storia precedente o ricostruisce il task iniziale; non perde la
    correzione e non inventa `messaggiFinali`.
15. `SESSION-LOCAL-REDIRECT-02`: il runtime locale conserva nel contesto
    canonico richiesta originale, risposta parziale e correzione; la
    ripartenza non può iniziare dalla sola risposta dell'assistente.
16. `REDIRECT-REPLAY-15`: dopo un riavvio, una richiesta rimasta fra
    `RunRedirectRequested`/`RunRedirectApplied` e il nuovo `RunStarted` viene
    chiusa una sola volta con `RunRedirectFailed(SESSION_INTERRUPTED)`; non
    resta un'azione fantasma e non viene duplicata al riavvio seguente.
17. `RUN-REDIRECT-STOP-RACE-16`: se Stop annulla il redirect mentre la risposta
    HTTP è ancora in volo, l'evento autoritativo `RunRedirectCancelled` prevale
    sul successivo `200`; il testo resta nel composer e non compare un falso
    messaggio di successo.
18. `RUN-REDIRECT-PENDING-17`: finché un redirect è pendente il relativo
    pulsante resta visibile ma disabilitato; una seconda azione impossibile non
    deve essere offerta per poi fallire con `409`.
19. `REGISTRY-RESTORE-LATEST-HISTORY-18`: un registro con più snapshot
    `messaggi-finali` ripristina l'ultimo, non il primo; fork/resume dopo reload
    ereditano l'intera cronologia più recente senza tornare indietro di un turno.
20. `REDIRECT-REPLAY-OUT-OF-ORDER-19`: se le append asincrone finiscono sul
    disco fuori ordine, il replay usa `_sequenza` come ordine canonico e la
    prossima sequenza è `max + 1`; nessuna collisione può far scartare al client
    il `RunRedirectFailed` di chiusura.
21. `REGISTRY/HTTP/RUN-STOP-BEFORE-REDIRECT-20`: il client genera il
    `redirectId` prima della rete; Stop inoltra lo stesso id. Se Stop raggiunge
    il registro prima della POST redirect, l'id viene tombstonato e la richiesta
    tardiva è rifiutata senza `RunRedirectRequested`, perdita del testo o falso
    toast di successo.

## Comandi GREEN focalizzati

- `node --test harness-ui/tests/agui-events.test.mjs`
- `node --test harness-ui/tests/session-registry.test.mjs --test-name-pattern="REDIRECT|APPROVAL"`
- `node --test harness-ui/tests/http-routes-sessions.test.mjs --test-name-pattern="redirect"`
- `npm --prefix harness-ui/frontend run test:browser -- --grep "REASONING|RUN-"`

## Regressioni e gate finali

- `node --test harness-ui/tests/*.test.mjs`
- `npm --prefix harness-ui/frontend run verify`
- `npm --prefix harness-ui/frontend run test:browser`
- matrice laboratorio separata invariata;
- `git diff --check`;
- health `4174` prima e dopo, solo lettura;
- verifica reale isolata su `4175`, senza toccare il processo owner;
- screenshot e ispezione intera a `1440x900`, `1280x800`, `1024x800`,
  inclusi stato ragionamento, stop, coda, redirect pendente, errore e
  reduced-motion.

## Rollback

Rollback atomico dei soli file sopra. Gli endpoint e gli eventi sono additivi:
un client vecchio li ignora; `/queue` e `/stop` restano il percorso stabile.

## Implementazione effettiva e ricevute

Simboli aggiunti o modificati:

- `agui-events.mjs`: `runRedirectRequested`, `runRedirectApplied`,
  `runRedirectCancelled`, `runRedirectFailed`;
- `session-registry.mjs`: `negaApprovazionePendente`,
  `sessionRegistry.reindirizza`, `reindirizzamentoPendente`, conservazione del
  contesto pre-giro e fallback del primo task dopo timeout;
- `http-app.mjs`: `requireRedirectBody` e
  `POST /api/v1/sessions/:id/redirect`;
- `app.js`: `runRealeAttivo`, `syncRunComposerState`,
  `reindirizzaSessioneReale`, correlazione `redirectPendingId`, insieme
  `redirectInvalidatedIds` e `redirectRequestIntentId` per risolvere entrambe
  le direzioni della gara Stop/risposta HTTP e stati visibili
  elabora/ragiona/prepara/reindirizza;
- `index.html`: pulsante `#redirectRunButton` e primario esplicito non-submit;
- `styles.css`: stato Stop, indicatore live e variante reduced-motion.

Ricevute fresche:

- RED iniziali: export AG-UI mancanti, rotta HTTP `405`, metodo registro
  assente e controlli runtime DOM assenti;
- RED di regressione: `RUN-REDIRECT-NO-FLICKER-13` osservava il falso ritorno
  a Invia; `REGISTRY-REDIRECT-TIMEOUT-14` osservava zero ripartenze;
- backend completo: **1203/1203**;
- browser completo: **47/47**;
- build UI: **23 asset**; verifica build/contratti/determinismo verde;
- server owner `4174`: health `200`, mai fermato o riavviato;
- server isolato `4175`: health `200`, endpoint redirect reale accettato e
  correlato con `redirectId`; sessione reale
  `2511afdd-abdc-4f32-9d8e-23d30b197d65`, modello autorizzato
  `qwen/qwen3.8-flash`: primo giro in timeout, `RunRedirectRequested`,
  `RunRedirectApplied`, secondo `RunStarted` con richiesta + correzione e
  `RunFinished` con testo esatto `OK`.

Screenshot creati e ispezionati integralmente:

- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/run-reasoning-indicator-1440x900.png`;
- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/run-stop-redirect-composer-1440x900.png`;
- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/run-stop-redirect-composer-1280x800.png`;
- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/run-stop-redirect-composer-1024x800.png`.

Finding visuale non introdotto da questa slice:
`DESKTOP-1024-COMPOSER-RAIL-01` resta riprodotto: a 1024 px il rail destro è
tagliato. Stop e Reindirizza restano invece contenuti nel composer. Il debito
rimane assegnato alla fase layout, non nascosto né corretto fuori perimetro.

La review indipendente ha riprodotto e fatto chiudere prima del green:

- perdita dell'input originale nel runtime locale;
- selezione del primo snapshot anziché dell'ultimo al reload;
- redirect orfano dopo riavvio;
- collisione `_sequenza` con append fisiche fuori ordine;
- gara fra Stop e risposta HTTP tardiva;
- gara inversa, con Stop arrivato al server prima della richiesta Redirect;
- secondo Reindirizza offerto mentre il primo era già pendente.

Gate visivo e gate provider restano dichiaratamente distinti: le PNG usano
eventi deterministici sugli handler reali, mentre la sessione Qwen su `4175`
prova runtime/API/SSE senza una cattura browser del suo turno.
