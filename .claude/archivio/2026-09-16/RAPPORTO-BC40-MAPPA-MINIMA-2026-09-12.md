# BC-40 — la mappa del progetto si ferma ai primi livelli, e `elenca` impara a scendere

> Owner 12/09/2026, dopo la lentezza del primo messaggio: «ci deve essere un metodo migliore,
> magari mettere il preambolo come tool o qualcosa del genere». Registrata come **BC-40**,
> approvata: «BC-40 sì».
>
> Il **TEMPO** era già curato il 12/09 (`5ccb3692`: tetti in tempo, cache stale-while-revalidate,
> Desktop 34.356 → 1.594 ms). Questo giro cura i **TOKEN** e la **FORMA**.

---

## 0. Il fatto che ha deciso il disegno, e che non era nel brief

⛔ **`elenca` non aveva argomenti.** `input_schema: { type: 'object', properties: {}, required: [] }`
(`src/kernel/talosHarness.mjs`, riga 1355 prima della cura): il ramo che lo esegue partiva **sempre**
da `disco.elenca('')` e scendeva di un livello. Non esisteva nessun modo, per il modello, di aprire
una cartella precisa.

⛔ E il preambolo gli diceva già il contrario. `mappa-cartelle.mjs` scriveva in chiaro, da sempre:
*«usa `cerca` per trovarli per nome o per contenuto, e `elenca` per vedere cosa c'è in una cartella
precisa»*. **Una promessa che l'attrezzo non poteva mantenere** — la stessa forma di
[[la-sonda-non-poteva-rispondere-per-costruzione]].

⇒ Ridurre la mappa **senza** dare a `elenca` un `percorso` non sarebbe stata una *progressive
disclosure*: sarebbe stato un taglio secco. I due pezzi sono uno solo, e la misura del §4 lo dimostra
con i numeri del modello vero.

---

## 1. Ricerca, PRIMA del codice (fonte + data)

### 1.1 Hermes Agent v0.21 (Nous Research) — **PRIMO**, letto nel codice

Clone a commit fissato `365e2835` (02/09/2026) in `%LOCALAPPDATA%\Temp\talos-competitor\hermes-agent-v21`.

**Hermes non manda NESSUNA struttura di cartelle.** `agent/coding_context.py:881`,
`build_coding_workspace_block()` — il suo «workspace snapshot» è, verbatim:

> `lines = ["Workspace (snapshot at session start — re-check with \`git\` before acting on it):"]`
> `lines.append(f"- Root: {root}")`

e poi solo: branch + upstream + ahead/behind, `- Worktree: linked` se è un worktree,
`- Status: N staged, M modified…`, `- Recent commits:` (tre righe), e i *project facts*
(`_project_facts`, riga 834): manifest, package manager, **comandi di verifica**, context files.
Niente albero, niente conteggi, niente percorsi.

Il commento di `_project_facts` dichiara anche il vincolo di cache che abbiamo noi:
> *«Built once at prompt-build time; the string output must stay byte-stable to preserve the prompt cache.»*

**E la parte che vale un +1 per noi** — `agent/subdirectory_hints.py:1`, *Progressive subdirectory
hint discovery*:

> *«As the agent navigates into subdirectories via tool calls (read_file, terminal, search_files,
> etc.), this module discovers and loads project context files (AGENTS.md, CLAUDE.md, .cursorrules)
> from those directories. Discovered hints are appended to the tool result so the model gets
> relevant context at the moment it starts working in a new area of the codebase.»*
> *«Subdirectory hints are discovered lazily and injected into the conversation without modifying
> the system prompt (preserving prompt caching).»* (ispirato a `SubdirectoryHintTracker` di goose)

⇒ Hermes risolve il problema **al contrario di come lo risolvevamo noi**: zero struttura up-front,
e il contesto arriva *attaccato al risultato dell'attrezzo* quando il modello entra in una cartella.
Il nostro `aggiornamentoInCoda()` è già quella forma; la mappa a profondità 2 + `elenca {percorso}`
è l'equivalente per la STRUTTURA.

### 1.2 Claude Code — la struttura si toglie apposta

Docs «How Claude remembers your project» (letta 12/09/2026): il `/doctor` **TOGLIE dal contesto**
i «directory layouts», perché il modello li ricava con gli strumenti; i `CLAUDE.md` di sottocartella
si caricano **on demand**. Il contesto di sessione sono quattro chiavi + `gitStatus` tagliato a
2.000 caratteri (`var Apt=2000` nel binario, misurato l'11/09) ≈ 500 token.

### 1.3 Codex CLI — `AGENTS.md` + shell, nessun elenco

`<environment_context>` = quattro tag, **~35 token**; al posto dell'elenco, `AGENTS.md` con tetto in
byte dichiarato. ⛔ `glob_scan_max_depth` **non è** una profondità di elenco. Codex non ha nessun
attrezzo di elenco né di glob: cerca con `rg`.

### 1.4 aider — la repo map, e il suo budget

«Repository map» (<https://aider.chat/docs/repomap.html>, letta 12/09/2026), verbatim:

> *«The token budget is influenced by the --map-tokens switch, which **defaults to 1k tokens**.»*
> *«Aider adjusts the size of the repo map **dynamically based on the state of the chat**.»*
> *«It only includes the most important identifiers, the ones which are most often referenced by
> other portions of the code»* — scelti da *«a graph ranking algorithm, computed on a graph where
> each source file is a node and edges connect files which have dependencies»*.

⇒ **1k token è l'ordine di grandezza del concorrente più vecchio e più misurato su questo problema.**
La nostra mappa costava **3.689 token** sul repo intero: 3,7 volte il budget di aider, per
informazione strutturalmente più povera (cartelle, non simboli).

### 1.5 Cursor — nessun albero nel prompt

Docs Cursor (letta 12/09/2026, <https://cursor.com/docs/context/codebase-indexing> dopo redirect):
la scoperta è *Instant Grep* + un *Explore subagent*; della struttura al modello non si parla. Per i
multi-root dice solo *«Each workspace folder's context is available to Agent»*.

### 1.6 OpenHands — **NON verificato**

Il clone locale `talos-competitor/OpenHands` è oggi **Agent Canvas** (il frontend), come già
registrato nel dossier del 03/09: non contiene il prompt dell'agente. Dichiarato non misurato.

### 1.7 Il costo del contesto

- Chroma, «Context Rot: How Increasing Input Tokens Impacts LLM Performance», 14/07/2025 — 18 modelli
  di frontiera: *«a single distractor reduces performance relative to the baseline»*, e il degrado
  cresce con l'input.
- Anthropic, «Effective context engineering for AI agents», 29/09/2025 — *«maintain lightweight
  identifiers… load data at runtime»*, ma anche il prezzo: *«runtime exploration is slower than
  retrieving pre-computed data»*, e la raccomandazione **ibrida**: *«retrieving some data up front
  for speed, and pursuing further autonomous exploration at its discretion»*.
- Anthropic, «Equipping agents for the real world with Agent Skills», **16/10/2025** — *progressive
  disclosure*: *«Like a well-organized manual that starts with a table of contents, then specific
  chapters, and finally a detailed appendix, skills let Claude load information only as needed.»*

⇒ **La forma scelta è letteralmente quella:** la mappa è l'indice, `elenca {percorso}` è il capitolo,
`leggi` è la pagina.

### 1.8 Cosa cambia rispetto alla nostra mappa

| | prima di BC-40 | dopo |
|---|---|---|
| profondità | 8 | **2**, e resta un parametro |
| tetto token | 4.000 | **1.200** |
| dichiara la riduzione | no (diceva «albero COMPLETO») | **sì**, in testa e in coda |
| il modello può scendere | **no** (`elenca` senza argomenti) | **sì**, `elenca {"percorso":"…"}` |

---

## 2. La misura, prima di toccare — token della mappa per profondità sui tre spazi reali

Stimatore del prodotto (`costo-elenco.mjs`, metodo «stimato»), filtro `.gitignore` vero, 12/09/2026.
Script: `scratchpad/misura-mappa.mjs` (usa-e-getta, sola lettura).

| spazio | forma | cartelle rese | camminata | **token** |
|---|---|---|---|---|
| `harness-ui/` | **OGGI** (camminata 8, tetto 4.000) | 55 (prof. resa **5**) | 22 ms | **374** |
| | filtrata a prof. 3 | 49 | — | 411 |
| | filtrata a prof. 2 | 29 | — | 299 |
| | filtrata a prof. 1 | 11 | — | 211 |
| | **camminata NATIVA prof. 2** | 29 | **5 ms** | **229** |
| | camminata NATIVA prof. 1 | 11 | 3 ms | 141 |
| `AVM-harness-desktop` | **OGGI** | 571 su 2.000 lette (prof. resa **4**) | 507 ms | **3.689** |
| | filtrata a prof. 3 | 288 | — | 1.892 |
| | filtrata a prof. 2 | 124 | — | 896 |
| | filtrata a prof. 1 | 20 | — | 263 |
| | **camminata NATIVA prof. 2** | 124 | **19 ms** | **825** |
| | camminata NATIVA prof. 1 | 20 | 4 ms | 193 |
| `C:\Users\…\Desktop` | **OGGI** | 84 su 2.000 lette (prof. resa **2**) | 434 ms | **911** |
| | filtrata a prof. 3 | 636 | — | 4.314 |
| | filtrata a prof. 2 | 84 | — | 911 |
| | filtrata a prof. 1 | 9 | — | 214 |
| | **camminata NATIVA prof. 2** | 84 | **12 ms** | **841** |
| | camminata NATIVA prof. 1 | 9 | 2 ms | 143 |

**I tre fatti che hanno deciso, e nessuno è un'opinione:**

1. ⛔ Sui due spazi grandi la camminata a 8 **leggeva 2.000 cartelle** (il tetto) e il tetto di
   token ne rendeva **571** e **84**. Si pagava il disco per buttare via il risultato.
2. ⛔ **La profondità che il tetto di token sceglieva da solo era già 2 su `Desktop` e 4 sul repo.**
   Profondità 2 non è una perdita decisa a tavolino: è dove il sistema arrivava comunque.
3. ⭐ La camminata nativa a 2 costa **25-36× meno tempo** (507→19, 434→12 ms) e, sul caso peggiore,
   **4,5× meno token**.

### La forma scelta, e i due numeri scartati

- **Profondità 2** (`PROFONDITA_MAPPA_PREDEFINITA`), la camminata non scende oltre: risparmia
  il tempo *e* i token, non solo i token.
- **Tetto 1.200 token** (`TETTO_TOKEN_MAPPA_PREDEFINITO`), non 800.
  ⛔ **800 è stato SCARTATO e si scrive perché:** a 800 il tetto taglia a profondità 1 sia
  `AVM-harness-desktop` (825) sia `Desktop` (841), e **a profondità 1 sul repo `harness-ui/src` non
  compare** — cioè proprio la cartella su cui il modello aveva risposto «non esiste». Risparmiare
  640 token riaprendo quel buco non è un affare.
  ⛔ 4.000 è stato scartato perché **non morderebbe mai più** (max misurato 841): un tetto che non
  morde è una riga morta, ed è il difetto del cancello semantico spento da sempre.
- **Profondità 8 resta disponibile** via `profonditaMax`: non è sparita, si chiede.

### Il costo del testo — una cura che stava peggiorando il caso normale

⛔ La **prima stesura** metteva un paragrafo d'avviso in testa alla mappa («ti do i primi N
livelli… non concludere mai che…»). Misurato: **167 token**, cioè **più dei 145** che la riduzione
risparmiava su `harness-ui/`. Il preambolo passava da **3.963 a 3.985**: la cura peggiorava il caso
normale per curare quello patologico.
⇒ La dichiarazione è tornata dentro l'intestazione (mezza riga) e il promemoria forte è rimasto
**in fondo**, dopo l'elenco, che è dove il modello guarda per ultimo
([[il-promemoria-dove-guarda-per-ultimo]]: non riscrivere la regola, **spostarla**).

### Il risultato, sul preambolo INTERO

| spazio | mappa prima | mappa dopo | **preambolo prima** | **preambolo dopo** | costruzione |
|---|---|---|---|---|---|
| `harness-ui/` | 374 | **327** (−13%) | 3.963 | **3.916** (−1,2%) | 353 → 315 ms |
| `AVM-harness-desktop` | 3.689 | **923** (−75%) | 7.249 | **4.484** (**−38%**) | 1.485 → 1.440 ms |
| `Desktop` | 911 | **939** (+3%) | 1.005 | **1.033** (+2,8%) | 2.077 → **1.533 ms** (−26%) |

⛔ **Detto onestamente: su `Desktop` la mappa costa 28 token IN PIÙ.** Prima la sua mappa era già
ridotta a profondità 2 dal tetto di token; oggi porta in più la riga che dichiara come scendere. In
cambio la camminata passa da 434 a 12 ms e il preambolo intero da 2,08 a 1,53 s.
⛔ E su `harness-ui/` il risparmio è piccolo **perché la mappa non è la parte grassa**: lì
il blocco `AGENTS.md` pesa 11.845 byte ≈ 3.400 token, cioè **l'87% del preambolo**. Se si vuole
ancora peso, è quello il prossimo bersaglio, non la mappa.

### Il rischio, dichiarato

Un modello che vede meno **non tace: spiega**. È successo con questa frase esatta — «0 — la cartella
`harness-ui/src` non esiste», e ne conteneva 104 ([[un-modello-che-non-vede-non-tace-spiega]]).
⇒ La mappa ridotta **deve** dire di esserlo, fin dove è vera, e con quale attrezzo si scende. Il §4
è la prova che in questa forma non succede.

Testo prodotto oggi su `harness-ui/` (331 token, prof. 2):

```
Struttura di «harness-ui» — 30 cartelle, primi 2 livelli soltanto (⚠ MAPPA INCOMPLETA PER SCELTA:
fin qui è tutto vero, sotto ci sono altre cartelle che non ho elencato). Fra parentesi quanti file
contiene ognuna (i propri, non quelli delle sottocartelle).
I singoli file non sono elencati: usa `cerca` per trovarli per nome o per contenuto, e `elenca` con
`percorso` per aprire una cartella precisa (es. `elenca {"percorso":"src"}`).

harness-ui/ (5)
  …
⚠ Fine di una mappa INCOMPLETA. ⛔ Se una cartella non compare qui sopra NON vuol dire che non
esista: aprila con `elenca {"percorso":"…"}` o cercala con `cerca` prima di dire che manca.
```

---

## 3. La cura

### `src/mappa-cartelle.mjs` (+123 −22)

- `PROFONDITA_MAPPA_PREDEFINITA` **8 → 2**, con la tabella di misura in testa.
- `TETTO_TOKEN_MAPPA_PREDEFINITO` **4.000 → 1.200**, con lo scarto di 800 e di 4.000 scritto.
- **Campo nuovo `fermatoInProfondita`** nel camminatore. ⛔ Non è cosmesi: senza, un albero camminato
  a 2 esce con `troncato:false` e `testoMappaCartelle` scriveva **«albero COMPLETO»** su un albero
  profondo sei — la riduzione avrebbe prodotto **esattamente la bugia** che questo modulo esiste per
  non dire. Il `continue` muto sul limite di profondità è diventato: *se questa cartella ha figli
  tenuti e non li accodo, l'albero continua sotto, e si registra*.
- `testoMappaCartelle`: tre stati distinti e mai confusi — `troncato` («mi sono FERMATO, non so cosa
  mi manca»), `fermatoInProfondita` («ho SCELTO di non scendere, e so dove»), nessuno dei due
  («albero COMPLETO»). Il testo nomina `elenca` **con la sua forma esatta**, e la riga che impedisce
  «la cartella non esiste» è l'ULTIMA.
- `mappaEntroIlTetto`: il taglio del tetto finisce in `fermatoInProfondita`, non in `troncato` — per
  chi legge sono la stessa cosa (sotto c'è altro), per chi diagnostica no.

### `src/contesto-del-progetto.mjs` (+5)

- `blocchi.mappa.ridottaPerDisegno` — **campo aggiunto, mai sostituito**: `troncata`,
  `tagliataInProfondita`, `profondita`, `profonditaPiena`, `token` continuano a dire esattamente
  quello che dicevano.

### `src/kernel/talosHarness.mjs` (+103 −5) — minimo e motivato

- `ATTREZZI.elenca`: `input_schema` guadagna **`percorso` opzionale**; descrizione riscritta («With
  no arguments: the workspace root and one level below it. Give "percorso" to open ONE folder you
  saw in the project map…»). Costo ~30 token sulla descrizione degli attrezzi (scommessa dichiarata:
  505 contro i 42.272 di claude-code); resa 2.766 token sul repo intero.
- Nuova `elencaDaCartella(disco, base)` (riga ~2917), **esportata** per essere provabile come
  `cercaNelProgetto`:
  - ⛔ **uscita invariata byte per byte con `base === ''`** — TALOS-BANCO confronta le uscite degli
    attrezzi carattere per carattere fra le campagne;
  - ⛔ i percorsi restano **relativi alla radice** (`src/kernel/talosHarness.mjs`, mai
    `kernel/talosHarness.mjs`): è l'unica forma che il modello può girare a `leggi` senza
    ricostruire un prefisso a mano;
  - ⛔ **la cartella che non c'è NON stampa il percorso assoluto**. Il catch generico degli attrezzi
    risponde `error: ENOENT … scandir '<assoluto>'`: finché `elenca` non prendeva argomenti quel
    ramo era irraggiungibile, da oggi lo raggiunge il modello, e il nome della persona finirebbe nel
    prompt — [[cancello-4-non-guardava-tutto-mobile]];
  - una sottocartella illeggibile sparisce lei, non tutto l'elenco.
- Guardia `RISALITA` (riga 2893): un segmento `..` è rifiutato con un messaggio che dice cosa fare.
  ⛔ Nessun altro allargamento: per il resto `elenca` vede quello che `leggi` vede già.

### Test

- **Nuovo** `tests/bc40-mappa-minima.test.mjs` — **14 prove, ognuna con la gemella al contrario**:
  la mappa ridotta dichiara / una completa NON lo dichiara; una cartella vuota al 2° livello non
  accende la bandiera (una bandiera sempre accesa non informa); la profondità piena via parametro;
  il tetto di token che taglia; il contratto additivo di `blocchi.mappa`; `elenca` senza percorso
  **identico** (atteso ricalcolato a mano, non copiato dall'uscita —
  [[andata-ritorno-non-prova-compatibilita]]); `elenca` con percorso; la cartella inesistente senza
  percorso assoluto; la sottocartella illeggibile; la risalita rifiutata.
- `tests/preambolo-quattro-blocchi.test.mjs`: **una riga** — la prova del tetto di token ora chiede
  `profonditaMax: 8` esplicito, perché parla del TETTO e ha bisogno di un albero profondo. Ciò che
  prova è identico; cambia solo che la profondità si chiede invece di ereditarla.

**Verdi:** `bc40-mappa-minima` + `preambolo-quattro-blocchi` + `contesto-del-progetto` +
`mappa-tempo-e-cache-stantia` + `p13-elenco-al-modello` = **64/64**.
Kernel (`talosHarness`, `cerca-kernel`, `ricerca-permesso-e-consegna`, `scrivi-percorso-e-modalita`,
`giri-senza-tetto`, `shell-accetta-il-nome-inglese`, `kernel-loop-locale-e-stop`,
`audit-harness-findings`, `cache-del-prompt-si-chiede`, `full-access-policy`) = **128/128**.

---

## 4. La prova al contrario, con giri VERI

Banco mio: `node server.mjs` su **porta 4203** (⛔ mai la 4174), store separato nello scratchpad,
`TALOS_HARNESS_UI_PROJECT_DIRS` = `harness-ui`. Modello **`z-ai/glm-5.3-flash`**, permesso
`Read only`. Server fermato a fine misura (PID 16320 e 23104, entrambi terminati; `netstat` conferma
4203 libera).

**Consegna, identica nei due bracci:** *«Quanti file .mjs ci sono in harness-ui/src? Rispondi con il
numero e come l'hai contato.»*

**Verità contata da me** (`find`): **111** in `src/` diretti, **2** in `src/kernel/`, **25** in
`src/research/` ⇒ **138** ricorsivi.

Il braccio PRIMA gira sul codice di **HEAD** rimesso sul disco (`git show HEAD:…`, tre file), server
riavviato; poi la cura è stata ripristinata e i test rilanciati (64/64).

| giro | token dentro (1° giro) | primo token | giri | attrezzi | esito | risposta |
|---|---|---|---|---|---|---|
| **PRIMA-1** | **72.827** | 1.859 ms | 5 | `cerca` ×**88** | successo | 138 ✓ |
| **PRIMA-2** | — | — | 2 | `cerca` ×1, **`delega_sottotask`** ×1 | ⛔ **NON conclusa** entro il tetto di 10 min | — |
| **PRIMA-3** | **88.197** | 7.958 ms | 5 | `cerca` ×24, `elenca` ×1, `leggi` ×1 | successo | 138 ✓ |
| **DOPO-1** | **21.998** | 17.767 ms | 3 | `elenca` ×4, `cerca` ×1 | successo | 138 ✓ |
| **DOPO-2** | **22.346** | 2.292 ms | 3 | `elenca` ×2, `cerca` ×1 | successo | 138 ✓ |
| **DOPO-3** | **22.788** | 575 ms | 3 | `elenca` ×3, `cerca` ×1 | successo | 138 ✓ |

Durata a schermo: PRIMA 240 s · >600 s (tetto) · 372 s — **DOPO 84 s · 40 s · 64 s.**
Token in uscita: PRIMA 19.082 / — / 23.917 — **DOPO 3.161 / 3.398 / 4.586.**

**Cosa dicono i numeri, e cosa NON dicono:**

1. ⭐ **Il rischio non si è materializzato: 3/3 con la mappa ridotta rispondono il numero GIUSTO**,
   e nessuno dice «la cartella non esiste». La cura passa il criterio scritto prima.
2. ⭐ **Il modello usa davvero il parametro nuovo.** Dallo store: `elenca {"percorso":"src"}`,
   `{"percorso":"src/kernel"}`, `{"percorso":"src/research"}`, `{"percorso":"src/kernel/dist"}`.
   Nel suo ragionamento cita la frase della mappa parola per parola.
3. ⛔ **Il braccio PRIMA costava 3,3-4,0× in token d'ingresso e 4-6× in tempo**, e il modo in cui
   li spendeva è la diagnosi: **88 chiamate a `cerca`** in PRIMA-1, partizionando `src/a`, `src/b`…
   perché non aveva modo di aprire `src`. Con 24 giri massimi, questa è la forma esatta di
   [[talos-esaurisce-i-giri-non-le-capacita]].
4. ⛔ **PRIMA-2 non è arrivata in fondo**: ha aperto una `delega_sottotask` e due sotto-sessioni
   (181.984 e 82.969 token d'ingresso) ancora vive al tetto dei 10 minuti. Le ho fermate chiudendo
   il server. È un dato del braccio PRIMA, non un incidente della misura: 1 su 3 non conclude.
5. ⛔ **Il primo token NON è la variabile che questa cura muove**, e non lo si spaccia: 575-17.767 ms
   dopo, 1.859-7.958 ms prima — l'intervallo si sovrappia e n=3. Il primo token dipende dalla coda
   di OpenRouter; BC-40 muove i **token** e i **giri**, che sono separati e netti.
6. ⛔ `tokenDentro` è il prompt del **primo giro** dal record `tempi-giro` — e sui giri PRIMA
   include già il lavoro accumulato: non è il solo preambolo. Il preambolo puro è misurato al §2.

---

## 5. File toccati

| file | righe | cosa |
|---|---|---|
| `harness-ui/src/mappa-cartelle.mjs` | +123 −22 | profondità 2, tetto 1.200, `fermatoInProfondita`, testo che dichiara e nomina `elenca` |
| `harness-ui/src/kernel/talosHarness.mjs` | +103 −5 | `elenca` con `percorso` (schema ~1354-1391), `RISALITA` (2893), `elencaDaCartella` (2917), ramo attrezzo (~6750) |
| `harness-ui/src/contesto-del-progetto.mjs` | +5 | `blocchi.mappa.ridottaPerDisegno` (additivo) |
| `harness-ui/tests/bc40-mappa-minima.test.mjs` | **nuovo**, 14 prove | nei due versi |
| `harness-ui/tests/preambolo-quattro-blocchi.test.mjs` | +6 −1 | `profonditaMax: 8` esplicito nella prova del tetto, con il perché |

⛔ Nessun `git add`/`commit`/`push`. Nessun file fuori da questi cinque: `frontend/`,
`library-store.mjs`, `session-registry.mjs`, `http-app.mjs`, `research*`, `src/research/`,
`llama-server-supervisor.mjs`, `mobile/`, `control-plane/`, `core/`, `docs/` **non toccati**.

---

## 6. Cosa NON ho verificato

- ⛔ **`AVM/mobile` come spazio di lavoro**: non misurato in questo giro (i tre spazi del brief erano
  `harness-ui/`, `AVM-harness-desktop`, `Desktop`). Il kernel è condiviso col mobile e la modifica a
  `elenca` viaggia anche lì: **l'uscita con `base === ''` è invariata**, ma il ramo `percorso` sul
  ponte del telefono non è stato provato dal vivo.
- ⛔ **Il banco TALOS-BANCO non è stato rilanciato.** L'invarianza dell'uscita di `elenca` è provata
  da un test (atteso ricalcolato a mano), non da una campagna. E l'owner ha detto l'11/09 che il
  banco non si riavvia finché non gira alla perfezione.
- ⛔ **Nessuna verifica visiva sul 4174**: BC-40 non tocca la UI, e la 4174 è fuori dal mio mandato.
- ⛔ **n=3 per braccio**, un solo modello (`glm-5.3-flash`), una sola consegna, una sola cartella.
  Il `primoTokenMs` in particolare non è distinguibile dal rumore con questo n.
- ⛔ **OpenHands**: il clone è Agent Canvas, il prompt del suo agente non è stato letto.
- ⛔ **Il tetto in tempo (2.000 ms) non è stato ritarato** dopo la riduzione: con la camminata a 2
  non morde più su nessuno spazio misurato (12-19 ms). È ora una guardia contro il patologico, come
  il tetto di 2.000 cartelle. Lasciato com'è, e dichiarato.
- ⛔ **La sotto-sessione delegata di PRIMA-2 è stata terminata a metà** chiudendo il server: i suoi
  token sono stati spesi, il suo esito non c'è.

---

## 7. Proposta di messaggio di commit

```
perf(preambolo): la mappa si ferma ai primi due livelli, e `elenca` impara a scendere

BC-40, owner 12/09: «ci deve essere un metodo migliore». Il tempo era curato
(5ccb3692); qui i TOKEN e la FORMA.

Misurato 12/09 con lo stimatore del prodotto sui tre spazi veri: la camminata a
profondità 8 leggeva 2.000 cartelle sul repo e sul Desktop per renderne 571 e 84,
e il tetto di token sceglieva da solo profondità 4 e 2. La mappa del repo intero
costava 3.689 token — 3,7× il budget di serie della repo map di aider.

Profondità 2 (parametro, non legge), tetto 1.200 token (scartato 800: taglierebbe
a profondità 1 e `harness-ui/src` sparirebbe — la cartella su cui il modello disse
«non esiste»). Mappa: 3.689 → 923 sul repo, preambolo 7.249 → 4.484 (−38%);
camminata 507 → 19 ms e 434 → 12 ms.

`fermatoInProfondita`: senza, una mappa camminata a 2 diceva «albero COMPLETO» di
un albero profondo sei — la bugia esatta che il modulo esiste per non dire.

`elenca` guadagna `percorso` OPZIONALE. Non era comodità: lo schema era vuoto, il
ramo partiva sempre dalla radice, e il testo della mappa prometteva già da sempre
«usa elenca per vedere cosa c'è in una cartella precisa». Uscita invariata byte per
byte senza argomento (TALOS-BANCO confronta le uscite carattere per carattere);
percorsi relativi alla radice; la cartella inesistente non stampa più il percorso
assoluto ([[cancello-4-non-guardava-tutto-mobile]]).

Sei giri veri su banco proprio (porta 4203, mai 4174, glm-5.3-flash), consegna
«quanti file .mjs in harness-ui/src»: DOPO 3/3 rispondono 138 (giusto) in 3 giri
con 22.0-22.8k token; PRIMA 2/3 in 5 giri con 72.8-88.2k token e fino a 88 chiamate
a `cerca`, 1/3 non conclude entro 10 minuti.

Ricerca prima del codice — Hermes Agent v0.21 (clone 365e2835, 02/09/2026):
`coding_context.py:881` manda root+git+manifest+verify, ZERO struttura; e
`subdirectory_hints.py` carica il contesto delle sottocartelle attaccandolo al
risultato dell'attrezzo, «without modifying the system prompt (preserving prompt
caching)». aider «Repository map» (12/09/2026): «--map-tokens… defaults to 1k
tokens». Anthropic «Agent Skills» (16/10/2025): progressive disclosure, «a table
of contents, then specific chapters». Anthropic «Effective context engineering»
(29/09/2025): ibrido up-front + esplorazione. Claude Code docs (12/09/2026): il
/doctor toglie i directory layouts dal contesto. Chroma «Context Rot» (14/07/2025).

64 test verdi sui cinque file del preambolo, 128 sui dieci del kernel.
```

---

## 8. Chiusura

**Cosa devi fare tu**
1. **BC-40 va bene così, o vuoi la profondità 3?** A 3 il repo costa 1.892 token invece di 923 e il
   `Desktop` 4.314 invece di 939: i numeri dicono 2, ma la scelta è tua.
2. **Il tetto 1.200 lo confermi?** L'alternativa scartata (800) toglie 640 token e nasconde
   `harness-ui/src` sul repo.
3. **Vuoi che `elenca` scenda di più di un livello** (un parametro `profondita`)? Oggi apre la
   cartella e un livello sotto; nei giri veri è bastato, ma è una riga in più se la vuoi.
4. **Il push**: i cinque file sono sul disco, non committati.

**Cosa faccio io**
- Niente, finché non dici. Se dici «vai», il prossimo bersaglio misurato è il blocco `AGENTS.md`:
  su `harness-ui/` pesa **3.400 token, l'87% del preambolo** — dopo BC-40 è lui la parte grassa,
  non più la mappa.

**Cosa rimane**
- `AVM/mobile` come spazio di lavoro: non misurato. Il ramo `percorso` di `elenca` sul ponte del
  telefono: non provato dal vivo (l'uscita senza argomento è invariata e testata).
- TALOS-BANCO non rilanciato (owner 11/09: non si riavvia finché non gira alla perfezione).
- `primoTokenMs`: n=3, non distinguibile dal rumore. BC-40 muove token e giri, non il primo token.
- Il tetto in tempo (2.000 ms) non ritarato: oggi non morde più su nessuno spazio misurato.
- OpenHands non letto (il clone è Agent Canvas).
- Una sotto-sessione delegata di PRIMA-2 terminata a metà chiudendo il banco.
