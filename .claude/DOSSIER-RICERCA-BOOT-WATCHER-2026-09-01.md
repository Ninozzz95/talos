# Dossier ricerca — avvio desktop e watcher delle sessioni ripristinate

Data: 2026-09-01

## Problema misurato

Durante il riavvio controllato del server owner su `127.0.0.1:4174`, il nuovo
processo ha riletto le sessioni persistite ma non è arrivato al `listen()` HTTP.
Il processo `node harness-ui/server.mjs` ha raggiunto circa **130.000 handle**,
**1,8 GB** di memoria privata e CPU in crescita. Il punto di accumulo è stato
isolato in `session-registry.ripristina()`: ogni sessione storica riattivava
subito `guardaWorkspaceFn`, quindi più workspace completi venivano scanditi
prima che il server potesse accettare richieste.

## Fonti primarie correnti

1. Node.js, `fs.watch`: `recursive` include tutte le sottodirectory; su Windows
   il meccanismo dipende da `ReadDirectoryChangesW`; il watcher restituisce una
   risorsa `FSWatcher` da chiudere o abortire quando non serve più.
   <https://nodejs.org/api/fs.html#fswatchfilename-options-listener>
2. Visual Studio Code, *File Watcher Internals*: le richieste identiche vengono
   deduplicate, i watcher ricorsivi sovrapposti riusano il percorso più corto e
   le richieste di file tentano di riusare un watcher ricorsivo esistente.
   <https://github.com/microsoft/vscode/wiki/File-Watcher-Internals>
3. Visual Studio Code, configurazione `files.watcherExclude`: i workspace
   grandi devono escludere output e directory ad alto costo; la descrizione
   ufficiale collega esplicitamente watcher ampi a consumo CPU.
   Upstream ispezionato e fissato al commit
   `2fede327f01761213927d340cee3be56062c6132`:
   <https://github.com/microsoft/vscode/blob/2fede327f01761213927d340cee3be56062c6132/src/vs/workbench/contrib/files/browser/files.contribution.ts>

## Decisione upstream

**ADAPT**, non duplicare un file watcher per ogni cronologia. Il gestore TALOS
già condivide il watcher per cartella; manca però il confine di ciclo vita:
una sessione soltanto ripristinata è una trascrizione passiva e non deve
accendere I/O ricorsivo. Il watcher viene attivato una volta, al primo vero
`resume`, e continua a essere riusato nei turni successivi della stessa voce.

Non si adotta un nuovo pacchetto: `chokidar` è già l'adapter posseduto dal
progetto e il problema non è la libreria, ma il momento in cui viene invocata.

## Confronto prodotto

- **VS Code:** condivisione e deduplica dei watcher; TALOS applica lo stesso
  principio al livello sessione e non tratta ogni cronologia come un workspace
  aperto.
- **Claude Code / Codex / Hermes:** una conversazione storica non implica che
  ogni workspace passato resti sorvegliato prima dell'apertura. TALOS mantiene
  la cronologia disponibile ma rimanda il costo operativo al momento in cui
  l'utente riprende davvero quel lavoro.

## Gate

- RED permanente: `SESSION-RESTORE-LAZY-WATCHER-24`.
- GREEN focalizzato: `session-registry.test.mjs` e `workspace-watcher.test.mjs`.
- Regressione: suite backend completa.
- Prova reale: boot di `4174`, health `200`, handle/memoria stabili, Doctor,
  ripresa Qwen e watcher attivato senza duplicazione.

