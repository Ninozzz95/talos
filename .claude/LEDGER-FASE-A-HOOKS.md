# FASE A — Hooks (pre/post tool, session start/end) — ledger a basso livello

> Scorporata da `elegant-spinning-dongarra.md` ("Harness Desktop al
> 100% — piano globale, analisi competitiva, ledger per fase"),
> approvato dall'owner il 28/8. Questo file è autosufficiente: non
> serve rileggere il piano madre per seguire questa fase fino in
> fondo. Stato di avanzamento aggiornato qui, di pari passo col lavoro
> (regola vincolante di memoria: "il ledger si aggiorna di pari
> passo").

## Stato: 🔜 aperta, in corso

### Avanzamento (aggiornato 28/8, in pausa per il Terminale REALE + ricerca Hermes)

- ✅ **Kernel** (`AVM-harness/.../talosHarness.mjs`): `hookFn` opzionale,
  pre/post_tool_call (bloccante solo sulle 3 azioni mutanti)/session_start/session_end.
  10 test nuovi, 138 totali kernel verdi. Ri-misura TALOS-BANCO fatta:
  3 righe già misurate riconosciute compatibili, $0, byte-identico.
- ✅ **`harness-ui/src/hook-registry.mjs`** (nuovo): config+trust+esecuzione
  sandboxata dell'hook. 15/15 test verdi.
- ✅ **`session-registry.mjs`**: import, parametri (`cartellaTrustHook`/
  `caricaHooksFn`/`verificaTrustFn`/`eseguiHookFn`), `costruisciHookFn`
  (sincrono-con-lazy-load, per rispettare la non-async di `avviaESegui`),
  `hookFn` passato ad `avviaSessioneFn`.
- 🔜 **`agent-service.mjs`**: NON ancora aggiornato per ricevere/inoltrare
  `hookFn` a `talosLavoraFn` — oggi verrebbe silenziosamente ignorato se
  una sessione girasse. Prossimo passo concreto quando questa fase riprende.
- 🔜 Non iniziati: evento `hookInvoked` in `agui-events.mjs`, rotta
  `POST /sessions/:id/hooks/:hookId/trust` in `http-app.mjs`, pannello
  Control-plane nel frontend (sostituire "Hooks · Non ancora
  implementato"), test aggiuntivi (`session-registry.test.mjs`,
  `http-app.test.mjs`), verifica dal vivo via CDP.

## Contesto

Owner, 28/8: *"analisi competitiva soprattutto su Hermès... crea un
ledger a bassissimo livello di codice per ogni fase... ogni fase deve
avere un suo documento"*. Verificato nel codice sorgente (`app.js`,
Control plane): oggi "Hooks" è dichiarato onestamente **"Non ancora
implementato"** — zero righe di JS lo toccano, nessun gestore di
click, nessun sistema dietro.

## Obiettivo

Un sistema di hook che intercetta il ciclo dell'agente in punti
dichiarati (prima/dopo una tool-call, inizio/fine sessione), per
audit, policy e notifiche. **Prerequisito tecnico della FASE B**
(Permessi per-tool): quella fase costruisce il proprio gate SOPRA
l'hook `pre_tool_call` di questa fase, non a fianco — un motivo in più
per farla per prima, oltre alla sicurezza/tracciabilità di base.

## Confronto competitivo (fonti verificate il 28/8)

| Concorrente | Copertura hook | Dettaglio |
|---|---|---|
| **Hermes Agent** | ✅ **universale, attiva di default** | *"unlike Claude Code or Codex CLI where hook coverage is partial, Hermes hooks are universal and on by default"* — copre pre_tool_call, post_tool_call, pre_llm_call, post_llm_call, on_session_start, on_session_end, subagent_stop. [Event Hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks) |
| **Codex CLI** (installato, v0.149.1, `codex features list` → `hooks: stable=true`) | ✅ 12 eventi PascalCase | PreToolUse, PostToolUse, SessionStart, SubagentStart, SubagentStop, UserPromptSubmit, Stop, PermissionRequest, PreCompact, PostCompact, **Interrupt** (nuovissimo, v0.150.0, 26/8 — due giorni fa). Struttura TOML a 3 livelli (evento→matcher→handlers). Un sistema di **trust persistito**: `--dangerously-bypass-hook-trust` esiste solo per bypassarlo esplicitamente — un hook nuovo/modificato non gira senza conferma. |
| **Claude Code** | parziale (dichiarato da Hermes stesso) | controlla pausa/valida/continua il workflow |

⇒ **Il pattern da copiare**: la copertura universale di Hermes (mai un
tool che sfugge all'hook) + il *trust* persistito di Codex (un hook
non è mai fidato per default solo perché il file esiste — sicurezza
contro un hook malevolo iniettato in un progetto clonato).

## Criterio di completamento (onesto, verificabile)

1. `pre_tool_call` e `post_tool_call` intercettano DAVVERO le tre
   azioni mutanti (`scrivi`/`shell`/`document_create`) — provato con
   un hook che **BLOCCA** un giro reale (un file che NON viene scritto
   perché l'hook ha rifiutato), non solo un hook che registra un log.
2. Un hook non esplicitamente fidato non gira MAI — fail-closed, stesso
   principio di Codex.
3. Zero impatto su TALOS-BANCO quando `hookFn`/`hooks` sono assenti —
   stesso principio già verificato per `onGiro`/`chiediApprovazioneFn`
   (bit-per-bit identico, non "probabilmente identico").
4. Il Control plane (`app.js`) mostra gli hook reali trovati, il loro
   stato di trust, un log delle invocazioni — sostituisce la voce
   "Non ancora implementato", mai un numero inventato.

## Ledger tecnico

### A.1 — Kernel (`AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`)

```js
// Nuovo parametro opzionale di talosLavora, in coda — retrocompatibile:
// TALOS-BANCO e ogni chiamante esistente non lo passano, comportamento
// bit-per-bit identico a oggi (stesso pattern già usato per onGiro,
// chiediApprovazioneFn, segnaleStop).
export async function talosLavora({
    cartella, task, modello, chiave, comandoProva,
    // ... parametri esistenti invariati ...
    hookFn, // opzionale: (evento) => Promise<{consentito: boolean, motivo?: string} | void>
}) { … }
```

Firma dell'evento passato a `hookFn`:

```ts
type EventoHook =
  | { tipo: 'pre_tool_call', azione: 'scrivi' | 'shell' | 'document_create' | 'elenca' | 'cerca' | 'leggi' | 'prova' | 'naviga', argomenti: object, giro: number }
  | { tipo: 'post_tool_call', azione: string, esito: string, giro: number }
  | { tipo: 'session_start', task: string }
  | { tipo: 'session_end', comeFinita: 'concluso' | 'giri-esauriti' | 'fermato' | 'errore' }
```

Punto di innesto: `hookFn` per `pre_tool_call` va chiamato **PRIMA**
di `verificaPermessoScrittura` nel dispatcher delle tre azioni mutanti
— un hook che dice `consentito:false` produce lo stesso tipo di
rifiuto `REFUSED. ${motivo}` già usato per il gate permessi (stesso
formato di errore, il modello impara a leggerlo allo stesso modo).
`verificaPermessoScrittura` resta il gate FINALE e indipendente: un
hook che dice sì non scavalca mai un permesso di sessione che dice no
— i due controlli sono in AND, non in OR.

Per le azioni di **sola lettura** (`elenca`/`cerca`/`leggi`/`naviga`/`prova`),
`pre_tool_call` viene comunque chiamato (per audit — Hermes copre
"ogni tool", non solo le mutazioni) ma il suo esito NON può bloccare
(un hook che tenta di bloccare una lettura viene ignorato con un
avviso nei log, mai un errore verso il modello — le letture restano
"fuori scope" del gate per lo stesso motivo per cui lo sono nel gate
permessi esistente).

`post_tool_call` è **notify-only** per questa prima fetta (come i
webhook di Hermes: *"outbound webhooks cannot block tool calls... the
response body is ignored"*) — un pattern deliberatamente più semplice
del `pre_tool_call`, che DEVE poter bloccare.

**Test kernel** (`talosHarness.test.mjs`, ~9 nuovi, stesso stile del
gate permessi):
1. PARITY: `talosLavora` senza `hookFn` è bit-per-bit identico a oggi
   (stesso input deterministico, stesso output, confrontato per intero).
2. `pre_tool_call` che rifiuta `scrivi` produce `REFUSED`, il file NON
   esiste sul disco dopo (prova fisica, non solo l'esito dichiarato).
3. `pre_tool_call` che rifiuta `shell` — comando NON eseguito (prova:
   un mock `execFn` mai chiamato).
4. AL CONTRARIO: `pre_tool_call` su una LETTURA che tenta di bloccare
   viene ignorato — la lettura riesce comunque, un avviso appare nei
   log passati a `onGiro` (mai un errore che confonde il modello).
5. `post_tool_call` riceve l'esito VERO di una scrittura riuscita
   (contenuto? percorso? — la stessa forma già passata a `onScrittura`).
6. AL CONTRARIO: `hookFn` che LANCIA un'eccezione non autorizza
   comunque — stesso principio già provato per `chiediApprovazioneFn`
   ("un'eccezione non autorizza").
7. `session_start`/`session_end` chiamati esattamente una volta per
   run, con `comeFinita` coerente con l'esito reale.
8. Un hook con `consentito:true` e un `motivo` (facoltativo, es. per
   un log "consentito ma segnalato") non blocca, il motivo finisce nei
   log dell'evento, non nel messaggio al modello.
9. Due hook in sequenza (se la fase successiva ne aggiunge più di uno
   — dichiarato qui come test AL CONTRARIO anticipato: per ORA
   `hookFn` è singolare, un solo hook per sessione; se in futuro ne
   servono più d'uno, l'orchestrazione — AND logico, il primo che
   rifiuta vince — è un'estensione dichiarata, non implementata qui).

### A.2 — Nuovo modulo backend (`harness-ui/src/hook-registry.mjs`)

```js
export class HookRegistryError extends Error {
  constructor(message, code = 'HOOK_INVALID') { super(message); this.name = 'HookRegistryError'; this.code = code; }
}

// Legge .harness-ui/hooks.json dentro la cartella workspace (MAI un
// default globale non dichiarato — un hook è per-progetto, come
// .claude-hooks.json di Codex, adattato al nostro stile JSON invece
// di TOML/YAML per coerenza col resto del progetto, zero dipendenze
// nuove).
export async function caricaHooks({ cartella }, deps = {}) { … }
// Torna: { hooks: Array<{id, eventi: string[], comando: string, hash: string}> } oppure { hooks: [] } se il file non esiste (mai un errore — un progetto senza hook è uno stato valido).

// Il registro di trust — PERSISTITO fuori dal repo del progetto
// (accanto a .sessions/, gitignored): un hook nuovo o il cui CONTENUTO
// è cambiato (hash diverso) NON è fidato finché l'owner non lo
// conferma esplicitamente dalla UI.
export async function verificaTrust({ cartella, hookId, hash }, deps = {}) { … } // → boolean
export async function fidaHook({ cartella, hookId, hash }, deps = {}) { … } // scrive il trust, chiamata SOLO da un'azione owner esplicita (mai automatica)

// Esegue un hook shell-script (stesso pattern di sicurezza già usato
// per eseguiComandoSandboxato: spawn, cwd della sessione, timeout,
// windowsHide) e interpreta il suo output come l'esito dell'hook —
// stdout JSON {consentito:bool, motivo?:string} se presente,
// altrimenti "consentito" per default su exit 0, "rifiutato" su exit
// diverso da zero (stesso principio di explorer.exe già in uso: un
// contratto d'uscita chiaro, mai ambiguo).
export async function eseguiHook({ hook, evento, cartella }, deps = {}) { … }
```

Formato di `.harness-ui/hooks.json` (dentro il workspace, NON nel repo
prodotto — un file di configurazione locale dell'owner, stesso
principio di `.sessions/`):

```json
{
  "hooks": [
    { "id": "audit-scritture", "eventi": ["pre_tool_call"], "comando": "node .harness-ui/hooks/audit.mjs" }
  ]
}
```

### A.3 — `session-registry.mjs`

`avviaESegui` costruisce `hookFn` da `hook-registry.mjs` (stesso
schema già in uso per `chiediApprovazioneFn`/`livelloAccesso`):

```js
const hookFn = await costruisciHookFn(voce.cartella); // null se hooks.json assente o vuoto
```

`costruisciHookFn` è una funzione locale che, per ogni evento,
verifica il trust di ciascun hook registrato per quell'evento PRIMA di
eseguirlo (fail-closed: un hook non fidato è **saltato con un log**,
mai eseguito "per prudenza" né bloccante di suo — solo un hook FIDATO
partecipa al verdetto).

### A.4 — `agui-events.mjs`

```js
export function hookInvoked({ tipo, azione, hookId, esito, motivo }) {
  return { type: 'HookInvoked', tipo, azione, hookId, esito, motivo };
}
```

### A.5 — `http-app.mjs`

Nuova rotta `POST /api/v1/sessions/:id/hooks/:hookId/trust` — l'unico
modo di far diventare fidato un hook (chiamata SOLO da un click owner
esplicito nella UI, mai automatica). Corpo: `{hash: string}` (il
frontend manda l'hash che ha appena letto/mostrato, il backend verifica
che corrisponda DAVVERO al file attuale prima di fidarsi — previene un
TOCTOU banale: hash mostrato ≠ hash sul disco in questo istante ⇒
rifiuta).

### A.6 — Frontend (`app.js`)

Il pannello Control plane (`sheetTemplates.control`) sostituisce la
voce "Hooks · Non ancora implementato" con una lista reale: hook
trovati in `.harness-ui/hooks.json` per la sessione corrente, stato
(fidato/non fidato — un bottone "Fidati di questo hook" se non
fidato), e un log delle ultime invocazioni (`HookInvoked`, stesso
pattern di rendering delle altre bolle collassabili).

### Test previsti (riepilogo)

- Kernel: 9 nuovi (elenco A.1).
- Backend `hook-registry.test.mjs` (nuovo, ~15): parsing di
  `hooks.json` valido/malformato, trust persistito, hash-change
  invalida il trust esistente (AL CONTRARIO: un hook modificato senza
  essere ri-fidato NON gira), `eseguiHook` interpreta correttamente
  stdout-JSON vs exit-code, fail-closed su hook non fidato (provato:
  l'azione che l'hook avrebbe dovuto bloccare passa comunque, perché
  l'hook non fidato è come se non esistesse — mai bloccante di suo).
- Backend `session-registry.test.mjs`: `costruisciHookFn` passa gli
  hook giusti, un hook di una sessione non tocca un'altra sessione.
- Backend `http-app.test.mjs`/route dedicata: `POST .../trust` verifica
  l'hash prima di fidarsi, rifiuta un hash che non corrisponde.

## Rischi/decisioni aperte

- **Formato file**: JSON deciso qui (coerente col resto del progetto),
  non YAML/TOML come Hermes/Codex — decisione presa in questo
  documento, non rimandata.
- **Quali eventi nella prima fetta**: `pre_tool_call`/`post_tool_call`/
  `session_start`/`session_end` sono il minimo comune (coprono
  audit+blocco). `subagent_stop` resta naturalmente per **dopo** la
  FASE C (sub-agenti) — dichiarato, non implementato qui perché il
  concetto stesso di sub-agente non esiste ancora in questa fase.
- **Un solo hook per evento, o una lista**: questa fetta implementa
  **una lista** (il formato `hooks.json` è già un array), ma
  `hookFn` che il kernel riceve resta **singolare** — l'orchestrazione
  di più hook per lo stesso evento (AND logico sul verdetto) vive nel
  backend (`costruisciHookFn`), il kernel non sa che esistono più
  hook, riceve un solo esito già combinato — mantiene il kernel
  semplice e il contratto con TALOS-BANCO invariato.

## Verifica end-to-end (prima di dichiarare la fase chiusa)

1. `node --test` (kernel + backend) verdi.
2. `npx vitest run` (frontend, scope harness poi suite intera) verdi.
3. Ri-misura TALOS-BANCO obbligatoria (questa fase tocca `talosHarness.mjs`)
   — stessa disciplina di sempre, senza eccezioni.
4. Dal vivo via CDP: un hook VERO che blocca una scrittura reale (il
   file non esiste dopo, verificato sul filesystem) + uno screenshot
   del Control plane che mostra l'hook e il suo log — ispezionato, non
   solo il testo di successo dello script.
5. Confronto esplicito con la matrice: "pareggia la copertura
   universale di Hermes sulle tre azioni mutanti + il trust persistito
   di Codex" — dichiarato qui, verificato lì.
