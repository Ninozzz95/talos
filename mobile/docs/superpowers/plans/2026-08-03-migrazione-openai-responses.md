# Migrazione OpenAI a `/v1/responses` — brief eseguibile

**Owner 2026-08-03:** «risolviamo prima openai» → **prima della fase 3**.
**Contratto già misurato:** `docs/superpowers/research/2026-08-03-openai-responses-api-contratto-misurato.md` (`4780a9b`).
**Correzione che tiene l'app in piedi nel frattempo:** `27ed3f9` — **non
rimuoverla** finché il punto 6 non è passato.

Questo documento non ripete il contratto: dice cosa fare, in che ordine, e
qual è il cancello.

---

## 1. PRIMA di scrivere codice: misurare i due pezzi ignoti

Sono i più grossi e sono gli unici non verificati. Farli per ultimi
significherebbe scoprire a migrazione fatta che lo streaming non funziona.

Serve la chiave OpenAI dell'owner (chiedergliela, non cercarla nel repo).

### 1a. Gli eventi dello streaming

```bash
curl -N https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"model":"gpt-5.6-luna","input":[{"role":"user","content":"Conta da 1 a 20."}],
       "reasoning":{"effort":"low"},"stream":true,"store":false}'
```

**Cosa serve saperne:**

- l'elenco dei `event:` che arrivano, in ordine;
- **quale** porta il delta del testo (atteso `response.output_text.delta`, da
  confermare) e dove sta il testo dentro quell'oggetto;
- come si riconosce la fine (`response.completed`?) e dove sta l'`usage`
  finale;
- **cosa arriva quando la risposta è una chiamata a un tool** — ripetere con
  `tools` e vedere se il delta degli argomenti arriva a pezzi
  (`response.function_call_arguments.delta`?). Questo decide se la chiamata si
  può mostrare mentre si forma o solo alla fine.

Oggi l'adattatore legge `chat.completion.chunk`: **quei tipi non esistono qui**.

### 1b. Il rimando del risultato di un tool

Con l'`output` della prova già fatta si conosce `call_id`. Il secondo giro:

```json
{"model":"gpt-5.6-luna",
 "input":[{"role":"user","content":"Cerca i documenti sulla batteria."},
          {"type":"function_call","call_id":"call_…","name":"library_search",
           "arguments":"{\"query\":\"batteria\"}"},
          {"type":"function_call_output","call_id":"call_…",
           "output":"[{\"nome\":\"batteria.md\"}]"}],
 "tools":[…],"reasoning":{"effort":"high"},"store":false}
```

**Da verificare:** se la chiamata originale va rimessa in `input` insieme al
risultato (su chat/completions è obbligatorio), e se `output` vuole una stringa
o un oggetto. Un 400 qui è documentazione: leggerne il `param`.

**Scrivere gli esiti nel dossier del contratto**, non solo nel commit.

---

## 2. Dove va il codice

`src/lib/chat/providers/openAiCompatibleAdapter.ts` ha già i rami per
`config.provider`. La migrazione è **un ramo in più per il solo `openai`**, non
un adattatore nuovo:

- DeepSeek, OpenRouter e Ollama **restano** su `/v1/chat/completions`;
- il ramo OpenAI cambia URL, corpo e lettura.

Pezzi nuovi, tutti puri e testabili senza rete:

| pezzo | perché non si riusa quello che c'è |
|---|---|
| `talosToolsForOpenAiResponses()` | i tool qui sono **piatti**; `talosToolsForOpenAi` produce la forma annidata |
| lettore di `output[]` | è un array eterogeneo, non `choices[0].message` |
| rimappatore dell'uso | `input_tokens`/`output_tokens`, non `prompt_tokens`/`completion_tokens` |
| lettore degli eventi SSE | i tipi di 1a |

**Il ragionamento non va nel cassetto**: `encrypted_content` non è leggibile. Si
può mostrare solo il costo (`output_tokens_details.reasoning_tokens`). Se il
cassetto «Ragionamento» resta vuoto per OpenAI, va detto — non lasciato
silenzioso.

---

## 3. L'ordine, per non rompere niente a metà

1. i due probe del punto 1;
2. i pezzi puri, con i loro test (nessuna rete);
3. il ramo `openai` che li usa, **non in streaming**;
4. lo streaming;
5. il rimando dei risultati dei tool;
6. **solo alla fine**: togliere la ricaduta di `27ed3f9`.

Il punto 6 è l'ultimo per la stessa ragione per cui la negazione dei tool locali
è stata l'ultima: finché il percorso nuovo non regge, quello vecchio è ciò che
tiene il modello utilizzabile.

---

## 4. Il cancello: cosa vuol dire «fatto»

Sul dispositivo, con `gpt-5.6-luna` selezionato:

- un messaggio semplice risponde, **in streaming**, parola per parola;
- un messaggio che richiede un tool lo **esegue**, e il risultato rientra nella
  risposta;
- con il ragionamento su «alto» **non** arriva nessun 400;
- e gli altri provider (DeepSeek, OpenRouter, un modello locale) rispondono
  ancora — è la prova che il ramo non ha invaso la casa di nessuno.

Nessuno di questi è opzionale: sono i quattro rami dello stesso componente
([[analyze-whole-component-pipeline]]).

---

## 5. La decisione che resta all'owner

Se la migrazione slitta, **la ricaduta silenziosa va resa visibile lo stesso**:
oggi chi chiede «ragionamento alto» ottiene «none» e non lo sa. Una riga nella
ricevuta del messaggio, e il compromesso smette di essere una bugia tacita.
