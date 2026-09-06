# Il cancello unico — i metodi, consolidati con la ricerca

> Owner 06/09: «un lavoro fatto pulito e che risolva una volta per tutte», poi «fai una ricerca
> tecnica per consolidare i metodi del cancello». Questo documento è quella ricerca, e vale come
> **contratto** per chi scrive i pezzi: nessuno inventa il proprio metodo.

## Perché esiste — i fatti di oggi, non un'opinione

Il problema non sono i 121 difetti della coda. È che **niente li guardava**. Tutti quelli trovati
oggi erano lì da giorni, e nessuno è stato trovato da un test:

| trovato | come | da quanto era lì |
|---|---|---|
| 12 simboli chiamati e mai disegnati (`i-folder-open` nella modale «Nuova sessione») | guardando uno screenshot | giorni |
| `.sheet-option` senza regola di base (esisteva solo `.active`) ⇒ foglio illeggibile | guardando uno screenshot | giorni |
| «in corso» su sessioni morte da due ore | guardando uno screenshot | dal primo riavvio |
| «scrivi» chiuso e il terminale che scrive lo stesso (**sicurezza**) | prova a mano T03 | 3 giorni, in nessuna tabella |
| il ritratto della cartella che descriveva `C:\` invece del progetto | prova a mano | dalla sua nascita |

⛔ E il difetto più insidioso: un test che **provava una combinazione che il server non produce
mai** (`{conclusa:true, interrotta:true}`) e quindi passava mentre il difetto era vivo. Un cancello
che guarda la cosa sbagliata è peggio di nessun cancello, perché rassicura.

⇒ Il lavoro non è correggere 121 righe: è **costruire ciò che le trova**, e che continua a trovarle
quando io non ci sono.

## Le cinque classi, e il metodo per ciascuna

### 1 · Riferimenti morti — un nome che punta al nulla

Un `<use href="#i-edit">` senza simbolo, una classe senza regola CSS, un `data-vaia` che nessuna
mappa conosce. Nessuno di questi produce un errore: producono un **buco muto**.

**Metodo** (letto 06/09/2026): l'idea è di **CILLA** (saltlab/cilla) — analizzare la relazione *a
runtime* fra le regole CSS e il DOM vero, che trova tre cose diverse: selettori che non agganciano
niente, dichiarazioni sempre sovrascritte, e **valori di classe non definiti** (una classe usata
nell'HTML per cui non esiste regola: esattamente il difetto di `.sheet-option`). Playwright espone
`coverage` per CSS e JS, e `@projectwallace/css-code-coverage` la trasforma in un lint.

⛔ **Trappola dichiarata dalla fonte**: pseudo-classi (`:hover`, `:focus`, `:active`) e `@keyframes`
non «sparano» mai durante la coverage e risulterebbero morti pur essendo necessari. Vanno **filtrati
per costruzione**, altrimenti il rapporto è pieno di falsi positivi e nessuno lo legge più.

⛔ **Trappola trovata da noi, oggi**: cercare solo la forma `icon('i-x')` perde `icona: 'i-x'` e
`icon(c ? 'i-a' : 'i-b')`. Si cerca **qualunque literal** che si chiami come un simbolo.

### 2 · Controlli morti — un bottone che non fa niente

**Metodo**: `DOMDebugger.getEventListeners` via **sessione CDP** di Playwright. ⛔ Vincolo netto:
`page.evaluate` **non ha i permessi** per `getEventListeners` — funziona solo dalla console di
DevTools o dal CDP. Si ottiene l'`objectId` con `Runtime.evaluate`, poi si chiede la lista con
`depth: -1` (tutto il sottoalbero) e `pierce: true` (attraversa iframe e shadow root).

⛔ **Trappola**: un bottone senza gestore proprio può essere servito da un **gestore delegato** su
un antenato (è il nostro caso più comune: `ROOT().addEventListener('click', …)`). Un controllo che
guarda solo l'elemento accuserebbe mezza app. Si risale la catena degli antenati **e** si verifica
che l'attributo su cui la delega discrimina (`data-vaia`, `data-apre-velo`, `data-sheet`…) sia
riconosciuto da quella delega.

### 3 · Stati che mentono — lo schermo dice una cosa, i dati un'altra

**Metodo**: contract testing applicato all'interfaccia — si prende la risposta vera dell'API come
**sorgente di verità** e si confronta con ciò che è scritto sullo schermo, con invarianti
dichiarate. Le fonti (06/09/2026) lo chiamano *drift*: «lo schema non corrisponde più al contratto
che credi vero», e la cura è il confronto automatico in CI, non l'occhio.

Le nostre invarianti, dai difetti veri: `interrotta:true` ⇒ mai «in corso» · `conclusa:true` ⇒ mai
un pallino vivo · il ritratto sotto «Cartella scelta» descrive **quella** cartella · i numeri della
barra di stato sono della sessione aperta, non di un'altra.

### 4 · Testo grezzo a schermo — JSON, inglese, nomi tecnici

**Metodo**: `i18n-lint` (jwarby) rileva le stringhe hardcoded nei nodi di testo **e negli
attributi**; per il resto si guarda il DOM renderizzato cercando le firme del grezzo: `{"` e `":`
(JSON), `REFUSED.`/`Error:` (messaggi del kernel non tradotti), i nomi tecnici degli attrezzi
(`web_search`, `document_create`) che l'owner ha vietato a schermo, e le parole inglesi fuori dai
nomi propri.

⛔ **Trappola**: il codice mostrato di proposito (un blocco ```) non è testo grezzo. Si escludono
`pre`, `code` e i campi che dichiarano di mostrare il tecnico.

### 5 · Superfici scollegate — una vista che non riceve i dati veri

Una scheda sempre vuota mentre la rotta che la riempirebbe esiste (la scheda **Agenti** contro
`/children`), un contatore vivo su una pagina che non c'è (le **Note**).

**Metodo**: per ogni superficie, incrociare le rotte che il server espone con quelle che il
frontend chiama davvero; una superficie che dichiara un contenuto e non chiama nessuna rotta è
sospetta per costruzione.

## Come dev'essere fatto il cancello

- **Un comando solo**, che gira su tutte e 17 le schermate × 3 viewport desktop × 2 temi.
- Produce **una lista azionabile**: classe · dove (`file:riga` o selettore) · cosa manca · gravità.
- ⛔ **Zero falsi positivi tollerati**: un rapporto che grida al lupo non viene più letto. Ogni
  regola nasce con la sua lista di eccezioni dichiarate, e ogni eccezione ha un perché scritto.
- ⛔ Ogni controllo **si prova al contrario**: si rompe una cosa di proposito e il cancello deve
  diventare rosso. Un controllo che non l'ha mai fatto non è un controllo (lezione del cancello
  semantico, spento da sempre senza che nessuno se ne accorgesse).
- ⛔ **Non tocca il 4174** e non usa porte a caso: server proprio, store separato, e la prova che
  sia il proprio (uno store vergine risponde «0 sessioni»).

## Cosa questo cancello NON copre

Non giudica se una cosa è **bella**, se il testo è **giusto**, se il flusso ha senso. Quelle
restano allo screenshot guardato da una persona. Il cancello toglie di mezzo il lavoro meccanico,
così l'occhio si spende dove serve.

## Fonti (tutte lette il 06/09/2026)

- saltlab/cilla — relazione runtime CSS↔DOM: selettori non matchati, dichiarazioni sovrascritte,
  valori di classe non definiti
- Project Wallace, «How to calculate CSS code coverage with @playwright/test» — coverage come lint,
  e il filtro obbligatorio su pseudo-classi e keyframes
- Chrome for Developers, «Get and debug event listeners» · puppeteer#5319 · chromedp/cdproto —
  `DOMDebugger.getEventListeners`, `objectId`, `depth:-1`, `pierce:true`, e il limite di `evaluate`
- jwarby/i18n-lint — stringhe hardcoded in nodi di testo e attributi
- InstaTunnel, «Automated Contract Testing: How to Detect API Drift» · Total Shift Left, «API Schema
  Validation Drift Detection» — la sorgente di verità e il confronto automatico
- axe-core / Pa11y — WCAG per ogni locale, e la pseudo-localizzazione come prova a basso costo
