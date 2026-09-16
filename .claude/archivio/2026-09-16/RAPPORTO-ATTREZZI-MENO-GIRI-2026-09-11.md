# BC-11 — «meno giri possibili»: cosa è successo davvero, cosa fanno gli altri, cosa ho curato

**Data:** 11/09/2026 · **Lane:** `lane/harness-desktop` · **File toccati:** `harness-ui/src/workspace-files.mjs`,
`harness-ui/src/agent-service.mjs` (solo `onDocumento`), `harness-ui/tests/workspace-files.test.mjs`,
`harness-ui/tests/agent-service.test.mjs`.
**Non toccati (vietati dal brief, ci lavora un'altra sessione):** `src/kernel/talosHarness.mjs`,
`src/session-registry.mjs`, `src/kernel/dist/kernelPerIlBanco.js`.

---

## 0. In una riga

Il modello non ha fatto «un giro assurdo» per bizzarria: **con gli attrezzi che gli abbiamo dato,
quella era l'unica strada**. Nessun attrezzo sa aggiungere in coda a un file, l'unico che scrive
testo grezzo (`scrivi`) richiede il file INTERO in una risposta, l'unico che genera file
(`document_create`) rifiutava un nome già usato dicendogli *«offer a different title»* — cioè gli
insegnava `_p2.html` — e la shell, l'unica via rimasta, ha un tetto sulla riga di comando che
nessuno gli aveva dichiarato. Sopra a tutto questo, **46 chiamate su 308** sono morte perché il
modello ha scritto il nome dell'argomento in inglese.

---

## 1. Riproduzione — i numeri veri delle due sessioni

Contati sui `.jsonl` (script in `scratchpad/`, ricostruendo gli argomenti dai `ToolCallArgs`):

| | `8dde6bff` | `37e10d21` |
|---|---|---|
| chiamate ad attrezzi | 186 | 122 |
| di cui `shell` | **119** | **99** |
| di cui `scrivi` | 23 | 6 |
| risultati con errore | 48 / 185 (26%) | 17 / 119 (14%) |
| argomenti JSON **troncati** a metà | 3 | 0 |
| chiavi **fuori schema** | 62 | 17 |

Le chiavi fuori schema, per nome: `shell.command` **30 + 9**, `shell.description` **7 + 8**,
`scrivi.path` **2**, `scrivi.content` **1**, `scrivi.contuto` **1** (refuso suo),
`delega_sottotask.task` **1**. (`web_search.query`/`maxResults` sono invece corretti: stanno nello
schema — verificato a `talosHarness.mjs:1373-1386`, non dedotto.)

⇒ Per scrivere **un** file HTML il modello ha speso **il 64% e l'81%** delle sue chiamate nella
shell. E nelle due sessioni si è inventato `_p2.html`, `_p3.html`, `_p4.html`, `_p5.html`,
`_p6core.js`, `_blocco1.html`, `_build2…`, più un passo di «assemblaggio» che non è mai arrivato in
fondo.

### 1.1 Il tetto della riga di comando — misurato

`call_2370556ea77444169564ddee`: `cat >> tokenizer_moderno_2026.html << 'PARTE2EOF' …`,
**comando di 23.941 caratteri** (argomenti grezzi 24.965) → `exit 1 [sandbox: none]` /
*«La riga di comando è troppo lunga.»* — nessun attrezzo aveva mai detto al modello che quel tetto
esisteva.

---

## 2. Il bug EISDIR — **la diagnosi del brief è sbagliata, e la prova è nel messaggio stesso**

> Brief, punto 3: «il percorso è stato troncato allo SPAZIO dentro "qwen 3.8 research", e ha aperto
> la cartella invece del file».

**Non è così.** Il percorso nel messaggio è **completo**, spazi inclusi:

```
error: EISDIR: illegal operation on a directory, open 'C:\Users\Antonino\Desktop\qwen 3.8 research'
```

Non è `…\qwen 3.8`: è `…\qwen 3.8 research`, cioè **la radice della sessione per intero**. Lo spazio
non c'entra niente. Quello che manca è il *nome del file*.

### 2.1 La causa, con file:riga

1. `talosHarness.mjs:5814` — `try { argomenti = JSON.parse(c.function?.arguments || '{}') } catch { }`
   e, poco sopra, `:5756-5757` — un JSON a metà viene **sostituito con `{}`** (scelta giusta e
   documentata: un `{` a metà rimandato al provider fa HTTP 500 per sempre, llama.cpp #22072).
2. ⇒ `argomenti.percorso` è `undefined`. Succede in **due** modi, entrambi misurati:
   · gli argomenti si troncano a metà stream (3 volte — es. `call_c741309f96da49718f246d6c`, 2.781
     caratteri, stringa non chiusa);
   · il modello scrive la chiave in inglese — `call_e242d54aac654068a40e32b0` ha mandato
     **`{"contenuto": …, "path": "_pian.mjs"}`**: `path`, non `percorso`.
3. `talosHarness.mjs:5936` — `await disco.scrivi(argomenti.percorso, …)`, con `percorso` `undefined`.
4. `src/kernel/dist/kernelPerIlBanco.js:22` —
   `const dentro = (percorso) => percorso ? resolve(radice, percorso) : radice;`
   **un percorso vuoto RESTITUISCE LA RADICE**, e `:44` fa `writeFile(dentro(percorso), …)`.
5. ⇒ `writeFile` su una **cartella** → `EISDIR`.

### 2.2 Riprodotto (scratchpad/repro.mjs, cartella con lo stesso nome e gli stessi spazi)

```
R1    → EISDIR | EISDIR: illegal operation on a directory, open '…\qwen 3.8 research'
R1bis → EISDIR | idem, passando ESATTAMENTE {contenuto:…, path:'_pian.mjs'} della sessione vera
```

### 2.3 Quanto è costato

Cinque `scrivi` finite così. E il giro successivo il modello ha dovuto **dedurre** cosa fosse
successo: nel suo ragionamento si legge *«Oops, empty call. Let me write _p3.html with content.»* —
ha indovinato, e ha pagato un giro intero per indovinare.

### 2.4 ⛔ La cura è NEL KERNEL: NON l'ho fatta

Il brief me lo vieta esplicitamente. Ecco cosa va fatto, pronto da applicare (**tre righe**):

1. **`talosHarness.mjs`, ramo `scrivi` (≈ riga 5877 in poi)** — usare la funzione che *esiste già*
   in quel file. Un'altra sessione ha aggiunto oggi `campoConAlias` (`:878`) e
   `comandoDiShell` (`:888`) per curare **la metà `shell`** dello stesso difetto; la metà `scrivi`
   è rimasta scoperta. Serve l'equivalente:

   ```js
   const percorsoDiScrivi   = (a) => campoConAlias(a, 'percorso', 'path', 'file', 'filename')
   const contenutoDiScrivi  = (a) => campoConAlias(a, 'contenuto', 'content', 'text', 'body') ?? ''
   ```
   e sostituire ogni `argomenti.percorso` / `argomenti.contenuto` del ramo. Lo stesso vale per
   `leggi` (`:5875`, `argomenti.percorso`).

2. **`talosHarness.mjs`, prima della scrittura** — se dopo l'alias il percorso è ancora vuoto,
   **rispondere a parole**, non tentare:
   ```
   No path was given. `scrivi` needs `percorso` (the file path, relative to the workspace) and
   `contenuto`. If your previous message was cut off mid-argument, send a shorter `contenuto`.
   ```
   Oggi quel caso arriva fino al disco e torna un `EISDIR` illeggibile.

3. **`kernelPerIlBanco.js:22`** (bundle rigenerato dal repo del kernel, non da qui) — `dentro('')`
   non deve poter restituire la radice per una SCRITTURA. `elenca('')` la vuole legittimamente;
   `scrivi`/`leggi` no.

**Perché la 1 conta più delle altre:** vale **39 giri** (le `shell.command`) + **4** (le `scrivi`
sbagliate) nelle due sole sessioni misurate — ~15% di tutte le chiamate. Metà è già curata, l'altra
metà no.

---

## 3. Cosa fanno i concorrenti — letto NEL CODICE

Cloni in `%LOCALAPPDATA%\Temp\talos-competitor`. Citazioni verbatim, con file:riga.

### 3.1 Accettare il nome sbagliato dell'argomento — **Hermes**

`hermes-agent-v21/tools/file_tools.py:2747` (`PATCH_SCHEMA`), commento sopra lo schema:

> «BASE = replace-only (what nearly every model family was trained on). The V4A patch mode (mode +
> patch params, dual-mode description) is LAYERED ON dynamically for OpenAI-family mains only …
> **The handler accepts BOTH shapes from any model regardless** (replay compat + strong models that
> know V4A anyway): mode defaults to 'replace' when omitted.»

E, misurato da loro, il costo dell'alternativa: «advertising it to everyone cost every other session
**~148 tok/call**». ⇒ *lo schema pubblicizza una forma sola, il gestore ne accetta due.*

Che non sia una concessione: `anthropics/claude-quickstarts#348` (letto 11/09/2026) — «The
`EditTool20250728` class expects `new_str` for the insert command, but **Claude actually outputs
`insert_text`**. This causes insert commands to fail.» Succede all'implementazione di riferimento
del fornitore.

### 3.2 Non far passare la scrittura dalla shell — **Hermes, opencode, codex**

`hermes-agent-v21/tools/file_tools.py:2729` (`WRITE_FILE_SCHEMA`):

> «Write content to a file, completely replacing existing content. **Use this instead of echo/cat
> heredoc in terminal.** Creates parent directories automatically. OVERWRITES the entire file — **use
> 'patch' for targeted edits**. … The result's `verified:true` means the on-disk content hash was
> confirmed — **do NOT re-read the file to check the write landed**.»

Tre risparmi di giri in una descrizione sola: non usare la shell · non riscrivere tutto per un
ritocco · non rileggere per verificare.

`opencode/packages/opencode/src/tool/shell/prompt.ts:105` e `:205` (elenco nella descrizione della
shell stessa):

> «- Write files: Use Write (NOT echo >/cat <<EOF)» · «- Edit files: Use Edit (NOT sed/awk)» ·
> «- Read files: Use Read (NOT cat/head/tail)»

e `shell/shell.txt`: «IMPORTANT: This tool is for terminal operations like git, npm, docker, etc.
**DO NOT use it for file operations** (reading, writing, editing, searching, finding files) - use the
specialized tools for this instead.»

`codex/codex-rs/core/src/context/legacy_apply_patch_exec_command_warning.rs:29-31` — codex
**riconosce** il modello che prova a scrivere passando dalla shell e glielo rimanda indietro:

> «Warning: apply_patch was requested via … **Use the apply_patch tool instead of exec_command.**»

### 3.3 Non pagare la tassa del JSON su un file lungo — **codex**

`codex/codex-rs/core/src/tools/handlers/apply_patch_spec.rs:22`:

> «The `apply_patch` tool can be used to edit files. **This is a FREEFORM tool, so do not wrap the
> patch in JSON.**»

Grammatica Lark vera, `codex-rs/core/assets/tools/apply_patch.lark`:
```
add_hunk: "*** Add File: " filename LF add_line+
add_line: "+" /(.*)/ LF -> line
```
⇒ un file nuovo si spedisce come **testo con un `+` davanti a ogni riga**, non come stringa JSON.
Questo è esattamente il costo che ci ha uccisi: dentro JSON ogni `"` diventa `\"` e ogni a capo
`\n`, e — peggio — **un troncamento rende l'intera chiamata illeggibile** (i nostri 3 `{}`).

### 3.4 Aggiungere invece di riscrivere — **cline, deepseek-harness, Anthropic**

`cline/apps/vscode/src/sdk/sdk-diff-edit-coordinator.ts:401-404` — e si noti che **l'errore insegna
il valore giusto**:

> «Invalid insert_line: ${…}. insert_line must be a positive one-based boundary line in the range
> 1-${maxBoundaryLine}. **Use ${maxBoundaryLine} to append at EOF.**»

`deepseek-harness/packages/fs/tool-str-replace-editor/src/index.ts:435-449` — l'editor a comandi:
`enum: ['view', 'create', 'str_replace', 'insert']`, con
«Required integer parameter of `insert` command. The `new_str` will be inserted AFTER the line
`insert_line` of `path`», e a `:348-351` l'errore che dichiara l'intervallo valido:
«It should be within the range of lines of the file: [0, ${lines.length}]».

Anthropic, «Text editor tool» (platform.claude.com, letto 11/09/2026): i comandi sono
`view`/`create`/`str_replace`/`insert`/`undo_edit` — `insert` **esiste apposta** per non dover
riscrivere un file intero a ogni aggiunta.

⇒ **Nessuno dei nove costringe a riscrivere tutto il file.** TALOS sì.

### 3.5 Dichiarare i tetti invece di farli scoprire — **goose, Hermes, opencode**

`goose/crates/goose/src/agents/platform_extensions/developer/mod.rs:138-141` — la descrizione della
shell **dichiara il limite della piattaforma**, ed è esattamente la famiglia del nostro
«La riga di comando è troppo lunga»:

> «Commands must be on a single line — **cmd.exe silently truncates at the first newline**. Use `&`
> to chain (e.g. `echo a & echo b`) or set GOOSE_SHELL=powershell for multi-line support.»

`hermes-agent-v21/tools/file_tools.py:2942` — il tetto è un dato accanto all'attrezzo:
`registry.register(name="write_file", …, max_result_size_chars=100_000)`; e `:94-97` il principio,
scritto nel loro codice:

> «Where hermes previously hard-rejected an oversized read (**forcing the model to guess a smaller
> `limit` and burn a round-trip returning nothing**), this trims the content to the last *complete
> line* … so the caller can offer a `next_offset` continuation.»

`opencode/packages/opencode/src/tool/truncate.ts:19-20` — `MAX_LINES = 2000`, `MAX_BYTES = 50 * 1024`,
sovrascrivibili da config, e la descrizione della shell li NOMINA a runtime
(`shell/prompt.ts:99`): «If the output exceeds ${limits.maxLines} lines or ${limits.maxBytes}
bytes…».

### 3.6 Un avvertimento dalla letteratura, contro la cura sbagliata

arXiv:2608.26130, «Agents Don't Paginate: First-Chunk Selection for LLM Tool Responses» (letto
11/09/2026): su log di produzione di un middleware MCP, **zero richieste del secondo pezzo** da parte
degli agenti, pur essendo la paginazione disponibile in tutti i protocolli.
⇒ La cura non è «insegnargli a paginare»: è **far riuscire la prima chiamata**. È la ragione per cui
sotto ho messo il messaggio che insegna *dentro l'esito della chiamata che sta già leggendo*, e non
un parametro in più che dovrebbe scoprire da solo.

---

## 4. Cosa ho curato — e cosa NO

### C1 · `workspace-files.mjs` — `creaFileWorkspace` dichiara i suoi limiti

**Riproduzione:** `bytes: undefined` → `TypeError: ERR_INVALID_ARG_TYPE: The "data" argument must be
of type string…` (l'errore di Node, rilanciato tale e quale al modello). E `Buffer.alloc(40 MB)` →
**41.943.040 byte scritti in 12 ms senza un solo controllo**.

**Cura:** tipo e tetto validati *prima* di aprire il file, con messaggi che nominano la strada
giusta — `DIMENSIONE_MASSIMA_CREAZIONE = 32 MB`, codici `CONTENT_INVALID` / `CONTENT_TOO_LARGE`.
Il messaggio del tetto dice *«Scrivilo in più pezzi, aggiungendo ogni pezzo in coda»*, cioè porta la
mossa successiva (forma di cline, §3.4).

### C2 · `workspace-files.mjs` — `modalita: 'accoda'`

**Perché:** è il buco che ha prodotto `_p2.html`…`_p5.html`. Nessun attrezzo sapeva aggiungere.

**Cura:** `creaFileWorkspace({…, modalita})` — `'nuovo'` (**default, comportamento identico a
prima**) o `'accoda'`. Accoda con `fsp.appendFile` (flag `'a'`), **mai leggi-concatena-riscrivi**
(perderebbe in silenzio la scrittura di chiunque altro in mezzo — Node.js `fs`, letto 11/09/2026: su
Windows `flock` non c'è, `appendFile` con `'a'` è la via). Se il nome è una **cartella** risponde
`NOT_A_FILE` a parole: è la nostra copia, in piccolo, del bug EISDIR del §2. Il tetto si controlla
sul **totale**, non sul pezzo.

### C3 · `agent-service.mjs` — `document_create` non insegna più `_p2`

**Prima** (`onDocumento`, ramo di salvataggio fallito):
> «…it could not be saved to the workspace: … **Do not silently retry with the same name — offer a
> different title, or ask.**»

Era **l'harness** a mandarlo a inventare un nome nuovo. **Ora**, sul solo `FILE_EXISTS`:
> «"X.md" already exists. To ADD to it, call document_create again with the same title and
> **mode:"append"** — the new body goes at the end of that same file. To make a separate file
> instead, use a different title. **Do not invent numbered variants of the same name.**»

E l'esito di **ogni creazione riuscita** (solo sui formati accodabili) chiude con:
> «To make it longer, call document_create again with the same title and mode:"append" instead of
> writing a second file.»

**Perché nell'esito e non nello schema:** lo schema di `document_create` vive nel kernel
(`talosHarness.mjs:1403`) e non posso toccarlo. Ma il kernel consegna gli argomenti **verbatim**
(`:6175` `onDocumento(argomenti)`, dichiarato a `:5069`), quindi una chiave che lo schema non nomina
arriva intatta: l'esito è l'unico canale rimasto, ed è quello che il modello legge comunque a ogni
giro (§3.6). È la stessa leva che Hermes usa per il suo «do NOT re-read the file» (§3.2).

### C4 · `agent-service.mjs` — gli alias di `mode`, e i formati che NON si accodano

`mode` / `modalita` / `modality` / `append: true`, maiuscole e spazi inclusi (§3.1: 46 chiamate su
308 hanno sbagliato il nome). Un valore incomprensibile viene **detto**, non indovinato
(«"overwrite" is not a mode. Use mode:"append" …»), e non si genera niente.

⛔ **`docx`/`xlsx`/`pptx`/`pdf` rifiutano l'aggiunta prima di scrivere**: sono contenitori binari
(zip; il PDF ha la tavola degli offset in fondo), concatenarne due produce un file che si apre come
**corrotto** — cioè una scrittura «riuscita» che distrugge i giri precedenti.

⛔ **`html` neanche**, ed è contro-intuitivo: l'ho verificato nel generatore, non dedotto —
`document-generator.mjs:234-245` non scrive `body` com'è, lo **avvolge** (`<!doctype html>`, `<head>`,
un `<h1>` col titolo, ogni blocco in un `<p>`) e lo passa da `escapeHtml`. Accodare a un file che
finisce con `</body></html>` darebbe due doctype.

### C5 · effetti collaterali corretti nello stesso giro

· `esisteva` nell'evento `StateDelta` era scritto `false` **a mano**, e il commento spiegava perché
era vero «per costruzione» (un nome già preso veniva sempre rifiutato). Con l'aggiunta quella
costruzione cade: ora si legge dall'esito vero della scrittura (`salvato.accodato`). Un pannello
Review che dice «nuovo» su un file cresciuto sarebbe la stessa classe di bugia che questo file
rifiuta altrove.
· la copia in **Libreria** si fa solo quando il documento NASCE: N pezzi accodati non devono
diventare N voci con lo stesso nome per UN file.

---

## 5. Il difetto più grande che ho trovato, e che NON è mio

**`document_create` con `format:'html'` non può scrivere una pagina HTML scritta a mano.**

`document-generator.mjs:223-225` passa verbatim solo i `TALOS_SOURCE_TEXT_FORMATS`
(`txt/json/js/ts/py/…`). `html` **non è** in quell'elenco: finisce nel `switch` a `:234`, che
avvolge e fa `escapeHtml(blocco)` su ogni paragrafo. ⇒ Un `<section id="x">` scritto dal modello
arriverebbe sul disco come `&lt;section id="x"&gt;` dentro un `<p>`.

**Conseguenza sul compito dell'owner:** per «genera un file html di almeno 1000 righe» **non esisteva
nessun attrezzo capace di farlo**, a parte `scrivi` (che vuole tutto in una risposta) e la shell (che
ha il tetto della riga di comando). Il «giro assurdo» non era una scelta del modello: era l'unica
strada rimasta.

**Cura (fuori dalla mia lane, `document-generator.mjs`):** aggiungere `html` ai formati verbatim
quando il `body` è già un documento completo (inizia con `<!doctype` o `<html`), e avvolgerlo solo
quando è prosa. Con quella riga, `html` diventa anche **accodabile** e la mia C2/C3 copre il compito
per intero, in un giro per pezzo.

---

## 6. Le altre cure di kernel, in ordine di giri risparmiati

| # | Dove | Cosa | Giri risparmiati (misurati sulle 2 sessioni) |
|---|---|---|---|
| K1 | `talosHarness.mjs` ramo `scrivi`/`leggi` | alias `path`/`content` via `campoConAlias` (già esistente a `:878`) | **4** + ogni futuro |
| K2 | `talosHarness.mjs` ramo `scrivi` | percorso vuoto ⇒ risposta a parole, non `EISDIR` | **5** + il giro di deduzione dopo ciascuno |
| K3 | `document-generator.mjs` | `html` verbatim quando è già un documento (§5) | tutta la sessione: 119 `shell` → ~6 `document_create` |
| K4 | `talosHarness.mjs:1206` schema `scrivi` | dichiarare il tetto del contenuto, e che per allungare si usa l'aggiunta | il modello non lo scopre più sbattendoci |
| K5 | `talosHarness.mjs:1222` schema `shell` | dichiarare il tetto della riga di comando (**8.191** su cmd, 32.767 su CreateProcess) come fa goose (§3.5) | il `cat >> … << EOF` da 23.941 caratteri non parte nemmeno |
| K6 | `talosHarness.mjs:1216-1270` descrizioni | «use `scrivi`, NOT `cat`/`echo >`/heredoc» come opencode/Hermes/codex (§3.2) | struttura: toglie la shell dalla strada delle scritture |

---

## 7. Riverifica

```
cd harness-ui && node --test tests/*.test.mjs
ℹ tests 2239   ℹ pass 2239   ℹ fail 0   ℹ duration_ms 27066
```

16 prove nuove, tutte nei due verso:
· `workspace-files.test.mjs` (51 totali, **+7**): contenuto mancante → messaggio a parole e **niente**
  `ERR_INVALID_ARG_TYPE` · tetto dichiarato **e** un byte sotto il tetto che passa · l'aggiunta che
  finisce nello stesso file **e niente `lungo_p2.md`** · **al contrario**, senza `modalita` un nome
  già preso resta rifiutato e il file di prima è intatto · accodare a una cartella non dà mai
  `EISDIR` e la cartella resta intatta · il tetto si guarda sul totale e il file non cresce di un
  byte · una modalità scritta male viene detta.
· `agent-service.test.mjs` (192 totali, **+9**): `mode` arriva fino alla scrittura · i 4 alias ·
  **al contrario**, senza `mode` resta `'nuovo'` · `FILE_EXISTS` insegna `mode:"append"` e non più
  «offer a different title» · un binario rifiuta **prima** di scrivere · un `mode` sbagliato non
  genera niente · l'esito riuscito insegna come allungare · **al contrario**, su un formato non
  accodabile non lo suggerisce · un pezzo accodato non fa una seconda voce di Libreria.

⚠️ Il brief diceva «oggi 2203 verdi». Alla mia prima corsa la baseline era già **2223**: altre
sessioni scrivono test nello stesso worktree. 2223 + 16 = 2239. Nessun rosso, né prima né dopo.

---

## 8. ⛔ Cosa NON ho verificato

1. **Nessun giro vero col modello.** Tutte le misure di questo rapporto vengono dai `.jsonl` di due
   sessioni **già avvenute** e da prove unitarie. **Non ho rifatto il compito «genera un file html di
   1000 righe» con `mode:"append"` acceso**, quindi *«quanti giri risparmia davvero»* resta una
   stima, non una misura. (Vietato toccare il 4174; e senza K3 il compito HTML non è comunque
   eseguibile via `document_create`.)
2. **Nessuna verifica visiva.** Non ho aperto la UI: l'evento `StateDelta` con `esisteva:true` su un
   file accodato è provato nel test, **non** guardato nel pannello Review.
3. **Il conteggio delle chiavi fuori schema** confronta con lo schema che ho letto oggi nel kernel.
   Se un'altra sessione ha cambiato uno schema mentre misuravo, quel numero invecchia.
4. **`modalita:'accoda'` non è raggiungibile dal modello finché lo schema del kernel non nomina
   `mode`** (K4). Oggi ci arriva solo se lo *indovina* leggendo l'esito — che è esattamente ciò che
   C3 gli mette davanti, ma è un canale di persuasione, non un contratto.
5. **`onImmagine` e `onLibreriaEsporta`** chiamano anche loro `creaFileWorkspace`: non passano
   `modalita`, quindi restano su `'nuovo'` (default invariato) — ma non ho aggiunto prove nuove per
   loro, mi sono fidato dei loro test esistenti, che sono verdi.
6. **Niente `git add`/`commit`/`push`**, come da brief. Le modifiche sono nel working tree.
