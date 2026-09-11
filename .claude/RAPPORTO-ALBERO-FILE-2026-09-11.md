# Albero dei file dell'inspector — i due difetti dell'11/09/2026

Lane `lane/harness-desktop`. Owner, 11/09 sera, sulla foto dell'albero nella scheda «File»:

1. «Se faccio tasto destro sulla ROOT deve poter spuntare "Apri", cioè devo poterla aprire su Windows.»
2. «Nel file tree posso espandere ma non comprimere le cartelle.»

Tutto quello che segue è **misurato**, su un banco mio (server vero, porta **5347**, store di sessioni
vuoto in `%TEMP%`, `frontend/dist` servito). ⛔ Il 4174 non è stato toccato: nessuna richiesta, né in
lettura né in scrittura.

---

## 1. Riproduzione — prima della cura, numeri e non impressioni

Sonda Playwright sul banco: sessione finta (`realSessionState.id`), risposte di `GET …/tree` finte,
albero VERO disegnato dal codice di produzione. Tre giri di apri/chiudi sulla cartella `src`.

| passo | `aria-expanded` | figli **visibili** a schermo |
|---|---|---|
| iniziale | `false` | 0 |
| apri #1 | `true` | 3 |
| **chiudi #1** | **`false`** | **3** |
| **chiudi #2** | **`false`** | **3** |
| **chiudi #3** | **`false`** | **3** |

⇒ Il difetto dell'owner, esatto: lo **stato** diceva «chiusa», lo **schermo** mostrava tre figli.
Stessa cosa da tastiera: freccia sinistra e Invio portavano `aria-expanded` a `false` e lasciavano i
figli a schermo.

Menu del tasto destro sulla **radice**, prima della cura: `['Nuovo file', 'Nuova cartella']`.
Nessuna voce «Apri», e nessun bottone «···» sulla riga della radice.

> La riproduzione è stata rifatta **disfacendo la cura sul disco** (tre righe) e ricostruendo il
> bundle, non ricordando com'era: `scratchpad/esito-prima.json`.

---

## 2. Causa

### 2a. «Non si comprime» — non era la logica, era che **nessuno traduceva lo stato in pixel**

`apriCartellaAlbero` / `chiudiCartellaAlbero` (`harness-ui/frontend/src/legacy/app.js:13154` e
`:13179`) dicevano già la cosa giusta chiudendo: `ft-open` via, `aria-expanded="false"`, percorso
tolto da `treeOpen`. Mancava chi nascondeva la `<ul>` dei figli.

Le due regole che lo facevano —

```css
.ft-node > ul       { display: none; }
.ft-node.ft-open > ul { display: block; }
```

— **non sono arrivate nel foglio spedito oggi**. Verificato: zero occorrenze di `.ft-node` in tutto
`harness-ui/frontend/src/styles/` e in `harness-ui/public/styles.css`; l'unica copia superstite è in
`harness-ui/dist/styles.css:825-826`, un build vecchio che non serve più nessuno. È la stessa perdita
silenziosa del cutover di cui parla la lezione «un confronto CSS per stringa sovrastima le mancanze»,
qui però nel verso opposto: qualcosa è **davvero** caduto.

Nello stesso buco è caduta `.ft-node.ft-open > .ft-row > .ft-chevron { transform: rotate(90deg) }`:
la freccetta non diceva se la cartella fosse aperta o chiusa. ⛔ La regola del mockup che sembrava
sostituirla — `.talos-file-tree [aria-expanded=false] > .talos-file-row > .talos-file-chevron` — **non
può scattare**: `.talos-file-chevron` sta sull'`<svg>`, mentre il figlio diretto della riga è lo
`<span class="ft-chevron">` che lo contiene. Misurato: `transform: none` in ogni stato.

### 2b. «Apri sulla radice» — la difesa vietava la radice a **tutte** le azioni

`risolviPercorsoEsistente` (`harness-ui/src/workspace-files.mjs:52`) respingeva la stringa vuota **e**
il percorso che coincide con la radice, per ogni azione indistintamente. Corretto per rinomina,
elimina, copia; ma «apri la cartella del workspace» è proprio il caso che l'owner chiede.

---

## 3. Cura

### Frontend — `harness-ui/frontend/src/legacy/app.js`

| dove | cosa |
|---|---|
| `:13331` | la `<ul>` dei figli **nasce** `hidden`, come dice il suo `aria-expanded="false"` |
| `:13159` | `apriCartellaAlbero` la scopre |
| `:13186` | `chiudiCartellaAlbero` la **ritrova da sola** (`:scope > ul`) e la rinasconde |
| `:13844` | freccia destra su un nodo foglia: non fa più niente; su cartella aperta il fuoco va al **primo figlio** chiesto al sottoalbero |
| `:13705` | `apriInEsploraFile()` — `POST …/tree/open`, corpo `{percorso}` come tutte le `/tree/*` |
| `:13443` | menu della **radice**: `Apri in Esplora File` in testa, poi `Nuovo file`, `Nuova cartella` |
| `:13455 ca.` | menu delle **cartelle**: `Apri in Esplora File` accanto a `Rivela in Esplora File` |
| `:13781` | la radice ha ora anche il suo «···» (stesso bottone e stesso menu delle righe) |
| `:13518` | Esc del menu in fase di **CATTURA** + `stopPropagation` |

⇒ Lo stato aperto/chiuso **non** è tornato a vivere in una terza copia di regole CSS che un prossimo
cutover può perdere di nuovo in silenzio: lo porta l'attributo `hidden` sulla `<ul>`, cioè il DOM. È
anche la forma del mockup approvato (`public/index.html`, `<div role="group" hidden>`), ed è quella
che regge **senza** il nostro CSS: `[hidden]{display:none}` sta nel foglio dello user agent.
⭐ Effetto secondario voluto: `righeVisibiliAlbero` filtra per `offsetParent !== null`, quindi ora le
frecce su/giù **saltano** i sottoalberi chiusi invece di attraversarli.

### Frontend — `harness-ui/frontend/src/styles/foglio-monolite.css`

- `:169` il «···» della radice si scopre su `:hover` **e** `:focus-within` (`.tree-root` non è una
  `.ft-row`: la regola esistente non la nominava, e il bottone stava a `display:none` per sempre —
  misurato);
- `:182-183` la freccetta ruota di 90° quando la cartella è aperta, con la durata delle disclosure
  del sistema (nessun numero nuovo).

### Una riga fuori dall'albero, chiesta dal coordinatore mentre avevo `app.js` in mano

`caricaPannelloLibreria` → chiamata a `aggiornaPaginaLibreria` (`app.js:5157`, subito dopo
`onMenu: apriMenuAzioniLibreria`): aggiunto `rendiMarkdown: renderizzaMarkdownSemplice,` — «11/09 —
il contenuto del file nel dettaglio: la stessa iniezione che la Ricerca ha già (`:5343`). Senza, il
pannello cade sulla lettura strutturale minima e gli elenchi e i blocchi di codice di un `.md` si
leggono come paragrafi.» **Nessun altro cambio**, e `npm run test:unit` resta a 798/798 dopo
l'aggiunta. ⛔ **Non verificata a schermo da me**: non fa parte dei due difetti dell'albero e non
l'ho fotografata.

### Backend

- `harness-ui/src/workspace-files.mjs:52` — `risolviPercorsoEsistente(…, ammettiRadice = false)`: la
  deroga è una **scelta di chi chiama**, il default non cambia, quindi nessuna chiamata già scritta
  cambia comportamento. Restano intatti `realpath` prima del confronto, il divieto di percorsi
  assoluti e di `\0`.
- `:496` — `lanciaExplorer()`: l'**unica porta** verso `explorer.exe`, estratta dalle tre azioni che
  avevano lo stesso preambolo copiato. Il difetto del 10/09 (richiamo finito nel posto delle opzioni,
  promessa mai risolta, richiesta HTTP appesa) viveva in due copie e andava curato in due posti.
- `:543` — `apriInEsploraFile()`, che accetta radice, cartelle e file.
- `harness-ui/src/session-registry.mjs:4711` — `apriInEsploraFile(sessionId, percorso)`, gemella di
  `rivelaFile`: stessa forma di ritorno, validazione del percorso mai duplicata qui.
- `harness-ui/src/http-app.mjs:3458` + la riga di schema accanto a `/tree/reveal` —
  `POST /api/v1/sessions/:id/tree/open`.

> ⛔ **Perché una rotta nuova e non un flag su `/tree/reveal`.** Su Windows sono due operazioni
> diverse: `explorer.exe <p>` apre la cartella, `explorer.exe /select,<p>` apre il **genitore** con
> l'elemento evidenziato. Sulla radice la seconda aprirebbe il genitore del workspace, cioè un posto
> **fuori** dal workspace. Due cose diverse, due voci diverse nel menu, due rotte.
>
> ⛔ **Perché non ho allargato `apriFileConProgrammaPredefinito`**: la Libreria la usa per i file e il
> suo rifiuto su una cartella è un contratto già provato. Un rifiuto che diventa un sì non è un
> allargamento, è un'altra funzione.

### Ricerca, prima di scrivere (11/09/2026)

⛔ **WebSearch esaurito per questa sessione** (200/200): fonti primarie via WebFetch, come previsto.

- **W3C — ARIA Authoring Practices Guide, pattern «Tree View»**
  (`w3.org/WAI/ARIA/apg/patterns/treeview/`, letta 11/09/2026). Verbatim: freccia destra «When focus
  is on a closed node, opens the node; focus does not move» · «When focus is on a open node, moves
  focus to the first child node» · «When focus is on an **end node, does nothing**»; freccia sinistra
  «When focus is on an open node, closes the node» · «…moves focus to its parent node». `aria-expanded`
  «set to `false` when the node is in a closed state and `true` when open», e i nodi foglia **non**
  devono averlo. ⇒ Il terzo caso della freccia destra mancava: su un file scendeva alla riga dopo,
  cioè faceva il lavoro della freccia giù. Corretto.
- **Microsoft Learn — «Launching Applications (ShellExecute, ShellExecuteEx, SHELLEXECUTEINFO)»**
  (`learn.microsoft.com/en-us/windows/win32/shell/launch`, pagina datata 2025-07-02, letta
  11/09/2026): il verbo predefinito di un oggetto della Shell è `open` e vale per «file **or folder**
  objects» ⇒ aprire una cartella è la stessa operazione di aprire un file, con un gestore diverso. Il
  `/select` non è un verbo: è lo switch che apre il genitore. ⇒ `explorer.exe <cartella>`, senza
  `/select`, è la porta giusta — la stessa già in uso per i file.

---

## 4. Prove, nei due versi

### Unit backend — `harness-ui/tests/workspace-files.test.mjs` (57 passate, 0 rosse)

- la **radice** (`percorso: ''`) si apre: `explorer.exe` con **un solo** argomento argv, senza
  `/select`, e le opzioni arrivano nel posto delle opzioni (è la forma che il 10/09 lasciava la
  promessa appesa per sempre);
- una **cartella** e un **file** dentro il workspace si aprono dalla stessa funzione;
- **AL CONTRARIO** — respinti, e `explorer.exe` **mai chiamato** (contatore a 0): `..`, `../..`,
  `../<altra-cartella>/segreto.txt`, un percorso assoluto altrove, `C:\Windows`, un percorso con byte
  nullo, un percorso che non è una stringa;
- **AL CONTRARIO** — un **collegamento** (junction) che punta fuori viene canonicalizzato da
  `realpath` e respinto;
- **AL CONTRARIO** — fuori da Windows: `PLATFORM_UNSUPPORTED`, mai una finta riuscita;
- **AL CONTRARIO, la prova che conta di più** — la deroga **non si è allargata**: `rinomina`,
  `elimina`, `copia`, `leggi`, `rivela` e `apri col programma` continuano a dire di no alla radice.

### Rotta — `harness-ui/tests/albero-apri-radice.test.mjs` (4 passate)

- `{percorso: ''}` arriva **intatto** al registro (è il caso dell'owner: un controllo di corpo che
  chiedesse una stringa non vuota lo avrebbe respinto come «percorso mancante»);
- una sottocartella passa dalla stessa rotta;
- **AL CONTRARIO** — corpo vuoto, `percorso` numerico, chiave in più, chiave sbagliata, query appesa:
  400 `QUERY_INVALID`, e il registro **non viene chiamato nemmeno una volta**; `GET` non apre niente;
- un errore del registro esce come errore dichiarato (404), non come 200 muto.
- Sul banco vivo: `GET …/tree/open` → **405** (la porta c'è, la bussata è sbagliata),
  `POST` su una sessione inesistente → **404**. Il guardiano `tests/http-inventario-rotte.test.mjs`,
  che rilegge il sorgente invece di fidarsi di una lista, resta verde.

### Unit frontend — `harness-ui/frontend/tests/unit/albero-comprimi-e-apri.test.mjs` (11 passate)

Cancelli statici sul sorgente di `app.js`, ognuno con la sua metà **al contrario** su un sorgente
finto guasto. Perché servono: la cura vive in tre righe minuscole sparse in tre funzioni, e
toglierne **una** rimette esattamente il difetto dell'owner senza far diventare rosso niente — non un
test, non un build, non un typecheck.

- la `<ul>` nasce chiusa · aprire la scopre · chiudere la rinasconde;
- `chiudiCartellaAlbero` **non** riceve la `<ul>` come parametro (un terzo chiamante domani se la
  dimenticherebbe);
- freccia destra su un nodo foglia non muove il fuoco; su cartella aperta va al primo figlio;
- il menu della radice ha `Apri in Esplora File` **in testa**; le cartelle hanno «apri» e «rivela»
  vicine e nell'ordine; `apriInEsploraFile` parla con `/tree/open` e **mai** con `/tree/reveal`;
- la radice ha il suo «···» **più** il tasto destro;
- l'Esc del menu è in **cattura** con `stopPropagation`, e si stacca con lo stesso `true`.

### Banco (Playwright, porta 5347) — comportamento vero, dopo la cura

- **tre giri** di apri/chiudi su `src`: figli visibili `3 → 0 → 3 → 0 → 3 → 0`, in entrambi i temi;
- lo stato **sopravvive al ridisegno** dell'albero (`renderizzaAlberoReale`, cioè la strada di
  `WorkspaceChanged`): `src` resta aperta, `tests` resta chiusa;
- tastiera, sette passi, esattamente come l'APG: ← chiude · → apre (fuoco fermo) · → va al primo
  figlio · ← torna al padre · Invio chiude · Spazio riapre · → su un **file** non muove niente;
- tasto destro sulla radice → menu `['Apri in Esplora File', 'Nuovo file', 'Nuova cartella']`, e
  **la POST parte verso il banco**: `POST http://127.0.0.1:5347/api/v1/sessions/banco-albero/tree/open`
  con `{"percorso":""}`. Mai verso il 4174;
- il «···» della radice: invisibile a riposo, **visibile al passaggio del mouse**, e apre lo stesso
  menu;
- **zero** errori JavaScript a runtime (`pageerror` + `console.error`) in entrambi i temi.

### Windows vero — «la cartella si apre davvero»

`apriInEsploraFile` chiamata dal vivo su una cartella temporanea, contando le finestre di Esplora file
con `Shell.Application.Windows()` prima e dopo:

```
esito radice:        {"aperto":true}   140 ms
esito sottocartella: {"aperto":true}   144 ms
file:///C:/Users/.../talos-apri-radice-9ttrZA
file:///C:/Users/.../talos-apri-radice-9ttrZA/sotto
```

Due finestre nuove, una sulla **radice** e una sulla sottocartella. Richiuse subito dopo (verificato:
zero finestre residue con quel percorso), cartella temporanea cancellata.

### Un terzo difetto trovato per strada, e curato

Con una sessione viva, **Esc** per chiudere il menu del tasto destro chiudeva il menu **e apriva il
velo «fermo il giro?»** — due strati smontati con un tasto solo, il secondo dei quali chiede di
interrompere del lavoro pagato. Causa: la catena di Esc della app (B16) è registrata all'avvio,
quindi in **bolla** gira prima dell'ascoltatore del menu, e uno `stopPropagation` lì arriverebbe
tardi. Cura: fase di **cattura**, identica a quella che un altro lotto ha già adottato l'11/09 per il
menu della riga di sessione. ⛔ Non un'eccezione dentro la catena B16: due menu che si chiudono in due
modi diversi divergono al primo cambiamento.

### Suite intere, una volta alla fine

- `npm run test:unit` (frontend) → **798 passate, 0 rosse** (erano 763 + 11 mie + quelle di un altro lotto in corso);
- `node --test tests/*.test.mjs` (backend) → **2417 passate, 0 rosse**. I rossi transitori attesi in
  `research-orchestrator`/`session-registry` **non** si sono presentati: la suite è verde per intero.

---

## 5. Foto — tema chiaro **e** scuro

In `%TEMP%\claude\…\af5c3844-…\scratchpad\foto\albero\`, viewport 1440×900:

| file | cosa mostra |
|---|---|
| `dark-1-intero.png` · `light-1-intero.png` | l'app intera, `src` **aperta** e `tests`/`kernel` **chiuse** |
| `dark-2-albero.png` · `light-2-albero.png` | il solo pannello File: freccetta in giù sull'aperta, a destra sulle chiuse, rientri corretti |
| `dark-3-menu-radice.png` · `light-3-menu-radice.png` | il menu del tasto destro sulla **radice**, con «Apri in Esplora File» in testa |

E le foto del **prima**, con il difetto ancora dentro: `scratchpad\foto\prima-{dark,light}-albero.png`
e `prima-{dark,light}-menu-radice.png`.

Ispezione delle immagini: nessun difetto nuovo trovato nel pannello. Il menu copre in parte il nome
della radice quando nasce sul punto del clic — è quello che fa anche Esplora file, non è un difetto.

---

## 6. Cosa NON ho verificato / debiti

1. ⛔ **La cura non è ancora sul 4174.** Il server dell'owner serve `harness-ui/public/`, che è un
   artefatto di build: ci arriva con `node frontend/scripts/cutover.mjs --applica`. **Non l'ho
   eseguito**, e di proposito: quel comando porterebbe nel `public/` anche il lavoro **a metà di
   altri lotti** che in questo momento hanno modifiche non committate in `frontend/src` e
   `src/http-app.mjs` (rotte note/attività/memoria). È la lezione «non consegnare al 4174 il lavoro a
   metà di un altro». La consegna va fatta quando l'albero è pulito — decide l'owner.
2. **Non provato con un giro vero del modello** (vincolo del compito): nessuna sessione a pagamento,
   nessuna chiamata al 4174. L'albero è stato guidato con una sessione finta e risposte di rete finte;
   il disegno, il CSS e gli ascoltatori sono però quelli di produzione.
3. **`WorkspaceChanged` non è stato provato dal watcher vero**: ho provato la strada che quel percorso
   usa (`renderizzaAlberoReale`, cioè il ridisegno completo), non l'evento del filesystem.
4. **Viewport**: misurato e fotografato solo a **1440×900**. Laptop 1024×800 e 1280×800 non sono stati
   guardati per questo lotto.
5. **Solo `channel: 'chrome'` headless**: la lezione del 02/09 dice che l'headless non prova la
   fluidità nel browser vero dell'owner. Qui non si misurava fluidità, ma la transizione della
   freccetta non l'ha vista un occhio umano su hardware vero.
6. **Debito di parole, non mio da decidere**: l'etichetta sorella dice `Rivela in Esplora File` con la
   F maiuscola (il nome Microsoft italiano è «Esplora file»). Ho usato la stessa forma parola per
   parola, perché due righe adiacenti dello stesso menu che scrivono lo stesso nome in due modi sono
   già un difetto; rinominarle **entrambe** è una decisione dell'owner. Sempre su quel menu: «Rivela»
   è una traduzione letterale di *Reveal*, Windows dice «Mostra nella cartella».
7. **`apriMenuAzioniLibreria`** (stessa classe `.ft-actions-menu`, Libreria) ha ancora l'Esc **in
   bolla**: fuori dalla mia lane, non l'ho toccato. Probabile stesso difetto del velo «fermo il giro»:
   **segnalato, non corretto**.
8. **`harness-ui/dist/styles.css`** è un build vecchio che nessuno serve più e che contiene ancora le
   regole `.ft-node` perdute: segnalato come possibile fonte di confusione per la prossima indagine,
   non cancellato.
9. **File toccato fuori dall'elenco del compito**: `harness-ui/src/session-registry.mjs`, **+20 righe
   puramente additive** (un import, una dipendenza iniettabile, un metodo accanto a `rivelaFile`).
   Non c'era altro modo di dare alla rotta la cartella della sessione. Nessuna riga esistente
   modificata.

---

### Riepilogo

**Cosa devi fare tu** — decidere (a) quando eseguire il cutover verso `public/` (io non l'ho fatto:
porterebbe al 4174 il lavoro a metà di altri lotti), (b) se rinominare le due voci Windows del menu in
«Apri in Esplora file» / «Mostra nella cartella», (c) se assegnare a qualcuno l'Esc in bolla del menu
della Libreria.

**Cosa faccio io** — niente altro su questo lotto senza un tuo sì: i due difetti sono chiusi, provati
nei due versi, e le suite sono verdi per intero.

**Cosa rimane** — la cura non è ancora visibile sul 4174 finché non si esegue il cutover; le viewport
1024×800 e 1280×800 non sono state guardate; l'Esc del menu della Libreria e il `dist/` vecchio
restano segnalati e non toccati.
