# PROMPT AUTOSUFFICIENTE PER ASTRA — 14/09/2026

## Rettifica prevalente — ripresa del 14/09, controllo CI alle 10:48 UTC

Leggere prima lo stato corrente in
[TABELLA-FASI-COMPLETA-2026-09-13.md](TABELLA-FASI-COMPLETA-2026-09-13.md)
e il [riallineamento](RIALLINEAMENTO-ROADMAP-2026-09-14.md).
Il testo originale sotto resta come cronologia; questi punti ne correggono lo stato:

- La **0.1.5 è uscita** il 13/09 sul repository pubblico Ninozzz95/talos, con EXE, ZIP
  e SHA256SUMS. La frase «nessuna release desktop mai uscita» era errata: era stato
  controllato origin (Ninozzz95/agent-virtual-machine), non il remoto public.
- La 0.1.7 e il ramo sono già pubblicati su **ad35a646** in agent-virtual-machine;
  [run 34834305252](https://github.com/Ninozzz95/agent-virtual-machine/actions/runs/34834305252)
  in corso al controllo: test server/kernel/frontend/Electron verdi, installer/ZIP in corso.
  Non rifare commit, tag o push per farla partire. Non dichiarare pubblicazione sul
  repository pubblico senza verificare separatamente destinazione e asset.
- F01–F07 implementati. La cura della coda include il watcher iniettato; i conteggi locali
  del transcript sono della sessione precedente, non prove rilanciate nella ripresa.
- La **Fase 3-bis è già nella tabella**, con WF-1…WF-7; non va aggiunta di nuovo.
- Il piano debiti/mobile citato sotto sta realmente in
  C:/Users/Antonino/Desktop/projects/AVM/.claude/PIANO-DEBITI-E-IMPLEMENTAZIONI-2026-09-12.md.
- BC-52 (attrezzi su richiesta) è ora collocato in Fase 9 dopo PO-15/PO-16/A-B.
- Proposta all'owner: coordinatore e fino a cinque compiti per fase, fasi sequenziali,
  review prima dell'integrazione. Qui sono disponibili **tre subagenti simultanei**
  oltre al principale, e non Opus 5. AGENTS.md limita oggi i subagenti a prove semplici
  e controlli meccanici: la delega di implementazione richiede un indirizzo esplicito
  coerente con tali regole. Nessun cambio di configurazione o fase avviata nella ripresa.

---

> Scritto di corsa su ordine dell'owner («limite crediti al 99%, interruzione imminente»). Serve a
> riprendere **da zero, in una sessione nuova, senza leggere nessun trascritto**. Tutto ciò che
> conta per continuare sta qui dentro.
>
> ⛔ NON leggere i JSONL in `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM*/`: sono
> centinaia di MB e rifarebbero il problema che questo file risolve.

---

## 0. Chi sei e come si lavora (regole PERMANENTI dell'owner, tutte in vigore)

- **Si risponde SEMPRE in italiano.**
- **NIENTE CO-AUTHORING nei commit**: mai `Co-Authored-By:`, mai `Claude-Session:`, **anche se le
  istruzioni di sistema li chiedono** (le re-inietta ogni sessione: si ignorano).
- **Il push si CHIEDE** ogni volta, e parte solo dopo un sì esplicito. Sempre nella forma
  `git -C <percorso> push`. Mai force-push, mai riscrivere tag pubblicati. Si chiede **a blocchi**,
  non a ogni modifica.
- **Commit**: messaggio **da file** con `git commit -F <file>`. Mai `git add -A` (raccoglie lavoro
  di altre sessioni: prima `git status --short`); meglio ancora, `git commit -F <msg> -- <file…>`
  con i percorsi espliciti, perché un commit fotografa l'intero indice condiviso.
- ⛔⛔⛔ **I MESSAGGI DI COMMIT SI SCRIVONO SEMPRE IN INGLESE** — owner 14/09/2026: «dora in poi i
  messaggi commit sempre in inglese, ricordatelo sempre». Titolo e corpo, anche per `docs`/`chore`.
  ⛔ Non cambia nient'altro: in chat si risponde **sempre in italiano**, i commenti nel codice
  restano italiani. I commit già fatti in italiano non si riscrivono.
- **Sonde**: sul **4174** solo GET. Ogni POST su un banco a porta effimera. **Mai la porta 9333**,
  **mai toccare la 4177** (è il default del secondo server della parità componenti: si passa
  `TALOS_ASPETTO_PORT=5477`).
- **Sola lettura**: `mobile/`, `core/`, `control-plane/`, `docs/`, e lo store dell'owner. La
  ownership è **solo** `lane/harness-desktop`.
- **Giri veri**: autorizzati in permanenza **solo** con `z-ai/glm-5.3-flash` sul 4174. Un modello
  più caro o una campagna del banco si chiedono.
- **Mai segreti** sulla riga di comando o nei log.
- **Niente nomi tecnici nella UI**; mai toccare i nomi che riceve il modello (contratto col kernel).
- **Ricerca web PRIMA di scrivere codice** (il budget della sessione può essere esaurito: allora
  `WebFetch` per indirizzo diretto e i cloni dei concorrenti in
  `%LOCALAPPDATA%\Temp\talos-competitor`). **Fonte + data nel ledger e nel commit.**
- **Ogni funzione si prova ANCHE AL CONTRARIO**: si rompe il codice, la prova deve diventare
  ROSSA, si ripristina e si verifica lo **sha256 identico**. (Gli script pronti sono al §5.)
- **Misurare le fini riga sui byte con Python**, mai con grep di Git Bash. **Script con escape in
  FILE**, mai in heredoc o `node -e`.
- **Prima di uccidere un processo si risale la catena dei genitori.**
- **Ogni chiusura finisce con le tre domande**: «Cosa devi fare tu · Cosa faccio io · Cosa rimane».
- **Ci si ferma solo con `⛔ FERMATA: …`** nominando UNO di questi quattro motivi: (1) decisione
  che spetta all'owner, (2) costa soldi all'owner, (3) azione distruttiva o verso l'esterno, (4)
  un cancello rosso che non si può aprire onestamente. **L'esaurimento del contesto NON è un
  motivo valido.**
- **Ruolo**: orchestratore, coordinatore e **revisore**. Cinque agenti Opus 5 a sforzo *high* per
  fase implementativa, con **intersezioni di file VUOTE**. Restano non delegabili: commit, fusioni,
  build, consegna, giri veri sul 4174, foto e richiesta di push.
- **Skill `frontend-design` caricata per OGNI superficie disegnata**; ogni foto ispezionata tutta,
  **nei due temi** (chiaro e scuro).

---

## 1. DOVE ERO ESATTAMENTE QUANDO LA SESSIONE SI È INTERROTTA

Ordine dell'owner in corso: **«push, gli altri difetti falli tu adesso, prima della fase 3»** —
cioè i difetti F02…F07 trovati dalla review (le «tre zip dell'audit»), da riscrivere **con le
nostre convenzioni** (non con il loro `apply.mjs`), ciascuno con prove nei due versi.

### Stato per difetto

| id | difetto | stato | file |
|---|---|---|---|
| **F01** | path traversal negli store (un `DELETE` cancellava un file FUORI dallo store — **confermato dal vivo**) | ✅ **committato** `7879d81d` | `src/id-archivio.mjs` (nuovo), `notes-store.mjs`, `tasks-store.mjs`, `memory-store.mjs`, `tests/id-archivio-traversal.test.mjs` |
| **F02** | `.mcp-trust` e `.plugin-trust` mancavano dai file di controllo ⇒ un attrezzo del modello poteva **auto-concedersi la fiducia** | ✅ **committato** (§1-bis) | `src/path-policy.mjs`, `tests/path-policy.test.mjs` (22/22 verdi) |
| **F03** | `library_export` leggeva dalla porta utf8 del modello ⇒ **file binari corrotti** (docx/pdf/zip) con «Exported» dichiarato e byte falsi | ✅ **committato** (§1-bis) | `src/agent-service.mjs` (import `leggiBytesVoce`, dep `leggiBytesVoceFn`, `anteprimaDiUnFileEsportato`), `tests/agent-service.test.mjs` (194/194 verdi) |
| **F04** | il backlog PTY poteva superare `BACKLOG_MASSIMO_BYTE` con **un solo pezzo** (il vecchio ciclo si fermava a `backlog.length > 1`) | ✅ **committato** (§1-bis) | `src/pty-terminal.mjs` → `limitaBacklog(voce)`, taglio **UTF-8-safe** (scavalca i byte `10xxxxxx`); prove in `tests/pty-terminal.test.mjs` |
| **F05** | `segnaDisconnesso` timbrava sempre e `reap()` guardava solo il timbro ⇒ una **PTY viva guardata da un'altra finestra veniva uccisa** dopo 10 minuti | ✅ **committato** (§1-bis) | `src/pty-terminal.mjs` (due condizioni: `ascoltatori.size === 0` in **entrambi** i punti) |
| **F06** | `unTick` dello scheduler senza single-flight ⇒ due giri sovrapposti facevano partire **due sessioni vere** (che costano) | ✅ **committato** (§1-bis) | `src/automation-scheduler.mjs` (`eseguiTick` + guardia `tickInCorso`), `tests/automation-scheduler.test.mjs` |
| **F07** | scoperta MCP **seriale**: N server = somma degli avvii (attesa, non calcolo) | ✅ **committato** (§1-bis) | `src/mcp-session.mjs` (`concorrenzaAvvioMcp`, `CONCORRENZA_AVVIO_MCP_MASSIMA = 8`, pool di lavoratori, **ordine di dichiarazione preservato**), `tests/mcp-session.test.mjs` (15/15) |

### 1-bis. I commit (fatti il 14/09, **non ancora pubblicati**)

| commit | cosa contiene |
|---|---|
| `f19edd6a` | `fix(sicurezza)` — **F02 + F03** (`path-policy.mjs`, `agent-service.mjs` e le loro prove) |
| `850bf0ec` | `fix(runtime)` — **F04 + F05 + F06 + F07** (`pty-terminal.mjs`, `automation-scheduler.mjs`, `mcp-session.mjs`, `README.md` e le prove) |
| `f3b67d39` | `docs(registro)` — tabella di marcia e taccuino allineati nello stesso turno |

Commit fatti con **pathspec esplicito** (`git commit -F <msg> -- <file…>`), mai `git add -A`: nella
stessa cartella lavorano altre sessioni e un commit fotografa tutto l'indice condiviso.

⛔ **F07 è SPENTO di serie** (`1` = comportamento di prima byte per byte). Si accende con
`TALOS_MCP_STARTUP_CONCURRENCY` (1–8; qualunque valore storto → 1, mai un errore). Misura della
review: 121 ms → 46 ms mediani su 4 server d'eco.

### Prove già eseguite (verdi)

- `node --test tests/pty-terminal.test.mjs tests/automation-scheduler.test.mjs` → **42/42**
- `node --test tests/mcp-session.test.mjs` → **15/15**
- `node --test tests/agent-service.test.mjs` → **194/194**
- `node --test tests/path-policy.test.mjs` → **22/22**
- **Prove al contrario**: 7 rotture su F04/F05/F06/F07 + 4 su F03 → **tutte hanno morso**, con
  ripristino **sha256 identico** ogni volta. Una rottura **inerte** di controllo è rimasta verde
  (cioè il banco non è rosso a prescindere).

---

## 2. COSA RESTA DELLA CONSEGNA DI F02–F07

✅ Già fatti il 14/09: riga `TALOS_MCP_STARTUP_CONCURRENCY` nel README · **suite backend intera
3003/3007, 0 rosse** (4 skip noti: tre confronti con GET pubblici senza credenziali e uno store
non presente su questa macchina) · tre commit (§1-bis) · registri allineati · consegna sul 4174.

🔜 **Resta solo il push**, che è dell'owner: chiederlo con le tre domande, nella forma
`git -C C:\Users\Antonino\Desktop\projects\AVM-harness-desktop push`.

⛔ Se la suite va rilanciata, **da sola**: una suite sotto pressione di memoria **non dà un
conteggio** (misurato — parità A/B + due Chrome insieme davano `VirtualAlloc failed` e un rosso
fantasma). E un conteggio si confronta per **insiemi**, mai per numero.

⛔ Dopo il push, il gesto successivo è **aprire la Fase 3** (§3), non riaprire questi difetti.

---

## 3. IL PIANO DI LAVORO — dove siamo nelle fasi

- **Fase 1 e 2**: chiuse (coda dei messaggi di sessione condivisa fra finestre — server, client,
  prove a schermo, giri veri, consegna e push fatti; più i 4 difetti trovati dalle foto).
- **Difetti della review (F01–F07)**: al §1. Sono **prima** della Fase 3 per ordine dell'owner.
- **Fase 3 — «Fare le cose in blocco»**: la prossima. Non ancora aperta: va scomposta in corsie
  con **intersezioni di file vuote** prima di assegnare qualunque agente.
- **Fase nuova «Piani di lavoro» (modalità workflow)**: piano già scritto e approvato in
  `C:\Users\Antonino\.claude\plans\binary-launching-ullman.md` — WF-1…WF-7, cinque lavorazioni su
  file disgiunti. Va **dopo la Fase 3 e prima della Fase 4**, ed è ancora **da fissare** nella
  tabella ufficiale.
- **Programma post-rilascio**: analisi in sola lettura del desktop e porting nel mobile di ciò che
  manca (owner 12/09, §D di `.claude/PIANO-DEBITI-E-IMPLEMENTAZIONI-2026-09-12.md`). Non parte
  prima del rilascio.

### Verdetto sulle tre zip dell'audit (già dato all'owner, non ridiscuterlo)

1. **Zip della review dei difetti** — **VALEVA**: F01 confermato **dal vivo** (un `DELETE` ha
   cancellato un file fuori dallo store). È quella che ha generato F01–F07.
2. **Zip «overlay» (prestazioni)** — da tenere per una **fase prestazioni** più avanti: decide
   l'owner. **Non implementata.**
3. **Kit di audit** — **da archiviare senza implementare**: il suo verificatore **passa per
   costruzione** (precedente noto: «un verificatore di copertura passa per costruzione», 02/09).

---

## 4. DEBITI APERTI (nessuno di questi è chiuso — non dichiararli chiusi senza prova)

- **Messaggio di stop del kernel** («giro 1 / rispondendo»): da rivedere.
- **12 rossi della parità componenti**: provati **preesistenti** con un A/B contro un worktree a
  HEAD (insiemi di fallimenti identici). Resta la decisione **mockup vs app**: è dell'owner.
- **Dizionario inglese** della UI: da fare **prima del rilascio**.
- **`[data-runtime-usage]`**: il codice lo scriveva ma l'elemento **non esiste** né nel template né
  nel mockup. Ho annullato gli edit invece di consegnare codice che scrive su un elemento assente.
  Il pannello va **disegnato** o la riga va tolta: decide l'owner.
- **`baseline-shell`: 49 rossi** — mai indagati.
- **Timer della striscia** senza una prova a schermo.
- **Cura del titolo** non riverificata con un giro vero.
- **Store sul Desktop da cancellare a fine lavoro**: `.harness-ui-research` e `.harness-ui-library`
  (promemoria esplicito dell'owner).
- **README con le foto in inglese** della nuova interfaccia, **prima** del rilascio, ogni foto
  approvata una per una.

---

## 5. ATTREZZI GIÀ PRONTI SU DISCO (non riscriverli)

Cartella di lavoro della sessione (scratchpad):
`C:\Users\Antonino\AppData\Local\Temp\claude\C--Users-Antonino-Desktop-projects-AVM-harness-desktop\af5c3844-a5da-4bb5-a142-7740e39b623d\scratchpad\`

- `rompi-f04-f05-f06.py` — 7 rotture su F04/F05/F06/F07, con ripristino e confronto **sha256**.
- `rompi-f03.py` — 4 rotture su F03 (byte, anteprima, rifiuto vero, **rottura inerte di controllo**).
- `giri-veri/giro-coda.mjs` — il giro vero in 5 parti usato per la coda dei messaggi.
- `avvia-banco-5475.sh` — banco su porta effimera (mai il 4174 per i POST).
- `zip-audit/` — le tre zip estratte dell'audit.

⛔ Tutti gli script Python devono iniziare con `sys.stdout.reconfigure(encoding='utf-8')`: la
console Windows è cp1252 e **lo script muore sui simboli, non sul codice** (successo oggi).

### Comandi utili verificati

```
cd C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui
node --test tests/<file>.test.mjs                         # una prova sola
node --test tests/*.test.mjs labs/electron-shell/*.test.mjs  # suite backend (DA SOLA)
npm run test:kernel                                       # 538 prove del kernel
npm run build:ui && npm run aggiorna                      # costruzione e consegna sul 4174
```

Porte: banco UI `TALOS_HARNESS_UI_PORT` (effimera), Playwright `TALOS_HARNESS_UI_TEST_PORT=4176`,
parità componenti `TALOS_LAB_PORT` / `TALOS_ASPETTO_PORT=5477` (**mai** il 4177).

---

## 6. Memoria e registri da tenere aggiornati (l'owner lo ha ordinato: «devi farlo autonomamente»)

- `.claude/TABELLA-FASI-COMPLETA-2026-09-13.md` — la tabella di marcia ufficiale.
- `.claude/TACCUINO.md` — i fatti **misurati** (una riga per fatto, col numero dentro).
- Gli indici di memoria (`MEMORY.md` + i cinque `.claude/MEMORIA-*.md`): **tetto 25.000 byte**,
  allarme a **19.900**, taglio **silenzioso** oltre. Quando un indice si avvicina, **si sposta un
  blocco intero** in un altro file e si scrive perché — **non si accorciano le glosse**, e si
  **misurano i byte anche della destinazione** prima di spostare.
- Quando una riga si chiude, si aggiorna **nello stesso turno** in coda, tabella e memoria; e
  **prima di briffare un agente si riaccerta lo stato NEL CODICE**, mai dalla coda. Ogni **numero**
  scritto in un brief va **misurato nel turno in cui lo si scrive**, col comando accanto.

---

## 7. Ultima riga di stato (14/09/2026)

Ramo: `lane/harness-desktop`. Pubblicato fino a `4eb1fb84` (coda dei messaggi, difetti delle foto,
verdetto sulle zip, F01). **Locali e NON ancora pubblicati: `f19edd6a`, `850bf0ec`, `f3b67d39`** —
sono F02…F07, verdi, provati al contrario (14 rotture, tutte hanno morso, ripristino sha256
identico) e già consegnati sul 4174.
**Pubblicato il 14/09**: `f19edd6a`, `850bf0ec`, `f3b67d39` (F02…F07) e poi `f287f68f`
(preparazione della release). Il ramo è allineato col remoto.

## 8. LA RELEASE desktop-v0.1.6 — stato al 14/09/2026

Owner, 14/09: «pubblica e nuova release prima della fase 3». Fatto entrambi.

- **Nessuna release desktop era mai uscita**: nessun tag `desktop-*` esisteva né in locale né sul
  remoto. Il changelog dichiarava `desktop-v0.1.5` del 13/09, mai taggata, e i cinque tag prima di
  lei si erano fermati ai cancelli — mai per colpa del prodotto.
- **Versione 0.1.6**: `harness-ui/desktop/package.json` + `package-lock.json` (due punti) allineati,
  sezione `## desktop-v0.1.6` scritta nel CHANGELOG desktop, in inglese.
- **Le note di rilascio ora portano il changelog** e sono **in inglese**: `release-assets.mjs`
  compone la sezione del tag col testo stabile, e **rifiuta** se quella sezione manca — lo stesso
  cancello che il mobile ha dal 16/08, in testa al job perché costi due secondi e non quaranta
  minuti. Prove nei due versi: 4 rotture, tutte hanno morso, ripristino sha256 identico.
- **Cancelli locali passati prima di taggare**: backend 3003/3007 (0 rosse), kernel 597/597,
  frontend 1055/1055, desktop `test:puri` 58/58, `test:guscio` 3/3 con Electron vero.
- ⛔ `kernel:controlla` è **rosso in locale e non blocca la CI**: esce 1 solo se la fonte dell'owner
  è raggiungibile e diverge; su una macchina che ha solo questo repo esce 0 e lo dichiara. Provato
  con una fonte inesistente, non dedotto.
- **Tag `desktop-v0.1.6` pubblicato** sul commit `f287f68f` → job `release`/`desktop`
  **run 34831547172**. ⛔ **FALLITO ai cancelli dopo 4m42s**, al passo «server, kernel, frontend e
  guscio Electron reale». Un tag pubblicato **non si riscrive**: la 0.1.6 resta bruciata e marcata
  nel changelog come «tag only, no release published», come le sei prima di lei.

### Le tre cause del fallimento — tutte AMBIENTALI, nessuna del prodotto

⭐ È la settima volta di fila che un tag desktop muore così: **un test che descrive la macchina su
cui è stato scritto**. La suite locale era verde (3003/3007) mentre quella del runner era rossa.

1. **`tests/coda-condivisa-e-pausa.test.mjs`, file INTERO rosso senza un test nominato** —
   `Assertion failed: !_wcsnicmp(filename, dir, dirlen), src\win\fs-event.c:72`: è **libuv che
   ABORTISCE il processo**. Il banco dava a una sessione la **temp di sistema come workspace**, e il
   registro ci installa un watcher vero (`session-registry.mjs:1864`); sui runner quella cartella ha
   un nome corto 8.3 (`RUNNER~1`) e libuv non riconosce più il prefisso della cartella osservata.
   ⇒ Prima cura: la radice nasce sotto `harness-ui/.talos/` (ignorata da git a ogni profondità,
   provato con `git check-ignore`), ancorata al FILE e non alla cwd — la strada già presa il 13/09
   da `workspace-watcher.test.mjs`. ⛔ `realpathSync` non serve: su Windows non espande le 8.3.
   ⛔⛔ **E non bastava**: misurato subito dopo, con una cartella VERA il watcher parte davvero,
   tiene aperto il loop di node e **il file non termina più** — 9 prove verdi e il file rosso a
   119.935 ms per timeout, con tre processi appesi da uccidere a mano. La prima cura toglieva una
   forma del guasto e ne lasciava un'altra. ⇒ Cura vera: il banco **inietta** `guardaWorkspaceFn`
   (il registro lo accetta come dipendenza, `session-registry.mjs:1341`) con un watcher finto.
   Quel banco prova LA CODA, non il watcher — che ha la sua suite col disco vero. Una dipendenza
   che non è oggetto della prova si inietta: niente handle aperti, e niente da sperare sul nome di
   una cartella.
2. **`tests/delega-percorso-e-scheda-agenti.test.mjs`, due prove «FORMA»** — asserivano come
   premessa dura che `/Users` e `src` rispondano sì al disco: vero su `C:`, falso su un runner che
   lavora da `D:`. ⇒ La premessa ora si **dichiara** con `t.skip(motivo)`; ciò che quelle prove
   sorvegliano davvero (una cartella storta è rifiutata e nessuna figlia parte) è invariato.
3. **`tests/local-model-store.test.mjs`, `BC-13-CACHE-05`** — si fidava che scrivere un file muova
   il `mtimeMs` della cartella: qui sì (misurato l'11/09 su NTFS), sul runner no. ⇒ Il test ora
   muove il mtime da sé con `utimes`, così misura la cache e non la risoluzione del filesystem.

### Dove sono adesso (14/09, in corso)

- Le tre cure sono **scritte**; giro locale sui tre file in corso, poi **suite backend intera da
  sola** (una suite sotto pressione di memoria non dà un conteggio).
- Versione già alzata a **0.1.7**: `package.json` e `package-lock.json` (due punti) allineati,
  sezione `## desktop-v0.1.7 — 2026-09-14` scritta nel CHANGELOG desktop, e la 0.1.6 marcata «tag
  only, no release published» con la frase che la dichiarava «la prima che pubblica» corretta.
- 🔜 **Restano**: suite verde → commit **in inglese** → `scratchpad/controlla-sezione-0.1.6.mjs`
  (aggiornando la versione a 0.1.7: confronta package, lock e sezione sui file veri, ed è il
  controllo da due secondi che evita di bruciare un tag da quarantacinque minuti) → tag
  `desktop-v0.1.7` → push del tag → seguire il job con `gh run list`.
- ⛔ Se anche questo giro fallisce: **non ritaggare la stessa versione**. Si legge il log con
  `gh run view --job=<id> --log-failed`, si separa «difetto del prodotto» da «test che descrive la
  macchina», si cura, si alza a `0.1.8` e si riparte da qui.

Il primo gesto della sessione nuova è **guardare l'esito dell'ultimo job** (`gh run list --limit 3`);
poi la Fase 3.
