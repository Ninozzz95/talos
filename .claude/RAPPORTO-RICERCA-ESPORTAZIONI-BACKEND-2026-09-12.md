# Le esportazioni della ricerca approfondita — il BACKEND

Lane `lane/harness-desktop`, 12/09/2026. Owner: «la ricerca approfondita deve avere una suite di
esportazioni **COMPLETA**».

⛔ Nessun giro col modello, nessuna richiesta alla 4174, nessun `git`, nessuno screenshot.
⛔ Nessun file di `frontend/`, di `src/kernel/` o di `src/research-orchestrator.mjs` toccato.
⛔ Nessuna deviazione dall'elenco dei file: due file nuovi in `src/research/`, due nel `tests/`,
tre punti in `src/http-app.mjs`.

⭐ **Aggiunto il 12/09, su ordine del coordinatore dopo la consegna del lotto**: la cura del
difetto §6.2 (`src/research-store.mjs` + il suo test), che bloccava il secondo giro vero di L8.
Sta in **§8**, e §6.2 resta com'era scritto — la diagnosi non si riscrive a posteriori.

⭐⭐ **E il 12/09, terza consegna**: il difetto «integro ≠ bello» che §7 aveva **dichiarato** e
nessuno aveva guardato — il Markdown del rapporto stampato invece che reso. Trovato da una FOTO
del coordinatore, non da un test. Sta in **§9**, con le foto prima/dopo.

---

## 1. Cosa c'era, prima

| fatto | prova |
|---|---|
| di esportazioni ce n'erano **tre**, e tutte e tre **nel browser** | `frontend/src/components/ricerca-dettaglio.js:1183-1187`: `Esporta` (md), `bibtexDaCitazioni`, `risDaCitazioni`, salvate con `scaricaTesto` → `<a download>` |
| le due funzioni di citazione erano **riscritte** nel frontend | il commento a `:34-36` lo dichiara: «il mobile è in TypeScript e NON è nel bundle del frontend desktop … le esportazioni sono riscritte in JS in questo file» ⇒ **due** implementazioni della stessa cosa |
| il backend aveva già `src/research/citations.mjs` | porto fedele di `researchCitationExport.ts`, **con i suoi test** (`tests/research/citations.test.mjs`) e **nessun chiamante di prodotto** |
| il PDF a tre toni esisteva **solo sul mobile** | `mobile/src/lib/research/researchPdf.ts`, 246 righe, dipende da `@/lib/documents/reportBuilder` |
| il desktop aveva già i generatori veri | `src/document-generator.mjs` (pdf via `pdfmake` + `document-report.mjs`, docx via `docx`, xlsx, pptx, html) e `verifyTalosDocument` che li **riapre** |
| i due non si erano mai incontrati | nessun import di `document-generator.mjs` da `src/research/`, nessun import di `citations.mjs` da nessuna parte |
| di rotte, la Ricerca ne aveva **sei** | `ROTTE_API`: elenco, voce (GET/DELETE), tre azioni (POST). Nessuna serviva byte |

---

## 2. Ricerca web PRIMA di scrivere — fonte + data, e cosa ha cambiato il codice

⚠️ **`WebSearch` era esaurito** (200/200 per questa sessione): tutto preso con **`WebFetch`
diretto** su fonti primarie, letto il **12/09/2026**.

| # | fonte | cosa ha cambiato |
|---|---|---|
| **S1** | **RFC 6266**, `Use of the Content-Disposition Header Field in HTTP` — <https://www.rfc-editor.org/rfc/rfc6266.html> | Conferma la forma già in uso qui («recipients SHOULD pick `filename*` and ignore `filename`»). ⛔ **Ma il vincolo che ha cambiato il codice è un altro**, e non lo conoscevo: il destinatario deve «strip all but the last path segment» e «ignore or substitute names» con significato nel filesystem — «`..`», «`~`», i nomi di dispositivo. ⇒ `nomeSicuroDiEsportazione` **non si fida** di `talosSafeFileStem` da solo: quello toglie `/ \ : " * ? < > |` ma il punto **non è un carattere vietato**, quindi `..` gli sopravvive |
| **S2** | **MDN, `Content-Disposition`** — <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition> | «avoid percent escape sequences in `filename`, because they are handled **inconsistently across browsers** (Firefox and Chrome decode them, while Safari does not)». ⇒ il ripiego ASCII **non deve contenere `%`**. `nomiPerContentDisposition` già sostituisce con `_` invece di percent-codificare: la ricerca ha **confermato una scelta esistente** invece di farne scrivere una seconda — e ha prodotto l'asserzione `assert.doesNotMatch(ascii, /%/)` che prima non c'era |
| **S3** | **DOI Citation Formatter** (ex crosscite) — <https://citation.doi.org/docs.html> | I tipi per la negoziazione di contenuto sono **`application/x-bibtex`** e **`application/x-research-info-systems`**, usati da Crossref, DataCite e mEDRA ⇒ sono quelli che manda la rotta, **gli stessi** che il frontend usa già nel suo `<a download>`. Due risposte diverse per lo stesso `.bib` lo farebbero aprire a due programmi diversi |
| **S4** | **IANA Media Types registry** — <https://www.iana.org/assignments/media-types/media-types.xhtml> | Né BibTeX né RIS sono **registrati**: non esiste un `application/bibtex`. ⇒ il prefisso `x-` è una necessità, non una pigrizia, ed è scritto accanto al codice perché nessuno lo «corregga» domani |

⭐ **E prima ancora, dentro il proprio codebase** (lezione 06/09, «chi guarda da fuori inventa
quello che dentro aveva già»): `citations.mjs` c'era già ed è stato **riusato**, non riscritto;
`document-generator.mjs`/`document-report.mjs` c'erano già e impaginano loro il PDF;
`nomiPerContentDisposition` c'era già (PO-05, 10/09) e non ne è nata una seconda copia;
`talosSafeFileStem` c'era già. Le uniche righe nuove sono quelle che **non esistevano**.

---

## 3. La rotta e i moduli, file:riga

### 3.1 `src/http-app.mjs` — tre punti, e nient'altro

| dove | cosa |
|---|---|
| `:36` | import di `FORMATI_ESPORTAZIONE` e `costruisciEsportazione`. ⛔ Solo la porta e l'elenco dei nomi: **nessun formato, nessuna estensione, nessun `Content-Type`** è scritto in questo file |
| `:798-810` | `parseEsportaRicercaQuery` — allowlist di **due** chiavi (`formato`, `tono`), niente ripetizioni, tetto di 1024. Stessa forma di `parseTreeQuery`/`parseModelsQuery`. ⛔ La validazione del **valore** non è qui: è in `esportazioni.mjs`, che è l'unico che sa costruirli |
| `:998` | la riga dell'inventario: `…/research/:id/esporta` → `['GET']`. Riga **sua**, non unita alle tre azioni: scaricare non cambia niente sul disco, e unirle farebbe dire all'`Allow` che una ricerca si esporta con una POST |
| `:2969-3054` | il blocco della rotta: query letta **prima** di toccare il disco, sessione verificata con `esiste`, id validato con `idRicercaValido`, `formato` obbligatorio, scheda letta con la **stessa** `leggiRicerca` della GET del dettaglio, byte spediti con `res.writeHead` + `res.end` |

⛔ **La rotta non passa da `sendJson`, e non può**: un `.pdf` e un `.docx` dentro un JSON
andrebbero ricodificati — cioè spediti due volte o corrotti. Stessa forma di risposta binaria già
usata da `GET …/sessions/:id/file` (PO-05) e dalle immagini di chat: `attachment`, `nosniff`,
`Cache-Control: private, no-store`, `Content-Security-Policy: default-src 'none'; sandbox`. ⛔ Per
l'`html` non è prudenza generica: quel file è HTML per davvero e contiene testo preso dal web.

### 3.2 `src/research/esportazioni.mjs` — 513 righe, il posto dove vivono i formati

| dove | cosa |
|---|---|
| `:67-74` | `EsportazioneRicercaError` — porta un `code` che la rotta traduce in uno stato. Due soli codici, **entrambi già esistenti** (`RESEARCH_INVALID` 400, `RESEARCH_CONFLICT` 409): nessun vocabolario nuovo, nessuna voce nuova in `public-problem.mjs` |
| `:86-106` | l'inventario `FORMATI`, e il campo che decide tutto: **`vuoleIlRecord`** |
| `:113` | `DICITURA_SENZA_VERIFICHE` — la frase, **una sola, in un posto solo** |
| `:130-141` | `nomeSicuroDiEsportazione` — puro, provato senza server (vedi S1) |
| `:183` | `recordDellaScheda` → `talosResearchParseReport`: **il lettore del record è UNO** |
| `:196-206` | `citazioniDaRecord` — quattro campi e nient'altro (la privacy di `researchCitationExport.ts`, rispettata: **la domanda non esce** in una bibliografia) |
| `:213-399` | i costruttori: `testoMarkdown`, `testoJson`, `testoFonti`, `testoHtml` |
| `:400-426` | `specPdf` — il tono, o il ripiego onesto |
| `:430-513` | `costruisciEsportazione`, la porta sola |

### 3.3 `src/research/pdf.mjs` — 277 righe, porto di `researchPdf.ts`

Puro come il suo originale: il documento si prova **senza pdfmake**. `:50` i tre toni, `:53` il
predefinito, `:92` `talosResearchPdfTally`, `:258` `talosResearchPdfSpec`.

---

## 4. IL CONTRATTO PER IL FRONTEND

### 4.1 L'indirizzo

```
GET /api/v1/sessions/<sessionId>/research/<ricercaId>/esporta?formato=<…>[&tono=<…>]
```

⛔ **Nessuna query oltre queste due.** Una terza chiave, una ripetuta o un valore oltre 1024
caratteri ⇒ **400 `QUERY_INVALID`**. `formato` è **obbligatorio**: senza, 400 — non c'è un
predefinito silenzioso, perché un file consegnato senza che nessuno abbia detto quale è un file
che qualcuno aprirà credendolo un altro.

### 4.2 Gli otto formati

| `formato` | `Content-Type` | nome file | vuole il record? | cosa contiene |
|---|---|---|---|---|
| `md` | `text/markdown; charset=utf-8` | `<domanda>.md` | no | il rapporto **com'è**, recinto ```` ```talos-research-report ```` compreso — è ciò che lo rende ri-verificabile |
| `html` | `text/html; charset=utf-8` | `<domanda>.html` | no | pagina autonoma, CSS incorporato, **nessuno script**, tema chiaro **e** scuro, bilancio + affermazioni coi verdetti + fonti |
| `pdf` | `application/pdf` | `<domanda>.pdf` | no | i tre toni (vedi 4.3), impaginato da `document-report.mjs` |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `<domanda>.docx` | no | la prosa **senza** il recinto (un blocco di JSON dentro un documento impaginato è una pagina sprecata) |
| `json` | `application/json; charset=utf-8` | `<domanda>.json` | **sì** | `{schema:'talos.research.export.v1', ricerca:{…}, record:{…}}` — vedi 4.4 |
| `bib` | `application/x-bibtex; charset=utf-8` | `<domanda>.bib` | **sì** | una voce `@misc` per fonte, chiavi distinte, `year` solo se la data c'è |
| `ris` | `application/x-research-info-systems; charset=utf-8` | `<domanda>.ris` | **sì** | un record `TY - ELEC … ER - ` per fonte |
| `fonti` | `text/markdown; charset=utf-8` | `<domanda>`**`-fonti`**`.md` | **sì** | titolo, indirizzo, data dichiarata, come è stata ottenuta, **e i passaggi citati** raggruppati sotto la loro fonte |

### 4.3 I toni del PDF

`tono=report` (predefinito) · `tono=brief` · `tono=dossier`.

⛔ **`tono` si accetta SOLO con `formato=pdf`.** Su qualunque altro ⇒ **400**: accettarlo in
silenzio lascerebbe credere che esistano tre bibliografie diverse.
⛔ I tre sono **documenti diversi**, non tre tavolozze — misurato: `brief` sta su **1 pagina**
(niente copertina, per scelta misurata sul Pad il 04/08), `report` su più di una, e i tre file
hanno tre dimensioni diverse.

### 4.4 Il JSON, verbatim

```json
{
  "schema": "talos.research.export.v1",
  "ricerca": {
    "id": "…", "domanda": "…", "titolo": "…", "stato": "done", "modello": "…",
    "avviataAlle": "…", "conclusaAlle": "…",
    "bilancio": { "totali": 2, "sostenute": 1, "inParte": 0, "nonSostenute": 1, "contese": 0, "nonVerificate": 0 },
    "proveDistinte": 2,
    "spesa": { "tokens": 0, "searches": 0, "pages": 0 },
    "giudice": "…"
  },
  "record": { "version": 1, "question": "…", "summary": "…", "judge": "…", "claims": [ … ], "sources": [ … ] }
}
```

⛔ `bilancio` e `spesa` **non si ricalcolano**: sono quelli della scheda, cioè quelli che la
sezione mostra a schermo. Un file che dicesse numeri diversi da quelli sotto gli occhi di chi lo
scarica sarebbe la peggiore delle due verità.

### 4.5 Il nome del file

Nasce dalla **domanda della ricerca** — mai da qualcosa che il chiamante possa scrivere: le uniche
due cose che arrivano dalla query sono `formato` e `tono`, due allowlist chiuse. Passa da
`talosSafeFileStem` (60 byte UTF-8, taglio su confine di parola) **più** la difesa di RFC 6266
contro i nomi che sono percorsi. Esce nelle **due forme**:

```
Content-Disposition: attachment; filename="<ascii>"; filename*=UTF-8''<percent-encoded>
```

### 4.6 Gli errori

| stato | codice | quando |
|---|---|---|
| 400 | `RESEARCH_INVALID` | `formato` mancante, formato o tono che non esistono, `tono` su un formato diverso da `pdf`, id di ricerca che non può essere un nome di cartella |
| 400 | `QUERY_INVALID` | una chiave di query fuori dalle due, o ripetuta |
| 404 | `NOT_FOUND` | la **sessione** non esiste |
| 404 | `RESEARCH_NOT_FOUND` | la sessione c'è, la **ricerca** no (e il messaggio per la persona è «Questa ricerca non esiste più», non «problema imprevisto») |
| 405 | `METHOD_NOT_ALLOWED` | qualunque metodo diverso da GET, con `Allow: GET, HEAD` |
| 409 | `RESEARCH_CONFLICT` | `json`/`bib`/`ris`/`fonti` su una ricerca **senza record verificabile**; oppure qualunque formato su una ricerca che non ha ancora prodotto niente |

⛔ **Il 409 e non un file vuoto.** Un `.bib` di zero voci, o un JSON con `record: null`, consegnato
in silenzio è il segno di verifica falso che tutto il disegno della ricerca esiste per togliere:
chi lo riceve crede di avere una bibliografia e ha un file vuoto.
⛔ **Ma la prosa depositata non si butta**: su una ricerca `senza-rapporto`, `md`, `html` e `pdf`
escono **200** con la dicitura **«Rapporto SENZA VERIFICHE: …»** in testa.

### 4.7 HEAD — misurato, non dedotto

Una `HEAD` sulla rotta **non viene servita**: cade sul 404, esattamente come sulla rotta sorella
`GET …/sessions/:id/file` (stesso guardiano `method === 'GET'`). L'`Allow` del 405 dice
`GET, HEAD` perché l'inventario aggiunge HEAD a ogni rotta GET. Non è una svista di questo lotto ed
è il comportamento che il server ha già su **ogni** risposta binaria: cambiarlo qui da solo
creerebbe due rotte gemelle che rispondono diverso. ⇒ **per sapere la dimensione, si fa una GET.**

---

## 5. Le prove

`node --test tests/*.test.mjs tests/research/*.test.mjs` — **2808 test, 2808 verdi, 0 rossi**
(due corse di fila). Le 20 nuove:

### `tests/research/pdf.test.mjs` — 11 test, il modulo puro

Gli **otto** casi di `mobile/tests/unit/research/researchPdf.test.ts` tradotti da vitest a
`node:test`, più tre che il mobile non poteva avere. ⛔ **La fixture non è scritta a mano**: passa
da `talosResearchReportDocument` → `talosResearchParseReport`, cioè dallo scrittore e dal lettore
veri del prodotto.

### `tests/http-routes-research-esportazioni.test.mjs` — 9 test, dalla porta vera

Server vero su porta libera, registro vero (`createSessionRegistry`), magazzino vero su disco
**temporaneo**, ricerca avviata da `onRicercaAvvia` (la porta del modello). ⛔ Mai la 4174, mai un
giro col modello, mai la rete (`leggiPaginaFn` iniettata anche dove non serve).

1. **tutti e otto** i formati → 200, con il loro `Content-Type`, la loro estensione, `nosniff`,
   `no-store`, `attachment`. ⛔ E il corpo **si rilegge**, non si guarda la lunghezza: pdf → magic
   `%PDF-` **e** `PDFDocument.load().getPageCount() > 0`; docx → magic `PK` **e** `jszip` apre
   `word/document.xml` con `<w:p>` dentro; json → `JSON.parse` e i campi; bib → `@misc{` contato;
   ris → `TY  - ELEC` e `ER  - `; md → il recinto; html → `<!doctype`, nessun `<script`,
   `prefers-color-scheme`, i verdetti, i passaggi, il bilancio; fonti → url, data, passaggi.
   ⛔ Il test **asserisce che l'elenco dei formati provati è ESATTAMENTE `FORMATI_ESPORTAZIONE`**:
   un formato nuovo senza la sua riga sarebbe un formato mai provato.
2. i **tre toni** → tre PDF che si riaprono, `brief` di 1 pagina, `report` di più, tre dimensioni
   diverse; e senza `tono` esce il predefinito.
3. **verso contrario** — formato/tono inesistenti, `formato=PDF` (maiuscolo), `formato=` vuoto,
   `formato=../../etc/passwd`, `formato` mancante, `tono` su `bib` → **400 `RESEARCH_INVALID`**.
4. **verso contrario** — `percorso=`, `nome=`, `formato` ripetuto → **400 `QUERY_INVALID`**.
5. ricerca **senza record** → 409 per json/bib/ris/fonti (con motivo, e l'`explanation` che non
   dice «imprevisto»), 200 con «SENZA VERIFICHE» per md/html/pdf.
6. ricerca che non ha prodotto **niente** → 409 su tutti e otto.
7. 405 con `Allow: GET, HEAD`; HEAD → 404 (misurato); i due 404 distinti; tre id ostili → 400.
8. il nome nelle **due forme** di RFC 6266: niente `%` nel ripiego, niente byte fuori ASCII,
   accenti nella forma UTF-8, **nessun separatore di percorso** in nessuna delle due.
9. **verso contrario, puro** — nove domande patologiche (`..`, `.`, `../../etc/passwd`, `   ..   `,
   `....`, `''`, `null`, `/`, `\\server\share`) e nessuna produce un nome che cominci per punto o
   contenga un separatore.

---

## 6. Le due cose trovate per strada — APERTE, non curate

### 6.1 ⛔⛔⛔ `researchPdf.ts` (mobile) sbaglia l'indice della fonte — e il suo test non lo vede

`mobile/src/lib/research/researchPdf.ts:137` e `:217` fanno `report.sources[claim.sourceIndex]`.
**Ogni altro lettore dello stesso record** — sul mobile e qui — fa `sources[claim.sourceIndex - 1]`:

- `researchReport.ts:128` (e il nostro `report.mjs`, la prosa del rapporto)
- `researchRecheck.ts:114` · `researchSynthesis.ts:254` · `researchVerification.ts:397,422`

⇒ Sul mobile **ogni affermazione del PDF è attribuita alla fonte SEGUENTE**, e l'ultima cade su
«—». Il suo test non lo vede perché la sua fixture numera `sourceIndex` **da 0**, cioè con una
convenzione che nessun motore produce.

⛔ **Non l'ho portato.** `src/research/pdf.mjs` usa `- 1`, lo dichiara in testa al file, e
`tests/research/pdf.test.mjs` ha un test che lo morde con un record vero
(`['Percy Spencer','Percy Spencer','altro.example.org','altro.example.org']`, nessun «—»).
🔜 **Sul mobile resta aperto**: non ho ownership lì, si segnala e non si corregge.

### 6.2 ⛔⛔⛔ Su Windows un LETTORE fa fallire la scrittura atomica del magazzino delle ricerche

Trovato eseguendo la suite intera, non ragionandoci sopra:

```
EPERM: operation not permitted, rename '…/meta.json.tmp-…' -> '…/meta.json'
  at scriviAtomico (src/research-store.mjs:232)   ← dentro onConclusioneRicerca
```

⛔ **Non fallisce il lettore: fallisce lo SCRITTORE.** Su Windows `MoveFileEx` su una destinazione
che qualcuno ha aperta non riesce, e `scriviAtomico` **non ritenta** — il `catch` pulisce il
temporaneo e **rilancia**, per una scelta dichiarata e giusta in sé («un errore inghiottito qui
vorrebbe dire *salvato* su una voce mai salvata»). ⇒ la conclusione della ricerca esplode e la voce
**resta `running` sul disco per sempre**.

⛔⛔ **E il lettore concorrente non è un'invenzione del banco**: la sezione Ricerca del frontend
interroga l'elenco e la scheda **mentre** una ricerca gira. Questo è un difetto di **prodotto**, non
di test.

- **Riprodotto** due volte su tre corse della suite intera, mai eseguendo il file da solo: è una
  gara, e la vince chi ha il disco più lento.
- **La cura** sta in `src/research-store.mjs` — un ritento limitato sul `rename` per `EPERM`/`EBUSY`,
  qualche decina di millisecondi, con l'errore rilanciato se non passa. Quattro righe.
- ✅ **CURATO il 12/09**, su ordine del coordinatore («blocca il secondo giro vero di L8»): vedi
  **§8**. Il ripiego di banco (60 ms invece di 10) è stato **tolto**: la cadenza che rompeva è
  tornata a 10 ms ed è adesso la prova che la cura regge.

---

## 7. Cosa NON ho verificato

- ⛔ **Niente di visivo.** Nessuno ha **aperto** un `.pdf`, un `.docx` o l'`.html` esportato per
  guardarlo: le prove dicono che i file sono **integri e rileggibili**, non che siano **belli** o
  che l'impaginazione dei tre toni regga su una ricerca vera da trenta affermazioni. Il `brief` su
  una pagina è misurato (`getPageCount() === 1`), ma su una fixture da 4 affermazioni.
  > ⛔⛔⛔ **E infatti era rotto.** Questa riga ha retto meno di un giorno: il coordinatore ha
  > guardato l'HTML di una ricerca vera e il rapporto usciva come **testo grezzo**. Curato in
  > **§9**. ⇒ Una riga in «cosa NON ho verificato» non è una assoluzione: è un difetto con la data.
- ⛔ **Nessun giro col modello e nessuna richiesta alla 4174**: tutte le ricerche di prova sono
  concluse da un `avviaSessioneFn` finto. Una ricerca **vera** — con affermazioni lunghe, url
  lunghi, titoli con emoji, fonti irraggiungibili — non è passata da qui.
- ⛔ **Il frontend non è agganciato.** La rotta esiste e risponde; il menu della sezione continua a
  costruire md/bib/ris nel browser. Chi fa il lotto del frontend deve **togliere** quelle tre vie e
  puntarle qui, altrimenti restano due implementazioni che divergono (è il difetto di partenza,
  solo spostato).
- ⛔ **`xlsx` e `pptx` non ci sono**, e non è una dimenticanza: l'owner ha chiesto una suite
  completa di **esportazioni della ricerca**, e una ricerca approfondita non è un foglio di calcolo
  né una presentazione. `document-generator.mjs` li sa fare: se servono, è una riga nell'inventario
  `FORMATI` più il costruttore delle righe — ma vanno chiesti.
- ⛔ **Nessuna prova di carico**: un rapporto con cento fonti produce un `.pdf` e un `.html` che non
  ho misurato, e la rotta **non ha un tetto** sulla dimensione della risposta (la rotta sorella dei
  file del workspace ne ha uno, 64 MB, ma lì i byte vengono dal disco: qui si generano).
- ⛔ **La Libreria non c'entra**: un'esportazione **non** viene depositata da nessuna parte, esce e
  basta. Era fuori dal lotto.

---

## 8. LA CURA DEL DIFETTO 6.2 — il rename che ritenta (12/09/2026, seconda consegna)

> Ordine del coordinatore dopo il commit del lotto: «il difetto 2 lo curi tu, ora, perché blocca
> il secondo giro vero di L8». Solo `src/research-store.mjs` e il suo test.

### 8.1 La riproduzione, prima di qualunque riga

Sei righe, disco vero, deterministica:

```js
const h = fs.openSync(meta, 'r');   // un LETTORE qualunque, in SOLA lettura
fs.renameSync(tmp, meta);           // → EPERM: operation not permitted, rename
```

Senza il lettore aperto lo **stesso** rename riesce. ⇒ non è il disco, non è un permesso: è la
contesa. Su Windows `MoveFileExW` non sostituisce una destinazione che qualcun altro tiene aperta,
e libuv apre i file **senza** `FILE_SHARE_DELETE` — anche in sola lettura.

⛔ Misurato anche il caso gemello: `rename` di un file **su una cartella esistente** dà lo stesso
`EPERM`. È il motivo per cui il ritento deve avere una fine: lo stesso codice esce sia da una
contesa che passerà, sia da un'operazione che non riuscirà mai.

### 8.2 Ricerca web PRIMA di scrivere — fonte + data

| # | fonte | cosa ha cambiato |
|---|---|---|
| **S5** | **graceful-fs, `polyfills.js`** (isaacs) — <https://raw.githubusercontent.com/isaacs/node-graceful-fs/main/polyfills.js>, letto il 12/09/2026 | I tre codici da ritentare: **`EACCES`, `EPERM`, `EBUSY`** — «on Windows, A/V software can lock the directory, causing this to fail with an EACCES or EPERM if the directory contains newly created files». ⛔ **Il vincolo che non conoscevo e che ha cambiato il codice**: si aspetta con `setTimeout` e **mai** con un ciclo stretto, perché «Windows scheduling gives CPU to a busy looping process, which can cause the program causing the lock contention to be **starved of CPU** by node, so the contention doesn't resolve» — un ritento che gira a vuoto **impedisce** al lettore di chiudere il suo handle: la cura diventerebbe la causa. ⛔ **E una cosa che NON si copia**: graceful-fs, prima di ogni ritento, controlla che la destinazione non esista e in tal caso si ferma — serve al caso di npm, dove la destinazione *non deve* esserci; qui la destinazione esiste **sempre** (stiamo sostituendo `meta.json`), e copiarlo avrebbe fatto uscire ogni ritento al primo giro. ⛔ La sua finestra è di **60 secondi** (per «Parity bit9, [which] may lock files for up to a minute»): qui sarebbero 60 s di schermo fermo dentro una richiesta HTTP |
| **S6** | **MoveFileExW / `MOVEFILE_REPLACE_EXISTING`** — <https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw>, riletta il 12/09/2026 | Sostituisce «provided that security requirements regarding access control lists (ACLs) are met»; «to delete or rename a file, you must have either delete permission on the file or delete child permission in the parent directory». ⛔ **Va detto quello che NON dice**: la pagina non nomina gli handle aperti né l'errore che ne esce. Il legame «lettore aperto ⇒ EPERM» non viene da lei — viene dalla riproduzione di §8.1 e dal test che la esegue su disco vero |
| **S7** | **Node, `fs.rename` / `fsPromises.rename`** — <https://nodejs.org/docs/latest/api/fs.html> | ⚠️ Lettura **NON riuscita**: la pagina è tornata troncata da `WebFetch` due volte e le sezioni dei due metodi non si sono lette alla lettera. Segnato come lettura mancata, non come lettura fatta |

### 8.3 Il codice

**`src/research-store.mjs`**

| dove | cosa |
|---|---|
| `:222-272` | il blocco che spiega il difetto, la riproduzione e le tre fonti |
| `:273-277` | le costanti: **10 tentativi**, attesa iniziale **20 ms**, tetto **200 ms**, i **tre** codici di contesa |
| `:279` | `SUFFISSO_NON_RINOMINATO` — il nome dichiarato, esportato perché il test lo nomini invece di ricopiarlo |
| `:292-311` | **`rinominaConRitento`** — esportata e provabile da sola; `attendiFn` e `tentativiRename` iniettabili |
| `:313-363` | `scriviAtomico`, ora in **due** `try` separati |

**Le attese**: 20, 40, 80, 160, poi 200 fisso — nove attese su dieci tentativi, **1,3 s** in tutto.
Sotto i 2 s per costruzione, e il test lo somma invece di crederci.

**Le tre decisioni che non erano scontate:**

1. **Un codice che non è di contesa non si ritenta nemmeno una volta.** Aspettare 1,3 s per un
   `ENOSPC` è tempo rubato a chi guarda lo schermo.
2. **Il `try` si divide in due.** Se fallisce la **scrittura**, il temporaneo si pulisce come prima:
   byte a metà, e da byte a metà non si salva niente. Se fallisce il **rename**, no — vedi (3).
3. ⛔⛔ **Il temporaneo non si butta più quando il rename fallisce, e questo è un CAMBIO DI
   CONTRATTO dichiarato.** Prima c'era un `rm`, col motivo scritto accanto: «una cartella di
   ricerca piena di `.tmp-` è il segno di un guasto inghiottito». Il motivo era buono, la
   conclusione no: a quel punto la scrittura è **riuscita** — i byte sono interi sul disco — ed è
   solo il rename a non essere passato. Cancellarli butta lavoro **già pagato** per tenere pulita
   una cartella, che è lo scambio esatto che il vincolo di quel file vieta.
   ⇒ Il file resta accanto come **`<nome>.non-rinominato`**: dichiarato, riconoscibile, e **uno
   solo** (un secondo guasto sovrascrive quello di prima invece di accumulare UUID). Se anche il
   parcheggio fallisce, si tiene il nome casuale e **lo si dice** — un catch di recupero che copre
   l'errore vero è il difetto che questo repo ha già pagato.
   ⛔ L'errore originale si **arricchisce** (`code`, `errno`, `path`, pila intatti) invece di essere
   sostituito: un chiamante che filtra sul codice deve continuare a vederlo.

### 8.4 Le prove — `tests/ricerca-giornale-e-ripresa.test.mjs`, **40 verdi**

⛔ Niente attese a tempo: l'handle si chiude **dentro `attendiFn`**, cioè al tentativo che sceglie
il test. Il disco è vero, l'EPERM è vero, il momento è deterministico.

| # | test | cosa morde |
|---|---|---|
| 1 | un LETTORE con l'handle aperto → **si ritenta, e passa** | il verso che deve funzionare: `openSync` vero, EPERM vero, e alla seconda attesa il lettore chiude. Attese misurate `[20, 40]`, contenuto arrivato, **nessuna scoria** |
| 2 | **al contrario** — la contesa che NON passa | `code` ancora `EPERM`, messaggio che dice dove sono i byte, file vecchio intatto, contenuto nuovo leggibile in `meta.json.non-rinominato` |
| 3 | **al contrario** — rename **impossibile** (destinazione = una cartella) | stesso `EPERM`, ma dopo i tentativi **finisce**: un ritento senza fine sarebbe un blocco, non una cura. E i byte restano |
| 4 | **al contrario** — `ENOSPC` | **zero** attese: si rilancia subito |
| 5 | le attese crescono, si fermano a 200, e sommano **1300 ms** | il tetto è provato, non promesso |
| 6 | ⭐ **il difetto vero**: una ricerca che conclude **mentre qualcuno la legge** | `creaRicerca` → `terminata: null` → un lettore tiene aperto `meta.json` → `aggiornaRicerca(terminata:'done')` → la voce è **`done`**. Prima di oggi: EPERM, eccezione fuori da `onConclusioneRicerca`, e la ricerca restava `running` per sempre |
| 7 | il test L4 esistente, **aggiornato** | l'assertion `readdirSync === ['pagato.txt']` cambiava significato: adesso chiede che il contenuto nuovo **ci sia**. Il commento dice cosa c'era prima e perché è cambiato — non è stato riscritto di nascosto. ⭐ È anche l'unico posto che esercita il **ripiego** (il `renameFn` iniettato fallisce sempre, quindi fallisce pure il parcheggio: resta il nome casuale, e il messaggio lo nomina) |

**E la prova end-to-end**: i **60 ms** di ripiego che avevo messo in
`tests/http-routes-research-esportazioni.test.mjs` sono tornati a **10 ms**, cioè alla cadenza che
rompeva. Il workaround è diventato la prova.

### 8.5 Le corse

- `tests/ricerca-giornale-e-ripresa.test.mjs` → **40/40**.
- I sei file della Ricerca insieme (store, orchestratore, rotte L5, rotte esportazioni, i 22 di
  `tests/research/`) → **456 test, quattro corse di fila, zero rossi**, col polling a 10 ms.
- Suite intera `node --test tests/*.test.mjs tests/research/*.test.mjs` → **2814 test**, una rossa:
  `PROVIDER-STORE-01` in `tests/provider-credential-store.test.mjs`, che si aspetta sette provider
  e ne trova otto (`lmstudio`). ⛔ **Non è mia**: `git status` mostra `provider-credential-store.mjs`,
  `provider-probe.mjs`, `config.mjs`, `model-destination.mjs`, `openai-compatible-runtime.mjs` e due
  file nuovi (`provider-registry.mjs`, `usage-cache.mjs`) modificati da **un altro agente** in
  questo worktree condiviso, col loro test non ancora aggiornato. Nessuno dei miei file la tocca.

### 8.6 Cosa NON ho verificato, di questa cura

- ⛔ **Niente su un filesystem che non sia NTFS locale.** La contesa riprodotta è quella di
  Windows; su Linux/macOS `rename(2)` sostituisce anche con la destinazione aperta, quindi lì il
  ritento non scatta **mai** — il che vuol dire che su quelle piattaforme questo codice è provato
  solo nel verso «riesce al primo colpo».
- ⛔ **Nessun antivirus vero.** Il caso di graceful-fs (A/V che blocca per decine di secondi) non è
  riproducibile qui, e la nostra finestra di 1,3 s **non basterebbe**: se un giorno l'EPERM
  ricomparirà su una macchina con un antivirus aggressivo, la finestra va allargata — ma allargarla
  adesso costerebbe secondi di schermo fermo a tutti per un caso mai visto.
- ⛔ **Gli altri chiamanti di `scriviAtomico` non sono stati riprovati uno per uno**: il rapporto,
  il piano, le fonti e l'istantanea della cache passano tutti da qui e beneficiano del ritento, ma
  la contesa l'ho riprodotta solo su `meta.json` — che è quella che stava rompendo.
- ⛔ **Nessun giro vero di L8**: la cura è provata dal magazzino e dalle rotte, non da una ricerca
  vera col modello. È il giro che il coordinatore ha in mano.
- ⛔ **`.non-rinominato` non lo raccoglie nessuno**: se il rename fallisce davvero, il file resta lì
  e nessuna schermata lo mostra. Oggi è un file che salva i byte per chi va a guardare la cartella,
  non una funzione di ripristino.

---

## 9. IL MARKDOWN SI RENDE — il difetto trovato da una foto (12/09/2026, terza consegna)

> Coordinatore: «il corpo del rapporto esce come testo grezzo … è il difetto "integro ≠ bello"
> che avevi dichiarato». Foto: `scratchpad/esporta/l8-html-light.png`, copiata in
> `.claude/foto-esporta-2026-09-12/PRIMA-l8-html-light.png`.

### 9.1 Cosa si vedeva, e perché nessuna delle mie prove l'aveva visto

Nell'esportazione HTML di una ricerca vera (L8, dal 4174) il corpo usciva così:

```
# Agentic Desktop Harness Evolution, Computer Control, and Mobile Integration Research Report
## Executive Summary
### Market Growth Trajectory - Current market size: $7.8B - Projected market size by 2030: $52B…
**Key Components:** - Hierarchical multi-agent system - Two-tier agent hierarchy: HostAgent…
```

Cancelletti e asterischi **letterali**, ogni elenco schiacciato dentro un paragrafo solo.

**La causa era una riga**, in `esportazioni.mjs`:

```js
for (const blocco of senzaIlRecinto(prosa).split(/\n{2,}/)) corpo.push(`<p>${escapeHtml(blocco)}</p>`)
```

Spezzare sulle righe **vuote** e passare tutto da `escapeHtml`. Un elenco Markdown è separato da
**un** a capo, non da due ⇒ dieci punti elenco diventavano un paragrafo unico.

⛔ **E le mie prove di ieri passavano tutte**: dicevano «200, `Content-Type` giusto, il corpo si
rilegge». Tutto vero, e tutto insufficiente. È esattamente la riga che avevo scritto in §7
(«nessuno ha **aperto** i file… non che siano **belli**»): l'avevo vista e l'avevo lasciata lì.
**Una riga in "cosa non ho verificato" non è un'assoluzione: è un difetto con la data.**

### 9.2 Ricerca web PRIMA di scrivere — fonte + data

| # | fonte | cosa ha cambiato |
|---|---|---|
| **S8** | **GitHub Flavored Markdown Spec** — <https://github.github.com/gfm/>, letta il 12/09/2026 | Le regole sono scritte nel codice alla lettera: titolo ATX «1–6 unescaped # characters» con 0-3 spazi di rientro; recinto «at least three consecutive backtick characters or tildes», e «if the end of the containing block is reached and no closing code fence has been found, the code block contains all of the lines after the opening fence»; citazione «0-3 spaces … plus `>` with or without a following space», con la *laziness*; elenco numerato «1–9 arabic digits, followed by either a `.` or a `)`»; separatore «three or more matching -, _, or *». ⛔ **E i due vincoli che non conoscevo, sulle TABELLE**: «the header row must match the delimiter row in the number of cells. **If not, a table will not be recognized**»; per le righe di dati «if there are fewer … **empty cells are inserted**. If there are greater, **the excess is ignored**». Sono **tre** comportamenti diversi per tre casi che a occhio sembrano lo stesso — ne avrei scritto uno solo |
| **S9** | **OWASP, XSS Prevention Cheat Sheet** — <https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>, letto il 12/09/2026 | Contenuto di un elemento: entità per `& < > " '` (il mio `escapeHtml` ne aveva quattro su cinque, e usava `&#39;` invece di `&#x27;`). ⛔ E il vincolo che ha prodotto `hrefSicuro`: «**Allow-list http and HTTPS URLs only** (Avoid the JavaScript Protocol…)» e «never place untrusted data into `javascript:` protocol handlers». Il testo che passa di lì lo scrive un modello leggendo pagine del web, e il file si apre con `file://` da un browser vero: un `[clicca](javascript:…)` è una cosa che si può scrivere |

⭐ **E prima, dentro il proprio codebase** — cercati i renderer che c'erano già, e **nessuno dei
due serviva**, il che è un fatto da scrivere e non da saltare:
- `frontend/src/components/markdown.js` (BC-29, 12/09, di un altro agente) è **il** renderer di
  TALOS e copre le stesse cose. ⛔ Ma costruisce **nodi DOM** apposta («MAI innerHTML con testo non
  fidato»): qui serve una **stringa** da mettere in un file, e sul server non c'è un DOM.
- `document-generator.mjs`, `specToReport`: titoli `#`/`##`/`###`, elenchi `-`/`*`, paragrafi — e
  basta. Niente grassetto, corsivo, codice, citazioni, elenchi numerati, tabelle, link. **È il
  motivo per cui anche il PDF usciva con `**Key Components:**` dentro.**

### 9.3 La cura

**`src/research/markdown-server.mjs`** (nuovo, 474 righe) — **un parser, tre uscite**. Un parser
per uscita sarebbero tre rese diverse dello stesso rapporto, cioè tre documenti che si
contraddicono. Zero dipendenze nuove.

| dove | cosa |
|---|---|
| `:88-94` | le sette espressioni di blocco, una per costrutto GFM |
| `:125` | **`analizzaMarkdown`** → blocchi (`h`/`p`/`lista`/`citazione`/`codice`/`riga`/`tabella`). Pura |
| `:252` / `:260` | `RE_INLINE` e **`analizzaInline`**: codice in linea **per primo** (così un `` `**a**` `` resta due asterischi), poi link, grassetto, corsivo. `_` solo fuori da una parola — senza la guardia, ogni `snake_case` di un rapporto tecnico diventerebbe obliquo a metà |
| `:288` | `escapeHtml` — le **cinque** entità di OWASP |
| `:303` | **`hrefSicuro`** — allowlist `http`/`https`/`mailto`, niente caratteri di controllo. Un indirizzo rifiutato **non fa sparire il testo**: perde solo il link |
| `:353` | **`markdownInHtml`** — uscita 1, stringa HTML |
| `:400` / `:420` | **`runsDiMarkdown`** e **`markdownInBlocchiReport`** — uscita 2, per `document-report.mjs`. ⭐ `text` di pdfmake accetta un **array di run** con `bold`/`italics`/`link`: è il motivo per cui il grassetto arriva nel PDF **senza toccare** il costruttore condiviso di `document_create` |
| `:457` | **`markdownInTestoSemplice`** — uscita 3, per il DOCX |

**`src/research/esportazioni.mjs`** — `:325` la prosa resa (era il `split(/\n{2,}/)`), `:328` la
**sintesi** di un record vero (la scrive lo stesso modello: è Markdown anche lei), `:349` il testo
di un'affermazione (solo inline), `:460` i blocchi del PDF, `:549` il DOCX. Più ~15 regole CSS
nuove (`ul/ol/li`, `hr`, `code`, `pre`, `a`, `table`) per gli elementi che **prima non potevano
esistere**.

**`src/research/pdf.mjs`** — seconda divergenza dichiarata dal porto mobile (`:44-56`): la sintesi
passa da `markdownInBlocchiReport` (`:162`, `:210`, `:276`), il testo delle affermazioni da
`runsDiMarkdown`/`inlineInTestoSemplice` (`:169`, `:217`, `:223`, `:247`).

⛔⛔ **Il PASSAGGIO non si rende mai, in nessun formato.** È la **prova**: il testo com'è nella
fonte. Un asterisco dentro una citazione è un asterisco che c'era davvero, e trasformarlo in
corsivo vorrebbe dire modificare l'unica cosa che il rapporto conserva **perché non sia
modificabile**. Escapato, mai reso — e c'è un test che lo morde.

⛔ **Il recinto ```` ```talos-research-report ```` non si stampa** in HTML/PDF/DOCX: si **usa**
(bilancio, affermazioni) e si omette dalla prosa. Nel `md` resta, ed è voluto: è ciò che rende quel
file ri-verificabile da chi lo riceve.

### 9.4 Le prove — 15 nuove, **2858 verdi in tutto**

**`tests/research/markdown-server.test.mjs` — 15 test.** ⛔ Le prove che contano sono **negative**:
cercare `<h2>` non basterebbe, perché la pagina rotta poteva contenere **entrambi**.
Blocchi riconosciuti nell'ordine · i tag veri (titoli, `ul`/`ol`, `blockquote`, `table`, `pre`,
`a`) · **nessun marcatore sopravvive** (`#`, `**`, `- `, `|---`, `&gt; `) · il testo semplice del
DOCX · i tipi di blocco che `document-report.mjs` sa davvero impaginare · i run di pdfmake · **al
contrario**: `<script>` escapato (anche dentro un recinto), `javascript:`/`data:`/`vbscript:`/
`file:`/relativo mai un `href` (e il testo resta), href bloccato anche nei run del PDF, le **tre**
regole GFM sulle tabelle, recinto mai chiuso, `snake_case`, `**` senza chiusura, stringhe vuote.

**`tests/http-routes-research-esportazioni.test.mjs` — 6 test nuovi, dalla rotta vera**, su una
ricerca che ha depositato prosa Markdown e che il cancello respinge (è il caso della foto):
HTML reso · **nessun marcatore** nel corpo · `<script>` escapato · **il PDF**: più pagine, e nel
**testo estratto** nessun `## ` e nessun `**` · il DOCX · e la sintesi di un rapporto **vero**
resa, col passaggio **verbatim**.

⭐⭐ **Il testo di un PDF, davvero — e non era gratis.** `pdf-lib` non ha un estrattore, e pdfmake
incorpora i font in **sottoinsieme**: nel flusso di contenuto non ci sono lettere ma **ID di
glifo** (`[<00010002…>] TJ`). Un controllo sui byte grezzi non troverebbe `## ` né quando c'è né
quando non c'è — cioè sarebbe **un test che passa per costruzione**, la cosa che questo repo ha già
pagato più volte. ⇒ il test legge la CMap **`ToUnicode`** del font e traduce i glifi.
⛔ **Provato al contrario su un artefatto vero**: sul PDF **rotto** del 12/09 questo lettore trova
`## ` (verificato *prima* di scrivere la cura); su quello curato no. E il test asserisce anche che
il testo estratto non sia vuoto, altrimenti le due righe sotto passerebbero per costruzione.
⛔ Una trappola pagata per strada: le forme ad **array** della CMap (`<lo> <hi> [<a> <b> <c>]`) si
devono togliere **prima** di cercare quelle a **intervallo**, perché tre voci consecutive dentro un
array sembrano un intervallo — la rilettura sbagliata riscriveva tutta la mappa e il testo usciva
cifrato. Trovato provando.

### 9.5 Le foto — nei due temi, e un difetto che hanno trovato loro

`.claude/foto-esporta-2026-09-12/` (Playwright headless su `file://`, 1000×1400, `colorScheme`
chiaro e scuro):

| file | cosa mostra |
|---|---|
| `PRIMA-l8-html-light.png` | il difetto: `# Agentic…`, `## Executive Summary`, `**Key Components:**` letterali, elenchi schiacciati |
| `esporta-html-reso-light.png` | dopo: titoli veri, elenco puntato e numerato, grassetto, codice in linea, citazione, tabella con allineamento a destra, link, e `<script>alert(1)</script>` come **testo** |
| `esporta-html-reso-dark.png` | lo stesso, tema scuro (owner 11/09: «GUARDA SEMPRE LA APP CON TEMA CHIARO E SCURO SEMPRE») |

⭐ **E le foto hanno trovato un difetto che i test non potevano vedere**: nella prima stesura gli
`h4` uscivano **grigio tenue e più piccoli del testo**, quindi un titolo di sezione pesava **meno**
di un `**grassetto**` di paragrafo che stava sotto di lui — gerarchia invertita. Corretto nello
stesso giro (`font-weight:600`, colore inchiostro) e rifotografato in entrambi i temi.

### 9.6 Cosa NON ho verificato, di questa cura

- ⛔ **Non è un motore CommonMark**, e non lo sarà: niente elenchi **annidati**, niente citazioni
  annidate, niente link di riferimento `[a][b]`, niente HTML in linea, niente note a piè di pagina,
  nessuna delle regole fini di precedenza dell'enfasi. Sono «le basi» — la stessa dichiarazione che
  fa il renderer del frontend. Un rapporto che usasse un elenco annidato lo mostrerebbe **piatto**.
- ⛔ **Il DOCX non ha titoli di Word.** `generateTalosDocument` costruisce il `.docx` con **un
  paragrafo per riga** e accetta i blocchi impaginati solo per il `pdf`
  (`TALOS_DOCUMENT_REPORT_PDF_ONLY`). Dare a Word dei veri `Heading 1/2/3` vuol dire cambiare
  quel generatore, che è **condiviso con `document_create`** e non è di questo lotto. Oggi i titoli
  del DOCX sono paragrafi — ma **senza cancelletti**, che era il difetto.
- ⛔ **Il PDF non ha un font monospazio**: un recinto di codice esce nel riquadro `note`, leggibile
  ma non a spaziatura fissa. Spedire un quarto font per questo non è una decisione mia.
- ⛔ **Le foto sono di una ricerca `senza-rapporto`** (il caso della foto del coordinatore). Il ramo
  col **record** è provato dai test ma **non fotografato**: non ho una ricerca vera con record
  sotto mano che non passi dal 4174.
- ⛔ **Nessun giro col modello**: la prosa delle prove l'ho scritta io copiandola dalla foto, non
  l'ha prodotta un modello in una corsa vera.
- ⛔ **Nessuna misura di prestazione**: il parser è lineare sulle righe, ma su un rapporto da
  centomila parole non l'ho cronometrato.
