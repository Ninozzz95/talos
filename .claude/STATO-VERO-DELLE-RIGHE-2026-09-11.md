# LO STATO VERO DELLE RIGHE — 11/09/2026

> Owner, oggi: «**non voglio assolutamente vedere fasi già fatte in documenti di debiti/implementazioni
> in corso**».
>
> ⛔ **«Assicurati» non è «cerca il codice».** Ogni verdetto qui sotto è stato accertato provando che
> la funzione fa ciò che prometteva: un test lanciato adesso e il suo numero, una rotta chiamata con
> la risposta vera, i byte di un file riaperti. Dove una prova non si poteva fare, c'è scritto
> **«non verificato»** con il motivo. **Nessun verdetto è dedotto dalla presenza del codice.**
>
> Base: `HEAD = 128b44e0`, ramo `lane/harness-desktop`, 11/09/2026.
> ⛔ Il **4174 è spento** in questo momento (`curl /api/v1/health` → `000`), e il mandato vieta di
> avviarlo o scriverci: dove serviva un server, ne è stato acceso uno su una porta propria e chiuso
> dopo. Nessun giro col modello a pagamento è stato fatto.

---

## ⛔ CIÒ CHE È DAVVERO APERTO OGGI

**Il primo della lista è anche il difetto peggiore trovato: una riga data per fatta che non esiste.**

| # | riga | perché è aperta | chi la può chiudere |
|---|---|---|---|
| **1** | ⛔⛔⛔ **PO-10** — comandi dell'agente nel Terminale, schede agente vs utente | **MAI INIZIATA.** L'owner la crede fatta. Non c'è un commit di implementazione; l'unico frammento esistente è **codice morto** | da fare |
| **2** | ⛔⛔ **PO-12** — attrezzo di modifica per il modello | `src/modifica-ancorata.mjs` esiste con 9 prove verdi e **zero chiamanti**: il kernel offre 7 attrezzi di file/shell e `modifica` **non è fra questi** | da fare (poche righe nel kernel) |
| **3** | ⛔⛔ **PO-09** — terminale in basso | **fatta nel sorgente, NON nel bundle che il 4174 serve**: l'owner non può vederla | consegna, quando l'albero è pulito |
| **4** | ⛔ **PO-02 sul 4174** — pulsante Compatta | il motore del contesto è **vietato sulla 4174 per costruzione**: la modale si apre disabilitata e ogni rotta risponde 503 | decisione dell'owner |
| **5** | ⛔ **PO-03** — engine di compattazione | engine costruito e provato in unità, ma **senza il confronto controllato ON/OFF**, senza latenza accettabile, senza misura della cache | da fare |
| **6** | **PO-01** — OAuth | **OpenRouter**: catena completa ma il **giro vero non è mai stato eseguito** (serve il login dell'owner). **ChatGPT e Claude**: zero righe | il giro: solo l'owner. Il resto: da fare |
| **7** | **PO-07** — computer use | mai iniziata | da fare |
| **8** | **BC-01 · BC-02 · BC-03 · temi** | **in corso da altri agenti adesso** | non toccare da qui |
| **9** | **BC-05** — reindirizzamento e accodamento, popup sopra il composer | owner 11/09, mai lavorata | da fare |
| **10** | **BC-06** — spazio su disco (`projects/`, scratchpad) | owner 11/09, da delegare, non urgente | da delegare |
| **11** | ⛔ **`npm run verify:all` è ROSSO oggi** | `CTX-UI-USAGE-CLOSED-RELOAD` fallisce: `[data-runtime-usage]` non esiste dopo una ricarica su sessione conclusa | da fare |
| **12** | **CB-16-bis · BH-15** — id dei modelli a 102 caratteri | delle tre superfici che la coda chiedeva ne è curata **una**; `session-item.js:122` `nomeModello()` è inerte sugli id `local:` | da fare |
| **13** | **CB-07 · CB-16 · CB-20-bis · T15-D1/D2 · T17-D7 · BH-04** | riverificate aperte oggi nel codice | da fare |
| **14** | **Blocchi della release** | nessuna prova end-to-end col modello sulla UI nuova; la lane è **1.846** commit avanti a `main` (erano 1.643); nessuna prova da macchina pulita; screenshot del README fuori repo; `public/vendor/` non caricato | da fare |

⇒ **Tutto il resto della coda delle proposte è fatto**: PO-04, PO-05, PO-06, PO-08, PO-11, N1, e
PO-01 nella sua parte OpenRouter. Nessuna di queste va più letta come «in lavorazione».

---

## La tabella dei verdetti

| riga | verdetto | prova | cosa manca, per nome |
|---|---|---|---|
| **PO-10** comandi dell'agente nel Terminale | ⛔ **NON FATTA** | vedi sotto, §1 | tutto |
| **PO-04** generazione documenti | ✅ **FATTA** | 12 file generati e riaperti byte per byte, §2 | `rows` ignorato in docx/pptx/html; DOCX piatto; generatore vero non coperto da test |
| **PO-05** download con un clic | ✅ **FATTA** | download byte-identici + 4174 vivo 4.444 byte, §3 | scheda solo per `document_create`/`generate_image`; clic reale nel browser non verificato |
| **PO-02** modale Compatta | ⚠️ **A METÀ** | catena integra e provata; sul 4174 **503 per costruzione**, §4 | l'uso vero sul 4174 |
| **PO-03** engine di compattazione | ⚠️ **A METÀ** | 184 test verdi in unità; zero confronti controllati, §5 | confronto ON/OFF · latenza · cache · costi · rollback eseguito · annullamento in streaming |
| **PO-01** OpenRouter | ⚠️ **A METÀ** | 40 test verdi **contro un OpenRouter finto**, §6 | il giro vero · UI del «codice a schermo» · due rami morti · revoca lato fornitore · credito/abbonamento |
| **PO-01** ChatGPT / OpenAI | ❌ **NON FATTA** | grep vuoto, §6 | tutto |
| **PO-01** Claude / Anthropic | ❌ **NON FATTA** | grep vuoto, §6 | tutto |
| **PO-09** terminale in basso | ⚠️ **FATTA MA NON CONSEGNATA** | `terminale-basso` compare **0 volte** in `public/app.js` e in `public/index.html`, §7 | la consegna al bundle servito |
| **PO-12** attrezzo di modifica | ⚠️ **A METÀ** | modulo + 9 prove, **zero chiamanti**, §7 | schema dell'attrezzo e instradamento nel kernel |
| **PO-06** `!` dal composer | ✅ **FATTA e consegnata** | `startsWith('!')` ×3 sia nel sorgente sia in `public/app.js` | — |
| **PO-08** conversazione del sotto-agente | ✅ **FATTA e consegnata** | `conversazione-figlia` presente nel bundle servito | il testo di TALOS nella vista è nudo, non markdown (dichiarato) |
| **PO-11** diff in chat | ✅ **FATTA e consegnata** | `diff-hunk` presente nel bundle servito; 18 prove | — |
| **N1** barra laterale viva | ✅ **FATTA e consegnata** | presente nel bundle servito | — |
| **BC-04** stile del selettore modelli locali | ✅ **CHIUSA** l'08/09, riverificata oggi | 1440×900 e 1024×800, due temi: 410/410 e 397/397, nessuna barra orizzontale | — (restano CB-16-bis e BH-15, altre righe) |

**Suite misurate oggi**: server `node --test tests/*.test.mjs` → **2150/2150 verdi**, 21,8 s ·
frontend `test:unit` → **625/625 verdi** · terminale (4 file) → **81/81 verdi** ·
contesto (`harness-ui` + `context-engine`) → **184/184 verdi** · OAuth (3 file) → **40/40 verdi**.
⛔ **E `verify:all` è rosso lo stesso**: il rosso sta in Playwright, non negli unitari.

---

## 1 · PO-10 — ⛔ NON FATTA. L'owner si sbaglia

> **«è stata fatta, assicurati di aver chiuso tutto»** — non è stata fatta. Non è «a metà»: non è mai
> iniziata, e l'unico frammento di codice che la riguarda **non è raggiungibile dall'interfaccia**.

**La prova d'insieme.** `git log --all --grep="PO-10"` trova **un solo commit**, `ca35b596`, che è
quello che **ha scritto la richiesta** nella coda — non uno che la implementa. PO-09 ha il suo
(`a3e0464f`), PO-11 il suo (`e62ae85c`), PO-12 il suo (`9ec96d60`). PO-10 no.

**Requisito 1 — i comandi dell'agente nel Terminale: non fatta, ed è stata tolta di proposito.**
`frontend/src/legacy/app.js:13712-13720`, nel ramo `ToolCallResult`, commento testuale:

> «⛔ 28/8 — Terminale REALE: il tool `shell` dell'AGENTE non viene più specchiato nella vista
> Terminale — quella vista oggi è una PTY vera, digitabile dall'utente, e scrivervi automaticamente
> l'output dell'agente creerebbe una gara con la tastiera umana.»

Confermato al negativo: `appendTerminalEntry`, `scriviNelTerminale`, `specchiaShell` → **nessun
risultato**, né nel sorgente né in `public/app.js`. Il ramo `if (info?.nome === 'naviga')` subito
sotto specchia ancora nel Browser; per `shell` non c'è più niente.

**Requisito 2 — in ordine: non fatta**, per conseguenza. (L'ordinamento esiste già altrove:
`components/inspector.js:412-431`, `processiDagliEventi`.)

**Requisito 3 — schede agente distinte e in sola lettura: non fatta.** Il *nome* esiste ed è **codice
morto**: `frontend/src/components/terminale.js:111` ha il ramo
`if (voce.origine === 'agente') return voce.giro ? \`agente · giro ${voce.giro}\` : 'agente'` — ma
l'unico produttore reale, `app.js:10241` in `registraSchedaTerminale`, forza
`origine: voce.origine === 'standalone' ? 'standalone' : 'tu'`. Identico nel bundle servito
(`public/app.js:20262`). Gli unici `origine: 'agente'` in tutto il repo stanno in una fixture del lab
e in un test su funzione pura.
Tre mancanze puntuali: **nessuna distinzione visiva** (le regole delle schede,
`styles/index.css:1379-1394`, non hanno nessun selettore per l'origine; il pallino guarda lo stato
della shell, `terminale.js:227`, non chi ha aperto); **nessuna sola lettura** (`disableStdin` →
nessun risultato: ogni scheda monta una xterm scrivibile); **il piede dichiara il falso per
costruzione** (`piede: { chi: tr(TESTI_TERMINALE.apertaDaTe) }` è costante — «Aperta da te» apparirebbe
anche su una scheda dell'agente).

**Requisito 4 — stessa fonte del pannello Processi: non fatta.** Sono due catene disgiunte.
Processi: `app.js:8477` → `processiDagliEventi(state.realSession.eventiAttrezzi)` → `inspector.js:412`,
che legge `ToolCallStart/Args/Result` e produce già `{ comando, stato, chi:'agente', giro, durataMs,
uscita }` — **esattamente la forma che PO-10 chiede**. Terminale: registro PTY lato server via
WebSocket. `grep -rn "processiDagliEventi"` → 4 occorrenze, **nessuna nel Terminale**.

**Le prove eseguite.**
- `node --test tests/terminal-registry.test.mjs tests/http-routes-terminals.test.mjs
  tests/pty-terminal.test.mjs tests/terminal-ws.test.mjs` → **81 pass / 0 fail**, 538 ms.
  ⛔ `grep -i "agente"` su quei quattro file → **vuoto**: passano tutti e non toccano PO-10.
- `npm --prefix harness-ui/frontend run test:unit` → **625 pass / 0 fail**. L'unica riga che nomina
  l'agente è `terminale.test.mjs:18`, che chiama `titoloScheda()` direttamente: mai attraverso l'app.
- **Risposta vera della rotta** (app HTTP reale su porta propria, poi chiusa):
  `GET /api/v1/sessions/sess-1/terminals` → `origini: ["prima-scheda","rotta"]`, `scheda con origine
  'agente': false`, campi di una voce: `terminalId, sessionId, cartella, creatoAlle, origine, attiva`.
  ⇒ **lo schema stesso della rotta non ha un campo per il giro né per la sola lettura**: il server non
  potrebbe descrivere una scheda agente nemmeno volendo.
- **Verifica visiva sul 4174: non verificato** — il server è spento e il mandato vieta di avviarlo.

**Difetti registrati (non curati):** 1) `terminale.js:111` è codice morto protetto da un test verde —
è la forma già catalogata «una funzione coi test e nessun chiamante»; 2) la fixture del lab
(`frontend/lab/fixtures/terminale.js:7`) disegna `agente · giro 7`, cioè **mostra PO-10 fatta a chi
guarda il lab**; 3) il piede del Terminale dichiara il falso per costruzione; 4) `processiDagliEventi`
ha già il 90% del dato e nessuno lo riusa; 5) ⛔ **c'è un conflitto di progettazione da sciogliere
con l'owner prima di scrivere codice**: lo specchio fu tolto il 28/8 perché creava una gara con la
tastiera umana, e rimetterlo **senza** le schede separate in sola lettura riaprirebbe quel difetto.

---

## 2 · PO-04 — ✅ FATTA

**Dove**: `src/document-generator.mjs:200` `generateTalosDocument`, `:313` `verifyTalosDocument`;
schema dell'attrezzo `src/kernel/talosHarness.mjs:1103`; innesco `src/agent-service.mjs:944`.

**La prova: dodici file generati col modulo del repo e riaperti byte per byte.**

| file | byte | firma | prova di autenticità |
|---|---|---|---|
| `Relazione di prova.docx` | 7.685 | `50 4b 03 04` | 20 parti ZIP, `word/document.xml`, marca `SPIA-PO04-7f3a9e` **dentro** il documento |
| `Tabella di prova.xlsx` | 15.964 | `50 4b 03 04` | 10 parti, `xl/workbook.xml`, marca in `sheet1.xml` |
| `Presentazione di prova.pptx` | 45.732 | `50 4b 03 04` | 39 parti, `ppt/presentation.xml`, marca in `slide1.xml` |
| `PDF da body.pdf` | 14.792 | `%PDF-1.3` | `%%EOF`, 1 pagina, testo **estratto** decodificando la ToUnicode CMap |
| `PDF report impaginato.pdf` | 19.241 | `%PDF-1.3` | 2 pagine; cover + KPI + tabella + istogramma + torta, tutti verificati nel testo estratto |
| `Prova CSV.csv` | 51 | — | RFC 4180: `"valore, con virgola"` quotato, CRLF |
| TXT · MD · HTML · JSON · PY · SQL | 25-148 | — | contenuto atteso verbatim |

**Inventario reale**: **40 estensioni** (`TALOS_DOCUMENT_FORMATS`) — 7 di documento
(`md, csv, html, docx, xlsx, pptx, pdf`) + 33 di sorgente. **Tutti e sei i formati chiesti (DOCX, PDF,
CSV, PPTX, XLSX, TXT) ci sono e sono autentici.** L'attrezzo è davvero dichiarato al modello: il 4174
vivo rispondeva `GET /api/v1/tools` con 43 attrezzi fra cui `document_create`.

**Mancano** (rifiutati con un errore onesto, non un crash): `doc`, `xls`, `ppt`, `rtf`, `odt`, `ods`,
`odp`, `epub`.

**Difetti registrati, non curati:**
1. ⛔ **`rows` viene buttato in silenzio** per `docx`, `pptx` e `html`. Misurato:
   `{format:'docx', rows:[['Mese','Valore'],…]}` → 7.645 byte, **0 tabelle `<w:tbl>`**, la parola
   «Mese» **non è nel file**. `report` ha un guardrail esplicito, `rows` no.
2. ⛔ **Il DOCX è piatto mentre il PDF è impaginato, dallo stesso `body`**: `docx` fa
   `body.split('\n') → Paragraph` (riga 246), quindi `**grassetto**` finisce **letterale**, `- punto`
   non diventa elenco, i `#` non diventano titoli. Chi chiede «la stessa relazione in Word» ottiene
   markdown a vista.
3. ⛔ **Il generatore vero non è provato da nessun test**: ogni test di `document_create` inietta
   `generateTalosDocumentFn` finto; `tests/document-generator.test.mjs` **non esiste**. Nessuna riga
   docx/xlsx/pptx/pdf reale è mai stata riaperta dalla suite.

---

## 3 · PO-05 — ✅ FATTA

**Dove**: rotta `src/http-app.mjs:1843-1871` (`GET /api/v1/sessions/:id/file`),
`src/session-registry.mjs:4497` `scaricaFile`, `src/workspace-files.mjs:127` `leggiFilePerScarico`
(tetto 64 MB), evento `src/agent-service.mjs:985`, scheda
`frontend/src/components/conversazione.js:243` `creaFileScaricabile`, aggancio `app.js:11462-11472`.

**La prova: i byte.** Server vero su porta effimera, poi chiuso:

```
Relazione scaricabile.docx | disco 7672B  | 200 | content-length=7672  | ricevuti 7672B  | identici=true
Tabella scaricabile.xlsx   | disco 15953B | 200 | content-length=15953 | ricevuti 15953B | identici=true
Slide scaricabili.pptx     | disco 45428B | 200 | content-length=45428 | ricevuti 45428B | identici=true
PDF scaricabile.pdf        | disco 13208B | 200 | content-length=13208 | ricevuti 13208B | identici=true
```

Intestazioni: `Content-Disposition: attachment; filename="…"; filename*=UTF-8''…`, `nosniff`,
`no-store`, `CSP default-src 'none'; sandbox`.
**Al contrario**: file inesistente → **404 `FILE_NOT_FOUND`**; `../../segreto.txt` → **404**;
sessione ignota → **404**; percorso vuoto → **400**. **Nessun 200 vuoto.**

**Sul 4174 vivo** (sola lettura, quando era acceso):
`GET /api/v1/sessions/43228400…/file?percorso=README.md` → **200, 4.444 byte reali**, stesse
intestazioni. La rotta funziona sull'istanza dell'owner, non solo in laboratorio.

**Persistenza dopo riavvio: provata.** Sessione creata, `.docx` da 7.655 byte scritto, registro nuovo
sulla stessa cartella, `ripristina() → {ripristinate:1, totali:1}`, e il download dopo il riavvio
torna **7.655 byte identici**. Anche lo `StateDelta` con `allegato` sopravvive e viene rigiocato in
SSE ⇒ dopo un reload la scheda si ridisegna.

**Raggiungibile dall'interfaccia**: `conversazione.js:234` costruisce
`href = /api/v1/sessions/<id>/file?percorso=<p>` con `download="<nome vero>"`; la scheda sta nella
card del batch, **non** dentro il corpo `hidden` dell'attività. Senza indirizzo non disegna un
bottone finto ma «Non disponibile da qui». Funzione e aggancio sono presenti nel **bundle servito**
(`public/app.js`), e il CSS in `public/styles.css`.

**Test**: `document-filename + agui-events + workspace-files` → **72/72** · `agent-service`
(document/immagine) → **9/9** · `http-routes-sessions` → **139/139** ·
`frontend/tests/unit/file-scaricabile.test.mjs` → **4/4**.

**Difetti registrati, non curati:**
1. Nessun test copre `allegato` su `document_create` (l'assert esiste **solo** per `generate_image`).
2. Nessun test end-to-end sulla rotta `GET /sessions/:id/file`: è stata attraversata via HTTP solo
   nella prova di oggi.
3. **Probabile, non verificato in un browser vero**: se il file è stato nel frattempo cancellato, la
   rotta risponde 404 con JSON e un `<a download>` su Chrome **salva comunque il corpo** — l'utente si
   ritrova un `.docx` che contiene `{"ok":false,…}`.
4. La scheda esiste solo per `document_create` e `generate_image`: un file prodotto da `scrivi` o
   `tool_create` non ha nessun collegamento in chat.
5. Contorno: `artifact-store.mjs` è **solo in memoria** — l'HTML di `artifact_create` non sopravvive a
   un riavvio (la copia in Libreria sì). I documenti stanno sul disco, quindi PO-05 regge.

**Non verificato**: il clic reale nel browser sulla scheda (avrebbe richiesto un giro col modello sul
4174, vietato dal mandato).

---

## 4 · PO-02 — ⚠️ A METÀ: il codice è fatto, la funzione sul 4174 non si può usare

**La risposta secca alla domanda «se l'owner apre il 4174 adesso e preme Compatta, cosa succede?»:**
la modale «Context Manager» si apre, completa — e **non funziona**. Ogni rotta `/context` risponde
**503 `CTX_NOT_ENABLED`**, «Compatta ora» è **disabilitato**, la spunta dell'autocompattazione è
**disabilitata**. Nessun messaggio viene toccato. Non è un guasto: è **per costruzione**.

**Il cancello, testuale** — `src/config.mjs:446-449`: se `TALOS_CONTEXT_TRIAL` è impostato **e** la
porta è 4174, `fail('Il trial del contesto richiede una porta esplicita diversa da 4174 e una
directory sessioni isolata.')`. Provato nei tre casi:

| caso | esito |
|---|---|
| porta 4174 + trial | **RIFIUTATO: il server non parte proprio** |
| porta 4174 senza trial | `contextTrial = null` → motore assente → 503 |
| porta 4199 + trial | `contextTrial.sessionIds = ['s1']` → motore vivo |

⇒ Sul 4174 il motore ha **due stati soli: spento, o server che non si avvia.**
`TALOS_CONTEXT_TRIAL` compare **solo nei test** e in tre documenti `.claude/`: nessun launcher lo
imposta, `scripts/aggiorna-4174.ps1` non lo nomina.

**Prova HTTP vera**, server avviato su porta propria **senza** trial (configurazione identica al
4174) e poi chiuso:
`GET stato → 503 CTX_NOT_ENABLED` · `POST avvia → 503` · `PATCH impostazioni → 503`.
Origine: `src/http-app.mjs:1794`; il motore si compone solo dentro `if (config.contextTrial)`
(`server.mjs:427`).

**Quello che invece è davvero fatto, requisito per requisito:**
- **catena del pulsante integra**, sei anelli, nessuno morto: `index.template.html:310`
  (`data-azione="comprimi"`) → id assegnato a runtime → `app.js:18168` → `compactSession()`
  (`:14610-14622`) → `components/context-compactor.js:51` → rotte `/context/*` →
  `src/context-desktop-service.mjs` → `context-engine/src/engine.mjs`;
- **autocompattazione attiva di default**: `context-engine/src/contracts.mjs:21-27`,
  `auto: z.boolean().default(true)`, `triggerRatio .default(0.75)`, `targetRatio .default(0.55)`;
  confermata da `contracts.test.mjs:21` e dalla casella `checked` nel template;
- **preferenza persistente**: SQLite in `<sessions-dir>/context/context.sqlite`, `journal_mode=WAL`,
  `synchronous=FULL`, in transazione con ricevuta di idempotenza;
- **barra di progresso e separatore conservato dopo ricarica**: provati **dal vivo** —
  `page.reload()` → `[data-context-separator]` **toHaveCount(1)**, e la barra resta a `value=2`. Il
  meccanismo sono eventi `CUSTOM talos.context` con `durable: true`
  (`src/session-registry.mjs:2832-2855`) rigiocati alla ricarica.

**Test**: `harness-ui/tests/context-*.test.mjs` → **101/101** · `context-engine/tests/*` → **83/83**.

**⛔ Un difetto grosso trovato strada facendo, registrato e non curato.**
`npx playwright test --config=playwright.context.config.mjs` → **1 rosso su 2**:
`CTX-UI-USAGE-CLOSED-RELOAD` fallisce a
`frontend/tests/browser/context-compactor.spec.mjs:138` — `[data-runtime-usage]` **non esiste** dopo
la ricarica di una sessione conclusa (`components/chat-foot.js:391`).
Due conseguenze:
1. quel file è dentro `playwright.componenti.config.mjs`, che `frontend/scripts/verify.mjs` esegue,
   che `npm run verify:all` chiama ⇒ **`verify:all` è rosso oggi**;
2. ⛔ morendo alla riga 138, **le asserzioni successive dello stesso test non venivano mai eseguite** —
   fra cui proprio quella del separatore dopo ricarica. Dichiararla verde sarebbe stato falso: è
   stata verificata a parte, su una copia fuori dal repo, e **solo allora** è diventata una prova.

---

## 5 · PO-03 — ⚠️ A METÀ

L'engine esiste, è serio, ed è ben provato **in unità**: 184 test verdi complessivi, con nomi che
coprono i capitoli chiesti — `CTX-TOOL-PAIRING` (coppie chiamata/esito), `CTX-CANCEL` e
`CTX-CANCEL-PROGRESS-RACE` (annullamento), `CTX-CRASH-PUBLISH` e `CTX-MUTATION-ROLLBACK` (rollback),
`CTX-RESTORE-SUFFIX` (ripristino), `CTX-SOURCE-VALIDATION` (citazioni fabbricate respinte).

⛔ **Ma il requisito chiedeva «confronti controllati e log grezzi», e quelli non ci sono.**

- `git log --all --grep="PO-03"` → **zero commit**. `PO-03` compare in **un solo posto** del repo: la
  riga del requisito nella coda, in un file la cui intestazione dice ancora «IN CODA» e che alla riga
  41 scrive «Nessuna di queste ricerche è dichiarata chiusa». **PO-03 non è mai stato chiuso da
  nessuna parte.**
- La campagna di misura che esiste (96 casi, `harness-ui/benchmarks/autocompact/`, log grezzi da
  11,3 MB e archivio sigillato da 54,8 MB) ha misurato **i quattro candidati esterni prima che
  l'engine esistesse**, e conclude da sé «Nessun candidato promosso nel prodotto»; ogni
  `summary.json` porta `"fullQualificationComplete": false`.
- Il documento della campagna nomina l'arm mancante: «manca il **confronto AVM ON/OFF**», «manca una
  prova reale di latenza primo token e annullamento streaming», e sull'engine TALOS «la sua
  superiorità **non è ancora misurata**».

**Cosa manca, per nome**: il confronto controllato ON/OFF sull'engine consegnato · la **latenza**
(misurata una volta sola e **fuori bersaglio**: primo token a **61,2 s**) · l'**hit-rate della cache**
(il «cache 40%» è una fixture) · i **costi** prima/dopo · un **rollback eseguito** e misurato ·
l'**annullamento in streaming**, dichiarato non provato.

**Va riconosciuto** che la ricerca sullo stato dell'arte c'è ed è **onesta**
(`.claude/RICERCA-CONTEXT-ENGINEERING-ULTIMO-MESE-2026-09-09.md`, finestra 9 ago-9 set): dice per
iscritto che la superiorità di TALOS non è provata, e in tutto il materiale non compare una sola
etichetta «breakthrough». E i quattro giri veri con `glm-5.3-flash` del 09/09 hanno prodotto numeri
reali (byte contati come token: **70.903 stimati contro 10.073 misurati**; 1 citazione su 4 esatta) e
hanno trovato quattro difetti. Sono prove di bug, non confronti controllati.

---

## 6 · PO-01 — OpenRouter a metà, ChatGPT e Claude a zero

> L'owner dice: «**OpenRouter fatto**; ChatGPT e Claude ancora no». **Sulla seconda metà ha ragione
> senza sfumature. Sulla prima, parzialmente.**

### OpenRouter — ⚠️ a metà

La catena è costruita **per intero** e collegata dal pulsante fino alla chiamata al modello:

| anello | dove | c'è? |
|---|---|---|
| il server dichiara «so servire l'accesso» | `src/provider-credential-store.mjs:253` `supportsOAuth: provider === 'openrouter'` | sì |
| pulsante «Accedi con OpenRouter» | `frontend/src/components/provider-card.js:43`, protetto da `:40` | sì |
| dov'è a schermo | Impostazioni → Laboratorio modelli → *Provider*; seconda porta da «Provider e accessi» | sì |
| regia del clic | `app.js:2776` → `avviaAccessoProvider` (`:2700`) | sì |
| rotta di avvio | `POST /api/v1/auth/openrouter/inizia`, `src/http-app.mjs:1708` | sì |
| PKCE | `src/openrouter-oauth.mjs:132`, 32 byte da `node:crypto`, **S256**, mai `plain` | sì |
| stato opaco, monouso, 10 min, confronto a tempo costante | `openrouter-oauth.mjs:143, 90, 106, 309` | sì |
| callback | `GET …/ritorno/<stato>`, stato nel **percorso**, esenzione mirata dal cookie `SameSite=Strict` | sì |
| scambio codice → chiave | `openrouter-oauth.mjs:190` → `POST https://openrouter.ai/api/v1/auth/keys` | sì |
| salvataggio nel portachiavi di sistema | `http-app.mjs:1727` → `server.mjs:593` → `provider-credential-store.mjs:180` → `@napi-rs/keyring` | sì |
| uso della chiave in una chiamata vera | `server.mjs:374`, riletta a **ogni giro** (`session-registry.mjs:2238`): niente riavvio | sì |
| logout locale | menu «⋯» → «Rimuovi chiave» → `clearKey` → `keyring.remove` | sì |
| **revoca lato OpenRouter** | — | **no** |
| **modalità «codice a schermo»** | rotta `POST …/codice` c'è (`http-app.mjs:1753`); **nessun chiamante nel frontend** | **manca la UI** |
| **il giro vero** | — | **mai fatto** |

**Test lanciati oggi**: `http-routes-openrouter-oauth` **14/14** · `openrouter-oauth` **17/17** ·
`provider-credential-store` **9/9**.
⛔ **Cosa provano davvero: un OpenRouter FINTO.** Ogni caso inietta `fetchOpenRouterFn:
openRouterFinto()` e `custodisciChiaveOpenRouter: custodiaFinta()`. **Nessuna riga esce in rete.**
Quei 40 verdi provano la nostra metà del contratto contro una controparte che rispetta la
documentazione per costruzione.

**La custodia, misurata e non dedotta** (script in scratchpad, nessun codice di prodotto toccato):
`PRIMA di loadFromKeyring → origineChiave: "ambiente"`; `DOPO → origineChiave: "custodia"`.
⇒ **il portachiavi vince sull'ambiente**, come dichiarato in D-10I. La chiave non finisce mai in un
file (`writeRuntimePreferences` scrive solo endpoint e timeout) e non torna mai in una risposta HTTP.

**Il giro vero non è stato fatto, e lo dice il commit stesso** (`e6e2a549`, 10/09): «⛔ Resta non
verificato solo il login sul sito di OpenRouter, che vuole le credenziali dell'owner». Le foto
(`scratchpad/prove/foto/po01-provider-20260910/`) arrivano a «accesso premuto / popup non bloccato» e
**si fermano lì**. Il badge «Chiave salvata» in quelle foto è una chiave **incollata a mano**:
`origineChiave` vale `'custodia'` in entrambi i casi, quindi la foto non distingue le due origini.

**Cosa manca, per nome:**
1. **Il giro vero** — login, codice di ritorno, scambio, chiave in portachiavi, una chiamata al
   modello con quella chiave, logout. **Solo l'owner può chiuderlo.**
2. ⛔ **`origineChiave: 'accesso'` non esiste**: `provider-card.js:17` («Accesso fatto») e `:43`
   («Rifai l'accesso») confrontano con un valore che il server **non emette mai**
   (`provider-credential-store.mjs:260` produce solo `'custodia' | 'ambiente' | null`). ⇒ due rami
   morti, e **dopo un accesso riuscito la card dirà «Chiave salvata»**, come se l'avessi incollata.
   È esattamente il momento in cui l'owner farà il giro vero.
3. **La modalità «codice a schermo» non ha interfaccia**: è la sola via per chi usa TALOS da un'altra
   macchina, e oggi quella persona non può accedere.
4. **Nessun test visivo rende il pulsante**: la fixture `frontend/lab/fixtures/provider-card.js` non
   ha il campo `supportsOAuth`, quindi in tutte le prove Playwright il pulsante **non viene mai
   disegnato**. È la stessa famiglia del difetto che l'owner ha trovato premendolo.
5. **Logout locale, nessuna revoca**: la chiave resta valida su openrouter.ai e niente lo dice.
6. **Abbonamento/credito: niente.** Il requisito «distinguere login, abbonamento e API» è coperto per
   due terzi.
7. *Rinnovo e scadenza non si applicano, ed è per progetto*: la fine dello scambio è **una chiave
   API**, non un token (`openrouter-oauth.mjs:52-55`).

### ChatGPT / OpenAI — ❌ non fatta, zero righe

La prova è il grep vuoto: `chatgpt|anthropic.*oauth|device.code|device_code|auth.openai` su
`src/`, `frontend/src/` e `server.mjs` → **due sole righe, nessuna delle quali è codice OAuth** (un
commento che spiega *perché non si fa*, e una regex sugli id dei modelli).
`auth/openai|auth/chatgpt|device_authorization` → **vuoto**. `supportsOAuth` per `openai` = **false**.
Il blocco dichiarato in `openrouter-oauth.mjs:11-13`: OpenAI offre OAuth solo per client **riservati**,
cioè con un `client_secret` su un server che TALOS non ha e, per la premessa local-first, non deve avere.

### Claude / Anthropic — ❌ non fatta, zero righe

Stesso grep, stesso esito. `supportsOAuth` per `anthropic` = **false**. Nessun riferimento a
`claude.ai/oauth` né a `console.anthropic.com/oauth` in tutto `harness-ui/`.
⛔ Il vincolo scritto in `openrouter-oauth.mjs:11` è una **nota nostra del 10/09 che non cita una
pagina ufficiale**: va riverificato alla fonte prima di progettare.

---

## 7 · Due righe che i documenti danno per chiuse e che non lo sono

### ⛔ PO-09 è fatta nel sorgente e **non arriva all'owner**

`a3e0464f` (11/09) implementa il terminale in basso e lo dichiara esso stesso: «⛔ NON consegnato al
4174: cinque agenti stanno scrivendo nell'albero in questo momento».
**Verificato oggi, e poi verificato di nuovo DAL SERVER VIVO.** Prima sul disco: `terminale-basso`
compare **1 volta** in `frontend/src/legacy/app.js` e **0 volte** in `public/app.js`,
`public/styles.css` e `public/index.html`.
Poi, quando il 4174 è stato riacceso da altri nel pomeriggio, **scaricando ciò che serve davvero**
(solo `GET`, nessuna scrittura):

```
GET http://127.0.0.1:4174/app.js  -> 200, 1.406.062 byte
    terminale-basso        servito = 0
    conversazione-figlia   servito = 2      (PO-08 c'è)
    diff-hunk              servito = 2      (PO-11 c'è)
GET http://127.0.0.1:4174/        -> 200,   345.175 byte
    terminale-basso / pannelloTerminaleBasso = 0
```

⇒ **Non è un'ipotesi sul build: è ciò che il browser dell'owner riceve adesso.** PO-08 e PO-11 sono
consegnate, PO-09 no. ⇒ Finché il bundle non viene rigenerato, **la funzione non esiste per chi guarda lo
schermo**. La decisione di non consegnare era giusta; il debito è che la consegna non è ancora stata
fatta, e non ci sarà finché altri stanno scrivendo nell'albero.

### ⛔ PO-12 è una funzione con i test e nessun chiamante

`9ec96d60` crea `src/modifica-ancorata.mjs` (177 righe) con 9 prove verdi, e chiude dichiarando:
«⛔ Resta fuori il pezzo che vive nel KERNEL (schema dell'attrezzo + instradamento)».
**Verificato oggi**: `grep -rn "modifica-ancorata\|modificaAncorata"` su `src/`, `frontend/src/` e
`server.mjs`, escluso il modulo stesso → **nessun risultato**. E gli attrezzi che il kernel dichiara
al modello (`src/kernel/talosHarness.mjs`) sono `elenca · cerca · leggi · scrivi · prova · shell ·
naviga` per i file e la shell: **`modifica` non c'è**.
⇒ Il modello continua a riscrivere ogni file per intero. E la difesa contro D3 che PO-12 doveva
portare — due figlie sullo stesso file, la seconda fallisce invece di cancellare la prima — **oggi
non è attiva**.

---

## Metodo e limiti di questo accertamento

- Quattro accertamenti paralleli su aree di file disgiunte, tutti in **sola lettura sul prodotto**:
  nessun file di prodotto è stato modificato, nessun `git add`/`commit`/`push`.
- I server usati per le prove sono stati aperti su **porte proprie** e **chiusi**; le cartelle
  temporanee rimosse. **Il 4174 non è stato avviato né scritto.**
- **Non verificato, con il motivo:** il clic reale sulla scheda di download in un browser; la resa a
  schermo di PO-10 sul 4174; il giro OAuth vero su openrouter.ai; il comportamento del 4174 *in
  esecuzione* — il server è spento e il mandato vieta di avviarlo. Tutti e quattro richiedono o un
  giro col modello o le credenziali dell'owner.
