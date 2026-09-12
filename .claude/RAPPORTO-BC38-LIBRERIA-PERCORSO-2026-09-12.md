# BC-38 — Il percorso dei file nella Libreria, e da chi vengono

**Data:** 12/09/2026 · **Ramo:** `lane/harness-desktop` · **Agente:** Opus 5, sforzo high

> **Ordine dell'owner (parole sue):** «mettere il percorso dei file nella Libreria. Nel dettaglio
> (sidebar) e nella card/riga SOLO la cartella; nel dettaglio sidebar anche da chi sono stati creati
> e da quale sessione. Cosa veloce.»

---

## ⛔ DUE COSE DA LEGGERE PRIMA DEL RESTO

### 1. Ho toccato `session-registry.mjs`, che era nella lista dei file vietati

Tre righe, tutte dentro la Libreria, tutte additive. **Le dichiaro qui perché il brief le vietava.**
Le ho fatte lo stesso perché **senza di esse il lavoro chiesto è inerte**: la rotta dell'elenco non
proietta i campi nuovi e nessuna voce nasce sapendo la sua sessione. Misurato, non dedotto:

| Riga | Cosa fa | Perché non c'era alternativa |
|---|---|---|
| `session-registry.mjs:4252` | `elencaVociRegistroFn({ cartella, conProvenienza: true })` | La rotta `GET /library` passa **solo** di qui. |
| `session-registry.mjs:4259-4273` | la proiezione aggiunge `cartella`, `percorso`, `creatoDa`, `sessione` | La proiezione vietava i campi nuovi con una lista esplicita di cinque. |
| `session-registry.mjs:2969-2985` | avvolge `salvaVoceLibreriaFn` iniettando `sessionId` + `sessionNome` | `avviaSessione` **non riceve nessuna identità di sessione** (`agent-service.mjs:209`): né `sessionId`, né `nome`, né `taskId`. I tre punti che salvano in Libreria dal giro (artefatto, `document_create`, `generate_image`) non potevano scriverla nemmeno volendo. |

Nessun'altra modifica a quel file. `git status` all'inizio del lavoro lo dava **non modificato da
nessuno**, e lo è ancora a parte queste tre righe.

`research-orchestrator.mjs:1428` è l'eccezione che il brief **autorizzava**: passa il solo
`sessionId: id` (in quel file `id` della ricerca **è** il sessionId — doc di testa, riga 21).

### 2. Il budget di ricerca web della sessione era ESAURITO (200/200)

`WebSearch` ha risposto *«this session has used its web search budget (200 of 200)»* alla prima
chiamata. **Non ho ripiegato in silenzio sulla memoria:** ho fatto la ricerca con `WebFetch` sulle
pagine ufficiali (vedi sotto, con URL e data di lettura). Se servono altre ricerche web in questa
sessione, va alzato `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`.

---

## 1. La ricerca — fonti primarie, lette il 12/09/2026

### Hermes Agent (NousResearch) — l'obiettivo da battere, per primo

- `https://raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md` (12/09/2026)
- `https://hermes-agent.nousresearch.com/docs` (12/09/2026)

**Non esiste un pannello Libreria / File / Artefatti documentato.** L'unica cosa vicina è
«📄 **Context Files** — project context files that shape every conversation». Niente su percorso,
cartella, autore o sessione d'origine di un file prodotto. Dove il README scrive un percorso lo
scrive relativo alla home (`~/.hermes/skills/openclaw-imports/`).

⇒ **Su questa funzione non c'è niente da pareggiare: è tutto +1.** (Coerente col rilievo del 10/09
già in `libreria.js`: Hermes ha un file browser della cartella di lavoro, ma nessun CRUD di libreria.)

### VS Code — dove sta il percorso, e dove NON sta

- `https://code.visualstudio.com/docs/editing/editingevolved` (12/09/2026)
- `https://code.visualstudio.com/docs/getstarted/userinterface` (12/09/2026)

Tre fatti, tutti usati:

1. «*Breadcrumbs always show the **file path***» — il percorso è informazione **persistente**, non
   un dettaglio nascosto.
2. Il percorso **intero** non sta in un fumetto: sta dietro un **comando** — «*copy the full
   breadcrumb path by right-clicking on the editor tab and selecting **Copy Breadcrumbs Path***»
   — accanto a «*Reveal in File Explorer*».
3. Per mettere la cartella accanto al nome, la forma consigliata delle etichette di scheda è
   `"${dirname}/${filename}"`, che rende `/src/orders/index.html` come **`orders/index`**: **solo la
   cartella che contiene**, non il percorso.

⇒ È esattamente ciò che l'owner ha chiesto — cartella in riga/card, percorso nel dettaglio — e il
percorso intero come **comando**, non come tooltip.

### Microsoft — come si accorcia un percorso quando lo spazio manca

- `https://learn.microsoft.com/en-us/windows/apps/design/controls/breadcrumbbar` (agg. 14/07/2026, letta 12/09/2026)

«*If the app is resized so that there is not enough space to show all the nodes, the breadcrumbs
collapse and **an ellipsis replaces the leftmost nodes***» e «*Show the current location as the last
item*».

⇒ Se un percorso si accorcia, **si taglia dalla testa e si tiene la coda**. Nel dettaglio però non si
accorcia affatto: si manda a capo (un percorso coi puntini non si incolla, e quel valore esiste per
essere copiato).

### Fonti già nel repo, riusate e non ri-cercate

- MDN, attributo `title` (agg. 17/04/2026, citata in `libreria.js` il 10/09): il fumetto nativo è
  problematico per tocco, tastiera, screen reader. Il 10/09 è stato **tolto da questa riga** perché
  copriva i filtri della pagina.
- Regola owner 10/09: più di due azioni su un oggetto ⇒ menu overflow, mai bottoni affiancati.

---

## 2. Le tre decisioni non ovvie (e perché non sono quelle ovvie)

### «La cartella» NON è la cartella padre del file

Il padre vero di una voce è `<progetto>/.harness-ui-library/lib-<uuid>/`: **uguale per ogni voce e
illeggibile**. Metterlo in riga sarebbe rumore identico su tutte le righe. La cartella che una
persona riconosce è quella del **progetto** — e in riga/card se ne mostra l'**ultimo segmento**
(`in Desktop`). Il percorso assoluto completo del file sta nel dettaglio.

### Niente `title` nativo col percorso — **contro il brief, e lo dichiaro**

Il brief chiedeva «col percorso intero nel `title`». **Non l'ho fatto**, e la ragione è scritta in
questo stesso file dal 10/09: il `title` c'era, **copriva i filtri della pagina** (il fumetto
«Relazione di prova.docx» si apriva sopra «Generati») ed è stato tolto. Un percorso è tre volte più
lungo di un nome: rimetterlo rifarebbe quel difetto **in peggio**. Il percorso intero vive nel
dettaglio e dietro il comando **«Copia percorso»**, come in VS Code. C'è un test che impedisce al
`title` di tornare.

### Niente `~` al posto della home

Un percorso abbreviato **non si incolla** in Esplora file, e su Windows la forma breve sarebbe
`%USERPROFILE%`, non `~`. Il valore serve per essere copiato: si mostra intero e si manda a capo
**dopo i separatori** (`<wbr>`, che è a larghezza zero e **non entra in ciò che si copia**).

---

## 3. Il contratto — prima e dopo

`GET /api/v1/sessions/:id/library` → `{voci: [...]}`. **Additivo**: i cinque campi di ieri escono
identici, nello stesso ordine.

```diff
  {
    id, nome, fileType, origine, aggiornatoIl,
+   cartella,   // string | null — la cartella del PROGETTO in cui vive .harness-ui-library/
+   percorso,   // string | null — il percorso ASSOLUTO del file di contenuto
+   creatoDa,   // {tipo:'persona'} | {tipo:'modello', modello, provider} | null
+   sessione,   // {id, nome|null} | null   ← null = «non registrata», MAI inventata
  }
```

`meta.json` di una voce (solo quando ci sono, mai chiavi vuote):

```diff
  { nome, mediaType, origine, creatoIl, aggiornatoIl, modello?, provider?,
+   sessionId?, sessionNome? }
```

**Ciò che NON cambia, e che è provato:**

- `elencaVoci({cartella})` **senza** `conProvenienza` esce **campo per campo identica a ieri**. È
  anche l'attrezzo `library_list` del **modello** (`agent-service.mjs:1398` → `impaginaVoci`, che
  restituisce le voci intere): accendere sempre i quattro campi nuovi avrebbe messo un percorso
  assoluto nel contesto di **ogni giro**, cambiando in silenzio il contratto verso il modello e il
  conto dei token.
- `creatoIl`, `modello` e `provider` **non escono** dalla rotta: il modello viaggia dentro `creatoDa`.

### `creatoDa` ha DUE valori, non tre — e perché

Il brief chiedeva anche `{tipo:'ricerca'}` «se distinguibile». **Non è distinguibile.**
`research-orchestrator.mjs` chiama `salvaVoce` con lo stesso `origine:'generated'` di un artefatto o
di un `document_create`; l'unico segno sul disco sarebbe il prefisso «Research - » nel **nome**, e
un prefisso nel nome non è un dato — è una stringa che chiunque rinomina. ⇒ si dice «TALOS», che è
vero, invece di indovinare. (Distinguerla vorrebbe un campo `autore` in `meta.json`, cioè una
seconda modifica a `research-orchestrator.mjs` oltre a quella autorizzata.)

---

## 4. File toccati, con le righe

### Backend

| File | Righe | Cosa |
|---|---|---|
| `harness-ui/src/library-store.mjs` | 138 | `percorsoAssolutoVoce(cartella, id)` — nuovo, esportato; gemello di `percorsoContenutoVoce` |
| | 157 | `creatoDaDiMeta()` — persona/modello letto dal meta, **mai dedotto dal nome** |
| | 174 | `sessioneDiMeta()` — `null` onesto quando il meta non la porta |
| | 241 | `elencaVoci({cartella, conProvenienza=false})` — spento di default (il modello non vede un byte diverso) |
| | 586 | `salvaVoce({…, sessionId, sessionNome})` — scritti nel `meta.json` solo se non vuoti |
| `harness-ui/src/session-registry.mjs` | 2969-2985 | **(file vietato, dichiarato)** `salvaVoceLibreriaFn` avvolta: ogni voce nasce sapendo sessione e nome |
| | 4252 | **(file vietato)** `conProvenienza: true` |
| | 4259-4273 | **(file vietato)** la proiezione porta i quattro campi nuovi, con `?? null` esplicito |
| `harness-ui/src/agent-service.mjs` | 1044, 1250, 1366 | i tre salvataggi passano `modello` (per l'immagine: `immagine?.modello \|\| modello`, che è un modello **diverso**) |
| `harness-ui/src/research-orchestrator.mjs` | 1428 | **(eccezione autorizzata)** `sessionId: id`, e nient'altro |

### Frontend

| File | Righe | Cosa |
|---|---|---|
| `harness-ui/frontend/src/components/libreria.js` | 59-99 | la testata con la ricerca e le tre decisioni |
| | 102 | `ultimaCartella()` — puro |
| | 122 | `provenienzaVoceLibreria(voce, {nomeSessione})` — puro, regge le voci senza i campi nuovi |
| | 216 | il sottotitolo della riga: `Documento · Aggiornato il … · in Desktop` |
| | 244 | «Copia percorso» — **nel menu ⋯**, non affiancato; esiste solo se il percorso c'è |
| `harness-ui/frontend/src/components/sezioni-adattatori.js` | 844 | `prov(v)` — la colla, col nome VIVO della sessione |
| | 891-895 | il piede della **scheda**: `in <cartella>` accanto alla data |
| | 975-1010 | il blocco **«Dove vive»** nel dettaglio, al posto della frase segnaposto |
| `harness-ui/frontend/src/styles/mockup-td.css` | 166 | `.td-percorso` — mono, `break-word` (**non** `anywhere`) |
| | 172 | `.td-vai-sessione` — il bottone della sessione torna in colonna |

⛔ **`index.css` NON toccato** (ci lavora un altro agente): la sola regola nuova sta in
`mockup-td.css`, e riusa `dl.td-andata`, la griglia che la Ricerca approfondita ha già.

### Banco e prove

`frontend/lab/fixtures/libreria.js`, `frontend/lab/main.js` (due pagine nuove),
`tests/library-store.test.mjs`, `tests/session-registry.test.mjs`,
`frontend/tests/unit/libreria-provenienza.test.mjs` (nuovo).

---

## 5. L'aggancio che MANCA — `legacy/app.js`, file vietato

Il brief dice: *«`legacy/app.js` (se serve un aggancio, diff nel rapporto con riga esatta)»*.
**Non l'ho applicato.** Senza, tutto si vede ma **il nome della sessione nel dettaglio non è
cliccabile** (si disegna come testo, non come bottone: il componente non disegna mai un comando che
non può funzionare) e il nome mostrato è quello **congelato** nel `meta.json` invece di quello vivo.

Il diff è tre iniezioni, **dopo la riga 5080** (`onMenu: apriMenuAzioniLibreria,` dentro
`caricaPannelloLibreria`), tutte già usate identiche dalla Ricerca approfondita alla riga 5295:

```diff
           onMenu: apriMenuAzioniLibreria,
+          /* ⭐ BC-38 (12/09) — «da quale sessione»: il nome VIVO, non quello congelato nel meta.
+             `available` è la stessa mappa che disegna la barra, riscritta a ogni giro dell'elenco. */
+          nomeSessione: (id) => {
+            const s = state.sessionSelection.available?.get?.(id);
+            return s ? (s.nome || s.taskDelega || nomeLeggibileSessione(s.taskId)) : null;
+          },
+          onApriSessione: ({ id }) => passaASessione(id),
+          copia: (testo) => copyText(testo, 'Percorso copiato'),
           rendiMarkdown: renderizzaMarkdownSemplice,
```

`nomeLeggibileSessione` è **già importato** in `app.js` alla riga 5. Nessun import nuovo.

---

## 6. Confronto testa a testa col mockup

Foto affiancabili: `00-mockup-libreria-{dark,light}.png` contro `02-righe-{dark,light}.png`, stessa
vista, stesso tema, 1440×900.

**Il mockup NON prevede il percorso.** La sua riga di Libreria è
`Documento · Aggiornato il 04/09/2026` (`talos-mockup.html:3309-3312`) e non ha né colonna di
dettaglio né provenienza; in fondo alla pagina c'è solo `.talos-where`: *«Libreria di questo
progetto. L'elenco non indica quali file sono nel contesto.»*

| Cosa | Mockup | TALOS oggi | Spiegazione |
|---|---|---|---|
| Sottotitolo della riga | `Documento · Aggiornato il …` | `Documento · Aggiornato il … · in Desktop` | **Aggiunta.** Stesso separatore `·`, stessa gerarchia, stesso colore: la cartella è un terzo membro della stessa lista, non un elemento nuovo. |
| Piede della scheda | (il mockup non ha schede in Libreria) | `Aggiornato il … ` + `in Desktop` | Due span in `.td-card-bottom`, **la stessa forma** che Note e Attività usano già lì (data + seconda misura). |
| Dettaglio | **non esiste nel mockup** | blocco «Dove vive» | Disegnato con `dl.td-andata`, la griglia etichetta/valore che il prodotto usa già nel dettaglio della Ricerca approfondita. **Zero vocabolario visivo nuovo.** |
| `title` nativo sul nome | presente (`title="DECISIONI-…md"`) | assente | Tolto il 10/09 con misura (copriva i filtri) — il mockup è più vecchio di quella scoperta. |
| Fumetto col percorso | — | assente, per scelta | Vedi §2. |

**Differenza attesa e dichiarata:** la barra dei filtri del prodotto («Cerca nel titolo e nel
contenuto», selettore d'ordinamento, interruttore schede/righe) è più ricca di quella del mockup
(«Cerca i file…», tre pillole, «Aggiorna»). Non è di BC-38: viene dai lotti precedenti.

---

## 7. Le foto — banco MIO, mai la 4174

`frontend/scripts/serve-lab.mjs` su **porta 4179** (mia), fixture del laboratorio, nessun provider
cloud, nessuna POST verso niente. **Server chiuso a fine lavoro** (PID 36552 e 18444, `taskkill`,
`/health` non risponde più). Il cancello dei componenti ha girato sul suo banco a **4186/4187**.

12 immagini in `.claude/foto-bc38-2026-09-12/`, **tutte in chiaro E in scuro**, 1440×900:

| File | Cosa mostra |
|---|---|
| `00-mockup-libreria-{dark,light}.png` | il mockup, per il confronto |
| `01-schede-{dark,light}.png` | le card: `in Desktop` nel piede; la 4ª voce (senza provenienza) **non** lo mostra |
| `02-righe-{dark,light}.png` | la vista a righe |
| `03-dettaglio-voce-nuova-{dark,light}.png` | percorso · «TALOS, generato con glm-5.3-flash» · sessione **cliccabile** |
| `04-dettaglio-voce-vecchia-{dark,light}.png` | «Non registrato…» · «Tu, caricato in Libreria» · «Non registrata: …» |
| `05-dettaglio-percorso-senza-sessione-{dark,light}.png` | percorso sì, sessione no |

### Quattro difetti trovati GUARDANDO le foto, e corretti

1. **Le foto «light» uscivano SCURE.** `temi.css` non guarda `prefers-color-scheme`: guarda
   l'attributo `data-theme` sulla radice (righe 113-170). Il solo `colorScheme` di Playwright non
   bastava. *Difetto del mio banco, non del prodotto* — ma senza accorgersene «tema chiaro e scuro
   sempre tutti e due» sarebbe stata una dichiarazione falsa.
2. **Il bottone della sessione era fuori squadra**: il suo incavo lo spingeva ~10 px più a destra di
   «Percorso» e «Creato da». Curato con `.td-vai-sessione` (`mockup-td.css:172`).
3. **Il percorso andava a capo in mezzo a una parola** — `…Desktop\.harnes / s-ui-library…`. Ho
   messo i `<wbr>` dopo ogni separatore **e non bastava**: `overflow-wrap: anywhere` rende ogni
   carattere un punto di rottura buono quanto gli altri, quindi i `<wbr>` non contavano niente.
   **Misurato nel browser invece di dedurlo** (`getComputedStyle` + `querySelectorAll('wbr').length`
   → 0 `wbr` e `anywhere`): la regex dei separatori era arrivata su disco come `[\/]` invece di
   `[\\/]`, e la regola CSS andava messa a `break-word`. Ora: 6 `<wbr>`, `textContent` **identico**
   al percorso vero (si incolla ancora).
4. **La pagina del laboratorio non leggeva il file** (404 nell'anteprima): mancava
   `leggiFile`/`rendiMarkdown`. Difetto del banco, corretto.

### Un difetto PRE-ESISTENTE, registrato e NON toccato

Nella vista a righe della sezione Libreria il **nome del file si sovrappone al timbro
«Generato»/«Caricato»** (`02-righe-*.png`). **Non è di BC-38:** riprodotto identico sulla pagina
`SezioneLibreria_elenco`, che usa la fixture vecchia senza nessun campo nuovo. Vive nella vista
`elenco` di `sezione-elenco-dettaglio.js`. Lo registro, non lo correggo: non è questa fase.

---

## 8. I test — con i numeri

| Suite | Comando | Esito |
|---|---|---|
| Backend, tutta | `node --test tests/*.test.mjs` | **2548 / 2548** |
| Frontend, unità | `npm run test:unit` | **956 / 956** |
| Parità componenti + runtime | `TALOS_LAB_PORT=4186 TALOS_ASPETTO_PORT=4187 npx playwright test --config=playwright.componenti.config.mjs --project=desktop-1440x900` | **49 / 49**, incluso `RUNTIME-01` (nessun errore JavaScript) e `COMP LibraryRow` (pixel col mockup) |
| Build | `npm run build`, `npm run build:lab` | 32 asset, verdi |

⛔ **`verify:all` non lanciato**, come da brief (e comunque la porta 4177 era occupata da un altro
banco).

### I test nuovi — sempre nei due versi

**`tests/library-store.test.mjs`** (+6, 50/50 nel file):
`percorsoAssolutoVoce` e il suo `null` per un id fuori grammatica · una voce **nuova** (percorso,
cartella, `creatoDa`, `sessione`, e il legame verificato **sul disco** in `meta.json`) · **AL
CONTRARIO** una voce **vecchia** nella forma esatta che c'è oggi sul Desktop dell'owner (`sessione:
null`, `modello: null`) · un `sessionId` fatto di spazi **non** conta come sessione e non lascia
chiavi vuote nel meta · **senza** `conProvenienza` l'elenco del modello ha esattamente le nove
chiavi di ieri · **AL CONTRARIO** un `meta.json` malformato ferma l'elenco **allo stesso modo** con
e senza provenienza.

**`tests/session-registry.test.mjs`** (+2, e 1 aggiornato, 321/321):
il kernel salva e la voce nasce già con `sessionId` + `sessionNome`, e il resto della voce arriva
identico · **AL CONTRARIO** una sessione senza nome passa l'id e `sessionNome: null` — mai il
`taskId` travestito da nome. Il test del contratto (`elencaLibreria`) è stato **aggiornato**, non
allentato: continua a pretendere che `creatoIl` e `modello` **non escano**.

**`frontend/tests/unit/libreria-provenienza.test.mjs`** (nuovo, 9/9):
`ultimaCartella` e la radice di disco · la voce nuova · **AL CONTRARIO** la voce vecchia che non
inventa niente · il nome **vivo** batte il congelato, e senza elenco vivo si torna al congelato ·
il sottotitolo porta **solo** la cartella, **nessun `title` nativo** e il percorso intero **non
compare** nella riga · **AL CONTRARIO** senza provenienza il sottotitolo è quello di ieri, identico
· «Copia percorso» c'è col percorso e **non c'è** senza (le altre cinque voci restano nell'ordine di
ieri) · chi inietta `copia` non riceve un secondo messaggio · **AL CONTRARIO** appunti negati ⇒ la
riga dice **come fare**, non «non riuscito».

---

## 9. Cosa NON ho verificato

- **Il giro vero sul 4174.** Non l'ho toccato. Quindi **non ho visto** una voce nascere da un giro
  vero con `sessionId` nel suo `meta.json`: la catena è provata dal test del registro, non dal vivo.
- **L'aggancio in `legacy/app.js`** (§5): non applicato ⇒ nel prodotto la sessione **non è ancora
  cliccabile** e il nome è quello congelato. Il resto (percorso, cartella, creato da) si vede già.
- **Le 14 voci già sul disco dell'owner** resteranno per sempre senza sessione e senza modello: il
  `meta.json` non li ha e non si possono ricostruire. A schermo lo dicono.
- **Le viewport 1024×800 e 1280×800**: le foto sono a 1440×900 (il cancello dei componenti è
  passato su tutte e tre, ma non ho **guardato** le immagini alle altre due).
- **`verify:all`** e la suite `test:componenti` completa sulle tre viewport.
- **Il tasto destro** sulla riga con la voce «Copia percorso»: provato via `vociMenu()` (è la stessa
  lista), non con un click destro vero nel browser.

---

## 10. Proposta di messaggio di commit

```
feat(libreria): un file dice DOVE vive, CHI l'ha fatto e da QUALE sessione

Owner 12/09: «mettere il percorso dei file nella Libreria. Nel dettaglio (sidebar)
e nella card/riga SOLO la cartella; nel dettaglio sidebar anche da chi sono stati
creati e da quale sessione».

Prima: l'elenco mandava cinque campi e il dettaglio chiudeva con una frase uguale
per tutti i file — «Il file vive in .harness-ui-library/, dentro il progetto» —
che è la cartella INTERNA, illeggibile e non incollabile. Da chi venisse un file
non si poteva sapere: 14 voci su 14 sul disco non portano né modello né sessione,
e `salvaVoce` non salvava nessun legame con la conversazione.

Adesso la rotta porta quattro campi in più (additivi: i cinque di ieri escono
identici), `meta.json` registra sessionId/sessionNome da oggi, e le voci vecchie
restano leggibili con `sessione: null` — mai una sessione inventata.

Ricerca prima di scrivere (12/09/2026, WebFetch: il budget WebSearch della
sessione era esaurito, 200/200):
· NousResearch/hermes-agent, README + hermes-agent.nousresearch.com/docs —
  nessun pannello Libreria documentato, solo «Context Files»: niente da pareggiare.
· VS Code, docs/editing/editingevolved + docs/getstarted/userinterface —
  «Breadcrumbs always show the file path»; il percorso INTERO sta dietro un
  comando («Copy Breadcrumbs Path»), non in un fumetto; le etichette di scheda
  usano ${dirname}/${filename}, cioè SOLO la cartella che contiene.
· Microsoft, BreadcrumbBar (agg. 14/07/2026) — quando lo spazio manca «an
  ellipsis replaces the leftmost nodes»: si taglia dalla testa, mai dalla coda.
· MDN, attributo title (già citato qui il 10/09) — niente fumetto nativo.

⛔ `elencaVoci` resta SPENTA di default sulla provenienza: è anche `library_list`
   del modello, e accenderla sempre metterebbe un percorso assoluto nel contesto
   di ogni giro.
⛔ Tre righe in session-registry.mjs (file che il brief vietava): senza, la rotta
   non proietta i campi nuovi e nessuna voce può sapere la sua sessione —
   `avviaSessione` non riceve nessuna identità di sessione (agent-service.mjs:209).
⛔ Manca l'aggancio in legacy/app.js (vietato): la sessione non è ancora
   cliccabile. Diff esatto nel rapporto.

Prove: 2548/2548 backend, 956/956 unità frontend, 49/49 parità (RUNTIME-01 e
LibraryRow compresi), nei due versi su voce nuova e voce vecchia.
Foto chiaro+scuro 1440x900 su banco proprio (4179), mai la 4174.
Rapporto: .claude/RAPPORTO-BC38-LIBRERIA-PERCORSO-2026-09-12.md
```

---

## Cosa devi fare tu

1. **Guardare le foto** in `.claude/foto-bc38-2026-09-12/` (le `03`, `04`, `05` sono il cuore) e
   dire **sì o no** al testo: «Tu, caricato in Libreria» · «TALOS, generato con glm-5.3-flash» ·
   «Non registrata: il file è stato salvato prima che TALOS annotasse la conversazione d'origine».
2. **Le tre righe in `session-registry.mjs`**: le tengo o le tolgo? Se le togli, la funzione non
   esiste. (§Due cose da leggere prima del resto.)
3. **L'aggancio in `legacy/app.js`** (§5, sei righe): lo applico io o lo fa chi possiede quel file?
   Finché non c'è, la sessione nel dettaglio è testo e non un collegamento.
4. Il **push**, quando vuoi: nessun `git add/commit/push` fatto.

## Cosa faccio io

Niente, senza un tuo sì: il lavoro è su disco, provato e fotografato. Se dici sì al punto 3 lo
applico e rifaccio foto e cancello in un giro.

## Cosa rimane

- **Sessione non cliccabile** finché manca l'aggancio in `legacy/app.js`.
- **`creatoDa: {tipo:'ricerca'}` non implementato**: non è distinguibile senza un campo nuovo in
  `meta.json` (§3).
- **Le 14 voci già sul disco** restano senza modello e senza sessione, per sempre: il dato non c'è.
- **Nessun giro vero** sul 4174 ⇒ il legame sessione↔file è provato dal test, non dal vivo.
- **Debito registrato, non mio:** nella vista a righe della Libreria il nome del file si sovrappone
  al timbro «Generato»/«Caricato» — pre-esistente, in `sezione-elenco-dettaglio.js`.
- Viewport 1024×800 e 1280×800 **non guardate a occhio** (il cancello ci è passato).
