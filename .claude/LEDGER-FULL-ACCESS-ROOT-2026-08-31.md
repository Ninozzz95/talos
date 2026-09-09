# Ledger — Full access su radice filesystem

Data: 31/08/2026  
Perimetro: `harness-ui` desktop; `mobile/` sola lettura.

## Obiettivo

Chiudere il known issue della sessione con `Full access` su `C:\\` senza
avviare un osservatore ricorsivo sull’intero disco. La scelta resta esplicita
per sessione; il file tree continua a leggere un solo livello su richiesta.

## Contratto e upstream

- VS Code Workspace Trust: una cartella non fidata resta ristretta finché
  l’owner non autorizza esplicitamente ([documentazione ufficiale](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)).
- Node `fs.readdir` con `withFileTypes` è il contratto per l’elenco a un livello
  ([documentazione ufficiale](https://nodejs.org/api/fs.html)).
- Chokidar resta usato per workspace ordinari; la radice di un volume non viene
  osservata ricorsivamente, perché il costo non è delimitabile in modo sicuro.

Decisione upstream: ADAPT. Manteniamo il watcher esistente per cartelle di
progetto e introduciamo un guard fail-closed per le radici filesystem.

## Ledger RED → GREEN

### File da modificare

- `harness-ui/src/workspace-watcher.mjs` — riconoscere una radice volume e
  restituire una disiscrizione no-op senza chiamare chokidar.
- `harness-ui/src/session-registry.mjs` — nessun cambiamento di semantica:
  continua a passare la radice scelta al watcher e al kernel.

### File da creare

- `harness-ui/tests/full-access-root-e2e.test.mjs` — prova contraria per radice
  `C:\\`, directory non leggibile, percorso non-root e consenso Full access.
- `.claude/CONSEGNA-FULL-ACCESS-ROOT-2026-08-31.md` — risultato e limiti.

### RED atteso

Una radice di volume riconosciuta deve lasciare zero watcher attivi e non deve
chiamare `chokidar.watch`; una cartella ordinaria deve continuare a registrare
un watcher e consegnare gli eventi.

### GREEN e regressioni

```text
node --test tests/full-access-root-e2e.test.mjs tests/workspace-watcher.test.mjs
node --test tests/*.test.mjs
node --check src/workspace-watcher.mjs
git diff --check
```

### Gate reale e visivo

La prova reale del modello con `C:\\` resta necessaria per il gate di prodotto:
questa correzione elimina il principale rischio di saturazione del watcher ma
non inventa una risposta del modello. Verificare in seguito nuova sessione,
prompt naturale, elenco lazy, stream, stop, reload e percorso contrario.

### Rollback

Rimuovere il guard e il test dedicato; non cancellare session store o modelli
locali.

