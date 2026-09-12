# Le esportazioni della ricerca approfondita — il BACKEND

Lane `lane/harness-desktop`, 12/09/2026. Owner: «la ricerca approfondita deve avere una suite di
esportazioni **COMPLETA**».

⛔ Nessun giro col modello, nessuna richiesta alla 4174, nessun `git`, nessuno screenshot.
⛔ Nessun file di `frontend/`, di `src/kernel/` o di `src/research-orchestrator.mjs` toccato.
⛔ Nessuna deviazione dall'elenco dei file: due file nuovi in `src/research/`, due nel `tests/`,
tre punti in `src/http-app.mjs`. `src/research-store.mjs` **non** è stato toccato — e in §6.2 c'è
scritto perché avrebbe potuto esserlo.

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
- 🔜 **Non l'ho fatta**: `research-store.mjs` non è nel mio lotto, e una modifica alla scrittura di
  **ogni** ricerca non si infila dentro un lotto sulle esportazioni. Decide l'owner.
- **Nel frattempo** il mio banco ha smesso di essere la causa più probabile: cede il giro al loop
  finché la scrittura non ha avuto il suo turno, e poi chiede ogni 60 ms invece che ogni 10. La
  spiegazione per esteso è nel test, sopra `concludi`. ⛔ `tests/http-routes-research.test.mjs`
  (L5, non mio) usa ancora i 10 ms ed è la corsa in cui la gara si è vista la seconda volta.

---

## 7. Cosa NON ho verificato

- ⛔ **Niente di visivo.** Nessuno ha **aperto** un `.pdf`, un `.docx` o l'`.html` esportato per
  guardarlo: le prove dicono che i file sono **integri e rileggibili**, non che siano **belli** o
  che l'impaginazione dei tre toni regga su una ricerca vera da trenta affermazioni. Il `brief` su
  una pagina è misurato (`getPageCount() === 1`), ma su una fixture da 4 affermazioni.
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
