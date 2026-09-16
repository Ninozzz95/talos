# Consegna — P0 lag Harness Desktop

Data: 01/09/2026  
Stato: **GREEN, implementato e verificato**  
Perimetro: solo desktop; nessun file mobile toccato dalla slice.  
Commit: non creato in questa slice.

## Risultato per l'owner

Il lag prioritario non era una sensazione né un limite generico del computer.
Sono state riprodotte e misurate due cause nel prodotto:

1. l'osservazione ricorsiva dei file poteva aprire centinaia di migliaia di
   risorse del sistema e consumare gigabyte;
2. lo sfondo animato aggiornava lo stile dell'intera pagina a ogni fotogramma.

Ora l'app usa una sola osservazione nativa per workspace, la tiene viva solo
quando un run o una pagina aperta ne ha bisogno e la chiude all'ultimo owner.
Lo sfondo viene animato dal browser sui due soli elementi decorativi e non
costringe più tutta l'interfaccia a ricalcolare lo stile.

## Ricerca ufficiale e confronto competitor

Dossier completo:
`.claude/DOSSIER-RICERCA-LAG-DESKTOP-2026-09-01.md`.

Pin esatti ispezionati:

- Hermes `82e6c46b9428a5eb7739978590913a32c814298b`;
- Pi `b8b873b9872db04a938fb4357b5e8e824ddc051c`;
- Codex `1f4c47343a1bff2d8cddc429c5d39503fb5a6c30`;
- Claude Code `a1e64dc407dd57dfb4ea283b0f8049adf3eabee5`.

Decisioni applicate:

- da Hermes: separare costo idle e costo streaming, sospendere il lavoro
  decorativo quando non osservabile e misurare il churn del renderer;
- da Pi: ownership esplicita, coalescing e cleanup degli osservatori;
- da Codex: registrazioni condivise, lifecycle legato al client e cleanup
  deterministico;
- da Claude Code: evitare traversal e trasformazioni senza cambi di stato;
  il repository pubblico offre changelog ufficiale, non il renderer sorgente,
  quindi non sono state inventate implementazioni non pubbliche;
- da Node 24 e Chrome/web.dev: `fs.watch` ricorsivo su Windows e animazioni
  compositor-only con `transform`/`opacity`.

Il watcher nativo è stato adottato direttamente. Chokidar è stato rimosso da
questo backend. Un utility process in stile VS Code/ParcelWatcher resta un
fallback soltanto se una futura misura reale farà fallire il budget.

## File della slice

Creati:

- `.claude/DOSSIER-RICERCA-LAG-DESKTOP-2026-09-01.md`;
- `.claude/LEDGER-LAG-DESKTOP-2026-09-01.md`;
- `.claude/CONSEGNA-LAG-DESKTOP-2026-09-01.md`.

Modificati:

- `harness-ui/src/workspace-watcher.mjs`;
- `harness-ui/src/session-registry.mjs`;
- `harness-ui/tests/workspace-watcher.test.mjs`;
- `harness-ui/tests/full-access-root-e2e.test.mjs`;
- `harness-ui/tests/session-registry.test.mjs`;
- `harness-ui/package.json`;
- `harness-ui/package-lock.json`;
- `harness-ui/public/app.js`;
- `harness-ui/public/styles.css`;
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`;
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`;
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`;
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`.

Nessun file è stato eliminato. La worktree conteneva già molte modifiche di
altre fasi; sono state preservate senza reset o staging globale.

## Test permanenti aggiunti

- `WATCHER-NATIVE-SINGLE-25`;
- `WATCHER-NATIVE-NULL-FILENAME-26`;
- `SESSION-WATCHER-LIFECYCLE-27`;
- `SESSION-WATCHER-LIFECYCLE-28`;
- `SESSION-WATCHER-LIFECYCLE-29`;
- `SESSION-WATCHER-LIFECYCLE-30`;
- `BACKGROUND-MOTION-COMPOSITOR-02`;
- `BACKGROUND-MOTION-PERF-03`;
- `BACKGROUND-MOTION-PAUSE-04`.

Il vecchio test di restore è stato aggiornato al contratto corretto: un watcher
non vive per tutta la durata del processo, ma può essere riaperto quando una
sessione storica viene realmente osservata.

## Evidenza fresca

- backend completo: **1259/1259**;
- `npm --prefix harness-ui/frontend run verify`: **GREEN**;
- browser completo: **76 passati**, **2 opt-in saltati**;
- health owner `127.0.0.1:4174`: **HTTP 200**, PID `3640`;
- boot post-fix: `273` handle, `73.25 MB` privati;
- sessione storica aperta/chiusa: `273 → 277 → 272` handle;
- idle stabilizzato: `0 s` CPU su `5 s`;
- motion ON per 5 s: `RecalcStyleDuration=0`,
  `TaskDuration=0.001432`;
- motion OFF per 5 s: `RecalcStyleDuration=0`,
  `TaskDuration=0.000531`.

Confronto ante-fix riprodotto: `255330` handle, circa `3.03 GB` privati,
`8.125 s` CPU in una finestra di `5 s`; motion ON circa `0.4635 s` di
ricalcolo stile per `5 s`.

## Evidenza visiva

Screenshot ispezionati integralmente:

- `harness-ui/frontend/artifacts/p0-lag-2026-09-01/desktop-1440x900-dark.png`;
- `harness-ui/frontend/artifacts/p0-lag-2026-09-01/desktop-1024x800-light.png`.

Nessun overflow orizzontale, sovrapposizione, clipping, flash o cambio della
forma del composer. Il rail destro scompare correttamente alla viewport più
stretta e i due temi restano leggibili. Il browser in-app non esponeva
istanze; queste sono catture Playwright locali, dichiarate come tali.

## Vincoli rispettati e passo successivo

- nessun nuovo messaggio inviato a un modello;
- nessun modello diverso da Qwen chiamato;
- nessun processo estraneo fermato;
- nessun file mobile modificato dalla slice;
- server owner riavviato solo dopo verifica di PID/comando/porta e lasciato
  sano su `4174`.

Il P0 lag è chiuso. La ricognizione successiva ha anche chiuso formalmente la
**Fase 1 — fondazioni frontend modulari** già implementata. Il prossimo passo
della roadmap è la **Fase 2 — stato, lifecycle e decisione architetturale**,
mantenendo questi test come contratti bloccanti.
