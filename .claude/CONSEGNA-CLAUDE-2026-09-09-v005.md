# Consegna autosufficiente — versione 005, scritta da Claude

Snapshot: **2026-09-09T17:10:02Z / 19:10:02 Europe/Rome**. Continua la linea delle consegne di Astra
(`CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v004-134857Z.md`, che incorpora v001-v003): quella resta immutabile
e va letta per intero. Questa versione dice cosa è successo DOPO, chi ha in mano cosa, e da dove si
riparte. ⛔ Regola dell'owner per chi continua: **non assumere nulla; a ogni incertezza chiedere
all'owner.**

## 1. Cosa è cambiato dalle 15:48 del 09/09 (v004)

| Quando | Cosa | Dove |
|---|---|---|
| ~16:10 | Astra finisce i crediti a metà di F5c. Sul disco, non committati: 14 file (+347 −80) e sei foto scattate alle 16:13 mai annotate. | worktree `AVM-context-engine` |
| ~18:40 | Claude prende in carico. Le sei foto aperte una per una e registrate in `.claude/ISPEZIONI-FOTO.md` (sezione 09/09 F5c). | `AVM-context-engine` |
| 19:08 | **`25cf2602`** `wip(context): F5c di Astra messa al sicuro` — fotografia del lavoro com'era, nessuna rifinitura. Misurato prima del commit: unit context-monitor/progress/compactor 11/11, unitari frontend 475/475, browser `playwright.context.config.mjs` 2/2. | branch `codex/talos-context-engine` |
| 19:03 | **`8173622c`** `chore(privata): niente più ignorato` — `.claude/`, `CLAUDE.md`, `AGENTS.md` tracciati nel repo PRIVATO (1.345 file, 453 MB, quattro binari ~55 MB sotto il tetto GitHub). Pushato su `origin` insieme ai 13 commit di Astra dell'08/09 (`dff4d2ef..8173622c`). | `lane/harness-desktop` |

**Decisione owner del 09/09 sui due remoti**, che cambia il `.gitignore` e va rispettata da chiunque
continui: la repo **pubblica** (`public` → `Ninozzz95/talos`, storia separata, costruita da `mobile/`)
non deve contenere traccia di agenti, ricerche, ledger; la repo **privata** (`origin` →
`Ninozzz95/agent-virtual-machine`, `isPrivate=true`) contiene tutto. Il cancello della pubblicazione è
`scripts/prepara-la-pubblicazione.ps1`, non il `.gitignore` di questa cartella.

## 2. Stato di F5c (Context Manager) — letto dal codice e dalle foto, non dal ledger

Fatto e visto nelle foto (processo desktop isolato, chat fixture, **nessuna inferenza reale**):
- il pulsante nei quattro topbar e il titolo della modale dicono **«Context Manager»**;
- «Gestisci automaticamente» **spuntato di default**;
- il click **apre la modale** e non avvia mai una sintesi; via il ripiego che dopo `CTX_NOT_ENABLED`
  chiamava il vecchio `POST /compact`; le chat non abilitate aprono la modale con la spiegazione;
- la barra **«Compattazione contesto in corso»** vive nella chat, resta a modale chiusa, ricompare al
  reload (`context-progress.js`, `context-monitor.js`), con «Context Manager» a destra per riaprire;
- separatore di versione persistente (già in v003), verificato al reload.

Non ancora fatto (v004 §Prossimi passi, ancora vero):
1. Una **prova che nessuna condizione del click** chiami `/compact` o `/context/jobs` implicitamente.
2. La **misura corrente del contesto** nella modale: oggi dice «Non disponibile» tre volte. Va derivata
   dal corpo preparato con strumenti e riserva — non da un GET con tools vuoti, non da un dato storico.
3. Fine compattazione: sparizione della barra, **un solo** separatore, consumi aggiornati nel piede —
   Astra lo stava verificando quando i crediti sono finiti. La suite browser è 2/2 ma copre il
   percorso desktop, non questa chiusura come l'owner la vede.
4. Tutto il resto dell'elenco v004 (impostazioni strict, cambio modello, job tardivi, embedding
   locale, qualificazione sui due GGUF, prova dal composer, revisione finale, prova owner, attivazione).

⛔ **Il 4174 non ha niente di tutto questo.** TCEC vive solo nel worktree isolato; l'attivazione
generale è dell'owner, dopo la sua prova.

## 3. Dove sta ogni cosa

| Cosa | Percorso |
|---|---|
| Codice TCEC + F5c | `C:/Users/Antonino/Desktop/projects/AVM-context-engine`, branch `codex/talos-context-engine`, HEAD `25cf2602` |
| App desktop dell'owner | `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop`, branch `lane/harness-desktop`, HEAD `8173622c` (+ i commit di questa consegna) |
| Consegne precedenti | `.claude/CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v004-134857Z.md` (v001-v004 dentro) |
| Ticket di lavoro di Claude | `.claude/TICKET-CONSEGNA-AD-ASTRA-2026-09-08.md`, §8 registro cronologico |
| Ledger TCEC | `AVM-context-engine/.claude/LEDGER-TALOS-CONTEXT-ENGINE-2026-09-08.md` |
| Foto F5c ispezionate | `AVM-context-engine/scratchpad/prove/foto/tcec-manager-*.png` + `.claude/ISPEZIONI-FOTO.md` |
| Foto della barra ad albero (08/09) | scratchpad di sessione Claude, `prove/foto/C44…C50`, registro `ispezioni.md` |

## 4. Regole per chi continua (le stesse di Astra, più due)

Ricerca web con fonte e data prima di ogni edit di prodotto; ledger prima del codice; foto aperte e
annotate una per riga (il cancello `regole-vincolanti.mjs` conta una foto per riga, con almeno
quattro parole di verdetto accanto — verificato il 09/09, tre commit fermati prima di capirlo);
niente `Co-Authored-By`; il push si chiede; inline, **nessun agente** (ultima istruzione owner sui
crediti); le sonde non toccano il 4174.

Le due nuove:
- **Nessuno script scrive un documento con `open(p,'w')`**: si codifica prima, si scrive su un
  temporaneo, poi `os.replace`. L'08/09 il ticket è stato azzerato così.
- **Un riavvio si prova dall'ora di nascita del processo che ascolta**, non dal fatto che la porta
  risponda: `npm run aggiorna` in background con l'output buttato via ha fatto credere due volte a un
  riavvio mai avvenuto.

**Owner:** decidere quando provare Context Manager di persona (è la porta dell'attivazione).
**Claude dopo:** i punti 1-3 del §2, in quest'ordine, nel worktree TCEC.
**Rimane:** tutto il §2 «non ancora fatto», la qualificazione reale, la revisione finale.
