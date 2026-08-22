# Rilievo 1 — gli strumenti rotti sul modello locale: la diagnosi

> Owner, 22/8, con screenshot reali: *«È INACCETTABILE bisogna fare un test con
> diversi modelli di TUTTI I TOOL uno per uno, fare un censimento, analizzare
> cosa non va VISIVAMENTE e risolverli tutti. Una prova valida di UN modello non
> fa automaticamente passare la fase. Le prove devono essere SCETTICHE,
> CRITICHE e COMPLETE.»*
>
> ⛔ Questo documento **non cura niente**: strumenta. È il pezzo che deve venire
> prima, ed è nato da una pista che il censimento SUPERSET ha consegnato per caso.

---

## ⭐⭐⭐ Il primo sintomo è spiegato, e la causa è verificata

Lo screenshot mostrava un blob grezzo dentro il testo della risposta:

```
<|python_tag|>{"name": "tool_details", ...}
```

`<|python_tag|>` è il modo in cui **Llama 3.2** emette una chiamata a strumento.
Cercato in tutto l'albero TypeScript:

```
grep -rn "python_tag" --include=*.ts        ⇒ ZERO occorrenze
```

I riconoscitori che esistono sono altri due, e stanno in
`src/lib/chat/localToolCalls.ts`:

```
PLAIN_TOOL_DETAILS   riga nuda      tool_details: nome1, nome2
TOOL_CODE_*          blocco         TOOL_CODE / tool: / args:
```

⇒ **Nessuna delle due grammatiche combacia con il formato di Llama 3.2.** La
chiamata non viene riconosciuta, non diventa un `tool_call`, e cade nel testo
visibile — che è esattamente ciò che si vede nella foto.

### ⛔⛔ CORREZIONE: quelle due grammatiche sono il RIPIEGO, non il percorso

La prima stesura si fermava qui e diceva «i formati riconosciuti sono due,
scelti a mano». **Falso, e per la stessa ragione delle altre correzioni di
questo documento: avevo guardato lo strato che avevo trovato per primo.**

Il percorso vero, verificato dal Java alla TypeScript:

```
IN    TalosLlamaNative.nativeApplyChatTemplate(messaggi, tools)
      ⇒ llama.cpp costruisce il prompt NEL DIALETTO DEL MODELLO

OUT   TalosLlamaNative.nativeParseReply(raw)      ← ⭐ ESISTE, ed e' CHIAMATO
      TalosLlamaPlugin.java:622, in produzione

poi   localToolCalls.ts (le due grammatiche) come RIPIEGO
```

E il meccanismo del sintomo sta in `TalosLlamaPlugin.java:617-630`:

```java
result.put("text", raw);                       // il GREZZO, come punto di partenza
JSONObject split = new JSONObject(engine.parseReply(raw));
final String content = split.optString("content", "");
JSONArray calls = split.optJSONArray("toolCalls");
final boolean called = calls != null && calls.length() > 0;
if (!content.isEmpty() || called) result.put("text", content);   // sostituito SOLO se separa
…
catch (JSONException malformed) {
    android.util.Log.w("TalosLlama", "risposta non separabile", malformed);
}                                              // ⇒ e il GREZZO resta
```

⇒ **Se `parseReply` non riconosce il dialetto, il testo grezzo resta e va a
schermo.** Non è una perdita né un buco: è la degradazione **progettata**, e
lascia **una sola traccia** — `risposta non separabile` in logcat.

⭐⭐ Questo rende la misura decisiva del censimento **precisa e a costo quasi
zero**: per ogni modello, si chiede uno strumento e si guarda se in logcat
compare quella riga. Non serve un'ispezione visiva per stabilire il fatto — la
verifica visiva resta per il resto del rilievo, non per questo.

⛔ **E il buco vero, trovato per strada:** `parseReply` — il componente che
traduce il dialetto di un modello in chiamate strutturate — **non ha un solo
test**, né unitario né strumentato. È l'unico anello fra ciò che il modello dice
e ciò che TALOS capisce, e nessuna prova lo sorveglia.

---

## Il secondo sintomo: `TALOS_LLAMA_NO_CHAT_TEMPLATE`, e una cura che non basta

Visto su **due modelli diversi** — `Llama-3.2-1B-Instruct.Q8_0` e
`gemma-3-4b-it-Q4_K_M`. Due modelli, stesso errore, ⇒ il sospetto va
sull'**ingresso**, non sul modello.

L'errore nasce in `android/app/src/main/java/ai/talos/TalosLlamaPlugin.java:916`:

```java
String prompt = attivo.chatPrompt(messagesJson, toolsJson, pensa);
if (prompt == null || prompt.isEmpty()) {
    call.reject("TALOS_LLAMA_NO_CHAT_TEMPLATE");
```

⛔ Il nome dell'errore dice «manca il template», ma la condizione dice
**«`chatPrompt` non ha prodotto niente»** — che è una cosa più larga: il
template può esistere e **fallire a rendere** questi messaggi.

⭐ E la prova che è così sta già nel nostro codice, in
`src/lib/chat/providers/localAdapter.ts:1228`, misurata sul Pad il **21/8**:

```
Jinja Exception: Conversation roles must alternate user/assistant/user/...
⇒ il template di Gemma pretende che i ruoli si ALTERNINO, e un turno
  assistente VUOTO lo spezza al giro dopo: TALOS_LLAMA_NO_CHAT_TEMPLATE
```

Quella causa **è stata curata il 21/8** (il testo non si svuota più dentro il
ciclo; la sostituzione avviene in `chatController`, fuori, dove nessun template
lo rilegge).

⛔⛔ **E l'owner ha visto il sintomo il 22/8, dopo la cura.** ⇒ O la cura non
copre tutti i percorsi che possono svuotare il turno, o c'è una seconda causa.
Questo documento **non lo sa**, e non lo indovina.

⭐ Ma il nome dell'errore è già un difetto per conto suo: `NO_CHAT_TEMPLATE`
manda a cercare un template mancante quando il template c'è ed è il **contenuto**
a non passare. Un errore che nomina la causa sbagliata costa un giro di indagine
a chiunque lo incontri — ed è la stessa famiglia di `ok:false su un elenco vero`.

---

## Una terza cosa, latente, trovata per strada

`localToolCalls.ts:221` scrive il nome a mano:

```js
if (!nomi || !offerti.has('tool_details') || …)
```

mentre `catalogoCompatto.ts:97` lo definisce come costante:

```js
export const TALOS_DETTAGLI_STRUMENTO = 'tool_details'
```

Oggi combaciano. Il giorno che la costante cambia, il riconoscitore smette di
riconoscere **in silenzio** e la chiamata torna a finire nel testo visibile —
lo stesso sintomo di sopra, con una causa diversa. ⇒ Un nome che due moduli
devono condividere si importa, non si riscrive.

---

## ⭐⭐⭐ La prima riga del censimento, misurata sul Pad

I tre modelli installati, coi loro `tokenizer.chat_template` letti **dai GGUF
veri** (offset trovato sul dispositivo, finestra di 128 KB tirata giù: nessun
gigabyte trasferito, nessuna chiamata al modello, costo zero).

```
modello                       tpl   tools  tool_call  python_tag  ipython  function
Llama-3.2-3B-Instruct-Q4_K_M  3827    16       7          -          4        8
Qwen3-1.7B-Q4_K_M             4116     6      16          -          -        7
gemma-3-4b-it-Q4_K_M          1532     -       -          -          -        -
```

⛔⛔ **`gemma-3-4b-it` non ha gli strumenti NEL TEMPLATE.** Non «non li chiama»:
non gli vengono **offerti**. Il suo template è di 1.532 byte contro i ~4.000
degli altri due — meno della metà, e senza una sola occorrenza di `tools`.

⇒ Su Gemma, «la ricerca web non funziona» **non è un difetto di TALOS**: è il
limite intrinseco che l'owner ha esplicitamente escluso dal rilievo. ⭐ Ma
diventa un difetto **nostro** nel momento in cui l'interfaccia dice «la ricerca
web è attiva, riprova» invece di dire *«questo modello non può usare
strumenti»*. La capacità manca al modello; la **dichiarazione onesta** manca a noi.

### E una distinzione che il template da solo non dà

`python_tag` non compare in **nessuno** dei tre template — nemmeno in quello di
Llama, che pure gli strumenti li ha (16 `tools`, 8 `function`, 4 `ipython`).

⇒ **Il template dice cosa al modello viene DETTO; non dice cosa il modello
PRODUCE.** `<|python_tag|>` è un token che Llama emette al momento della
generazione, e non si legge da nessuna parte nei metadati. ⛔ Quindi una
campagna che si fermasse a leggere i template concluderebbe «Llama ha gli
strumenti, tutto a posto» — e sbaglierebbe esattamente sul caso che l'owner ha
fotografato.

⇒ Le due domande sono separate e vanno misurate separatamente:

```
il template OFFRE gli strumenti?     si legge dal GGUF, a costo zero  ✅ fatto
in quale dialetto li EMETTE?         si legge solo facendolo parlare  ⛔ da fare
```

---

## Cosa misurare, e in che forma

La campagna che l'owner chiede — **ogni strumento × ogni modello**, con verifica
visiva — con le due righe che il banco ha già imparato a pretendere:

1. ⛔ **Il controllo negativo.** Un modello (o un caso) che **deve** fallire, per
   provare che la prova misura qualcosa. Senza, «tutti gli strumenti passano»
   non si distingue da «la prova non guarda».
2. ⛔ **Chi non c'è.** Ogni coppia strumento × modello non provata si dichiara
   **col motivo**: un'assenza taciuta si legge come un successo.

E le tre domande che la campagna deve saper rispondere per ogni coppia:

```
il modello ha EMESSO una chiamata?      (e in quale dialetto)
TALOS l'ha RICONOSCIUTA?                (o è finita nel testo visibile)
lo strumento ha PRODOTTO l'effetto?     (verificato, non dedotto dal testo)
```

⭐ La terza è quella che separa questo censimento da una prova superficiale: la
memoria dice già che «gli attrezzi ce l'hanno: non li CHIAMANO — e quando non
chiamano, INVENTANO». Un modello che risponde bene **senza** aver chiamato
niente è un fallimento travestito da successo.

---

## ⛔ Cosa questa diagnosi NON dice

- **Non dice** che aggiungere il riconoscitore di `<|python_tag|>` risolva il
  rilievo 1: risolve **un** sintomo su un **modello**. Gli altri dialetti non
  sono stati censiti.
- **Non dice** perché `TALOS_LLAMA_NO_CHAT_TEMPLATE` sia riapparso dopo la cura
  del 21/8. Ha una causa nota e curata, e un'osservazione successiva: sono due
  fatti, non una spiegazione.
- **Non ha girato sul dispositivo.** Tutto ciò che c'è qui viene dalla lettura
  del codice e dagli screenshot dell'owner. ⇒ `⛔ NON VERIFICATO: nessuna delle
  tre affermazioni è stata riprodotta sul Pad in questa sessione.` La prima —
  `<|python_tag|>` non riconosciuto — è provata **per assenza** nel sorgente, ed
  è la più solida delle tre.
