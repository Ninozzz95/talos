# Review esterna — harness mobile TALOS ("Codice") — 02/09/2026

> Esegue `PROMPTREVIEWESTERNAMOBILE20260902.md` (caricato dall'owner il 02/09).
> Revisore: sessione Fable 5.1 della lane desktop, con accesso in **sola
> lettura** al worktree `C:\Users\Antonino\Desktop\projects\AVM`
> (`lane/voce-personale`, HEAD `2a396d3d`, che contiene `cb3730e6` citato dal
> prompt più due commit di documentazione). Nessun file di `mobile/` toccato,
> nessun push, nessuna esecuzione sul device. Le impronte di `TALOS-RICERCHE/`
> verificate (`sha256sum -c IMPRONTE.txt`: nessuna riga non OK).
>
> Ogni rilievo ha file:riga letti oggi, non ricopiati dai ledger. Dove un fatto
> non è stato verificato, lo dico.

## 0 — In tre righe

1. **La cronologia che sparisce (§4.2.1) ha una causa precisa nel codice**, non
   nella scrittura su disco: il server embedded scrive davvero in
   `.sessions-store/`, ma quella cartella sta **dentro l'albero che il plugin
   cancella con `rm -rf` e rispinge a ogni avvio** (`TalosTerminalPlugin.kt`),
   ed è di proprietà dell'utente `shell` in `/data/local/tmp/talos/…`, dove
   `run-as` dell'app (usato nel ledger §44) non poteva vederla.
2. Permessi e cambio modello a sessione viva sono cosmetici **anche lato
   server**: il server embedded non ha la rotta `/settings` che il desktop ha.
3. La tabella mockup del 30/8 è confermata riga per riga al 02/09 con il testo
   esatto; il desktop ha già agganciato Browser, notifiche e Review e ha un
   renderer di streaming incrementale misurato: sono porting, non progetti.

## 1 — Rilievi, dal più severo

### R1 · mockup/parità · la persistenza scrive, ma il lancio cancella
- **Dove**: `mobile/android/app/src/debug/java/ai/talos/terminal/TalosTerminalPlugin.kt:645-652`
  (`TalosPonteAdb.esegui(… "rm", "-rf", remoto)` poi `push` di
  `File(staging, "harness-ui")` su `HARNESS_UI_REMOTO = /data/local/tmp/talos/AVM/harness-ui`, righe 129-133);
  `mobile/android/app/src/debug/assets/talos-harness-ui/harness-ui/server.mjs:47`
  (`cartellaStore: fileURLToPath(new URL('.sessions-store/', import.meta.url))`, cioè **dentro** quell'albero);
  `…/harness-ui/src/session-store.mjs:96-100` (`registraRigaSync`: `mkdirSync` + `appendFileSync`, nessun errore inghiottito).
- **Scenario**: crea una sessione → viene scritto
  `/data/local/tmp/talos/AVM/harness-ui/.sessions-store/<id>.jsonl` come utente
  `shell` → chiudi e riapri l'app → `avviaServerHarness()` fa `rm -rf` e push
  → `ripristina()` trova zero file → `GET /api/v1/sessions` = `{"items":[]}`.
  È esattamente ciò che §44 del ledger ha osservato; la sua ricerca con
  `run-as` nel `filesDir` dell'app non poteva trovare nulla perché il server
  non gira lì e non come quell'utente. La diagnosi «la persistenza non scrive
  niente» va corretta in «scrive nel posto sbagliato e il lancio lo cancella».
- **Fix**: lo store deve stare **fuori** dall'albero rispinto: per esempio
  `$AREA_REMOTA/state/sessions-store`, creato con `mkdir -p` nello stesso
  comando che oggi crea `AREA_WORKSPACE_DEFAULT` (riga 666-668), e passato al
  server con una variabile d'ambiente nuova (`TALOS_HARNESS_UI_STORE_DIR`,
  letta in `config.mjs`, con fallback all'attuale «accanto a server.mjs»).
  Vale anche per il desktop, dove `harness-ui/server.mjs:153` ha lo stesso
  percorso cablato. Prova sul device: `adb shell ls /data/local/tmp/talos/state/sessions-store`
  (non `run-as`), prima e dopo un riavvio dell'app.
- **Regola**: §2.5 (dispositivo reale) e §2.6 (strumentare, non intuire): la
  prova che manca è un `ls` nel posto giusto, costa un comando.

### R2 · mockup · permessi di sessione cosmetici, e il server non potrebbe riceverli
- **Dove**: `mobile/public/harness-ui/app.js:2230-2235` (`impostaPermesso`:
  `state.permissions = …`, `window.__talosHarnessHostPermissionChange?.()`,
  `toast('Policy aggiornata', …)`); `mobile/src/screens/HarnessSessionScreen.vue:624`
  (il gancio host aggiorna solo `codePermission`, usato alle righe 818-825 per
  l'etichetta); server embedded `…/harness-ui/src/http-app.mjs`: **nessuna**
  rotta `/api/v1/sessions/:id/settings` (elenco completo delle rotte per
  sessione letto oggi: hooks/trust, queue, rename, tree/*, stop, fork, resume,
  compact, shell, approve, data, events, export, tree). Il desktop la ha
  (`harness-ui/src/http-app.mjs:1519`).
- **Scenario**: sessione in corso con «Workspace write» → l'utente sceglie
  «Read only» → toast «Policy aggiornata» → il kernel continua a scrivere.
- **Fix**: portare la rotta `/settings` nell'embedded (stesso contratto del
  desktop: modello/reasoning/permessi persistiti atomicamente), far chiamare al
  client `apiPost(…/settings)` e mostrare «Policy aggiornata» **solo su 200**;
  su una sessione conclusa dire onestamente «vale dal prossimo giro».
- **Regola**: §2.3 (zero mockup silenziosi, il difetto a priorità più alta) e §2.4.

### R3 · mockup/competitivo · cambio modello a sessione viva
- **Dove**: `app.js:1191` (`state.model = modello.id`, nient'altro);
  `resumeSession` (`app.js` ~5230): `apiPost(…/resume, { messaggio })` senza
  modello; embedded `http-app.mjs:1122` legge solo `corpoResume.messaggio`.
- **Confronto** (fonte primaria letta il 02/09,
  https://hermes-agent.nousresearch.com/docs/reference/cli-commands): Hermes
  `/model` — *"Switch between already-configured models without leaving a
  session"*, per default solo per la sessione corrente. TALOS mobile: la
  pillola cambia, il giro no, e nessun avviso lo dice.
- **Fix**: stessa rotta `/settings` di R2 + `RunStarted.contesto.modello`
  mostrato per turno (il desktop lo fa già: `state.realSession.currentRunModel`,
  `harness-ui/public/app.js`).
- **Regola**: §2.3.

### R4 · ottimizzazione · streaming: tutto il markdown rianalizzato a ogni delta, senza coalescenza
- **Dove**: `app.js:4491-4505`, caso `TextMessageContent`:
  `copia.replaceChildren(renderizzaMarkdownSemplice(testoGrezzo))` a **ogni**
  delta, sincrono, nessun `requestAnimationFrame`. Costo O(n²) sul testo.
- **Misura di riferimento** (desktop, oggi, Chrome con GPU, 13.068 caratteri in
  162 delta): con coalescenza rAF ma rianalisi completa **1,28 s** di main
  thread e 8 frame sopra 16,7 ms; con il renderer incrementale **0,35 s** e 0
  frame lenti (`harness-ui/public/app.js`, `renderizzaMarkdownIncrementale`,
  commit `7a35dcb7`). Il mobile è oggi nella condizione peggiore delle due
  (nemmeno la coalescenza), su una CPU più lenta. Non misurato sul device: la
  stima è per costruzione, il numero va preso lì.
- **Fix**: porting di `programmaRenderMessaggioStreaming` (un commit per
  frame) e di `renderizzaMarkdownIncrementale` (blocchi chiusi resi una volta,
  solo la coda rifatta). Fonti: Hermes PR #67236 e #67154 (render per blocco,
  15×/14×), Vercel Streamdown (blocchi memoizzati), letti il 02/09.
- **Regola**: §2.2 (fonti) — e §4.5 del prompt: è un hotspot non ancora
  guardato dalla pass 2 di §46.

### R5 · mockup · la tabella del 30/8, riverificata al 02/09 col testo esatto
| superficie | stato 02/09 | prova |
|---|---|---|
| Permessi (4 policy) | COSMETICO | `app.js:2234` «Policy aggiornata» (R2) |
| Scope corrente (3 toggle) | INERTE | `app.js:1939-1942`: tre `<input type="checkbox">` senza `data-*`, nessun listener |
| Modello a sessione viva | COSMETICO | R3 |
| Capabilities → Allega/Screenshot | MOCKUP | `app.js:2246` «Il mockup rappresenta il flusso senza backend.» |
| Automazioni | `new` e `run` REALI con backend raggiungibile (`app.js:6147-6153`), `edit` MOCKUP (`6156`) | corretto rispetto alla tabella |
| Browser → 5 azioni | MOCKUP | `app.js:6114` «Azione simulata nel mockup locale.» — **il desktop le ha agganciate oggi** (cronologia reale, Apri, Annota → composer, Copia; commit `22a2dd6c`) |
| Composer, menu overflow | MOCKUP | `app.js:5747-5758`: dieci voci `copy{}` tutte «demo» |
| Voce nella vista Codice | MOCKUP dichiarato | `app.js:5919` «Voce demo non collegata» — onesto, ma il motore voce vero esiste altrove nell'app |
| Export, campo `note` | ETICHETTA FALSA | `app.js:5901` `note: 'Interactive TALOS frontend mockup export'` anche su sessione vera |
| Notifiche | MOCKUP | `app.js:6118` — **il desktop le ha agganciate oggi** (approvazioni in attesa + sessioni finite non viste, `elenca().inAttesaApprovazione`) |
| Board | CONDIZIONALE onesta | `app.js:1452-1505` — non un difetto |

**Fix trasversale**: per Browser e notifiche il porting dal desktop è
diretto (stesso bundle, stessi id); per Scope corrente o si collega a una
policy reale del kernel (rete/browser/git) o si toglie: tre interruttori che
non fanno nulla sono la forma peggiore di mockup (§2.3).

### R6 · parità · chi è avanti, capability per capability (prova, non autorità)
- **Mobile avanti**: `passaASessione` con controllo del contenuto reale a
  schermo (`app.js:5148`, RITENTA-01/02). Il desktop conserva il corto
  circuito ingenuo (`harness-ui/public/app.js:7945`,
  `if (sessionId === state.realSession.id) { … return; }`) → rilievo **verso il
  desktop**, fuori dal perimetro di scrittura di questa review, segnalato.
- **Desktop avanti**: Review con diff reale e azioni vere, Browser e notifiche
  reali, streaming incrementale, `WorkspaceChanged` effimero (non applicabile
  al mobile: l'embedded non ha `workspace-watcher.mjs`), `inAttesaApprovazione`
  e `ultimoEsito` in `elenca()`, sezioni Settings con dati letti dal server.
- **Divergenza misurata oggi**: `git diff --stat lane/voce-personale..lane/harness-desktop -- mobile/public/harness-ui/app.js`
  = +3.511/−1.886; 78 commit avanti il desktop, 50 avanti il mobile su quel
  file. Ma il desktop **non serve più** quel file: il bundle canonico è
  `harness-ui/public/app.js` (+5.793/−2.091 rispetto al mobile). Il
  «pareggio» va misurato contro quello, non contro `mobile/public/harness-ui`
  della lane desktop, che è stantio.
- **Cosa non ha senso copiare**: il terminale PTY (xterm.js + WebSocket) su
  telefono; l'attrezzo `shell` non interattivo copre il bisogno del modello,
  il bisogno della persona (digitare) è un'altra superficie.

### R7 · duplicazione · due kernel, stessi callback con nomi diversi
- **Dove**: `mobile/scripts/harness-talos/talosHarness.mjs` (3.172 righe, 33
  attrezzi) contro `lane/harness-mobile-bridge-kernel` (6.226 righe,
  +3.735/−681): in più `carica_skill`, `delega_sottotask`,
  `library_context_policy_update`, `library_export`, `research_*` (start,
  cancel, pause, resume, rename, delete), `tool_create`, MCP/plugin.
- **Fatto verificato**: la logica Note/Attività/Memoria **non** è duplicata
  nel kernel — entrambi delegano a callback (`creaNotaFn` qui, `onNoteCrea`
  là); ciò che è doppio sono i **nomi** dei callback e i **backend** (qui il
  repository del device via `mobile/src/lib/harness/codiceDati.ts`, là
  `notes-store.mjs` del server desktop). Unificabile con una sola interfaccia
  di callback e un kernel solo, con capacità iniettate per contesto come già
  fa `shell` col flag `mobile`.
- **Regola**: §2 (una implementazione parametrizzata), §4.1 del prompt.

### R8 · sicurezza · un attrezzo di scrittura fuori dal gate
- **Dove**: `talosHarness.mjs:1956` (`verificaPermessoScrittura`) copre
  `scrivi` (2471), `shell` (2512), `document_create` (2566), `notes_*`,
  `tasks_*`, `memory_*`, `library_rename/delete`, `generate_image` (3007).
  **Non** copre `artifact_create` (2553-2557): crea un artefatto persistito
  lato server senza chiedere.
- **Scenario**: policy «Read only» → il modello produce e salva artefatti HTML.
- **Fix**: `verificaPermessoScrittura({ tipo: 'artifact_create', titolo })`
  prima della creazione, come per `document_create`. `shell: true` in
  `spawn` (1214, 1408) è per costruzione l'attrezzo shell e passa dal gate: ok.
- **Regola**: §2.4 (provare concesso E negato).

### R9 · competitivo · Hermes verificato alla fonte oggi; il resto no
- Verificato (02/09): `hermes --continue`/`-c`, `--resume <id|nome>`,
  `--resume latest` (docs/user-guide/sessions); `/model` a sessione viva e
  `hermes approvals` — *"Approval-prompt tools — mine approval history into
  allowlist proposals"* — e `hermes sessions list|browse|export|delete|prune|archive|stats|rename|optimize|repair`
  (docs/reference/cli-commands). Il prompt è corretto su tutti e tre.
- TALOS mobile oggi: resume reale via `/resume` (parità), **nessun** `/model`
  vivo (R3), **nessuna superficie** per le proposte di allowlist benché
  `mobile/src/lib/tools/toolAuthorizationFriction.ts` le calcoli (§4.3 del
  prompt, confermato per assenza di riferimenti nel bundle Codice).
- **Non riverificati oggi**: DeepSeek Harness (MIT dal 13/8), Codex #1
  Terminal-Bench 89,5 %, Claude Code «auto» default dal 14/8. Restano
  dichiarazioni del prompt al 28/8.

### R10 · breakthrough · quattro proposte, ognuna con la sua lettera
1. **Registro semantico della sessione** (C4, C6): oggi il transcript è il
   database anche in TALOS. Con lo store fuori dall'albero (R1) e i dati del
   telefono già collegati (`codiceDati.ts`), un indice «cosa ha toccato la
   sessione» (file, note, task, pagine) è **L3 per LUOGO**: nessun
   concorrente ha note/attività/memoria della persona a portata di kernel.
2. **Ricevute firmate per giro** (C2, C5): `harness-receipt-keypair.mjs`
   esiste già nel server desktop; legare «test passati» a una firma e a una
   versione è **L3 per POSSESSO** dei due lati (schemi + motore).
3. **Superficie approvals** come Hermes (`toolAuthorizationFriction.ts` →
   una lista «candidati da rivedere» nel Capability hub): **L2**, utile ma
   copiabile.
4. **Calore e batteria come input del kernel** (C8): nessun concorrente
   gira su un chip che si scalda; un giro che rallenta o si ferma sopra una
   soglia termica è **L3 per VINCOLO**. Non ho trovato nulla nel kernel che
   legga stato termico (`grep -i "termic\|battery\|thermal"`: zero).

### R11 · ottimizzazione/organizzazione · la documentazione
- `AVM/.claude`: 85 voci, **219 MB**, di cui 93 MB screenshot di campagna e due
  APK da 53 MB; 59 file `.md`, il ledger principale 213 KB in 51 sezioni.
  `TALOS-RICERCHE`: 45 voci. Nel worktree desktop `.claude` contiene anche
  `device-base.apk` ×2.
- Giudizio da fuori: la disciplina è reale (ogni chiusura con commit e
  correzione delle letture sbagliate, §44 è esemplare). Il costo è che il
  contesto di una sessione nuova si carica di storia: binari e screenshot in
  `.claude` non servono a nessun lettore automatico e i ledger lunghi vanno
  letti con un indice. Proposta: binari e png fuori da `.claude` (ignorati o
  in `TALOS-RICERCHE`), un `INDICE.md` per i ledger con la sola riga di stato
  per sezione.

## 2 — Verificato in questa review (non ereditato)
- Kernel: `node --test mobile/scripts/harness-talos/talosHarness.test.mjs` →
  **190/190**, 0,49 s.
- Copie sincronizzate: md5 identici per il kernel (`scripts/…` =
  `assets/talos-harness-ui/kernel/`) e per `app.js` nelle **tre** copie
  (`public/harness-ui`, `assets/…/mobile-public`, `assets/public/harness-ui`).
- Stringhe mockup: tutte trovate con grep del testo esatto (R5).
- Rotte del server embedded: elenco completo letto in `http-app.mjs` (1.560
  righe contro 2.560 del desktop; 26 moduli contro 74).
- Impronte `TALOS-RICERCHE`: nessuna riga non OK.
- **Non fatto**: esecuzione sul device (fuori dai confini del prompt), suite
  TS/Vitest completa (6.851 test dichiarati, non rilanciati), riverifica
  dei concorrenti diversi da Hermes.

## 3 — Ordine consigliato
R1 (un `mkdir -p` e una variabile: sblocca tutto il resto) → R2+R3 (una rotta
sola, `/settings`, già scritta sul desktop) → R4 (porting misurato) → R5
(porting Browser/notifiche dal desktop, decisione su Scope corrente) → R8
(una riga di gate) → R7 e R10 (decisioni di architettura dell'owner).
