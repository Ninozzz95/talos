# Il preambolo dei quattro concorrenti, letto NEL CODICE — e cosa deve diventare il nostro

**Data:** 11/09/2026 · **Lane:** `lane/harness-desktop` · **Compito:** ricerca e proposta per **BC-07**
(`.claude/CODA-UNICA-DEBITI-2026-09-06.md`, righe 628-742). **Nessuna riga di codice di prodotto è
stata toccata**: questo file è l'unico scritto.

**Cloni a commit fissato** in `%LOCALAPPDATA%\Temp\talos-competitor`:

| harness | commit | data del commit |
|---|---|---|
| `codex` | `728cb12fe5794b0c3a8e776fb4994b1650b973a8` | 2026-09-03 |
| `claude-code` (repo pubblico: solo changelog/issue) | `f173a697aa6486945f1b9c4aa9ce5383d2c87db6` | 2026-09-02 |
| `hermes-agent-v21` | `365e2835d490a053d076daa3b429371d6f35210f` | 2026-09-02 |
| `deepseek-harness` | `76fda729799fe9b3848dbe2c211d4b231032b81e` | 2026-09-03 |

⛔ Per Claude Code il clone **non contiene il prodotto** (è il repo di changelog e issue). Le
citazioni vengono dal **binario installato sulla macchina dell'owner**,
`~/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe`, **versione 2.1.268**
(`package.json`), dentro cui il bundle JavaScript è leggibile in chiaro, più il file di tipi pubblico
`sdk-tools.d.ts` dello stesso pacchetto. Gli offset di byte sono riportati perché il file non ha righe.

---

## 0. LA RISPOSTA IN UNA RIGA

**Nessuno dei quattro manda al modello un elenco di file. Tutti e quattro mandano invece le
ISTRUZIONI DI PROGETTO — e TALOS è l'unico che manda l'elenco e non manda le istruzioni.**

Il preambolo di TALOS oggi, misurato: **~17.000-20.500 token di elenco file dichiarato INCOMPLETO**,
**84 token di istruzioni del kernel**, e **zero** byte di `AGENTS.md`/`CLAUDE.md`. I quattro
concorrenti stanno fra i **35 token** (Codex) e i **~500** (Claude Code) di stato dell'ambiente, più
un file di istruzioni con un tetto di byte **dichiarato** (32 KiB Codex, 64 KiB DeepSeek, 20.000
caratteri di pavimento in Hermes, 40.000 in Claude Code).

---

## 1. CODEX — `<environment_context>` è **quattro tag**, e l'elenco non esiste

### 1.1 Cosa manda: cwd, shell, data, fuso. Niente altro.

`codex-rs/core/src/context/world_state/environment_render_tests.rs:84-91` — il render atteso,
verbatim, di un contesto d'ambiente completo:

```rust
let expected = format!(
    r#"<environment_context>
  <cwd>{cwd}</cwd>
  <shell>bash</shell>
  <current_date>2026-02-26</current_date>
  <timezone>America/Los_Angeles</timezone>
</environment_context>"#,
```

Sono **~130 caratteri, ~35 token**. L'unica cosa che può allungarlo è il **profilo dei permessi**
(`codex-rs/core/src/context/environment_context.rs:59-71`), che elenca radici di workspace e regole
del filesystem — **non file**:

```rust
    pub(super) fn render(&self) -> String {
        let mut rendered = "<filesystem>".to_string();
        if !self.workspace_roots.is_empty() {
            rendered.push_str("<workspace_roots>");
            for root in &self.workspace_roots {
                push_text_element(&mut rendered, "root", root);
            }
            rendered.push_str("</workspace_roots>");
        }
```

Lo struct dice tutto ciò che il modello può sapere dell'ambiente
(`environment_context.rs:10-30`): `workspace_roots`, `permission_profile`, e dentro il profilo
`entries` + `glob_scan_max_depth`. ⛔ `glob_scan_max_depth` **non è una profondità di elenco**: è il
tetto con cui il sandbox espande i glob di **negazione** (`codex-rs/core/src/config/permissions.rs:380`).
Non ha niente a che vedere col contesto.

### 1.2 Al posto dell'elenco: `AGENTS.md`, con un tetto di byte dichiarato

`codex-rs/core/src/agents_md.rs:1-17` (doc del modulo, verbatim):

```
//! Project-level documentation is primarily stored in files named `AGENTS.md`.
//! ...
//! 1.  Determine the project root by walking upwards from the current working
//!     directory until a configured `project_root_markers` entry is found.
//! 2.  Collect every `AGENTS.md` found from the project root down to the
//!     current working directory (inclusive) and concatenate their contents in
//!     that order.
//! 3.  We do **not** walk past the project root.
```

Il tetto, `codex-rs/core/src/config/mod.rs:228-231`:

```rust
/// Maximum number of bytes of the documentation that will be embedded. Larger
/// files are *silently truncated* to this size so we do not take up too much of
/// the context window.
pub(crate) const AGENTS_MD_MAX_BYTES: usize = DEFAULT_PROJECT_DOC_MAX_BYTES; // 32 KiB
```

### 1.3 Come trova i file: **ripgrep**, e lo dice nel prompt di sistema

`codex-rs/core/gpt_5_2_prompt.md:250`, verbatim:

> `- When searching for text or files, prefer using `rg` or `rg --files` respectively because `rg` is much faster than alternatives like `grep`. (If the `rg` command is not found, then use alternatives.)`

E `:252`: *«Parallelize tool calls whenever possible — especially file reads, such as `cat`, `rg`,
`sed`, `ls`, `git show`, `nl`, `wc`.»*

⛔ Codex **non ha nessun attrezzo di elenco né di glob**: in
`codex-rs/core/src/tools/handlers/` ci sono `shell`, `unified_exec`, `apply_patch`, `view_image`,
`tool_search`, `mcp`… e nessun `ls`/`glob`/`grep`. La scoperta dei file passa **tutta** dalla shell.

### 1.4 Il pezzo che ci riguarda di più: il contesto **NON si rimanda, si DIFFONDE a delta**

Codex modella tutto il contesto visibile al modello come «World State» a sezioni, e a ogni giro
**rende solo le sezioni CAMBIATE**. `codex-rs/core/src/context/world_state/mod.rs:399-418`:

```rust
    /// Renders every section as new, without any known previous state.
    pub(crate) fn render_full(&self) -> Vec<Box<dyn ContextualUserFragment>> {
        self.render_with(|_, _| PreviousSectionState::Absent)
    }

    /// Renders each section against the exact persisted snapshot when available.
    pub(crate) fn render_diff(
        &self,
        previous: &WorldStateSnapshot,
    ) -> Vec<Box<dyn ContextualUserFragment>> {
```

e `:437-448` — il filtro che butta via ciò che non è cambiato:

```rust
        self.sections
            .iter()
            .filter_map(|(id, section)| section.render_diff(previous(id, section.as_ref())))
            .collect()
```

Per `AGENTS.md` la regola è esplicita (`world_state/agents_md.rs:52-79`):

```rust
    fn render_diff(
        &self,
        previous: PreviousSectionState<'_, Self::Snapshot>,
    ) -> Option<Box<dyn ContextualUserFragment>> {
        let current = self.snapshot();
        if matches!(previous, PreviousSectionState::Known(previous) if previous == &current) {
            return None;
        }
```

e quando cambia davvero, non sovrascrive il passato: **appende un messaggio che dichiara la
sostituzione** (`world_state/agents_md.rs:9-11`):

```rust
const REPLACEMENT_NOTICE: &str =
    "These AGENTS.md instructions replace all previously provided AGENTS.md instructions.";
const REMOVAL_NOTICE: &str = "The previously provided AGENTS.md instructions no longer apply.";
```

⇒ **Il prefisso non si riscrive mai. Ciò che cambia arriva IN CODA, come messaggio utente.** È la
differenza fra pagare un prefisso nuovo e pagare venti righe.

**Punti di forza (misurabili):** primo giro ~35 token di ambiente + al massimo 32 KiB di istruzioni;
trova un file a profondità 4-6 con `rg --files | rg <nome>` in **un** giro; la cache del prefisso non
si rompe mai per costruzione, perché il prefisso è immutabile e i cambiamenti si appendono.
**Punti deboli:** dipende da `rg` installato (il prompt stesso ammette il ripiego); ogni scoperta
costa un **giro** di shell, e un giro è latenza che la persona vede; su Windows senza `rg` il ripiego
(`dir /s`, `findstr`) è molto peggiore.

---

## 2. CLAUDE CODE 2.1.268 — il contesto di sessione sono **quattro chiavi**, e nessuna è l'albero

### 2.1 L'elenco completo di ciò che entra nel prompt di sistema

Dal bundle dentro `bin/claude.exe` (offset ≈ 188.487.000), verbatim:

```js
_ur=["preamble","claudeMd","userEmail","attachedProject","currentDate","gitStatus","perforceMode",
     "cacheBreaker","workerToolsContext","Environment","auto memory","Memory","Scratchpad Directory"]
```

**Non c'è nessuna sezione di struttura del progetto.** Il «contesto di sessione» è esattamente
quattro chiavi (offset ≈ 189.778.000):

```js
var soe=["userEmail","attachedProject","gitStatus","perforceMode"],
...
function O$t(e,n,r){let o=soe.flatMap((p)=>e[p]?[`# ${p}\n${e[p]}`]:[]);
  if(o.length===0) return n?`The session context was re-read${...}; the values announced earlier
    (account, project, git status) no longer apply.`:"";
  return `${n?r?`The session context was re-read ${e3(r)}; these values replace the earlier ones:`
    :"The session context has changed; these values replace the earlier ones:"
    :"As you answer the user's questions, you can use the following context:"}
${o.join("\n")}

IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this
context unless it is highly relevant to your task.`}
```

⇒ Stessa scelta di Codex: **si rimanda solo se è cambiato**, e quando cambia si dichiara la
sostituzione. Il confronto è per uguaglianza secca: `function N$t(e,n){return soe.every((r)=>e[r]===n[r])}`.
E le ragioni per cui può cambiare sono un elenco chiuso:

```js
var twe=["session_start","compaction","policy_refresh","directory_added","settings_sync",
         "account_change","hooks_invalidate"];
```

### 2.2 Il blocco `Environment`: otto righe, zero file

Offset ≈ 189.770.800, verbatim:

```js
function CFr(e){let n=Ac,r=[`Primary working directory: ${n(e.workingDirectory)}`,
  e.isWorktree?u$t:null, e.isWorktree?c$t:null,
  `Is a git repository: ${e.isGitRepo}`,
  e.additionalWorkingDirectories.length>0?"Additional working directories:":null,
  e.additionalWorkingDirectories.length>0?e.additionalWorkingDirectories.map(n):null,
  `Platform: ${n(e.platform)}`,`Shell: ${n(e.shell)}`,`OS Version: ${n(e.osVersion)}`,
  e.scratchpadDirectory!==void 0?p$t(n(e.scratchpadDirectory)):null, vFr()].filter((o)=>o!==null);
```

E anche questo si aggiorna **a delta**, campo per campo (stessa regione, `y$t`):

```js
case"workingDirectory":r.push(`Primary working directory: ${Ac(e.workingDirectory)} (was ${Ac(o.from)})`);break;
```

### 2.3 `gitStatus`: **tagliato a 2.000 caratteri**

Offset ≈ 99.984.000:

```js
return G("info","git_status_completed",{duration_ms:Date.now()-e,truncated:_.length>Apt}),
b("context_git_detect"),
["This is the git status at the start of the conversation. Note that this status is a snapshot in
time, and will not update during the conversation.",`Current branch: ${d}`,
`Main branch (you will usually use this for PRs): ${p}`,...T?[`Git user: ${T}`]:[],`Status: …
```

e il tetto, cercato nel binario: `var Apt=2000` / `yEs=2000`. **Duemila caratteri, ~500 token: è
tutto ciò che Claude Code dice del contenuto del repo.**

### 2.4 `CLAUDE.md`: budget al **5% della finestra**, taglio a **200 righe / 25.000 byte**, e un INDICE al posto dei contenuti

Offset ≈ 194.586.000:

```js
var y1s="# Pinned memories (apply to every conversation)",
_1s="Codebase and user instructions are shown below. Be sure to adhere to these instructions.
     IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly
     as written.",
b1s=0.05,GKe=4194304,S1s=40000;
function jQe(e=tt()){let n=lp(e,mp()),r=Number.isFinite(n)&&n>0?n:S_e;
  return Math.max(S1s,Math.round(r*b1s*Lf(e)))}
```

⇒ budget = `max(40.000, 5% della finestra × fattore)`. Il taglio per file, offset ≈ 187.589.000:

```js
function Snt(e,n="index"){let{trimmed:r,lineCount:o,byteCount:d}=$2e(e),p=o>cN,_=d>B1; …
  let G=n==="index"?`${tc} is ${F}. Only part of it was loaded: ${D}. Keep index entries to one line
  under ~200 chars; move detail into topic files.`:`this memory file is ${F}. Only part of it was
  loaded: ${D}. Keep each memory file focused on one topic.`;
  return{content:L+"\n\n> WARNING: "+G, …}}
```

con `cN=200,B1=25000` (cercato nel binario: **una sola occorrenza**). ⛔ Sono **esattamente** i due
tetti che il nostro `CLAUDE.md` di progetto documenta, e questa è la conferma alla fonte: il taglio
c'è, ed è silenzioso a meno che la sezione `WARNING` non venga letta.

E il pezzo più interessante per noi — **la memoria non si manda, si manda il suo INDICE**
(stessa regione):

```js
return{path:cNt,type:"AutoMem",content:`Memory files under \`${e}\` (paths below are relative to it):

${r.content}`,contentDiffersFromDisk:!0}
```

con `cNt="<auto-memory-index>"`. Più: i file di memoria possono dichiarare in frontmatter un campo
`paths` con dei glob (`w1s`), e vengono iniettati **solo quando si lavora su quei percorsi**.

### 2.5 Le sezioni del prompt sono **memoizzate apposta**, e i cambiamenti sono strumentati

Offset ≈ 189.772.900:

```js
function Jb(e,n){return{name:e,compute:n,cacheBreak:!1}}
…
async function k$t(e){let n=vMe();return Promise.all(e.map((r)=>
  r.cacheBreak||!n.has(r.name)?S$t(r.name,r.name,r.compute):Promise.resolve(n.get(r.name)??null)))}
```

⇒ una sezione non viene **ricalcolata** se non è marcata `cacheBreak`: i byte restano identici per
costruzione. E c'è una funzione (`vur`, offset ≈ 188.489.000) che confronta blocchi e sezioni per
`hash` e `len` e produce `changedBlocks / changedSections / addedSections / removedSections`: la
**rottura della cache è una metrica di prodotto**, non un'ipotesi.

### 2.6 Gli attrezzi: `Glob` e `Grep`, mappati su ripgrep

`sdk-tools.d.ts:833-852` (file pubblico dello stesso pacchetto), verbatim:

```ts
export interface GlobInput {
  /** The glob pattern to match files against */
  pattern: string;
  /** The directory to search in. … */
  path?: string;
}
export interface GrepInput {
  /** The regular expression pattern to search for in file contents */
  pattern: string;
  …
  /** Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob */
  glob?: string;
  /** Output mode: "content" … "files_with_matches" … "count" … */
  output_mode?: "content" | "files_with_matches" | "count";
```

**Punti di forza:** contesto d'ambiente ~500 token al massimo (2.000 caratteri di git + 8 righe);
istruzioni di progetto con budget proporzionale alla finestra; rimando **solo a delta**; memoria a
indice + caricamento per glob di percorso; due attrezzi di ricerca con paginazione e modalità
d'uscita. **Punti deboli:** il modello non sa **cosa esiste** finché non chiede (Anthropic lo ammette,
§5); il taglio a 200 righe/25 KB è **silenzioso** se nessuno legge l'avviso — lo abbiamo pagato noi,
sulla nostra memoria; e `gitStatus` fotografa l'inizio e poi mente per tutta la sessione (lo dichiara).

---

## 3. HERMES v0.21 — la «workspace snapshot» è **git + manifest + comandi di verifica**, mai i file

### 3.1 Il blocco, per intero

`agent/coding_context.py:881-932`, verbatim (la parte che costruisce il testo):

```python
def build_coding_workspace_block(cwd: Optional[str | Path] = None) -> str:
    """Workspace snapshot for the system prompt (empty outside a workspace).
    …
    lines = ["Workspace (snapshot at session start — re-check with `git` before acting on it):"]
    lines.append(f"- Root: {root}")
    …
            line = f"- Branch: {head}"
            …
        dirty = [f"{n} {label}" for label, n in (
            ("staged", counts["staged"]), ("modified", counts["modified"]),
            ("untracked", counts["untracked"]), ("conflicts", counts["conflicts"]),
        ) if n]
        lines.append(f"- Status: {', '.join(dirty) if dirty else 'clean'}")

        recent = _git(root, "log", "-3", "--pretty=%h %s")
        if recent:
            lines.append("- Recent commits:")
            lines.extend(f"    {c}" for c in recent.splitlines())

    lines.extend(_project_facts(root))
```

e i «project facts» (`:836-856`), che sono la cosa più intelligente del lotto:

```python
    """Render :func:`detect_project_facts` as workspace-snapshot lines.

    Hands the model its *verify loop* up front — which manifest, which package
    manager, and the exact test/lint/build commands — instead of making it
    rediscover them every session. Built once at prompt-build time; the string
    output must stay byte-stable to preserve the prompt cache.
    """
    …
        line = f"- Project: {', '.join(f.manifests[:6])}"
    …
        facts.append(f"- Verify: {'; '.join(f.verify_commands)}")
    …
        facts.append(f"- Context files: {', '.join(f.context_files)}")
```

Tetti: `_MAX_VERIFY_COMMANDS = 8` (`:150`), `_MAX_FACT_FILE_BYTES = 256 * 1024` (`:151`),
`_CODE_SCAN_MAX_ENTRIES = 500` (`:107`, e serve solo a **decidere se siamo in un progetto di
codice**, non a elencare). Il blocco intero sta in **10-14 righe: ~300-450 caratteri, ~100-130 token.**

### 3.2 Perché non lo ricalcolano mai: lo dichiarano

`agent/coding_context.py:31-38`, verbatim:

```
Cache safety
------------
The mode is resolved **once** and is immutable. The workspace snapshot is built
once at prompt-build time and baked into the *stable* system-prompt tier — never
re-probed per turn (that would shatter the prompt cache). Branch and dirty state
drift mid-session, so the brief tells the model to re-check with ``git`` before
acting on the snapshot.
```

E i tre livelli del prompt (`agent/system_prompt.py:1-22`):

```
The agent's system prompt is built once per session and reused across all
turns — only context compression triggers a rebuild.  This keeps the
upstream prefix cache warm.
…
* ``stable``   — identity …, tool guidance, …, environment hints, coding guidance, platform hints.
* ``context``  — caller-supplied ``system_message`` plus context files
  (AGENTS.md / .cursorrules / etc.) discovered under ``TERMINAL_CWD``,
  plus the session's coding-workspace snapshot.
* ``volatile`` — skills index, memory snapshot, USER.md profile, …
```

⭐ E un principio che vale la pena rubare così com'è (`system_prompt.py:713-716`): la sonda
dell'ambiente *«Emits a single line; emits **NOTHING** when the environment is clean (no token cost)»*.

### 3.3 Le istruzioni di progetto: priorità, primo che vince, e budget proporzionale

`agent/prompt_builder.py:2488-2500`, verbatim:

```
    Priority (first found wins — only ONE project context type is loaded):
      1. .hermes.md / HERMES.md  (walk to git root)
      2. AGENTS.md / agents.md   (merged chain: git root → cwd)
      3. CLAUDE.md / claude.md   (cwd only)
      4. .cursorrules / .cursor/rules/*.mdc  (cwd only)
```

Il budget (`:1507-1534`):

```python
CONTEXT_FILE_MAX_CHARS = 20_000
CONTEXT_TRUNCATE_HEAD_RATIO = 0.7
CONTEXT_TRUNCATE_TAIL_RATIO = 0.2
…
_CONTEXT_FILE_CHARS_PER_TOKEN = 4
_CONTEXT_FILE_WINDOW_FRACTION = 0.06
_CONTEXT_FILE_DYNAMIC_CEILING = 500_000
```

e il taglio **dichiara dove riprendere** (`:2264-2273`):

```python
    marker = (
        f"\n\n[...truncated {filename}: kept {head_chars}+{tail_chars} of "
        f"{len(content)} chars. The middle is omitted — if you need the full "
        f"instructions, read the complete file with the read_file tool: "
        f"{target}]\n\n"
    )
```

### 3.4 L'attrezzo: **un solo `search_files`, e il prompt dice di non usare `ls`**

`tools/file_tools.py:2844-2847`, verbatim:

```python
SEARCH_FILES_SCHEMA = {
    "name": "search_files",
    "description": "Search file contents or find files by name. Use this instead of grep/rg/find/ls
    in terminal. Ripgrep-backed, faster than shell equivalents. …
    File search (target='files'): Find files by glob pattern (e.g., '*.py', '*config*'). Also use
    this instead of ls. Discovery order is the fast bounded default; …",
```

con `limit` default 50, `offset` per la paginazione, `output_mode` `content|files_only|count`, e un
tetto d'uscita a `max_result_size_chars=100_000` (`:2966`). ⛔ In tutto il repo di Hermes **non
esiste un `list_files`** sullo spazio di lavoro (l'unico `list_files` è in un plugin di memoria,
`plugins/memory/retaindb/__init__.py:152`).

### 3.5 La cache la **chiedono**, e dicono che senza marcatori Zhipu GLM serve zero

Già citato in BC-07 e riconfermato qui alla fonte —
`agent/agent_runtime_helpers.py:2365-2397`, verbatim:

```
    Qwen / Alibaba-family models on OpenCode, OpenCode Go, and direct
    Alibaba (DashScope) also honour Anthropic-style ``cache_control``
    markers on OpenAI-wire chat completions. … Without markers
    these providers serve zero cache hits, re-billing the full prompt
    on every turn.
```

e `agent/agent_init.py:986-990`:

```python
    # Anthropic supports "5m" (default) and "1h" cache TTL tiers. …
    # 1h tier costs 2x on write vs 1.25x for 5m, but amortizes across long
    # sessions with >5-minute pauses between turns (#14971).
```

**Punti di forza:** il più ricco dei quattro a costo bassissimo (~100-130 token) e l'unico che dà al
modello **il ciclo di verifica** (quale manifest, quale package manager, quali comandi di test);
istruzioni di progetto con priorità esplicita e taglio che dice dove riprendere; un solo attrezzo di
ricerca, paginato, che sostituisce `ls`. **Punti deboli:** la fotografia di git **invecchia** dentro
la sessione (lo dichiarano e scaricano sul modello l'obbligo di ricontrollare); nessuna idea di
**dove** stiano i file finché non cerca; e il prompt intero si ricostruisce **solo** alla
compressione, quindi un `AGENTS.md` modificato a metà sessione non arriva.

---

## 4. DEEPSEEK HARNESS (`dsh`) — il contesto iniziale è **una frase**, e le istruzioni si APPROFONDISCONO a domanda

### 4.1 La persona di partenza, per intero

`packages/bundle/acp-app/README.md:47` e `packages/bundle/sdk-app/README.md:43`, verbatim:

> The profile supplies `You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.` before the base tool and context contributions.

Le variabili si risolvono in `packages/core/agent-loop/src/index.ts:423`:

```ts
    ctx.systemPrompt.variable('cwd', context => context.agent?.session.header.cwd)
```

### 4.2 Il registro dei progetti esiste — e **non lo vede il modello**

`packages/workspace/workspace/README.md`, verbatim:

> The package is host-side only: the model, tools, and agent loop never see it, so it adds no tokens, prompts, or request context.

⇒ La lista di progetti/cartelle è roba della UI. Al modello non arriva.

### 4.3 Le istruzioni: budget in byte **obbligatorio**, e caricamento progressivo

`packages/context/agent-instructions/README.md`, verbatim:

> `dsh-base` already includes it with a **65,536-byte budget** … Only `maxBytes` is required — it caps the complete rendered baseline so each deployment chooses its prompt budget explicitly.

E il pezzo che nessun altro ha:

> The first request includes one durable baseline message with the user-global `$DSH_HOME/AGENTS.md`
> followed by the project chain … **After a successful `read`, `write`, or `edit` call reaches a
> deeper directory, the next request includes the newly applicable instruction file**; a changed file
> replaces its content, and a file that disappears or duplicates an earlier candidate produces a
> removal notice.

La politica del budget, sempre dal README:

> Rendering keeps the most specific files first: it **drops whole broader files before truncating the
> most-specific file**, and emits a visible `Workspace instruction budget …` notice naming the omitted
> and truncated paths. The rendered bytes never exceed `maxBytes`.

I default, `packages/context/agent-instructions/src/config.ts:11-15`:

```ts
const DEFAULT_PROJECT_ROOT_MARKERS = ['.git'] as const
const DEFAULT_INSTRUCTION_FILE_CANDIDATES = ['AGENTS.md', 'CLAUDE.md'] as const
const DEFAULT_LOCAL_INSTRUCTION_FILE_CANDIDATES = ['AGENTS.local.md', 'CLAUDE.local.md'] as const
const DEFAULT_MAX_SOURCE_BYTES = 1_048_576
```

E il testo che il modello legge (`src/render.ts:12-19`):

```ts
const WORKSPACE_CONTEXT_INTRO = 'The following workspace instructions may be relevant to your work. '
  + 'Use them as guidance when applicable. More specific instructions take precedence over broader ones. '
  + 'They do not override system, developer, or direct user instructions.'
const REPLACEMENT_WORKSPACE_CONTEXT_INTRO = 'This complete workspace instruction baseline replaces all
  earlier workspace instruction baselines. ' + WORKSPACE_CONTEXT_INTRO
```

⇒ Stessa forma di Codex e Claude Code: **si appende una sostituzione dichiarata**, non si riscrive il
prefisso. E il README lo dice esplicitamente: *«Context is durable: injected instructions and
references enter session history as user-role messages, so they persist, replay, and compact like
other conversation content»* (`packages/context/README.md`).

### 4.4 `glob`: tetto 100 risultati, e l'eccedenza finisce **su un file**, non nel contesto

`packages/fs/tool-fs-search/src/glob.ts:23-25`:

```ts
 * config), matching Claude Code's default `GlobTool` result limit.
 */
export const GLOB_MAX_RESULTS = 100
```

e la descrizione dell'attrezzo (`:307-312`), verbatim:

```ts
    description: 'Find files whose paths match a glob pattern. Returns matching file paths — never
      directories — including hidden and ignored files (VCS metadata directories are excluded). '
      + `Up to ${caps.maxResults} paths come back in modification-time order; ${overCapDescription}, `
      + 'says so, and reports where the complete sorted list was saved. This tool does not enumerate
      directory entries.',
```

più la guida di sistema (`:303-305`): *«Use the glob tool — not shell find — to discover files by path
pattern.»* Il «dove è stato salvato l'elenco completo» è il pacchetto **spill**
(`packages/spill/spill-policy/README.md`): *«keeps oversized plain-text tool results out of the
model's context … replaces the model-facing result with a bounded head/tail preview plus the backend's
locator»*.

**Punti di forza:** il preambolo più magro dei quattro (una frase); il budget delle istruzioni è un
**campo obbligatorio** di configurazione, non una costante nascosta; l'approfondimento **a domanda**
(il file di istruzioni profondo arriva solo dopo che il modello ha toccato quella cartella) è
esattamente il compromesso che cerchiamo; l'eccedenza di un risultato va su **disco** con un
puntatore. **Punti deboli:** senza nessuna mappa, il primo giro è cieco quanto Codex; nessun file
watcher — lo dichiarano: *«There is no file watcher — external edits become visible on the next
successful filesystem touch»*; e `glob` *«does not enumerate directory entries»*, quindi non esiste
proprio il concetto di «fammi vedere com'è fatto il progetto».

---

## 5. LA RICERCA WEB (fonte + data), perché il codice da solo non basta

1. **Anthropic, «Effective context engineering for AI agents», 29/09/2025** —
   <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>. Verbatim:
   *«Rather than pre-processing all relevant data up front, agents built with the "just in time"
   approach maintain lightweight identifiers (file paths, stored queries, web links, etc.) and use
   these references to dynamically load data into context at runtime using tools.»* E, su Claude Code:
   *«CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep
   allow it to navigate its environment and retrieve files just-in-time, effectively bypassing the
   issues of stale indexing and complex syntax trees.»* ⛔ Ma la stessa pagina dichiara il prezzo:
   *«runtime exploration is slower than retrieving pre-computed data»*. Il principio guida è *«find the
   smallest set of high-signal tokens that maximize the likelihood of some desired outcome»*.
2. **Chroma, «Context Rot: How Increasing Input Tokens Impacts LLM Performance»** —
   <https://www.trychroma.com/research/context-rot> (letto 11/09/2026): su **18 modelli di frontiera**,
   l'affidabilità cala con l'input **anche molto prima** che la finestra sia piena; *«a model with a
   200K token window can exhibit significant degradation at 50K tokens»*, e il degrado accelera quando
   il bersaglio è semanticamente lontano dalla domanda. ⇒ I nostri 17-20k token di elenco **non sono
   solo un costo: sono rumore che peggiora il resto**.
3. **AGENTS.md** — <https://www.morphllm.com/agents-md-guide> e <https://asdlc.io/practices/agents-md-spec/>
   (letti 11/09/2026): specifica aperta da agosto 2025, donata alla Linux Foundation (Agentic AI
   Foundation) a dicembre 2025; **>60.000 progetti** e **>20 strumenti** la leggono, fra cui tutti e
   quattro i nostri concorrenti. ⇒ Non mandare `AGENTS.md`/`CLAUDE.md` al modello ci mette fuori da uno
   standard che il resto del mondo già usa.
4. **Costo della scoperta a grep contro un indice strutturale** —
   <https://www.morphllm.com/agentic-search> e <https://particula.tech/blog/semantic-code-search-vs-grep-coding-agents>
   (letti 11/09/2026): la scoperta puramente a grep può costare **un ordine di grandezza** in token
   rispetto a una ricerca guidata da struttura, quando il modello non sa da dove partire. ⇒ Il rimedio
   non è l'inventario: è **partire da un punto giusto** (mappa delle cartelle) e poi cercare.
5. **Cache per fornitore** — <https://openrouter.ai/docs/guides/best-practices/prompt-caching> e
   <https://china-llm.com/blog/openrouter-prompt-caching> (letti 11/09/2026): la cache si legge da
   `prompt_tokens_details.cached_tokens`, e *«the deciding variable is how each upstream provider
   integration is wired, which is something you verify per model instead of assuming either way»*.
   ⇒ Combacia con l'A/B di stasera (0 token da cache su `z-ai/glm-5.3-flash` **anche** col
   `cache_control` per blocco): **la cache non è una leva che possiamo dare per certa; il peso del
   preambolo sì.**
6. **Varianza nei banchi di agenti** — τ-bench `pass^k` e la letteratura 2026 su corse ripetute
   (<https://arxiv.org/pdf/2603.29231>, <https://arxiv.org/pdf/2512.06710>, letti 11/09/2026): una sola
   corsa non dice niente, e la metrica che separa «bravo» da «stabile» è **pass^k** (riuscire in
   *tutte* le k ripetizioni), non pass@1. Serve al §8.

---

## 6. TALOS OGGI, misurato adesso (nessun giro pagato)

Misure fatte **con i nostri stessi moduli** (`harness-ui/src/elenco-profondo.mjs` +
`gitignore-elenco.mjs`), script usa-e-getta nello scratchpad di sessione, filtro `.gitignore`
attaccato, esclusa `third_party/` (vendorata) e `scratchpad/` (roba mia, non del progetto).
⛔ **I token sono una STIMA** ottenuta dai caratteri con i due rapporti dichiarati (3,4 char/token,
la nota in `elenco-profondo.mjs`; 4,0 char/token, il rapporto usato da BC-07). I **caratteri** invece
sono contati.

| spazio di lavoro | file | cartelle | **elenco di OGGI** (tetto 1500) | **mappa delle sole cartelle**, completa |
|---|---|---|---|---|
| `AVM/mobile` | 1.842 | 215 | 61.234 char · **15.309-18.010 tok** · ⚠ TRONCATO a 1.500 | 5.725 char · **1.431-1.684 tok** |
| `AVM-harness-desktop` | 4.975 | 559 | 70.023 char · **17.506-20.595 tok** · ⚠ TRONCATO a 1.500 | 20.096 char · **5.024-5.911 tok** |
| `AVM-harness-desktop`, mappa fino a profondità 3 | — | 223 | — | 5.901 char · **1.475-1.736 tok** |
| `AVM/mobile`, mappa fino a profondità 3 | — | 149 | — | 3.306 char · **827-972 tok** |

I 70.023 caratteri combaciano con i «66.523-69.545 caratteri» misurati in BC-07 sui `.jsonl` veri:
le due misure, fatte da due strade diverse, dicono la stessa cosa.

**Tre fatti che cambiano il quadro rispetto a BC-07:**

1. ⛔ **L'elenco non è «un po'» incompleto: mostra il 30% dei file su `mobile` (1.500 su 1.842 …
   5.056 senza escludere `third_party`) e il 30% su questo repo (1.500 su 4.975).** Paghiamo 17-20k
   token per una bugia parziale, e il testo stesso avvisa il modello di non fidarsi.
2. ⛔ **Il ritratto della cartella alla Hermes CE L'ABBIAMO GIÀ, e non lo mandiamo al modello.**
   `harness-ui/src/workspace-info.mjs:105-113` calcola ramo, numero di file non salvati e repo
   annidati; `:132-140` trova `CLAUDE.md`/`AGENTS.md`/`TALOS.md`/`.talos`; `:69-…` conta file e
   cartelle. Tutto questo finisce **nella modale**, non nel prompt. È la lezione
   `chi-guarda-da-fuori-inventa-quello-che-dentro-aveva-gia`, di nuovo.
3. ⛔ **`AGENTS.md`/`CLAUDE.md` non entrano nel prompt.** In `harness-ui/src/` i due nomi compaiono
   solo in `path-policy.mjs:35` (permessi) e nei commenti. Il modello riceve l'inventario dei file e
   **zero** istruzioni del progetto: l'esatto contrario di tutti e quattro i concorrenti.

### 6.1 Il buco che va chiuso PRIMA di togliere l'elenco: `cerca` non è `Grep`

Il banco aveva concluso «serve `cerca`, non un elenco più profondo»
([[talos-non-vede-i-file-del-corpus-storia]]). Giusto — ma `cerca` oggi non è all'altezza, e si vede
nel codice (`harness-ui/src/kernel/talosHarness.mjs:2571-2660`):

```js
const NON_SI_GUARDA = new Set([
    'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.cache',
    '.modelli', '.tmp-research', '.gradle', '.idea', 'android', 'ios', 'vendor',
])
/** Solo i file che un agente di coding puo' voler leggere. */
const ESTENSIONI = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md',
    '.svelte', '.vue', '.css', '.html', '.yml', '.yaml', '.txt',
])
const MAX_FILE = 4_000
const MAX_RISULTATI = 40
const MAX_BYTE_LETTI = 200_000
```

più, in `tuttiIPercorsi`: `if (NON_SI_GUARDA.has(v.nome) || v.nome.startsWith('.')) continue`.

**Misurato su questi due spazi** (stesso script, stesse esclusioni):

| spazio | file | **cercabili per TESTO** | fuori perché la cartella è potata o inizia per `.` | fuori per **estensione** |
|---|---|---|---|---|
| `AVM/mobile` | 1.842 | 1.567 | 247 | 28 |
| `AVM-harness-desktop` | 4.975 | 3.263 | **505** | **1.207** (di cui **1.004 `.php`**) |

⇒ **Il kernel PHP in `core/src` è invisibile alla ricerca per contenuto di `cerca`.** E le cartelle
`android/`, `ios/`, `vendor/`, `.github/` non si guardano mai, a nessuna profondità.

⛔ È lo stesso errore che `elenco-profondo.mjs:39-49` argomenta a lungo per non fare:
*«una ALLOWLIST ("tieni solo .js e .md") invecchiando fa sparire un file che esiste … e il modello
concluderebbe che non c'è: è la BUGIA che questo modulo esiste per non dire»*. Due moduli nostri, due
regole opposte, e quella sbagliata è nell'attrezzo su cui vogliamo scommettere.

**Altre tre differenze misurabili contro i quattro:**

| capacità | Codex | Claude Code | Hermes | dsh | **TALOS `cerca`** |
|---|---|---|---|---|---|
| glob di percorso (`**/*.kt`) | sì (`rg --files` + filtro) | sì (`Glob`) | sì (`target:'files'`) | sì (`glob`) | **no** — solo sottostringa in `nome` |
| regex sul contenuto | sì (`rg`) | sì (`Grep`) | sì (ripgrep) | sì (`grep`) | **no** — `includes()` insensibile a maiuscole |
| paginazione / `offset` | n/d | `head_limit`+`offset` | `limit`/`offset` | cursore | **no** — 40 e basta |
| modalità d'uscita (solo nomi / conteggio) | n/d | sì | sì | sì | **no** |
| eccedenza su file (spill) | n/d | no | tetto a 100k char | **sì** | no |
| motore | ripgrep | ripgrep | ripgrep | ripgrep | **JS, `leggi()` file per file** |

Infine, un difetto piccolo e concreto: la descrizione di `elenca`
(`talosHarness.mjs:1303-1306`) promette *«Lists the files of the workspace, **with their sizes**»*,
ma l'implementazione (`:6119-6125`) unisce solo i nomi — le dimensioni non ci sono. Una descrizione
che promette ciò che non consegna è un invito a un giro sprecato.

---

## 7. LA PROPOSTA — «esattamente come i competitor», più il loro punto debole risolto

### 7.1 Il principio, in una riga

**Il preambolo dice CHE FORMA ha il progetto e COME si lavora qui; non dice quali file esistono.
E non si riscrive mai: ciò che cambia si appende in coda.**

### 7.2 Il preambolo nuovo, quattro blocchi in ordine di stabilità

| # | blocco | contenuto | da chi lo prendiamo | costo stimato |
|---|---|---|---|---|
| 1 | **Istruzioni del kernel** | invariate | — | **84 tok** |
| 2 | **Scheda di lavoro** | radice · ramo · stato git a **conteggi** (non lista) · 3 commit · piattaforma/shell/OS · permesso del giro · manifest trovati · **comandi di verifica** · quali file-istruzione esistono | Hermes (`coding_context.py:881-932`) + Claude Code (`Environment`, ≤2.000 char di git) | **~150-250 tok** |
| 3 | **Istruzioni di progetto** `AGENTS.md`/`CLAUDE.md` | catena dalla radice del progetto al cwd, il più specifico vince, **tetto di byte dichiarato** e taglio che dice dove riprendere | Codex (32 KiB) · dsh (65.536, campo obbligatorio) · Hermes (head 70% / tail 20% + puntatore a `leggi`) | **tetto: 24.000 char ≈ 6.000-7.000 tok**, oggi **0** |
| 4 | **Mappa delle CARTELLE** | ogni cartella del progetto, **completa**, con `(n)` file per cartella; tetto sulle **cartelle**, non sui file; se morde, si taglia in profondità e **lo si dichiara** | **nessuno dei quattro** — è il nostro +1 | **~1.000-1.700 tok** (mis. §6) |

**Totale stimato del preambolo: ~1.250-2.050 token** quando non c'è un `AGENTS.md`, e fino a
**~8.000** se il progetto ne ha uno grosso (ma quello è contenuto **utile**, non inventario).
Contro i **17.500-20.600** di oggi.

**Risparmio a messaggio: ~15.500-19.300 token sull'elenco**, cioè — sulla mediana misurata in BC-07
di **29.148 token in ingresso al primo giro di ogni invio** — un preambolo che scende a
**~10.000-13.500 token, il 46-66% in meno.** ⛔ È una **stima**, e il §8 esiste per confermarla o
smentirla.

**Perché il blocco 4 e non zero come i quattro.** I quattro possono permettersi zero perché hanno
ripgrep, glob, regex, paginazione e giri praticamente illimitati. Noi abbiamo **`GIRI_MASSIMI = 24`**
e il banco ha già misurato che **TALOS esaurisce i giri, non le capacità**
([[talos-esaurisce-i-giri-non-le-capacita]]: fallisce in 80 s mentre gli altri ne usano 332-630).
Una mappa **completa** delle cartelle a ~1.000-1.700 token è il 5-9% di quello che paghiamo oggi, non
mente mai (non è troncata), e toglie i giri di orientamento. È la sintesi fra il «just-in-time» di
Anthropic e la loro stessa ammissione che *«runtime exploration is slower than retrieving
pre-computed data»*.

### 7.3 Il pezzo architetturale da importare: **il contesto si appende, non si riscrive**

Oggi `contestoDelProgetto` viene ricostruito e rimesso **in testa** a ogni invio
(`agent-service.mjs:1686` → il kernel «lo mette in testa al prompt»). Tutti e tre gli harness che
gestiscono contesti mutevoli fanno il contrario:

- Codex: `WorldState::render_diff` (`world_state/mod.rs:405-418`) rende **solo le sezioni cambiate** e
  le appende come messaggi utente, con `REPLACEMENT_NOTICE`;
- Claude Code: *«The session context has changed; these values replace the earlier ones»*, con un
  confronto per uguaglianza secca e un elenco chiuso di cause;
- dsh: *«This complete workspace instruction baseline replaces all earlier workspace instruction
  baselines»*, appeso come messaggio utente durevole.

⇒ **Regola nuova per noi:** il preambolo (blocchi 1-4) si costruisce **una volta per sessione** e non
si tocca più. Quando la mappa o le istruzioni cambiano davvero (`WorkspaceChanged`, un `AGENTS.md`
salvato), **non si rigenera il prefisso**: si appende in coda un messaggio che dichiara la
sostituzione. Questo vale anche se la cache del fornitore non prende: un prefisso che non cambia è
comunque **meno byte** e **meno rumore**.

### 7.4 L'approfondimento a domanda (da dsh)

Quando il modello legge o scrive dentro una cartella profonda, **al giro dopo** gli arriva in coda la
lista dei file **di quella cartella** (tetto dichiarato, es. 100 voci come `GLOB_MAX_RESULTS`), e
l'`AGENTS.md` di quella cartella se esiste. Costo: zero finché non serve; e paga solo dove il modello
sta effettivamente lavorando. È il meccanismo di `dsh-agent-instructions`, applicato anche ai file.

### 7.5 `cerca` e `elenca` portati al livello dei quattro (prerequisito, non optional)

⛔ **Questo va fatto PRIMA di togliere l'elenco**, altrimenti si ripete alla lettera
[[ho-azzoppato-aider-ragionando-sul-costo]]: tolta una fonte di contesto «per risparmiare», i
risolti crollarono da 9/15 a 5/15.

1. **DENYLIST al posto della allowlist** in `ESTENSIONI` (la regola che `elenco-profondo.mjs:39-49`
   argomenta già): oggi **1.004 file `.php` del nostro kernel** non sono cercabili per contenuto.
2. **Niente `startsWith('.')` cieco** e `android`/`ios`/`vendor` fuori dalla lista fissa: **505 file**
   di questo repo sono invisibili a `cerca` per questa sola riga. Se una cartella va potata lo dice il
   `.gitignore`, come già fa `elenco-profondo.mjs`.
3. **Glob di percorso** (`**/*.kt`) e **regex sul contenuto**, con `output_mode` `contenuto|solo-nomi|conteggio`
   e `offset` per la paginazione — i quattro ce l'hanno tutti.
4. **Motore**: usare `rg` quando c'è, col ripiego attuale quando non c'è (è ciò che il prompt di Codex
   dichiara, `gpt_5_2_prompt.md:250`). Oggi `cerca` legge i file uno a uno da JS.
5. **L'eccedenza su file** (spill, da dsh) invece che in contesto, con il percorso nel risultato.
6. `elenca`: o consegna le dimensioni che promette, o la promessa sparisce dalla descrizione.

### 7.6 Cosa NON cambia

- **BC-16 resta**: `cache_control` con TTL 1h, marcatore sull'ultimo blocco cacheable, layout
  sull'envelope per OpenRouter. Ma **non è più la prima cura**: l'A/B di stasera su
  `z-ai/glm-5.3-flash` ha dato **0 token da cache anche con i marcatori per blocco**, e la
  documentazione di OpenRouter dice che il comportamento si **verifica per modello**, non si assume.
  La cache resta un moltiplicatore incerto; il peso del preambolo è una leva certa.
- La cache per cartella di `contesto-del-progetto.mjs` e `segnalaFileCambiati` restano: servono
  esattamente alla stabilità dei byte.

---

## 8. LA REGOLA DEL BANCO — come va riscritta, e perché

L'owner ha autorizzato la riscrittura. Serve, e per una ragione precisa: **con le regole di oggi,
questa cura è INVISIBILE al banco.**

Oggi una riga del banco porta esito e millisecondi; il costo del **preambolo** non è una colonna, i
**giri usati** non sono una colonna, e il verdetto è binario su 3 ripetizioni. Una cura che toglie
15.000 token al primo giro e libera giri può benissimo lasciare il pass-rate identico e apparire
**inutile**, o cambiarlo di 1-2 task e apparire **decisiva** per caso.

**Le cinque modifiche, in ordine:**

1. **La metrica primaria diventa `pass^3`** (riuscire in **tutte e tre** le ripetizioni), con
   `pass@1` come secondaria e l'intervallo bootstrap su entrambe. Motivo misurato: il banco ha già
   scoperto che **26 task su 35 riescono almeno una volta e solo 9 falliscono sempre**
   ([[la-campagna-e-lo-strumento-non-si-parlavano]]) ⇒ il difetto vero è l'**instabilità**, e un
   esito «riuscito almeno una volta» la nasconde. È la metrica `pass^k` di τ-bench
   (<https://arxiv.org/pdf/2603.29231>, letto 11/09/2026).
2. **Due colonne nuove e obbligatorie su ogni riga: `tokenPrimoGiro` e `giriUsati`.** Senza, questa
   cura non ha una misura — e vale per qualunque cura sul contesto, non solo per questa.
   `giriUsati` va confrontato con `GIRI_MASSIMI`: un task che finisce i giri non è un task fallito,
   è un task **strozzato**, esattamente come un 429 non è un fallimento
   ([[il-429-non-e-un-fallimento]]).
3. **Il corpus `storia` si tiene, ma si SPACCA in due popolazioni dichiarate:** i **9 che non
   riescono mai** (dove agisce una cura sulla *cecità*: mappa + `cerca`) e i **26 instabili** (dove
   agisce una cura sulla *stabilità*). Mescolarli vuol dire misurare due cose diverse con un numero
   solo. ⛔ E la premessa scritta nell'intestazione del corpus — «TALOS è cieco sui file, 0 su 35» —
   **è smentita** e va corretta nel file, o continuerà a giustificare la cura sbagliata.
4. **Le tre ripetizioni restano tre finché il bootstrap non dice che non bastano.** Se l'intervallo
   su `pass^3` fra i due bracci si sovrappone, si sale a 5 — deciso **da una misura**, non a priori
   (è la disciplina già usata in [[stadio-b-tre-condizioni-scartate]]).
5. **Resta intatta** la regola che `talos.jsonl` **non si riscrive mai**
   ([[corri-riscrive-il-file-se-ripetizioni-non-combacia]]), e resta l'ordine dell'owner dell'11/09:
   **il banco non si riavvia finché non gira alla perfezione.**

---

## 9. IL PIANO DI MISURA — prima/dopo, e nessuna cura senza

**Cancello 0 (prima di tutto).** Le tre riparazioni già note del banco (il modello con **più di un
fornitore**, il ritentativo sul 429, il taglio a 4.000 caratteri della diagnosi:
[[le-cinque-leve-di-talos-quattro-disarmate]]) e le due colonne nuove del §8.2. Senza, la corsa
produce numeri che non si possono leggere.

**Disegno: A/B nello stesso momento, mai contro una campagna di ieri**
([[una-corsa-fallita-riporta-i-numeri-di-ieri]], [[il-conteggio-di-una-suite-non-ermetica-non-e-una-prova]]).

| | braccio A (controllo) | braccio B (cura) |
|---|---|---|
| preambolo | elenco di oggi (tetto 1.500) | scheda + `AGENTS.md` + mappa cartelle |
| `cerca` | com'è oggi | denylist + glob + regex + paginazione (§7.5) |
| modello | `z-ai/glm-5.3-flash`, identico | identico |
| corpus | `storia`, 35 task, **le due popolazioni marcate** | identico |
| ripetizioni | 3 | 3 |
| giri massimi | 24 | 24 |

**Metriche, in quest'ordine (tutte per popolazione, non aggregate):**

1. `pass^3` e `pass@1`, con intervallo bootstrap;
2. **token in ingresso al PRIMO giro** (mediana e massimo) — è la grandezza che la cura tocca
   direttamente, e oggi la mediana è **29.148**;
3. **giri usati** e quanti task hanno toccato il tetto di 24;
4. **costo per task RISOLTO** — mai il costo totale da solo: è la lezione
   [[ho-azzoppato-aider-ragionando-sul-costo]] (costo totale quasi identico, risolti dimezzati);
5. **tempo al primo token** ⛔ **solo se** il buco di BC-07 è chiuso: oggi gli istanti vivono in
   memoria e non finiscono nel `.jsonl`. Finché non ci finiscono, di latenza si parla per aneddoti e
   questa metrica **si dichiara non misurata**.

**Criterio di accettazione, scritto prima di guardare i numeri:**
la cura passa se **(a)** `pass^3` del braccio B non è inferiore a quello di A oltre l'intervallo
bootstrap, **(b)** i token al primo giro scendono di almeno il 40%, e **(c)** il costo per risolto non
sale. Se `pass^3` cala sui **9 ciechi**, la mappa delle cartelle non è bastata e il passo successivo è
la profondità della mappa, **non** il ritorno all'inventario.

**Prova al verso contrario** ([[provare-sempre-anche-il-verso-contrario]]): un task che nomina un file
a profondità 5 che **non esiste** deve far dire al modello «non c'è», non farglielo inventare; e un
task che nomina un file `.php` a profondità 4 (oggi invisibile a `cerca`) deve essere trovato dal
braccio B e non da quello A. Se questi due non separano i bracci, il banco non sta misurando la cura.

---

## 10. COSA NON HO POTUTO VERIFICARE

1. ⛔ **Nessun giro vero col modello** (vietato dal brief, e costa): **tutti i token di questo
   rapporto sono STIME** ricavate dai caratteri con i rapporti dichiarati (3,4 e 4,0 char/token). I
   **caratteri** sono contati davvero. Il contatore vero (`harness-ui/src/context-token-counters.mjs`)
   interroga il fornitore, cioè sarebbe una chiamata pagata.
2. ⛔ **Claude Code è letto dal BINARIO installato** (`claude.exe` 2.1.268), non dal sorgente. Le
   stringhe che ho citato sono nel bundle, ma **non ho potuto provare quale ramo sia attivo**: una
   sezione dietro a un flag spento esisterebbe comunque nel file. Il clone `claude-code` del disco è
   solo changelog e issue, non contiene il prodotto.
3. ⛔ **Codex**: ho letto il percorso CLI/`core`. Non ho verificato l'`app-server`/modalità cloud, dove
   un host diverso potrebbe iniettare altro contesto.
4. ⛔ **Hermes e dsh**: lettura statica, nessuna esecuzione. Il costo reale dei loro blocchi l'ho
   stimato dal formato del codice, non contato su una corsa.
5. ⛔ **Il tempo al primo token non è misurato** né per noi né per loro: da noi non si persiste
   (BC-07), quindi non so **quanto** dei 27 s dell'owner siano token e quanto sia il fornitore. La
   stima di risparmio è sui **token**, non sui **secondi**.
6. ⛔ **Non ho provato che togliere l'elenco non abbassi il pass-rate.** È precisamente la domanda a
   cui il §9 deve rispondere, e finché non risponde questa proposta resta **una proposta**.
7. ⛔ **Non ho verificato il costo di costruzione** della mappa delle cartelle su uno spazio molto
   grande (il workspace `Desktop` dell'owner): le mie misure sono su `AVM/mobile` (1.842 file) e su
   questo repo (4.975 file dopo l'esclusione di `scratchpad/`). Su un albero da centomila file la
   camminata completa va misurata prima, non dopo.
8. ⛔ **Una cosa trovata e non indagata:** in questo worktree `scratchpad/prove` contiene **8.635 file**
   non ignorati da git, cioè **il 63%** dell'elenco che oggi paghiamo su questo repo è roba di
   sessione, non del progetto. Il filtro `.gitignore` non basta a tenere fuori l'untracked. Da
   decidere separatamente.

---

### Riepilogo veloce

**Cosa devi fare tu** — tre scelte secche: **(1)** approvo la mappa delle cartelle al posto
dell'elenco dei file (sì / no / prima l'A/B)? **(2)** approvo l'iniezione di `AGENTS.md`/`CLAUDE.md`
nel preambolo con un tetto di byte (sì / no)? **(3)** approvo la riscrittura della regola del banco
del §8, che tocca metrica primaria, colonne e corpus (sì / no / solo le colonne)?

**Cosa faccio io** — niente, finché non rispondi: questo è un compito di ricerca e il codice di
prodotto non l'ho toccato. Al primo sì parto dal §7.5 (`cerca`), che è il prerequisito, non dalla
mappa.

**Cosa rimane** — il tempo al primo token non è misurabile finché gli istanti non finiscono nel
`.jsonl` (buco dichiarato in BC-07); la cache su `z-ai/glm-5.3-flash` resta a **0** e non so ancora
perché; `scratchpad/prove` gonfia del 63% l'elenco di questo repo e nessuno l'ha deciso; e la
descrizione di `elenca` promette dimensioni che non consegna.
