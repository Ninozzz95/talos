# L5 — le rotte della ricerca approfondita: la sezione smette di essere di sola lettura

Lane `lane/harness-desktop`, 12/09/2026. Implementa il lotto **L5** di
`.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md` (§6.6, §6.7, §6.8, §7), col «sì» dell'owner
alle rotte di scrittura.

⛔ Nessun giro col modello, nessuna richiesta al 4174, nessun `git`, nessuno screenshot.
⛔ Nessun file di `frontend/`, di `src/research/*` o di `kernel/` toccato.
⛔ Una deviazione dall'elenco dei file, dichiarata e motivata in §3.5: quattro righe in
`src/public-problem.mjs`.

---

## 1. Cosa c'era, prima

| fatto | prova |
|---|---|
| di ricerche c'era **UNA** rotta, l'elenco | `http-app.mjs`, `ROTTE_API`: `/sessions/:id/research` → `['GET']`, e basta |
| il MODELLO aveva otto attrezzi (`research_start/list/read/rename/pause/resume/cancel/delete`), la PERSONA nessuno | `session-registry.mjs:2727-2742`, gli otto `onRicerca*` |
| la sezione lo scriveva pure, sotto l'elenco | `RAPPORTO-PORTING-SEZIONI-2026-09-11.md`, punto 3: «un pulsante lì sarebbe una promessa che nessuna rotta può mantenere» |
| l'elenco mandava la sola pagina, senza dire quante fossero | la pagina è tagliata a **20** (`clampNumero(pageSize, 1, 20, 10)`), e il registro chiedeva `page_size: 50` credendo di riceverne 50 |
| il dettaglio non esisteva: per vedere affermazioni e fonti il browser avrebbe dovuto **ri-parsare** il blocco ```` ```talos-research-report ```` | `leggi()` esponeva `contenutoRapporto` (markdown intero) e nient'altro di strutturato |
| `recheck.mjs` — il «+1.1» del disegno — era ancora **senza chiamanti** | L3a/L3b lo dichiarano; L4 ha agganciato `report.mjs`, `run.mjs`, `verification.mjs`, `fetch-cache.mjs`, non questo |

---

## 2. Ricerca web PRIMA di scrivere — fonte + data, e cosa ha cambiato il codice

⚠️ **`WebSearch` era esaurito** (200/200 per questa sessione, come per il disegno e per L1-L4):
tutto preso con **`WebFetch` diretto** su fonti primarie, lette il **12/09/2026**. Rassegna mirata
alle due domande che il brief lasciava aperte (quale codice per «non ancora disponibile»; cosa deve
garantire una rotta che va a leggere pagine di altri), **non** esaustiva.

| # | fonte | letta | cosa ha cambiato |
|---|---|---|---|
| **S1** | **MDN, «501 Not Implemented»** — <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/501> | 12/09/2026 | ⛔ **Il vincolo che non conoscevo, e che ha deciso il codice.** «`501` is the appropriate response when the server does not recognize the request **method**», e «A `501` response is **cacheable by default** unless caching headers instruct otherwise». ⇒ 501 non è «una funzione non ancora implementata»: riguarda il METODO, e — peggio — un «non ancora disponibile» messo in cache dal browser **sopravviverebbe al giorno in cui diventa disponibile**. La ri-verifica indisponibile risponde **409**, e la scelta è scritta accanto al codice (`http-app.mjs:269-281`) |
| **S2** | **MDN, «409 Conflict»** — <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/409> | 12/09/2026 | «indicates a request conflict with the **current state of the target resource**», e l'esempio della pagina è *esattamente* il nostro caso: `{"code":"AutomationConflict", "message":"Task locked. Cannot start a new automation since job is already running."}`. ⇒ 409 per «esiste, ma non è nello stato per questo» (pausa su una ferma, ripresa su una senza giornale, ri-verifica su un rapporto senza passaggi), **distinto** dal 404 «non esiste» e dal 400 «la richiesta è malformata» |
| **S3** | **OWASP, «Server Side Request Forgery Prevention Cheat Sheet»** — <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html> | 12/09/2026 | «verify the value against an **allowed list of protocols** (HTTP or HTTPS)»; indirizzi che risolvono a RFC1918/loopback da bloccare; «**Disable the support for the following of the redirection** … to prevent the bypass of the input validation». ⇒ la ri-verifica **non scrive un secondo lettore del web**: riusa `leggiPaginaPerLaVista` → `leggiPaginaSicura` del kernel, cioè la stessa validazione già scritta e provata per l'attrezzo `naviga`. Due validazioni sullo stesso confine sono due validazioni che divergono |
| **S4** | **MDN, «202 Accepted»** — <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/202> | 12/09/2026 | «A `202` response is **non-committal**, meaning there is no way to later send an asynchronous HTTP response to indicate the outcome», e il pattern vuole un `monitorUrl` da interrogare. ⇒ la ri-verifica risponde **200 col risultato**, non 202: la elaborazione finisce **dentro** la richiesta (letture in sequenza, tetto di 20 fonti) e l'esito si può dire. Un 202 ci avrebbe obbligati a una rotta di stato che non esiste |
| **S5** | **RFC 9110** — <https://www.rfc-editor.org/rfc/rfc9110.html> | 12/09/2026, **parzialmente** | ⛔ Va detto: il documento è tornato **troncato** da `WebFetch` due volte, e le sezioni 15.5.6/15.5.10/15.6.2 non si sono lette alla lettera. Il vincolo dell'`Allow` sul 405 non viene quindi da qui oggi: viene dall'inventario delle rotte già in questo repo (`ROTTE_API`, 07/09), che quella citazione ce l'ha e la applica. Segnato come lettura **non riuscita**, non come lettura fatta |

⭐ **E prima ancora, dentro il proprio codebase** (lezione 06/09 «chi guarda da fuori inventa quello
che dentro aveva già»): il CRUD di Libreria (10/09) e quello di Note/Attività/Memoria (11/09) avevano
**già** deciso ogni questione di forma — due righe d'inventario per famiglia, `*_NOT_FOUND` distinto
da `NOT_FOUND`, 200 con la busta standard invece di 204, il 404 deciso dalla porta mentre il
magazzino resta idempotente per il modello, `nomiDellaRichiesta` per le sequenze percent non valide.
**Non ho inventato un terzo modo**: ho copiato quello, e dove me ne sono staccato l'ho scritto.

---

## 3. Le rotte, file:riga

### 3.1 `src/http-app.mjs` — l'inventario e i codici

| dove | cosa |
|---|---|
| `:31` | import di `idRicercaValido` da `research-store.mjs` — la **stessa** regola che decide se un id può diventare il nome di una cartella, mai una seconda scritta qui |
| `:98-110` | i quattro codici nuovi in `API_ERROR_CODES`: `RESEARCH_INVALID` (già lanciato da `ResearchStoreError`, qui solo dichiarato), `RESEARCH_NOT_FOUND`, `RESEARCH_CONFLICT`, `RESEARCH_RECHECK_UNAVAILABLE` |
| `:269-281` | gli stati: **400 / 404 / 409 / 409**, col perché di 409-e-non-501 (S1, S2) |
| `:450-453` | `MESSAGE_BY_CODE`: quattro frasi per una persona, che non nominano né il codice né la cartella |
| `:962-964` | le **due righe** dell'inventario: `…/research/:id/(pausa\|ripresa\|riverifica)` → `['POST']`; `…/research/:id` → `['GET','DELETE']`. Due e non una, così l'`Allow` del 405 dice il vero su ognuna; le tre azioni in una riga sola con l'alternanza (come `/git/(stage\|unstage\|commit)`) perché hanno davvero lo stesso insieme di metodi |
| `:1416-1436` | `requireCorpoSenzaParametri` — l'allowlist **vuota**. ⛔ Non è pedanteria: un corpo ignorato è un corpo che qualcuno manderà credendo che serva (`{"forza":true}`), e passerebbe in silenzio. Corpo assente e `{}` restano leciti |
| `:2810-2937` | **il blocco delle rotte**: `ricercaVoceMatch` (GET/DELETE) e `ricercaAzioneMatch` (POST). Sessione verificata con `esiste`, id validato, `requireNoQuery`, corpo letto **prima** di agire (un rifiuto dopo l'effetto non è un rifiuto), tre assenze tre risposte |
| `:5326` | l'elenco espone **`totale`** |

⛔ **Nessuna logica di ricerca in questo file.** Ogni rotta chiama una funzione del registro, che
chiama la stessa dell'orchestratore che chiama l'attrezzo del modello.

⭐ **La GET del dettaglio e la risposta di pausa/ripresa passano dalla stessa lettura**
(`:2922-2936`): dopo un'azione riuscita la risposta è **la voce aggiornata**, letta dal lettore del
dettaglio. Due conseguenze volute: la riga e la scheda non possono divergere, e la frase inglese
dell'attrezzo (scritta per il MODELLO) non finisce mai in una risposta destinata a uno schermo
italiano.

### 3.2 `src/research-orchestrator.mjs` — `riverifica()`, e il dettaglio strutturato

| dove | cosa |
|---|---|
| `:86-110` | import di `talosResearchRecheckReport` e `talosResearchSupportLabel`, con scritto **cosa oggi non si può misurare** (vedi §3.4) |
| `:490-506` | `leggiPaginaFn`, iniettabile, **default `null`**: qui dentro non si costruisce un secondo lettore del web (S3). Se resta `null` la ri-verifica lo **dice** invece di provarci |
| `:533-540` | `TETTO_FONTI_RIVERIFICA = 20` — `recheck.mjs` gira **in sequenza** per scelta sua, quindi un rapporto con cinquanta fonti terrebbe aperta una richiesta per minuti. Oltre il tetto la risposta porta `troncata: true` e `fontiTotali` |
| `:1051-1175` | **`riverifica({cartella, id})`**: tre cancelli prima di spendere una richiesta HTTP (ricerca assente → `{trovata:false}`; nessun record verificabile → motivo; niente di misurabile → motivo), poi il motore vero, poi la **normalizzazione onesta** degli stati |
| `:1340-1389` | `leggi()` espone **`affermazioni`**, **`fonti`**, **`sintesi`**, **`giudice`**. `null` — mai `[]` — quando il record non c'è |
| `:1396` | `riverifica` nell'oggetto congelato |

⛔ **Costo per il modello: zero.** `formattaLetturaRicerca` (kernel) legge solo `trovata`,
`contenutoRapporto` e `stato`: i campi nuovi non entrano in nessun prompt. Verificato nel kernel
(`talosHarness.mjs:2623-2629`), non supposto.

### 3.3 `src/session-registry.mjs` — solo le righe che espongono

| dove | cosa |
|---|---|
| `:31-36` | import di `leggiPaginaPerLaVista` |
| `:1414-1421` | `leggiPaginaFn` iniettabile (default: quello vero), **passato** all'orchestratore a `:1551` |
| `:1556-1585` | `azioneSuRicerca` — la forma comune di pausa e ripresa, scritta una volta |
| `:4308` | `elencaRicerche` espone `totale` |
| `:4311-4405` | i cinque passacarte: `leggiRicerca`, `pausaRicerca`, `riprendiRicerca`, `riverificaRicerca`, `eliminaRicerca` |

⛔ **Il 404 lo decide il DISCO, non la mappa delle sessioni vive.** `mettiInPausa` risponde «there is
no research with that id» anche a una ricerca che esiste benissimo su disco ma non sta girando —
frase giusta per il modello, che cerca qualcosa da fermare, **falsa** per la persona che ha quella
riga sotto gli occhi. Si legge prima il disco: assente ⇒ 404, presente ⇒ 409 con l'esito.

⛔ **`eliminaRicerca` guarda prima e poi cancella**, e non è una lettura sprecata: `elimina()`
dell'orchestratore è **idempotente per contratto col modello** («There was no research with that id
— nothing to delete») e quella proprietà non si tocca; ma rispondere «fatto» a una persona che
guarda un elenco vecchio le confermerebbe uno schermo sbagliato. Due contratti per due chiamanti,
nessuno dei due piegato.

### 3.4 ⛔⛔⛔ La ri-verifica: cosa misura davvero, e cosa NON può misurare oggi

Questa è la parte del lotto in cui era più facile mentire, quindi va per esteso.

`talosResearchRecheckReport(deps, report, keptByUrl)` misura **due cose di natura diversa**:

1. **quanta parte del testo tenuto sopravvive** — un'euristica (shingle, contenimento), che dà
   `intact` / `changed`;
2. **se ogni passaggio citato è ancora ritrovabile** nella pagina di oggi — «nessuna euristica,
   nessuna soglia, nessuna opinione» (parole del modulo).

La **(2)** funziona oggi: il passaggio sta nel **record del rapporto**, e la pagina la si rilegge.
La **(1) no**, e il motivo è strutturale: `keptByUrl` vuole il testo tenuto **per url**, e sul disco
di oggi non è ricostruibile — `fonti/<sha256>.txt` prende il nome dal **contenuto** (nessun url), e
il giornale porta `resultRef` ma non l'indirizzo da cui quel testo viene. Il collettore che
scriverebbe l'indice non è agganciato (L4 §7.3 lo dichiara già per la cache del fetch).

⛔ **E qui il modulo, chiamato senza saperlo, risponde una bugia educata**: con una mappa vuota
`talosResearchSurvival` torna **1** («niente di ciò su cui ci appoggiavamo è sparito») e ogni fonte
esce **`intact`**. Sarebbe un timbro «intatta» su una pagina che nessuno ha confrontato — esattamente
il segno di verifica falso che tutto il disegno esiste per togliere.

⇒ **La rotta non pubblica `intatta` quando il testo tenuto manca.** Pubblica `non-misurabile`,
`sopravvissuto: null` (mai `1`: uno e «non misurato» non sono lo stesso numero), `misurabile: false`
e un'`avvertenza` che dice perché. `irraggiungibile` invece è vero e resta.
Il bilancio si fa sugli stati **normalizzati** e non con `talosResearchRecheckStanding`, che
conterebbe fra le «intatte» proprio quelle che non abbiamo potuto misurare: scritto accanto al
codice, perché non sembri una dimenticanza.

⇒ **409 quando non resta niente da misurare**: nessun record verificabile (compreso il caso delle
ricerche vecchie passate col ripiego in prosa — hanno un rapporto vero e pagato, ma non i passaggi),
oppure record senza nemmeno un passaggio citato. Con motivo. Mai «ricontrollata, tutto a posto».

**Il giorno in cui il collettore scriverà un indice url→ref, la riga da cambiare è una sola**
(`research-orchestrator.mjs:1096-1099`) e il resto comincerà a dire `intatta`/`cambiata` da solo.

### 3.5 La deviazione dall'elenco dei file, dichiarata

**`src/public-problem.mjs`, quattro voci nella mappa `MESSAGES`** (`:31-42`). Non era nei miei file, e
l'ho fatto lo stesso perché **interrogando la rotta vera** ho visto la stessa voragine che il 07/09
era costata a O-49: un codice senza voce qui cade sulla copia di `INTERNAL_ERROR`, e a schermo una
ricerca cancellata dieci secondi prima diventava

> **Operazione non riuscita** · «Si è verificato un problema imprevisto durante l'operazione» ·
> «Apri Doctor, copia il riferimento e riprova»

— falso due volte: non è imprevisto, ed è l'unica cosa che Doctor non può spiegare. Il brief chiede
«codici d'errore con stato+messaggio»: un messaggio che dice il contrario del vero non lo è.
Quattro righe di dati, nessuna logica toccata, e un test che le morde (§5).

---

## 4. Il contratto JSON per il frontend — verbatim, preso dalla rotta vera

Non ricopiato a mano: **stampato interrogando il server** con un banco identico a quello dei test.

### 4.1 `GET /api/v1/sessions/:id/research` — l'elenco

```json
{
  "ok": true,
  "data": {
    "ricerche": [
      {
        "id": "5c50d581-f0e8-418b-9188-e36d6d43b992",
        "domanda": "Come stanno evolvendo gli harness agentici desktop nel 2026",
        "question": "Come stanno evolvendo gli harness agentici desktop nel 2026",
        "titolo": "Come stanno evolvendo gli harness agentici desktop nel 2026",
        "nome": "Come stanno evolvendo gli harness agentici desktop nel 2026",
        "stato": "done",
        "avviataAlle": "2026-09-11T23:12:14.497Z",
        "conclusaAlle": "2026-09-11T23:12:14.510Z",
        "reportLibraryId": "lib-c4c2b351-f991-41d9-b077-8a0a02452816",
        "motivo": null,
        "padreId": "24ab4c67-ba60-4e13-b499-91ff4bd8a48a",
        "ultimoMessaggio": "Ho depositato il rapporto.",
        "bilancio": { "totali": 2, "sostenute": 0, "inParte": 0, "nonSostenute": 0, "contese": 0, "nonVerificate": 2 },
        "proveDistinte": 1
      }
    ],
    "totale": 1,
    "errore": null
  },
  "meta": { "schema": "talos.harness-ui.api.v1", "generatedAt": "…" }
}
```

- **I quattordici campi c'erano già** (L4 li ha portati da quattro a quattordici, `bilancio` e
  `proveDistinte` compresi): **verificato, non duplicato**. Quello che mancava era `totale`.
- `totale` ≥ `ricerche.length`: la pagina è tagliata a **20** dall'orchestratore (tetto del contratto
  verso il modello, non cambiato da qui). Con 34 ricerche la sezione ne riceve 20 e adesso **sa** che
  ce ne sono 34. La riga «ne restano N» la deve scrivere il frontend.
- `bilancio: null` ≠ cinque zeri: è «non misurato». `stato: 'senza-rapporto'` arriva anche qui.

### 4.2 `GET /api/v1/sessions/:id/research/:ricercaId` — il dettaglio (**nuova**)

```json
{
  "ok": true,
  "data": {
    "ricerca": {
      "id": "5c50d581-…", "domanda": "…", "question": "…", "titolo": "…", "nome": "…",
      "stato": "done",
      "avviataAlle": "2026-09-11T23:12:14.497Z",
      "conclusaAlle": "2026-09-11T23:12:14.510Z",
      "reportLibraryId": "lib-c4c2b351-…",
      "motivo": null,
      "padreId": "24ab4c67-…",
      "ultimoMessaggio": "Ho depositato il rapporto.",
      "bilancio": { "totali": 2, "sostenute": 0, "inParte": 0, "nonSostenute": 0, "contese": 0, "nonVerificate": 2 },
      "proveDistinte": 1,
      "contenutoRapporto": "…il markdown intero, col blocco ```talos-research-report…",
      "contenutoRespinto": null,
      "affermazioni": [
        {
          "numero": 1,
          "testo": "Gli harness convergono sul controllo del computer.",
          "fonte": 1,
          "passaggio": "gli harness convergono sul controllo del computer",
          "ritrovato": false,
          "tratto": null,
          "verdetto": "unchecked",
          "verdettoUmano": "non verificata",
          "motivoVerdetto": null,
          "giudice": null,
          "giudicataAlle": null,
          "contrarie": null
        }
      ],
      "fonti": [
        { "numero": 1, "url": "https://esempio.invalid/fonte-1", "titolo": "Fonte uno", "pubblicataAlle": "2026-08-01", "ottenuta": "page" },
        { "numero": 2, "url": "https://esempio.invalid/fonte-2", "titolo": "Fonte due", "pubblicataAlle": null, "ottenuta": "snippet" }
      ],
      "sintesi": "Convergono su controllo del computer, permessi per attrezzo e memoria persistente.",
      "giudice": null,
      "piano": [],
      "passi": [],
      "spesa": { "tokens": 0, "searches": 0, "pages": 0 },
      "giornale": { "eventi": 2, "righeSaltate": 0, "stato": "done" }
    },
    "errore": null
  },
  "meta": { "schema": "talos.harness-ui.api.v1", "generatedAt": "…" }
}
```

**Per chi disegna §6.7, le regole di lettura, una per una:**

- **Rapporto** → `contenutoRapporto` (markdown, si rende col render della chat). Se il cancello ha
  respinto, `contenutoRapporto` è `null` e il testo depositato sta in **`contenutoRespinto`**: si
  mostra come «ciò che la ricerca ha depositato, e che non passa il controllo» — **mai** come
  rapporto. È il guasto dell'11/09, e non va rifatto dentro la sua cura.
- **Affermazioni** → `affermazioni`. `verdettoUmano` è già la frase da stampare (esce dalla stessa
  funzione che scrive la prosa del rapporto: due frasari sarebbero due verdetti). `passaggio: ""`
  vuol dire **«non ci è mai stato trovato»**, non «vuoto». `tratto` sono gli offset per evidenziare.
  `contrarie: null` = non guardato; `[]` = guardato e nessuna: **non si leggono uguali**.
- **Fonti** → `fonti`. `ottenuta: "page"` = pagina aperta e letta; `"snippet"` = solo l'estratto
  della ricerca. Il **gruppo di indipendenza** di §6.7 **non c'è ancora** (vedi §6).
- **Piano** / **Come è andata** → `piano`, `passi`, `spesa`, `giornale`. Oggi `piano: []` e
  `passi: []` su ogni ricerca vera: i passi di raccolta li apre il kernel con `naviga`/`web_search`,
  che non passano dall'orchestratore (L4 §6.1). `[]` è onesto, non è un piano finto.
  `giornale.righeSaltate > 0` va **detto**: «si è caricato» e «si è caricato per intero» non sono la
  stessa frase.
- `affermazioni`/`fonti` **`null`** (non `[]`) quando non c'è un record: «non lo sappiamo» ≠ «nessuna».

### 4.3 Le tre azioni

| rotta | corpo | risposta |
|---|---|---|
| `POST …/research/:id/pausa` | **nessuno** (o `{}`) | 200, `data.ricerca` = la voce aggiornata (stesso schema di §4.2) |
| `POST …/research/:id/ripresa` | **nessuno** | 200, `data.ricerca` |
| `POST …/research/:id/riverifica` | **nessuno** | 200, `data.riverifica` (sotto) |
| `DELETE …/research/:id` | **nessuno** | 200, `data` = `{ "eliminata": true, "id": "…", "titolo": "…" }` |

⛔ Qualunque chiave nel corpo ⇒ **400** e la chiave viene nominata.

⛔ **La pausa è una RICHIESTA.** La risposta può ancora dire `stato: "running"`: il passaggio a
«in pausa» avviene al **punto sicuro** (`run_pause_requested` adesso, `run_paused` quando la corsa ci
arriva, perché in mezzo c'è del denaro). Il frontend non deve promettere «in pausa» sulla risposta:
deve mostrare ciò che la voce dice, e aggiornarsi.

```json
{
  "ok": true,
  "data": {
    "riverifica": {
      "id": "5c50d581-…",
      "fattaAlle": "2026-09-11T23:12:14.832Z",
      "misurabile": false,
      "avvertenza": "Il testo delle pagine non era stato tenuto per questa ricerca: «intatta» o «cambiata» non si possono dire. Ciò che si misura è se i passaggi citati sono ancora nella pagina di oggi.",
      "fonti": [
        { "url": "https://esempio.invalid/fonte-1", "titolo": "Fonte uno", "stato": "non-misurabile",
          "sopravvissuto": null, "motivoLettura": null, "passaggiRitrovati": 1, "passaggiPersi": 0 },
        { "url": "https://esempio.invalid/fonte-2", "titolo": "Fonte due", "stato": "irraggiungibile",
          "sopravvissuto": null, "motivoLettura": "unreadable", "passaggiRitrovati": 0, "passaggiPersi": 0 }
      ],
      "bilancio": { "fonti": 2, "intatte": 0, "cambiate": 0, "irraggiungibili": 1, "nonMisurabili": 1,
                    "passaggiCitati": 1, "passaggiRitrovati": 1, "passaggiPersi": 0 },
      "troncata": false, "fontiTotali": 2, "testiTenuti": 0
    }
  }
}
```

- `stato` ∈ `intatta | cambiata | irraggiungibile | **non-misurabile**`. Oggi, sui dati veri,
  `intatta`/`cambiata` **non escono mai**: vedi §3.4. Il frontend deve saper disegnare
  `non-misurabile` come «non confrontabile», **mai** come «a posto».
- Il numero che conta e che è vero oggi è **`passaggiPersi`**: una citazione che non risolve più alle
  parole che citava. `passaggiPersi: 0` su una fonte `irraggiungibile` **non è una buona notizia**:
  non si è potuto guardare.
- ⛔ La ri-verifica **non è persistita**: non c'è «l'esito dell'ultima ri-verifica, con la data» di
  §6.7 (vedi §6.2).

### 4.4 Gli errori

| caso | stato | `code` | `message` (a schermo) |
|---|---|---|---|
| la sessione non esiste | 404 | `NOT_FOUND` | (quella di sempre) |
| la ricerca non esiste | 404 | `RESEARCH_NOT_FOUND` | «Questa ricerca non esiste più» |
| id malformato | 400 | `RESEARCH_INVALID` | «Richiesta non valida per la ricerca approfondita» |
| corpo con chiavi | 400 | `QUERY_INVALID` | (quella di sempre) |
| query sulla rotta | 400 | `QUERY_INVALID` | — |
| pausa/ripresa impossibile nello stato | 409 | `RESEARCH_CONFLICT` | «Questa ricerca non è nello stato giusto per questa azione» |
| ri-verifica non possibile | 409 | `RESEARCH_RECHECK_UNAVAILABLE` | «Non si può ancora ricontrollare questa ricerca» |
| metodo sbagliato | 405 | — | con `Allow` esatto (`POST`, oppure `DELETE, GET, HEAD`) |

Ogni busta porta anche `title` / `explanation` / `action` scritti per una persona (§3.5). Il motivo
**preciso** (in inglese, perché è la risposta scritta per il modello) viaggia in `errore.message` nel
registro diagnostico, non a schermo — come per ogni altra famiglia di questo server.

---

## 5. Le prove — `tests/http-routes-research.test.mjs` (nuovo, 14 test)

**Server VERO** su porta libera, **registro VERO** (`createSessionRegistry`), **magazzino VERO** su
disco temporaneo, `leggiPaginaFn` iniettata (nessuna rete). ⛔ Mai la 4174, mai i dati dell'owner.

⭐ **E la ricerca la avvia `onRicercaAvvia`**, cioè la porta esatta da cui la avvia il modello con
`research_start` — non `creaRicerca` a mano. Senza, nessuno di questi test direbbe niente sulla
sessione figlia, sul giornale o sulla ripresa.

**Il verso che dice di sì**
- i metodi veri, e il 405 con `Allow` esatto su **entrambe** le rotte nuove;
- elenco: **`totale`**, e i **quattordici** campi asseriti con `deepEqual` sulle chiavi ordinate (se
  il contratto cresce, rosso invece di divergere in silenzio); `padreId` = la chat che l'ha ordinata;
- dettaglio: `bilancio` reale, `proveDistinte`, `affermazioni` col `verdettoUmano`, `fonti`,
  `piano`/`passi` vuoti **onesti**, `giornale.stato`, `spesa`;
- **pausa**: 200, la voce aggiornata, e al punto sicuro `stato: 'paused'` con `giornale.stato:
  'paused'` e `conclusaAlle: null` (una pausa non finalizza niente);
- **riavvio + ripresa**: un registro **nuovo** sullo stesso disco, `ripristina()`, `POST ripresa` →
  200, e la sessione della ricerca **riparte davvero** con una consegna che porta la domanda **dal
  giornale** e lo speso;
- **ri-verifica vera**: tre fonti — una col passaggio ancora presente, una riscritta (risponde 200 e
  **non dice più** quella cosa: il caso pericoloso), una irraggiungibile — e le letture avvengono
  **in sequenza**, asserito sull'ordine;
- **DELETE**: la cartella intera sparisce dal disco (verificato con `existsSync` e `elencaRicerche`).

**Il verso che deve dire di no**
- «la sessione non c'è» e «la ricerca non c'è» sono **due 404 diversi**, su tutte e cinque le porte;
- id ostili (`a/b`, `C:\Windows`, `ric.1`, `../fuori`, 65 caratteri) → **400 prima di toccare il
  disco**; ⛔ e `%2E%2E` da solo **non** è nell'elenco, con il perché scritto: un segmento che è
  interamente un punto o due punti viene risolto dalla normalizzazione WHATWG **prima** che il
  server lo veda, quindi lì la risposta giusta è 404 e pretendere 400 avrebbe chiesto alla rotta una
  difesa che non le compete (misurato, non dedotto);
- corpo con chiave non ammessa → 400, **e la pausa non è avvenuta** (asserito rileggendo lo stato);
- query sulla rotta → 400;
- pausa/ripresa su una ricerca che non gira → **409**, non 404 e non 200;
- ri-verifica **senza** rapporto → 409; ri-verifica su un rapporto **senza passaggi citati** → 409;
- ri-verifica su una ricerca **vecchia** (forma `<id>.json`, rapporto in prosa, passata col ripiego)
  → 409, **e la sua scheda resta `done`**: mai timbrare «senza rapporto» su lavoro pagato;
- la scusa depositata → `contenutoRespinto` valorizzato, `contenutoRapporto: null`,
  `affermazioni: null`, `bilancio: null`, `motivo` in italiano;
- `RESEARCH_NOT_FOUND` porta la copia **giusta** e non quella di `INTERNAL_ERROR` (§3.5);
- seconda DELETE → **404**, non «fatto».

**Due difetti trovati provando, non leggendo** (e corretti nel banco, perché erano miei):
1. **`voce.conclusa` la segna l'EVENTO, non il ritorno della promessa.** Un finto `avviaSessioneFn`
   che risolve senza emettere `RunFinished` lasciava una ricerca in pausa a «running» **pur avendo
   `run_paused` nel giornale**: un banco così avrebbe misurato un prodotto che non esiste.
2. **Un'attesa a tempo misura la macchina, non l'oggetto.** La prima stesura dormiva 60 ms e passava
   — finché la **suite intera** non l'ha eseguita sotto carico, e una conclusione non ancora scritta
   ha fatto leggere `paused` dove serviva `senza-rapporto`. Ora si attende una **condizione**
   (`finoA`, 10 ms di passo), e il fallimento dice cosa si è visto.

**I numeri**

```
node --test tests/*.test.mjs
ℹ tests 2436   ℹ pass 2436   ℹ fail 0   (24,7 s)
```

Erano **2422** prima di questo lotto. ⛔ `npm run verify:all` **non** è stato lanciato, deliberatamente:
è quello che il 04/09 apriva Chrome sul **4174 vivo** e avviava una sessione a pagamento.
`npm run typecheck` non esiste in questo `package.json` (gli script sono `build:ui`, `verify:ui`,
`verify:all`, `aggiorna`, `kernel:controlla`, `test:kernel`, `veli:sani`).

---

## 6. Cosa NON ho verificato, e cosa resta aperto

1. **Nessun giro col modello, nessun 4174, nessuno screenshot, nessun `git`.** Tutto è provato a filo
   intero su un filesystem temporaneo. ⛔ Nessuno di questi test dimostra che `glm-5.3-flash`
   produca un record recintato valido, né che la sezione disegni bene ciò che le arriva: sono **L8**
   e **L7**. Vale la lezione già pagata («il giro vero trova quattro difetti che 80 test verdi non
   vedono»).
2. **La ri-verifica non è persistita.** §6.7 vuole, per ogni fonte, «l'esito dell'ultima ri-verifica
   — intatta/cambiata/irraggiungibile — **con la data**»: oggi il risultato vive solo nella risposta
   HTTP. Non l'ho scritto nel giornale **apposta**: il giornale è la prova di ciò che la **corsa** ha
   speso (`run.mjs` conosce undici `kind` e li elenca nel suo typedef), una ri-verifica fatta
   settimane dopo non è un passo di quella corsa, e scrivere un dodicesimo `kind` avrebbe toccato
   `src/research/`, fuori dal mio perimetro. ⇒ **serve un magazzino suo** (`recheck-history.mjs`
   esiste già, portato e senza chiamanti): registrato, non risolto.
3. **`intatta`/`cambiata` non escono mai sui dati veri**, per il motivo strutturale di §3.4. Il
   lavoro che le sblocca è **L6** (il collettore agganciato, che tiene il testo con il suo url).
   Finché non c'è, la ri-verifica misura una metà — quella vera — e lo dichiara in ogni risposta.
4. **Il gruppo di indipendenza (§6.7, +1.2) non è nel contratto.** `independence.mjs` è portato ma
   senza chiamanti, e il record recintato non porta i gruppi: la vista Fonti non può ancora dire
   «7 prove distinte su 14 indirizzi». `proveDistinte` c'è (da L4) ed è un'altra cosa: fonti diverse
   con almeno un passaggio ritrovato.
5. **L'elenco resta tagliato a 20 per pagina.** Ho esposto `totale` invece di alzare il tetto: quel
   `clampNumero(pageSize, 1, 20, 10)` è il contratto verso il **modello** (`research_list`), e
   cambiarlo da qui avrebbe cambiato anche quello. La sezione non ha ancora una paginazione: se
   l'owner ne vuole una, serve un parametro di query sulla rotta (oggi `requireNoQuery` li rifiuta
   tutti) — **non fatto, non deciso**.
6. **Trovato per strada, NON mio, non corretto — e va deciso da chi possiede `riprendi()`:** una
   ricerca messa in **pausa** e poi sopravvissuta a un riavvio del server viene ripristinata
   `conclusa: true` e quindi `interrotta: false`, e `riprendi()` la rifiuta con
   **«That research is still running: nothing to resume»** — frase falsa, e rifiuto sbagliato: una
   ricerca in pausa deve potersi riprendere, è l'unica ragione per cui si mette in pausa. In
   produzione il caso è **mascherato** dalla via A (dopo un riavvio `messaggiFinali` viene
   ripristinato dal JSONL, quindi si riprende la conversazione), e si scopre solo quando quella
   manca. La guardia è `research-orchestrator.mjs` `riprendi()`, `if (!voce.interrotta)`: dovrebbe
   guardare «il giornale dice `paused`», non «la sessione è interrotta». **Segnalato, non toccato**:
   è oltre «una funzione mancante».
7. **`motivoLettura` arriva dal lettore di pagine e finisce in una risposta di successo** (esempio
   reale: `"unreadable"`). È troncato a 200 caratteri ma **non** passa da `safeDiagnosticDetail`: se
   un giorno quel lettore mettesse un percorso locale nel messaggio d'errore, quel percorso
   uscirebbe. Non misurato su errori veri di rete — **debito dichiarato**.
8. **Il tetto di 20 fonti per ri-verifica non è tarato su niente.** È scelto perché le letture sono
   sequenziali e una richiesta HTTP non può durare minuti; non ho misurato quanto duri una
   ri-verifica vera su venti pagine reali, perché non ne ho fatta nessuna in rete.
9. **`kernel:controlla` resta rosso** come prima di questo lotto (le due copie del kernel divergono):
   non causato da qui, non toccato.
10. **`C:\tmp\x` esiste sul disco della macchina** (vuota). È la stessa scoria già dichiarata da L4
    §7.7, viene da `preparaEsecuzioneFinta` di `session-registry.test.mjs`: **non** dai test di
    questo lotto, che usano solo cartelle `mkdtemp`. Verificato dopo la corsa completa.
