# BC-29 — i recinti e le citazioni del Markdown, 12/09/2026

> Owner: «le note, se sono markdown, devono essere renderizzate in markdown».
> Foto del 12/09 sul 4174, dettaglio di una nota in **Anteprima**: titoli, grassetto ed elenchi
> numerati resi; il recinto ```` ``` ```` come righe di testo normale; la citazione `>` letterale,
> col maggiore a schermo.

---

## 1. Cosa c'era — e perché i due difetti NON avevano la stessa causa

La prima cosa verificata è stata la catena del render, perché la premessa («alle note manca il
Markdown») era sbagliata:

```
sezioni-adattatori.js:534  montaNote(...)                        ← non toccato
  └─ modulo-voce.js:499    montaTestoVoce → prosaInNodi(...)     ← non toccato
       └─ ricerca-dettaglio.js:489  prosaInNodi(doc, prosa, rendiMarkdown)
            └─ rendiMarkdown  ===  legacy/app.js:1659  renderizzaMarkdownSemplice
```

`legacy/app.js:1659` (Note, dal 12/09), `:5083` e `:5295` (Libreria e Ricerca, dal 10-11/09)
iniettano **lo stesso** `renderizzaMarkdownSemplice` che usa la chat. Quindi il render c'era.

**Difetto 1 — il recinto (CSS, non renderer).** `renderizzaMarkdownSemplice`
(`src/legacy/app.js:2286`, prima della cura) *già* riconosceva il fence e lo passava a
`costruisciBloccoCodice` → `creaBloccoCodice` (`src/components/conversazione.js:396`), che produce
`div.code-block > (.code-block-head + pre > code)`. Il markup arrivava **giusto**. Era il **foglio**
a non vestirlo: in `src/styles/index.css` **44 regole** del blocco portavano in testa
`:is(.assistant-copy, .talos-message__body--comando)` — cioè *solo dentro la bolla della chat*.
Nel dettaglio di una nota (`.td-prosa-rapporto`) il blocco era nudo: nessun fondo, nessun bordo,
nessun monospazio ⇒ «righe di testo normale». Stessa sorte per le **tabelle GFM**
(`.assistant-copy .md-table*`, index.css:905-911): nel dettaglio si vedevano «rese» solo perché un
`<table>` nudo lo impagina il browser — bordi, allineamento e cifre tabulari non arrivavano.

**Difetto 2 — la citazione (renderer).** `renderizzaMarkdownSemplice` non ha **mai** avuto un ramo
per `>`: la riga cadeva in `paragrafoCorrente` e il maggiore finiva a schermo. Non è un difetto
delle note — **succedeva anche in chat**, e nessuno l'aveva visto perché il modello cita di rado.

---

## 2. Fonti (lette il 12/09/2026)

⛔ `WebSearch` esaurito per questa sessione (200/200 chiamate): la ricerca è stata fatta con
`WebFetch`, come previsto dal brief. Dichiarato qui perché una ricerca fatta con un attrezzo diverso
non è una ricerca non fatta, ma va detta.

| Fonte | Cosa ha cambiato nella cura |
|---|---|
| `github.github.com/gfm` — sezione «Block quotes» | Il marcatore è **0-3 spazi + `>`**, con o senza lo spazio dopo (non `"> "` obbligatorio). Vale la **laziness**: le righe di continuazione di un *paragrafo* possono non riportare il `>`. «A document cannot contain two block quotes in a row unless there is a blank line between them» ⇒ la riga vuota chiude. I `>` si **impilano** per annidare. |
| `developer.mozilla.org` — `<blockquote>` | Contenuto di flusso, ruolo ARIA implicito `blockquote`, rientro di serie dell'UA governato dai margini. L'attribuzione sta **fuori** dall'elemento (qui non ce n'è: il testo è quello del modello o del file). |

Le due cose che dal codice non si vedevano: **la laziness** (senza, una citazione si sarebbe chiusa
alla prima riga senza marcatore, spezzando in due un paragrafo citato) e **il marcatore senza spazio**
(`>` da solo è una riga vuota *dentro* la citazione, non la sua fine).

---

## 3. La cura

### 3.1 Il renderer esce dal monolite — `src/components/markdown.js` (NUOVO)

Le 153 righe di `renderizzaMarkdownSemplice` vivevano dentro l'IIFE di `src/legacy/app.js`: non
esportate, quindi **non collaudabili** da `tests/unit/` se non leggendone il sorgente come testo. È
la stessa migrazione fatta il 09/09 per `creaBloccoCodice`. Ora:

- `renderizzaMarkdown(testoGrezzo, { document, bloccoCodice })` — il motore, **uno solo**;
- `bloccoCodiceNudo(doc, testo, lingua)` — il recinto di serie (`<pre><code>`) per chi monta il
  renderer senza la chat: il modulo **non importa** `conversazione.js`, così non sa niente della
  conversazione e si può montare da solo.

`src/legacy/app.js:2295` tiene il nome e delega:

```js
function renderizzaMarkdownSemplice(testoGrezzo) {
  return renderizzaMarkdown(testoGrezzo, { document, bloccoCodice: costruisciBloccoCodice });
}
```

⇒ **nessuna chiamata cambiata** (1659, 2338, 2356, 2363, 3428, 5083, 5295), e il montaggio del
blocco di TALOS resta in `legacy/app.js` perché mostra anche la conferma in pagina, che il
componente da solo non conosce.

### 3.2 La citazione — `src/components/markdown.js`

Un ramo nuovo, prima di `hrMatch`:

- apre su `/^ {0,3}>/`;
- raccoglie le righe col marcatore (`replace(/^ {0,3}> ?/, '')` — **uno** spazio, gli altri sono
  indentazione del contenuto) più le **continuazioni pigre**, che però valgono solo per un
  paragrafo: recinto, separatore, elenco e titolo **chiudono** invece di entrare;
- la riga vuota chiude sempre;
- il contenuto si rende **con la stessa funzione**, tolto un livello di marcatore ⇒ dentro una
  citazione valgono titoli, elenchi e recinti, e l'annidamento viene gratis (la ricorsione termina
  perché ogni giro toglie un marcatore). Nessuna seconda grammatica.

⛔ Nessun motore Markdown aggiunto: il bundle dichiara «zero npm install».
⛔ Niente HTML grezzo: `createElement` / `createTextNode` come prima.

### 3.3 Il foglio — `src/styles/index.css`

1. **Tolto** il prefisso `:is(.assistant-copy, .talos-message__body--comando)` da tutte e **44** le
   regole di `.code-block`. `.code-block` lo produce **una funzione sola**: ambire all'antenato non
   proteggeva niente e nasconde il blocco in tre superfici su quattro.
2. `.code-block pre code` → **`.code-block pre > code`**. Tolto l'antenato quella regola pesava
   `(0,1,1)`, **identico** a `.talos-message code{background;padding;border-radius}` (index.css:682):
   un pareggio deciso dall'ordine dei file, cioè le strisce del 09/09 a un `@import` di distanza. Il
   figlio diretto porta a `(0,1,2)` e vince **per peso**.
3. Stesso trattamento per `.md-table*` (erano `.assistant-copy .md-table*`).
4. **`.md-quote`** — nuovo, e **non è un linguaggio visivo nuovo**: sono gli stessi valori di
   `.td-passaggio` (`mockup-td.css:345`, il passaggio citato del dettaglio Ricerca) — filetto 2px
   `--talos-accent-border`, nessun fondo, nessuna virgoletta disegnata. Due aspetti diversi per la
   stessa cosa a seconda di chi l'ha resa sarebbe stato il difetto peggiore dei due. Il secondo
   livello cambia **tono** del filetto (`--talos-border-strong` + testo muto), non rientro: nel
   dettaglio di una nota la colonna è stretta e ogni rientro toglie misura al testo.
   Zero colori scritti a mano: chiaro e scuro vengono dai token (provato dal test).
5. `.td-prosa-rapporto :not(pre) > code` — il chip del **codice inline**, che nel dettaglio non lo
   dava nessuno (in chat lo dà `.talos-message code`): `` `npm run build` `` usciva come prosa.

### 3.4 Il laboratorio smetteva di mostrare il prodotto — `lab/main.js`, `lab/fixtures/note.js`

`montaCrud` passava `rendiMarkdown: null` e `montaLibreriaFile` non lo passava affatto: il
laboratorio mostrava il **ripiego strutturale** di `prosaInNodi`, non ciò che la app disegna. Una
foto di quella pagina avrebbe provato il ripiego. Ora entrambe iniettano `renderizzaMarkdown` col
blocco della chat — **possibile solo perché il renderer è un componente**. Aggiunti:

- `lab/fixtures/note.js` — la nota Markdown ha ora anche una citazione, e una annidata;
- `lab/main.js` — caso `Conversazione_markdown`: **lo stesso testo** dentro
  `.talos-message > .talos-message__copy > .assistant-copy`, la struttura che `legacy/app.js:9955`
  costruisce a ogni risposta. Serve a mettere le due superfici una accanto all'altra.

⛔ Non toccati: `sezioni-adattatori.js`, `modulo-voce.js`, `tests/parity/*`.

---

## 4. Le prove

`tests/unit/markdown-recinti-e-citazioni.test.mjs` (nuovo, **17 test**). DOM finto che **registra
ogni assegnazione a `innerHTML`**, così la prova sull'escape dimostra il meccanismo e non
l'apparenza.

| Test | Cosa morde |
|---|---|
| `BC29-RECINTO-LINGUA` | ` ```python ` → il blocco riceve testo, lingua e `chiuso:true`, e sta **fra** i due paragrafi |
| `BC29-RECINTO-SENZA-LINGUA` | nessuna lingua dichiarata ⇒ nessuna inventata; indentazione intatta |
| `BC29-RECINTO-DI-SERIE` | senza blocco iniettato esce `<pre><code class="language-js">`, non testo |
| `BC29-RECINTO-APERTO` | fence senza chiusura ⇒ `chiuso:false` (streaming) |
| `BC29-CITAZIONE` | `<blockquote class="md-quote">`, e il `>` **non** arriva a schermo |
| `BC29-CITAZIONE-MULTILINEA` | due righe = un paragrafo solo; la riga vuota chiude |
| `BC29-CITAZIONE-PIGRA` | la continuazione senza `>` resta dentro; **verso contrario**: titolo ed elenco NON vengono risucchiati |
| `BC29-CITAZIONE-ANNIDATA` | `>>` fa due livelli, non due citazioni affiancate |
| `BC29-CITAZIONE-CON-RECINTO` | dentro la citazione il recinto passa dallo stesso blocco della chat |
| `BC29-NIENTE-CITAZIONE` | **verso contrario**: `a > b`, `if (x > 1)`, `     >` restano paragrafi, col maggiore intatto |
| `BC29-NESSUNA-REGRESSIONE` | titoli, grassetto, corsivo, codice inline, elenco, `---`, tabella con allineamento: come prima |
| `BC29-MESSAGGIO-DI-CHAT` | fixture di una risposta vera (prosa + recinto + elenco): forma `p, div, ul` **identica** a prima, e zero citazioni dove non ce n'erano |
| `BC29-ESCAPE` | **verso contrario**: `<img onerror>` + `<script>` in 5 contesti (nudo, citato, titolo, elenco, tabella) ⇒ `innerHTML` usato **zero volte**, nessun `img`/`script` nel DOM, il testo resta leggibile |
| `BC29-CSS-AMBITO` | nessuna regola di `.code-block` nomina più `.assistant-copy`; fondo, bordo e monospazio ci sono |
| `BC29-CSS-STRISCE` | esiste `.code-block pre > code{display:block;background:none;padding:0}` |
| `BC29-CSS-CITAZIONE` | `.md-quote` vestita, **stesso filetto** di `.td-passaggio`, secondo livello distinto, **zero colori a mano** |
| `BC29-CSS-TABELLA` | `.md-table` non è più chiusa nella chat |

**`npm run test:unit`: 860 / 860 verdi** (erano 843 + 17 nuovi).
**`npm run test:componenti`: 147 / 147 verdi** — parità col mockup a 1440/1280/1024 + nessun errore a runtime.
**`npm run build`**: 32 asset. **`npm run build:lab`**: 32 asset.

---

## 5. Le foto — `.claude/foto-markdown-bc29-2026-09-12/`

Laboratorio su **porta 4181** (⛔ mai il 4174), Chrome, 1440×900, tema **scuro e chiaro** per ognuna.
Ogni pagina registra anche gli errori JavaScript a runtime: **zero** su tutte e otto.

| File | Cosa prova |
|---|---|
| `nota-anteprima-dark.png` / `-light.png` | La nota in Anteprima: recinto = blocco vero con barra «Bash · Copia», monospazio, fondo e bordo; citazione col filetto ambra; annidata col filetto muto; **il `>` non c'è più** |
| `chat-markdown-dark.png` / `-light.png` | **Lo stesso testo** dentro `.assistant-copy`: il blocco della chat è invariato, e la citazione compare anche lì (prima mancava pure in chat) |
| `libreria-md-dark.png` / `-light.png` | Il dettaglio di un file `.md` della Libreria: stesso blocco, stessa citazione |
| `nota-testo-dark.png` / `-light.png` | **Verso contrario a schermo**: il modo «Testo» mostra ancora il sorgente con ` ``` ` e `>` — l'interruttore continua a fare il suo mestiere |

Misure prese sulla pagina (non a occhio), scuro → chiaro:

| | scuro | chiaro |
|---|---|---|
| `.code-block` background | `rgb(23,24,27)` | `rgb(222,217,207)` |
| bordo | `1px` | `1px` |
| `pre > code` font | JetBrains Mono | JetBrains Mono |
| `pre > code` display | `block` | `block` |
| **rettangoli del `<code>`** | **1** | **1** (⇒ nessuna striscia) |
| barra | `Bash` · `Copia` | `Bash` · `Copia` |
| `.md-quote` bordo sinistro | `2px rgba(192,139,60,.34)` | `2px rgb(184,138,73)` |
| annidata | `rgb(74,75,80)` | `rgb(148,144,135)` |
| `>` visibile nel testo | **no** | **no** |

⭐ **Un difetto trovato dalla PRIMA serie di foto e corretto nella stessa tornata**: con una
citazione annidata in fondo, il filetto della citazione esterna proseguiva ~40 px sotto l'ultima
riga (margine dell'interna + padding dell'esterna). `.md-quote > p:last-child` non lo prendeva:
diventato `.md-quote > :last-child`. Le foto in cartella sono quelle **dopo** la correzione.

---

## 6. Cosa NON ho verificato — e un filo trovato per strada

1. **⛔ Niente 4174, nessun giro col modello.** Tutte le foto vengono dal laboratorio con le fixture.
   La catena è la stessa del prodotto (stesso renderer, stesso `creaBloccoCodice`, stesso foglio,
   stessa struttura `.assistant-copy`), ma **una foto della app viva dell'owner con una nota vera
   non c'è**. Va fatta da chi può toccare il 4174.
2. ✅ **`npm run test:componenti` — 147/147 verdi** (3,3 min, tre viewport desktop 1440/1280/1024,
   porte 4211/4212, ⛔ mai il 4174). Copre la parità col mockup di 39 componenti — fra cui
   `Conversazione` — e `RUNTIME-01` (aprire la app non produce **nessun** errore JavaScript). È il
   gate che vede l'effetto delle 44 regole disambientate sulle schermate che non ho fotografato.
   Resta comunque vero il punto 3: il gate gira a tre viewport, ma le mie **foto** sono a 1440×900.
3. **Viewport delle FOTO**: misurato e guardato a **1440×900**. A 1024×800 (dove le colonne si
   stringono per prime) il gate di parità è verde, ma **una foto della nota e della chat a quella
   larghezza non l'ho guardata**: il blocco ha `overflow-x:auto` e la citazione non ha larghezze
   fisse, ma è una previsione, non una misura.
4. **Le altre superfici che ora ereditano il vestito**: `.code-block` compare anche nella bolla
   `--comando` (`legacy/app.js:9649`) e nel `readme` di un modello (`:3428`). La prima era già dentro
   l'ambito vecchio (nessun cambiamento possibile); la seconda **no**, quindi da oggi il suo recinto
   è vestito — corretto, ma non l'ho fotografato.
5. 🔜 **Filo trovato, NON chiuso — le righe di un paragrafo diventano `<br>`.** Si vede nella foto
   `libreria-md-*.png`: la prima frase va a capo tre volte, perché il file sul disco è a capo a
   ~100 colonne e `renderizzaMarkdown` mette un `<br>` fra le righe di uno stesso paragrafo. In chat
   è la scelta giusta (un a capo del modello vuol dire qualcosa); su un **file** no — e
   `ricerca-dettaglio.js:496` lo dice già a chiare lettere per il suo ripiego («le righe di un
   paragrafo si ricompongono con uno SPAZIO… tenere quegli a capo dava righe spezzate a metà frase»).
   ⛔ **È precedente a BC-29**: Libreria e Ricerca iniettano il render della chat dal 10-11/09.
   Curarlo vuol dire cambiare il *soft break* per una superficie e non per l'altra: è una decisione,
   non un fix, e la lascio all'owner.
6. **Il maggiore dentro il codice inline.** `` `a > b` `` in mezzo a una riga: il ramo della citazione
   guarda solo l'inizio riga, quindi non scatta (provato); ma una riga che *inizia* con un `>` dentro
   un backtick multi-riga non esiste in questa grammatica — non è un caso reale, non l'ho provato.

---

## 7. I file toccati — e quelli che NON ho toccato ma risultano modificati

**Miei, e solo questi:**

- `harness-ui/frontend/src/components/markdown.js` — **nuovo**, il renderer
- `harness-ui/frontend/src/legacy/app.js` — l'import e le 153 righe che diventano una delega
- `harness-ui/frontend/src/styles/index.css` — 44 regole disambientate, `.md-quote`, `.md-table*`, il chip inline
- `harness-ui/frontend/lab/main.js`, `harness-ui/frontend/lab/fixtures/note.js` — il laboratorio smette di mostrare il ripiego
- `harness-ui/frontend/tests/unit/markdown-recinti-e-citazioni.test.mjs` — **nuovo**, 17 prove
- `.claude/RAPPORTO-MARKDOWN-RECINTI-2026-09-12.md`, `.claude/foto-markdown-bc29-2026-09-12/`

⛔ **NON miei.** A fine lavoro `git status` mostra modificati anche
`harness-ui/frontend/index.template.html`, `harness-ui/frontend/mockup/talos-mockup.html` e
`.claude/RAPPORTO-CRUD-FRONTEND-2026-09-12.md`: non erano nella fotografia iniziale del repo e **non
li ho aperti né scritti**. Sono di un'altra sessione viva sulla stessa cartella. Scritto qui perché
un commit su questo lavoro non se li porti dietro per distrazione (`git add -A` raccoglie lavoro non
mio, lezione del 20/8): si aggiungono i file per nome.

⛔ Niente `git`: nessun commit, nessun push — non è compito mio in questo giro.
