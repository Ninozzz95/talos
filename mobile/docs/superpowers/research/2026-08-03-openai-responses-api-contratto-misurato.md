# `/v1/responses` — il contratto, misurato contro l'API vera

**Data:** 2026-08-03
**Perché:** su `/v1/chat/completions` i modelli nuovi rifiutano tool e
ragionamento insieme. Owner: «risolviamo prima openai, fetch documentazione
reale e aggiornata e prova su device».
**Metodo:** la pagina delle docs risponde **403** al fetch e lo schema OpenAPI
su GitHub è troppo grande per essere letto in un colpo. Quindi la fonte è
**l'API stessa**, interrogata con la chiave dell'owner. Ogni riga qui sotto è
una risposta ricevuta, non una citazione.

---

## 0. La conferma che serviva

```
POST /v1/responses   model=gpt-5.6-luna
  tools + reasoning:{effort:"high"}      → 200
```

Sullo stesso modello, su `/v1/chat/completions`:

```
  tools + reasoning_effort:"high"        → 400
  tools + campo OMESSO                   → 400
  tools + reasoning_effort:"none"        → 200
```

**Su `/v1/responses` convivono.** È la ragione della migrazione, e l'unica che
serve.

---

## 1. La richiesta

```json
{
  "model": "gpt-5.6-luna",
  "instructions": "Sei TALOS. Rispondi in italiano.",
  "input": [{ "role": "user", "content": "..." }],
  "tools": [{
    "type": "function",
    "name": "library_search",
    "description": "Cerca file nella Libreria di TALOS.",
    "parameters": { "type": "object", "properties": { ... }, "required": [...] }
  }],
  "tool_choice": "auto",
  "reasoning": { "effort": "high" },
  "store": false
}
```

**Le tre differenze che rompono un porting fatto a memoria:**

1. **`instructions` al posto del messaggio `system`.** Non è un turno dentro
   `input`: è un campo suo.
2. **`input` al posto di `messages`.**
3. **I tool sono PIATTI.** `name`, `description` e `parameters` stanno accanto a
   `type: "function"`, **non annidati** sotto una chiave `function` come su
   chat/completions. `talosToolsForOpenAi` produce la forma annidata: serve una
   seconda funzione, non un riuso.

`store: false` va messo di proposito — TALOS non vuole che le conversazioni
restino sul server.

---

## 2. La risposta

`output` è un **array di elementi eterogenei**, non un `choices[0].message`.

Tipi visti:

```json
{ "type": "reasoning", "id": "rs_…", "content": [], "encrypted_content": "gAAAA…" }

{ "type": "message", "id": "msg_…", "role": "assistant", "status": "completed",
  "phase": "final_answer",
  "content": [{ "type": "output_text", "text": "…", "annotations": [], "logprobs": [] }] }

{ "type": "function_call", "id": "fc_…", "call_id": "call_BkUld…",
  "name": "library_search", "arguments": "{\"query\":\"batteria\"}",
  "status": "completed" }
```

**Da notare, e sono trappole:**

- **il testo sta due livelli sotto**: `output[] → content[] → text`. Non esiste
  la scorciatoia `output_text` nel JSON grezzo (verificato: assente);
- **la chiamata ha DUE identificativi**, `id` (`fc_…`) e `call_id` (`call_…`).
  Quello che serve per riappaiare il risultato è **`call_id`**;
- `arguments` è una **stringa** JSON, come su chat/completions;
- il ragionamento arriva come elemento a sé, con il contenuto **cifrato**:
  `encrypted_content` non è leggibile e non va nel cassetto «Ragionamento». Con
  `reasoning.effort` alto il testo del pensiero **non** è disponibile: si sa
  solo quanto è costato (vedi sotto).

### L'uso

```json
"usage": { "input_tokens": 73, "output_tokens": 42,
           "output_tokens_details": { "reasoning_tokens": 20 },
           "total_tokens": 115 }
```

Nomi diversi da chat/completions (`prompt_tokens` / `completion_tokens`): la
ricevuta va rimappata o mostrerà zero.

---

## 3. Cosa comporta per TALOS

1. **Un ramo di richiesta nuovo per il solo OpenAI.** DeepSeek, OpenRouter e
   Ollama restano su `/v1/chat/completions` — l'adattatore ha già i rami per
   `config.provider`, quindi è dove va messo.
2. **Una seconda forma dei tool** (piatta), accanto a `talosToolsForOpenAi`.
3. **Un lettore della risposta** che cammina `output[]` invece di
   `choices[0].message`, e che prende `call_id` e non `id`.
4. **Lo streaming è da verificare**: qui non è stato provato. Gli eventi SSE di
   `/v1/responses` hanno tipi propri (`response.output_text.delta` e simili) e
   NON sono i `chat.completion.chunk` di oggi. È il pezzo più grosso e il meno
   noto.
5. **Il rimando dei risultati dei tool** è l'altra metà da misurare: si inviano
   come elementi `function_call_output` dentro `input`, con `call_id`. Da
   provare prima di scrivere il codice.

## 4. Cosa resta in piedi nel frattempo

La correzione di `27ed3f9` — impara dal rifiuto e chiede `reasoning_effort:
'none'` — **non va rimossa** finché la migrazione non è completa e provata sul
dispositivo. È ciò che tiene il modello utilizzabile oggi.

Resta però **silenziosa**: chi chiede «ragionamento alto» ottiene «none» e non
lo sa. Se la migrazione slitta, quella riga nella ricevuta va scritta comunque.

---

## 5. Lo streaming e il rimando dei tool — MISURATI (2026-08-03, stessa sessione)

Erano i due pezzi mancanti. Non c'era niente da delegare: la pagina delle docs
rifiuta il fetch, ma **curl sull'API funziona** ed è una fonte più forte.

### Gli eventi, in ordine

Risposta di solo testo:

```
response.created → response.in_progress → response.output_item.added
→ response.content_part.added → response.output_text.delta (×N)
→ response.output_text.done → response.content_part.done
→ response.output_item.done → response.completed
```

Risposta che chiama un tool — **nessun `content_part`**, e due `output_item`
(il ragionamento e la chiamata):

```
response.created → response.in_progress → response.output_item.added (×2)
→ response.function_call_arguments.delta (×N)
→ response.function_call_arguments.done
→ response.output_item.done (×2) → response.completed
```

**Dove sta la roba:**

| evento | campo |
|---|---|
| `response.output_text.delta` | `delta` — il pezzo di testo |
| `response.function_call_arguments.delta` | `delta` — pezzi della stringa JSON |
| `response.output_item.done` | `item` — la `function_call` INTERA, con `call_id` |
| `response.completed` | `response.usage` — l'uso finale |

Quindi la chiamata non va ricomposta a mano dai delta: `output_item.done` la
consegna intera. I delta servono solo se si vuole mostrarla mentre si forma.

### Il rimando del risultato: FUNZIONA

Nel secondo giro `input` porta **due elementi in più**, entrambi con lo stesso
`call_id`:

```json
{"type":"function_call","call_id":"call_iKV…","name":"library_search",
 "arguments":"{\"query\":\"batteria\"}"}
{"type":"function_call_output","call_id":"call_iKV…",
 "output":"[{\"nome\":\"batteria-oneplus.md\"}]"}
```

→ **200**, e il modello risponde usando il risultato: «Ho trovato un documento
nella tua Libreria: **batteria-oneplus.md**».

**Confermato:** la chiamata originale va **rimessa** in `input` accanto al
risultato (come su chat/completions), e `output` è una **stringa**.
