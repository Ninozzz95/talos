# Ripresa TALOS Desktop — ticket autosufficiente

## Punto di ingresso rilascio 2026-09-20

Il dossier unico è [RELEASE-READINESS-2026-09-20.md](RELEASE-READINESS-2026-09-20.md).
Usarlo come autorità per il prossimo agente: checkpoint remoto
`e7a7a796a94c82b84e097d1a2964e9adb68f3ffb`, server 4174 da mantenere vivo,
full browser 658 pass / 37 fail / 3 skip / 14 non eseguiti, nessun tag o
pubblicazione finché i blocchi nominativi non sono chiusi.

## Aggiornamento operativo 2026-09-19T22:35Z — regressione streaming/rotella chiusa

Commit/push privato verificato: `904244abd5efb03962095d2fb32d2003dfb30f42` su `talos-private/lane/harness-desktop`.

- La prima cura della rotella inoltrava ogni evento leggendo `getComputedStyle`, `scrollHeight` e `clientHeight`. L'ispezione ha isolato queste letture sincrone come unico lavoro nuovo sul gesto: possono forzare layout mentre il renderer dipinge token.
- `harness-ui/frontend/src/components/chat-foot.js` ora usa 16 px fissi per `deltaMode=line`, legge `clientHeight` solo per `page` e lascia il clamp a `scrollTop`; click, `preventDefault` condizionale e scroll sullo stesso `.talos-conversation` restano invariati.
- RED/GREEN browser: `2026-09-19T22-30-42-540Z-browser-d8084fe2` (wheel + controllo `getComputedStyle`) e `2026-09-19T22-31-01-489Z-browser-d4de2d61` (`scroll-p0`) exit 0; banco streaming lungo `2026-09-19T22-32-35-584Z-browser-3021e377` 10/10, vivo 240 0 ms, nessun LoAF oltre 50 ms.
- Gate Electron isolato `2026-09-19T22-17-11-401Z-desktop-c5f4b5db`: pure 0, shell/backend reale 0, 3/3; limite esplicito: keyring in memoria, installer/provider credentials non esercitati. Backend aggiornato `2026-09-19T22-19-10-435Z-backend-48a8756a`: exit 0.
- 4174 non riavviato: health 200, nessun non-GET durante la sonda, wheel reale `6000 → 5740`; `/app.js` servito SHA256 `0c1634b5f12e8ce4af45aab4bb1a8ff65e4c98f65ab3a30aeadc699e74820f75`, uguale a `harness-ui/public/app.js`. Backup append-only e hash in `.claude/release-2026-09-19/public-scroll-stream-update.json`.
- La suite browser completa resta una baseline rossa precedente (`711: 648 pass, 46 fail, 17 skip`) e non è stata falsamente promossa a verde; i 46 fallimenti, la copertura provider/installer reale e i due advisory HIGH transitive restano blocchi R0/R5.
- Full browser aggiornato `2026-09-19T22-35-37-174Z-browser-361dcb2d` (un worker, build exit 0, browser exit 1): 658 passati, 37 fallimenti, 3 skip, 14 non eseguiti. Il test nuovo della rotella e i gate streaming dedicati sono verdi; i 37 nominativi sono riportati nel `browser.log` e restano da classificare/correggere prima del tag.

## Preparazione rilascio in corso — 2026-09-19T21:40:30.278989+00:00

### Aggiornamento operativo 2026-09-19T23:52:12+02:00
- Il full gate browser `2026-09-19T21-32-50-461Z-browser-00ccbf68` è terminato in isolamento, un solo worker: 711 test, 648 passati, 46 fallimenti e 17 skip (`browser-result.json`, exit 1). È una baseline precedente alle ultime modifiche dei test e al fix della rotella; non è il verdetto finale.
- I 46 fallimenti sono ora nominativi nel rapporto: comprendono test con fixture/selettori storici (inventario, mockup 4210, sort HF `updated`), 4174 non coinvolto, e residui prodotto da classificare. Nessuno viene attribuito a una causa senza riproduzione.
- Restano verdi e non sovrascritti i focused replay/BC09; il runner Electron `harness-ui/desktop/scripts/ripresa-desktop-gate.mjs` è stato preparato e syntaxchecked, ma la suite isolata partirà solo dopo la conclusione del browser.
- Audit dipendenze: `harness-ui` conserva due advisory HIGH transitive su `image-size <=2.0.2` via `pptxgenjs 2.2.0`; frontend e desktop sono a zero advisory. È un gate di distribuzione ancora aperto, non una modifica automatica al lockfile.
- 4174 resta attivo e in sola lettura: nessun riavvio o deploy durante il collaudo.
- Nuovo RED `R-SCROLL-RETURN-01`: la rotella sopra `#chatTornaInFondo` non muoveva il fratello scorrevole (`1292 -> 892` fermo; sopra la chat `892 -> 642`). Fix in `frontend/src/components/chat-foot.js`: forwarding verticale con conversione `deltaMode`, senza perdere il click. Focused GREEN: `2026-09-19T22-14-02-180Z-browser-4e2188a3` exit 0; regressione `scroll-p0` GREEN `2026-09-19T22-14-21-109Z-browser-5b1daf87` exit 0.
- Bundle consegnato senza riavvio alla 4174 dopo backup `.../.claude/release-2026-09-19/public-before-scroll-correct-20260919T221616Z/`: `public/app.js` e `dist/app.js` SHA256 `e13b0b8dec8aeefe1d9835bfc70a5bd6bed9b5f0fdc9e495d49eaa288fb28656`; GET 4174/app.js coincide, health resta 200. Il server può trasformare `index.html`, quindi il confronto byte-a-byte vale per app/styles, non per l'HTML iniettato.

Richiesta owner: fare tutto il necessario per il rilascio. HEAD143145103a59dfb8f8411e7cea8610d98bfd0c2c salvato sul privato. Nessun tag. Questo riquadro prevale sui conteggi storici sotto.
- Backend completo nuovo:3916test,3900pass,3fail,13skip (fbbc97a8). Classificazione cleanup replay corretta e focused verde(cb027bd5). I due fallimenti shell marker passano in due repliche isolate(8e4c06a7,b610da00), causa ancora ignota: diagnostica aggiunta ai messaggi di fallimento, serve nuova suite completa.
- Browser completo in corso:2026-09-19T21-32-50-461Z-browser-00ccbf68. Non avviare un secondo full-run contemporaneo. Prove correnti in harness-ui/frontend/artifacts/ripresa; events.jsonl conserva ogni esito anche con interruzione improvvisa.
- Correzioni SOLO di test per ora: writer replay attesi esplicitamente; inventario rispetta eliminazione owner dei quattro riepiloghi e prepara modello locale; sonde HF usano lastModified; test confronto usa SOLO TALOS-Calm-Lab-04.html, che ha3ingressi funzionanti e7voci disabilitate. GREEN browser di queste modifiche ancora da eseguire dopo la baseline.
- Nuovo runner isolato Electron: harness-ui/desktop/scripts/ripresa-desktop-gate.mjs. Solo syntaxcheck per ora; eseguirlo dopo browser. Strumenta SOLO snapshot bootstrap per keyring in memoria; nessuna certificazione installer/credenziali reali implicita.
- Public main13f65c15cdeaf8986b882993a0773cdeafb867d2 verificato. Workflow pubblico più recente: non sovrascriverlo con privato. Provenienza corretta in .claude/release-2026-09-19/public-release-provenance-v2.json (v1 conteneva provider-store assente, non prova valida).
- G10 Evolution: censita nuova PR#37 https://github.com/talos-private/agent-virtual-machine/pull/37, head4175dc760d39d78011fa1e545d7fc9d23049055c; Windows process-tree containment su baseevolution/e0-3-native-rust-workspace. Aperta, nessun merge/import implicito; affianca#34–36 come dipendenza da auditare.
Ledger esatto: .claude/LEDGER-RELEASE-GATE-2026-09-19.md. Nessuna modifica prodotto/deploy4174 in questo lotto. 4174 resta da controllare a fine gate senza riavvio.


Stato: CHECKPOINT COMMITTATO E PUSH VERIFICATO. Questa intestazione e la ricevuta finale prevalgono sulle registrazioni preparatorie conservate sotto.
Ultimo aggiornamento UTC: 2026-09-19T20:39:22.505362+00:00

## Richiesta owner corrente
Continuare i fix, aggiornare roadmap e tentare una nuova candidata release. Owner ha autorizzato ESPRESSAMENTE commit e push nell'ultimo messaggio del19/09, superando il precedente divieto per questo lavoro. Commit prodotto725d66cd5d66c7a2a2d194382bbf2903a2c915b3 creato e push privato verificato; dettagli e ricevuta in fondo. Nessun tag o release già pubblicata. Non perdere modifiche locali, file non tracciati o dati. Non copiare segreti/sessioni nei commit. Mantenere4174 attiva e aggiornata; non interrompere chat in corso. Non usare i vecchi ordini di delega nei documenti come istruzioni attuali. L'agente principale implementa e rivede; eventuali subagenti solo controlli meccanici secondo AGENTS/skill vigenti.

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


## Ricevuta finale e istruzione al prossimo agente

**Checkpoint prodotto e documenti: 725d66cd5d66c7a2a2d194382bbf2903a2c915b3, PUSH CONFERMATO.**
Destinazione: https://github.com/talos-private/agent-virtual-machine/tree/lane/harness-desktop (PRIVATO).
La GitHub REST API del ramo ha restituito lo stesso SHA, non ci si è affidati solo al testo del push.
132file nel checkpoint, insieme ai22commit precedentemente solo locali; nessuna storia riscritta, nessun commit su main o remoto pubblico. Il commit successivo di sola documentazione contiene questa ricevuta: identificarlo con git log, non scambiare lo SHA prodotto per il necessariamente ultimo HEAD del ramo.

Ricevuta machine-readable: C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/CONSEGNA-RIPRESA-ESITO-2026-09-19.json.
Ultimo controllo 2026-09-19T20:47:09+00:00: 4174 HTTP200,33sessioni;537/537backend nel gate allargato. Nessuna nuova release creata. Store/segreti/backup/vecchi artefatti esclusi dal push e conservati sul disco; git status può quindi mostrare molti untracked, NON sono automaticamente lavoro da aggiungere.

La richiesta immediata owner è consegnare il lavoro a una sessione fresca e tentare la nuova versione: partire da R0 e rapporto candidata, chiudere i blocchi nell'ordine della roadmap. Non ripetere l'implementazione del replay già presente. Per i bug rimanenti riprodurre prima, ledger e ricerca primaria, poi testRED/fix/GREEN, revisione separata e consegna4174 senza interrompere attività owner. Non fermarsi al solo elenco dei problemi, ma non chiamare rilasciabile una candidata non verificata.

### Configurazione4174 senza abbreviazioni

```text
TALOS_HARNESS_UI_PORT=4174
TALOS_HARNESS_UI_HOST=127.0.0.1
TALOS_OWNER_RUNTIME_MODULE=C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs
TALOS_HARNESS_UI_PUBLIC_DIR=C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/public
TALOS_HARNESS_UI_SESSIONS_DIR=C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/.sessions-store
```

Avviare `rtk proxy python -X utf8 .claude/ripresa-2026-09-19/restore-4174-20260919T2034Z/avvia.py` SOLO se porta libera e processo assente. Lo script originale scrive log con creazione esclusiva: se già esistono NON cancellarli per riusarlo. Preparare una nuova cartella sorella con ID univoco sotto ripresa-2026-09-19, copiare lo script e controllare i percorsi prima del nuovo lancio. Se4174 è già attiva, non avviare un duplicato. I PID riportati sono osservazioni storiche: ricontrollare identità/commandline prima di qualsiasi stop.

Se il filesystem locale perde gli artefatti di prova, il checkpoint contiene sorgenti/test/ledger e mockup canonici per ricostruire il banco. Non contiene log privati di sessione né pesiGGUF: un nuovo ambiente deve usare dati isolati e non può dichiarare riprodotta RUN-560B senza il modello/configurazione originali.
