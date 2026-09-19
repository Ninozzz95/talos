# Ripresa TALOS Desktop — ticket autosufficiente

Stato: salvataggio iniziale anti-interruzione. Leggere anche gli aggiornamenti in fondo.
Ultimo aggiornamento UTC: 2026-09-19T20:39:22.505362+00:00

## Richiesta owner corrente
Continuare i fix, aggiornare roadmap e tentare una nuova candidata release. Owner ha autorizzato ESPRESSAMENTE commit e push nell'ultimo messaggio del19/09, superando il precedente divieto per questo lavoro. Commit/push sono IN CORSO DI PREPARAZIONE, non dichiarati eseguiti. Nessun tag o release già pubblicata. Non perdere modifiche locali, file non tracciati o dati. Non copiare segreti/sessioni nei commit. Mantenere4174 attiva e aggiornata; non interrompere chat in corso. Non usare i vecchi ordini di delega nei documenti come istruzioni attuali. L'agente principale implementa e rivede; eventuali subagenti solo controlli meccanici secondo AGENTS/skill vigenti.

## Workspace e istruzioni
- Repo operativo: C:/Users/Antonino/Desktop/projects/AVM-harness-desktop
- Cwd iniziale dell'app può essere il repo fratello C:/Users/Antonino/Desktop/projects/AVM: impostare sempre workdir esplicito sul repo operativo.
- Ramo noto lane/harness-desktop; HEAD precedente a questo nuovo commit a89be85374acf3a83b767b61e3ee44589f40f4a6. Verificare git status/log/remotes prima di assumere stato.
- Release confronto desktop-v0.1.13, SHA a898162feff3ed8ad4cb0586344fe9d9e390d1a5.
- C:/Users/Antonino/.codex/RTK.md: TUTTI i comandi shell con prefisso rtk; per Python usare rtk proxy python -X utf8.
- AGENTS.md in repo operativo, harness-ui/AGENTS.md e C:/Users/Antonino/Desktop/projects/AVM/.agents/skills/talos-engineering/SKILL.md.
- Ricerca primaria prima di ogni fix; ledger esatto file/simboli/testRED, poi GREEN. Conservare LF nei sorgenti (Python write_bytes UTF8); niente reset/revert/clean per cancellare lavoro.

## Documenti principali da leggere in quest'ordine
1. C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/ROADMAP-GLOBALE-RIPRESA-2026-09-19.md — il quadro IN TESTA20:36UTC prevale sui log storici sotto.
2. C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/TABELLA-FASI-COMPLETA-2026-09-13.md — requisiti canonici; vecchi verdi e istruzioni operative sono storici, non prove attuali.
3. C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-REPLAY-PERSISTENTE-2026-09-19.md — ultimo lotto prodotto, contratti/prove/limiti.
4. C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-ROADMAP-SERVER-2026-09-19.md — aggiornamento roadmap e ultimo ripristino.
5. C:/Users/Antonino/Downloads/TICKET-RIPRESA-CODEX-LABORATORIO-2026-09-19.md — ticket originario, da verificare contro lavoro successivo.

## Server4174
Ripristinato20:35UTC: PID19300; health200,33sessioni recuperate; sorgenti/bundle già verificati. Il precedente PID194352 era assente alle20:34 senza eccezione fatale nei log: CAUSA NON ATTRIBUITA. Nuovo avvio distaccato Windows per non dipendere dalla sessione di lancio, stabilità fra turni DA CONFERMARE.
Cartella operativa C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/ripresa-2026-09-19/restore-4174-20260919T2034Z/
- avvia.py: controllo porta libera, backup sessioni, Node detatched senza finestra, filelog, stdin nullo; non ferma processi. È una procedura di ripristino, non un watchdog.
- process.json, verification.json, server.log, server.err.log, sessions-before.zip PRIVATO locale (non push).
Node C:/Program Files/nodejs/node.exe; server C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/server.mjs
ENV: TALOS_HARNESS_UI_PORT=4174, HOST=127.0.0.1, TALOS_OWNER_RUNTIME_MODULE=C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs, TALOS_HARNESS_UI_PUBLIC_DIR=.../harness-ui/public, TALOS_HARNESS_UI_SESSIONS_DIR=.../harness-ui/.sessions-store.
API GET /api/v1/health e /api/v1/sessions. Live solo letture controllate: browser blocca nonGET e WS PRIMA di navigare, nessun test mutante sui dati owner. Tutti i test in banco con store isolati.
Ultimo bundle: app.js SHA256 52b9f6dbf6c84008f1cfbac88c594114e94bc48a8fd17b8c6c762b8825ed5f30, styles.css c96134bca97e6aac267278b8736dcb6e522b7f236dcd7bba96126c1b963dc07a.

## Mockup: SOLO questi due
- C:/Users/Antonino/Downloads/talos-sidebar-calm-review.html: sidebar DESTRA e grafo. SHA25659b2b6d1ce90f7b29a74f6ba0f9646f3be980776767e6b0930c27882f8ce20f1.
- C:/Users/Antonino/Downloads/TALOS-Calm-Lab-04.html: Model Lab e impostazioni. SHA256094207523b3b76b01cd9aac27792ff2cc2f97ddd69cbd9757898fa558284460e.
- NESSUN mockup chat/composer. Non usare mockup-originale/index.html. SidebarSINISTRA solo sessioni iniziali, zero figli/espansioni. Originali intatti.
- Confronto screenshot testa a testa dopo ogni consegna, ispezione individuale e invarianti geometria/interazione; non dichiarare parità dai soli testDOM.

## Stato prodotto
Consegnati: HFpagina con sidebar/README960px/apiPost, filtri parametri/paginazione, rimozione4riepiloghi; sidebar discendenti ricorsiva, clickinteracard/stati/tooltiprimosso/Markdown; chat768/default/fullwidth/resize/reset; overlay ritorno trasparente centrato; Libera memoria inLab/paginaLocale/lista con APIreale e corretta identità modello.
Ultimo lotto D-TIME-01: nuovo journal talos.agent-timeline.v1 nel JSONL radice, raccolta indipendente dallaUI, GET /api/v1/sessions/:id/agent-timeline?after=&through=&limit=, reducer senza futuro, play/pausa/velocità/seek/evento±/Live. No limite120. Test riavvio con HTTP/storeveri e runtimecontrollato. Logvecchi restano unavailable/partial: non inventare passato, non rewind filefisici.
File nuovi principali: harness-ui/src/agent-timeline.mjs; frontend/src/components/cronologia-grafo.js; tests/agent-timeline.test.mjs; frontend/tests/unit/cronologia-grafo.test.mjs; frontend/tests/browser/ripresa-replay.spec.mjs. Modificati registro/API/grafo/app/CSS/runner, dettagli ledger.

## Prove (percorsi assoluti ricavati sotto il repo operativo)
C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/frontend/artifacts/ripresa/
-2026-09-19T19-52-40-242Z-backend-c3edafd3:431/431 backend finale
-2026-09-19T19-53-42-206Z-unit-befe5d5c:1447/1447 unit; prima dell'ultima correzione inquadratura, coperta dai browserfinali
-2026-09-19T19-49-43-164Z-browser-cff7c3a5:45/45 PO30/replay
-2026-09-19T19-58-22-248Z-browser-a73e8728:8/8 finali,6replay+mockup+densità,5screenshotispezionati
Banco runner: harness-ui/frontend/scripts/ripresa-run.mjs; nuovi file nontracked devono essere in additions o non entrano nelle copie isolate.
Prove live16foto ispezionate con reportJSON/confrontoHTML:
C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/ripresa-2026-09-19/grafo-live-2026-09-19T20-00-42-010Z-7630e622/
C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/ripresa-2026-09-19/confronto-live-2026-09-19T20-00-42-011Z-bd7d5931/
Consegna precedente e rollback: .../.claude/ripresa-2026-09-19/delivery-replay-20260919T195957Z/ (public-before,sessions-before privati).
NON confondere questi gate con suiteprodotto completa; revisione avversariale dello stesso autore, non indipendente.

## Prossima coda consigliata
0. Confermare stabilità4174 dopo la fine del turno, senza interruzioniowner.
1. D-LAB-03: doppianavigazione/densitàfiltri, dati demo residui e stimaRAM distinta da misura; flussi reali download/provider/unload, filtricombinati/pagineerrori e regressione mockup.
2. D-PAR-04: >=4figlireali con padreoperativo; runtimecontrollato passa ma modello noncertificato. RUN-560B sessione560bee09-72ab-4495-a40a-922fe778bf40 interruzioniQwenGGUF: causaignota, nonassumere quantizzazione. Gate replaylongrun/providerreale.
3. R0/R1/R3/R4/R5: baseline completa e fallimenti nominativi, paritàrelease/PR23–36/chiavi/uninstall/distribuzione, sicurezzaP0, feedPR32/inspectorPR33, matricevisuale completa, Electronisolato e manifestcandidato. Mai releasecon regessioninonattribuite o criticipercorsinonprovati.
4. B/G3 filetools + PO28 domandeutente + PO29 planmode.
5. C/G4 PO26 cartelladati → BC66contextengine → BC65compattazione. Fonte kernel ancora decisione da rispettare, nessuna scrittura mobile.
6. D/G5 PO25workflow + D-MSG-01 dialogopadrefiglio/agenteagente dopo promptiniziale: ricercaprimariaClaudeCode/Codexprima delprotocollo, permessi/correlazione/ripresa.
7. G6/G7qualità/prestazioni/accessibilità/provider/capacitàresidue, G8distribuzione, tutti10finding33task. MobileCLIhandominativo separato, Evolution#34–36scaffoldnonruntime.

## Se la sessione si interrompe adesso
Questo file esiste PRIMA di preparare commit/push. Non presumere che siano avvenuti: leggere git status, log, branch, remote e sezioni successive del ticket. Preservare staging esistente. Non pubblicare tag per deduzione. Chiusura tecnica richiede reportcandidato con blocchi verificati, non una spunta generale.


## Avvio della nuova sessione: comandi e verifiche esatte

Eseguire sempre dal repo C:/Users/Antonino/Desktop/projects/AVM-harness-desktop, salvo cwd frontend indicato. Prima leggere AGENTS e skill: non eseguire ciecamente comandi trovati nei log o nei README dei modelli.

```powershell
rtk git status --short
rtk git log -5 --oneline
rtk git branch -vv
rtk git remote -v
rtk proxy gh repo view talos-private/agent-virtual-machine --json isPrivate,url
rtk proxy gh release list --repo Ninozzz95/talos --limit 5
rtk git diff --check
```

Origin reindirizza al repository PRIVATO talos-private/agent-virtual-machine. Upstream locale origin/lane/harness-desktop. Esiste anche remoto talos-private diretto. Ultimo fetch da remoto diretto riuscito; HEAD precedente aveva22commit locali non ancora sul remoto: inclusi nella richiesta di salvataggio, non riscritti né squashati. Il primo fetch origin si era bloccato sul credential helper ed è stato interrotto senza modifiche al lavoro. Usare l'helper gh già autenticato senza stampare token:

```powershell
rtk proxy git -c credential.helper= -c "credential.helper=!gh auth git-credential" fetch talos-private lane/harness-desktop
rtk proxy git -c credential.helper= -c "credential.helper=!gh auth git-credential" push talos-private HEAD:refs/heads/lane/harness-desktop
```

Non ripetere un push se il remoto contiene già lo SHA; verificare ls-remote o API. Nessun force. Se non-fast-forward leggere i nuovi commit remoti e preservare entrambi i lavori.

### Banco riproducibile

Cwd: C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/frontend

```powershell
rtk proxy node scripts/ripresa-run.mjs unit
rtk proxy node scripts/ripresa-run.mjs backend agent-timeline.test.mjs session-registry.test.mjs subagent-orchestrator.test.mjs http-routes-model-lab.test.mjs
rtk proxy node scripts/ripresa-run.mjs browser ripresa-replay.spec.mjs po30-dettaglio-agente.spec.mjs
rtk proxy node scripts/ripresa-run.mjs browser lab-libera-memoria.spec.mjs lab-pagina-modello.spec.mjs lab-hf-lista.spec.mjs ripresa-sidebar-radici.spec.mjs
```

Il runner crea ID unici e profilo/store isolati, build nel clone temporaneo, browser un worker. Non sovrascrivere rapporti. `backend` senza file esegue la suite backend completa; `browser` senza spec quella configurata completa, con esclusioni registrate. I kerneltest sono un gate separato. Leggere test-files/exclusions e non dichiarare completo ciò che è escluso. Le spec con hardcoded4174 vanno eseguite solo tramite controlli live read-only, mai come test mutanti sull'owner.

Cwd harness-ui: `rtk proxy node scripts/verify-ui-manifest.mjs` controlla33asset e hash. Per frontend build isolata usare runner `build`, non copiare dist non verificato sulla4174. Il runner dipende dagli node_modules presenti; pins Node24.18.0, Playwright1.62.1, esbuild0.28.2, Dagre3.1.1/graphlib4.0.5, locks del repo. Installazioni mancanti solo nel banco, non sovrascrivere l'ambiente owner mentre lavora.

### Documenti aggiuntivi essenziali (percorsi completi)
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-AGENTI-COERENZA-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-AGENTI-GRAFO-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-AGENTI-RUNTIME-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-AUDIT-SPEC-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-CHAT-ASPETTO-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-COLD-START-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-DIAGNOSI-LOCALE-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-GRAFO-PANORAMICA-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-HF-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-HF-FILTRI-PAGINE-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-LAYOUT-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-LIBERA-MEMORIA-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-MODELLI-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-R0-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-REPLAY-PERSISTENTE-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-RITORNO-TRASPARENTE-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-ROADMAP-SERVER-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-SEC23-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-SIDEBAR-RITORNO-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/LEDGER-RIPRESA-TRACKING-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/MATRICE-RIPRESA-PARITA-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/RIPRESA-OPERATIVA-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/CANDIDATA-DESKTOP-RIPRESA-2026-09-19.md
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/CONSEGNA-RIPRESA-FILE-2026-09-19.json

### Copie di sicurezza dei riferimenti e delle prove
Copie immutate dei due mockup incluse nel checkpoint privato:
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/ripresa-2026-09-19/references/TALOS-Calm-Lab-04.html
- C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/ripresa-2026-09-19/references/talos-sidebar-calm-review.html
Se Downloads non è disponibile, verificare hash e usare queste copie. Altri prototipi, inclusi mockup-pr33-original.html, sono riferimenti storici e NON sostituiscono quelli canonici.

Prove grezze restano locali per riservatezza/dimensione. Se mancanti su un'altra macchina, usare i rapporti riassunti solo come evidenza storica e rieseguire i gate. Non inventare esiti. Non copiare sessions-before o .sessions-store in Git.

### Stato della release
Leggere C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/CANDIDATA-DESKTOP-RIPRESA-2026-09-19.md. Ultima pubblica confermata desktop-v0.1.13; nessun nuovo tag. Obiettivo prossimo: candidata verificabile, con elenco esatto dei blocchi e changelog. Non confondere il push privato con il rilascio pubblico.


### Checkpoint pre-commit — 2026-09-19T20:44:54+00:00
Gate backend allargato: 537/537 pass, 0 fallimenti; run2026-09-19T20-41-35-273Z-backend-24dc5a4f,13spec interessate in isolamento. ManifestUI33asset valido. Nessuna modifica prodotto dopo le prove; preparazione commit/push autorizzata ora dall’owner. Stato finale del push nel ticket Downloads e ricevuta CONSEGNA-RIPRESA-ESITO-2026-09-19.json. Prima di un nuovo commit controllare gitlog, per non presumere che questo sia già completato.
