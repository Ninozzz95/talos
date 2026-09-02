# VERDETTO sulla zip di ChatGPT «TALOS-desktop-evaluation-2026-09-02» e le domande prima del ledger

> 02/09/2026, notte. Zip caricata dall'owner (4,9 MB, 555 file), estratta e
> verificata nello scratchpad di sessione. Ogni numero qui sotto è misurato
> sul contenuto, non letto dal suo README. Confronto contro
> `MAPPA-HARNESS-DESKTOP-2026-09-02.md` e contro il codice al commit `0752b376`.

## 0 — Il verdetto in tre righe

1. **Come registro e ordine di lavoro vale**: 144 funzioni con id stabile, stato rispetto alla baseline, destinazione, wave, fonti; 38 righe di roadmap in cinque wave coerenti con le 57 decisioni; ledger delle decisioni completo; onestà dichiarata sui limiti (nessun clone locale dei concorrenti, screenshot marcati `FIXTURE`).
2. **Come proposta implementativa non vale**: le 38 «patch» sono 494 righe in tutto, tredici per patch, tutte file nuovi, nessuna tocca un file esistente del prodotto. Sono segnaposto con un test da un'asserzione, non codice che fa qualcosa. I giorni dichiarati (97,5 in totale) sono il costo di quei segnaposto, non del lavoro vero.
3. **Il verificatore passa per costruzione**: controlla che i campi esistano, non che dicano il vero. Sette voci sono `CONTRACT_VALIDATED` senza contratto, riga o file; quattordici `LABS_EXECUTABLE` senza un file; 93 voci su 144 hanno come «problema TALOS» una frase generica. Il ledger codice per codice lo scriviamo noi sui file veri: la zip è lo scheletro, non la carne.

## 1 — Cosa c'è dentro, misurato

| Pezzo | Dichiarato | Misurato |
|---|---|---|
| Registro funzioni | 144 voci, 15 campi + estensioni | ✅ vero. 50 `PRESENT`, 35 `PARTIAL`, 59 `MISSING`. Destinazioni: 80 adapter, 46 labs, 10 UI modulare, 7 monolite, 1 kernel |
| Roadmap | 38 righe, 5 wave + monorepo | ✅ vero; tabella spuntabile presente |
| Patch | «38 diff indipendenti applicabili» | ✅ applicano tutte (`git apply --check` su `harness-ui/`, 38/38) — ma **494 righe totali**, 0 file esistenti modificati, ogni `.mjs` 6-17 righe |
| Contatori di copertura | sette a zero, `RESULT=PASS` | ✅ riprodotto eseguendo `coverage/verify.mjs`; ⛔ verifica presenza dei campi, non sostanza |
| Audit concorrenti | «lettera per lettera» (richiesta iniziale) | ⛔ quattro file da 1,8-3,2 KB; 53 fonti, tutte `metadata_snapshot` (nessun clone, ammesso nel manifest); 8 issue di comunità |
| Screenshot | «dimostrativi» | 7 PNG `FIXTURE`. Uno è la shell TALOS vera (tema scuro, vuota). Gli altri sei sono un mockup chiaro (crema, Inter) **che non è lo stile Calm di TALOS** |
| Mockup interattivi | «realmente cliccabili» | `empirical-reference-version/index.html`: 20 righe, 1 script, 1 listener. `preview/index.html`: 3 righe, 0 script |
| Versione empirica | «fork TALOS eseguibile con moduli isolati» (D29) | ⛔ non c'è un fork: c'è la pagina HTML sopra |
| Conversazione | «completa» | turni utente verbatim (67); turni assistente **ricostruiti** dal ledger decisioni, dichiarato |
| Provenance/SBOM | | presenti, corti; nessun codice concorrente riusato (vero, non c'è codice) |

Stati gonfiati, elenco esatto: `F-0109` visual regression diff, `F-0119` MCP tool filtering, `F-0124` skill progressive disclosure, `F-0125` hook fail-closed, `F-0131` provider credit reconciliation, `F-0141` deterministic release gates, `F-0144` Electron GPU flags: tutti `CONTRACT_VALIDATED` senza riga né file. Nel nostro ledger diventano `DESIGN_VALIDATED` o si agganciano a una riga vera.

## 2 — Cosa tengo e cosa butto

**Tengo**: gli id `F-0001…F-0146` (stabili, li cito nel ledger), la classificazione `PRESENT/PARTIAL/MISSING` (corretta: coincide con la mappa §2), le destinazioni, l'ordine delle wave, il ledger delle 57 decisioni con le precisazioni, le 53 fonti con data.

**Butto**: le 38 patch come codice (restano come nomi suggeriti dei moduli), le stime in giorni, i mockup come riferimento di design, il campo `talos_problem` (da riscrivere per ogni riga contro il codice vero), la promessa «versione empirica».

## 3 — La roadmap della zip contro la codebase, riga per riga

Per ogni riga: cosa propone la zip, quali **file esistenti** vanno toccati davvero (la zip non ne nomina nessuno), la mia stima in giorni per un agente che lavora su questo worktree, e dove la metto.

### Wave 0 — sicurezza della baseline

| Riga | Zip | Realtà sul disco | File veri | Giorni | Decisione |
|---|---|---|---|---:|---|
| R-0001 restore accounting 16/23 | modulo nuovo di conteggio | il difetto sta in `ripristina()` e nel salto silenzioso dei file senza `intestazione` | `src/session-registry.mjs` (ripristina), `src/session-store.mjs`, `tests/session-registry.test.mjs`, Doctor (riga «sessioni scartate: N, perché») | 1,5 | ✅ W0 |
| R-0002 evidence gate | contratto desktop + kernel PENDING | senza il Plan Ledger (R-0020) non ha a cosa agganciarsi | — | — | ➡ fondere in R-0020, W2 |
| R-0003 probe GPU+rAF di rilascio | script nuovo | esistono `frontend/scripts/diagnose-interaction-lag.mjs` e la pipeline QA con report GPU/no-GPU | estendere `qa-visual-pipeline.mjs` (scenario `qa-release-probe`) + `frontend/scripts/verify.mjs` | 1 | ✅ W0 |
| R-0004 scheletro `labs/` | README + flag | — | `harness-ui/labs/`, `config.mjs` (lettura flag) | 0,5 | ✅ W0 |
| **nuova** versione di schema nel JSONL (D32) | assente nella zip | le righe `intestazione` non portano versione | `session-store.mjs`, `session-registry.mjs`, migrazione + test | 1 | ✅ W0 |
| **nuova** «Annulla» del Model Lab chiama `/cancel` inesistente | assente | trovato mappando (`app.js:2177`) | `public/app.js` (usare `/stop`) o rotta alias | 0,25 | ✅ W0 |
| **nuova** disciplina fixture + suite in un comando | assente | oggi tre comandi (`node --test`, `frontend verify`, `vitest` mobile) | `package.json` script `verify:all` | 0,5 | ✅ W0 |

### Wave 1 — quick win ad alto impatto

| Riga | Zip | Realtà sul disco | File veri | Giorni | Decisione |
|---|---|---|---|---:|---|
| R-0010 `terminalId` ≠ `sessionId` + schede | helper da 6 righe | il registro è `Map` per id (`pty-terminal.mjs:100`), la WS prende l'id dall'URL, la UI ha un solo `idTerminaleCorrente()` | `src/pty-terminal.mjs`, `src/terminal-ws.mjs`, `src/http-app.mjs` (crea/elenca/chiudi terminale), `public/app.js` (5790-5980: schede, `idTerminaleCorrente`), `styles.css`, test | 3,5 | ✅ W1 |
| R-0011 Process Ledger | proiezione | i dati esistono (`ToolCallStart/Result`, descrizione, ricevute) | `src/session-registry.mjs` (proiezione + riga JSONL `processo`), rotta `GET /sessions/:id/processes`, inspector tab Agents in `app.js` | 2,5 | ✅ W1 |
| R-0012 Web Notification | policy pura | il browser lo fa già: serve `Notification` + `visibilityState` + toggle in Settings | `public/app.js` (RunFinished/ToolCallResult lunghi), sezione Settings «Chat» | 1 | ✅ W1 |
| R-0013 ricerca full-text sessioni | indice derivato | `#sessionSearch` filtra titoli lato client; i JSONL sono già in memoria in `session-registry` | `src/session-search-index.mjs` (nuovo), `http-app.mjs` rotta `GET /sessions/search?q=`, `app.js` 10798 | 3 | ✅ W1, dipende da R-0001 |
| R-0014 Git service | 9 righe | Git nel backend è solo Doctor + ramo; serve `spawn git` sotto `process-policy` | `src/git-service.mjs` (nuovo, vero), `process-policy.mjs`, rotte `GET /sessions/:id/git/status`, `POST …/git/stage|unstage|commit|branch`, `app.js` tab Review, `styles.css` | 6 (status/stage/commit/branch) + 3 (worktree, PR via `gh`) | ✅ W1 la prima parte, W2 la seconda |
| R-0015 sorgenti Review separate | contratto | dipende da R-0014 | `app.js` (6339-6460 review reale), badge sorgente | 1,5 | ✅ W1 dopo R-0014 |
| R-0016 file viewer scrivibile | hash precondition | `workspace-files.mjs` ha crea/rinomina/sposta ma non «scrivi contenuto»; il viewer è `openSheet('fileViewer')` | `src/workspace-files.mjs` (scrivi con hash atteso + ricevuta), `http-app.mjs`, `app.js` (sheet editabile, conflitto), `workspace-watcher` (segnalare modifica esterna) | 3,5 | ✅ W1 |
| R-0017 cruscotto costi | ledger | `eventoPerUsage` + pricing catalogo già per giro; manca aggregazione | `src/session-registry.mjs` (aggregato per sessione), rotta, pannello in Settings «Account» o inspector Context, etichetta «stima» | 2 | ✅ W1 |
| R-0018 tastiera/focus | un `.md` | è QA visiva vera: focus visibile, Escape, palette, tab order | `app.js`, `styles.css`, scenario in `qa-visual-pipeline.mjs` | 2,5 | ✅ W1 |
| R-0019 Electron spike | `main.mjs` 17 righe | serve Node impacchettato a parte, token loopback (oggi non c'è: `http-app` non autentica), `TALOS_OWNER_RUNTIME_MODULE` passato al figlio | `labs/electron-shell/` vero, `src/config.mjs` + `http-app.mjs` (token opzionale), `server.mjs` | 3 | ✅ W1 |
| **nuova** `NAV-CAPABILITY-FIRSTCLASS-01` | assente nella zip (è nel PIANO) | Libreria/Memoria/Note/Attività/Ricerca nascoste nel Capability Hub | `index.html` (5 righe sidebar), `app.js` (setView + pannelli 2735-2990 già esistenti) | 3 | ✅ W1 |
| **nuova** aperti minori §10 mappa | assenti | sottotitolo header, riga attiva sidebar, meta nota impostazioni | `app.js` | 1 | ✅ W1 |

### Wave 2 — fette verticali strutturali

| Riga | Zip | Realtà | File veri | Giorni | Decisione |
|---|---|---|---|---:|---|
| R-0020 Session Plan Ledger (+R-0002) | contratto, kernel PENDING | il planner Fase K produce il piano nel kernel; il desktop lo vede solo come testo | adapter: `agui-events.mjs` (evento `PlanUpdated`), `session-registry.mjs` (riga `piano`), rotta, `app.js` inspector Context; **kernel**: emettere il piano strutturato + gate di completamento (ledger separato, tuo sì) | 4 adapter + kernel a parte | ✅ W2 |
| R-0021 storia esecuzioni automazioni | store | `automation-store.mjs` ha solo `ultimaEsecuzione` | `automation-store.mjs`, `automation-scheduler.mjs`, rotta, widget in `app.js` 8843-8916 | 2 | ✅ W2 |
| R-0022 Execution Fabric tranche 1 | contratto + registro | oggi: `spawn` nativo, WSL2, adb dentro il **kernel** (`eseguiComandoSandboxato`) ⇒ la scelta del backend è del kernel, il desktop può solo passare un `backend` | contratto + registro desktop; adapter Docker/Podman/SSH veri (probe, capability, esecuzione); **kernel**: accettare un esecutore iniettato | 12 (+kernel) | ✅ W2, in tre righe (contratto+probe; Docker/Podman; SSH) |
| R-0023 Secret Broker | facciata | `provider-credential-store.mjs` è già il backend; manca handle/lease/scope | `provider-credential-store.mjs`, `runtime-owner-adapter.mjs` (usa handle), `agent-service.mjs` | 4 | ✅ W2 |
| R-0024 Sandbox policy | contratto, kernel PENDING | i livelli 1-3 richiedono l'esecutore iniettato (R-0022) | `process-policy.mjs`, `path-policy.mjs`, contratto; kernel a parte | 5 (+kernel) | ✅ W2 dopo R-0022 |
| R-0025 Context Fabric receipt | contratto, kernel PENDING | compattazione nel kernel (`compattaConversazione`) | adapter: evento `ContextCompacted` + drawer; kernel: ricevuta | 3 (+kernel) | ✅ W2 |
| R-0026 Tool capability contract | contratto, kernel PENDING | `SICUREZZA_PER_ATTREZZO` è nel kernel | adapter: esporre il contratto per attrezzo in Settings «Strumenti» | 3 (+kernel) | ✅ W2 |
| R-0027 Browser Lab evidence | contratto | vista Browser reale, `browser-worker/` nel repo | `agent-service.mjs` (screenshot/console nel risultato di `naviga`), `app.js` 5982-6036 | 3 | ✅ W2 |
| R-0028 gerarchia policy | contratto, kernel PENDING | oggi impostazioni in localStorage + env | `config.mjs` (file policy owner), `http-app.mjs` (spiega blocco), `app.js` Settings | 4 | ✅ W2 |
| R-0029 setup guidato da Doctor | readiness | Doctor ha 4 controlli | `doctor.mjs` (+ controlli runtime/backend), `app.js` (badge, «apri il fix») | 2,5 | ✅ W2 |
| R-0030…R-0034 Electron 57.2-57.6 | 5 righe di JSON | lavoro vero: lifecycle, tray, `talos://`, NSIS, updater, hardening | `labs/electron-shell/*`, `scripts/windows/*`, installer | 14 | ✅ W2 |

### Wave 3 e 4

R-0035 (6.3B) 3,5 giorni in `frontend/src`; R-0036 e R-0037 sono dentro le Fasi 4-10 del piano frontend (settimane, non giorni: vedi Q6). R-0040…R-0044 sono manifesti `labs/` da 1 giorno l'uno; gli adapter veri non si stimano finché non c'è la tranche 1. R-0099 monorepo: ultima.

**Totale realistico W0-W2 (Electron incluso, kernel escluso): ~105 giorni** contro i 97,5 dichiarati dalla zip per tutto, wave 3-4 comprese.

## 4 — Le domande decisionali che restano (rispondi con sì/no o la lettera)

1. **Registro.** Gli id `F-xxxx` della zip diventano gli id del nostro ledger, con gli stati ricalcolati da noi (i sette gonfiati scendono a `DESIGN_VALIDATED`)? — *Raccomando sì.*
2. **Patch.** Le 38 patch non si applicano; l'agente desktop scrive il codice riga per riga sui file veri (§3), usando i nomi dei moduli della zip solo come suggerimento. — *Raccomando sì. Applicarle aggiungerebbe 76 file morti.*
3. **Ordine e stime.** Adotto il riordino e le stime del §3 al posto di quelli della zip? — *Raccomando sì.*
4. **Kernel.** Per ogni riga con parte `KERNEL`, la parte adapter procede subito e la parte kernel va in un ledger separato (`LEDGER-KERNEL-RICHIESTE-DESKTOP`) che decidi tu riga per riga per la lane mobile? — *Raccomando sì.*
5. **Aggiunte.** Entrano in roadmap le voci che la zip non ha: `NAV-CAPABILITY-FIRSTCLASS-01`, `RESEARCH-MOBILE-PARITY-01` (W2), gli aperti minori della mappa, il bug «Annulla» del Model Lab, la versione di schema del JSONL, il comando unico di verifica? — *Raccomando sì.*
6. **Un solo piano.** La nuova roadmap assorbe le Fasi 4-10 del `PIANO-COMPLETO-DESKTOP` come Wave 3 e diventa l'unico documento autoritativo, con il PIANO marcato «superato da»? Oppure restano due tabelle? — *Raccomando un solo piano: due tabelle divergono in una settimana.*
7. **Design.** I mockup della zip (chiari, Inter) si ignorano; ogni superficie nuova si progetta sui token di `styles.css`, tema scuro e chiaro, con la skill `frontend-design` e screenshot approvati da te. — *Raccomando sì.*
8. **Formato della consegna.** `LEDGER-ROADMAP-DESKTOP-2026-09-03.md` con la tabella spuntabile (una riga = una riga di roadmap, con i 15 campi) e un file guida per wave (`GUIDA-WAVE-0.md`, `…-1`, `…-2`) con i passi esatti: file, punto d'innesto con riga, ordine delle modifiche, test da scrivere prima, comando di verifica, scenario QA, commit. L'agente spunta la tabella e annota esito e commit. — *Raccomando sì.*
9. **Chi esegue.** «Agente desktop» = una sessione Claude Code o Codex su questo worktree, una riga alla volta, con la regola «una fase alla volta: finisci, verifica, poi vai». Le righe `UI-MONOLITE` rigenerano la fixture `legacy-contract.snapshot.json`. — *Raccomando sì.*
10. **Le due vecchie.** Q9 `labs/` nel repo (la zip lo ha già fatto) e Q10 versione empirica solo come idee: confermate? — *Raccomando sì a entrambe.*

## 5 — Cosa dire a ChatGPT (facoltativo)

La zip è utile così com'è per registro, ordine e fonti; non serve chiedergli una seconda versione delle patch: il codice lo scriviamo sui file veri. Se vuoi una cosa sola da lui: **il campo `talos_problem` riscritto per le 35 voci `PARTIAL` e per le 38 righe**, con il riferimento al file e alla funzione della mappa che ha guardato. Il resto lo facciamo qui.

## 6 — Prossimo passo

Con le risposte alle dieci domande scrivo il ledger e le guide per wave (§4 Q8). Wave 0 e Wave 1 avranno i passi completi; Wave 2 i passi per le righe senza kernel e il contratto per quelle con kernel; Wave 3-4 le righe con criterio di completamento e dipendenze, senza passi fino a che le wave precedenti non sono chiuse.
