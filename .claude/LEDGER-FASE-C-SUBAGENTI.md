# FASE C — Sub-agenti: delega isolata, parallela — ledger a basso livello

> Scorporata da `elegant-spinning-dongarra.md` ("Harness Desktop al
> 100% — piano globale, analisi competitiva, ledger per fase"). Aperta
> dopo FASE B (permessi per-tool, ✅ chiusa 28/8 con un ripiego sicuro,
> `LEDGER-FASE-B-PERMESSI.md`), su ordine diretto dell'owner: *"lascio
> stare [il coordinamento con avm-75] ... Tu fai il tuo. Passa la
> prossima fase."*
>
> ⭐⭐⭐ Il differenziatore diretto contro Hermes — vincolo persistente
> dell'owner (memoria, `harness-da-battere-uno-a-uno`): Hermes è il
> primo nome su ogni ricerca competitiva. Il ledger tecnico sotto usa i
> numeri VERI del loro codice, letti dal repo clonato il 28/8 (non da
> doc secondari) — vedi `elegant-spinning-dongarra.md` §2.3-BIS per la
> fonte primaria completa.

## Stato: 🔜 in corso

## Contesto

Oggi `forkSession()` duplica una conversazione — stessa storia, sessione
indipendente, **nessuna relazione di orchestrazione**. Il foglio "Albero
sessione" (`sheetTemplates.sessionTree` in app.js) mostra già due righe
"side thread" — ma sono **finte**, mai popolate da una vera delega
(segnalato onestamente dal codice stesso: "Sotto-thread non ancora
implementati — talosLavora è un ciclo singolo, nessuna vera delega
parallela oggi", visibile nel Context Rail di ogni sessione).

Serve l'opposto di un fork: una sessione PADRE che delega un sotto-task
a una sessione FIGLIA isolata (proprio workspace, proprio contesto), che
lavora e **torna un riassunto**, senza inondare il contesto del padre
con ogni tool-call intermedia della figlia.

## Obiettivo

Un attrezzo nuovo (`delega_sottotask`, opzionale per sessione — mai per
TALOS-BANCO) che il modello può chiamare per delegare un sotto-task a
una sessione figlia isolata, con un limite di concorrenza e di
profondità che rispecchiano i numeri VERI di Hermes, e un vincolo di
non-allargamento dei permessi copiato dal loro codice.

## Confronto competitivo — il punto più importante di tutto il piano

Fonte: `agent/subagent_lifecycle.py` + `tools/delegate_tool.py`, letti
riga per riga dal repo Hermes clonato il 28/8 (non da doc secondari —
tre claim di doc secondari erano sbagliati, corretti quel giorno).

- **Isolamento SEMPRE, mai un default "stessa cartella"**: `SubagentLaunchRequest`
  **rifiuta esplicitamente** `working_directory` — *"Hermes delegates
  use isolated task environments"*. Non è un'opzione, è un rifiuto
  strutturale.
- **10 figli concorrenti di default**, non 3: `_DEFAULT_MAX_CONCURRENT_CHILDREN = 10`,
  nessun tetto duro oltre quello (solo un avviso in log sopra 10, *"each
  child consumes API tokens"*).
- **Profondità di delega 2 di default**, non una stella a profondità 1:
  `delegation.max_spawn_depth` ha default **2** (commento nel loro
  codice: *"default 2 for parity with the original MAX_DEPTH
  constant"*), nessun tetto duro — un figlio con `role:'orchestrator'`
  può delegare a sua volta un nipote. "I fratelli non si parlano fra
  loro" (vero, fonte web) descrive l'ISOLAMENTO fra fratelli, non la
  profondità dell'albero — due fatti diversi, confusi in una stesura
  precedente di questo stesso piano e corretti il 28/8.
- **Un figlio non può MAI ottenere più permessi del padre**:
  `SubagentLifecycleService._validate_request` rifiuta esplicitamente
  una richiesta di `allowed_toolsets` che non sia un sottoinsieme di
  `parent.enabled_toolsets` — errore dichiarato: *"Requested toolsets
  would broaden parent permissions"*. Principio da copiare a
  prescindere dai numeri.
- *"Zero-context-cost pipeline"*: solo il riassunto finale della delega
  entra nel contesto del padre, mai le tool-call intermedie del figlio.

⇒ **Risoluzione esplicita di un'ambiguità lasciata nella stesura
precedente di questo piano**: una frase in "Rischi/decisioni aperte"
diceva *"se un figlio può delegare un NIPOTE — la prima fetta lo VIETA
esplicitamente (profondità 1)"* — è testo STALE, scritto PRIMA della
correzione 28/8 sui numeri veri di Hermes, mai aggiornato in quel punto
specifico. Qui si decide la versione CORRETTA, coerente con
`LIMITE_PROFONDITA_DELEGA = 2` già scritto nel ledger tecnico dello
stesso documento: **la profondità 2 è ammessa fin da questa fetta** — un
figlio a profondità 1 può delegare un nipote a profondità 2, un nipote
a profondità 2 NON può delegare oltre (tetto duro, non "nessun tetto"
come in Hermes: la prima fetta parte con un tetto ESPLICITO invece di
"nessun tetto oltre 2 con solo un avviso", una scelta più prudente
finché non c'è una misura reale che dica se serve di più — stesso
principio "si aggiunge quando serve, si misura" già in uso per
`GIRI_MASSIMI`).

## Criterio di completamento

1. Una sessione padre delega un sotto-task con un prompt ESPLICITO a
   una sessione figlia, tramite l'attrezzo `delega_sottotask`.
2. La figlia lavora SEMPRE in un workspace isolato — mai la cartella
   del padre per default (`cartella` è un parametro obbligatorio
   dell'attrezzo, non opzionale con un default furbo).
3. SOLO il riassunto finale della figlia entra nella conversazione del
   padre — mai le tool-call intermedie della figlia (che vivono SOLO
   sullo stream della figlia, mai propagate al padre).

   ⚠️ **Semplificazione decisa in corso d'opera, non dimenticata**: il
   piano madre sognava un evento `SubagentResult` dedicato, iniettato
   fuori banda nello stream del padre. Costruendo C.2 (sotto) è emerso
   che il design è SINCRONO/bloccante (il dispatcher del kernel fa
   `await onDelega(...)` — lo stesso schema già in uso per OGNI altro
   attrezzo, `scrivi`/`shell`/`document_create` inclusi): il riassunto
   della figlia diventa quindi, per costruzione, il risultato NORMALE
   della tool-call `delega_sottotask` — lo stesso meccanismo
   `ToolCallResult` già esistente, zero trasporto nuovo. Un evento
   `SubagentResult` separato sarebbe stato un secondo canale ridondante
   per la STESSA informazione — non costruito, per lo stesso principio
   "niente sistema parallelo" già scritto nell'Obiettivo di questo
   ledger. Resta vero l'obiettivo (solo il riassunto, mai le tool-call
   intermedie): cambia SOLO il meccanismo di trasporto.
4. Il limite di concorrenza (10) e di profondità (2) sono davvero
   rispettati — provato lanciando un undicesimo tentativo concorrente
   e un terzo livello di profondità, osservando un rifiuto esplicito,
   mai un errore silenzioso o un tetto ignorato.
5. Un figlio non eredita MAI più strumenti del padre.

   ⚠️ **Trovato leggendo il codice reale, non presunto**: `strumentiEstesi`
   è OGGI configurazione di LIVELLO SERVER (`createSessionRegistry({strumentiEstesi})`),
   mai per-sessione — ogni sessione sul server, padre o figlia, riceve
   lo STESSO valore per costruzione. L'invariante "mai un sovrainsieme"
   è quindi vera OGGI per l'assenza stessa di un asse su cui un figlio
   potrebbe divergere, non per un cancello scritto qui — dichiarato
   onestamente, non spacciato per un controllo attivo. Il commento nel
   codice segna ESPLICITAMENTE questo punto come il posto dove un vero
   controllo andrebbe aggiunto se `strumentiEstesi` diventasse mai
   per-sessione.
6. Il foglio "Albero sessione" mostra DAVVERO i figli attivi/conclusi
   di una sessione reale, non le due righe finte di oggi.
7. Dal vivo: una sessione padre reale delega a una figlia reale, la
   figlia scrive un file per davvero nella SUA cartella isolata (mai
   in quella del padre), il padre riceve il riassunto — screenshot
   ispezionati, come ogni altra fase.

## Ledger tecnico

### C.1 — Kernel (`AVM-harness/.../talosHarness.mjs`)

Nuovo attrezzo esteso, stesso schema di `web_search`/`document_create`
(opzionale, in `ATTREZZI_ESTESI`, mai offerto se `strumentiEstesi` non
lo include esplicitamente — TALOS-BANCO non lo passa mai, zero impatto
per costruzione):

```js
{
    name: 'delega_sottotask',
    description: 'Delegate an isolated sub-task to a fresh child session. The child works independently in its OWN folder (never yours) and reports back only a final summary — none of its intermediate steps enter your context. Use for a genuinely separable chunk of work, not for something you can just do yourself in one more turn.',
    input_schema: {
        type: 'object',
        properties: {
            task: { type: 'string', description: 'A complete, self-contained instruction for the child — it starts with NO context beyond this text.' },
            cartella: { type: 'string', description: 'Absolute path to an isolated working folder for the child. Must be different from your own.' },
        },
        required: ['task', 'cartella'],
    },
},
```

Il dispatcher per `delega_sottotask` NON esegue la delega dentro
`talosHarness.mjs` stesso (il kernel non sa nulla di HTTP/registro
sessioni — la stessa separazione già rispettata per `document_create`,
dove il kernel chiama SOLO `onDocumento`). Nuovo parametro opzionale
`onDelega?: (task, cartella) => Promise<{riassunto: string, esito: 'concluso'|'fallito'|'rifiutato', motivo?: string}>`
su `talosLavora`, chiamato dal dispatcher — stesso schema di `onDocumento`.
`esito:'rifiutato'` copre il tetto di concorrenza/profondità (vedi C.2) —
il modello riceve un messaggio onesto (*"REFUSED. \{motivo\}. No child was
started."*), mai un silenzio.

⛔ Zero impatto per costruzione se `onDelega` è assente (harness senza
questo attrezzo attivo): stesso principio già verificato per
`onDocumento`/`onArtefatto`. Ri-misura TALOS-BANCO obbligatoria
prima/dopo, come ogni modifica al kernel.

### C.2 — Backend (`AVM-harness-desktop/harness-ui/src/`)

**Nuovo file** `subagent-orchestrator.mjs`:

```js
export function creaSubagentOrchestrator({ sessioni, avviaESeguiFn }) { ... }
```

- `delegaSottoTask({ sessionPadreId, task, cartella })` → `Promise<{riassunto?, esito, motivo?}>`:
  - Legge la voce padre da `sessioni` (la stessa `Map` di
    `session-registry.mjs` — questo modulo NON tiene un secondo
    registro, opera sullo STESSO stato).
  - `cartella` **diversa** dalla cartella del padre — rifiuto esplicito
    altrimenti (`{esito:'rifiutato', motivo:'la cartella della delega deve essere diversa da quella del padre'}`),
    mai un controllo implicito.
  - `profonditaVoluta = (padre.profonditaDelega ?? 0) + 1`; se
    `profonditaVoluta > LIMITE_PROFONDITA_DELEGA` (2) → rifiuto
    esplicito con il numero vero nel motivo, mai un errore generico.
  - `contaFigliAttivi(sessionPadreId)` ≥ `LIMITE_FIGLI_CONCORRENTI` (10)
    → rifiuto esplicito (non una coda silenziosa in questa prima
    fetta — vedi Rischi).
  - `strumentiEstesi` del figlio: NESSUN parametro esplicito da passare
    — è configurazione di LIVELLO SERVER in `avviaESeguiFn`
    (`createSessionRegistry({strumentiEstesi})`), identica per
    costruzione per ogni sessione, padre o figlia. Vedi la nota onesta
    nel Criterio di completamento sopra.
  - Crea la voce figlia riusando `avviaESeguiFn` (la stessa funzione
    interna di `session-registry.mjs`, non una sua copia) con
    `task: {consegna: task}`, `cartella`, `padreId: sessionPadreId`,
    `profonditaDelega: profonditaVoluta`, e un NUOVO parametro
    `onConclusioneFn` (vedi sotto) che risolve la Promise che questa
    funzione ha già tornato al chiamante (il dispatcher del kernel del
    PADRE, in attesa dentro `await onDelega(...)`).
  - `avviaESeguiFn` guadagna `onConclusioneFn?: (risultatoAvvioSessione) => void`,
    chiamato dentro il `.then()`/`.catch()` che GIÀ esiste (dove oggi
    solo `voce.messaggiFinali` viene aggiornato) — zero impatto per una
    sessione normale (parametro assente, invariato), lo stesso principio
    "opzionale, mai un secondo percorso" di ogni altro parametro di
    questo file.
- `contaFigliAttivi(sessionPadreId)` — filtra `sessioni` per
  `padreId === sessionPadreId && conclusa === false`.
- `elencaFigli(sessionPadreId)` — per il foglio "Albero sessione"
  (C.3): `[{sessionId, task, esito, conclusa, avviataAlle}]`, ordinati
  per `avviataAlle`.
- `LIMITE_FIGLI_CONCORRENTI = 10`, `LIMITE_PROFONDITA_DELEGA = 2` —
  costanti nominate, con il commento che dichiara la fonte (numeri veri
  di Hermes, non inventati).

**`session-registry.mjs`**:
- `voce.padreId`/`voce.profonditaDelega` nella voce sessione (default
  `null`/`0`) — stesso pattern di ogni altro campo opzionale già lì.
  ⚠️ `eSottoAgente` (della bozza originale) è RIDONDANTE con
  `padreId !== null` — non un secondo campo che potrebbe disallinearsi
  dal primo.
- `subagentOrchestrator = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: avviaESegui })`,
  istanziato una volta dentro `createSessionRegistry` (stesso ciclo di
  vita di `sessioni`).
- `avviaESegui` passa `onDelega: (task, cartellaFiglio) => subagentOrchestrator.delegaSottoTask({ sessionPadreId: sessionId, task, cartella: cartellaFiglio })`
  ad `avviaSessioneFn` — stesso schema di `hookFn`/`chiediApprovazioneFn`,
  costruito SEMPRE (il vero lavoro resta dentro `delegaSottoTask`).

**`http-app.mjs`**: nuova rotta `GET /api/v1/sessions/:id/children` →
`subagentOrchestrator.elencaFigli(sessionId)` — per popolare il foglio
"Albero sessione" alla sua apertura (non solo dal risultato della
tool-call già visibile in chat, anche per chi apre il foglio DOPO che
la delega è già conclusa, o riapre la pagina con un F5). Nessuna rotta
di CREAZIONE: la delega parte SEMPRE da una tool-call del modello, mai
da un'azione diretta dell'owner in questa fetta (coerente con
l'attrezzo, non un secondo percorso).

### C.3 — Frontend (`mobile/public/harness-ui/`)

- `riassuntoAttrezzo` (già esistente, la funzione che rende ogni
  tool-call come una riga leggibile in chat — `shell`/`document_create`/ecc.
  ce l'hanno già) guadagna un caso per `delega_sottotask`: glifo
  dedicato (🧩) + `"Delega: {task tagliato} → {riassunto}"` — RIUSA il
  meccanismo `ToolCallResult` già esistente, zero evento nuovo (vedi la
  semplificazione nel Criterio di completamento sopra).
- Il foglio "Albero sessione" (`sheetTemplates.sessionTree`) chiama
  `GET .../children` all'apertura e sostituisce le due righe finte con
  l'elenco vero (`elencaFigli`) — badge "Demo UI" tolto SOLO quando la
  sessione ha almeno un figlio reale (stesso principio "onesto anche a
  zero" già in uso per le automazioni: zero figli → stato vuoto onesto,
  non l'assenza del badge).
- Il Context Rail "Session topology" mostra la profondità reale
  (`profonditaDelega`) quando > 0, invece del testo statico attuale.

## Test previsti (~20+, PARITÀ/AL CONTRARIO come ogni altra fase)

- **Kernel**: PARITÀ (`onDelega` assente → comportamento identico a
  oggi); l'attrezzo genera l'evento giusto; AL CONTRARIO — `onDelega`
  che lancia non blocca il giro del padre (stessa disciplina di
  `chiediApprovazioneFn`/`hookFn` che lanciano).
- **`subagent-orchestrator.test.mjs`** (nuovo): delega crea una sessione
  figlia vera con cartella isolata; rifiuta se `cartella === cartella del padre`;
  l'undicesimo figlio concorrente è rifiutato esplicitamente (non messo
  in coda in questa fetta, non eseguito); una delega a profondità 3 è
  rifiutata col numero vero nel motivo; `SubagentResult` arriva SOLO al
  padre (un test con due sessioni indipendenti, verifica che la seconda
  non riceva nulla); AL CONTRARIO — un figlio che fallisce produce
  comunque un `SubagentResult` con `esito:'fallito'` (mai un padre
  appeso in attesa); il figlio eredita `strumentiEstesi` IDENTICI al
  padre, mai un sovrainsieme.
- **`session-registry.test.mjs`**: `voce.padreId`/`eSottoAgente`/`profonditaDelega`
  settati correttamente; `contaFigliAttivi` corretto con 0/1/N figli;
  broadcast isolato per sessione.
- **`http-routes-sessions.test.mjs`**: `GET .../children` — happy path,
  sessione senza figli (array vuoto, non un errore), id inesistente
  (404).
- **Dal vivo**: sessione padre reale delega a una figlia reale su una
  cartella diversa da quella del padre, la figlia scrive un file per
  davvero SOLO nella sua cartella, il padre riceve il riassunto nella
  chat, il foglio "Albero sessione" mostra la figlia vera. Screenshot
  ispezionati.

## Rischi/decisioni aperte

- **Isolamento logico vs fisico**: questa fetta fa isolamento LOGICO
  (una cartella diversa, scelta esplicitamente da chi chiama
  l'attrezzo — tipicamente una sotto-cartella o un percorso sorella),
  non un worktree Git dedicato creato automaticamente. Un worktree
  fisico resta un'estensione dichiarata per quando un vero conflitto
  di scrittura padre/figlio si manifesta (misurato, non presunto) —
  stesso principio già scritto nella stesura precedente di questo
  piano, confermato qui.
- **Undicesimo figlio: rifiuto esplicito, non una coda** — diverso da
  Hermes (che mette solo un avviso in log e non ferma nessuno). Scelta
  deliberatamente più prudente per la prima fetta: una coda richiede
  uno scheduler che questa fetta non costruisce ancora. Se emerge un
  bisogno reale di code, è un'estensione dichiarata per dopo.
  ⚠️ **Correzione rispetto alla stesura precedente di questo piano**:
  quella diceva "lanciando un undicesimo tentativo e vedendo la coda,
  non un errore silenzioso" — qui si decide ESPLICITAMENTE il rifiuto,
  non la coda, per il motivo sopra. Un rifiuto esplicito e onesto non è
  "un errore silenzioso": rispetta comunque il criterio di
  completamento (mai un tetto ignorato).
- **Nome dell'attrezzo** (`delega_sottotask`) e della sua descrizione —
  scelti qui, non ancora tarati con un modello reale come gli altri
  attrezzi; da rivedere se il modello fatica a capirne lo scopo durante
  la verifica dal vivo.
- **`GET .../children` senza SSE dedicato**: il foglio si aggiorna
  all'apertura e sugli eventi `SubagentResult` già arrivati sullo
  stream del padre — non un secondo canale SSE per-figlio. Se un
  giorno serve vedere il progresso di una figlia mentre lavora (non
  solo il riassunto finale), è un'estensione dichiarata, in tensione
  diretta con "zero-context-cost pipeline" (il punto di forza dichiarato
  di questa fase) — da NON fare senza una richiesta esplicita.
