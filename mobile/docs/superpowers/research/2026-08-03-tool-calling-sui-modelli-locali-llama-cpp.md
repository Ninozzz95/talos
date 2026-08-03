# Tool calling sui modelli locali — quello che llama.cpp ha già

**Data:** 2026-08-03
**Perché:** owner — «i locali devono avere le stesse possibilità dei key»
([[local-models-must-have-tools]]).
**Metodo:** la ricerca *search* era esaurita (200/200), quindi fetch diretto
sulle fonti canoniche. Nessuna deduzione: sotto ogni affermazione c'è un file.

---

## 0. La conclusione, in una riga

**Non c'è niente da inventare.** llama.cpp espone un'API pubblica che fa
esattamente questo — applica il template del modello CON i tool, restituisce il
prompt *e la grammatica*, e poi rilegge l'uscita separando testo, ragionamento e
chiamate. Il nostro lavoro è **collegarla**, non riscriverla.

---

## 1. L'API, per nome (`common/chat.h`)

| Cosa serve | Chi lo fa |
|---|---|
| Formattare messaggi **+ tools** col template del modello | `common_chat_templates_apply(inputs) → common_chat_params` |
| Rileggere l'uscita | `common_chat_parse(text) → common_chat_msg` |
| Convertire tool in stile OpenAI | `common_chat_tools_parse_oaicompat()` |
| Sapere se il modello ragiona | `common_chat_templates_support_enable_thinking()` |

Strutture: `common_chat_tool { name, description, parameters }`,
`common_chat_tool_call { name, arguments, id }`,
`common_chat_msg { role, content, content_parts, tool_calls, reasoning_content }`.

I tool si passano in `common_chat_templates_inputs::tools`;
`common_chat_tool_choice` vale `AUTO | REQUIRED | NONE`.
`common_chat_format`: `CONTENT_ONLY`, `PEG_SIMPLE`, `PEG_NATIVE`, `PEG_GEMMA4`,
`PEG_MINIMAX_M3`.

### Il fatto che cambia il piano

`common_chat_msg` porta **`reasoning_content` separato da `content`**, e
`common_chat_parse` lo popola. Quindi **il difetto dei `<think>` stampati nel
testo e il ponte per i tool sono la stessa chiamata**
([[local-model-think-tags-and-token-soup]]). Non sono due lavori: è uno.

---

## 2. Il template (`docs/function-calling.md`)

- **`--jinja`** accende la gestione dei template consapevole dei tool. Richiede
  che il modello abbia `chat_template` oppure `chat_template_tool_use`.
- Se il template **non è riconosciuto** dai gestori nativi si cade sul formato
  **«Generic»** — funziona, ma peggio. Nei log compare `Chat format: Generic`.
- Senza un `tool_use` ufficiale si può forzare `--chat-template chatml`, «though
  results vary», o passarne uno con `--chat-template-file`.

**Famiglie con supporto nativo dichiarato:** Llama 3.1/3.2/3.3 (con i tool
integrati `wolfram_alpha`, `web_search`/`brave_search`, `code_interpreter`),
Functionary v3.1/v3.2, **Hermes 2/3**, **Qwen 2.5** e Qwen 2.5 Coder, Mistral
Nemo, Firefunction v2, Command R7B, DeepSeek R1 — quest'ultimo marcato
«WIP / seems reluctant to call any tools?».

### Avvertenza che ci riguarda direttamente

> «Beware of extreme KV quantizations (e.g. `-ctk q4_0`), they can substantially
> degrade the model's tool calling performance.»

**Da verificare nella nostra configurazione JNI prima di dare la colpa al
modello.** Le chiamate parallele esistono ma sono spente per difetto
(`"parallel_tool_calls": true`).

---

## 3. La grammatica (`grammars/README.md`)

GBNF vincola l'uscita: «you can use it to force the model to generate valid
JSON». È il modo per **garantire** una chiamata valida invece di sperarci.

- Uno schema JSON diventa grammatica con `json_schema_to_grammar.py` / `--json`.
- **«The JSON schema is only used to constrain the model output and is not
  injected into the prompt.»** — quindi non costa contesto, che su un 4B conta.

**Limiti documentati, da rispettare quando generiamo le grammatiche dai nostri
schemi zod:**

- non supportati: `uniqueItems`, `contains`, condizionali `if/then/else`, `$ref`
  annidati;
- `additionalProperties` vale `false` per difetto («faster, fewer
  hallucinations»);
- i `pattern` vogliono le ancore `^` e `$`;
- **`x? x? x?` rende il campionamento «extremely slow»** — usare `{0,N}`.

Fortuna nostra: i nostri schemi sono **già oggetti piatti**, perché Anthropic ci
ha costretti a togliere le unioni in cima (`anthropicAcceptsEveryTool.test.ts`).
Lo stesso vincolo ci mette in regola qui.

---

## 4. Qwen, che è il modello sul dispositivo dell'owner

- Il template in `tokenizer_config.json` **include già il tool use in stile
  Hermes**, e la documentazione raccomanda proprio lo stile Hermes per Qwen3
  «to maximize function calling performance».
- In modalità ragionamento Qwen produce `reasoning_content` **prima** delle
  chiamate.
- **Avvertenza esplicita:** per i modelli che ragionano **non** usare template di
  tool basati su stopword (tipo ReAct), «because the model may output stopwords
  in the thought section». Cioè: il parser artigianale a stringhe è proprio
  l'approccio da NON prendere — che è un altro modo di dire che va usato
  `common_chat_parse`.

---

## 5. Cosa comporta per noi, in concreto

1. **Compilare `common/chat.*` dentro la nostra libreria nativa.** Oggi il ponte
   JNI usa l'API di basso livello di `llama.h` e costruisce il prompt a mano;
   `common` porta con sé il motore Jinja (minja). È il vero costo del lavoro, ed
   è ingegneria di build, non di logica ([[llama-cpp-android-integration]]).
2. **Passare i nostri tool** già in forma OpenAI a `common_chat_templates_inputs`
   — la forma che il registro produce già per gli altri provider.
3. **Usare la grammatica che `common_chat_params` restituisce**, invece di
   sperare nel JSON.
4. **Leggere con `common_chat_parse`**: `content` in chat, `reasoning_content`
   nel cassetto Ragionamento, `tool_calls` nell'esecutore.
5. **Togliere la negazione** in `modelToolCapabilities.ts:18` **solo alla fine**,
   quando i quattro punti sopra reggono — altrimenti si offre al modello una
   capacità che non ha e tornano le risposte in prosa che fingono una chiamata.

---

## 6. Fonti

- llama.cpp, funzione calling: <https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md>
- llama.cpp, GBNF: <https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md>
- llama.cpp, API chat: <https://github.com/ggml-org/llama.cpp/blob/master/common/chat.h>
- Qwen, function calling: <https://qwen.readthedocs.io/en/latest/framework/function_call.html>
