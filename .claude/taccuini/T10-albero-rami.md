# T10-albero-rami — L'albero dei rami: forcare da un messaggio, i numeri per nodo, e tornare indietro

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:13

## Passi

- **apro una sessione con piu giri** ✅
  - atteso: una sessione vera, gia lunga
  - visto: 667b9d42 · Fai due cose, in ordine: (1) esegui nel 
- **la via dell'albero dalla colonna** ✅
  - atteso: G17-G19: l'albero è raggiungibile ANCHE dalla colonna
  - visto: Apri l'albero dei rami
- **l'albero si apre come foglio** ❌
  - atteso: un foglio con i nodi della sessione (G17)
  - visto: {}

> ⛔ **T10-albero-rami-D1** (grave): l'albero dei rami non si apre
- **le azioni sulla bolla della domanda** ❌
  - atteso: B25: si può MODIFICARE un messaggio, e la modifica crea un ramo
  - visto: bolla="TuCompito libero · progetto-5 · Accesso completoFai due cose" · azioni=[]

> ⛔ **T10-albero-rami-D2** (grave): passando sopra il proprio messaggio non compare nessuna azione: non si può né copiarlo né modificarlo (B24, B25)
- **il comando «modifica»** ❌
  - atteso: esiste, e dice che creerà un ramo
  - visto: null

> ⛔ **T10-albero-rami-D3** (grave): non esiste nessun modo di MODIFICARE un proprio messaggio: la decisione B25 («modificare un messaggio crea un ramo») non è raggiungibile dall'interfaccia — prova: []
- **la via dell'albero dalla testata** ✅
  - atteso: l'icona del ramo in alto apre lo stesso foglio
  - visto: {"testo":"","etichetta":"Albero dei rami"}
- **i rami nei dati** ✅
  - atteso: una sessione forcata porta `forkDa`
  - visto: 0 sessioni con forkDa

> ⛔ **T10-albero-rami-D4** (minore): errori in console: Failed to load resource: the server responded with a status of 400 (Bad Request)

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 4 (T10-albero-rami-D1, T10-albero-rami-D2, T10-albero-rami-D3, T10-albero-rami-D4).

## ⚠️ Rettifica: T10-albero-rami-D1 è un difetto della MIA sonda

L'albero **si apre**: `foto/T10-albero-rami/01-albero.png` mostra il foglio «ALBERO DELLA SESSIONE ·
I rami di questa sessione». Cercavo un `dialog[open]`, ma quel foglio è un velo del mockup, non un
`<dialog>`. **D1 è ritirato.** Restano validi D2 e D3, che la seconda sonda (`T10b-bolla.mjs`) ha
confermato con un hover vero del mouse.

## La prova rifatta con l'hover vero del mouse

`T10b-bolla.mjs`: mouse fermo per 1,2 s al centro della bolla della domanda (727×145 px), poi tasto
destro. Risultato, verbatim:

```
DOPO HOVER      {"bottoni":[], "vicini":[{"t":"","a":"Vai al giro"}]}
MENU TASTO DESTRO   null
AZIONI SIMILI IN CHAT   ["Copia|", "|Copia la risposta"]
```

L'`outerHTML` della bolla è tre nodi in croce (`__head`, `__who`, `__meta`, `__body`): **nessun
pulsante esiste**, né nascosto né da rivelare. Le uniche azioni della chat sono «Copia» e «Copia la
risposta», e stanno **sulla risposta**, non sulla domanda.

> ⇒ **B25** («modificare un messaggio dell'utente crea un ramo») **non è raggiungibile**: e lo dice
> anche il foglio dei rami, che si spiega da solo con «Quando modificherai un tuo messaggio, la
> sessione si dividerà qui» — descrivendo un gesto che l'interfaccia non offre. Nei dati, **0 sessioni
> con `forkDa`** su 10.
> ⇒ **B24** è a un terzo: si copia la risposta, non il **giro intero**, e la sessione **non si esporta**
> da nessun menu che abbia trovato.

## Due alberi diversi per la stessa cosa — e uno è in inglese

Aprendo la **freccia accanto al titolo** si apre un **secondo** foglio, diverso da quello della
colonna di destra: `foto/T10-albero-rami/06-menu-sessione.png`.

> ⛔ **T10-albero-rami-D5** (grave): esistono **due fogli distinti** per l'albero della sessione, con
> due nomi e due contenuti diversi. Quello della colonna («I rami di questa sessione») dice **«Nessun
> ramo ancora»**; quello del titolo («Albero sessione») elenca **tre deleghe** con lo stato. La stessa
> domanda, due risposte, a un centimetro di distanza — prova: `01-albero.png` contro `06-menu-sessione.png`

> ⛔ **T10-albero-rami-D6** (grave): il secondo foglio ha l'occhiello **«CONVERSATION GRAPH»** e marca
> il nodo padre **«Main»**: due parole inglesi in una interfaccia italiana, ed è proprio l'etichetta di
> sezione che H23 e H22 governano — prova: `06-menu-sessione.png`

> ⛔ **T10-albero-rami-D7** (medio): in quel foglio i numeri sono scritti **all'inglese** —
> `76.8k token`, `cache 53.3k` — mentre dieci pixel più in là la barra di stato scrive `76,8k token`.
> E la parola **«cache»** vale **53,3k** qui e **72%** nella barra di stato: stessa parola, due unità
> diverse (H24: ogni numero ha la sua unità) — prova: `06-menu-sessione.png` e `foto/T09-colonna-destra/13-processi.png`

> ⛔ **T10-albero-rami-D8** (medio): le righe delle deleghe mostrano il percorso grezzo
> **`/mnt/c/Users/Antonino/Desktop/…`** (percorso WSL) troncato a metà, e dopo `cache 53.3k` c'è un
> **pallino orfano** appiccicato al numero — prova: `06-menu-sessione.png`

> ⛔ **T10-albero-rami-D9** (grave): questo foglio dichiara le tre deleghe come **«Delega · fallito»**
> — quindi la app **sa** che ci sono ed è persino al corrente che sono fallite — mentre la scheda
> **Agenti** della colonna, nella stessa sessione, scrive «Nessun sotto-agente». Non è un dato
> mancante: è un dato che c'è e che una delle due superfici nega (rinforza T09-colonna-destra-D1)

> ⛔ **T10-albero-rami-D10** (minore): col tasto destro sulla riga di una sessione nella barra laterale
> **non compare nessun menu** (`MENU RIGA SESSIONE → null`): la decisione A5 vuole che da lì si possa
> **fissare** una sessione — prova: `07-menu-riga.png`

> ⛔ **T10-albero-rami-D11** (minore): nel foglio «I rami di questa sessione» c'è un **filo chiaro
> verticale** lungo tutto il bordo destro del riquadro, fuori dall'angolo arrotondato (barra di
> scorrimento che esce dalla cornice) — prova: `01-albero.png`, bordo destro fra y≈310 e y≈595

### Cosa invece funziona

- L'albero è raggiungibile **da due vie** come vuole G17-G19: il pulsante «Apri l'albero dei rami» in
  fondo alla colonna **e** l'icona del ramo nella testata (`aria-label="Albero dei rami"`).
- Lo stato vuoto del primo foglio è **onesto e ben scritto**: spiega cosa accadrà e perché conviene.
- Il secondo foglio porta davvero **token, giri e cache per nodo** (G19), che era la richiesta.

## Verdetto (rivisto dopo l'ispezione delle foto)

**FALLISCE** — 10 difetti (D1 ritirato). Il gesto centrale della prova — **forcare da un messaggio** —
non esiste nell'interfaccia, e i due fogli che dovrebbero mostrarne il risultato si contraddicono a
vicenda, uno dei due in inglese.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
