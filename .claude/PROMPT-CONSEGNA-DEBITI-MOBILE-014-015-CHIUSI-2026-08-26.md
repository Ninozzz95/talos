# Consegna — DEBT-MOBILE-014/015 e il gate portrait ereditato, tutti chiusi

Da: agente Claude mobile (backend mobile), sessione che ha eseguito i tre gate
fisici residui la sera/notte del 2026-08-26.
A: chi riprende il lavoro — owner, coordinatore desktop, o una sessione nuova.
Owner: Antonino.

Questo documento è autosufficiente: non presuppone di aver letto la
conversazione che lo ha prodotto. Sostituisce, per lo stato finale,
`.claude/PROMPT-RIPRESA-MAIN-AGENT-DEBITI-MOBILE-2026-08-26.md` e
`.claude/PROMPT-CLAUDE-MOBILE-DEBITI-014-015-2026-08-26.md`, che restano sul
disco invariati come registro storico di come si è arrivati qui.

## Stato in una riga

**DEBT-MOBILE-001…015 sono tutti chiusi end-to-end**, con evidenza reale sul
Pad per ognuno. Gli ultimi tre gate fisici — continuità download nel Model
Lab tablet (014), streaming locale senza thinking/tool call in bolla
pubblica (015), tablet portrait reale (001, mai chiuso prima) — sono stati
completati in questa sessione. Due commit su `lane/voce-personale`, **nessun
push**.

## I due commit di codice, non spinti

```
64d17ea fix(mobile): chiude il gate tablet portrait reale (DEBT-MOBILE-001)
04d798f5 fix(mobile): chiude DEBT-MOBILE-014/015 con prove reali sul Pad
```

Entrambi verificati con `git status --short` prima e dopo: nessun file
estraneo raccolto, `git add` sempre su percorsi espliciti, mai `git add -A`.
`git diff --check` pulito su entrambi. Il commit `04d798f5` è stato
verificato **indipendentemente** durante la sessione da chi ha rivisto il
lavoro (typecheck pulito, `git diff --check` pulito, i 5 file di test dei
due debiti rilanciati a mano — 110/110 verdi) e dichiarato approvato così
com'è, nessuna correzione richiesta.

### ⛔ Incidente di sincronizzazione — la terza modifica (documentazione)

Questa stessa working directory (`AVM` su `lane/voce-personale`) è condivisa
in scrittura con una sessione parallela sul filone Harness UI (commit
`e3ede324`, `c6ecf153`, poi `5128838b` durante questa chiusura). Il terzo
giro di questa sessione — l'aggiornamento del registro
`.claude/DEBITI-MOBILE-POST-CODICE-2026-08-25.md` e la scrittura di questo
stesso prompt — è stato messo in staging con `git add` esplicito sui due
soli file, ma **prima che arrivasse il mio `git commit`, la sessione
harness-ui ha committato lei stessa** (`5128838b`, "porta fork/resume/
compact/elenco sessioni/avvio da corpus"): il suo commit ha fotografato
l'INTERO indice condiviso in quel momento, inglobando anche i miei due file
già staged. Il mio `git commit` successivo ha trovato l'indice vuoto
("nothing to commit") perché era già stato commesso — da un altro commit,
sotto un altro messaggio.

**Contenuto verificato integro**: `git show 5128838b -- .claude/DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
mostra esattamente il diff atteso (le due sezioni DEBT-MOBILE-014/015 più
l'aggiornamento dello stato), e il file di questo prompt è presente per
intero (185 righe). Nessun dato perso, nessun contenuto alterato — solo il
messaggio di commit non descrive questo lavoro, e la cronologia mescola due
filoni indipendenti in un unico commit.

**Non ho riscritto la cronologia** (`reset`/`rebase`) per separare i due
lavori: un'altra sessione era ancora attiva sullo stesso branch nello stesso
istante, e riscrivere la storia sotto i suoi piedi sarebbe stato più
pericoloso del problema stesso. Il fatto resta solo documentato qui.

**Da segnalare a chi coordina le sessioni parallele**: due sessioni Claude
che condividono la stessa working directory git (non worktree separati)
possono intrecciare i propri commit quando entrambe fanno `git add` seguito
da `git commit` in una finestra temporale vicina — l'indice è unico e
condiviso, non isolato per sessione. Se il pattern si ripete, la cura è
`git worktree add` per ogni sessione parallela (branch diversi che
convergono con merge/rebase espliciti), non la disciplina già seguita qui
(percorsi espliciti, mai `-A`) che protegge dal raccogliere lavoro
*ALTRUI dentro il proprio commit*, ma non dal fenomeno opposto — il proprio
lavoro raccolto dentro *un commit altrui*.

**Il push resta l'unica azione non eseguita.** Regola vincolante del
progetto (`.claude/MEMORIA-REGOLE.md` → «I COMMIT SÌ, il PUSH si CHIEDE»):
serve un sì esplicito e fresco dell'owner per QUESTO push specifico, non
un'autorizzazione generica o pregressa. Chi riprende non deve spingere da
solo nemmeno se il resto sembra ovviamente pronto.

## DEBT-MOBILE-014 — continuità download nel Model Lab tablet

Su tablet, le stazioni senza rail chat persistente (Model Lab, Impostazioni)
nascondevano le azioni di testata come se la rail fosse comunque montata.
Fix: `hide-app-actions` dipende ora dalla presenza reale della rail
(`tabletChatRailVisible`), non solo da `isTablet`. Il bottone di download
della variante selezionata proietta lo stato del trasferimento corrispondente
dallo store condiviso `modelTransfers.ts` e diventa `role=progressbar` con
bytes reali; il popover del centro download usa un token z-index sopra la
navigazione globale, sidebar in drawer non modale.

**Precisazione owner ricevuta ed eseguita durante la sessione**: il bottone
della variante doveva portare anche pausa/riprendi/annulla, non solo la
percentuale. Aggiunti riusando le funzioni già esistenti nello store
(nessun poller nuovo); la logica `canPause`/`canResume` è stata estratta in
un modulo condiviso (`lib/models/presentation.ts`, nuove funzioni
`talosTransferCanPause`/`talosTransferCanResume`) così il Centro download e
il pannello variante non possono mai mostrare stati diversi per lo stesso
`id` di trasferimento. Decisione upstream: **non** adottato il pattern
W3C ARIA APG "toggle button" per pausa/riprendi — avrebbe reso lo stesso
comando visivamente diverso a seconda di dove lo si tocca; riusato invece il
pattern già in produzione nel Centro download.

Gate reale sul Pad (repo `MaziyarPanahi/Qwen3-0.6B-GGUF`, mai scaricato
prima, per non toccare i quattro modelli originali): download avviato →
barra con bytes reali in movimento (0%→36%→52%, 232 MB/462 MB) → Pausa
premuta e verificata (la card passa davvero a Riprendi) → Riprendi → Annulla
con conferma → tornato al bottone «Scarica». Modelli di prova rimossi a fine
verifica.

File toccati: `mobile/src/App.vue`,
`mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue`,
`mobile/src/components/shell/TalosMobileSidebar.vue`,
`mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`,
`mobile/src/lib/models/presentation.ts`, `mobile/src/style.css`, più i test
corrispondenti.

## DEBT-MOBILE-015 — thinking/tool call nel prefisso già aperto

Erede diretto di DEBT-MOBILE-011: il parser locale (`thinkStream.ts`)
gestiva marker che *arrivano* durante lo stream, ma il template LFM2/LFM2.5
può chiudere il prompt già dentro `<think>` — il primo delta nativo nasce
quindi già in quello stato. Fix:
`talosCreateThinkSplitter(startsInReasoning?)` può iniziare direttamente nel
canale ragionamento; l'adapter locale deriva quello stato SOLO dal prompt
realmente renderizzato (`plan.prompt.trimEnd().endsWith('<think>')`), senza
euristiche su nome/provider/modello.

Gate reale sul Pad con `LFM2.5-2.6B-Q8_0` e Ragionamento esteso attivo: due
prompt reali (uno breve, uno lungo per avere margine di osservazione),
screenshot catturati **durante** la generazione a intervalli di ~1 secondo —
mai un `<think>`/`</think>`/`<|tool_call_start|>` visibile nella bolla
pubblica in nessun frame osservato; il ragionamento resta in un blocco
separato e richiudibile ("🧠 Ragionamento", collassato). Dopo `am
force-stop` e riavvio dell'app la risposta persistita è rimasta identica e
pulita.

File toccati: `mobile/src/lib/chat/thinkStream.ts`,
`mobile/src/lib/chat/providers/localAdapter.ts`, più i test corrispondenti.

## Il gate ereditato — tablet portrait reale (DEBT-MOBILE-001)

Aperto da prima ancora dei debiti 014/015 (risale a DEBT-MOBILE-001, la safe
area del viewer Markdown), mai chiuso perché tutti i tentativi precedenti
usavano solo `wm size`, che scambia le dimensioni dichiarate ma lascia il
dispositivo internamente in landscape (`mCurrentRotation=ROTATION_90`): il
contenuto rendeva ruotato dentro una tela dalle proporzioni scambiate.

In questa sessione l'owner non era fisicamente davanti al Pad e ha chiesto
di procedere comunque. La sequenza che ha davvero cambiato lo stato di
rotazione (non solo le dimensioni dichiarate):

```
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
```

`dumpsys window displays` ha confermato `mCurrentRotation=ROTATION_0`; per
disciplina del progetto (mai fidarsi del solo comando) è stato comunque
letto lo **screenshot reale per byte**: file `2400×3392` — il formato fisico
portrait del pannello — con contenuto genuinamente impaginato in verticale
in due schermate diverse (Model Lab; Chat con la rail persistente ancora a
due colonne e la risposta completa leggibile). Rotazione automatica
ripristinata a fine prova (`accelerometer_rotation=1`).

Se in futuro serve di nuovo forzare l'orientamento per un test e `wm size`
da solo non basta, questa è la sequenza che funziona su questo Pad
(`2ea6573c`, OnePlus OPD2415): i due `settings put` sopra, non solo `wm
size`.

## Documenti aggiornati in questa sessione

- `.claude/DEBITI-MOBILE-POST-CODICE-2026-08-25.md` — registro originale,
  ora con le sezioni DEBT-MOBILE-014/015 e la chiusura del gate portrait in
  DEBT-MOBILE-001.
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md` — ledger tecnico
  completo: perimetro file, RED/GREEN, decisione upstream sui controlli
  pausa/riprendi/annulla, gate automatici finali, evidenza Pad per tutti e
  tre i gate fisici.
- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md` —
  ricerca primaria aggiunta: W3C ARIA APG sul pattern toggle button (e
  perché non è stato adottato qui).
- `.claude/CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md` — riassunto
  semplice per l'owner, aggiornato con la chiusura di tutti e tre i gate.
- Questo documento.

## Evidenza fotografica selezionata

Cartella: `.claude/pad-debt-campaign-2026-08-26/`. File con prefisso
`final-download-014-*`, `final-streaming-015-*` e
`final-tablet-portrait-real-*` sono le catture finali committate; il resto
della cartella (`gate2-*`, `gate3-*`, `verify*`, `stream*`, `live*`, `nav*`,
`cleanup*`, `ui-*.xml`) sono catture esplorative della sessione, lasciate sul
disco per tracciabilità ma non committate.

## Confini rispettati

- Non toccato TALOS-BANCO.
- Non toccato Harness Desktop / `AVM-harness-ui` / `mobile/public/harness-ui/`
  — durante la sessione è comparso modificato da un'altra sessione in
  parallelo (commit `c6ecf153`, `e3ede324` sullo stesso branch locale); non
  è stato incluso in nessun mio `git add`, verificato riga per riga nello
  status prima di ogni commit.
- Nessuna dipendenza, parser, store o poller nuovo.
- Nessuna modifica alla soglia del bundle (`614.000` byte): il tripwire
  resta rosso, preesistente, fuori perimetro — non è stato toccato per farlo
  passare.
- Nessun push.

## La prima cosa da fare, se riprendi da qui

```bash
cd C:/Users/Antonino/Desktop/projects/AVM
git log --oneline -5        # conferma 64d17ea e 04d798f5 in cima
git status --short          # deve essere pulito sui file di questo lavoro
```

Se l'owner conferma il push con un sì esplicito e fresco:
`git -C C:/Users/Antonino/Desktop/projects/AVM push` (mai `cd ... ; git
push`, mai staccato dal percorso). Altrimenti non c'è altro lavoro aperto su
questo filone: i tre gate erano l'ultimo residuo dei debiti mobile
post-Codice.
