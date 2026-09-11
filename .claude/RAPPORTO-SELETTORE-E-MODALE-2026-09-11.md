# BC-12 e BC-14 — il selettore dei modelli e la modale «Nuova sessione»

**11/09/2026 · lane `lane/harness-desktop` · file toccati: `harness-ui/frontend/src/legacy/app.js`,
due componenti nuovi, due file di prova.**

Banco: server mio sulla **4188** (`node server.mjs` con `TALOS_HARNESS_UI_PUBLIC_DIR=dist`, store di
sessioni in una cartella temporanea, `TALOS_HARNESS_UI_PROJECT_DIRS` puntato a una cartella-progetto
di prova). ⛔ **Il 4174 non è stato toccato in nessun momento**: verificato prima (porta scelta a
mano) e dopo (il 4188 è spento, il 4174 è ancora in ascolto ed è di chi lavora).
Prove visive: `.claude/prove-bc12-bc14-2026-09-11/` — **12 foto, sei stati × due temi**.

---

## 1. BC-14 — la modale bloccava «Avvia» e mentiva sul perché

### 1.1 Riproduzione (prima di toccare niente)

Cartella scelta nell'albero, **fuori** dai progetti autorizzati. I quattro permessi, uno per uno:

| permesso scelto | bottone disabilitato | testo del bottone |
|---|---|---|
| Read only | **sì** | **«Scegli una cartella»** |
| Workspace write | **sì** | **«Scegli una cartella»** |
| On request | **sì** | **«Scegli una cartella»** |
| Full access | no | «Continua nella chat — fuori-allowlist» |

…e due dita più in alto la carta «Cartella scelta» mostrava il percorso **intero**. La segnalazione
dell'owner è riprodotta alla lettera: due testi sulla stessa schermata che si contraddicono.

### 1.2 Causa — sono TRE cose, non una

**(a) La bugia sul bottone.** `src/legacy/app.js:15774` (prima della cura):

```js
submit.textContent = local.busy ? 'Apro la cartella…' : ready ? `Continua nella chat — ${nomeScelto}` : 'Scegli una cartella';
```

Un ternario con **due rami per tre stati**: «non pronto» diventava sempre «Scegli una cartella»,
anche quando la cartella c'era e a mancare era il permesso.

**(b) La ragione vera era FUORI DALLO SCHERMO — ed è il vero motivo per cui nessuno se n'era accorto.**
La frase onesta esisteva già (`policyGate`, «Questa cartella è esterna ai progetti già
autorizzati…»), ma vive in fondo alla colonna destra, che **scorre**. Misurato:

| viewport | la ragione vera è dentro la colonna visibile? |
|---|---|
| 1440×900 | **no** (`dentroLaColonna: false`) |
| 1280×800 | sì |
| 1024×800 | **no** (`dentroLaColonna: false`) |

⇒ Sullo schermo dell'owner l'**unica** spiegazione leggibile era quella sul bottone, ed era falsa.
La cura non poteva essere solo cambiare la frase: andava messa dove l'occhio è già, nel piede.

**(c) Un blocco che il server non ha mai chiesto.** `harness-ui/src/session-registry.mjs:3291`:

```js
if (cartellaLibera && permessiScelto !== 'Full access') { … QUERY_INVALID }
```

Il cancello nomina **una sola** forma, `cartellaLibera`. Quindi:

* cartella dell'allowlist (`cartellaId`) → qualsiasi permesso. Il frontend faceva bene.
* percorso libero (`cartellaLibera`) → solo «Accesso pieno». **Il blocco è vero**: si tiene.
* cartella dal **tasto destro di Windows** (`workspaceLaunchId`) → il server **non chiede niente**, e
  lo provano due suoi test **verdi**: `harness-ui/tests/session-registry.test.mjs:928` e
  `harness-ui/tests/http-routes-workspace-launch.test.mjs:106` avviano con `permessi: 'Workspace write'`
  e si aspettano successo (200, permesso registrato).
  ⛔ **Il frontend la bloccava lo stesso**: un divieto inventato qui, su una combinazione che il
  server ha un test verde per accettare. Non era nella segnalazione: è uscito leggendo il cancello.

**(d) Quarta cosa, trovata sulla stessa superficie: i nomi tecnici a schermo.** I quattro tasti si
presentavano come `<strong>Read only</strong><small>Solo lettura</small>` — il valore grezzo del
kernel, **in inglese, in grassetto**, proprio dove si decide quanta libertà dare all'agente. La
prova che fosse davvero così è la segnalazione dell'owner, che li ha chiamati «read only, workspace
write e on request»: li ha nominati **come glieli mostravamo noi**. Regola del 04/09 violata da sempre.

### 1.3 Cura

Nuovo modulo **`src/components/avvio-sessione.js`**: `statoAvvioSessione({cartella, permesso, occupato})`
è una funzione pura che torna `{situazione, puoAvviare, disabilitato, etichetta, motivo, rimedioSu}`.
La decisione che mentiva adesso sta in un posto solo e si può provare nei due versi.

In `app.js`:

* **Il bottone non è più spento** se non mentre una cartella si sta aprendo. Ricerca fatta prima di
  scrivere (11/09/2026): *Smashing Magazine, «Usability Pitfalls of Disabled Buttons»*; *Adam Silver,
  «The problem with disabled buttons and what to do instead»*; *discussione w3c/wcag #3845* — un
  bottone disabilitato non prende il fuoco, ha contrasto insufficiente e **non dice mai perché**; se
  l'istruzione vive solo nel suo stato, non è mai stata dichiarata (WCAG 3.3.1). Spegnerlo resta
  legittimo solo per un'operazione in volo, ed è l'unico caso rimasto.
* **Il testo del bottone dice la cosa che manca**: «Serve «Accesso pieno»» invece di una frase falsa.
* **La ragione è ripetuta nel piede**, accanto al bottone (`talos-grow`, l'utility che il sistema di
  design usa già in ogni piede di finestra), legata al bottone con `aria-describedby`.
* **Premere il bottone bloccato porta al rimedio**: scorre ai permessi e mette il fuoco su «Accesso
  pieno». ⛔ Non lo **sceglie** al posto della persona (consegna del 01/09: «la selezione non
  promuove silenziosamente i permessi a Full access»). Questo ramo esisteva già nel `submit` ed era
  **codice morto**, perché il bottone disabilitato non lo faceva mai partire.
* **Il tasto destro di Windows non è più bloccato** con i permessi che il server accetta.
* **I nomi tecnici spariti**: titolo = nome umano (`politiche.js`), didascalia = nota di rischio,
  descrizione intera nel suggerimento del puntatore. ⛔ Il valore che viaggia verso il kernel resta
  `Read only` e compagni, byte per byte.

**Al verso contrario, durante la cura:** ci avevo messo `aria-disabled="true"` quando non si può
partire. Playwright si è rifiutato di cliccare — «element is not enabled» — cioè lo dichiarava **non
disponibile** nell'albero di accessibilità. Ma il bottone è disponibile: premendolo porta al rimedio.
Sarebbe stata la terza bugia. Tolto, e scritto perché nel codice.

### 1.4 Riverifica — tutti e quattro i permessi, con una cartella scelta

Cartella **fuori** allowlist:

| permesso | disabilitato | bottone | ragione (nel piede e sotto i permessi) |
|---|---|---|---|
| Solo lettura | **no** | «Serve «Accesso pieno»» | «fuori-allowlist è fuori dai progetti già autorizzati: TALOS la accetta solo con «Accesso pieno». Ora è scelto «Solo lettura».» |
| Scrive nel progetto | **no** | «Serve «Accesso pieno»» | …«Ora è scelto «Scrive nel progetto».» |
| Chiede prima | **no** | «Serve «Accesso pieno»» | …«Ora è scelto «Chiede prima».» |
| Accesso pieno | **no** | «Continua nella chat — fuori-allowlist» | ««Accesso pieno» consente di usare questa cartella esterna…» |

Cartella **nella** allowlist: tutti e quattro partono, con «Con «X» TALOS resterà nella cartella scelta.»
Premendo il bottone bloccato: `fuocoSu: 'Full access'`, `permessoInVista: true`, modale aperta.

Foto: `BC14-1-bloccato-ma-onesto-*`, `BC14-2-il-clic-porta-al-permesso-*`, `BC14-3-pronto-*`,
`BC14-4-progetto-solo-lettura-*` — **tema chiaro e tema scuro**.

---

## 2. BC-12 — «Diretti» spezzata in una scheda per fornitore

### 2.1 Ricerca prima di disegnare (11/09/2026), letta nel CODICE dei concorrenti

* **Hermes Agent v0.21** (`apps/desktop/src/components/model-picker.tsx`, clone in
  `%LOCALAPPDATA%\Temp\talos-competitor`): elenco unico cercabile in cui **ogni fornitore è un gruppo
  di primo livello**, intestazione `nome` + `slug · numero di modelli`. **Nessun contenitore
  «diretti»**. I fornitori senza chiave non compaiono fra i selezionabili: si passa da un'azione
  esplicita «Add provider».
* **opencode** (`packages/app/src/components/dialog-select-model.tsx`): stessa scelta,
  `groupBy(provider.name)` più un parametro `provider` che restringe la vista a **un fornitore solo**.
* ⇒ La richiesta dell'owner è lo **stato dell'arte**, non un gusto: il fornitore è l'asse, non un
  sottolivello. Qui diventano schede perché la striscia delle fonti esiste già ed è il posto dove
  questa app fa scegliere «da dove».
* **ARIA Authoring Practices, pattern «Tabs»** (w3.org/WAI/ARIA/apg): con cinque schede servono una
  sola fermata di Tab (tabindex mobile), frecce ← → cicliche, Home/End. Implementati.
* Tetto delle schede (Apple HIG via eleken.co, già citato in `app.js` il 03/09): oltre sei ci si
  perde. Qui sono **cinque**.

### 2.2 Cura

Nuovo modulo **`src/components/fonti-modelli.js`** (schede, conteggi, frasi del vuoto) e montaggio in
`app.js`. Da tre schede — OpenRouter 444 · Locali 2 · **Diretti 113** — a cinque:
**OpenRouter · Locali · Anthropic · Gemini · OpenAI**, ciascuna col suo conteggio vero.

* Dentro la scheda di un fornitore l'elenco è **piatto**: il gruppo per fornitore è la scheda stessa.
  Su OpenRouter i gruppi **restano** — lì `provider` è l'**autore** del modello (51 famiglie,
  misurate il 03/09), che è un asse diverso dalla via d'accesso.
* **I conteggi arrivano subito**, non al primo clic: la striscia promette un numero per scheda, e una
  scheda che lo mostra solo dopo che ci hai cliccato sopra non serve a scegliere dove guardare.
  Richiesta in parallelo, come già i modelli locali; un guasto lì non spegne OpenRouter.
* **Tre stati distinti** dove prima ce n'era uno: `null` = chiave non collegata (nessun conteggio, e
  la scheda dice dove si collega) · `[]` = letto, zero modelli · errore = il messaggio del fornitore.
  Prima erano una lista piatta e un array di frasi appiccicate, e «non ho la chiave» si leggeva come
  «non ha modelli».
* La riga di modello è stata **estratta** (`rigaModello`) invece di copiata: serviva anche fuori dal
  ciclo dei gruppi.

**Al verso contrario, durante la cura — il primo tentativo era sbagliato e la foto l'ha bocciato.**
Misurato prima: la striscia è larga **410 px** a 1440 e **397** a 1024; le tre schede di prima ne
occupavano 271, le cinque ne vogliono **508**. Avevo messo `overflow-x:auto` (è ciò che il sistema di
design fa per le sue liste di schede). Risultato in foto: in una colonna flex un `overflow-x` non
`visible` rende `auto` anche `overflow-y`, la striscia si è lasciata schiacciare e **le etichette
sono uscite tagliate a metà altezza**; e la quinta scheda restava comunque nascosta dietro una barra
di scorrimento che su Windows non si vede finché non ci passi sopra. ⇒ **Va a capo**
(`flex-wrap:wrap`, la risposta che il sistema di design dà per le sue schede a pillola): due righe
nella colonna stretta, **una riga sola** nel velo «Modello e ragionamento» (652 px), tutte e cinque
sempre visibili.

### 2.3 Riverifica

| scheda | gruppi | righe | piede |
|---|---|---|---|
| OpenRouter | 51 | (richiudibili) | «443 modelli · OpenRouter» |
| Locali | 0 | 2 | «2 modelli · su questo computer» |
| Anthropic | 0 | 11 | «11 modelli · Anthropic · collegamento diretto» |
| Gemini | 0 | 31 | «31 modelli · Gemini · collegamento diretto» |
| OpenAI | 0 | 71 | «71 modelli · OpenAI · collegamento diretto» |

* Ricerca dentro una scheda: «gpt-7» su OpenAI → 3 righe. ✅
* Tastiera: → → cicla, End/Home ai capi, ← dal primo torna all'ultimo; `tabindex` mobile corretto in
  tutti i passaggi; `aria-controls` punta all'elenco. ✅
* Con la sola chiave OpenAI: Anthropic e Gemini **senza conteggio**, suggerimento «chiave non
  collegata», e nel pannello «Collega la chiave Anthropic dal pannello Provider…». ✅
* Scelta vera di un modello diretto dal velo: `trigger` e pillola del composer passano a
  `gemini:gemini-1`. ✅ **Nessun errore a runtime** in nessuno dei giri.

**Difetto trovato e curato per strada:** la scheda «Locali» non aggiornava il piede, così sotto due
modelli locali si leggeva ancora «71 modelli · OpenAI». Era vero anche prima (diceva «OpenRouter») e
passava inosservato; con le schede per fornitore nomina un fornitore sbagliato.

Foto: `BC12-1-cinque-schede-*`, `BC12-2-scheda-anthropic-*` — chiaro e scuro.

---

## 3. Prove

`cd harness-ui/frontend && npm run test:unit` → **679 verdi, 0 rossi** (baseline all'inizio del
lavoro: 635; +12 miei, il resto arrivato dalle corsie che lavorano in parallelo).

Due file nuovi, ogni prova con la sua metà al contrario:
`tests/unit/avvio-sessione.test.mjs` · `tests/unit/fonti-modelli.test.mjs`.

---

## 4. ⛔ Trovato e NON curato — non è la mia corsia

### 4.1 GRAVE — il testo di OGNI `.primary-btn` è quasi invisibile, in tutti e due i temi

`src/styles/foglio-monolite.css:63` — `.primary-btn{ background: var(--accent); color: var(--on-accent) }`
e `:34` — `--on-accent: var(--talos-accent-text, #151411)`. `--talos-accent-text` è il token del
**testo color accento** (per il testo dentro un fondo `accent-soft`), non la tinta da mettere **sopra**
un pieno di accento. Misurato sul bottone «Continua nella chat…» della modale, e **confermato sui
pixel della foto**, non solo sul computed style:

| tema | testo | fondo | contrasto |
|---|---|---|---|
| chiaro | `rgb(112,72,20)` | `rgb(155,104,35)` | **1,67 : 1** |
| scuro | `rgb(216,183,134)` | `rgb(192,139,60)` | **1,58 : 1** |

WCAG 1.4.3 chiede 4,5:1 (3:1 per il testo grande). Riguarda tutti i `.primary-btn` e i `.badge-dot`
dei dialoghi, non solo questa modale. **Non l'ho toccato**: `src/styles/**` è di un'altra corsia e
il file risulta già modificato da lei. ⛔ È anche il motivo per cui, nella cura di BC-14, la ragione
è **ripetuta nel piede**: oggi la copia leggibile è quella, non quella sul bottone.

### 4.2 `--muted` a 9 px nel tema chiaro è sotto la soglia

Sul fondo del piede: **4,21:1** nel chiaro (6,39 nello scuro). Riguarda
`.workspace-chooser-help` e `.workspace-chooser-policy-gate`. Per le due righe che ora spiegano un
blocco ho messo `--text-2` (9,23 chiaro · 12,83 scuro) **inline**, con il debito dichiarato nel
commento: la cura vera è in `foglio-monolite.css`.

### 4.3 Ruoli ARIA misti nel pannello del selettore

Il pannello ha `role="listbox"` ma contiene anche il campo di ricerca e la striscia delle schede: un
listbox non può contenere una casella di testo. Va spostato sull'elenco (`.model-picker-list`).
Non l'ho fatto: è un cambio di struttura fuori dalle due righe chieste, e va provato a parte.

### 4.4 Debito dichiarato mio: tre regole di stile sono inline

`flex-wrap` + `flex-shrink` + `row-gap` sulla striscia delle fonti, `flex:0 0 auto` sulle schede,
`margin-top:0` + `color` sulla nota del piede, `color` sul `policyGate`. Vanno in
`foglio-monolite.css` accanto a `.model-picker-sources` e `.workspace-chooser-help` appena la corsia
degli stili è libera. Sono inline **solo** per non mettere due mani sullo stesso file.

---

## 5. Cosa NON ho verificato

* **Il giro vero con un modello**: nessuna sessione è stata avviata davvero. Ho verificato che la
  modale spedisce (`puoAvviare`) e con quale forma (`cartellaId` / `cartellaLibera` /
  `workspaceLaunchId`), non che il server poi la esegua.
* **Il tasto destro di Windows dal vivo**: il blocco falso è provato leggendo il cancello del server
  e i suoi **due test verdi**, e la cura è provata nell'unità. Non ho fatto il giro completo
  Esplora file → URL → modale → avvio, perché avrebbe fatto partire una sessione vera.
* **Viewport 1280×800** per BC-12: misurate 1440 e 1024 (le due dove la striscia sfondava). La 1280
  l'ho misurata solo per BC-14.
* **Le altre due bocche del selettore** oltre a «Nuova sessione» e al velo «Modello e ragionamento»
  (il picker del planner e quello della delega): stesso componente, non fotografate una per una.
* **`npm run test:componenti`** (Playwright di parità) non è stato lanciato: accende server suoi e la
  suite è condivisa con altre corsie che stanno scrivendo adesso. Ho lanciato solo `test:unit`.
* **Contrasto del bottone primario**: misurato, **non corretto** (vedi §4.1).
