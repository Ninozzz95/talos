# `cerca` vede tutto — lotto 1 di 3 di BC-07

**Data:** 11/09/2026 · **Lane:** `lane/harness-desktop` · **File toccati:**
`harness-ui/src/kernel/talosHarness.mjs` (solo `cerca` e i suoi aiutanti, +288/−50) e
`harness-ui/tests/cerca-kernel.test.mjs` (nuovo). Nessun giro col modello, nessuna porta 4174,
nessun comando git.

---

## 1. LA MISURA PRIMA

Denominatore: **i file che `git` NON ignora**, calcolato con `creaFiltroGitignore`
(`harness-ui/src/gitignore-elenco.mjs`). Contare `node_modules` gonfierebbe la percentuale e non
direbbe niente.

| spazio | file del progetto | **cercabili per CONTENUTO** | mai raccolti (cartella potata o nome che inizia per `.`) | raccolti ma muti (fuori per estensione) |
|---|---|---|---|---|
| `AVM-harness-desktop` | 25.713 | **1.292 — 5,0 %** | 23.251 | 1.170, di cui **1.003 `.php`** |
| `harness-ui` | 744 | 673 — 90,5 % | 26 | 45 |

⛔ E un terzo difetto che il rapporto di ieri non aveva contato: sul repo intero il tetto
`MAX_FILE = 4.000` **mordeva**, la camminata si fermava, e la risposta continuava a dire
`Scanned 4000 files` — indistinguibile da un albero di 4.000 file davvero finito.

**La prova che il buco era vero, non dedotto:** `cerca {testo:"namespace"}` sul repo intero
tornava **zero** file `.php`, con 751 file `.php` sul disco che quella parola ce l'hanno dentro.

**Tempi su tutto `harness-ui/`** (attrezzo vero, mediana di 5 giri):

| domanda | mediana | min · max |
|---|---|---|
| `cerca {testo:"cercaNelProgetto"}` | **269 ms** | 233 · 337 |
| `cerca {nome:"gitignore"}` | 50 ms | 45 · 50 |
| `cerca {testo:"…"}` che non trova niente | 245 ms | 236 · 255 |

E una misura che spiega perché: `cerca` camminava su **2.234** file per servire uno spazio che
ne ha **744** — la differenza sono artefatti che `git` ignora e che nessuna lista di nomi fissa
poteva sapere.

⛔ Quarto fatto, trovato prima di scrivere: **`cercaNelProgetto` non aveva NESSUNA prova**, né in
`src/kernel/talosHarness.test.mjs` né in `tests/`. L'attrezzo che decide che cosa il modello vede
del progetto, senza una riga che lo provasse.

---

## 2. LE FONTI — solo con data e con misure

1. **ripgrep, `GUIDE.md`, sezione BINARY DATA** — letta l'11/09/2026 (fonte primaria).
   *«a file is considered "binary" if and only if it contains a `NUL` byte somewhere in its
   contents»*; *«as soon as a file is detected as binary, searching stops»*; con memory map la
   rilevazione guarda *«the first few kilobytes»*.
   ⛔ **Misurato qui, con ripgrep 15.2.0 installato su questa macchina:**
   ```
   $ rg -n "cercaNelProgetto" src/kernel/talosHarness.mjs
   binary file matches (found "\0" byte around offset 22789)
   $ rg -n --text "cercaNelProgetto" src/kernel/talosHarness.mjs
   2621:export async function cercaNelProgetto(disco, { testo, nome }) {
   ```
   Il kernel di TALOS contiene **un** byte NUL letterale (dentro un template usato come
   separatore, un NUL su 456.881 byte = 0,0002 %) e la regola di ripgrep lo dichiara binario.
   ⇒ **Adottare quella regola renderebbe il file più importante del progetto invisibile al suo
   stesso agente.** È la ragione per cui la nostra seconda rete è una densità, non un byte.
2. **«Code Search for AI Agents: ripgrep, ast-grep, or Semantic?»** — 19/05/2026. Latenze
   misurate per backend: **ripgrep 1-5 ms · ast-grep 10-50 ms · repo-map 50-200 ms · embeddings
   100 ms-1 s**. Riporta il benchmark **CoREB (maggio 2026)**: *«Short keyword queries, the format
   closest to real developer search, collapse nearly every semantic model tested to near-zero
   nDCG@10»*. Consiglia un tetto d'uscita (`head -50`) come *«dominant savings lever»* e un budget
   di ricerca ≈ **15 % della finestra di contesto**.
3. **«Code search for AI agents: the grep replacement is three tools, not one»** — 06/06/2026.
   ripgrep cerca `[A-Z]+_SUSPEND` nel kernel Linux in **0,082 s** contro **0,273 s** di `git grep`;
   Zoekt (indice a trigrammi) **sotto i 50 ms** su corpora da ~2 GB. Uno strato lessicale con
   ranking BM25 misura **R@5 55,1 %** contro **17,3 %** di ripgrep e **R@1 42,3 %** contro **0,0 %**;
   su una query reale l'uscita scende da **31.530 a 972 token** con recall@2k **1,00** contro **0,00**.
4. **«Semantic Code Search vs Grep for Coding Agents»** — 06/07/2026. `semble` indicizza un repo
   medio in **~250 ms** e risponde in **~1,5 ms**; `claude-context` dichiara **~40 %** di token in
   meno a parità di qualità. ⛔ E l'avvertimento che conta per noi: la ricerca semantica *«can
   silently miss the one that mattered»* — un taglio silenzioso, cioè esattamente ciò che questo
   lotto esiste per togliere.
5. **Claude Code 2.1.117 (aprile 2026)** ha sostituito `rg` con **ugrep + bfs** sulle build native
   macOS/Linux, invocati da Bash. ⇒ Perfino chi ha inventato l'attrezzo `Grep` sta spostando la
   ricerca su un binario esterno: la scelta del motore è viva, non decisa.

**Cosa ho SCARTATO, con la ragione numerica.** Niente indice semantico e niente BM25: le domande
che `cerca` riceve sono **nomi di test rossi e nomi di simboli**, cioè esattamente le *short
keyword queries* su cui CoREB misura nDCG@10 ≈ 0. Niente `ast-grep`: risolve query di forma, che
non è il buco di oggi. Un ranking BM25 (fonte 3, +38 punti di R@5) resta il candidato più forte per
un lotto futuro, e **non è questo lotto**.

---

## 3. COSA FANNO I CONCORRENTI, letto nel loro codice

Cloni in `%LOCALAPPDATA%\Temp\talos-competitor`.

**Codex** — nessun attrezzo di ricerca: lo dice al modello nel prompt di sistema.
`codex/codex-rs/core/gpt_5_2_prompt.md:250`: *«When searching for text or files, prefer using `rg`
or `rg --files` respectively because `rg` is much faster than alternatives like `grep`. (If the
`rg` command is not found, then use alternatives.)»* Il parser dei comandi riconosce `rg --files`,
`rg --files-with-matches`, `rg --files-without-match` come forme canoniche
(`codex/codex-rs/shell-command/src/parse_command.rs:184, 221-238, 280-308`).

**DeepSeek harness (dsh)** — due attrezzi, e **due politiche opposte sul `.gitignore`**:
- `glob` (trovare file per percorso) gira `rg --files … --no-ignore --hidden`
  (`packages/fs/tool-fs-search/src/glob.ts:89-108`): vede **anche** gli ignorati e i nascosti,
  e pota solo i metadati dei VCS (`GLOB_VCS_EXCLUDES`, `:27-36`). Tetto **`GLOB_MAX_RESULTS = 100`**
  (`:25`), *«matching Claude Code's default GlobTool result limit»*.
- `grep` (cercare nel contenuto) gira `rg --json --regexp=…` **senza** `--no-ignore` e **senza**
  `--hidden` (`src/grep.ts:111-116`): cioè con i default di ripgrep, `.gitignore` **rispettato**.
- L'eccedenza è onesta e ha una via di recupero: `formatGrepOutput` (`src/grep.ts:215-225`) scrive
  `Found ${kept} of ${seen} matches` più *«Full grep result stored at: …»* oppure *«The complete
  result could not be saved; narrow pattern, path, or include to see more.»*; il file completo lo
  salva `trySaveFormattedResult` (`src/search-core.ts:363-401`). Il commento sopra è il criterio che
  ho adottato: *«The omitted count is a budget fact: the search itself completed.»*
- `GREP_MAX_LINE_BYTES = 2000` per riga mostrata (`src/grep.ts:30-33`).
- `sampleAcrossTopLevel` (`src/glob.ts:254-338`) sceglie la pagina **a giro fra le cartelle di
  primo livello**: *«Every top-level entry receives a slot before any receives a second; exhausted
  groups drop out.»*

**Hermes Agent v0.21** — un solo `search_files` al posto di `ls`/`grep`/`find`, sopra `rg`
(`hermes-agent-v21/tools/file_operations.py`), e la rilevazione dei binari è a **due strati**:
- estensione, con una **denylist** dichiarata (`tools/binary_extensions.py:7-25`, `BINARY_EXTENSIONS`
  frozenset; nota esplicita *«exclude .pdf — text-based, agents may want to inspect»*);
- contenuto, `_is_likely_binary` (`tools/file_operations.py:1286-1310`): *«Content analysis: >30%
  non-printable chars = binary»*, più un caso al byte (`_is_likely_binary_bytes`, `:1252-1284`) che
  usa il NUL **e** la validità UTF-8, con la tolleranza per la sequenza tagliata in coda.
- Dettaglio operativo che ci riguarda: pretende **ripgrep 14 o più recente** per l'ordine per data
  di modifica (`:1180-1194`).

**Claude Code** — `Glob`/`Grep` mappati su ripgrep, oggi ugrep+bfs (fonte 5), tetto di 100 risultati
per `Glob` (citato da dsh sopra).

⇒ **Dove stavamo noi:** unico dei quattro con una **allowlist** di estensioni, unico senza
`.gitignore`, unico con `includes()` insensibile alle maiuscole al posto di un motore.

---

## 4. LA CURA

`harness-ui/src/kernel/talosHarness.mjs`, blocco `cerca` (righe ~2574-2860) e il punto di chiamata
(~6331). **Lo schema dell'attrezzo non è cambiato: zero token in più nel prefisso.**

1. **Via la allowlist.** Nessun elenco di estensioni da tenere. È la regola che
   `src/elenco-profondo.mjs:39-49` argomentava già per l'elenco — *«una ALLOWLIST invecchiando fa
   sparire un file che esiste … è la BUGIA che questo modulo esiste per non dire»* — e che il
   nostro attrezzo di ricerca contraddiceva.
2. **Il `.gitignore` VERO decide che cosa si pota**, con `creaFiltroGitignore` **riusato, non
   riscritto** (930 confronti contro `git check-ignore` senza un disaccordo). Il filtro si
   costruisce una volta per cartella e si tiene **5 minuti** (17 ms su `harness-ui/`, 1.211 ms sul
   repo intero, 969 regole da 57 file); non per sempre, perché un `.gitignore` si modifica mentre
   la sessione è viva.
3. **Via `nome.startsWith('.')`, via `android`/`ios`/`vendor`.** Restano potati **sempre** due soli
   nomi, che non sono sorgente in nessun progetto: `.git` e `node_modules`. Senza `.gitignore`
   (ponte del telefono, test, cartella che non è un repo) c'è un ripiego corto e dichiarato
   (`dist`, `build`, `coverage`, `.next`, `.cache`, `.gradle`, `.idea`, `.modelli`, `.tmp-research`).
4. **Denylist dei binari, importata da `elenco-profondo.mjs`** (`ESTENSIONI_ESCLUSE_PREDEFINITE`):
   immagini, media, archivi, eseguibili, caratteri tipografici, pesi dei modelli, basi di dati.
   Mai una copia che diverge.
5. **Seconda rete sul contenuto**, la regola di densità di Hermes (>30 % di caratteri di controllo
   nei primi 1.000), **non** il singolo NUL di ripgrep — per il motivo misurato al §2.
6. **Taglia letta da `disco.elenca`**: sopra 8 MB il file non si apre affatto, e il conto lo dice.
7. **Camminata in AMPIEZZA con le voci ordinate** (decisione 3 di `elenco-profondo.mjs`): con un
   tetto, ciò che sopravvive è la roba vicina alla radice, e l'ordine non dipende da `readdir`.
8. **Ogni tetto che morde diventa una riga nella risposta.** Quattro tetti dichiarati — camminata
   20.000, letture 5.000, 200 KB per file, 40 risultati — più lo stop a 120 risultati, che rende il
   residuo un **minimo**: `… and 80+ more matches not shown` e `⚠ I stopped looking after 120
   matches: there may be more than the count below.` E l'insuccesso porta la misura, non una
   formula: `no file matches. Scanned 746 files (710 read for content, 36 skipped as binary).`

### ⛔ Una condizione SCARTATA, e si scrive perché

Avevo scritto anche il **giro fra le cartelle di primo livello** (la tecnica di dsh,
`glob.ts:254-338`), convinto che `scratchpad/prove` — 15.482 file su 25.714 — affamasse
`control-plane/` (793 `.php`) e `core/` (210). **L'A/B l'ha smentita**, sullo stesso albero e con lo
stesso tetto:

| | percorsi raccolti | `.php` raccolti | control-plane · core |
|---|---|---|---|
| ampiezza pura | 20.000 | **1.004 / 1.004** | 1.710 · 333 |
| a giro fra le cartelle | 20.000 | 1.004 / 1.004 | 1.710 · 333 |

E sull'ordine di **lettura**, a parità di budget: **106 `.php` trovati con l'ordine della camminata
contro 107 col giro** — perché lo stop a 120 risultati scatta dopo 1.012-1.368 letture, molto prima
del tetto di 5.000. ⇒ Tolta, come le tre condizioni dello Stadio B del banco: una cura che la
misura non distingue dal rumore non paga la sua complessità.

⛔ E lo zero `.php` che mi aveva convinto era **una sonda sbagliata**: cercavo `namespace Talos` e
`kadmos_bench`, stringhe che in quei file non esistono. Con `namespace` (751 `.php` la contengono) il
conto tornava già. Ho quasi curato un difetto che non c'era, e scritto un commento falso con dentro
un numero: il commento è stato riscritto con l'A/B vero.

---

## 5. LA MISURA DOPO — stesse domande, stesso denominatore

| spazio | file del progetto | **cercabili per CONTENUTO** | prima |
|---|---|---|---|
| `AVM-harness-desktop` | 25.714 | **18.338 — 71,3 %** (il resto è oltre il tetto di 20.000, **dichiarato**) | 1.292 — 5,0 % |
| `harness-ui` | 745 | **709 — 95,2 %** | 673 — 90,5 % |

**Tempi su tutto `harness-ui/`** (mediana di 5 giri, stessa macchina, stesse domande):

| domanda | prima | dopo | |
|---|---|---|---|
| `cerca {testo:"cercaNelProgetto"}` | 269 ms | **142 ms** | −47 % |
| `cerca {nome:"gitignore"}` | 50 ms | **15 ms** | −70 % |
| `cerca {testo:"…"}` che non trova niente | 245 ms | **139 ms** | −43 % |

⇒ **Più completo E più veloce**, e non per caso: camminare col `.gitignore` significa aprire 745
file invece di 2.234, cioè smettere di leggere gli artefatti che il progetto stesso considera
rumore. La scansione completa del contenuto di `harness-ui/` costa 17 ms di filtro + 11 ms di
camminata + 118 ms di lettura (10,0 MB su 708 file).

**Il buco chiuso, misurato:** `cerca {testo:"namespace"}` per contenuto.

| cartella di lavoro | prima | dopo | tempo |
|---|---|---|---|
| `control-plane/` | 0 `.php` | **39 `.php`** nella risposta | 163 ms |
| `core/` | 0 `.php` | **39 `.php`** | 53 ms |
| repo intero | 0 `.php` | **26 `.php`**, con i due tetti dichiarati in coda | 4.223 ms |

**Le prove al verso contrario, sul disco VERO:**

| prova | esito |
|---|---|
| risultati dentro `node_modules/` per `cerca {nome:"index.js"}` sul repo | **0** |
| `cerca {nome:"COMMIT_EDITMSG"}` (il file sta in `.git/`) | `no file matches. Scanned 20000 files.` |
| il file col byte NUL a offset 23.150 è cercabile **dopo** il NUL | `src/kernel/talosHarness.mjs` |
| il tetto dei risultati lo dice | `… and 443 more matches not shown — narrow the search.` |
| il tetto della camminata lo dice | `⚠ incomplete scan: I stopped after collecting 20000 paths — the tree has more. Search inside a subfolder.` |

**Le prove automatiche** — `harness-ui/tests/cerca-kernel.test.mjs`, **17 nuove** dove prima ce
n'erano zero, di cui cinque al verso contrario esplicito:
`.php`/`.kt`/`.py`/`.rs`/`.go`/`.swift`/`Makefile`/`Dockerfile` trovati per contenuto · una cartella
col punto che git non ignora si guarda · `node_modules` e `.git` mai, né per testo né per nome · il
`.gitignore` vero provato **in entrambi i versi** (con la regola il file sparisce, tolta la regola
**lo stesso file** torna) · il ripiego pota `dist` ma non `android`/`ios`/`vendor` · il `.png` non si
apre · il binario senza estensione si ferma sulla densità · **un solo NUL non basta** (la trappola di
ripgrep, fissata) · il file troppo grande non si apre · i tre tetti che mordono e lo dicono · la
cartella illeggibile che non svuota la risposta · il `+` sul conteggio minimo, e il suo contrario
(sotto soglia il `+` non compare).

**Suite:**
- `node --test tests/*.test.mjs` → **2293 pass, 0 fail** (era 2276; +17 mie).
- `node --test src/kernel/talosHarness.test.mjs` → **555 pass, 3 fail** — gli stessi tre rossi
  preesistenti (`ambienteSenzaCredenziali`, `LEVA 4`), nessuno tocca `cerca`.

---

## 6. COSA NON HO VERIFICATO

1. ⛔ **Nessun giro col modello.** L'attrezzo non è mai passato per una conversazione vera, né per
   il 4174: era l'ordine, ed è la cosa che manca di più. L'effetto sul pass-rate del banco è
   **ignoto**, e il banco non si riavvia (regola dell'owner dell'11/09).
2. ⛔ **Il ripiego senza `.gitignore` è provato solo con doppi.** Il ponte del telefono
   (`discoCapacitor`) non l'ho toccato né esercitato.
3. ⛔ **Solo Windows.** Mai eseguito su Linux o macOS; `creaFiltroGitignore` dichiara già le sue
   divergenze (L1-L8), ma la camminata di `cerca` sopra symlink e permessi non l'ho provata altrove.
4. ⛔ **La scadenza di 5 minuti del filtro non è provata:** non ho una prova che modifichi un
   `.gitignore` a sessione viva e verifichi che entro 5 minuti il vecchio filtro resti e dopo no.
5. ⛔ **`MAX_BYTE_FILE` dipende da `byte` in `disco.elenca`**, che `discoNode` fornisce e
   `workspace-disk.mjs` no: su un disco senza taglie il salto non avviene e il file si legge lo
   stesso (degrado dichiarato, mai una perdita).
6. ⛔ **Il repo intero come cartella di lavoro costa 4,2 s** e dichiara due tetti mordenti. Non ho
   indagato quanto di quel tempo sia lo `stat` per file che `discoNode.elenca` fa sempre (è codice
   di `dist/kernelPerIlBanco.js`, fuori dal mio perimetro).
7. ⛔ **`scripts/kernel-controlla.mjs` dice che le due copie del kernel divergono** (repo 8.066
   righe, copia mobile 6.260). È **preesistente** — 1.806 righe di differenza contro le ~190 mie —
   e non ho toccato né la copia mobile né `dist/kernelPerIlBanco.js`. Decide chi ha il mobile.

**Cosa resta aperto del §7.5 del rapporto di ieri, e non l'ho fatto:**
- **glob di percorso** (`**/*.kt`), **regex sul contenuto**, `output_mode` e `offset` — punto 3.
  Non è «vedere tutto», è un'altra capacità, e ogni campo nuovo è testo nel prefisso a ogni giro.
- **`rg` come motore** — punto 4. Tre ragioni, tutte dichiarate: spezzerebbe l'astrazione `disco`
  (il ponte del telefono non ha un filesystem locale); la sua rilevazione dei binari salta il nostro
  stesso kernel se non gli si passa `--text` (§2); e 142 ms su uno spazio vero stanno dentro un
  turno del modello. ⛔ Ma è **più veloce** — 1-5 ms contro i nostri 142 (fonte 2) — e la scelta è
  reversibile: se un giorno il costo conta, il posto è `tuttiIPercorsi`.
- **Spill su FILE** (dsh, `search-core.ts:363-401`) — noi dichiariamo l'eccedenza **nel testo**, non
  salviamo il risultato completo da nessuna parte.
- **`elenca` promette le dimensioni e non le consegna** — punto 6. Fuori perimetro (non è `cerca`),
  e `disco.elenca` il campo `byte` ce l'ha già: è una riga, per chi prende `elenca`.
- **Il `.gitignore` per `cerca {nome:…}`**: oggi lo rispetta anche la ricerca per percorso. dsh fa
  il contrario (`glob` con `--no-ignore --hidden`, §3). Non ho una misura che dica quale dei due sia
  meglio per noi ⇒ resta com'è, dichiarato qui.

---

## 7. Riepilogo

**Cosa devi fare tu** — niente, se il lotto 1 ti va bene così. Tre scelte secche se vuoi cambiarlo:
(a) il `.gitignore` deve valere anche per `cerca {nome:…}`, sì o no (oggi sì, dsh dice no);
(b) glob + regex + paginazione dentro questo lotto o nel prossimo (oggi: nel prossimo);
(c) `rg` come motore, con il ripiego JS (oggi: no, con le ragioni al §6).

**Cosa faccio io** — resto fermo sul lotto 2 (togliere l'elenco dal preambolo) finché non lo dici:
il prerequisito che lo bloccava è chiuso e misurato.

**Cosa rimane** — i sette punti non verificati del §6, primo fra tutti **nessun giro col modello e
nessuna corsa del banco**: la cura è misurata sul disco, non sul comportamento dell'agente.
