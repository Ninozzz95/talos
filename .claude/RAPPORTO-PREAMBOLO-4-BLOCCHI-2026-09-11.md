# BC-07, lotto 2 — il preambolo a QUATTRO BLOCCHI, e il contesto che si APPENDE

**Data:** 11/09/2026 · **Lane:** `lane/harness-desktop` · **Compito:** lotto 2 di 3 del preambolo
(BC-07), approvato dall'owner. Nessun `git` eseguito (né add, né commit, né push). Nessun POST sul
4174, nessun giro col modello.

**Stimatore dichiarato:** `harness-ui/src/costo-elenco.mjs`, `costoDelTesto({metodo:'stimato'})` —
taratura `TARATURA_STIMA` **3,5 byte/token**, misurata il 09/09 su `z-ai/glm-5.3-flash` (3,92
byte/token e 3,64 caratteri/token reali; dividere per 3,5 tiene la stima ~12% SOPRA il vero). È lo
**stesso** stimatore che il prodotto usa. ⛔ **I token sono una STIMA; i byte e i caratteri sono
contati.** Il contatore vero interroga il fornitore, cioè sarebbe una chiamata pagata.

---

## 1. MISURA PRIMA — il preambolo di oggi, per blocco, su quattro spazi veri

| spazio di lavoro | blocco 1 (kernel) | elenco dei file | percorsi | troncato |
|---|---|---|---|---|
| `harness-ui/` | 97 tok | **7.327 tok** · 25.427 car | 693 → 699 | no |
| `AVM/mobile` | 97 tok | **17.149 tok** · 60.008 car | 1.500 | ⚠ **SÌ** (l'albero ne ha 1.842+) |
| repo intero `AVM-harness-desktop` | 97 tok | **19.866 tok** | 1.500 | ⚠ **SÌ** (l'albero ne ha 12.715) |
| `TALOS-PAROLA` (piccolo) | 97 tok | **85 tok** · 290 car | 10 | no |

⛔ Il blocco 1 misurato è **97 token**, non 84: il rapporto del preambolo dichiarava 84 con un
rapporto carattere/token diverso. Il testo di `ISTRUZIONI` non è cambiato (337 caratteri); è cambiato
il metro. Lo scrivo perché due numeri diversi per la stessa cosa, senza il metro accanto, sono
esattamente il difetto che `costo-elenco.mjs` esiste per non fare.

⛔ E il blocco 3 valeva **ZERO byte**: `AGENTS.md`/`CLAUDE.md` non entravano nel prompt in nessuno
dei quattro spazi. Sia questo repo sia `AVM/mobile` **hanno** un `AGENTS.md` vero, che il modello
non ha mai letto.

---

## 2. LE FONTI — data, citazione verbatim, e la MISURA che ognuna porta

⛔ **Quasi-incidente dichiarato, prima delle fonti.** Il budget di `WebSearch` di questa sessione era
già **esaurito (200/200)** al primo tentativo. Ho quindi usato `WebFetch` **diretto sulle fonti
primarie** (documentazione del fornitore e specifica), che è una fonte migliore di un risultato di
ricerca, ma **non ho potuto fare scoperta**: se in agosto-settembre 2026 è uscito un lavoro che non
conoscevo per nome, non l'ho visto. Verifica negativa fatta: l'indice di
<https://www.anthropic.com/engineering> (letto 11/09/2026) **non ha nessun post di luglio, agosto o
settembre 2026** su context engineering, prompt caching o coding agent — l'ultimo pertinente resta
quello del 29/09/2025. Quindi la parte «ultimo mese o due» della ricerca è, su quella fonte, **vuota
per davvero**, non per pigrizia mia.

### 2.1 Claude Platform Docs, «Prompt caching» — letto 11/09/2026
<https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching>

- Verbatim: *«Cache hits require 100% identical prompt segments»*.
- Verbatim: *«Prompt caching references the entire prompt — `tools`, `system`, and `messages` (in
  that order) up to and including the block designated with `cache_control`»*, e *«The cache lookup
  operates on the full prefix up to the breakpoint, not individual blocks»*.
- **Misura:** i minimi cacheabili sono **per modello e in token sul PROMPT**: 512 (Fable 5.1 /
  Mythos 5.1 / Opus 5 / Fable 5 / Mythos 5) · 1.024 (Sonnet 5 / 4.6 / 4.5, Opus 4.8 / 4.1 / 4) ·
  2.048 (Haiku 3.5, Opus 4.7) · **4.096** (Opus 4.6 / 4.5, Haiku 4.5).
- **Misura:** al massimo **4 breakpoint**, finestra di lookback **20 blocchi**; TTL 5 min = **1,25×**
  in scrittura, 1 h = **2×**, lettura **0,1×**.
- ⇒ **È la fonte che ha trovato un bug nel nostro codice.** Vedi §3.4.

### 2.2 OpenRouter, «Prompt caching» — letto 11/09/2026
<https://openrouter.ai/docs/features/prompt-caching>

- **Misura:** minimi per fornitore — Anthropic 4.096 (Opus 4.5-4.8, Haiku 4.5) / 2.048 (Haiku 3.5) /
  1.024 (Sonnet 4.5-4.6, Opus 4.1); OpenAI 1.024; Gemini 2.5 Pro 4.096, Flash 1.024; DeepSeek e Grok
  nessun minimo dichiarato.
- **Misura:** marcatori **automatici** (nessun `cache_control` necessario) per OpenAI, DeepSeek,
  Grok, Moonshot, Groq, **Z.AI** e Gemini 2.5 implicito; **espliciti** per Anthropic, Qwen/Alibaba e
  Gemini esplicito. I token da cache si leggono da `prompt_tokens_details.cached_tokens`.
- ⇒ Combacia con l'A/B dell'11/09 sera (0 hit su `z-ai/glm-5.3-flash` **anche** col marcatore): su
  Z.AI il marcatore non serve perché la cache è automatica, e i nostri 0 hit vengono da altro.
  **Il marcatore resta per i modelli che lo onorano; la leva certa resta il peso del preambolo.**

### 2.3 Anthropic, «Effective context engineering for AI agents» — pubblicato 29/09/2025, letto 11/09/2026
<https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>

- Verbatim, il principio: *«find the smallest set of high-signal tokens that maximize the likelihood
  of your desired outcome»*.
- Verbatim, il «just in time»: *«agents built with the "just in time" approach maintain lightweight
  identifiers (file paths, stored queries, web links, etc.)»* — **ma con il prezzo dichiarato**:
  *«there's a trade-off: runtime exploration is slower than retrieving pre-computed data»*.
- Verbatim, la strategia che raccomandano: *«the most effective agents might employ a hybrid
  strategy, retrieving some data up front for speed, and pursuing further autonomous exploration at
  its discretion»*.
- ⭐ Verbatim, la riga che giustifica il blocco 4 meglio di qualunque mia argomentazione:
  *«**Folder hierarchies**, naming conventions, and timestamps all provide important signals that
  help both humans and agents understand how and when to utilize information.»*

### 2.4 Chroma, «Context Rot» — pubblicato 14/07/2025, letto 11/09/2026
<https://www.trychroma.com/research/context-rot>

- **Misura:** **18 modelli** di frontiera (GPT-4.1, Claude 4, Gemini 2.5, Qwen3). *«a single
  distractor reduces performance relative to the baseline (needle only)»*, e l'effetto **cresce con
  la lunghezza dell'input**.
- ⇒ I 17.000 token di elenco troncato non erano solo un costo: erano **distrattori misurati**.

### 2.5 Specifica AGENTS.md — letta 11/09/2026
<https://agents.md/>

- Verbatim: *«Place another AGENTS.md inside each package. Agents automatically read the nearest file
  in the directory tree, so the closest one takes precedence.»*
- **Misura:** *«used by over 60k open-source projects»*; il repo di OpenAI ne contiene **88**.
- ⛔ **Verifica negativa, e conta:** la specifica **non dichiara nessun tetto di byte**. Il tetto è
  una scelta di ogni harness — e tutti e quattro i concorrenti ne hanno uno (Codex 32 KiB, dsh
  65.536, Hermes 20.000 caratteri, Claude Code 200 righe / 25.000 byte). Chi non ce l'ha, prima o poi
  manda in contesto un file da 200 KB.

### 2.6 Le fonti nel CODICE dei concorrenti
Restano quelle del rapporto del lotto 0
(`.claude/RAPPORTO-PREAMBOLO-CONCORRENTI-2026-09-11.md`), lette a commit fissato. Quelle che ho
effettivamente **importato** sono citate verbatim dentro i moduli: il «workspace snapshot» di Hermes
(`agent/coding_context.py:836-932` e `:31-38`), il `REPLACEMENT_NOTICE` di Codex
(`world_state/agents_md.rs:9-11`), il confronto per uguaglianza secca di Claude Code 2.1.268
(`N$t`), e la politica di budget di dsh (*«drops whole broader files before truncating the
most-specific file»*).

---

## 3. COSA CAMBIA — file:riga

### 3.1 `harness-ui/src/mappa-cartelle.mjs` — NUOVO, 348 righe · **blocco 4**
- `costruisciMappaCartelle()` (`:125`) — cammina l'albero in **ampiezza** e restituisce **solo le
  cartelle**, con quanti file contiene ognuna (i propri, non quelli dei figli). Stessa lista di
  potatura di `elenco-profondo.mjs` (importata, non copiata: due potature diverse per lo stesso
  albero darebbero al modello una mappa che non combacia con ciò che `cerca` trova).
- `confrontaCartelle()` (`:265`) — ordine totale, per unità di codice, **mai `localeCompare`**; un
  genitore precede sempre i suoi figli. La camminata è in ampiezza ma il **testo è un albero
  indentato**, quindi il riordino è obbligatorio o l'indentazione mentirebbe.
- `testoMappaCartelle()` (`:270`) — nomi **indentati**, non percorsi interi (misurato: il percorso
  intero ripete il prefisso del genitore su ogni riga e costa il 35-45% in più). Nell'intestazione
  va il **nome** della cartella, mai il percorso assoluto.
- `mappaEntroIlTetto()` (`:329`) + `TETTO_TOKEN_MAPPA_PREDEFINITO = 4000` (`:318`) — **il tetto è in
  TOKEN, non in cartelle**, e il taglio è **in profondità**. Vedi §5.1: senza questo, il caso
  peggiore peggiorava.

### 3.2 `harness-ui/src/istruzioni-di-progetto.mjs` — NUOVO, 272 righe · **blocco 3**
- `TETTO_BYTE_PREDEFINITO = 24_000` (`:79`) — dichiarato, argomentabile, fra Hermes (20.000 car) e
  Codex (32 KiB). A 3,5 byte/token sono ~6.900 token.
- `trovaRadiceProgetto()` (`:96`) — risale al primo `.git`, riconosciuto con `stat` **senza
  distinguere directory da file** (un worktree ha `.git` FILE — è il caso di oggi su questo repo).
- `trovaIstruzioniDiProgetto()` (`:119`) — catena dalla radice del progetto al cwd, candidati
  `AGENTS.md` poi `CLAUDE.md`, **un solo file per cartella**, dal più generico al più specifico.
- `tagliaIstruzioni()` (`:164`) — testa 70% / coda 20%, taglio **sui byte** (un carattere accentato
  ne vale 2: contare caratteri farebbe sforare il tetto proprio sui testi italiani), ritaglio
  all'a-capo, e un marcatore che dice **quanti byte mancano** e **con quale attrezzo** leggere il
  file intero.
- `testoIstruzioniDiProgetto()` (`:191`) — la politica di dsh: i file più **generici** entrano
  **interi o niente**; solo il più **specifico** può essere tagliato (`:227`); gli omessi si
  dichiarano **per nome**. Se non c'è nessuna istruzione, ritorna `null` — **zero byte**, nessuna
  intestazione vuota.

### 3.3 `harness-ui/src/scheda-di-lavoro.mjs` — NUOVO, 244 righe · **blocco 2**
- `fattiDelProgetto()` (`:76`) — manifesti, gestore di pacchetti dal lockfile, e i **comandi di
  verifica**: la riga a segnale più alto della scheda, presa da Hermes.
- `testoSchedaDiLavoro()` (`:122`) — cartella (solo il **nome**), git a **conteggi**, ultimi 3
  commit (soggetto tagliato a 72 caratteri), manifesti, verifica, **permesso del giro**, **modello**,
  piattaforma. Prima riga: *«fotografia scattata all'inizio della sessione. Lo stato di git
  INVECCHIA mentre lavori»* — lo stesso patto che Hermes dichiara nel proprio codice.
- `schedaDiLavoro()` (`:174`) — le sonde girano **in parallelo** (tre `spawn` di git + una manciata
  di `stat`); `statoVolatile:false` toglie la sola parte che si muove senza che nessuno abbia
  cambiato cartella/permesso/modello, **per l'A/B**.
- `ultimiCommit()` (`:220`) — `git log -3 --pretty=%h %s`, timeout 4 s, mai `throw`.

### 3.4 `harness-ui/src/contesto-del-progetto.mjs` — RISCRITTO, 338 righe · **il compositore**
- `contestoDelProgetto()` (`:129`) — compone i blocchi 2, 3, 4; i tre si costruiscono **in
  parallelo**. Chiave della cache: **`cartella|permesso|modello`** (`:93`) — le tre cose che entrano
  nel testo e che possono cambiare senza che il disco cambi.
- `filtroGitignore()` (`:233`) — il `catch` che degrada dice **quale** guasto copre e **rilancia**
  gli errori di contratto (`ERR_INVALID_ARG_TYPE`/`TypeError`). È il bug del 10/09, tenuto chiuso.
- `aggiornamentoInCoda()` (`:285`) e `preamboloVistoDa()` (`:302`) — **il contesto che si appende.**
  Senza nessuno stato in memoria: si legge dalla conversazione salvata cosa il modello ha davvero
  davanti, e si appende solo se è cambiato. Marcatori `INIZIO_SCHEDA` / `INIZIO_AGGIORNAMENTO`
  (`:109-110`) — frasi che il modello legge, non sentinelle tecniche.
- `segnalaFileCambiati()` (`:323`) — invalida **tutte** le chiavi di quella cartella (tutti i
  permessi, tutti i modelli): i file sono cambiati per tutte.

### 3.5 `harness-ui/src/agent-service.mjs` — AGGANCIO
- `:37` import di `aggiornamentoInCoda`; `:405` parametro iniettabile `aggiornamentoInCodaFn`.
- `:577` la chiamata passa ora **`permesso: permessi`**, **`modello`**, **`piattaforma`**. ⛔ È
  l'**etichetta già calcolata per `RunStarted.contesto`** (02/09), la stessa che la persona vede
  nella pillola: due nomi diversi per lo stesso permesso — uno a schermo e uno nel prompt — sarebbero
  due verità da tenere allineate a mano.
- `:613` su un **seguito** (`messaggiIniziali` pieno) il preambolo nuovo si **appende in coda**
  dichiarando che sostituisce; se non è cambiato niente, non si appende niente.
- ⛔ **Il punto dell'aggancio non è cambiato:** resta **dopo `RunStarted`** (sincrono) e **prima di
  `talosLavoraFn`**, dove già vivono MCP, Skills e Plugin. La riga ~2245 di `session-registry.mjs`
  dice perché quella catena è sincrona; non l'ho toccata, e `session-registry.mjs` non ha una riga
  modificata.

### 3.6 `harness-ui/src/kernel/talosHarness.mjs` — **UN SOLO cambiamento**, e l'ha trovato la ricerca
`conMarcatoreDiCache` (`:1068-1076`) misurava la lunghezza del **solo blocco marcato** e la
confrontava con un minimo che i fornitori dichiarano **sul prompt intero** (§2.1). Ora somma il
**prefisso** fino al blocco marcato.

⛔ **La soglia NON è stata abbassata:** `CARATTERI_MINIMI_PER_CACHE` resta **16.000** (≈4.096 token a
3,9 byte/token, il minimo più alto documentato). È cambiato **cosa** si misura. Perché conta: il
preambolo nuovo di `harness-ui/` sta in **13.744 byte** contro i 66.523 del vecchio — con la vecchia
misura **il marcatore sarebbe sparito da solo, in silenzio**, proprio mentre il prefisso totale
(attrezzi + istruzioni + preambolo) resta molte volte sopra il minimo. Una cura che ne disarma
un'altra senza dirlo.
⭐ La somma copre i soli **messaggi**: gli attrezzi non arrivano in quella funzione, e la loro
definizione JSON è la parte più pesante del prefisso. Quindi il numero è un **pavimento** del
prefisso vero — sbaglia nel verso prudente.
⛔ **Non ho toccato `cerca`** (lotto 1, altro agente) né `frontend/`. Nel frattempo il lotto 1 ha
committato `bd71a440 fix(kernel): cerca vede tutto — via la allowlist di estensioni`: nessun
conflitto, aree disgiunte.

### 3.7 Prove
`harness-ui/tests/preambolo-quattro-blocchi.test.mjs` — NUOVO, **30 prove**, tutte verdi.
`harness-ui/tests/contesto-del-progetto.test.mjs:118-121` — una riga aggiornata (`percorsi` non
esiste più: si guarda la mappa). Intento della prova invariato.

---

## 4. MISURA DOPO — stessi spazi, per blocco

| spazio di lavoro | PRIMA (b1+elenco) | b2 scheda | b3 istruzioni | b4 mappa | **DOPO (b1..b4)** | **delta** |
|---|---|---|---|---|---|---|
| `harness-ui/` | 7.424 | 212 | 3.385 | 358 | **4.052** | **−45,4%** |
| `AVM/mobile` | 17.246 ⚠tronc | 246 | 3.216 | 3.937 | **7.496** | **−56,5%** |
| repo intero `AVM-harness-desktop` | 19.963 ⚠tronc | 183 | 3.385 | 3.545 | **7.210** | **−63,9%** |
| `TALOS-PAROLA` (piccolo) | 182 | 100 | 0 | 95 | **292** | **+60,4%** |

**E il DOPO contiene qualcosa che il PRIMA non aveva:** 3.385 e 3.216 token di **istruzioni di
progetto vere** che il modello non ha mai letto. Tolto il blocco 3 — cioè a parità di *tipo* di
contenuto — il preambolo scende a **667 token** su `harness-ui/` (**−91%**) e **4.280** su
`AVM/mobile` (**−75%**).

**Onestà sul caso piccolo:** su `TALOS-PAROLA` il preambolo **cresce**, da 182 a 292 token. In
assoluto sono 110 token, cioè rumore; e ciò che si compra sono il ramo git, il permesso, il modello e
i comandi di verifica, che l'elenco dei file non diceva. Ma è un **peggioramento vero** e va scritto:
la cura è tarata sui progetti grandi, dove il problema esiste.

**Copertura, che è il punto più importante di tutti:**

| spazio | elenco di OGGI | mappa di ADESSO |
|---|---|---|
| `AVM/mobile` | 1.500 percorsi su 1.842+ — **troncato**, e il testo diceva al modello di non fidarsi | **582 cartelle, 5.325 file, albero COMPLETO** |
| repo intero | 1.500 percorsi su 12.715 — **il 12%** | **555 cartelle rese su 2.000 camminate**, taglio in profondità **dichiarato** |

**Costo di costruzione** (misurato, media di più corse): `harness-ui/` **250 ms** a freddo ·
`AVM/mobile` **689 ms** · repo intero **3.591 ms** · piccolo **27 ms**. **0 ms a caldo** in tutti e
quattro (la cache per `cartella|permesso|modello`). ⛔ I 3,6 s del repo intero sono **peggio** dei
324 ms dell'elenco di prima, e sono pagati **una volta per sessione**, dopo `RunStarted`: vedi §7.

---

## 5. I DUE BUG CHE LE PROVE AL VERSO CONTRARIO HANNO TROVATO, e uno che ha trovato il testo

### 5.1 ⛔ La mappa, col solo tetto sulle cartelle, PEGGIORAVA il caso peggiore
Prima versione: tetto a **2.000 cartelle**. Misurato sul repo intero (12.715 file, worktree e
`scratchpad/prove` compresi): mappa da **17.966 token**, preambolo totale **21.649** contro i 19.963
di prima — cioè **+8,4%**. *Una cura che peggiora il caso peggiore non è una cura.*
**Cura:** `mappaEntroIlTetto()` — il tetto è in **token** (4.000) e si taglia **in profondità** finché
non entra, filtrando le cartelle già raccolte (**senza ricamminare**: sul repo intero la camminata
costa 3,6 s, e rifarla quattro volte sarebbe 14 s prima del primo token). Esito: **7.210 token,
−63,9%**.
Il taglio in profondità ha una proprietà che il taglio alfabetico non ha: ciò che resta è **vero e
chiuso** («fin qui l'albero è tutto, sotto non l'ho guardato»), non «vero a metà».

### 5.2 ⛔ Il tetto sulle cartelle, quando mordeva alla radice, produceva una mappa VUOTA
Il `break` era anche sul ciclo esterno: con il tetto raggiunto alla radice usciva una mappa **senza
nemmeno una cartella**, che `testoMappaCartelle` poi dichiarava *«nessuna sottocartella»*. Cioè, per
colpa della guardia contro l'eccesso, **la bugia esatta che il modulo esiste per non dire**.
**Cura:** il tetto smette di **accodare**, non di **camminare**: chi è già in coda si finisce di
visitare. Prova: *«se il tetto sulle cartelle morde, il testo lo DICHIARA in testa e in coda»*.

### 5.3 ⛔ Un `AGENTS.md` generico entrava a MONCONE (518 byte su 9 KB) invece di essere omesso
Con due file di ~9 KB e un tetto di 10.000, il più specifico prendeva il suo spazio e al generico
restavano 518 byte — un moncone che al modello **sembra il file**. Stessa categoria di bugia del
taglio silenzioso, solo più subdola: il marcatore c'era e diceva il vero su un contenuto inutile.
**Cura:** solo il **più specifico** si taglia; i generici entrano **interi o non entrano** — che è
alla lettera la politica di dsh. E lo spazio dell'avviso «non ti ho mostrato X» si **riserva prima**
di distribuire il budget, o il tetto verrebbe sforato proprio dalla riga che dichiara il taglio.

### 5.4 ⛔ La riga «Verifica» NON USCIVA su questo repo — e non l'ha trovata un test, l'ha trovata la lettura del testo vero
Cercavo i nomi **esatti** (`test`, `lint`, `build`…); gli script di `harness-ui` si chiamano
`verify:all`, `verify:ui`, `test:kernel`. Risultato: **la riga a segnale più alto della scheda —
quella che risponde da sola a «ho finito?», e che Hermes cita come la ragione d'essere dei suoi
"project facts" — spariva in silenzio proprio sul progetto su cui stavo misurando la cura**, e ogni
misura del blocco 2 era di conseguenza troppo bassa.
**Cura:** si guarda anche il **prefisso** (`verify:`), con ordine deterministico due volte (priorità
della parola, poi nome per unità di codice), perché la chiave della cache è il testo.
⇒ Vale come lezione generale: **un modulo che compone testo si prova anche LEGGENDO il testo che
produce sul dato vero.** Le 26 prove verdi non se ne erano accorte.

### 5.5 Tolta una riga che poteva CONTRADDIRE il blocco 3
La scheda diceva «Istruzioni di progetto presenti: …» guardando **solo il cwd**, mentre il blocco 3
raccoglie la catena dalla **radice del progetto**: su `harness-ui/` la scheda avrebbe detto «nessuna»
mentre due righe sotto c'era l'`AGENTS.md` della radice, per intero. Due verità diverse sulla stessa
cosa nello stesso testo sono peggio di una sola incompleta.

---

## 6. LA PROVA DEL PREFISSO STABILE

### 6.1 Nelle prove automatiche (`tests/preambolo-quattro-blocchi.test.mjs`, 30 verdi)
- *«due messaggi consecutivi della stessa sessione ricevono il preambolo BYTE-IDENTICO»* —
  `Buffer.compare(...) === 0`, non `assert.equal` fra stringhe.
- cambia il **permesso** → testo diverso, e **due voci di cache distinte** (due sessioni con permessi
  diversi sulla stessa cartella non si rubano il preambolo);
- cambia il **modello** → testo diverso; cambia la **cartella** → testo diverso;
- `segnalaFileCambiati` invalida **tutti** i permessi, non solo uno;
- *«una mappa che sta già nel tetto non viene toccata»* — uguaglianza di stringa esatta con la resa
  non filtrata: il tetto non deve spostare un byte quando non morde.

### 6.2 Sul DATO VERO (`harness-ui/` e `AVM/mobile`), 12 controlli ciascuno — **tutti verdi**
```
=== harness-ui/ (dato VERO) ===              === AVM/mobile (dato VERO) ===
 OK  PREFISSO BYTE-IDENTICO fra due messaggi consecutivi
 OK  il secondo giro riusa la cache
 OK  nessun percorso assoluto/nome persona nel testo
 OK  il .gitignore morde: 52 contro 510      OK  il .gitignore morde: 582 contro 691
 OK  creaFiltroGitignore(stringa) RILANCIA invece di degradare
 OK  un .gitignore illeggibile degrada in silenzio, non azzera il preambolo
 OK  cambiare permesso cambia il preambolo
 OK  tornare al permesso di prima ridà lo stesso identico preambolo
 OK  preambolo invariato -> niente in coda (0 token)
 OK  preambolo cambiato -> messaggio di sostituzione in coda
 OK  IL PREFISSO NON E STATO TOCCATO
```
⛔ I **due contratti** del 10/09 provati **sul dato vero**, non sulle fixture: `creaFiltroGitignore`
chiamata con la stringa nuda **rilancia** `ERR_INVALID_ARG_TYPE` su entrambi gli spazi; un
`.gitignore` illeggibile degrada in silenzio e la mappa esce lo stesso.

### 6.3 Che cosa la stabilità significa davvero, oggi
Il kernel inserisce il preambolo **solo su sessione fresca** (`!messaggiIniziali`); su un seguito la
conversazione salvata porta già il prefisso e il kernel **lo ignora**. ⇒ **Dentro una sessione il
prefisso era già stabile prima di questa cura**: quello che cambia adesso è (a) che pesa il 45-64% in
meno, (b) che quando qualcosa cambia davvero **si appende** invece di non arrivare affatto, e (c) che
fra **sessioni diverse sulla stessa cartella** il testo è ora identico a parità di permesso e
modello, cosa che con l'elenco troncato non era garantita.
⛔ **Correzione onesta al brief:** la frase «il preambolo viene riscritto a ogni messaggio» non
l'ho potuta confermare nel codice — per i seguiti dentro una sessione non è così. Gli 0 hit di cache
misurati sull'A/B di ieri restano spiegati dal fornitore (§2.2), non da un prefisso instabile.

---

## 7. LE PROVE — e cosa NON è mio

- **Suite mirata durante:** `preambolo-quattro-blocchi` (30) · `contesto-del-progetto` (11) ·
  `p13-elenco-al-modello` (4) · `elenco-profondo` · `gitignore-elenco` · `costo-elenco` ·
  `workspace-info` · `cache-del-prompt-si-chiede` (3) · `agent-service` + `session-registry` +
  `http-routes-sessions` (**645**). Tutte verdi.
- **Suite completa, UNA volta alla fine:** `node --test tests/*.test.mjs` → **2.323 test, 2.323
  pass, 0 fail**. (Erano 2.276 nel brief; +30 miei, il resto è arrivato dagli altri lotti.)
- **Kernel:** `node --test src/kernel/talosHarness.test.mjs` → **558 test, 555 pass, 3 fail**. I tre
  rossi sono **preesistenti e non miei**, e nessuno tocca `conMarcatoreDiCache`:
  `⛔ un uscita lunga tiene testa E coda, e DICHIARA quanto ha tolto` · `⭐⭐⭐ toglie
  OPENROUTER_API_KEY, preserva tutto il resto` · `⛔⛔ AL CONTRARIO — senza la credenziale mai
  impostata…`. Le tre prove del marcatore di cache esistenti restano verdi.

---

## 8. COSA NON HO VERIFICATO — e i quasi-incidenti

1. ⛔ **Nessun giro col modello.** Tutti i token sono **stime**; i byte sono contati. Non so se il
   modello **lavora meglio** col preambolo nuovo: lo deve dire l'A/B del §9 del rapporto del lotto 0,
   e finché non lo dice questa resta una cura sul costo, non sulla qualità.
2. ⛔ **Il quasi-incidente principale: il budget di `WebSearch` era esaurito (200/200) prima che
   cominciassi.** Ho ripiegato su `WebFetch` diretto alle fonti primarie — che è una fonte migliore —
   ma **senza poter fare scoperta**. Se esiste un lavoro di agosto-settembre 2026 che non conoscevo
   per nome, non l'ho visto. L'indice di Anthropic Engineering, controllato, non ne ha.
3. ⛔ **Secondo quasi-incidente, tre volte in un'ora: le patch via script si sono mangiate gli
   apostrofi e gli a-capo** (`c\'è` → `c'è`, `split('\n')` spezzato a metà riga), rompendo la
   sintassi del file di prova. È alla lettera [[string-replace-mangia-i-dollari]] del 02/09, che è
   già in memoria. Nessun danno (il `node --check` e il runner l'hanno preso subito), ma è tempo
   perso per una lezione già scritta. ⇒ Per il testo con apostrofi: `Edit` diretto, o Python su file,
   mai una stringa che attraversa bash.
4. ⛔ **Il costo di costruzione sul repo intero peggiora: 3,6 s contro 324 ms.** È pagato una volta
   per sessione, dopo `RunStarted` (la persona vede già la chat aperta) e 0 ms per i giri successivi.
   **Ma non l'ho misurato sul percorso vivo del 4174**, solo dal modulo. E su uno spazio patologico
   (la scrivania dell'owner) non l'ho misurato affatto: è lo stesso buco già dichiarato nel §10.7 del
   rapporto del lotto 0.
5. ⛔ **`third_party/` è il 51% della mappa di `AVM/mobile`** (298 cartelle su 582). È codice
   vendorato, e `elenco-profondo.mjs` argomenta a lungo perché una potatura non sia una legge
   (`vendor/` di Go è sorgente). **Non ho deciso io:** `escludiCartelle` è un argomento e la decisione
   è dell'owner. Stessa cosa per `scratchpad/prove` (8.635 file non ignorati da git, §10.8 del lotto 0).
6. ⛔ **`elenco-profondo.mjs` non è più nel percorso del preambolo** — lo usa solo `mappa-cartelle.mjs`
   (per la lista di potatura) e le sue prove. **Non l'ho tolto di proposito:** è il **braccio A** (di
   controllo) dell'A/B del §9. Toglierlo renderebbe il confronto impossibile.
7. ⛔ **Lo stato di git nella scheda invecchia** dentro la sessione. Lo dichiaro nel testo (come
   Hermes), e `statoVolatile:false` esiste per misurare quanto costa tenerlo — **ma non ho misurato
   quella variante su una corsa vera**.
8. ⛔ **La catena `AGENTS.md` la prendo dalla radice del progetto in giù, e la radice è il primo
   `.git`.** In questo worktree funziona (provato). In un monorepo senza `.git` intermedi la catena è
   corta di proposito; in uno con submodule non l'ho provato.
9. ⛔ **Il messaggio appeso in coda non è persistito separatamente:** entra nella storia della
   sessione solo quando il giro finisce e `messaggiFinali` viene salvato. Se il giro muore a metà, al
   seguito successivo l'aggiornamento viene ricalcolato e riappeso. È il comportamento giusto, ma
   **non l'ho provato su una sessione vera interrotta**.
10. ⛔ **Non ho toccato la regola del banco** (§8 del lotto 0): senza `tokenPrimoGiro` e `giriUsati`
    come colonne, **questa cura resta invisibile al banco**. È il lotto 3, non il mio.

---

### Riepilogo veloce

**Cosa devi fare tu** — tre scelte secche: **(1)** `third_party/` (298 cartelle, il 51% della mappa di
`AVM/mobile`) e `scratchpad/prove` restano nella mappa, o si potano? **(2)** il tetto del blocco 3 è
24.000 byte (~6.900 token): va bene, o lo vuoi più basso visto che è la voce più cara del preambolo
nuovo? **(3)** do il via all'A/B del §9 (braccio A = elenco di oggi, braccio B = questi 4 blocchi),
o si aspetta il lotto 3 (colonne del banco)?

**Cosa faccio io** — niente altro su BC-07 senza un tuo sì: il lotto 2 è chiuso, suite completa verde
(2.323/2.323), nessun `git` eseguito.

**Cosa rimane** — il costo di costruzione sul repo intero (3,6 s, non misurato sul 4174 vivo né su
uno spazio patologico); lo stato di git che invecchia (leva `statoVolatile` pronta, mai misurata su
una corsa vera); `elenco-profondo.mjs` tenuto apposta come braccio di controllo; l'aggiornamento in
coda non provato su una sessione interrotta a metà; e **nessuna prova che il pass-rate non cali** —
quella la dà solo il banco.
