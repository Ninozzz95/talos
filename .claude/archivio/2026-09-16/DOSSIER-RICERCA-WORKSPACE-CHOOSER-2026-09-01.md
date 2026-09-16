# Dossier di ricerca — Nuova sessione / workspace chooser desktop

Data: 2026-09-01  
Perimetro: `AVM-harness-desktop`, TALOS UI desktop. Mobile consultato soltanto come riferimento.  
Regola FE applicata: skill ufficiale `frontend-design`, documentazione primaria aggiornata e prova visiva reale obbligatoria.

## 1. Problema misurato

La modale **Nuova sessione** oggi presenta due interfacce diverse:

- un `<select>` con i progetti configurati quando la policy non è `Full access`;
- un campo testuale assoluto più alcune pillole quando la policy è `Full access`.

Il percorso è quindi una configurazione tecnica da conoscere a memoria, non una scelta visiva. Il file tree TALOS esistente è invece già comprensibile e navigabile, ma è legato a una sessione avviata e porta anche CRUD, drag-and-drop e menu contestuali: riutilizzarlo così com'è prima della sessione allargherebbe inutilmente il rischio.

La richiesta owner è una superficie unica, larga e alta, che parta da `C:\`, mostri directory consigliate sopra lo stesso albero e collochi modello, reasoning, planner e policy in una colonna destra spaziosa.

## 2. Job to be done e direzione visuale

L'owner deve poter dire, in un'unica superficie: **“TALOS lavorerà qui, con questo modello e questi limiti”**. La firma del componente è una *workspace lens*: percorso, albero, selezione e call-to-action si aggiornano insieme; nessun pannello decorativo.

Wireframe funzionale:

```text
┌ Nuova sessione ─ percorso scelto ─────────────────────────────── × ┐
│ Scelte rapide: Progetto recente · Desktop · Download · Documenti │
├────────────────────────────────────┬───────────────────────────────┤
│ WORKSPACE                           │ SESSIONE                      │
│ C:\ › Users › Antonino             │ Modello                       │
│ ┌ albero directory, lazy ─────────┐│ Livello di ragionamento       │
│ │ ▸ Program Files                 ││ Planner opzionale             │
│ │ ▾ Users                         ││ Accesso al workspace           │
│ │   ▸ Antonino                    ││ Riepilogo naturale             │
│ └─────────────────────────────────┘│                               │
├────────────────────────────────────┴───────────────────────────────┤
│ Annulla                         Continua nella chat — <cartella>   │
└────────────────────────────────────────────────────────────────────┘
```

Scelte della skill `frontend-design`:

- si conservano font, colori, raggi, ombre e motion token di TALOS; nessun nuovo esadecimale o font;
- gerarchia da workbench, non collezione di card generiche;
- colonna albero dominante, impostazioni secondarie ma sempre visibili;
- path e cartella selezionata sono il centro dell'interazione, non una decorazione;
- footer stabile, con azione che nomina la cartella scelta;
- a 1024 px il layout resta a due colonne compatte; sotto la soglia mobile del desktop shell diventa verticale senza overflow.

## 3. Ricerca primaria e confronto competitor

### VS Code

Fonti: [Getting started](https://code.visualstudio.com/docs/editing/getting-started), [Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust).

Punti forti:

- “Open Folder” rende la directory un fatto esplicito del workspace;
- l'Explorer usa espansione pigra e una gerarchia familiare;
- la fiducia è separata dalla semplice navigazione.

Limite per TALOS: scelta cartella e impostazioni dell'agente vivono in passaggi separati. TALOS può fare one-up unendo visibilità del workspace, modello e policy senza concedere implicitamente privilegi.

### OpenAI Codex su Windows

Fonti ufficiali: [Codex app on Windows](https://learn.chatgpt.com/docs/windows/windows-app), [Local environments](https://learn.chatgpt.com/docs/environments/local-environment).

Punti forti:

- il progetto locale viene aperto da un vero selettore di cartelle;
- il confine del progetto resta la base sicura;
- `Full access` è descritto come scelta più rischiosa, non come scorciatoia neutra.

Limite per TALOS: il picker nativo è affidabile ma non offre la superficie ricca richiesta dall'owner. Decisione: non adottarlo in questa slice; mantenere però un adapter separato affinché l'installer futuro possa sostituire la sorgente del percorso con il picker nativo senza riscrivere la modale.

### Claude Code

Fonte ufficiale: [CLI usage](https://docs.anthropic.com/en/docs/claude-code/cli-usage).

Punto forte: le directory aggiunte sono validate come percorsi esistenti. Limite: è un contratto CLI, non una UX visuale. TALOS conserva la stessa esplicitezza ma la traduce in scelta visiva.

### Hermes Agent

Pin ispezionato: `NousResearch/hermes-agent@86b50fb43a7716a9fae59bc5539afc59e15d3f3b`.  
Fonti: [TUI README al pin](https://github.com/NousResearch/hermes-agent/blob/86b50fb43a7716a9fae59bc5539afc59e15d3f3b/ui-tui/README.md), [configuration al pin](https://github.com/NousResearch/hermes-agent/blob/86b50fb43a7716a9fae59bc5539afc59e15d3f3b/website/docs/user-guide/configuration.md).

Punto forte: completamento dei percorsi e picker rapidi nel terminale. Limite: poca panoramica visuale e rischio di dipendere dal current working directory. TALOS farà della cartella scelta un fatto immutabile della sessione, mai ricalcolato dopo l'avvio.

## 4. Standard di interazione adottati

- [WAI-ARIA Tree View Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/): frecce, Home/End, Enter, typeahead e distinzione tra focus e selezione.
- [WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): focus iniziale utile, Tab contenuto, Escape, chiusura visibile, ritorno del focus.
- [WCAG H102 — HTML dialog](https://www.w3.org/WAI/WCAG21/Techniques/html/H102): il `<dialog>` esistente resta la base; il lifecycle custom dell'app embedded non viene riscritto in questa slice, ma ne vengono rispettati i contratti focus/close.
- [Node.js file system](https://nodejs.org/api/fs.html): `readdir({withFileTypes:true})`, un solo livello; `realpath` per il confine canonico; nessuna scansione ricorsiva.
- [Windows known folders](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid): Desktop/Documenti/Download possono essere reindirizzati; oggi restano suggerimenti verificati sul disco, mentre l'installer dovrà usare le Known Folder API.
- [Windows reparse points](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points): junction/symlink non vengono attraversati dal browser di scelta.
- [Windows App SDK FolderPicker](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.windows.storage.pickers.folderpicker?view=windows-app-sdk-2.0): candidato futuro per l'installer, non per questa superficie embedded.

## 5. Decisione upstream

**Adopt direttamente** i contratti WAI-ARIA per dialog e tree.  
**Adapt** il file-tree TALOS dietro un nuovo adapter AVM in sola lettura.  
**Reject per questa slice** un nuovo framework, una libreria di file manager o il FolderPicker nativo: il primo aumenterebbe il costo di cutover, la seconda introdurrebbe capacità non necessarie, il terzo non soddisfa la superficie combinata richiesta. Nessun nuovo package.

## 6. Contratto backend proposto

Nuovo adapter `createWorkspaceBrowser()`:

- radice canonica: root del disco del processo (`C:\` nell'ambiente owner);
- `browse(percorso?)`: legge soltanto un livello e restituisce soltanto directory;
- nessun contenuto file, nessuna scrittura, nessun processo, nessuna ricorsione;
- percorsi relativi, UNC, altro drive, NUL, traversal e path oltre il budget sono rifiutati prima della lettura;
- la directory richiesta è risolta canonicamente e deve restare nella radice;
- reparse point/symlink non vengono offerti come directory navigabili;
- errori tecnici sono normalizzati dal client in una frase naturale con azione “Apri Doctor”.

Endpoint: `GET /api/v1/workspace-browser?path=<assoluto>`. Senza `path`, parte dalla radice. La risposta include `root`, `path`, `parent`, `items`, `recommended`; le raccomandazioni combinano cronologia reale e cartelle Windows realmente esistenti, deduplicate.

La selezione non cambia la policy. Una directory allowlisted produce `cartellaId`; una directory arbitraria richiede una scelta esplicita `Full access`. Il CTA resta disabilitato e spiega la soluzione finché i due fatti non sono coerenti. Nessuna escalation silenziosa.

## 7. Contratto frontend

- stessa `sheetDialog`, con variante CSS `sheet-dialog--new-session` rimossa sempre all'apertura di qualsiasi altro foglio;
- `role="tree"` e `role="treeitem"`, single selection;
- chevron/freccia espande; click sulla riga seleziona; focus e selezione sono visivamente distinti;
- scorciatoia = riancora lo stesso albero e seleziona quella directory, con protezione dalle risposte obsolete;
- path editabile per incollare un percorso, con invio per navigare;
- albero con scroll locale; pagina e footer non saltano;
- nessun context menu, rename, delete, open, attach o drag/drop;
- modello, effort e planner riusano gli stessi componenti già presenti;
- policy locale alla modale, applicata solo quando si conferma;
- chiudere o premere Escape non persiste una scelta incompleta;
- motion solo tramite token TALOS e azzerata con reduced motion.

## 8. Threat model e performance

- La UI gira soltanto sulla superficie loopback esistente, ma il percorso resta input non fidato.
- Nessun enum ricorsivo di `C:\`: la radice restituisce un solo livello.
- Ogni click genera al massimo una lettura di directory; le richieste precedenti vengono ignorate quando ne arriva una più recente.
- Limite percorso 1024 caratteri lato adapter, oltre al limite request-target HTTP esistente.
- Il server convalida nuovamente la cartella al vero avvio: il chooser non è un'autorità di sicurezza.
- Il browser non segue junction/symlink e non accetta un altro volume o UNC.

## 9. Matrice di verifica

Automatica:

- root predefinita, one-level, directories-only e ordine stabile;
- traversal, UNC, drive diverso, NUL, path lungo e reparse point;
- cartella illeggibile e messaggio naturale;
- cronologia + Known Folders deduplicate;
- focus/selezione, tastiera, typeahead, gara fra richieste;
- scelta allowlisted vs arbitraria/Full access;
- cancellazione senza mutazioni;
- 1440×900, 1280×800, 1024×800 e reduced motion;
- suite Node completa, browser product completa, build frontend, snapshot contratto, `git diff --check`.

Visiva reale obbligatoria:

1. apertura 1440×900 su `C:\`;
2. scorciatoia Desktop e aggiornamento live dello stesso albero;
3. directory arbitraria con gate Full access leggibile;
4. cartella allowlisted con CTA pronto;
5. 1280×800 e 1024×800 senza overflow o controlli tagliati;
6. focus tastiera visibile;
7. errore cartella non disponibile;
8. reduced motion.

Il gate finale include una sessione reale con un messaggio naturale tramite **Qwen 3.8 Flash**, su server isolato se il processo owner `4174` non può essere riavviato. `4174` deve restare HTTP 200 per tutta la fase.

## 10. Limite operativo attuale

Il runtime browser integrato ufficiale è stato predisposto ma non espone al momento alcun browser (`agent.browsers.list() = []`). Non si sostituisce questa prova con uno screenshot inventato o con un browser non autorizzato. Implementazione e test sintetici possono procedere; il blocco non diventa green finché la prova visiva ufficiale non torna disponibile.

## 11. Addendum review — submit durante navigazione asincrona

Finding indipendente `WORKSPACE-CHOOSER-PENDING-22`: durante una lettura lenta il tree esponeva correttamente `aria-busy`, ma il submit nativo restava abilitato con la selezione precedente. L'ultimo gesto dell'owner poteva quindi puntare a Desktop mentre “Continua” avviava ancora il progetto precedente.

Fonti primarie verificate il 01/09/2026:

- WAI-ARIA 1.2: un widget in aggiornamento deve esporre `aria-busy=true` finché la modifica non è completa;
- HTML/MDN `disabled`: per un controllo nativo il booleano `disabled` sopprime interazione e partecipazione alla submission;
- WAI-ARIA APG, keyboard interface: quando la presenza del comando è inferibile, il controllo temporaneamente non applicabile può essere rimosso dal tab order tramite `disabled` nativo.

Decisione upstream: **adottare direttamente** `aria-busy` sul widget aggiornato e `disabled` sul bottone nativo; **adattare** con una guardia TALOS nel submit e una generazione richiesta già posseduta. Per una navigazione che implica nuova selezione, la selezione precedente viene invalidata subito. Solo la risposta valida più recente può togliere lo stato busy e riabilitare la CTA. Nessuna nuova dipendenza.

### Addendum junction/reparse diretto

La review ha provato su Windows che `realpath()` da solo attraversa una junction interna alla root. Le fonti ufficiali Node.js chiariscono che `Dirent` può dipendere dal filesystem e raccomandano `lstat()` quando serve il tipo accurato; `Stats.isSymbolicLink()` è valido proprio sul risultato di `lstat()`. Microsoft documenta junction, symbolic link e mounted folder come reparse point che possono deviare l'accesso verso un'altra directory o volume.

Decisione upstream: **adattare dietro l'adapter AVM** `fsPromises.lstat`, controllando ogni segmento lessicale dalla root alla destinazione prima di `realpath`/`readdir`. Un segmento link/junction viene rifiutato anche se il target canonico resterebbe dentro la root. Il filtro `Dirent` resta una prima barriera per i figli enumerati; `lstat` chiude il percorso digitato/recommended. Nessun comando `fsutil`, nessun processo esterno e nessuna mutazione.
