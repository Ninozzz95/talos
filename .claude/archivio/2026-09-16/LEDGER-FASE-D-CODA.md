# FASE D — Coda: un messaggio su una sessione ANCORA IN CORSO — ledger a basso livello

> Scorporata da `elegant-spinning-dongarra.md`. Aperta dopo FASE C
> (sub-agenti, ✅ chiusa 28/8, `LEDGER-FASE-C-SUBAGENTI.md`), su ordine
> diretto dell'owner: *"Ottimo, vai alla fase successiva."*
>
> ⛔ **Collisione di nome, dichiarata**: nello stesso file kernel
> condiviso (`talosHarness.mjs`) esiste GIÀ una "FASE D" — quella di
> un'ALTRA sessione (avm-75), un piano diverso (kernel headless,
> "ricevuta d'operazione universale", commit `6c852115`/`76f93c07`).
> Sono due fasi D, di due documenti diversi, che condividono solo il
> nome e il file. Questo ledger riguarda ESCLUSIVAMENTE la fase D di
> `elegant-spinning-dongarra.md` (coda messaggi).

## Stato: ✅ CHIUSA 28/8 — D.1/D.2/D.3 tutte verificate dal vivo

> ✅ **D.1 chiusa**, `AVM-harness` commit `10883c9d`, committato pulito
> (nessuna collisione questa volta — working tree verificato clean
> subito prima). 182/182 kernel verdi, TALOS-BANCO ri-misurato
> byte-identico, $0.
>
> ✅ **D.2/D.3 chiuse**, `AVM-harness-desktop`. Backend: `session-registry.mjs`
> (`accodaMessaggio`/`svuotaCoda`/`codaMessaggiFn`, + evento
> `QueuedMessageDelivered` — vedi "Corretto durante l'implementazione"
> sotto), `agent-service.mjs` (passthrough), `http-app.mjs`
> (`POST .../queue`, `POST .../queue/annulla` — **non DELETE**, vedi
> sotto), `agui-events.mjs`. Frontend: `accodaMessaggioReale`/
> `renderizzaBannerCoda`/case `QueuedMessageDelivered` in `app.js`,
> `#queuedMessageText` in `index.html`. 494/494 backend (+18 da questa
> fase), 160/160 harness frontend (+2), 6644/6686 suite intera (stessi
> 32 falliti pre-esistenti ed estranei). **Verificato DAL VIVO**
> (`qa-visual-pipeline.mjs`, scenario `fase-d-coda-messaggi`, modello
> reale su `talos-prova-harness`): un secondo messaggio scritto MENTRE
> il primo turno leggeva/scriveva è entrato in coda (mai rifiutato),
> il banner ha mostrato il testo vero, e al termine del primo turno il
> messaggio è arrivato DAVVERO al modello — verificato non solo in
> chat ma **sul file scritto sul disco** (contiene il testo di
> ENTRAMBI i turni). Zero difetti, screenshot ispezionati uno per uno.

### Corretto durante l'implementazione (rispetto al design originale sotto)

- **`POST .../queue/annulla`, non `DELETE .../queue`**: il ledger
  originale (D.2 sotto) prevedeva un verbo HTTP DELETE — scritto
  PRIMA di aprire `http-app.mjs` per davvero. Nessun'altra rotta di
  questo file usa mai DELETE (anche eliminare un file dell'albero è
  `POST .../tree/delete`), e CORS dichiara solo `GET, HEAD, POST` —
  seguito lo stile reale del codice invece della lettera del ledger.
- **Nuovo evento AG-UI non-standard `QueuedMessageDelivered`** (non
  previsto nel design originale): un'euristica lato client per capire
  QUANDO il kernel ha consumato un messaggio dalla coda si è rivelata
  ambigua in fase di design (lo stesso pattern di eventi — un
  `TextMessageEnd` seguito da un nuovo `ToolCallStart` senza
  `RunFinished` in mezzo — succede ANCHE quando il modello risponde
  con testo+tool_calls misti nello stesso giro, senza che la coda
  c'entri). Cura: `session-registry.mjs`'s `codaMessaggiFn` emette
  `QueuedMessageDelivered({testo})` esattamente quando `shift()` torna
  qualcosa di non-null — stesso principio già usato per
  `WorkspaceChanged`/`ApprovalRequested` (evento dichiarato fuori
  schema pubblico AG-UI). Il frontend mostra il bubble utente SOLO a
  quell'evento, mai ottimisticamente al POST (un messaggio può
  restare in coda per giri interi mentre il modello chiama altri
  attrezzi — mostrarlo subito in chat mentirebbe su cosa il modello ha
  già visto).
- **Il toggle "Follow-up"/`queueToggle` nel composer** (elemento UI
  preesistente, separato dal comportamento automatico di FASE D)
  dichiarava "nessun percorso reale" — claim ora falso, corretto il
  messaggio del suo toast per non essere un bluff residuo (il
  comportamento resta automatico per ogni messaggio, il toggle non ha
  un ruolo aggiuntivo — non gli è stata data una funzione nuova, solo
  tolta la bugia).

## Contesto

Oggi un follow-up mentre `talosLavora` sta ancora girando è
onestamente rifiutato — il composer, se `state.realSession.inCorso`,
mostra un toast "Messaggio non consegnato" (già visto più volte in
questa sessione durante le verifiche di FASE B/C: proteggeva proprio
questo limite). Codex CLI risolve lo stesso problema con un comando
dedicato, `codex queue --thread <id> --message <testo>` — verificato
empiricamente sulla macchina locale (`codex queue --help`), non da una
fonte web.

## Obiettivo

Un messaggio scritto mentre l'agente sta ancora lavorando non si perde
mai: entra in una coda vera, e viene consegnato al modello nel punto
giusto — quando il turno CORRENTE conclude naturalmente, mai a metà di
una sequenza di tool-call.

## Confronto competitivo

Pareggia Codex CLI su un punto preciso e verificato (non
un'impressione). Nessun altro concorrente esaminato in questo piano
documenta esplicitamente questa capacità con lo stesso dettaglio.

## Criterio di completamento

1. Un messaggio inviato mentre una sessione reale sta ancora girando
   NON è più rifiutato: entra in coda.
2. Il messaggio arriva DAVVERO al modello, come un nuovo turno utente,
   nel punto in cui il modello avrebbe concluso da solo — mai mentre
   sta ancora chiamando attrezzi (verificato al livello kernel, D.1).
3. La UI mostra la coda VERA (testo reale, non un banner statico), con
   un modo reale di annullarla prima che venga consegnata.
4. Più messaggi in coda vengono consegnati in ordine (FIFO), uno per
   ogni punto di conclusione naturale — non solo un singolo slot.
5. Dal vivo: una sessione reale in corso riceve un secondo messaggio
   dal composer, il messaggio NON viene rifiutato, e compare nella
   chat come un turno reale una volta che il modello lo raggiunge —
   screenshot ispezionati.

## Ledger tecnico

### D.1 — Kernel (`AVM-harness/.../talosHarness.mjs`) — ✅ CHIUSO

`talosLavora` guadagna `codaMessaggiFn?: () => string | null | undefined`,
opzionale (assente = comportamento di oggi, invariato bit-per-bit —
TALOS-BANCO non lo passa mai). Controllata SOLO nel punto dove
`chiamate.length === 0` (il modello ha appena deciso da solo di
concludere, zero tool-call nell'ultima risposta): se torna un testo
troncabile a vero (non vuoto/spazi), viene aggiunto a `messaggi` come
`{role:'user', content: testo}` e il ciclo `continue`-a invece di
`break`-are. Un `codaMessaggiFn` che lancia è trattato come coda vuota
(try/catch, stessa disciplina di `chiediApprovazioneFn`/`hookFn`) — mai
un cancello rotto che interrompe un task altrimenti riuscito.

⛔ Il file NON tiene una coda propria: `codaMessaggiFn` è chiamata e
basta, ad ogni possibile punto di conclusione — chi la implementa
(D.2) decide l'ordine di consegna (FIFO) e come consumare ogni
elemento (tipicamente `array.shift()`).

Test: 6 nuovi (PARITÀ, consegna reale con verifica del messaggio
ESATTO mandato al modello, mai chiamata durante le tool-call,
drenaggio multi-messaggio in sequenza, cancello che lancia, stringa
vuota trattata come assente). 182/182 verdi.

### D.2 — Backend (`AVM-harness-desktop/harness-ui/src/`)

- `session-registry.mjs`: `voce.codaMessaggi: string[]` (FIFO, default
  `[]`) — nuovo campo nella voce sessione, stesso pattern di
  `padreId`/`profonditaDelega` (FASE C).
- `avviaESegui` costruisce SEMPRE `codaMessaggiFn: () =>
  voce.codaMessaggi.shift() ?? null` (sincrono, stesso principio di
  `hookFn`/`onDelega` — costruito a prescindere, il vero contenuto
  vive nella voce) e lo passa ad `avviaSessioneFn`.
- Nuovo metodo pubblico `accodaMessaggio(sessionId, testo)`:
  - Sessione inesistente → `{erroreAvvio, code:'NOT_FOUND'}`.
  - Sessione GIÀ conclusa → `{erroreAvvio, code:'SESSION_NOT_READY'}`
    (per una sessione conclusa il percorso giusto resta `resume()`,
    non la coda — due meccanismi per due stati diversi, mai
    sovrapposti).
  - `testo` vuoto/spazi → `{erroreAvvio, code:'QUERY_INVALID'}` (stesso
    principio "mai un turno utente vuoto" già nel kernel, D.1 — qui
    validato PRIMA che possa mai raggiungere la coda).
  - Altrimenti: `voce.codaMessaggi.push(testo)`, ritorna
    `{ok:true, posizione: voce.codaMessaggi.length}`.
- Nuovo metodo pubblico `svuotaCoda(sessionId)` (per "Annulla" in UI):
  rimuove UN elemento dalla coda (l'ULTIMO aggiunto — coerente con "ho
  cambiato idea sul messaggio che ho appena scritto", non un
  azzeramento totale che cancellerebbe messaggi più vecchi già in
  attesa) — `{ok:true, rimosso: boolean}`.
- `agent-service.mjs`: `avviaSessione` accetta e inoltra
  `codaMessaggiFn` a `talosLavoraFn` senza logica propria (stesso gap
  già chiuso per `hookFn`/`onDelega` nelle fasi precedenti — qui
  aggiunto nello stesso commit, non un secondo giro).
- `http-app.mjs`:
  - `POST /api/v1/sessions/:id/queue` `{messaggio: string}` →
    `sessionRegistry.accodaMessaggio(sessionId, messaggio)`.
  - ✅ **Corretto in implementazione**: `POST /api/v1/sessions/:id/queue/annulla`
    (non `DELETE .../queue` come previsto qui sotto — nessun'altra rotta
    del file usa mai il verbo DELETE, CORS dichiara solo GET/HEAD/POST,
    vedi la nota "Corretto durante l'implementazione" in cima al file).
  - Validazione FORMA (stringa non vuota) nel corpo, stesso schema
    delle altre rotte POST.

### D.3 — Frontend (`mobile/public/harness-ui/`) — ✅ CHIUSO

- Il composer, quando `state.realSession.id && !eventoTerminaleVisto`:
  invece di rifiutare con il toast "Messaggio non consegnato", POSTa a
  `.../queue` (`accodaMessaggioReale`). Il campo si svuota, un toast
  onesto conferma ("Messaggio in coda — arriverà quando l'agente
  conclude il turno corrente").
- Il banner `#queuedMessage` mostra il TESTO VERO appena accodato
  (`renderizzaBannerCoda`, `#queuedMessageText`), con un bottone
  "Annulla" che chiama `POST .../queue/annulla` per davvero.
- ✅ **Corretto in implementazione**: nessun bubble ottimistico al
  momento del POST (un messaggio può restare in coda per giri interi
  mentre il modello chiama altri attrezzi) — il bubble compare SOLO
  quando arriva l'evento `QueuedMessageDelivered` (nuovo, non previsto
  nel design originale — vedi sopra), il SOLO momento in cui il kernel
  ha davvero consumato il messaggio. Il banner sparisce da solo
  (coda locale vuota) — nessuno stato locale duplicato da tenere
  sincronizzato a mano.

## Test — ✅ tutti scritti e verdi

- **Backend** (`session-registry.test.mjs`, 9 nuovi): `accodaMessaggio`
  su id inesistente/sessione conclusa/testo vuoto — tre rifiuti
  distinti coi code giusti; happy path popola `voce.codaMessaggi`;
  `codaMessaggiFn` costruita passa DAVVERO a `avviaSessioneFn` E
  drena FIFO (mirror del test FASE C per `onDelega`); emette
  `QueuedMessageDelivered` SOLO quando consegna qualcosa (mai un
  evento fantasma su una lettura a vuoto); `svuotaCoda` rimuove
  l'ultimo elemento, mai il primo; AL CONTRARIO — due `accodaMessaggio`
  in sequenza mantengono l'ORDINE (FIFO, non LIFO).
- **`agent-service.test.mjs`** (2 nuovi): PARITÀ/AL CONTRARIO per il
  passthrough di `codaMessaggiFn` (stesso stile di `onDelega`/`hookFn`).
- **`http-routes-sessions.test.mjs`** (9 nuovi): `POST .../queue` happy
  path + tre rifiuti (id/conclusa/corpo malformato); `POST .../queue/annulla`
  happy path + id inesistente + coda già vuota; GET (metodo sbagliato)
  non raggiunge mai il registro.
- **`harnessUiFrontend.test.ts`/`harnessUiRealSession.test.ts`** (2
  test riscritti da onesto-rifiuto a onesto-accodamento + 2 nuovi):
  `CODE-COMPOSER-QUEUE-HONEST-01` (la POST parte per davvero, banner
  mostra il testo), `REAL-SESSION-RESUME-03` (zero chiamate a resume,
  una a queue), `REAL-SESSION-QUEUE-01` (filo intero: accodare non
  mostra un bubble, `QueuedMessageDelivered` lo mostra e svuota il
  banner), `REAL-SESSION-QUEUE-02` (AL CONTRARIO, due messaggi: il
  banner mostra "+1 altro" finché resta qualcosa in coda).
- **Dal vivo — ✅ FATTO**: una sessione reale IN CORSO (modello vero,
  `talos-prova-harness`) ha ricevuto un secondo messaggio dal composer
  mentre il primo turno leggeva/scriveva — non rifiutato, il banner ha
  mostrato il testo vero, è sparito quando il modello lo ha raggiunto
  e ha risposto. Verificato ANCHE sul file scritto sul disco (contiene
  il testo di entrambi i turni, non solo la chat). Screenshot
  ispezionati.

## Rischi/decisioni aperte

- **Ordine coda vs compattazione**: un messaggio accodato mentre il
  kernel sta per compattare (`serveCompattare`, ogni
  `GIRI_PRIMA_DI_COMPATTARE` giri) — risolto per costruzione in D.1:
  `codaMessaggiFn` è controllata SOLO al punto "zero tool-call", che è
  STRUTTURALMENTE dopo il controllo di compattazione nello stesso
  giro del ciclo (la compattazione consuma il giro con un `continue`
  prima di arrivare mai a valutare `chiamate.length`) — non c'è
  ambiguità da decidere, il codice la risolve da solo.
- **`svuotaCoda` rimuove l'ULTIMO elemento, non tutta la coda**: scelta
  deliberata (coerente con un singolo bottone "Annulla" accanto
  all'ultimo messaggio appena scritto) — se in futuro serve annullare
  un elemento specifico in mezzo alla coda, serve un id per messaggio,
  non costruito qui (nessun caso d'uso reale ancora).
- **Nessun limite alla lunghezza della coda in questa fetta**: un
  utente che accoda 50 messaggi di fila li vedrebbe consegnare uno
  alla volta, mai persi — ma nessun tetto duro come `LIMITE_FIGLI_CONCORRENTI`
  di FASE C. Se emerge un bisogno reale (un limite pratico, misurato),
  si aggiunge allora — stessa disciplina "si aggiunge quando serve".
