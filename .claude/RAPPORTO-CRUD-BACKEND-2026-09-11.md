# CRUD completo di Note / Attività / Memoria — il BACKEND

> Ordine dell'owner (11/09/2026, «non negotiable»): «le note, se sono markdown, devono essere
> renderizzate in markdown; tutte le Note, Attività, Memoria, Libreria devono avere **CRUD
> completi**».
> Questo rapporto copre **solo il backend**: rotte HTTP, forma dei dati, errori, prove. Il
> frontend lo scrive un altro agente **su questo contratto** — §4 è il contratto, verbatim.
>
> Lane `lane/harness-desktop` · nessun commit, nessun push, nessun giro col modello, mai la 4174.

---

## 1. Cosa c'era prima (misurato, non ricordato)

| | Il MODELLO | La PERSONA |
|---|---|---|
| Note | `notes_list`, `notes_create`, `notes_update`, `notes_delete` | `GET .../notes` e basta |
| Attività | `tasks_list`, `tasks_create`, `tasks_complete` | `GET .../tasks` e basta |
| Memoria | `memory_list`, `memory_create`, `memory_update`, `memory_delete`, `memory_search` | `GET .../memory` e basta |
| Libreria | sei attrezzi | CRUD completo dal 10/09 (`PATCH`/`DELETE`/`rivela`/`apri`) |

- Le funzioni di scrittura **esistevano già tutte** in `harness-ui/src/notes-store.mjs`,
  `tasks-store.mjs`, `memory-store.mjs` (crea / aggiorna / completa / elimina / leggi / elenca):
  mancava **solo la porta HTTP**.
- Le tre rotte esistenti erano dichiarate `metodi: ['GET']` nell'inventario
  (`src/http-app.mjs`, oggi righe 903-909) — ed è per questo che i pannelli di ieri sera sono
  usciti senza un pulsante di scrittura (`.claude/RAPPORTO-PORTING-SEZIONI-2026-09-11.md`).
- I tre magazzini sono **GLOBALI**, non per-progetto (documentato alla fonte in
  `notes-store.mjs:1-32`: «prendi nota che il codice del cancello è 4471» non riguarda nessun
  progetto di codice). Research e Library restano per-progetto. Questo lotto **non cambia** quella
  divisione: le rotte nuove passano dalle stesse cartelle globali del registro
  (`.notes-store/`, `.tasks-store/`, `.memory-store/` accanto a `server.mjs`).

## 2. Le fonti (ricerca fatta PRIMA di scrivere)

⛔ **WebSearch era esaurito per la sessione (200/200 chiamate)**: dichiarato qui e usato WebFetch
sulle fonti primarie, come previsto dal brief.

| Fonte | Data lettura | Cosa ha cambiato nel codice |
|---|---|---|
| **RFC 9110 §15.3.2** (rfc-editor.org/rfc/rfc9110.html) | 11/09/2026 | «A 201 response **MUST** contain a Location header field giving the URI of the newly created resource» ⇒ ogni `POST` di creazione risponde **201 + `Location`**, non 200. E «MAY contain … a representation of the created resource» ⇒ la voce creata viaggia anche nel corpo (il pannello non deve rifare una GET). |
| **CommonMark 0.31.2** (spec.commonmark.org) | 11/09/2026 | I marcatori del rilevamento markdown sono quelli della specifica, non a memoria: titoli ATX (`#`+spazio, **max 3 spazi** di rientro), recinti ` ``` `/`~~~`, `>`+spazio, elenchi `-`/`+`/`*` **con lo spazio obbligatorio**, elenchi numerati 1-9 cifre + `.`/`)`, righe orizzontali, link, enfasi `**`/`__`. Lo spazio obbligatorio dopo il trattino è ciò che evita di chiamare «markdown» una lista della spesa. |
| RFC 5789 (PATCH) e RFC 9110 §15.5.6 (405 + `Allow`) | già citate in `http-app.mjs` il 10/09, riusate qui | PATCH per la modifica parziale; ogni rotta nuova ha la **sua** riga nell'inventario, così l'`Allow` del 405 dice il vero risorsa per risorsa invece dell'unione dei metodi di tutte. |

## 3. Le rotte (file:riga)

Tutte sotto `harness-ui/src/http-app.mjs`. Le sette righe dell'inventario stanno a **903-909**
(`ROTTE_API`), i cinque blocchi che rispondono a **2574-2731**.

| Metodo e indirizzo | Blocco | Corpo | Risposta | Errori |
|---|---|---|---|---|
| `POST /api/v1/sessions/:id/notes` | `voceCreaMatch` — 2574 | `{titolo, contenuto, formato?}` | **201** + `Location` · `{nota}` | 400 `QUERY_INVALID` (forma) · 400 `NOTE_INVALID` (tetti) · 404 `NOT_FOUND` (sessione) |
| `GET …/notes/:noteId` | `voceLeggiMatch` — 2609 | — | 200 `{nota}` | 404 `NOTE_NOT_FOUND` · 404 `NOT_FOUND` |
| `PATCH …/notes/:noteId` | `voceModificaMatch` — 2639 | `{titolo?, contenuto?, formato?}`, almeno uno | 200 `{nota}` | 400 · 404 `NOTE_NOT_FOUND` |
| `DELETE …/notes/:noteId` | `voceEliminaMatch` — 2667 | — | 200 `{eliminata:true, id, titolo}` | 404 `NOTE_NOT_FOUND` |
| `POST …/tasks` | 2574 | `{titolo, descrizione?, priorita?}` | **201** + `Location` · `{attivita}` | 400 `TASK_INVALID` · 404 |
| `GET …/tasks/:taskId` | 2609 | — | 200 `{attivita}` | 404 `TASK_NOT_FOUND` |
| `PATCH …/tasks/:taskId` | 2639 | `{titolo?, descrizione?, priorita?}` — **mai `stato`** | 200 `{attivita}` | 400 (anche su `stato`: chiave non ammessa) · 404 |
| `POST …/tasks/:taskId/stato` | `attivitaStatoMatch` — 2706 | `{stato: 'todo'\|'doing'\|'done'}` | 200 `{attivita}` | 400 `TASK_INVALID` · 404 `TASK_NOT_FOUND` |
| `DELETE …/tasks/:taskId` | 2667 | — | 200 `{eliminata:true, id, titolo}` | 404 `TASK_NOT_FOUND` |
| `POST …/memory` | 2574 | `{titolo, contenuto, genere?}` | **201** + `Location` · `{memoria, duplicato:false}` — **200** `{memoria, duplicato:true}` se il titolo esiste già | 400 `MEMORY_INVALID` · 404 |
| `GET …/memory/:memoryId` | 2609 | — | 200 `{memoria}` | 404 `MEMORY_NOT_FOUND` |
| `PATCH …/memory/:memoryId` | 2639 | `{titolo?, contenuto?, genere?}` | 200 `{memoria}` | 400 · 404 `MEMORY_NOT_FOUND` |
| `DELETE …/memory/:memoryId` | 2667 | — | 200 `{eliminata:true, id, titolo}` | 404 `MEMORY_NOT_FOUND` |

Le tre `GET` di ELENCO (`…/notes`, `…/tasks`, `…/memory`) **non sono state toccate**: restano
quelle del Capability hub, servite da `session-registry.mjs` — file fuori dal mio lotto (§6).

Contorno, uguale per tutte:

- **Tetto del corpo dichiarato per risorsa** (`magazziniDellaPersona`, riga 1902): 64 KB per le
  note, 16 KB per attività e memorie. ⛔ Serve davvero: il tetto globale è **4.096 byte**
  (`MAX_REQUEST_BODY_BYTES`), e con quello gli 8.000 caratteri ammessi dal magazzino delle note
  sarebbero **irraggiungibili** — la richiesta morirebbe con un 413 prima che il conto sui
  caratteri possa dire «è troppo lunga». Stesso difetto misurato l'11/09 su «Migliora il prompt».
- **Allowlist esplicita di chiavi** (`corpoConChiaviAmmesse`, riga 1347; i quattro lettori 1369-1410):
  una chiave sconosciuta è un **400**, mai un campo ignorato in silenzio. I tetti veri (120/8.000
  caratteri, i tre `priorita`, i quattro `genere`) restano nei magazzini — l'unico posto che li
  dichiara e lo stesso che li applica agli attrezzi del modello.
- **Query rifiutata** (`requireNoQuery`) e **nessun percorso dal client**: la cartella la sceglie il
  server, chi chiama nomina una sessione e un id.
- **Sessione verificata prima di toccare il disco** (`sessionRegistry.esiste`): sessione assente ⇒
  404 `NOT_FOUND`, distinto dal 404 della voce.
- **Sei codici nuovi** con il loro stato e il loro messaggio: `NOTE_INVALID`/`NOTE_NOT_FOUND`,
  `TASK_INVALID`/`TASK_NOT_FOUND`, `MEMORY_INVALID`/`MEMORY_NOT_FOUND` (righe 88-93, 246-251,
  411-416). Sono gli **stessi nomi** che lanciano i magazzini, mai tradotti in un secondo
  vocabolario — la regola scritta il 10/09 per la Libreria.
- **Preflight CORS** (righe 2001-2004): una VOCE di `library|notes|tasks|memory` ora annuncia
  `GET, HEAD, POST, PATCH, DELETE`. Senza, il mobile (l'unico caso cross-origin vero) non
  potrebbe **mandare** una modifica o una cancellazione. ⭐ La Libreria è stata infilata nella
  stessa riga: aveva lo stesso buco dal 10/09, trovato leggendo.

## 4. IL CONTRATTO PER IL FRONTEND (JSON verbatim)

Ogni risposta è nella busta di sempre: `{ "ok": true, "data": …, "meta": {…} }`.
Le tre forme pubbliche sono calcolate in **un posto solo** — `formaPubblicaNota`
(`notes-store.mjs:141`), `formaPubblicaAttivita` (`tasks-store.mjs:112`), `formaPubblicaMemoria`
(`memory-store.mjs:107`) — così ogni superficie che le mostra vede le stesse identiche chiavi.

### Nota

```json
{
  "id": "6d0f2f3e-1f7a-4a1e-9a3c-0a1b2c3d4e5f",
  "titolo": "Codice cancello",
  "contenuto": "# Il codice\n\n4471",
  "formato": "markdown",
  "creataAlle": "2026-09-11T21:14:03.117Z",
  "aggiornataAlle": "2026-09-11T21:19:40.882Z",
  "origine": "persona"
}
```

- `formato`: `"markdown" | "testo"`. **Dichiarato vince, altrimenti rilevato a ogni lettura**
  (`rilevaFormatoNota`, `notes-store.mjs:107`). Chi non dichiara niente (il modello, che nei suoi
  attrezzi non ha quel campo) vede il formato aggiornarsi da solo quando il contenuto cambia.
  Sul `PATCH`, `"formato": null` significa **«smetti di dichiararlo, torna a rilevarlo»** — è
  l'unico modo di disfare una dichiarazione sbagliata. In creazione `null` è un 400.
- `origine`: `"persona" | "modello"`. Scritto **dalla porta**, non dal corpo: `origine:'persona'`
  esiste solo nelle rotte HTTP, e il corpo non ha quella chiave. Una voce senza `origine` sul disco
  è del **modello** (fino a oggi era l'unica porta che scriveva). ⛔ Modificare una nota **non
  cambia** chi l'ha creata.
- `creataAlle` / `aggiornataAlle`: ISO 8601, sempre presenti (`null` solo per una voce scritta da
  una versione più vecchia del prodotto).

### Attività

```json
{
  "id": "b6b7…",
  "titolo": "Chiama idraulico",
  "descrizione": "rubinetto cucina",
  "stato": "todo",
  "fatta": false,
  "priorita": "high",
  "creataAlle": "2026-09-11T21:14:03.117Z",
  "aggiornataAlle": "2026-09-11T21:14:03.117Z",
  "origine": "persona"
}
```

- `stato`: `"todo" | "doing" | "done"`. `priorita`: `"low" | "normal" | "high"` (default `normal`).
- `fatta`: **calcolata** da `stato === "done"`, mai scritta sul disco. Esce dalla porta perché un
  pannello ha bisogno di una casella da spuntare, ma la verità resta una sola.
- `descrizione`: `string | null` (una descrizione di soli spazi diventa `null`).
- ⛔ **Nessuna `scadenza`**, benché il brief la nominasse. Non esiste nel magazzino e non esiste in
  nessun attrezzo del modello: `tasks-store.mjs:18-28` dichiara alla fonte che le colonne mobile
  non esposte dai tool (`schedule_json`, `instruction`, `last_run_at`) **non sono state portate**, e
  un campo scrivibile solo dalla persona sarebbe esattamente l'asimmetria che questo lotto chiude.
  Se l'owner la vuole, è una riga in più nei DUE posti (magazzino + attrezzo del modello), non qui.

### Memoria

```json
{
  "id": "a1c2…",
  "titolo": "Risposte brevi",
  "contenuto": "Preferisco risposte brevi",
  "genere": "preference",
  "creataAlle": "2026-09-11T21:14:03.117Z",
  "aggiornataAlle": "2026-09-11T21:14:03.117Z",
  "origine": "persona"
}
```

- `genere`: `"preference" | "project_fact" | "procedure" | "policy_note"` (default `preference`).
- ⭐ **La creazione può NON creare**: se esiste già una memoria con lo stesso titolo (confronto
  senza maiuscole e senza spazi ai bordi) la risposta è **200** con `"duplicato": true` e la voce
  **già esistente** — il testo nuovo **non** sovrascrive quello vecchio. È la deduplicazione
  dichiarata in `memory-store.mjs` («una seconda memoria accanto alla prima» è una contraddizione
  che si autoalimenta). Il pannello deve dirlo a chi ha premuto «salva», non far finta di aver
  creato qualcosa: `data.duplicato` è lì per questo. Note e attività **non** hanno quel campo.

### Errori

```json
{ "ok": false, "error": { "code": "NOTE_NOT_FOUND", "message": "Questa nota non esiste più",
  "title": "…", "explanation": "…", "action": "…", "doctorReference": "…" }, "meta": {…} }
```

| Situazione | Stato | `code` |
|---|---|---|
| La sessione non esiste | 404 | `NOT_FOUND` |
| La voce non esiste (o è appena stata cancellata da un'altra scheda) | 404 | `NOTE_NOT_FOUND` / `TASK_NOT_FOUND` / `MEMORY_NOT_FOUND` |
| Corpo malformato, chiave non ammessa, PATCH vuoto, query in coda | 400 | `QUERY_INVALID` |
| Titolo vuoto, contenuto oltre il tetto, `priorita`/`genere`/`stato` fuori vocabolario | 400 | `NOTE_INVALID` / `TASK_INVALID` / `MEMORY_INVALID` |
| Metodo sbagliato su una rotta che esiste | 405 + `Allow` esatto | `METHOD_NOT_ALLOWED` |
| Corpo oltre il tetto della rotta | 413 | `PAYLOAD_LIMIT` |

⛔ **Il `message` di un 400 è generico** («Query non valida»): `public-problem.mjs` sostituisce il
testo vero per ogni codice fuori da una allowlist che oggi contiene solo `SESSION_NOT_READY`. Il
motivo preciso c'è ma sta nel registro diagnostico, dietro il `doctorReference`. ⇒ **Il frontend
valida PRIMA di mandare** (chiavi ammesse e tetti sono in questa pagina) invece di aspettarsi che
il server spieghi. §6 dice perché non ho alzato quella policy.

## 5. Le prove (nei due versi)

`harness-ui/tests/http-routes-note-attivita-memoria.test.mjs` — **10 prove, tutte verdi**, su un
server vero (porta libera, mai la 4174) con i tre magazzini in una **cartella temporanea**:

1. **Note, il giro intero**: crea → 201 + `Location` → rileggi (identica) → modifica (un campo non
   mandato non si svuota, e il `formato` diventa `markdown` appena il contenuto prende un `#`) →
   elimina → il file **è sparito dal disco**.
2. **Al contrario**: chiave non ammessa 400 · corpo vuoto 400 · `PATCH {}` 400 · contenuto di 8.001
   caratteri 400 `NOTE_INVALID` · `GET`/`PATCH`/`DELETE` su un id inesistente 404 `NOTE_NOT_FOUND`.
3. **Formato**: dichiarato vince sul rilevato e **resta sul disco**; `formato:null` lo fa tornare a
   rilevarsi; `"html"` è 400; `null` in creazione è 400.
4. **Attività**: crea → PATCH priorità → `PATCH {stato}` **400** (non è un campo della PATCH) →
   `POST /stato {done}` → `fatta:true` → riapri con `{todo}` → stato inventato 400 → id inesistente
   404 → elimina.
5. **Memoria**: crea 201 · stesso titolo con altre maiuscole/spazi ⇒ **200 `duplicato:true`**, il
   contenuto vecchio resiste e **sul disco c'è UNA voce, non due** · `genere` inventato 400 · elimina.
6. **PARITÀ (la prova che conta)**: una nota scritta dalla rotta della persona è vista da
   `elencaNote` — la funzione **identica** che `agent-service.mjs` lega all'attrezzo `notes_list`;
   una nota scritta dal magazzino (il modello) si legge dalla rotta e dice `origine:'modello'`;
   modificarla dalla porta della persona **non** le cambia padrone; stesso giro per attività e
   memorie.
7. **Sessione inesistente**: 404 `NOT_FOUND` su tutte e cinque le porte, **e nessuna scrittura
   arriva al disco**.
8. **Query in coda**: 400.
9. **405 con l'`Allow` vero**, sette rotte una per una; e al contrario un nome vicino ma inventato
   (`/notes/abc/stato`, `/memoria`) resta **404**, non 405.
10. **Preflight CORS**: una voce annuncia `PATCH, DELETE`; la collezione no.

`harness-ui/tests/http-inventario-rotte.test.mjs` — aggiunta la prova che le sette righe nuove
dichiarano i metodi **esatti** (e che `/notes/:id/stato` **non** esiste). Il guardiano che rilegge
il sorgente copre già le rotte nuove: se domani qualcuno ne aggiunge una senza la riga
nell'inventario, diventa rosso.

**Suite intera, una volta alla fine**: `node --test tests/*.test.mjs` ⇒ **2422 pass / 0 fail** (24,7 s);
`node --test labs/electron-shell/*.test.mjs` ⇒ **8 pass / 0 fail**.

## 6. Cosa NON ho verificato, e cosa ho lasciato fuori apposta

- ⛔ **Nessun giro visivo e nessun giro col modello**: è un lotto di backend, il brief lo vieta.
  Nessuna rotta nuova è stata provata dal 4174 né da un pannello vero — solo da prove automatiche.
- ⛔ **Le tre GET di ELENCO sono invariate** e restano la proiezione leggera del Capability hub
  (`session-registry.mjs`, fuori dal mio lotto): gli elementi dell'elenco **non** portano
  `formato`, `origine` e `creataAlle` — quelli escono dalla `GET` di una voce sola e dalle risposte
  di `POST`/`PATCH`. ⇒ **Decisione per l'owner**: se il pannello deve mostrare il badge «scritta da
  te» o rendere markdown **nell'elenco** senza una richiesta per riga, serve una riga in
  `session-registry.mjs` (3 proiezioni da allargare a `formaPubblica*`) — un file che stasera ha un
  altro agente dentro. Non l'ho toccato.
- ⛔ **`scadenza` non c'è** (§4, Attività): scelta dichiarata, non dimenticanza.
- ⛔ **Il motivo preciso di un 400 non esce dalla busta** (§4, Errori). La cura sarebbe una riga in
  `public-problem.mjs` (`MESSAGGIO_GIA_PER_LA_PERSONA`), ma quel file governa **tutti** i codici e i
  messaggi dei magazzini oggi parlano di `title`/`content` — nomi di campo, in inglese: vanno
  riscritti **per una persona** prima di poter uscire a schermo. Registrato, non fatto di nascosto.
- ⛔ **`origine` è nuovo sul disco**: le voci scritte prima di oggi non ce l'hanno e vengono lette
  come `'modello'`. Nessuna migrazione, nessun file riscritto — il campo assente **è** l'informazione.
- ⛔ **Concorrenza**: due scritture simultanee sulla stessa voce restano «l'ultima vince», come
  prima (un file JSON per voce, `writeFile` intero). Non l'ho cambiato e non l'ho provato.
- ⛔ **Non ho toccato** `research*`, `session-registry.mjs`, `kernel/`, `workspace-files.mjs`,
  `frontend/`. In `http-app.mjs` ci sono anche modifiche di un altro agente (albero dei file,
  «apri» sulle cartelle): le sue righe sono intatte, nessun revert.

## 7. Aggiunta dello stesso giorno — L'ANTEPRIMA DI UN PDF DENTRO TALOS

Ordine dell'owner sulla Libreria: «il file deve essere **visualizzato renderizzato**». Per un PDF
non mancava niente al frontend: erano **tre intestazioni** della rotta di scarico, misurate una per
una in `.claude/RAPPORTO-LIBRERIA-ANTEPRIMA-2026-09-11.md` §4 (fonti MDN `Content-Disposition` e
CSP `sandbox`, lette l'11/09/2026).

| Il difetto | Perché impediva la resa |
|---|---|
| `Content-Disposition: attachment` | un `<iframe>` su quell'indirizzo **scarica** il file invece di mostrarlo |
| `Content-Type: application/octet-stream` + `nosniff` | il browser non può trattarlo da PDF nemmeno volendo |
| `Content-Security-Policy: default-src 'none'; sandbox` | `sandbox` senza valore «prevents the execution of plugins»: spegne il lettore PDF integrato anche se i primi due fossero a posto |

**La cura** — una rotta **gemella**, non un parametro dello scarico:

| | |
|---|---|
| Rotta | `GET /api/v1/sessions/:id/library/:voceId/anteprima` |
| Inventario | `src/http-app.mjs:887` — `metodi: ['GET']` |
| Blocco | `src/http-app.mjs:2370-2425` (`libreriaAnteprimaMatch`), subito dopo lo scarico |
| Corpo | lo **stesso** dello scarico: `sessionRegistry.scaricaVoceLibreria` — stessa lettura, stesso controllo di appartenenza alla sessione |
| Intestazioni | `Content-Type: application/pdf` · `Content-Disposition: inline; filename="…"; filename*=UTF-8''…` · `Content-Security-Policy: default-src 'none'; sandbox allow-scripts; object-src 'none'` · `X-Content-Type-Options: nosniff` · `Cache-Control: private, no-store` |
| Solo `.pdf` | il tipo si decide dall'**estensione del nome** (non sensibile alle maiuscole), **mai** dal `mediaType` salvato nella scheda — quell'etichetta l'ha scritta chi ha salvato il file, spesso il modello, e non è mai stata verificata sui byte. Ogni altra estensione è **404**: così la rotta non diventa un modo generico di servire byte in linea |
| Due 404 distinti | `LIBRARY_NOT_FOUND` = la voce non c'è · `NOT_FOUND` = la voce c'è ma **non** ha un'anteprima (non è un PDF) |
| Non toccato | la CSP della **pagina** (ha già `frame-src 'self'`) e la rotta `/file`, che resta ostile: `attachment`, byte anonimi, niente plugin |

**Prove** — `harness-ui/tests/http-routes-library-anteprima.test.mjs`, **5 prove verdi**, tutte sulle
INTESTAZIONI (un test fermo a «200 e i byte giusti» sarebbe passato anche **prima** della cura):
`.pdf` → 200 `inline` + `application/pdf` + la CSP nuova + byte identici · `.PDF` maiuscolo → 200 ·
`.md` → **404 `NOT_FOUND`** · voce inesistente → 404 `LIBRARY_NOT_FOUND` · sessione inesistente →
404 `NOT_FOUND` · query in coda → 400 · `POST` → 405 con `Allow: GET, HEAD` · **e la gemella `/file`
non è cambiata** (guardiano contro una futura «semplificazione» che unisse le due rotte e rendesse
di nuovo eseguibile in linea uno scarico).

**Suite intera dopo l'aggiunta**: `node --test tests/*.test.mjs` ⇒ **2422 pass / 0 fail**.

⛔ **Non verificato**: nessuna prova dal vivo in un `<iframe>` vero (niente 4174, niente giro
visivo): so che le intestazioni ora sono quelle che i tre difetti chiedevano, **non** ho visto un
PDF disegnarsi a schermo. Serve una foto del frontend prima di chiamarlo chiuso.
⛔ **Trovato per strada, non curato**: l'inventario aggiunge `HEAD` a ogni rotta `GET`, ma i blocchi
che servono byte (`/file`, `/anteprima`, `/tree/file`) si aprono solo su `method === 'GET'` — una
`HEAD` su quegli indirizzi cade in fondo e risponde 404 mentre l'`Allow` del 405 dice «GET, HEAD».
È di prima di oggi e vale per tutte e tre: registrato, non toccato in questo lotto.
