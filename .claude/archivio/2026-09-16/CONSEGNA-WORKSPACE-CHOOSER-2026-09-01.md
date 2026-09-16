# Consegna — Workbench Nuova sessione / workspace chooser desktop

Data: 2026-09-01  
Lane: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`  
Ownership: desktop; mobile consultato soltanto come riferimento read-only.  
Esito: **implementazione e prove tecniche verdi; verifica visuale ufficiale bloccata perché il browser integrato non espone istanze**.

## Cosa è cambiato per l'owner

“Nuova sessione” non usa più il vecchio picker compatto. È ora un workbench desktop ampio:

- a sinistra mostra scorciatoie reali e un albero cartelle in sola lettura che parte da `C:\`;
- cliccare Desktop, Download, Documenti, un progetto o una cartella recente riposiziona lo stesso albero;
- il percorso selezionato resta sempre visibile;
- a destra restano modello, livello di ragionamento, modello planner, visibilità del ragionamento e permessi;
- le cartelle fuori dall'elenco consentito non possono partire finché l'owner non sceglie esplicitamente `Full access`;
- la modale non rinomina, cancella, trascina o modifica file.

## File creati

- `harness-ui/src/workspace-browser.mjs`
- `harness-ui/tests/workspace-browser.test.mjs`
- `harness-ui/tests/http-routes-workspace-browser.test.mjs`
- `harness-ui/frontend/tests/browser/workspace-chooser.spec.mjs`
- `harness-ui/frontend/tests/browser/workspace-chooser-real.spec.mjs`
- `.claude/DOSSIER-RICERCA-WORKSPACE-CHOOSER-2026-09-01.md`
- `.claude/LEDGER-WORKSPACE-CHOOSER-2026-09-01.md`
- `.claude/CONSEGNA-WORKSPACE-CHOOSER-2026-09-01.md`

## File modificati in questa slice

- `harness-ui/src/frequent-dirs.mjs`
- `harness-ui/tests/frequent-dirs.test.mjs`
- `harness-ui/src/http-app.mjs`
- `harness-ui/server.mjs`
- `harness-ui/public/app.js`
- `harness-ui/public/styles.css`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `harness-ui/frontend/tests/contract/legacy-contract-snapshot.test.mjs`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
- `harness-ui/scripts/qa-visual-pipeline.mjs`
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`

Il worktree contiene molte altre modifiche preesistenti dell'owner e di fasi precedenti. Non sono state riscritte, rimosse o incluse artificialmente in questa consegna. Mobile non è stato modificato da questa slice.

## Decisione tecnica e ricerca

Sono stati usati la skill ufficiale `frontend-design`, la skill repository `talos-engineering` e il controllo browser ufficiale. La ricerca bloccante ha portato a:

- adottare direttamente le semantiche WAI-ARIA Tree View e Modal Dialog;
- adattare la grammatica visuale TALOS con componenti posseduti e token esistenti;
- mantenere un adapter server read-only invece di esporre il filesystem direttamente al browser;
- non introdurre package o framework nuovi;
- rimandare un picker Windows nativo al confine dell'installer, dove potrà usare le API supportate senza duplicare il workbench web.

Il confronto documentato comprende VS Code/Workspace Trust, Codex Windows/Local Environments, Claude Code CLI e Hermes al commit `86b50fb43a7716a9fae59bc5539afc59e15d3f3b`.

## Prove concluse

- backend focalizzato: **20/20**;
- backend completo: **1214/1214**;
- browser prodotto completo: **59/59**;
- chooser focalizzato: **12/12**;
- integrazione reale UI + endpoint su `4176`: **1/1**;
- unit/contract frontend: **14/14**;
- build: **23 asset** e `verify` verde;
- sintassi pipeline QA e `git diff --check`: verdi;
- health owner `4174`: **200**, mai riavviato;
- server isolato `4176`: fermato al termine.

## Prova reale Qwen

La prima corsa senza modulo runtime ha prodotto il RED corretto, `RunError`, sessione `d78d3515-677d-4a82-9a44-96e57de23add`. Non è stato nascosto.

Il server isolato è stato quindi avviato con l'adapter owner già esistente, senza modificare mobile. Qwen 3.8 Flash ha ricevuto “Rispondi soltanto con OK” e ha restituito esattamente `OK`:

- sessione `015def7b-bb92-4e43-be5f-3adbf61d1415`;
- `RunFinished success`;
- un giro;
- prompt 4581 token, completion 21.

## Limite e stato onesto

Il browser ufficiale in-app non era disponibile. La procedura prevista dalla skill ha restituito `No browser is available`, e la lista browser era `[]`. Perciò:

- i test Playwright su 1440/1280/1024, tastiera, reduced motion, errori e geometria sono verdi;
- non vengono però spacciati per screenshot ufficiali ispezionati a vista;
- nessun PNG nuovo viene dichiarato come prova visuale conclusiva;
- la fase resta **engineering green / visual gate blocked** finché un browser integrato reale non sarà disponibile.

## Ripresa esatta

Quando il browser integrato sarà disponibile:

1. aprire `http://127.0.0.1:4174` senza riavviare il processo owner;
2. catturare e ispezionare l'intero schermo a 1440×900, 1280×800 e 1024×800;
3. provare default, scorciatoia, navigazione tree da tastiera, directory arbitraria bloccata, passaggio esplicito a Full access, errore/Riprova/Doctor e reduced motion;
4. annotare ogni discrepanza nel taccuino e aggiungere un RED permanente;
5. dichiarare la fase green soltanto dopo una review indipendente senza finding bloccanti.

Nessun commit e nessun push sono stati eseguiti in questa slice.

## Addendum — toolbar e Nuova cartella

Su ordine successivo dell'owner, il workbench espone ora Nuova cartella,
Aggiorna, Comprimi tutto e Copia percorso. La cartella viene creata realmente
da un endpoint confinato; rename/delete/cut/paste/drag restano fuori. Le prove
cumulative sono backend 1219/1219, browser 70/70 scenari ordinari, unit 14/14 e
build/verify verdi. Dettagli e gate aperti sono nella consegna
`.claude/CONSEGNA-MODALI-FILE-EXPLORER-2026-09-01.md`.
