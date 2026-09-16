# P-A + P-B + P-C — il record unico di fornitore, la cache DeepSeek, LM Studio in chat

> **Data:** 12/09/2026 · **Lane:** `lane/harness-desktop` · **Cartella:** `harness-ui/`
> **Ordine owner:** approvata TUTTA la proposta del §4 di `.claude/INVENTARIO-PROVIDER-2026-09-12.md`;
> questo lotto è **P-A + P-B + P-C**, i primi tre in ordine.
>
> ⛔ **Nessuna chiamata a un fornitore vero.** Nessuna chiave è stata letta, scritta o stampata.
> Tutte le prove girano su `fetch` iniettata e su fixture prese dalla documentazione (URL + data).
> ⛔ **La porta 4174 non è stata toccata**, né avviata, né sondata.
> ⛔ **Il kernel non è stato modificato**: `git status -- harness-ui/src/kernel/` è vuoto.

---

## 1. Cosa c'era — i tredici elenchi, misurati nel codice

L'inventario ne contava dieci più tre; aprendoli uno per uno ne sono venuti fuori **tredici**
(+ due che l'inventario non aveva visto). Ognuno è un posto dove lo stesso nome di fornitore era
riscritto a mano, in una forma diversa, senza nessun test che li tenesse insieme.

| # | Elenco | Forma | file:riga (prima) |
|---|---|---|---|
| 1 | `PROVIDER_IDS` + `PROVIDER_DEFINITIONS` | array + oggetto congelato | `src/provider-credential-store.mjs:13-25` |
| 2 | `SONDE_PROVIDER` | oggetto (percorso, auth, conta) | `src/provider-probe.mjs:44-52` |
| 3 | allowlist di `elencaModelli` | array letterale in riga | `src/provider-probe.mjs:153` |
| 4 | `FONTI_MODELLO` | array congelato | `src/model-destination.mjs:47` |
| 5 | `COMPATIBILI_OPENAI` | array congelato | `src/model-destination.mjs:67` |
| 6 | `NATIVI` | array congelato | `src/model-destination.mjs:74` |
| 7 | `FONTI_AMMESSE_MODELLO` | **stringa dentro una regex** | `src/config.mjs:186` |
| 8 | `PROVIDERS` dei runtime locali | oggetto congelato | `src/openai-compatible-runtime.mjs:3-6` |
| 9 | mappa delle factory native | oggetto letterale in riga | `src/native-provider-adapter.mjs:71` |
| 10 | `defaults` dei contatori di token | oggetto letterale (tre URL) | `src/context-token-counters.mjs:6` |
| 11 | regex di rotta `(openai\|anthropic\|gemini)` | **duplicata** | `src/http-app.mjs:868` **e** `:2328` |
| 12 | `<select id="providerLab">` con 7 `<option>` | HTML | `frontend/index.template.html:1401` |
| 13 | `PROVIDER_DIRETTI` | array congelato nel **frontend** | `frontend/src/components/fonti-modelli.js:47-51` |
| **+1** | terna nativa in `prepareProviderContext` | array letterale | `src/context-provider-adapter.mjs:98` *(non nell'inventario)* |
| **+2** | fonti ammesse del profilo trial | array letterale | `src/config.mjs:456` *(non nell'inventario)* |

**Le due bugie che erano già lì**, esattamente come diceva l'inventario:

1. `deepseek` con `execution: 'in preparazione'` nel portachiavi, e `model-destination.mjs` che lo
   instradava **da sempre**.
2. `lmstudio` scoperto, sondato, **caricabile e scaricabile** in `openai-compatible-runtime.mjs`
   con capacità osservate che Ollama non dà — e assente da `FONTI_MODELLO`: non sceglibile in chat.

---

## 2. Le fonti — ricerca fatta PRIMA di scrivere (12/09/2026)

⛔ `WebSearch` era **esaurito (200/200)** anche in questa sessione: ogni fonte esterna è stata letta
con **WebFetch su documentazione primaria**.

| Fatto | Fonte 🌐 | Cosa ha cambiato nel codice |
|---|---|---|
| «`prompt_tokens` … **It equals `prompt_cache_hit_tokens` + `prompt_cache_miss_tokens`**», e `prompt_tokens_details.cached_tokens` **esiste** nella stessa `usage` | `https://api-docs.deepseek.com/api/create-chat-completion` | i due nomi si leggono come **alternative**, mai sommati; e ha **smentito** un punto dell'inventario (§4) |
| definizione dei due campi di cache | `https://api-docs.deepseek.com/guides/kv_cache` | testo del record |
| Kimi/Moonshot: **`cached_tokens` al PRIMO livello** di `usage` — «Number of tokens served from cache» | `https://platform.kimi.ai/docs/api/chat` | quarto percorso del wire `openai-chat` |
| OpenRouter: `cached_tokens`/`cache_write_tokens` in `prompt_tokens_details`; **`cache_discount` al livello del corpo**, ed è **denaro** (negativo sulle scritture Anthropic) | `https://openrouter.ai/docs/features/prompt-caching` | `cache.scontoDichiarato`, e `scontoDaCache()` separata dai token |
| Anthropic: `total_input = cache_read + cache_creation + input` | `https://platform.claude.com/docs/…/prompt-caching` (già letto e riconfermato nell'inventario) | `cache.inclusiNelTotale: false` sul solo wire Anthropic |
| LM Studio OpenAI-compatibile: `/v1/models`, `/v1/responses`, `/v1/chat/completions`, `/v1/embeddings`, `/v1/completions` su `http://localhost:1234/v1`, **nessuna chiave negli esempi** | `https://lmstudio.ai/docs/app/api/endpoints/openai` | `endpoint.chat: '/v1/chat/completions'`, `chiaveObbligatoria: false` |
| LM Studio REST nativa v0.4.0: `/api/v1/models`, `/api/v1/models/load`, `/api/v1/models/unload`, con «authentication configuration with **API tokens**» | `https://lmstudio.ai/docs/app/api/endpoints/rest` | il catalogo resta sul runtime locale; la chiave esiste ma è **facoltativa** |

⭐ **Correzione all'inventario, alla fonte.** §3a e §4 dicevano «DeepSeek: `prompt_cache_hit_tokens`
NON letto ⇒ sempre 0». **È falso per il kernel**: `src/kernel/talosHarness.mjs:6417` e `:6482`
leggono già `prompt_tokens_details.cached_tokens ?? cache_read_input_tokens ?? prompt_cache_hit_tokens`,
dal commit `da47962c` (quando il kernel è entrato nel repo). Il difetto vero è un altro, ed è
peggiore: **i lettori che possediamo noi conoscono UN nome ciascuno, e ognuno un nome diverso** —
vedi §4.

---

## 3. P-A — il record (`src/provider-registry.mjs`, nuovo)

### 3a. Lo schema, verbatim

```js
{
  // ── Identità ──
  id: 'deepseek',                 // il prefisso di `fonte:modello`; validato ^[a-z][a-z0-9-]{0,31}$
  etichetta: 'DeepSeek',
  descrizione: 'API diretta DeepSeek, wire OpenAI.',
  paginaChiavi: 'https://platform.deepseek.com/api_keys',

  // ── Come gli si parla ──
  wire: 'openai-chat',            // openai-chat | openai-responses | anthropic-messages | gemini | locale
  baseUrl: 'https://api.deepseek.com',
  indirizzoModificabile: true,
  envIndirizzo: [],

  // ── Credenziale ──
  auth: { tipo: 'bearer', header: 'Authorization', nomeVariabile: ['DEEPSEEK_API_KEY'] },
  chiaveObbligatoria: true,
  formaIdModello: 'nome',         // 'nome' | 'vendor/nome'
  oauth: null,                    // { tipo:'pkce', etichetta } — oggi solo OpenRouter

  // ── Endpoint per capacità ──
  endpoint: { chat: '/chat/completions', modelli: '/models' },

  // ── Capacità, TRE stati: osservato | dichiarato | ignoto (mai un booleano) ──
  streaming: 'dichiarato',
  toolCalling: 'dichiarato',

  // ── ⛔ La colonna che non esisteva: COME SI LEGGE LA CACHE ──
  cache: {
    marcatore: null,                     // null | 'cache_control' | 'prompt_cache_key'
    letturaUsage: ['prompt_tokens_details.cached_tokens', 'prompt_cache_hit_tokens'],
    scritturaUsage: [],
    inclusiNelTotale: true,              // ⛔ false sul wire Anthropic: sbagliare qui sbaglia del doppio
    scontoDichiarato: null,              // OpenRouter: 'cache_discount' — DENARO, mai token
  },

  // ── Catalogo e prezzi ──
  catalogo: { fonte: 'fornitore', forma: 'openai-data', percorso: '/models', inUI: false },
  prezzi: { fonte: 'nessuna' },          // openrouter → 'openrouter-models'

  // ── Limiti ──
  limiti: { timeoutPredefinitoSecondi: 60, tempoMassimoModificabile: true },

  // ── Doctor / sonda ──
  sonda: { attiva: true, auth: 'bearer', percorso: '/models', urlAssoluto: null, conta: (c) => c?.data?.length },

  // ── Ruolo nel sistema ──
  destinazioneChat: true,         // si può scegliere in chat
  credenziale: true,              // ha una chiave nel portachiavi
  esecuzione: 'collegato',
}
```

**Nove record**: `openai` · `deepseek` · `anthropic` · `gemini` · `openrouter` · `ollama` ·
**`lmstudio` (nuovo)** · `huggingface` · `local`.
L'ordine di dichiarazione è quello che il pannello Provider aveva prima: **nessuna riga della UI si
sposta** per effetto del registro.

Differenze deliberate dal `ProviderProfile` di Hermes (`providers/base.py:38-100`), e il perché:
* **niente hook eseguibili** — qui è dato, non codice: un record che porta funzioni è codice sparso
  con un altro nome. Le sole funzioni ammesse sono `sonda.conta` (proiezione pura sul corpo);
* **tre stati per le capacità**, mai un booleano — «non dichiarato» non è «no»;
* **`cache.letturaUsage`** — la colonna che in Hermes vive dentro `normalize_usage` e in noi non
  esisteva affatto.

`verificaRegistro()` gira **all'import**: un registro rotto rompe il processo mentre qualcuno sta
ancora guardando, invece di arrivare a una sessione viva.

### 3b. Cosa legge dal registro, adesso

| Elenco di prima | Adesso |
|---|---|
| `PROVIDER_IDS` / `PROVIDER_DEFINITIONS` | `ID_CON_CREDENZIALE` + proiezione (`label`, `keyEnv`, `supportsEndpoint`, `requiresKey`, `execution`, `supportsOAuth`) |
| `SONDE_PROVIDER` | `REGISTRO[id].sonda` |
| allowlist di `elencaModelli` | `CATALOGHI_DIRETTI` = `catalogo.inUI && catalogo.fonte === 'fornitore'` |
| `FONTI_MODELLO` | `ID_DESTINAZIONE_CHAT` |
| `COMPATIBILI_OPENAI` | `idPerWire('openai-chat') + idPerWire('locale')` |
| `NATIVI` / factory native / terna in `context-provider-adapter` / terna in `context-token-counters` | `ID_NATIVI_SDK` |
| `FONTI_AMMESSE_MODELLO` (regex) | `ID_DESTINAZIONE_CHAT.join('\|')` |
| fonti del profilo trial (`config.mjs:456`) | `ID_DESTINAZIONE_CHAT` |
| `PROVIDERS` dei runtime locali | `ID_MOTORI_LOCALI_OPENAI` + `baseUrl` + `catalogo.percorso` |
| `defaults` dei contatori di token | `baseUrl` dei fornitori con catalogo diretto |
| le **due** regex di rotta | **una** costante `ROTTA_MODELLI_FORNITORE`, costruita da `ID_CATALOGO_IN_UI` |
| il percorso di chat (`/v1/...` per Ollama, `/chat/completions` per gli altri) | `endpoint.chat` — era un `if (fonte === 'ollama')` |
| «Ollama non vuole la chiave» | `chiaveObbligatoria` — era un `if (fonte !== 'ollama')` |
| `supportsOAuth: provider === 'openrouter'` | `Boolean(record.oauth)` |
| `PROVIDER_DIRETTI` (frontend) | **resta una copia**, e lo dice: il frontend si impacchetta a parte e non può importare codice di server. La tiene onesta il test di parità, nei due versi. |
| `<select id="providerLab">` | resta HTML, ma ogni `<option>` porta ora `value="<id>"`: il test confronta **gli id**, non le parole a schermo. |

### 3c. Il contratto di parità — `tests/provider-registry-parita.test.mjs` (11 prove)

Copiato da `hermes_cli/provider_catalog.py:35`, che esiste da loro perché «ogni provider aggiunto
dopo che quelle liste sono state scritte spariva in silenzio dalla GUI».

* **REG-01/REG-02** — il registro si regge da solo; e **al contrario**: otto record malfatti (wire
  inventato, destinazione senza wire, auth sconosciuta, capacità come booleano, id diverso dalla
  chiave, destinazione senza endpoint, `inclusiNelTotale` non booleano, sonda attiva senza
  indirizzo) devono **lanciare**, e un record sano non deve far scattare niente.
* **PAR-01…PAR-06** — portachiavi, sonde, destinazioni di chat + regex della richiesta, motori
  locali + SDK nativi, schede del selettore (frontend), `<select>` del template.
* **PAR-07** — *nessuna copia rimasta indietro*: dieci letterali che esistevano stamattina (con
  file:riga) non devono ricomparire **nel codice** (i commenti che li citano sono esclusi).
* **PAR-08 — il cancello morde**: si aggiunge un fornitore finto **al solo registro** e si pretende
  che **cinque** superfici protestino. Senza questa prova, un cancello inerte direbbe le stesse
  identiche cose delle dieci prove sopra (lezione `il-cancello-semantico-era-spento-da-sempre`).
* **SONDA-01** — `non-sondabile`, il sesto esito, provato nei due versi: spento ⇒ **zero** richieste
  di rete; acceso ⇒ una richiesta e `collegato`. Oggi nessuno dei nostri lo dichiara, e la guardia
  esiste perché il primo che lo farà non debba inventarsi uno stato (caso Xiaomi MiMo in Hermes:
  `/models` fa 401 **anche con una chiave buona** ⇒ senza questo stato la sonda accuserebbe una
  chiave valida, il difetto esatto contro cui la sonda è nata).

### 3d. L'etichetta di DeepSeek

`execution: 'in preparazione'` **non esiste più**, e non perché l'ho riscritta: lo stato ora lo
calcola il record. È una `destinazioneChat` con un `wire` che sappiamo parlare ⇒ `collegato`. Se la
chiave funzioni è un'**altra** domanda, e ha già il suo posto (la sonda, tre — ora quattro — stati).
Provato in PAR-01: `PROVIDER_DEFINITIONS.deepseek.execution === 'collegato'` **e**
`FONTI_MODELLO.includes('deepseek')` nella stessa assertion, così le due verità non possono più
separarsi.

---

## 4. P-B — la cache, con un lettore solo (`src/usage-cache.mjs`, nuovo)

### 4a. Cosa c'era davvero

Non «DeepSeek non è letto». **Tre lettori, tre vocabulari, nessuna fixture:**

| lettore | l'unico nome che conosceva |
|---|---|
| `native-provider-adapter.mjs:44` | `usage.inputTokenDetails.cacheReadTokens` (AI SDK) |
| `context-native-compaction.mjs:9` | `input_tokens_details.cached_tokens` — cioè il **solo** wire Responses, mentre la compattazione gira **anche su Anthropic**, dove il campo si chiama `cache_read_input_tokens`: su quel wire il conto tornava sempre vuoto |
| il kernel, `talosHarness.mjs:6417`/`:6482` | tre nomi in una catena `??` scritta a mano — **non modificabile da questa lane** |

### 4b. La funzione

`tokenDaCache(usage, wire)` — accetta un **wire** o (meglio) un **id di fornitore**; i percorsi del
record vincono, quelli del wire restano in coda. Torna `number | null`.
⛔ **`null`, mai `0`**: `session-registry.mjs:930` lo dice già a parole — «"non dichiarato" non è
"nessuno"» — e qui diventa eseguibile.

Accanto: `tokenScrittiInCache` (le scritture costano **di più**: 1,25×/2× su Anthropic — contarle
come letture farebbe sembrare un risparmio una spesa), `scontoDaCache` (**denaro**, si passa il
*corpo* e non l'usage, può essere negativo), `normalizzaUsage` (aggiunge il nome canonico e **non
toglie niente**; se non c'è da aggiungere torna l'oggetto **identico**), `tokenNonDaCache` (la
formula giusta per il wire — sottrae su OpenAI, **non** sottrae su Anthropic).

Percorsi per wire, con la provenienza di ogni nome:

| wire | percorsi, in ordine |
|---|---|
| `openai-chat` | `prompt_tokens_details.cached_tokens` · `cache_read_input_tokens` · `prompt_cache_hit_tokens` (DeepSeek) · `cached_tokens` (Kimi) |
| `openai-responses` | `input_tokens_details.cached_tokens` · `prompt_tokens_details.cached_tokens` · `cached_tokens` |
| `anthropic-messages` | `cache_read_input_tokens` · `prompt_tokens_details.cached_tokens` |
| `gemini` | `prompt_tokens_details.cached_tokens` · `usageMetadata.cachedContentTokenCount` · `total_cached_tokens` · `cached_tokens` |
| `locale` | *(nessuno — meglio niente che un nome sbagliato)* |

### 4c. Le fixture — una per forma, tutte dalla documentazione

`tests/usage-cache.test.mjs` (8 prove). Ogni fixture porta URL e data nel commento.

* **DeepSeek** `{prompt_tokens: 16 811, prompt_cache_hit_tokens: 16 768, prompt_cache_miss_tokens: 43}` —
  i numeri veri della lezione del 22/8, e **CACHE-03 verifica l'identità dichiarata**:
  16 768 + 43 = 16 811. Chi sommasse gli hit al totale direbbe **33 579** token di ingresso su una
  richiesta che ne ha usati 16 811: il doppio.
* **DeepSeek con il nome canonico** — i due nomi devono dare lo **stesso** numero.
* **Kimi** `usage.cached_tokens` al primo livello · **OpenRouter** `prompt_tokens_details` +
  `cache_discount` fuori da `usage` · **Anthropic** `cache_read_input_tokens` +
  `cache_creation_input_tokens` con `input_tokens` **già residuo** (CACHE-03 pretende 214, non 0) ·
  **Responses** `input_tokens_details.cached_tokens`.
* **CACHE-02** — `null` su tutto ciò che non è dichiarato; `0` **dichiarato** resta `0`; `-5` e
  `'molti'` non diventano conteggi.

### 4d. Dove il numero arriva davvero

* `native-provider-adapter.mjs` → `canonicalUsage(usage, provider)`: prima l'SDK, **poi** tutti i
  nomi del wire. Serve perché ❓ non è verificato che l'adattatore fissato nel lock mappi
  `cachedContentTokenCount` di Gemini (§7.8 dell'inventario): senza, usciva `undefined`.
* `context-native-compaction.mjs` → `usageOf(result, model.provider)`: chiude il buco Anthropic.
* `runtime-owner-adapter.mjs` → `conCacheDichiarata()` nella fetch multi-fornitore: le risposte
  **JSON non in streaming** dei fornitori che instradiamo escono con `prompt_tokens_details.cached_tokens`
  compilato e `cache_discount` esposto. **CACHE-07** lo prova fino al bordo con un DeepSeek finto:
  l'indirizzo chiamato è `https://api.deepseek.test/chat/completions`, il corpo esce con
  `cached_tokens: 16 768` **e** `prompt_cache_hit_tokens` ancora al suo posto.
  ⇒ Il record `tempi-giro` (`session-registry.mjs`, campo `tokenDaCache`) e la Board leggono
  `cached_tokens`: su quel percorso ora lo trovano.

**⛔ Quello che NON fa, e perché.** Un flusso **SSE** passa **intatto** (provato in **CACHE-08**:
la risposta deve essere *la stessa*, non una ricostruita). Riscrivere un `text/event-stream` che non
abbiamo prodotto, per un campo che il kernel sa già leggere in tre forme, costa più del difetto che
curerebbe — e un flusso rimontato male è peggio di un campo mancante. Il giro in chat **è** in
streaming: lì il valore resta quello che estrae il kernel.

---

## 5. P-C — LM Studio come destinazione di chat

Il 90% esisteva: `openai-compatible-runtime.mjs` lo sonda (`detect`), ne elenca i modelli con
capacità **osservate** (`trained_for_tool_use`, `vision`, `reasoning.allowed_options`,
`max_context_length`, quantizzazione), lo **carica** e lo **scarica**. Mancava di essere un
fornitore. Adesso:

* **record** `lmstudio`: wire `openai-chat`, `http://127.0.0.1:1234`, chat `/v1/chat/completions`
  🌐, chiave **facoltativa** 🌐, `envIndirizzo: ['LMSTUDIO_BASE_URL','LM_BASE_URL']`, catalogo
  `runtime-locale` su `/api/v1/models` 🌐, `toolCalling: 'osservato'`;
* da lì, **senza altre modifiche**, è entrato in: `FONTI_MODELLO`, la regex di `config.mjs`, le
  fonti del profilo trial, il portachiavi (con indirizzo e tempo massimo modificabili), la sonda, la
  rotta `/api/v1/providers/lmstudio/models`, e il `<select>` dei fornitori;
* **la rotta del catalogo** dispatcha sul record (`catalogo.fonte === 'runtime-locale'`), non su un
  `if` col nome: chiede al runtime che già lo carica e lo scarica, e mette **qui e solo qui** il
  prefisso `lmstudio:`;
* **la scheda nel selettore modelli**: sesta e ultima (il tetto BC-12 è sei — Apple HIG via
  eleken.co). `caricaDiretti` non pretende più una chiave da chi non ne ha
  (`frontend/src/legacy/app.js`, **una riga**, dichiarata), e `fraseVuotoDiretto` non dice più
  «collega la chiave» a un motore che gira in casa: dice di **accenderlo**;
* **l'indirizzo del pannello vale adesso**: `createOpenAiCompatibleRuntime` accetta un override
  **funzione**, riletto a ogni chiamata. Prima il catalogo fotografava l'indirizzo all'avvio mentre
  la chat lo rilegge a ogni richiesta: cambiare porta nel pannello faceva elencare i modelli di un
  motore e chiamarne un altro, **senza un errore da nessuna parte**.

**Prove con un LM Studio finto** (`tests/http-routes-providers.test.mjs`, 3 nuove):
* `PROVIDER-HTTP-06` — la rotta risponde 200, chiede `http://127.0.0.1:1234/api/v1/models`, scarta
  il modello di *embedding*, e restituisce
  `{id:'lmstudio:qwen3-8b-instruct', contextLength:32768, contestoVerificato:true, capacita:{visione:'osservato-no', toolUse:'osservato-si', reasoning:'osservato-si'}, quantizzazione:'Q4_K_M'}`;
* `PROVIDER-HTTP-07` (contrario) — LM Studio **spento** ⇒ **503 `RUNTIME_UNREACHABLE`**, non un 200
  con lista vuota: «non raggiungibile» e «nessun modello installato» mandano la persona in due posti
  diversi;
* `PROVIDER-HTTP-08` (contrario) — runtime non configurato ⇒ si **dichiara** (404 `REPORT_UNAVAILABLE`).

E `RUNTIME-ENDPOINT-VIVO` (`tests/openai-compatible-runtime.test.mjs`): la porta cambiata a server
acceso arriva alla chiamata successiva; un override che **lancia** non spegne il motore (si torna al
registro); la forma vecchia (oggetto) continua a valere.

---

## 6. Le prove

| Suite | Comando | Esito |
|---|---|---|
| Backend | `node --test tests/*.test.mjs` | **2.501 pass · 0 fail** (2.478 prima, **+23** mie) |
| Frontend | `npm --prefix frontend run test:unit` | **920 pass · 0 fail** |
| Bundle frontend | `esbuild` su `src/legacy/app.js` | OK, 1.498.312 byte |
| Kernel | `git status -- harness-ui/src/kernel/` | **vuoto: non toccato** |

Le 23 nuove: 11 di parità · 8 sulla cache · 3 su LM Studio via HTTP · 1 sull'indirizzo vivo.
Tredici di queste sono **nel verso contrario**.

Un test esistente aggiornato, in due punti, entrambi perché il registro ha cambiato il fatto e non
il contratto:
* `tests/provider-credential-store.test.mjs:35` — la fotografia dei sette diventa otto (`lmstudio`);
  l'invariante «sono gli stessi ovunque» vive ora nel test di parità;
* `frontend/tests/unit/fonti-modelli.test.mjs` — «cinque schede» → sei, con il tetto `<= 6`
  asserito. ⛔ Il numero stava nel **titolo** della prova: un titolo che conta è un titolo che
  invecchia.

---

## 7. Cosa NON ho verificato

1. **Nessuna chiamata a un fornitore vero.** Nessun DeepSeek, OpenRouter, Anthropic, Gemini, OpenAI,
   Ollama, LM Studio o Hugging Face è stato contattato. Nessuna chiave è stata letta dal portachiavi
   né scritta in un log. Tutte le fixture vengono dalla documentazione; tutte le `fetch` sono iniettate.
2. **La porta 4174 non è stata toccata**, né avviata, né aperta, né sondata. **Nessuna verifica
   visiva**: non ho visto la sesta scheda «LM Studio» a schermo, in nessuno dei due temi.
3. **Il frontend NON è stato ricostruito.** `public/` porta ancora il bundle precedente: la scheda
   LM Studio e la riga di `caricaDiretti` non sono nell'app servita finché qualcuno non lancia la
   build. ⛔ Non l'ho fatto di proposito: `git status` mostra **file modificati da un'altra
   sessione** in questa stessa cartella di lavoro (`tests/http-routes-research-esportazioni.test.mjs`,
   più cartelle `.claude/foto-*`), e costruire `public/` congelerebbe il lavoro a metà di un altro —
   è la lezione dell'11/09, `non-consegnare-il-lavoro-a-meta-di-un-altro`.
4. **`npm --prefix frontend run verify` non è girato**: pretende la porta **4177**, già occupata da
   un altro processo. Le prove Playwright di parità visiva (`frontend/tests/parity/`, `componenti.spec.mjs`)
   sono quindi **non eseguite**. Quelle che toccano il pannello Provider (`ProviderCard` dentro
   `#veloFornitori`) non dovrebbero risentire di questa modifica — gli `<option>` non fanno parte
   del componente confrontato — ma **non l'ho misurato**.
5. **Il cancello del kernel è ROSSO, e lo era prima di me**: `npm run kernel:controlla` dice che la
   copia nel repo (8.534 righe) e la fonte nel worktree mobile (6.260) divergono. Non ho toccato né
   l'una né l'altra; lo segnalo perché **decide chi lavora sul kernel**, non io.
6. **DeepSeek: `/v1` o non `/v1`** — resta il dubbio §7.7 dell'inventario. Il record tiene
   `https://api.deepseek.com` (senza `/v1`), che è il valore che il portachiavi ha sempre avuto:
   cambiarlo avrebbe cambiato l'indirizzo a chi ha già salvato. **Non ho provato quale delle due
   forme risponda**, e quindi **non sappiamo se DeepSeek sia mai partito davvero**.
7. **Gemini e la cache**: non ho verificato che `@ai-sdk/google` fissato nel lock mappi
   `cachedContentTokenCount` (REST) o `total_cached_tokens` (SDK) in `inputTokenDetails.cacheReadTokens`.
   Il ripiego sui nomi grezzi ora c'è, ma **se l'SDK li consuma senza esporli, nessun ripiego li vede**.
8. **`cache_discount` su OpenRouter**: verificato che lo dichiara la documentazione; **non**
   verificato che arrivi nelle nostre risposte, e comunque il giro di chat è in streaming (§4d) —
   quindi oggi resta invisibile. Il pannello costi **non** è stato modificato per mostrarlo.
9. **Lo streaming SSE non normalizza la cache** — limite dichiarato e provato, non risolto (§4d).
10. **Kimi, Z.AI e gli altri**: i loro percorsi di cache sono **dichiarati nel wire** ma nessuno di
    quei fornitori esiste nel registro. La lettura è pronta; il fornitore no. È P-I.
11. **Nessun modello è stato eseguito**, né locale né remoto: `toolCalling: 'osservato'` per
    LM Studio viene da ciò che *LM Studio dichiara per modello*, non da un giro fatto da me.
12. **Nessuna riga toccata in `mobile/`**, nessun `git add`, nessun commit, nessun push.
