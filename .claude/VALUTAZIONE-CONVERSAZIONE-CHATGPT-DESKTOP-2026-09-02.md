# VALUTAZIONE — la conversazione ChatGPT «Analisi comparativa desktop» contro la codebase reale

> 02/09/2026, sera. Letta per intero dal link condiviso (195 messaggi, 39
> domande decisionali, ferma alla 39 sul browser; la zip non è ancora stata
> generata). Confronto fatto contro `MAPPA-HARNESS-DESKTOP-2026-09-02.md`
> (stato del ramo al commit `4910b4a5`) e contro il kernel in `AVM-harness`.
> Trascrizione decodificata nello scratchpad di sessione
> (`chatgpt-trascrizione.md`, 279 KB), non nel repo.

## 0 — La risposta in tre righe

1. **La conversazione è buona**: le 38 scelte chiuse sono coerenti fra loro, le correzioni dell'owner (niente delega ad app concorrenti, UI attuale sufficiente, refactor minimi) sono quelle giuste, e la struttura stable/labs con destinazione obbligatoria per ogni funzione è esattamente la forma che serve a un ledger codice per codice.
2. **Il difetto più grave è ancora curabile adesso, a costo zero**: ChatGPT lavora su una fotografia del **30/08 sera** (HEAD `cb0b28ea` più diff non committata del 31/08). Da allora il ramo ha **43 commit**, e una parte dei «problemi» che la zip troverà è già chiusa. Va rigenerato il pacchetto di review e dato a ChatGPT **prima** che produca la zip.
3. **Lo scarto di scala va governato dalla roadmap, non negato**: 13 backend di esecuzione «Core Certified», tre sistemi operativi, IDE completo, sincronizzazione cifrata, Secret Broker, microVM — contro un server Node loopback su Windows con un monolite da 11.120 righe e un frontend modulare alla Fase 3 di 10. La decisione 19 (evoluzione conservativa della UI) è l'ancora: la roadmap deve partire dai quick win e mettere le fabric grandi in coda, ognuna con una prima fetta verticale piccola.

## 1 — Le 39 decisioni, in una tabella

| # | Tema | Scelta registrata | Giudizio |
|---|---|---|---|
| 1 | Baseline | A: `patched-source` della engineering delivery 31/08 | ⛔ stantia (§3.1) |
| 2 | Libertà architetturale | B: refactor strutturale mirato, con migrazione/rollback/test | ✅ |
| 3 | Quale Hermes | C: Agent/Desktop e IDE, separati | ✅ |
| 4 | Sistema operativo | Windows, macOS e Linux (owner) | ⚠ oggi solo Windows (§3.5) |
| 5 | Parità | B: funzionale con adattamenti nativi | ✅ |
| 6 | Modello operativo | B: local-first ibrido, cloud opzionale | ✅ coerente con la regola local-first |
| 7 | Backend | Execution Fabric a 13 runtime + Backend Fabric a 10 categorie | ⚠ scala (§3.4) |
| 8 | Maturità | B: tutti reali, certificati per capability; 13 Core Certified alla prima release | ⚠ «prima release» va ridefinita (§4 Q5) |
| 9 | Motore | B: nativo TALOS con subagenti interni supervisionati (le due versioni «federate» annullate dall'owner) | ✅ già così: `delega_sottotask`, `subagent-orchestrator.mjs` |
| 10 | Autonomia | B: policy adattive per rischio, sei ambiti di consenso | ✅ a metà: 4 livelli + override per attrezzo + approvazioni; manca «per progetto/regola» |
| 11 | Modelli | C: Model Fabric con routing governato | ⚠ contro allowlist e regola «sempre flash» (§3.6) |
| 12 | Provider | C: tre livelli (nativi, compatibili, SDK) | ✅ a metà: OpenRouter nativo, OpenAI-compatibile, llama.cpp; manca SDK |
| 13 | Modelli locali | C: Local Model Fabric ibrido | ✅ in gran parte fatto (Fase 5/8/10) |
| 14 | Memoria | C: Memory Fabric a 7 livelli, governata | ⚠ oggi 1 livello per sessione (`memory-store.mjs`) |
| 15 | Promozione memoria | C: per ambito e rischio | manca |
| 16 | Sync | C: local-first, selettiva, E2EE | manca del tutto; coda lunga |
| 17 | Workspace | C: Transactional Workspace Fabric (journal, checkpoint, overlay) | ⚠ oggi: ricevute firmate + watcher; nessun checkpoint dei FILE (§2) |
| 18 | Ambiente | C: Agentic Development Environment nativo (editor, debug, LSP…) | ⚠ contrasta con 19 se letta alla lettera (§3.7) |
| 19 | Navigazione | owner: UI attuale sufficiente, refactor minimi, quick win | ✅ **l'ancora di tutto** |
| 20 | Integrazione UI | C: progressiva, isolata, reversibile, feature flag | ✅ combacia con il piano strangler |
| 21 | Ordine FE/BE | C: vertical slice end-to-end | ✅ combacia con «una fase alla volta» |
| 22 | Corpus | C: ufficiale esaustivo + comunità qualificata | ✅ |
| 23 | Riuso codice | B: selettivo, con Provenance Ledger e SBOM | ✅ (Hermes Agent MIT sì, Hermes IDE BSL no) |
| 24 | Licenza | A: desktop Apache 2.0 | ✅ il repo è già Apache 2.0 |
| 25 | Dove vive | C: monorepo `Ninozzz95/talos`, `apps/desktop`, migrazione isolata | ⚠ decisione separata dalla roadmap (§3.3) |
| 26 | Precedenza | C: per dominio (mobile da GitHub, desktop dagli ZIP) | ⚠ dipende da §3.1 |
| 27 | Baseline Git | C: `v0.1.22` + `main` + delta | ✅ per il mobile; il desktop non è su GitHub |
| 28 | Consegna | D: `stable/` + `labs/` | ✅ |
| 29 | Versione empirica | C: fork TALOS + moduli isolati | ⚠ (§4 Q10) |
| 30 | Copertura | C: esaustiva, destinazione obbligatoria, «funzioni senza esito = 0» | ✅ è il formato del ledger che vogliamo |
| 31 | Validazione backend | C: Conformance Lab BYOK, stati `CONTRACT/LIVE_*` | ✅ |
| 32 | Migrazioni | C: versionate, backup, rollback | ✅ (i JSONL di sessione oggi non hanno versione di schema: da aggiungere) |
| 33 | Sicurezza estensioni | C: capability, processo isolato, livelli di fiducia | ✅ a metà: trust hook/MCP/plugin esiste, isolamento no |
| 34 | Segreti | C: Secret Broker con handle e lease | ⚠ oggi keyring + `ambienteSenzaCredenziali()`; niente lease |
| 35 | Isolamento | C: Adaptive Sandbox Fabric, 5 livelli, fail-closed | ⚠ oggi: spawn nativo senza isolamento, WSL2, adb (§2) |
| 36 | Sessioni | C: event-sourced, checkpoint, ripristino selettivo | ✅ a metà: JSONL append-only + recupero (23 scenari); manca checkpoint file e ripristino selettivo |
| 37 | Contesto | C: Context Fabric loss-aware con Compaction Receipt | ⚠ vive nel KERNEL (§3.2) |
| 38 | Tool/skill/hook | C: quattro livelli, `SKILL.md`, MCP/ACP, hook fail-closed | ✅ a metà: tutto esiste in forma base |
| 39 | Browser | (in attesa) C consigliata: Browser Lab stabile, computer-use in labs | vedi §4 Q12 |

## 2 — Cosa esiste davvero, fabric per fabric

Letto sul disco, non a memoria. «Kernel» = `AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`, fuori dalla mia ownership.

| Fabric proposta | Già c'è | A metà | Manca |
|---|---|---|---|
| **Execution** (D7/35) | host Windows nativo (`spawn`, env senza credenziali, timeout); **WSL2** (`enforcement:'wsl2'`); dispositivo adb (mirror) | process-policy e path-policy come confine | Docker, Podman, SSH, VM, K8s, Modal, Daytona, Vercel, Apptainer, nodo TALOS, SDK; nessun livello di isolamento nativo; nessun fail-closed |
| **Model** (D11/12/13) | catalogo OpenRouter vero, chiavi nel portachiavi, llama.cpp/Ollama/LM Studio, HF download, GGUF, capacità macchina, `qualify()` | hot-swap modello/reasoning auditabile per giro | routing per policy, modelli per subagente, budget per sessione, SDK provider |
| **Memory** (D14/15) | `memory-store.mjs` + `memory_*` (4 attrezzi), per sessione | note/attività/libreria come sorelle | livelli progetto/personale/org, provenienza, confidenza, scadenza, promozione governata |
| **Workspace** (D17) | ricevute firmate Ed25519 per operazione, `postcondizioneDiScrivi`, watcher, Review/diff reali | fork di sessione | journal delle modifiche, checkpoint dei file, overlay per subagente, merge per hunk, rollback |
| **Session & Recovery** (D36) | JSONL append-only (5 tipi), `checkpoint-ripresa` (conversazione), recupero al riavvio, fork/resume/compact, export | 16 file su 23 non ripristinati (aperto) | eventi tipizzati con causalità, checkpoint file, ripristino selettivo, ricerca trasversale |
| **Context** (D37) | compattazione a 8 giri o 2.000 token (kernel), `compattaConversazioneLocale`, usage per giro, apertura a gradi degli attrezzi | contatore usage nel composer | blocchi tipizzati, PINNED/ELASTIC, Compaction Receipt, drawer Contesto, preflight al cambio modello |
| **Tool & Skill** (D38) | 42 attrezzi con `SICUREZZA_PER_ATTREZZO` e catena privato/non-fidato; skill (`carica_skill`); MCP stdio con trust; plugin con trust; hook (`HookInvoked`, `.hooks-trust`); Tool Forge con manifest validato | permessi per attrezzo | contratto versionato per attrezzo (idempotenza, parallelismo, postcondizioni), skill `GENERATED_UNVERIFIED`, ACP, hook `BeforeModelCall` ecc., quarantena |
| **Secret** (D34) | `provider-credential-store.mjs` su keyring, `CHIAVI_CREDENZIALI_DA_NASCONDERE` | | handle opachi, lease, scope, redazione nei log, importazione da `.env` |
| **Extension Security** (D33) | trust esplicito per hook/MCP/plugin/forge, `process-policy.mjs` | | manifest di capability, processo isolato, token revocabili, quarantena |
| **Browser** (D39) | `naviga` + `leggiPaginaSicura` (allowlist URL, salti controllati), vista Browser in-app agganciata a dati veri (02/09), `browser-worker/` nel repo (54 file, piattaforma AVM) | | DOM/console/rete, screenshot, annotazioni, profilo isolato, visual diff; computer-use |
| **Policy** (D10) | Read only / Workspace write / On request / Full access; override per attrezzo; approvazioni in linea; permesso del giro visibile (02/09) | | ambiti «progetto», «regola persistente», classificazione del rischio per comando |
| **UI** (D19/20) | 7 viste, 8 sezioni settings, palette 27 comandi, temi, motion, chooser, modali; frontend modulare Fase 1-2 chiuse, 3 in corso | | Fasi 4-10 dello strangler |

## 3 — Le contraddizioni da sciogliere PRIMA che la zip venga generata

### 3.1 La baseline è del 30/08: 43 commit indietro

ChatGPT ha fissato come codice canonico `TALOS-engineering-delivery/patched-source`, cioè lo snapshot `cb0b28ea` (30/08 23:08) più la diff del 31/08. Da allora, su questo ramo:

- **31/08**: tre blocchi runtime desktop chiusi (`16677c48`), Model Lab importazione completa, audit visuale frontend.
- **01/09**: frontend modulare Fase 0-2 (toolchain esbuild/Playwright, store, lifecycle, virtual list), workspace chooser con albero `C:\`, modali ridimensionabili e command bar, recupero sessioni (23 scenari), indicatore attività, resilienza OpenRouter e hot-swap auditabile, lag (watcher nativo + sfondo su transform), descrizioni umane dei comandi shell, «Apri cartella con TALOS», tema chiaro.
- **02/09**: review complessiva (GPU spenta nel browser, `WorkspaceChanged` effimero, Markdown incrementale, Review/Browser/notifiche su dati veri, 14 difetti visivi), Doctor collegato all'avvio, Model Lab `qualify()` + parser GGUF, e il batch di oggi (scroll, streaming fluido, cursore/dissolvenza, permesso del giro visibile, nomi sessione persistenti).

Conseguenza: la zip descriverà come «problema» cose già chiuse (lag, recovery, chooser, descrizioni comandi) e non vedrà `harness-ui/frontend/src`, che oggi è il bersaglio dichiarato delle Fasi 4-10. **Cura**: rigenerare il pacchetto di review oggi (stesso formato del 31/08: `REVIEWER-START-HERE.md`, `REVIEW-SNAPSHOT.md`, `PACKAGE-CONTENTS.md`) e caricarlo su ChatGPT come «delta sopravvenuto» prima della zip. Non ho trovato nel repo lo script che ha generato quel pacchetto: se non esiste più, lo scrivo io (solo lettura del repo, esclusi `node_modules`, modelli, store di sessione, `.git`).

### 3.2 Metà delle fabric vive nel kernel, che non è codice desktop

Context Fabric (D37), contratti degli attrezzi (D38), memoria (D14), subagenti (D9), sicurezza per attrezzo, compattazione: tutto sta in `talosHarness.mjs` nel repo `AVM-harness` (lane mobile). Il desktop lo carica via `TALOS_OWNER_RUNTIME_MODULE` e lo adatta in `runtime-owner-adapter.mjs`. La zip deve classificare ogni proposta con una **quarta destinazione**: `KERNEL` (si implementa nel kernel condiviso, con test del banco), `DESKTOP-ADAPTER` (si implementa in `harness-ui/src` senza toccare il kernel), `UI`. Senza questa etichetta il ledger codice per codice non sa dove scrivere, e io non ho ownership sul kernel.

### 3.3 Il monorepo `apps/desktop` è una decisione a parte

D25/26/27 spostano il desktop dentro `Ninozzz95/talos` con migrazione isolata. Oggi il desktop vive in `agent-virtual-machine` (privato), su worktree per lane, con il kernel in un repo sorella. La migrazione va bene come **fase propria in coda alla roadmap**, non come premessa: se la zip scrive i percorsi come `apps/desktop/...`, il ledger codice per codice non combacia con il disco. Chiedere a ChatGPT percorsi **relativi a `harness-ui/`**.

### 3.4 «Tanti backend»: la scala vera

Hermes ha 7 backend di esecuzione. TALOS oggi ne ha 3 parziali (host nativo, WSL2, adb) e nessuno isolato. La decisione 8 chiede 13 Core Certified «alla prima release» con prova live su ognuno: Modal, Daytona, Vercel, Kubernetes richiedono account e crediti. È giusto come **destinazione**, ma la roadmap deve definire la «prima release» come una tranche: host nativo con isolamento, WSL2, Docker, Podman, SSH (tutti provabili sulla macchina dell'owner senza spendere). Il resto in `labs` con stato `NOT_LIVE_VALIDATED` dichiarato, come prevede la stessa D31.

### 3.5 Tre sistemi operativi, oggi uno

Tutto il desktop è Windows: `node-pty`, keyring Windows, PowerShell/Git Bash, launcher Explorer, QA con Chrome via CDP. La decisione 4 è legittima come vincolo architetturale (adapter per OS, nessuna scelta che chiuda mac/Linux) ma, se entra nella roadmap come lavoro, moltiplica ogni fetta per tre. Da decidere: **vincolo di design ora, lavoro dopo**.

### 3.6 Il Model Fabric contro l'allowlist

`config.mjs` ammette due modelli (`z-ai/glm-4.7-flash`, `qwen/qwen3.7-flash`) e la regola dell'owner del 20/8 è «mai modelli di punta, sempre fascia flash». Il routing per capacità/costo/qualità (D11) presuppone un catalogo aperto. Le due cose si conciliano solo se il routing sceglie **dentro** un'allowlist dichiarata dall'owner, mai fuori. Va detto a ChatGPT, altrimenti proporrà fallback verso modelli premium.

### 3.7 D18 (IDE completo) contro D19 (UI attuale sufficiente)

Editor multi-tab, split view, debug adapter, LSP, test explorer, rename semantico: è un IDE. L'owner, tre domande dopo, ha detto che la UI attuale basta. ChatGPT ha ricomposto («resta valida sul piano funzionale, senza nuova shell»), ma il conflitto resta nel costo: un editor con LSP non è un quick win e non entra in una superficie esistente. Oggi il desktop ha albero file, visualizzatore, diff e review; un editor scrivibile è la sola parte plausibile a breve. Il resto va marcato `DESIGN_VALIDATED` o «monitorare», non `stable`.

### 3.8 Il bersaglio delle patch UI: monolite o `frontend/src`

Le patch UI della zip arriveranno contro `public/app.js` (il monolite, unica UI in produzione). Il piano del 01/09 porta la UI nel frontend modulare per Fasi 4-10 (strangler). Se le patch cadono sul monolite, o si accetta che vivano lì fino al cutover (con la fixture `legacy-contract.snapshot.json` da rigenerare a ogni tocco), o si chiede alla zip di scrivere i componenti nuovi in `frontend/src/design-system` e `frontend/src/app`. Decisione tua, ma va data a ChatGPT prima.

### 3.9 La «runtime gateway» della delivery precedente non va riproposta

La engineering delivery del 31/08 conteneva una «implementation/runtime-gateway» e un «Desktop harness sostituito». Il desktop ha scelto il proprio `runtime-owner-adapter.mjs`; il piano dice che il refactor ZIP v1+v2 non è chiuso e che la UI vive nel monolite. Chiedere a ChatGPT di **non** riproporre il gateway come baseline.

## 4 — Le domande che porrò a te (bozza, con la mia raccomandazione)

Le pongo qui in anteprima così arrivano risolte quando arriva la zip. Ogni risposta cambia il ledger.

1. **Baseline fresca.** Rigenero oggi il pacchetto di review e lo carichi su ChatGPT prima della zip? — *Raccomando: sì, è l'unica cura a costo zero del difetto più grande.*
2. **Bersaglio UI.** Quick win sul monolite `public/app.js` (con fixture rigenerata) e componenti nuovi in `frontend/src`? — *Raccomando: sì, doppio binario allineato allo strangler.*
3. **Kernel.** Le proposte che toccano `talosHarness.mjs` si implementano nel kernel (lane mobile, non mia) o restano `DESKTOP-ADAPTER` finché possibile? — *Raccomando: adapter prima; nel kernel solo ciò che non può stare altrove, con ledger separato e tuo sì per ognuno.*
4. **Piattaforme.** Windows come piattaforma di lavoro, mac/Linux come vincolo di design (adapter, niente scelte chiudenti) senza lavoro di porting in questa roadmap? — *Raccomando: sì.*
5. **Prima tranche di backend.** Host nativo isolato, WSL2, Docker, Podman, SSH nella prima tranche; cloud e K8s in labs con `NOT_LIVE_VALIDATED`? — *Raccomando: sì.*
6. **Modelli.** Il routing del Model Fabric sceglie solo dentro un'allowlist tua (fascia flash), mai fuori? — *Raccomando: sì, e lo dici a ChatGPT.*
7. **IDE.** Editor scrivibile nel visualizzatore file = sì; debug/LSP/test explorer = «monitorare»? — *Raccomando: sì.*
8. **Monorepo.** Migrazione ad `apps/desktop` come ultima fase, non premessa; percorsi nella zip relativi a `harness-ui/`? — *Raccomando: sì.*
9. **Labs.** Cartella `harness-ui/labs/` nel repo dietro feature flag, o repo separato? — *Raccomando: nel repo, dietro flag, con store dati separati (come prevede D32).*
10. **Versione empirica di ChatGPT.** La consideriamo fonte di idee e screenshot, non codice da integrare; il codice entra solo attraverso il ledger? — *Raccomando: sì.*
11. **Metrica d'ordine.** «Quick win e critica» = impatto sull'uso quotidiano × rischio di regressione basso × costo in giorni; ogni riga della roadmap porta i tre numeri? — *Raccomando: sì, altrimenti l'ordine è a sentimento.*
12. **Domanda 39 di ChatGPT.** Rispondere C (Browser Lab stabile, computer-use in labs) precisando che il Browser Lab si innesta sulla vista Browser già agganciata a dati veri e su `browser-worker/`? — *Raccomando: sì.*

## 5 — Cosa manca ancora nella conversazione

Aree del desktop che le 39 domande non hanno toccato e che la zip, per la regola «funzioni senza esito = 0», dovrebbe coprire. Da spingere a ChatGPT:

- Git dentro l'app: stato, stage, commit, branch, PR, worktree (Codex e Claude Code lo hanno).
- Review e diff: commenti per riga, approvazione per hunk, test collegati al diff.
- Terminale: più terminali, timeline comandi con durata ed exit code (Hermes IDE).
- Automazioni e cron: run programmati esistono già; trigger su eventi, webhook, notifiche.
- Notifiche di sistema, tray, badge; finestre secondarie.
- Verifica: test runner, esito test nel giro, gate «non dichiarare fatto senza prova» (il cancello semantico del kernel è un differenziatore da mostrare).
- Costi: cruscotto per sessione/progetto, budget, avvisi.
- Ricerca nelle sessioni (full-text, per file, per comando).
- Artefatti e documenti: già ci sono; galleria, versioni, export.
- Voce: già presente (riconoscimento + lettura); parità mobile.
- Onboarding, Doctor come prima schermata, importazione configurazione.
- Packaging: installer, updater, firma, `IExplorerCommand` (Fase 10 del piano).
- Accessibilità e tastiera completa; localizzazione.
- Telemetria locale e crash report opt-in.
- Il mobile come metro: la regola «harness mobile si allinea al desktop» e la parità delle azioni per messaggio (6.3B).

## 6 — Messaggio pronto da incollare a ChatGPT (dopo le tue risposte)

```
Correzioni prima della zip:
1. Baseline: sostituisci patched-source del 31/08 con il pacchetto di review
   allegato (HEAD <sha di oggi>). 43 commit dopo: frontend modulare in
   harness-ui/frontend/src (Fasi 1-2 chiuse, 3 in corso), workspace chooser,
   recupero sessioni, resilienza OpenRouter, lag, descrizioni comandi,
   review 02/09. Non riproporre la runtime gateway della delivery 31/08.
2. Percorsi relativi a harness-ui/; niente apps/desktop (migrazione = ultima fase).
3. Quarta destinazione obbligatoria per ogni funzione: KERNEL (talosHarness.mjs,
   repo separato) / DESKTOP-ADAPTER (harness-ui/src) / UI (public/app.js oppure
   frontend/src) / LABS.
4. Windows piattaforma di lavoro; mac/Linux solo vincolo di design.
5. Prima tranche execution: host nativo isolato, WSL2 (esiste), Docker, Podman,
   SSH. Il resto labs con NOT_LIVE_VALIDATED.
6. Model Fabric: routing solo dentro un'allowlist dell'owner (fascia flash).
7. D18: editor scrivibile sì; debug/LSP/test explorer = monitorare.
8. Ogni riga della roadmap: impatto (1-5), rischio regressione (1-5), costo in
   giorni, dipendenze, file toccati. Ordine: quick win e critici prima.
9. Copri anche: Git in-app, review per hunk, terminali multipli con timeline,
   notifiche/tray, test runner e gate di verifica, costi, ricerca sessioni,
   packaging/updater, accessibilità, telemetria opt-in.
10. Domanda 39: C.
```

## 7 — Trovato durante la lettura, non legato alla zip

- Il pacchetto di review del 31/08 dichiarava «working tree intenzionalmente sporco» e includeva la diff non committata: la stessa situazione di oggi (472 righe di un'altra sessione non committate su `app.js`/`styles.css`). Se rigenero il pacchetto, includo solo il committato e dichiaro la diff a parte, come allora.
- La conversazione ha usato circa 40 fonti ufficiali (Claude Code docs, Codex docs, Hermes Agent docs, Hermes IDE repo) con data 2/9: utile anche per il nostro `LEDGER-FASE-0-BASELINE-COMPETITIVE`, che è del 30/08.
