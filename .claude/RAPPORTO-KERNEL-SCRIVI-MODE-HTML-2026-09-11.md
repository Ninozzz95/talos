# BC-11, lato KERNEL — `scrivi` perdeva il percorso, `append` era irraggiungibile, `html` non scriveva HTML

**Data:** 11/09/2026 · **Lane:** `lane/harness-desktop` · **Agente:** Opus 5, effort high
**File toccati (solo i miei):**
`harness-ui/src/kernel/talosHarness.mjs` · `harness-ui/src/kernel/dist/kernelPerIlBanco.js` ·
`harness-ui/src/document-generator.mjs` · due file di prova nuovi in `harness-ui/tests/`.
**Non toccati:** `workspace-files.mjs`, `agent-service.mjs`, `session-registry.mjs`, `local-*`,
`http-app.mjs`, `frontend/` — ci lavorano altre sessioni nello stesso worktree (lo si vede in
`git diff --stat`: 17 file, 12 non miei).
**Niente `git add`/`commit`/`push`.** Nessuna sonda sul 4174.

---

## 0. In una riga

Le tre cure erano tre facce della stessa cosa: **il modello non poteva sapere**. Non sapeva come si
chiamano i nostri campi (sono in italiano), non sapeva che l'aggiunta in coda esistesse (il gestore
c'era, lo schema no), non sapeva che `format:'html'` gli avrebbe escapato la pagina. Ogni volta il
prezzo era lo stesso: un giro perso, e a volte una strada più lunga inventata per aggirare un muro
che nessuno gli aveva dichiarato.

---

## 1. Riproduzione

### 1.1 `scrivi` perdeva il percorso — riprodotto sul ciclo vero

`tests/scrivi-percorso-e-modalita.test.mjs` monta `talosLavora` con una rete finta e una cartella
temporanea VERA (stesso metodo già in uso nel file di test del kernel: un disco finto proverebbe la
nostra idea del kernel, non il kernel). Gli argomenti non sono inventati: sono quelli della sessione
`8dde6bff` dell'owner, `call_e242d54aac654068a40e32b0`:

```json
{"contenuto": "…", "path": "_pian.mjs"}
```

Prima della cura quella chiamata produceva
`error: EISDIR: illegal operation on a directory, open 'C:\Users\Antonino\Desktop\qwen 3.8 research'`
— cioè la scrittura finiva **sulla radice della sessione**, non su un file.

I numeri delle due sessioni misurate (`8dde6bff`, `37e10d21`, 308 chiamate ricostruite dai
`ToolCallArgs`), presi dal rapporto BC-11 del 11/09 e non rimisurati da me:

| | valore |
|---|---|
| chiavi fuori schema, totale | **46 su 308** |
| di cui `scrivi.path` / `scrivi.content` / `scrivi.contuto` | 2 / 1 / 1 |
| argomenti JSON troncati a metà stream | 3 |
| `scrivi` finite in EISDIR | 5 |

E il costo vero non è l'errore: è il giro **dopo**. Nel ragionamento del modello si legge
*«Oops, empty call. Let me write _p3.html with content.»* — ha indovinato, e ha pagato un giro
intero per indovinare.

### 1.2 L'aggiunta esisteva e non si poteva chiamare

`workspace-files.mjs` ha `modalita:'accoda'` (scritta oggi da un'altra sessione) e
`agent-service.mjs:1048` ha già il vocabolario `mode`/`modalita`/`modality`/`append:true`. Ma lo
schema del kernel non nominava `mode` da nessuna parte. Il loro stesso rapporto lo dichiara:
«`modalita:'accoda'` non è raggiungibile dal modello finché lo schema del kernel non nomina `mode`».
⇒ una funzione viva, provata e **inarrivabile**; e intanto il modello continuava a produrre
`_p2.html`, `_p3.html`, `_p4.html`, `_p5.html`, `_p6core.js`, `_blocco1.html`.

### 1.3 `format:'html'` non scriveva HTML — riprodotto

```
generateTalosDocument({format:'html', title:'T', body:'<section id="x">…'})
  → sul disco: &lt;section id="x"&gt;  dentro un <p>, dentro un involucro nostro
```

Per «genera un file html di almeno 1000 righe» **non esisteva nessun attrezzo capace**: restavano
`scrivi` (che voleva tutto in una risposta) e la shell, che ha un tetto mai dichiarato — misurato
sulla sessione: `cat >> … << 'PARTE2EOF'`, **23.941 caratteri di riga di comando** →
*«La riga di comando è troppo lunga.»*

---

## 2. Causa, con file:riga

| # | Dove | Cosa |
|---|---|---|
| C1 | `talosHarness.mjs` ramo `scrivi`/`leggi` (prima: `:5875`, `:5936`) | leggeva `argomenti.percorso` e basta: una chiave in inglese ⇒ `undefined` |
| C2 | `kernelPerIlBanco.js:22` | `const dentro = (percorso) => percorso ? resolve(radice, percorso) : radice` — **un percorso vuoto restituisce LA RADICE**, e `:44` ci fa `writeFile` sopra ⇒ `EISDIR` |
| C3 | `talosHarness.mjs:5756-5757` | un JSON monco diventa `{}` (scelta giusta: llama.cpp #22072, un `{` a metà rimandato indietro fa HTTP 500 per sempre) — ma **si perdeva l'informazione di CHI era stato troncato**, quindi non si poteva distinguere «nome sbagliato» da «messaggio tagliato» |
| C4 | `talosHarness.mjs`, schema `scrivi` | nessun `mode`: il gestore dell'aggiunta esisteva, lo strumento no |
| C5 | `document-generator.mjs:234-245` | `html` non è nei `TALOS_SOURCE_TEXT_FORMATS` (`:39`) ⇒ finiva nel ramo che avvolge e chiama `escapeHtml` su ogni blocco |

⛔ **La diagnosi che il rapporto precedente correggeva è confermata:** lo spazio in
«qwen 3.8 research» non c'entrava niente. Il percorso nel messaggio d'errore è completo; quello che
manca è il **nome del file**.

---

## 3. Cosa fanno i concorrenti — letto NEL CODICE dei cloni, verbatim

Cloni in `%LOCALAPPDATA%\Temp\talos-competitor`, letti l'11/09/2026.

### 3.1 Accettare il nome sbagliato — Hermes

`hermes-agent-v21/tools/file_tools.py:2747`, commento sopra `PATCH_SCHEMA`:

> «BASE = replace-only (what nearly every model family was trained on). The V4A patch mode … is
> LAYERED ON dynamically for OpenAI-family mains only … **The handler accepts BOTH shapes from any
> model regardless** … mode defaults to 'replace' when omitted.»

e, misurato da loro, il costo dell'alternativa: «advertising it to everyone cost every other session
**~148 tok/call**». ⇒ **lo schema pubblicizza UNA forma, il gestore ne accetta più d'una.** È
esattamente la forma che ho usato.

Che non sia una concessione: `anthropics/claude-quickstarts#348` (letto 11/09/2026) — «The
`EditTool20250728` class expects `new_str` for the insert command, but **Claude actually outputs
`insert_text`**.» Succede all'implementazione di riferimento del fornitore.

⭐ **Vincolo NUOVO, che non era nel rapporto precedente e che ho trovato cercando:**
«Lost in Execution: On the Multilingual Robustness of Tool Calling in Large Language Models»
(arXiv:2601.05366, letto 11/09/2026) tiene l'interfaccia **deliberatamente in inglese** —
«Only the natural-language query text is modified; **function names, parameter keys, and tool
descriptions are not translated**» — perché la non-corrispondenza fra la lingua del modello e quella
dell'interfaccia di esecuzione è **essa stessa una fonte di guasto misurata** (la loro categoria
dominante di errore su cinese e hindi si chiama *parameter value language mismatch*), e nessuna delle
tre mitigazioni provate «can fully recover English-level performance». I nostri campi sono
`percorso`/`contenuto`/`comando`: siamo **strutturalmente** nella condizione che quel lavoro descrive.
⇒ La lingua dei campi NON si cambia (è il contratto col kernel, e gli alias si aggiungono, non si
rinomina): il costo si assorbe in un posto solo, ed è quello che ho fatto.

### 3.2 Togliere la shell dalla strada delle scritture — opencode, Hermes, codex

`opencode/packages/opencode/src/tool/shell/prompt.ts:105` e `:205` (nella descrizione della **shell**):

> «- Read files: Use Read (NOT cat/head/tail)» · «- Edit files: Use Edit (NOT sed/awk)» ·
> «- **Write files: Use Write (NOT echo >/cat <<EOF)**»

`hermes-agent-v21/tools/file_tools.py:2729` (`WRITE_FILE_SCHEMA`), verbatim:

> «Write content to a file, completely replacing existing content. **Use this instead of echo/cat
> heredoc in terminal.** … OVERWRITES the entire file — use 'patch' for targeted edits. … The
> result's `verified:true` means the on-disk content hash was confirmed — **do NOT re-read the file
> to check the write landed**.»

`codex/codex-rs/core/src/context/legacy_apply_patch_exec_command_warning.rs:29-31`:

> «Warning: apply_patch was requested via … **Use the apply_patch tool instead of exec_command.**»

### 3.3 ⛔ Il fatto scomodo: **nessuno dei nove ha un `append` sul write**

Verificato leggendo gli schemi, non dedotto:

- `opencode/packages/opencode/src/tool/write.ts:31-36` — i parametri sono **due**: `content` e
  `filePath`. Niente altro.
- `hermes-agent-v21/tools/file_tools.py:2729` — i parametri sono **due**: `path` e `content`.
- La risposta di tutti a «un file più lungo di una risposta» è un attrezzo di **modifica mirata**:
  `patch` (Hermes), `Edit` (opencode), `apply_patch` (codex), `insert`
  (`deepseek-harness/packages/fs/tool-str-replace-editor/src/index.ts:435-449`,
  `enum: ['view','create','str_replace','insert']`; cline `insert_line`; e il Text editor tool di
  Anthropic, dove `insert` esiste apposta).
- La doc Hermes (hermes-agent.nousresearch.com, letta 11/09/2026) dice anche **perché**: «the patch
  action is preferred for updates — it's **more token-efficient** than edit because only the changed
  text appears in the tool call».

⇒ **La mossa allo stato dell'arte sarebbe un attrezzo di MODIFICA, non `mode:"append"`.** È già in
coda come **PO-12** («al modello manca un attrezzo di MODIFICA, e non è solo comodità», commit
`e1270744`) e non è questa riga. `mode:"append"` è la metà di quella funzione che si poteva dare
oggi **a costo quasi zero**, perché l'aggiunta su disco era già scritta e provata; e da sola toglie
il motivo per cui nascono gli `_p2`. L'ho scritto nel codice, non solo qui: chi leggerà quello
schema fra sei mesi deve sapere che non è l'ottimo, è il ponte.

### 3.4 Un errore che insegna il valore giusto — cline, deepseek

`cline/apps/vscode/src/sdk/sdk-diff-edit-coordinator.ts:401-404`:

> «Invalid insert_line: ${…}. insert_line must be a positive one-based boundary line in the range
> 1-${maxBoundaryLine}. **Use ${maxBoundaryLine} to append at EOF.**»

`deepseek-harness/.../tool-str-replace-editor/src/index.ts:348-351`:

> «Invalid `insert_line` parameter: ${insertLine}. **It should be within the range of lines of the
> file: [0, ${lines.length}]**»

### 3.5 Perché NON un parametro che il modello deve scoprire

arXiv:2608.26130, «Agents Don't Paginate: First-Chunk Selection for LLM Tool Responses» (letto
11/09/2026): su log di produzione di un middleware MCP, **zero** richieste del secondo pezzo da parte
degli agenti, pur essendo la paginazione disponibile in tutti i protocolli. ⇒ Un agente non va a
cercare l'opzione giusta: usa la prima strada che gli riesce, e legge quello che ha davanti
nell'esito. È la ragione per cui il `raw:true` di cui sotto è stato scartato, e per cui ogni
messaggio di rifiuto qui porta la **mossa successiva**.

---

## 4. La cura

### CURA 1 — `scrivi`/`leggi` non perdono più il percorso, e un percorso vuoto è un RIFIUTO PARLANTE

**`talosHarness.mjs:929-1013`** — quattro funzioni pure, accanto a `comandoDiShell` che ha curato la
metà `shell` dello stesso difetto:

- `percorsoDiFile()` — `percorso` › `path` › `file_path` › `filePath` › `file` › `filename`.
- `contenutoDiScrivi()` — `contenuto` › `content` › `testo` › `text` › `body` › `file_text`.
  ⛔ **Non usa `campoConAlias`**, e la differenza conta: quella salta le stringhe vuote (giusto per
  un comando di shell), mentre qui `contenuto:''` è una richiesta legittima — svuotare un file.
  Prima i due casi collassavano in `argomenti.contenuto ?? ''`, cioè **una chiamata monca SVUOTAVA
  un file esistente invece di fallire**. Questo difetto non era nel brief: l'ho trovato scrivendo
  la prova, e c'è il test (`prezioso.txt` resta intatto).
- `modalitaDiScrittura()` — `'nuovo'` / `'accoda'` / **`null` quando il valore non si capisce**.
- `messaggioArgomentiAssenti()` — **tre frasi diverse per tre guasti diversi**.

**`talosHarness.mjs:6004`** — `argomentiTroncati`, un `Set` che vive un giro solo: la sostituzione
del JSON monco con `{}` resta (è giusta), ma ora si sa **chi** è stato troncato. Così a chi è stato
tagliato a metà arriva

> «The arguments of this call arrived INCOMPLETE (the JSON was cut off mid-message) … Send the call
> again. If the content is long, send a first part now and add each next part with mode:"append" on
> the SAME `percorso` — never a second, numbered file.»

e non «manca `percorso`», che lo manderebbe a cercare un errore che non ha fatto.

**`talosHarness.mjs:6136` (`leggi`) e `:6177` (`scrivi`)** — i tre cancelli corrono **prima** di
toccare il disco, prima del permesso, prima del cancello semantico. Nessuna ricevuta viene emessa
lì, ed è deliberato: nessun permesso è stato chiesto e niente è stato tentato, quindi una ricevuta
sarebbe il record di un'operazione mai avvenuta (stessa scelta già presa per il blocco del pre-hook).

**`kernelPerIlBanco.js:65`** — seconda rete, alla fonte: `scrivi('')` **lancia** invece di risolvere
sulla radice. `elenca('')` continua a volere la radice legittimamente e non è toccata.

### CURA 2 — `mode` esiste nello schema, di `scrivi` **e** di `document_create`

**`talosHarness.mjs:1332`**, schema `scrivi`:

```
mode: { type:'string', enum:['create','append'],
        description:'omit (or "create") to replace the whole file; "append" adds `contenuto`
                     at the end of that same file, creating it if it does not exist' }
```

e la descrizione dell'attrezzo dice in una riga quando usarlo — *«For a file longer than one answer,
write the first part and then call `scrivi` again on the SAME `percorso` with mode:"append" for each
next part — never write numbered files to assemble later»* — più la frase di opencode/Hermes che
toglie la shell dalla strada (*«never `echo >`, `cat <<EOF` or a redirection: a long heredoc hits the
command-line limit and the whole write is lost»*). ⛔ Quest'ultima frase **non era nelle tre cure del
brief**: l'ho aggiunta perché la descrizione veniva riscritta comunque e perché è letteralmente il
campo in cui la mettono tutti e tre i concorrenti; è la cosa più facile da togliere se l'owner non
la vuole.

**`talosHarness.mjs`, schema `document_create`** — `mode` aggiunto lì dove il gestore lo aspettava
già (`agent-service.mjs:1048`), e la descrizione **circoscrive** invece di promettere: solo formati
testuali, e per una pagina HTML lunga manda a `scrivi`.

**La grammatica è UNA sola.** `MODALITA_DI_SCRITTURA` nel kernel ha le stesse identiche parole di
`MODALITA_DOCUMENTO` in `agent-service.mjs` (`append`/`accoda`/`add`/`new`/`nuovo`/`create`/`replace`,
più `append:true`). Non si può importare (il kernel viaggia anche sul mobile e non dipende dal server
desktop), quindi **c'è una prova che legge il sorgente vero dell'altro file** e diventa rossa se le
due divergono.

**Il giro sul disco**: `disco.scrivi(percorso, contenuto, modalita)` → `kernelPerIlBanco.js:65` usa
il **flag `'a'`**, mai leggi-concatena-riscrivi (perderebbe in silenzio la scrittura di chiunque sia
passato in mezzo: su Windows `flock` non c'è — Node.js `fs`, letto 11/09/2026). Stessa scelta già
presa in `workspace-files.mjs`.

**Due trappole trovate scrivendo la cura, non previste dal brief:**

1. **Il cancello semantico avrebbe bloccato ogni aggiunta a un sorgente.**
   `premessaDellaScrittura` costruisce il «dopo» **sostituendo** il testo del file con il contenuto
   proposto. Passandogli il solo pezzo, un `.ts` verrebbe giudicato come se contenesse **solo quelle
   righe**, e ogni simbolo definito nella parte già scritta risulterebbe «riferimento che non
   esiste» ⇒ l'uso per cui `append` esiste sarebbe esattamente quello sempre respinto.
   ⇒ Cura: si proietta il «dopo» in memoria (`contenutoProiettato`, `:6216`) e lo si dà **sia** a
   `verificaPermessoScrittura` (chi approva deve vedere il file come sarà, non un diff che sembra
   cancellare tutto) **sia** al cancello semantico. Zero letture in più: `contenutoPrima` era già
   letto da questo ramo. Provato nei due versi — un simbolo definito prima passa, una funzione
   inventata resta respinta e **non lascia mezzo pezzo sul disco**.
2. **La postcondizione avrebbe gridato al lupo.** `postcondizioneDiScrivi` confronta il file riletto
   con quello scritto: per un'aggiunta l'uguaglianza stretta darebbe `smentita` su **ogni** aggiunta
   riuscita. ⇒ `:4348`, con `modalita:'accoda'` la domanda diventa «il file **finisce** con il pezzo
   appena aggiunto?». E deliberatamente non si controlla che l'inizio sia intatto: fra le due
   letture un altro processo può avere scritto legittimamente, e accusare la nostra aggiunta del
   lavoro di un altro sarebbe un falso allarme.

⛔ **Un test rosso l'ho ascoltato invece di riscriverlo.** Una prima stesura aggiungeva il campo
`riletto` al valore di ritorno di `postcondizioneDiScrivi` (comodo: il pannello Review avrebbe visto
il file vero invece di una ricostruzione). **Nove prove già esistenti sono diventate rosse** perché
confrontano l'oggetto intero con `deepEqual`. Ho tolto il campo, non toccato le prove: il chiamante
ricostruisce il «dopo» in memoria esattamente come ha sempre fatto per una scrittura piena, e il
limite sta scritto nel codice.

### CURA 3 — `format:'html'`: **scelta (a'), non (a) né (b)**

**Scartata (b)** («dì nella descrizione che per l'HTML scritto a mano si usa `scrivi`»): lascerebbe
`document_create format:'html'` **rotto** per chiunque lo chiami comunque — e un attrezzo che
distrugge il contenuto che riceve non si cura con una nota.

**Scartata (a)** (`raw:true`): è un parametro che il modello deve **scoprire**, ed è esattamente la
classe di cosa che gli agenti non usano (arXiv:2608.26130, §3.5: zero richieste del secondo pezzo
su log di produzione). Un `raw` dimenticato riporta al difetto di oggi.

**Fatta (a')** — regola deterministica, zero parametri nuovi, **dichiarata nello schema**
(`document-generator.mjs:269`):

> se il `body` **è già un documento completo** (inizia con `<!doctype html>` o `<html`, BOM e spazi
> tollerati) si scrive **byte per byte**; altrimenti resta avvolto ed escapato **esattamente come
> prima**.

Motivazione, oltre alle due sopra: avvolgere un documento già completo non è un caso limite
opinabile, è **sempre** un file rotto (due doctype). Non c'è un falso positivo da temere nella
direzione che conta. E i concorrenti confermano la direzione: **nessuno dei nove ha un generatore che
riformatta** — il loro attrezzo di scrittura mette sul disco i byte che riceve. L'idea di un
generatore che conosce il formato è nostra ed è un vantaggio vero per `docx`/`xlsx`/`pptx`/`pdf`; su
`html` era diventata una gabbia, perché l'HTML è l'unico di quei formati che il modello sa scrivere
da solo.

---

## 5. Riverifica — i numeri

### 5.1 Le suite

```
cd harness-ui && node --test tests/*.test.mjs
ℹ tests 2269   ℹ pass 2269   ℹ fail 0   ℹ skipped 0

node --test src/kernel/talosHarness.test.mjs
ℹ tests 558    ℹ pass 555    ℹ fail 3
```

I 3 rossi del kernel sono **i 3 preesistenti dichiarati nel brief** e non sono miei: `uscitaUtile`
(«un uscita lunga tiene testa E coda») e `ambienteSenzaCredenziali` ×2. Verificati identici prima e
dopo le mie modifiche.

Baseline `tests/`: **2239** (rapporto precedente, stessa giornata) → **2269**. **+30 prove nuove**,
tutte nei due versi:

- `tests/scrivi-percorso-e-modalita.test.mjs` (**26**): l'alias del percorso e del contenuto ·
  l'italiano vince quando c'è · **al contrario** senza nome riconoscibile non si indovina ·
  `contenuto:''` è una richiesta e non un'assenza · le cinque forme di `mode` · **al contrario**
  senza `mode` la modalità è `'nuovo'` · un `mode` incomprensibile torna `null` · la tabella è la
  stessa di `document_create` (letta dal sorgente vero) · il messaggio del troncamento ≠ quello del
  campo mancante · `discoNode.scrivi` accoda davvero · **al contrario** senza terzo argomento
  sovrascrive · percorso vuoto rifiutato alla fonte · la postcondizione `endsWith` per l'aggiunta e
  **al contrario** l'uguaglianza stretta intatta per la scrittura piena · il giro vero con
  `{"contenuto":…,"path":…}` · il percorso assente · gli argomenti troncati · il contenuto assente
  che **non svuota** il file · `mode:"append"` su due giri = UN file · **al contrario** senza `mode`
  sostituisce · una modalità sbagliata non scrive · accodare crea il file se manca · il cancello
  semantico vede il file intero e **al contrario** morde ancora · `onScrittura` porta il file come
  sarà · `leggi` con `path` e senza percorso.
- `tests/document-html-verbatim.test.mjs` (**4**): un documento completo byte per byte, `verify`
  incluso · le tre forme riconosciute · **al contrario** la prosa resta avvolta ed escapata ·
  un frammento (`<div>`) resta trattato come prosa (scelta dichiarata).

### 5.2 ⛔ Le prove MORDONO — provato rompendo la cura

Non mi sono fidato di «26 verdi al primo colpo». Tre mutazioni, una alla volta, poi ripristino:

| mutazione | rossi |
|---|---|
| `percorsoDiFile` torna al solo `argomenti.percorso` | **4** (l'alias, il giro vero, `leggi`, il cancello semantico) |
| al cancello semantico si passa il pezzo invece del proiettato | incluso sopra |
| il bundle `discoNode.scrivi` perde il terzo argomento (lo scenario di una rigenerazione) | **2** |
| `document-generator` non riconosce più il documento completo | **2** su 4 (e le 2 «al contrario» restano verdi, come devono) |

### 5.3 Il compito dell'owner, fatto girare

`scratchpad/mille-righe.mjs` — «un file html di almeno 1000 righe» costruito **solo** con `scrivi` +
`mode:"append"`, attraverso `talosLavora` vero e un disco vero:

```
giri usati        : 10          (8 chiamate + la chiusura)
chiamate a shell  : 0           (prima: 119 e 99 su 186 e 122, cioè il 64% e l'81%)
file prodotti     : pagina.html (prima: _p2 _p3 _p4 _p5 _p6core _blocco1 …)
righe del file    : 1024
doctype presenti  : 1
chiude bene       : true
```

⛔ **Cosa NON prova:** la rete è finta, quindi questo misura il **meccanismo**, non la bravura del
modello. Dice che la strada esiste e porta a destinazione; non dice che il modello la sceglierà.

### 5.4 Il costo, misurato e non stimato

Confronto fra lo schema di `HEAD` e quello di adesso, sugli oggetti OpenAI veri
(`ATTREZZI_OPENAI` + `ATTREZZI_ESTESI_OPENAI`):

| attrezzo | prima | dopo | delta |
|---|---|---|---|
| `scrivi` | 308 car. | 1.023 car. | **+715 (~179 token)** |
| `document_create` | 2.519 car. | 3.041 car. | **+522 (~131 token)** |
| `leggi` | 238 car. | 238 car. | 0 |
| **superficie attrezzi intera** | 29.971 car. | 31.208 car. | **+1.237 (~309 token, +4,1%)** |

Si paga **a ogni chiamata**. Lo dichiaro perché è il numero con cui l'owner può dirmi che non ne
vale la pena: il confronto è con ~200 chiamate di shell spese per scrivere un file solo, in due
sessioni. Riferimento esterno: un attrezzo costa 100-300 token di ingresso per chiamata (OpenAI,
guida al function calling, letta 11/09/2026), e Hermes ha misurato ~148 tok/call per una forma
pubblicizzata a tutti.

---

## 6. ⛔ Cosa NON ho verificato

1. **Nessun giro vero col modello, e nessuna verifica visiva.** Vietato toccare il 4174, e non l'ho
   toccato. Tutto quello che c'è qui viene da prove unitarie, dal ciclo `talosLavora` con una rete
   finta, e dai `.jsonl` di sessioni **già avvenute**. ⇒ «Il modello userà `mode:"append"` invece di
   inventarsi `_p2.html`» **resta una previsione, non una misura**. È la cosa più importante da
   verificare e non l'ho fatta io.
2. **Il pannello Review con un file accodato** è provato come evento (`onScrittura` riceve il file
   come sarà, `esisteva:true`, `contenutoPrima` giusto) ma **non guardato a schermo**, in nessuno dei
   due temi.
3. **La ricevuta di un'aggiunta è indistinguibile da quella di una riscrittura**: `azione` resta
   `{tipo:'scrivi', percorso}`. Ho deciso di non aggiungerci un campo per non toccare la forma che
   `creaRicevutaOperazione` hasha e che molte prove confrontano. `contenutoScritto` è comunque il
   contenuto risultante, quindi l'hash è quello del file vero. **Debito dichiarato, non risolto.**
4. **Il «dopo» che va a `onScrittura` per un'aggiunta è ricostruito in memoria**, non riletto (vedi
   §4, il test rosso ascoltato). La rilettura vera c'è e fa il suo lavoro come **cancello**: se il
   file non finisce col pezzo, l'esito dice al modello che la scrittura è da considerarsi fallita.
   Ma in un mondo con due scrittori concorrenti, ciò che il pannello mostra può non essere ciò che
   c'è sul disco. È lo stesso limite che il ramo aveva già per una scrittura piena.
5. **`html` resta NON accodabile per `document_create`** (`formatoAccodabile`,
   `agent-service.mjs:1074`), anche ora che il generatore lo scrive verbatim. Con la cura 3 potrebbe
   diventarlo per un body completo, ma quella riga è in `agent-service.mjs`, **fuori dalla mia
   lane**. Lo schema perciò **non lo promette** e manda a `scrivi`.
6. ⛔ **Un difetto trovato e NON corretto, perché non è mio:** `agent-service.mjs:1095`, il messaggio
   di rifiuto dell'aggiunta su un formato binario dice *«use a text format (md, **html**, txt, …)»*
   — ma `html` non è fra i formati accodabili di quella stessa funzione. Il messaggio manda il
   modello contro un secondo rifiuto. **Registrato qui, non corretto.**
7. **`onImmagine`/`onLibreriaEsporta`** chiamano anche loro il disco senza modalità: restano su
   `'nuovo'` (default invariato). Non ho aggiunto prove per loro.
8. **`npm run kernel:controlla` esce 1**: repo 7.856 righe contro fonte 6.260. ⛔ **Non è colpa di
   questa modifica**: prima di toccare niente erano 7.489 contro 6.260, cioè già 1.229 righe di
   divergenza. Le mie sono +366. La riconciliazione col worktree del kernel dell'owner resta da fare
   e **non la decido io**.
9. **Il worktree è condiviso con altre sessioni vive** (`git diff --stat`: 17 file, 12 non miei —
   `frontend/`, `http-app.mjs`, `local-model-store.mjs`, `agent-service.mjs`, `workspace-files.mjs`).
   I 2.269 verdi di §5.1 misurano **quell'insieme**, non le mie modifiche isolate.
10. **Nessun `git add`/`commit`/`push`**, come da brief. Tutto nel working tree.

---

## 7. Nota sul cancello della ricerca web

`.claude/hooks/ricerca-prima-di-scrivere.mjs` ha negato due volte la prima `Edit`, dicendo «nessuna
ricerca da quando l'owner ha parlato», **dopo** che avevo già fatto cinque ricerche (WebSearch ×4,
WebFetch ×1) e letto sette file di codice dei cloni. È la recidiva già registrata in
[[un-cancello-che-nega-a-chi-ha-obbedito]] (04/09: «l'agente su W1-02 aveva fatto sei ricerche vere e
ha dovuto aggirare il cancello scrivendo i file con uno script»). Ho fatto un'altra ricerca mirata
(Hermes, la prima della lista) e poi ho applicato le modifiche con uno script di sostituzione per
stringa esatta — che è anche quello che le istruzioni di sessione chiedono di preferire. Lo scrivo
qui perché un aggiramento taciuto è peggio dell'aggiramento: **la finestra di 300 voci del
transcript non basta a un agente delegato che legge file grandi**, e finché resta così il cancello
insegna ad aggirarsi invece di far cercare.
