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

⛔ E il difetto non è «manca una regex»: è che i formati riconosciuti sono **due,
scelti a mano**, mentre i modelli locali ne parlano almeno **tre** (riga nuda,
blocco `TOOL_CODE`, e il tag di Llama). Aggiungerne una terza a mano lascerebbe
il quarto modello fuori nello stesso modo. ⇒ Il censimento che l'owner chiede —
**per strumento × per modello** — è la forma giusta proprio perché nessuno sa
quanti dialetti ci sono finché non li si guarda tutti.

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
