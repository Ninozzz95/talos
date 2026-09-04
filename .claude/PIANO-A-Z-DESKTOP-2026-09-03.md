# PIANO A-Z — harness desktop TALOS, in un solo ordine (03/09/2026)

> L'indice unico. Chi implementa parte dalla riga 1 e va avanti; ogni riga rimanda alla guida
> con i passi e al ledger con i 15 campi. Ordine owner: **dalle più critiche ed essenziali alle
> più lunghe, complesse e opzionali**. Le PROPOSTE del dossier competitor (P-nn) stanno nel punto
> in cui le loro dipendenze sono chiuse, non in coda. Nessuna riga si implementa senza il sì
> dell'owner su **quella** riga; il numero d'ordine dice solo cosa viene prima.
>
> Documenti: `LEDGER-ROADMAP-DESKTOP-2026-09-03.md` (autoritativo, 15 campi per riga) ·
> `GUIDA-FASCIA-R`, `GUIDA-WAVE-0/1/2/3/4-E-FINAL` e `GUIDA-PROPOSTE` (passi) · `LEDGER-KERNEL-RICHIESTE-DESKTOP`
> (K-01…K-11, lane mobile, decide l'owner) · `DOSSIER-COMPETITOR-FUNZIONI-DISTINTIVE` +
> `DOSSIER-COMPETITOR-ESTRATTI-CODICE` (il perché delle P-nn) · `REVIEW-STATE-OF-THE-ART-301,56-09-03`.
> Regole d'esecuzione: §1 e §1-bis del ledger. ⛔ Owner 04/09: FERMATA prima di OGNI riga con il consiglio
> modello+effort; la riga la implementa UN agente alla volta orchestrato dalla sessione (Opus 5 high),
> Fable solo sulle righe marcate Fable e avvisando prima.

## Come si legge una riga

`#` ordine · `ID` · titolo · giorni-agente · guida · dipendenze · parte kernel. Fascia **R** apertura (release Windows minima, approvata 03/09) davanti a tutto, poi tre fasce:
**A** essenziali (baseline, onestà, sicurezza del lavoro, capacità di base) · **B** strutturali
(controllo, estensibilità, esecuzione, memoria) · **C** lunghe o opzionali (UI modulare completa,
labs, monorepo).

## Fascia R — apertura: release Windows minima (approvata dall'owner il 03/09/2026)

> Owner 03/09: «prima bisogna fare in modo che la versione desktop parta correttamente, abbia un
> intro stile mobile, e da lì possiamo andare». Le cinque righe Electron vengono anticipate da A/B;
> R-01 e R-02 sono nuove. Mac e Linux NON stanno qui: fascia M, dopo Wave 1.

| # | ID | Titolo | gg | Guida | Dip | Kernel |
|---:|---|---|---:|---|---|---|
| 1 | R-01 | Lanciatore doppio-clic: porta libera, browser aperto, Doctor se manca qualcosa | 1,5 | R | — | — |
| 2 | **Q-01** | Consolidare CSS frammentato dello stesso selettore | 0,5 | QUICK-WIN | R-01 | — |
| 3 | **Q-02** | Censimento a mano funzioni senza chiamanti, rimozione solo confermate | 1 | QUICK-WIN | R-01 | — |
| 4 | R-02 | Intro al primo avvio stile mobile: chiave+provider nel keyring, cartella, autonomia in un colpo, modello | 3 | R | R-01 | — |
| 4b | **R-03** | Ricerca web dalle Impostazioni (parità mobile) + DuckDuckGo senza chiave — ordine owner 04/09, fatta | 2 | R (ledger §3) | R-02 | — |
| 4c | **R-05** | DuckDuckGo senza chiave sul mobile (ownership mobile SOLO per questa) — ordine owner 04/09, IN CODA: consigliata subito dopo W0-03, Sonnet 5 high | 0,5 | R (ledger §3, R-04/R-05) | R-03 | — |
| 4d | **R-04** | Sfondi animati per tema sul desktop (14 scene, «Sfondo scena») — ordine owner 04/09, IN CODA: consigliata con le righe UI di Wave 1 (W1-04/05/07), Opus 5 xhigh, misurata con W0-03 | 2,5 | R (ledger §3, R-04/R-05) | R-02, W0-03 | — |
| 5 | W0-04 | Scheletro `labs/` + flag da config | 0,5 | R (era W0) | — | — |
| 6 | W1-10 | Electron spike: Node figlio + token loopback | 3 | R (era W1) | W0-04 | — |
| 7 | W2-13 | Electron 57.2 lifecycle | 3 | R (era W2) | W1-10 | — |
| 8 | W2-15 | Electron 57.4 NSIS per-user + `IExplorerCommand` | 3 | R (era W2) | W2-13 | — |
| 9 | W2-16 | Electron 57.5 updater | 3 | R (era W2) | W2-15 | — |
| 10 | W2-17 | Electron 57.6 hardening + GPU gate | 2 | R (era W2) | W2-13 | — |

Somma fascia R (approvata): **19 gg** (R-01 1,5 · R-02 3 · W0-04 0,5 · Electron anticipato 14) — R-01 **fatta** (`3b0b4031`), R-02 **fatta** (`904792dd`), R-03 **fatta** (`4c62ac51`), W0-04 **fatta** (`4e0d7189`), W1-10 **fatta** (`b9c74736`), W2-13 **fatta** (`90f02773`). ⛔ W2-15 **bloccata** (certificato Authenticode + VM pulita: decisione/costo owner), W2-16 e W2-17 in coda dietro a lei — si prosegue dalla Fascia A (W0-06). Più **Q-01/Q-02, 1,5 gg** — approvate dall'owner il 03/09 sera («totalmente approvati») ed **entrambe fatte**: Q-01 consolidamento CSS (`219d110f`), Q-02 censimento funzioni morte chiuso a zero rimozioni, esito valido (nessun commit di codice). Dettagli: `GUIDA-QUICK-WIN-MONOLITE-2026-09-03.md`. ⛔ Costo esterno dell'owner: certificato Authenticode per la firma (senza, SmartScreen blocca l'installer).

## Fascia A — essenziali

| # | ID | Titolo | gg | Guida | Dip | Kernel |
|---:|---|---|---:|---|---|---|
| 11 | W0-06 | `verify:all` (backend + frontend + fixture) | 0,5 | W0 | — | — |
| 12 | W0-01 | Restore accounting: scarti classificati, Doctor li mostra | 1,5 | W0 | — | K-08 da verificare |
| 13 | W0-02 | Versione di schema nell'intestazione JSONL | 1 | W0 | — | — |
| 14 | W0-05 | Model Lab: «Annulla» chiama `/stop` — **NON APPLICABILE** 04/09: `/cancel` esiste e ferma la sessione (ledger §6), solo test che pinna il fatto | 0,25 | W0 | — | — |
| 15 | W0-03 | Sonda di rilascio: GPU + rAF da fermo nella QA | 1 | W0 | — | — |
| 15a | **W0-07** | La persistenza si corrompe da sola: append concorrenti intrecciati oltre 1,5 MiB (trovata 04/09 riparando lo store, una sessione era gia persa) | 1 | W0 | — | — |
| 16 | W1-12 | Aperti minori + nomi unici + resume con età e stima | 1,5 | W1 | — | — |
| 17 | W1-13 | File di controllo protetti anche in Full access | 1 | W1 | — | — |
| 17a | **O-03** | Albero file: radice dice `libero:default` invece della cartella — owner 04/09 | 0,25 | ledger §3 O-01…O-07 | — | — |
| 17b | **O-02** | «giri esauriti 24/24» frequente (locale, da provare API): diagnosi misurata + cura desktop + K-12 — owner 04/09 | 2 | ledger §3 O | — | K-12 |
| 17c | **O-01** | Foglio «Aggiungi contesto» (pulsante +): ogni riga funzionante al 100%, zero mock — owner 04/09 | 1,5 | ledger §3 O | — | — |
| 18 | W1-03 | Notifica del browser a fine giro / approvazione | 1 | W1 | — | — |
| 19 | W1-01 | Schede terminale (`terminalId` ≠ `sessionId`) | 3,5 | W1 | W0-06 | — |
| 20 | W1-02 | Process Ledger + stall guard | 2,5 | W1 | — | — |
| 20a | **O-04** | Follow-up mentre la chat lavora + interruzione perfetti — owner 04/09 | 2 | ledger §3 O | W1-02 | — |
| 21 | **P-03** | Evidence ledger + guardia «codice senza prova» | 2,5 | PROPOSTE | W1-02 | K-07 |
| 21a | **O-06** | Censimento attrezzi fondamentali e oltre, scheda per modello — owner 04/09 | 2 | ledger §3 O | — | — |
| 21b | **O-05** | Immagini al modello dal desktop (parità mobile e meglio) — owner 04/09 | 2,5 | ledger §3 O | O-06 | forse |
| 22 | W1-08 | Costi stimati per sessione/giorno/modello | 2 | W1 | — | — |
| 23 | W1-11 | Cinque viste di prima classe | 3 | W1 | — | — |
| 24 | W1-07 | File viewer scrivibile, atomico, `FILE_STALE` | 3,5 | W1 | — | — |
| 25 | W1-05 | Git service sotto `process-policy` | 6 | W1 | — | — |
| 26 | **P-11** | Checkpoint del workspace per giro, anche dopo `shell` | 4 | PROPOSTE | W1-02, W1-05 | — |
| 27 | W1-06 | Review a due sorgenti | 1,5 | W1 | W1-05 | — |
| 28 | W1-04 | Ricerca full-text nelle sessioni | 3 | W1 | W0-01 | — |
| 29 | **P-13** | Repo map con PageRank e budget di token | 5 | PROPOSTE | W1-04 | K-10 |
| 30 | **P-01** | Sotto-agenti pilotabili (steer/stop/list, approvazioni, ripresa) | 3 | PROPOSTE | W1-02 | — |
| 31 | **P-07** | Hooks: eventi di ciclo di vita, http, fail-closed, prima/dopo | 2,5 | PROPOSTE | W1-02 | — |
| 32 | **P-16** | Fallback di modello a due stadi con evento | 2 | PROPOSTE | W1-08 | — |
| 33 | W1-09 | Tastiera e focus | 2,5 | W1 | — | — |
| 33a | **O-07** | Lavori agentici di lunga durata + velocità dei tool: RICERCA prima (Fable xhigh, avvisare), poi righe stimate — owner 04/09 «più avanti, segnalo» | 1 | ledger §3 O | W1-02 | forse |

Somma fascia A: **65,5 gg** (Wave 0 5,25 · Wave 1 31 · P 19 · O 10,25 — O-07 ricerca 1 gg a parte).

## Fascia M — Mac e Linux (dopo Wave 1, fascia a parte, stima NON misurata)

> Oggi è tutto Windows-only: `node-pty` col solo prebuild win32, la coppia di chiavi delle ricevute,
> il watcher del workspace (`workspace-files.mjs`), l'isolamento shell `wsl2|none`, la QA in
> PowerShell. Nessuna misura esiste su Mac o Linux e non c'è hardware di prova: le stime si scrivono
> quando la fascia si apre, non prima.

| # | ID | Titolo | gg | Guida | Dip | Kernel |
|---:|---|---|---:|---|---|---|
| 34 | M-01 | Porting dei cinque moduli Windows-only (pty, chiavi, watcher, sandbox, lanciatore) | — | — | W1-01, W1-02 | — |
| 35 | M-02 | Sandbox per piattaforma (seatbelt su macOS, bubblewrap su Linux) dichiarata dal Doctor | — | — | M-01 | — |
| 36 | M-03 | Pacchetti firmati: notarizzazione Apple, AppImage/deb; QA senza PowerShell | — | — | M-01, W2-16 | — |

Somma fascia M: **non misurata** (tre righe). ⛔ Costo esterno dell'owner: account Apple Developer per la notarizzazione.

## Fascia B — strutturali

| # | ID | Titolo | gg | Guida | Dip | Kernel |
|---:|---|---|---:|---|---|---|
| 37 | W2-02 | Storia esecuzioni delle automazioni | 2 | W2 | — | — |
| 38 | **P-02** | Automazioni: trigger a evento, monitor-mode, continuità, costo evitato | 4 | PROPOSTE | W2-02 | — |
| 39 | W2-10 | Setup guidato da Doctor | 2,5 | W2 | — | — |
| 40 | **P-14** | Lint per linguaggio dopo `scrivi` | 2 | PROPOSTE | W2-10 | — |
| 41 | W2-04 | Secret Broker (handle, lease, scope) | 4 | W2 | — | — |
| 42 | W2-01 | Session Plan Ledger | 4 | W2 | — | K-01 |
| 43 | **P-17** | Interrogazione del piano (`/grill`) | 2 | PROPOSTE | W2-01 | K-01 |
| 44 | W2-08 | Browser Lab evidence | 3 | W2 | — | K-07 (parte) |
| 45 | W2-09 | Gerarchia policy owner → progetto → utente → default | 4 | W2 | — | — |
| 46 | **P-06** | Revisore automatico delle approvazioni, fail-closed, con misura sul banco | 5 | PROPOSTE | W2-09 | — |
| 47 | **P-05** | Attrezzo `chiedi` + schema d'uscita della delega (adapter) | 2 | PROPOSTE | — | K-09 |
| 48 | W2-03a | Execution Fabric: contratto e registro (host, WSL2) | 4 | W2 | — | K-02 |
| 49 | W2-03b | Docker e Podman | 5 | W2 | W2-03a | K-02 |
| 50 | W2-03c | SSH | 4 | W2 | W2-03a, W2-04 | K-02 |
| 51 | W2-05 | Sandbox policy 0-4, fail-closed | 5 | W2 | W2-03a | K-03 |
| 52 | W2-06 | Context Fabric: `ContextCompacted` + drawer + ricevuta | 3 | W2 | — | K-04 |
| 53 | W2-07 | Contratto per attrezzo in Settings «Strumenti» | 3 | W2 | — | K-05 |
| 54 | **P-04** | Ledger firmato di skill e memoria con rollback | 2 | PROPOSTE | W1-13 | — |
| 55 | **P-08** | Memoria: candidate con citazione, tetto visibile, oblio | 4 | PROPOSTE | W1-04, P-04 | — |
| 56 | **P-12** | Sessioni ad albero con costo per ramo | 3,5 | PROPOSTE | W0-02 | K-04 (riassunto ramo) |
| 57 | **P-09** | `@sessione` e messaggi fra sessioni | 2,5 | PROPOSTE | W1-04 | — |
| 58 | W2-18 | Client MCP alla spec 2026-07-28 | 3 | W2 | — | — |
| 59 | W2-20 | Import da Claude Code / Codex (incl. hook sotto trust) | 1,5 | W2 | W1-13 | — |
| 60 | W2-11 | Git worktree / PR via `gh`, push sotto approvazione | 3 | W2 | W1-05 | — |
| 61 | W2-19 | Timeline dei terminali via OSC 133 | 2,5 | W2 | W1-01 | — |
| 62 | W2-12 | Ricerca approfondita (parità mobile) | 6 | W2 | — | K-06 |
| 63 | W2-14 | Electron 57.3 tray, notifiche, `talos://` | 3 | W2 | W2-13 | — |
| 64 | **P-15** | Marcatori nel codice che aprono un giro | 1,5 | PROPOSTE | P-03 | — |

Somma fascia B: **91 gg** (Wave 2 62,5 · P 28,5).

## Fascia C — lunghe o opzionali

| # | ID | Titolo | gg | Guida | Dip | Kernel |
|---:|---|---|---:|---|---|---|
| 65 | W3-01 | Parità azioni per messaggio (6.3B) | 3,5 | W3 | Fase 3 chiusa | — |
| 66 | W3-02 | Shell, navigazione, layout modulari | 10 | W3 | W3-01 | — |
| 67 | W3-03 | Conversazioni e sessioni modulari | 12 | W3 | W3-02 | — |
| 68 | W3-04 | Repository e review modulari | 8 | W3 | W3-03, W1-05 | — |
| 69 | W3-09 | Git/Review dai contratti | 3 | W3 | W3-04 | — |
| 70 | W3-05 | Superfici di esecuzione (decisione CSP xterm) | 8 | W3 | W3-03, W1-01 | — |
| 71 | W3-10 | Split pane e process tree | 3 | W3 | W3-05 | — |
| 72 | W3-06 | Management portato senza riscrivere | 8 | W3 | W3-03 | — |
| 73 | W3-07 | UI Lab, performance, gate | 5 | W3 | W3-06 | — |
| 74 | **P-18** | Best-of-n in worktree | 3 | PROPOSTE | W2-11, P-03 | — |
| 75 | W3-08 | Cutover strangler + release engineering | 6 | W3 | W3-07, W2-16 | — |
| 76 | **P-10** | PlanVM (piani dichiarativi con preventivo) | 6 | PROPOSTE | W2-01, W2-07 | K-02, K-05 |
| 77 | W4-07 | Adapter ACP (Zed, JetBrains) | 5 | W4 | W2-18 | — |
| 78 | W4-03 | Code graph e ricerca semantica locale | 6 | W4 | W1-04, P-13 | — |
| 79 | W4-01 | Backend avanzati (manifesti + un adapter live BYOK) | 8 | W4 | W2-03a | K-02 |
| 80 | W4-04 | Talos Remote Node | 5 | W4 | W2-03c | — |
| 81 | W4-05 | Memory provider SDK | 4 | W4 | P-08 | — |
| 82 | W4-02 | Computer use desktop, opt-in, stop | 8 | W4 | W2-05 | — |
| 83 | W4-06 | Sync E2EE selettiva | — | W4 | decisione owner | — |
| 84 | FIN-01 | Monorepo `apps/desktop` | 5 | W4-E-FINAL | W3-08 | — |

Somma fascia C: **116,5 gg** (Wave 3 66,5 · Wave 4 36 · P 9 · FIN 5).

## Totale

94 righe (60 del ledger + 18 PROPOSTE + 4 R + 7 O + 3 M + 2 Q), **297,5 giorni-agente** stimati (fascia M esclusa: non misurata — vedi sopra) adapter/UI, kernel a parte. R-01, Q-01, Q-02 **fatte**; il resto attende il sì dell'owner riga per riga.
Le stime seguono la regola del ledger: superata del 50 % la riga si ferma e si scrive perché.

## Le richieste al kernel, nell'ordine in cui servono

K-08 (da verificare con W0-01) → K-07 (P-03, W2-08) → K-10 (P-13) → K-01 (W2-01, P-17) → K-09 (P-05) →
K-02 (W2-03) → K-03 (W2-05) → K-04 (W2-06, P-12) → K-05 (W2-07, P-10) → K-06 (W2-12) → K-11 (dopo K-01/K-02).
Ogni riga desktop con parte kernel si chiude nella forma «solo adapter» finché la K-nn non è approvata.

## Cosa NON è in questo piano, per scelta

Bot Mode e stanze multi-agente (Hermes), share pubblico e control plane cloud (OpenCode, Canvas),
marketplace di plugin, denylist come confine, «prompt injection out of scope», commit automatici
senza approvazione: il dossier competitor §15 ha le prove.
