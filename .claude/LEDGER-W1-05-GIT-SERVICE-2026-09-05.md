# LEDGER W1-05 — `git-service.mjs` e le cinque rotte git (05/09/2026)

> Riga **W1-05, solo backend**. Serve a sbloccare **W1-06**, la Review a due
> sorgenti dichiarate: «Ultimo giro agente» dagli eventi, **«Non committato»
> da qui**. La superficie UI non è mia e non è stata toccata.
>
> ⛔⛔⛔ **`push` non esiste**, in nessuna forma, e nemmeno `remote`/`fetch`/`pull`.
> Regola dell'owner: il push si chiede a lui ogni volta. Due test lo **pinnano**
> (uno sul sorgente del servizio, uno sulle rotte), e sono stati provati rossi
> aggiungendo davvero una rotta `git/push` — vedi §4.

---

## 1. LA RICERCA — fonte + data, e cosa ha CAMBIATO

Tutte le fonti lette il **05/09/2026**. ⛔ Sette punti su otto hanno cambiato
il disegno: quello che mancava non era la soluzione, erano i **vincoli**.

| # | Fonte | Cosa dice | Cosa ha cambiato |
|---|---|---|---|
| 1 | [git-scm.com/docs/git-status](https://git-scm.com/docs/git-status) | «Without the `-z` option, pathnames with "unusual" characters are quoted as explained for the configuration variable `core.quotePath`» | `-z` obbligatorio. **Misurato**: senza, `àccento.txt` → `"\303\240ccento.txt"` |
| 2 | idem | «the `->` is omitted from rename entries and the field order is **reversed** (e.g. `from -> to` becomes `to` `from`)» | Il parser consuma il campo in più **solo** su `R`/`C`, e `da` è il SECONDO campo |
| 3 | idem | «Version 1 porcelain format … is **guaranteed not to change in a backwards-incompatible way** … ideal for parsing by scripts». Per v2 la stessa garanzia **non è scritta** | **v1, non v2** — risposta alla domanda aperta del brief. ⛔ E v2 non aiuta sulla rinomina: **misurato**, anche lì l'ordine è `<path><sep><origPath>` |
| 4 | [git-scm.com/docs/git-commit](https://git-scm.com/docs/git-commit) (`--only`) | «Make a commit by taking the **updated working tree contents** of the paths specified on the command line, disregarding any contents that have been staged for other paths» | ⛔⛔⛔ **Ha ribaltato il disegno del commit.** Vedi §2 |
| 5 | [git-scm.com/docs/git](https://git-scm.com/docs/git) (`--literal-pathspecs`) | «Treat pathspecs literally (i.e. no globbing, no pathspec magic)» | ⛔ **Misurato**: `git add -- :/` da una sottocartella mette in stage **l'INTERO repo padre**. La magia sopravvive a `--`. Flag su **ogni** comando |
| 6 | idem (`--no-optional-locks`) | «this will prevent `git status` from **refreshing the index** as a side effect. This is useful for processes running in the background which do not want to cause lock contention» | L'indice è **condiviso con l'owner**: ogni lettura porta il flag, così la Review non prende `index.lock` sotto le mani di chi lavora |
| 7 | misura diretta, git 2.55.0.windows.3 | `rev-parse --abbrev-ref HEAD` **mente due volte** | `git branch --show-current`. Vedi §3 |
| 8 | [nodejs.org — April 2024 security releases](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2) (CVE-2024-27980, bypass CVE-2024-36138) | «command injection … even if the shell option is not enabled» (Windows, `.bat`/`.cmd`) | Conferma la disciplina: `execFile` con **array**, `shell:false` imposto da `process-policy`, percorsi dopo `--`, `-`/`:` iniziali rifiutati |
| 9 | Ricerca competitiva (Hermes Agent, Nous Research — changelog 2026) | `/diff` mostra «**staged/all/session changes** from any surface» | Conferma la forma di W1-06 (due sorgenti) ed è la **parità**: il nostro `riepilogo` dà lo stesso taglio (staged · nonStaged · nonTracciati · conflitti) |
| 10 | Stato dell'arte agenti+git 2026 (CodePick, *AI Coding Agent Security Guide 2026*; *Git Workflow for AI-Assisted Development 2026*) | «critical operations like **git push must have human eyes on them**»; vincoli espliciti tipo «never commit to main directly» | La regola dell'owner **è** lo stato dell'arte. Il «mai su main» è una **PROPOSTA non implementata**, vedi §6 |

---

## 2. ⛔⛔⛔ IL VINCOLO CHE HA RIBALTATO IL COMMIT

**Il brief diceva: «commit con percorsi espliciti, mai `-A` o `.`».** Giusto —
ma la ricerca 4 dice che quella scelta ha un **prezzo nascosto**, e la misura
lo conferma.

Sonda su repo vero: messo in stage `v1-STAGED`, poi il file cambiato a
`v2-WORKTREE`, poi `git commit -F msg -- a.txt`.

```
contenuto committato di a.txt : "v2-WORKTREE\n"     ← NON quello in stage
altro.txt (staged da un altro): "M  altro.txt"      ← rimasto FUORI e in stage
file toccati dal commit       : a.txt
```

⇒ Due conseguenze **opposte**, ed entrambe contano:

- ⭐ **BUONA** — un percorso esplicito **non trascina** ciò che un'altra
  sessione ha messo in stage. È la cura vera di *«due sessioni, stessa
  cartella, intrecciano i commit»*, e **la garantisce git**, non la mia
  disciplina. Per questo `commit()` non sa nemmeno rappresentare un commit
  senza percorsi.
- ⛔ **CATTIVA** — se il file è cambiato dopo lo stage, finisce nel commit la
  versione **nuova**: cioè **non quella che la Review ha mostrato**. In
  silenzio.

**Decisione:** il prezzo si **dichiara**, non si subisce. `commit()` legge lo
stato prima di agire e **rifiuta per nome** (`GIT_WORKTREE_DIFFERS`, 409) i
percorsi che sono `staged` **e** `nonStaged`, dicendo quali rimettere in stage.
⛔ Nessun flag per forzare: un modo nascosto per fare la cosa sbagliata è
peggio del problema.

---

## 3. IL DISEGNO, E PERCHÉ

**File nuovi:** `harness-ui/src/git-service.mjs` ·
`harness-ui/tests/git-service.test.mjs` · `harness-ui/tests/http-routes-git.test.mjs`
**File toccati:** `harness-ui/src/http-app.mjs` (7 hunk) · `harness-ui/server.mjs` (2 hunk)

### Le cinque porte
`stato` · `ramo` (lettura) — `stage` · `unstage` · `commit` (scrittura).
Rotte: `GET /api/v1/sessions/:id/git/{status,branch}` e
`POST /api/v1/sessions/:id/git/{stage,unstage,commit}`.

⛔ **`ramo` è di sola LETTURA**, deliberatamente: non cambia e non crea rami.
Cambiare ramo in un worktree **condiviso** con l'owner e con altre sessioni
vive sposterebbe il lavoro sotto i piedi di qualcun altro. W1-06 ha bisogno di
*sapere* il ramo, non di cambiarlo. **Se l'owner vuole anche lo switch, è un sì
a parte.**

### Chi decide la cartella
`cartellaDiSessione(sessionId)` — la stessa autorità di `terminal-registry.mjs`
(W1-01): il client **nomina** una sessione, non sceglie mai un percorso. Id
ignoto ⇒ `NOT_FOUND`, **nessun ripiego** sul primo progetto configurato (era il
difetto di `server.mjs:589`).

### Il worktree — premessa VERIFICATA, non presunta
```
.git → FILE, contenuto: gitdir: C:/Users/Antonino/Desktop/projects/AVM/.git/worktrees/AVM-harness-desktop
rev-parse --show-toplevel → C:/Users/Antonino/Desktop/projects/AVM-harness-desktop
```
⇒ **niente** in questo file cerca `.git` come *cartella* per decidere se un
posto è un repository: si chiede a git. Un test crea un worktree vero e ci gira
sopra.

### Un solo vocabolario di percorsi
git risponde sempre **relativo alla radice del repo** («paths shown will always
be relative to the repository root»). La sessione però può essere una
**sottocartella**. ⇒ il servizio riporta tutto a **relativo alla sessione**
togliendo `--show-prefix`, e scarta ciò che non ci sta dentro. Fuori esiste un
solo vocabolario; `percorsoRepo` resta esposto solo per trasparenza.

### Il confine dei repo annidati (W1-13)
Lo tiene **git stesso**, ed è **misurato**: il padre vede `?? annidato/` — la
cartella, mai i file dentro — **anche con `-uall`**. Il servizio non fa niente
per scavalcarlo: lo **dice**, marcando la voce `repoAnnidato:true` con lo
stesso identico test di `workspace-context.repoAnnidati()`
(`existsSync(join(…, '.git'))`).

### `git reset`, non `git restore --staged`
**Misurato**: su un repo **senza nemmeno un commit** `reset -- <percorsi>`
funziona, `restore --staged` no (non c'è un HEAD). Il primo `git add` di un
progetto nuovo è esattamente il momento in cui si vuole poter tornare indietro.

### `branch --show-current`, non `rev-parse --abbrev-ref HEAD` (ricerca 7)
| caso | `rev-parse --abbrev-ref HEAD` | `branch --show-current` |
|---|---|---|
| repo senza commit | **exit 128** (`ambiguous argument 'HEAD'`) | `master` |
| HEAD staccata | `HEAD` ← **sembra un nome di ramo** | `''` ⇒ `ramo:null, staccata:true` |

⛔ **RILIEVO REGISTRATO, NON CORRETTO:** `harness-ui/src/workspace-context.mjs`
(`ramoGit`) usa ancora la forma vecchia, quindi su un repo appena creato
risponde `branch: null` per un motivo sbagliato. **Non è la mia riga** — la
lascio all'owner.

### Il messaggio di commit passa da un FILE
`-F <file temporaneo>` + `--cleanup=whitespace` espliciti, mai `-m`. Su Windows
la riga di comando ha un tetto duro e i messaggi multilinea sono normali;
`--cleanup=default` cambierebbe comportamento a seconda che git creda di dover
aprire un editor. Il file temporaneo è cancellato in `finally`.

### Perché `policy.execFile(encoding:'buffer')` e non `runApprovedProcess`
`runApprovedProcess` accumula l'uscita decodificando **ogni chunk
separatamente** (`process-policy.mjs`, `appendBounded`: `chunk.toString('utf8')`).
Un carattere UTF-8 multibyte a cavallo di due chunk si spezza ⇒ `àccento.txt`
tornerebbe corrotto, cioè proprio la garanzia per cui esiste `-z`. Qui l'uscita
si prende in **Buffer** e si decodifica **una volta sola**. Resta tutto dentro
`process-policy`: eseguibile in elenco, `shell:false`, ambiente filtrato,
`cwdRoot` = la cartella della sessione.
⛔ Il taglio a cavallo su una pipe vera **non è riproducibile a comando**: il
test prova la **causa** (`Buffer.from('à').subarray(0,1).toString('utf8')` dà
`\uFFFD`), e lo dichiara invece di fingere una riproduzione.

### Codici, e status HTTP
`GIT_NOT_A_REPOSITORY` · `GIT_NOTHING_TO_COMMIT` · `GIT_WORKTREE_DIFFERS` → **409**
(famiglia `SESSION_NOT_READY`: la richiesta è legittima, è lo stato a
impedirla) · `GIT_PATH_INVALID` · `GIT_PATHS_REQUIRED` · `GIT_MESSAGE_REQUIRED`
→ **422** · `GIT_STORE_UNAVAILABLE` → **503** · `GIT_TIMEOUT` → **504** ·
`GIT_OUTPUT_TOO_LARGE` → **413** · `GIT_COMMAND_FAILED` → **500**.

---

## 4. I TEST, E IL LORO ROSSO PROVATO

**41 test nuovi** — 28 in `git-service.test.mjs`, 13 in `http-routes-git.test.mjs`.
⛔ Su **repository VERI creati dal test** (`git init`), mai su finzioni.

Un test che passa anche col difetto dentro non prova niente. Ogni cura è stata
**spenta** e il rosso **letto**:

| # | Sabotaggio | Rosso osservato |
|---|---|---|
| 1 | tolto `-z` da `git status` | **11 test su 27 rossi** |
| 2 | rinomina letta al contrario (`da`/`a` scambiati) | 2 rossi |
| 3 | tolto `-- .` dallo status | **0 rossi → vedi §5** |
| 3-bis | idem, dopo la cura | 1 rosso (il pin sugli argomenti) |
| 4 | tolta la guardia `GIT_WORKTREE_DIFFERS` | 1 rosso |
| 5 | tolto il controllo su `:` in `normalizzaPercorso` | 2 rossi (⇒ `--literal-pathspecs` da solo **non basta**: servono entrambe le serrature) |
| 6 | tolto il ritentativo `-uall` sulla cartella collassata | 1 rosso |
| A | **aggiunta davvero una rotta `git/push`** | 1 rosso: *«POST /git/push ha risposto 500: esiste una porta che non deve esistere»* |
| B | accettata qualunque chiave nel corpo POST | 1 rosso |

Dopo ogni sabotaggio il file è stato **ripristinato e verificato identico**
(`diff -q` → identico) e la suite è tornata verde.

⛔ Anche il PIN è stato provato **nei due versi**: riconosce
`git(cartella, ['push', …])` e **non** scambia `voci.push(riga)` per un comando
git. (Prima stesura: il pin era troppo grosso e accusava il proprio
`Array.prototype.push` — corretto, non allentato.)

---

## 5. ⛔⛔ QUELLO CHE IL SABOTAGGIO HA TROVATO ADDOSSO A ME

**Il sabotaggio 3 non ha prodotto nessun rosso.** Cioè: la prima stesura di
questo file affermava in un commento che `-- .` era ciò che impediva ai file
del repository padre di trapelare — **e non era vero**. Il containment lo fa il
**filtro sul prefisso**; `-- .` è una cura di **costo** (senza, git percorre e
riporta l'intero repo padre a ogni aggiornamento della Review, e si avvicina al
tetto di uscita). Il commento è stato **riscritto per dire la verità**, e il
flag è ora pinnato da un test che guarda **gli argomenti passati a git**, non
l'elenco che ne esce.

**E cercando il perché è saltato fuori un difetto vero, mio.** git **collassa**
una cartella interamente non tracciata:

```
da dentro `sessione/`   → ?? sessione/          (prefisso: "sessione/")
percorso − prefisso     → ""                    ← una riga SENZA NOME
con -uall -- .          → ?? sessione/annidato/ | sessione/giu/due.txt | sessione/uno.txt
```

Succede **ogni volta** che si apre una sessione su una cartella nuova dentro un
repo che esiste già — non è un caso limite. La Review avrebbe mostrato una riga
vuota e non stageabile. **Cura**: solo in quel caso si richiede con `-uall`.
⛔ **Misurato**: `-uall` **non** scavalca il confine di W1-13 — il repo annidato
resta una cartella sola. Test + sabotaggio 6 lo pinnano.

> ⭐ La lezione: il sabotaggio non serve solo a validare i test, serve a
> **smentire i propri commenti**. Qui ha fatto entrambe le cose.

---

## 6. I CANCELLI — numeri letti da `EXIT:` del COMANDO

⛔ Letto il codice d'uscita **del comando**, mai una notifica di background
(lezione del 04/09), e il log letto **fino in fondo**, non solo i conteggi.

```
npm run verify:all
EXIT:0
ℹ tests 1684   ℹ pass 1684   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0
Fase 3 verificata: build, contratti, determinismo e laboratorio verdi
```

**Guardia sulla pipeline a pagamento** (il difetto del 04/09, `verify:all` che
apriva Chrome sul 4174 vivo e avviava una sessione vera):
```
grep -cE "4174|Scenario:|EADDRINUSE" verify-all-2.log  →  0
```
⇒ nessuno `Scenario:`, nessun `4174`, **nessuna sessione a pagamento avviata**.
Il server dell'owner sul **4174 (PID 5656)** è rimasto acceso e **non toccato**.

⛔ **Un primo giro era uscito EXIT:1** — `EADDRINUSE 127.0.0.1:4175`, il
`webServer` Playwright del frontend. **Non è una mia regressione**: il backend
era già 1684/1684 in quel giro, la 4175 risultava poi **libera** a `netstat`, e
il solo frontend rilanciato dà `EXIT:0`. Registrato perché è **fragilità nota
di quel cancello** (collisione di porta fra giri), non perché sia stato
nascosto. ⛔ Nessun processo è stato ucciso per farlo passare.

**Non lanciata** la pipeline QA visiva (fuori mandato).

---

## 7. FUORI SCOPE — rispettato

`harness-ui/public/**` **non toccato** (il contratto byte-count/sha256 di
`frontend/tests/contract/legacy-contract-snapshot.test.mjs` è verde dentro
`verify:all`) · `harness-ui/frontend/**` **non toccato** — al momento del commit
9 file lì risultavano modificati **da un'altra sessione**, e sono stati
**lasciati fuori**, aggiungendo i miei cinque file **per nome** dopo un
`git status --short` · `mobile/` e kernel non toccati · nessun `git push`.

---

## 8. PROPOSTE NON AUTORIZZATE — decide l'owner, una alla volta

1. **`ramo` che cambia ramo** (switch/create). Oggi solo lettura, per la
   ragione in §3. Se serve a W1-06, è un sì a parte.
2. **«mai un commit diretto su `main`»** — vincolo che lo stato dell'arte 2026
   dichiara esplicito (ricerca 10). Non implementato: è **politica di
   prodotto**, non una riga tecnica, e il brief non la chiedeva.
3. **`workspace-context.ramoGit`** usa `rev-parse --abbrev-ref HEAD`: su un repo
   senza commit dà `null` per il motivo sbagliato, su HEAD staccata darebbe
   `'HEAD'`. Cura di una riga (`branch --show-current`), **non fatta**: non è
   la mia riga.
4. **Il diff vero e proprio** (contenuto delle modifiche, non solo l'elenco dei
   file). W1-05 chiedeva status/stage/unstage/commit/ramo; se la Review vuole
   mostrare le righe cambiate serve una porta in più.

---

## 9. NON VERIFICATO — dichiarato

- **L'identità del commit presa dal `~/.gitconfig` globale.** I test usano
  identità **locale** al repo usa-e-getta, per essere ermetici. Che
  `HOME`/`USERPROFILE` nell'allowlist bastino a far trovare a git il config
  globale **non è provato da un test** (lo sarebbe solo a costo di dipendere
  dalla macchina di chi lancia la suite). Le due chiavi sono nell'allowlist
  **apposta**, e il motivo è scritto nel codice.
- **Il taglio UTF-8 a cavallo di due chunk su una pipe vera**: non
  riproducibile a comando; provata la **causa**, non l'occorrenza (§3).
- **Repository molto grandi**: `GIT_OUTPUT_TOO_LARGE` (tetto 32 MB) e
  `GIT_TIMEOUT` (15 s lettura / 60 s scrittura) sono implementati e hanno un
  codice ciascuno, ma **non sono stati fatti scattare** su un repo reale di
  quella taglia.
- **Nessuna verifica dal vivo sul 4174**: vietato dal brief. Le prove HTTP
  girano su porte effimere assegnate dal sistema (`listen(0)`).
