# Due difetti trovati dall'owner sul telefono, 2026-08-02

Trovati col dito, in viaggio, sulla build `1e40514`. Diagnosticati qui contro il
codice e contro la rete vera — non ipotizzati.

---

## D1 — La sonda dell'intestazione GGUF si arrende UN tentativo troppo presto

**Sintomo** (schermata Modelli, repo `mradermacher/Holo-3.1-4B-i1-GGUF`):
ogni quantizzazione mostra «Non posso controllarlo: l'intestazione è più grande
di quanto questa build vada a prendere.»

**Misura vera, fatta contro Hugging Face con una richiesta Range:**

| file | intestazione reale |
|---|---:|
| `Holo-3.1-4B.i1-IQ1_S.gguf` | **10.969.337 byte** (KV finiscono a 10.944.159) |

Le tre chiavi che la gonfiano: `tokenizer.ggml.merges` **5.086.413 byte**,
`tokenizer.ggml.tokens` **4.853.403**, `tokenizer.ggml.token_type` **993.329**.
64 chiavi KV, 427 tensori, GGUF v3.

**Perché fallisce.** Il ri-tentativo esiste già (`localModels.ts`, aggiunto il
2026-08-01 da una review avversariale) e il tetto è 32 MiB — cioè **abbondante**.
Ma il parser, quando si ferma, non sa quanto manca davvero: tira a indovinare con
`view.byteLength * 2`. Partendo da 1 MiB e con `TALOS_GGUF_HEADER_ATTEMPTS = 3`
la progressione è:

```
1 MiB → 2 MiB → 4 MiB → 8 MiB → si ferma
```

**8 MiB. L'intestazione ne vuole 10,97.** Un tentativo in più (16 MiB) avrebbe
funzionato. Il tetto non è mai stato raggiunto e il messaggio all'utente dà la
colpa alla dimensione dell'intestazione invece che al numero di giri.

**Correzione:** far sì che il raddoppio possa arrivare fino al tetto —
`log2(32/1) = 5` tentativi — oppure, meglio, **saltare direttamente al tetto al
secondo fallimento**: `byteLength * 2` è una congettura, non una misura, e
inseguirla a raddoppi costa cinque viaggi di rete per scoprire un numero che
potevamo chiedere in uno.

## D2 — `.imatrix` non è un modello, e viene presentato come tale

**Sintomo:** `Holo-3.1-4B.imatrix` (3,5 MB) mostra «Non posso controllarlo:
l'intestazione non dice quello che serve sapere per questo telefono», con i
pulsanti **Ricontrolla** e **Scarica** come per un modello vero.

**Cosa è davvero:** un GGUF valido (v3, 496 tensori) con **4 sole chiavi**:
`general.type`, `imatrix.datasets`, `imatrix.chunk_count`, `imatrix.chunk_size`.
È la **matrice di importanza** usata per quantizzare, non un modello: non ha
`block_count`, né `embedding_length`, né niente di ciò che serve al fit.

Quindi il messaggio è tecnicamente esatto e praticamente inutile: la risposta
giusta è «questo non è un modello, è un file di supporto alla quantizzazione», e
non deve avere un verdetto di compatibilità né un pulsante che invita a scaricarlo
per usarlo.

**Correzione:** riconoscere `general.type` (o la famiglia di chiavi `imatrix.*`)
e classificare il file come accessorio, fuori dalla lista dei candidati.

---

## D3 — La sintesi di Deep Research fallisce con i modelli di ragionamento

**Sintomo:** run «I migliori modelli da far girare in locale su android
Snapdragon 8 elite e 12 GB di ram», scrittore **OpenRouter · OpenAI GPT 5.6
Terra**: `b1:search` **done**, `synthesis` **failed**,
`TALOS_PROVIDER_RESPONSE_MALFORMED`.

**Causa, letta nel codice.** In `openAiCompatibleAdapter.ts` le due strade non si
comportano allo stesso modo:

- `streamComplete()` **legge** `reasoning_content` e `reasoning` dal delta
  (righe ~271-273);
- `complete()` **no**: prende solo `message.content`, e se il testo è vuoto e non
  ci sono chiamate a tool lancia `malformedProviderResponse(..., 'no text and no
  tool calls')`.

Deep Research usa `complete()`. Un modello di ragionamento che mette la risposta
nel canale `reasoning` — o che esaurisce il budget ragionando — produce
`content` vuoto, e noi lo chiamiamo «risposta malformata» invece di «il modello
ha risposto solo col ragionamento».

**È un'asimmetria dentro lo stesso adattatore**: una strada sa una cosa che
l'altra non sa. Il difetto non è il modello, è che abbiamo insegnato la lezione a
metà codice.

**Correzione, due parti:**
1. `complete()` deve leggere `reasoning_content` / `reasoning` come ripiego del
   testo, esattamente come fa lo streaming.
2. Quando davvero non c'è nulla, l'errore deve dirlo con parole diverse da
   «malformata»: la risposta è arrivata, era vuota. E la stazione deve suggerire
   la cosa che risolve — scegliere un altro scrittore.

**Nota di metodo:** `malformedProviderResponse` scrive già nel registro del
dispositivo la forma ricevuta (`got=`) e le violazioni di schema (`broke=`).
Quella riga, nella Diagnostica del telefono, direbbe in due secondi quale delle
due varianti è. Vale la pena chiederla prima di correggere alla cieca.

---

## Quando si correggono

Tutti e tre sono piccoli e vanno **accorpati al prossimo blocco**, come da regola
sugli APK ([[apk-only-for-big-blocks]]) — a meno che l'owner, essendo in viaggio
e bloccato su Holo, non voglia una build solo per D1+D2, che sono due righe.

---

# CHIUSURA — corretti, provati sul dispositivo, 2026-08-02

## Checkpoint di ricerca (REGOLA ZERO)

| Query | Fonti | Impatto |
|---|---|---|
| `OpenRouter non-streaming reasoning field empty content 2026` | issue openclaw #67410 (minimax-m2.7 e Qwen3), issue #66768, docs Haystack OpenRouter | **Non è un caso di nicchia**: è documentato che i modelli OpenRouter che restituiscono `reasoning_details` si vedono **il contenuto scartato in silenzio** da più integrazioni. Quindi il ripiego deve coprire **tre** nomi, non uno: `reasoning`, `reasoning_content`, `reasoning_details`. |
| (stessa ricerca) | issue su gpt-5-nano | **Esiste una SECONDA causa, diversa**: la fase di ragionamento può consumare **l'intero budget di token**, lasciando zero per la risposta. Lì non c'è niente da recuperare — ma «malformata» resta la parola sbagliata, e il rimedio per l'utente è un altro (cambiare modello, non cambiare provider). Da qui due errori distinti invece di uno. |
| `GGUF header parsing partial range request best practice` | gguf-parser-go, docs formato GGUF | Il formato **non dichiara la lunghezza dell'intestazione**: è tutto seriale, e per sapere dove finisce bisogna percorrerla. La pratica corrente è la **lettura a pezzi** con finestra che cresce. Il nostro punto di partenza (1 MiB) è già generoso rispetto ai 50-100 KB tipici: il difetto era **solo** il numero di giri. |

## Cosa è stato corretto

**D1.** Nel punto in cui il parser cammina un array di stringhe — cioè il
tokenizer, cioè esattamente dove finisce lo spazio — ora **estrapola invece di
raddoppiare**: sa quante stringhe ci sono e quanto erano lunghe quelle lette, e
il resto è aritmetica. Più `TALOS_GGUF_HEADER_ATTEMPTS` da 3 a **5**, perché il
raddoppio da 1 MiB arriva al tetto di 32 solo al quinto giro: era il paracadute
per quando non c'è niente da estrapolare, e non c'era.

**D2.** `general.type` letto **prima** di qualunque campo del modello e prima
della camminata sui tensori. Se non dice `model`, il file esce dai candidati con
il suo nome: nuovo esito `not-a-model`, distinto da `incomplete` perché le due
cose vogliono parole opposte — una è un modello che non abbiamo capito, l'altra
è un file che modello non è mai stato.

**D3.** `complete()` impara quello che `streamComplete()` sapeva già, e cioè i
tre nomi del canale del ragionamento. Il contenuto vero vince sempre. E quando
davvero non c'è niente, l'errore non è più `TALOS_PROVIDER_RESPONSE_MALFORMED` ma
`TALOS_PROVIDER_RESPONSE_EMPTY`, con due messaggi diversi a seconda di
`finish_reason`: budget finito ragionando, oppure nulla e basta.

## Cancelli

`npm run build` verde · **3093 test** · **quattro mutazioni provate**, tutte
mordono: estrapolazione tolta, controllo `general.type` tolto, ripiego sul
ragionamento tolto, e ordine invertito (il ragionamento che batte il contenuto).

## Prova sul dispositivo (OnePlus Pad 3, repo vero `mradermacher/Holo-3.1-4B-i1-GGUF`)

- **D1** — `IQ1_M`, che prima diceva «l'intestazione è più grande di quanto
  questa build vada a prendere», ora dice:
  **«Gira comodo · circa 8.4 token al secondo — controllato a 4096 token di
  contesto.»** Ha letto i 10,97 MB di intestazione e ha prodotto un verdetto.
- **D2** — `Holo-3.1-4B.imatrix` ora dice:
  **«Non è un modello: è un file di servizio che serve a quantizzarne uno. Non si
  può eseguire.»**
- **D3** — **non verificabile su questo tablet**: ha solo DeepSeek configurato,
  e il difetto si vede con OpenRouter. È provato dai test contro le forme di
  risposta esatte documentate nelle segnalazioni. La prova sul campo tocca al
  telefono dell'owner, che quella chiave ce l'ha.

## Rifinitura rimasta

Il messaggio di D2 conserva il prefisso «Non posso controllarlo:» che ora è
sbagliato — non è che non possiamo controllarlo, è che non c'è niente da
controllare. Riga di composizione nel componente, non nella logica: va nel
prossimo giro di rifinitura UI.
