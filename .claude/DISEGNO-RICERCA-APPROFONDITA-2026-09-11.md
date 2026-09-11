# Ricerca approfondita — disegno tecnico comparato (11/09/2026)

Lane `lane/harness-desktop`. **Documento di disegno: nessuna riga di codice di prodotto scritta.**
Tutto ciò che segue è stato letto alla fonte o misurato sui dati veri del 4174 **in sola lettura**
(`GET /api/v1/sessions`, `GET /api/v1/sessions/<id>/events`, `GET /api/v1/sessions/<id>/research`) e
sui file su disco. Nessun giro col modello è stato avviato.

---

## 1. Riproduzione del guasto sui dati veri

La ricerca che l'owner ha visto stasera è `d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35`. Non è una
ricostruzione: è la riga vera, gli eventi veri e i file veri.

### 1.1 Chi l'ha avviata

La sessione madre è `86fad6e7-53c8-4786-9c14-694fd47894ec` — progetto **Desktop**, modello
`deepseek/deepseek-v4.1-flash`, permessi **Full access**. Nei suoi eventi, in ordine:

```
RUN  "ok adesso vorrei fare partire un aricerca approfondita di prova su cosa la cosnigli di fare?"
RUN  "harness dekstop , mi intriga, approvato"
CALL research_start
RES  "Started the research «Come stanno evolvendo gli harness agentici desktop nel 2026 …»
      (id d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35). It runs in the background …"
```

⇒ **L'ha avviata il modello dalla chat**, con l'attrezzo `research_start`, non la sezione. La sezione
«Ricerca approfondita» non ha alcun pulsante che avvii una ricerca (verificato: nessuna rotta di
scrittura su `/research`, `harness-ui/src/http-app.mjs:842` dichiara `metodi: ['GET']`).

### 1.2 Con quale permesso è partita

`GET /api/v1/sessions`, riga della sessione figlia, verbatim:

```json
{"sessionId":"d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35","taskId":"ricerca","nome":null,
 "avviataAlle":"2026-09-11T18:56:46.049Z","modello":"z-ai/glm-4.7-flash",
 "permessi":"Read only","padreId":null,"profonditaDelega":0,
 "usage":{"prompt_tokens":484171,"completion_tokens":5008,"cached_tokens":0,"giri":11}}
```

Tre fatti misurati, non dedotti:

- **`permessi: "Read only"`** — mentre la madre che l'ha ordinata era `Full access`. Il permesso non
  si eredita: è **scritto a mano** nel codice (§2.1).
- **`padreId: null`** — la figlia non è agganciata alla madre. Nell'albero sessione la ricerca non
  compare come figlia di nessuno, ed è per questo che all'owner è sembrata «una sessione nuova»:
  lo è, in tutto e per tutto, anche nel registro.
- **`cached_tokens: 0` su 484.171 token di ingresso, 11 giri.** La ricerca ha pagato **tutto** a
  prezzo pieno, con **1 compattazione** (`RunFinished.result.compattazioni: 1`). Nessuna cache.

### 1.3 Che cosa ha fatto, e come è finita

Dagli eventi (`GET .../events`, 325 eventi utili, 25 chiamate ad attrezzi):

| attrezzo | chiamate |
|---|---|
| `web_search` | **9** |
| `naviga` | **14** |
| `document_create` | **2** — entrambe **rifiutate** |

Il risultato della prima `document_create`, verbatim:

```
REFUSED. la sessione è in sola lettura: nessuna scrittura, comando o documento è permesso
in questo momento. Nothing was created.
```

E il `RunFinished` del primo giro:

```json
{"outcome":{"type":"success"},
 "result":{"detto":"La sessione è in sola lettura, quindi non posso creare documenti
 direttamente. Tuttavia, posso darti il contenuto completo in un formato pronto per essere
 salvato, o posso provare a scriverlo in un file del workspace. Vuoi che cerchi il modo per
 salvarlo in un file markdown nel workspace?","compattazioni":1, …}}
```

⇒ `outcome: success`. Per il kernel la corsa **è riuscita**.

### 1.4 Dove è finito il rapporto — la prova

`.harness-ui-research/d2a453a8-….json`, sul progetto **Desktop** (`C:\Users\Antonino\Desktop`),
verbatim:

```json
{
  "id": "d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35",
  "domanda": "Come stanno evolvendo gli harness agentici desktop nel 2026 …",
  "profondita": "deep", "titolo": null,
  "avviataAlle": "2026-09-11T18:56:46.041Z", "aggiornataAlle": "2026-09-11T19:00:33.549Z",
  "terminata": "done",
  "reportLibraryId": "lib-de24350b-5937-417a-b11f-ba77c31e4cf4"
}
```

Un rapporto **c'è**: `.harness-ui-library/lib-de24350b-…/`. `meta.json` dice
`"nome": "Research - Come stanno evolvendo gli harness agentici desktop nel 2026 e quali capacità (controllo computer, mo.md"`,
`"origine": "generated"`. Il file `contenuto` è lungo **290 byte**, ed è questo, per intero:

> La sessione è in sola lettura, quindi non posso creare documenti direttamente. Tuttavia, posso
> darti il contenuto completo in un formato pronto per essere salvato, o posso provare a scriverlo
> in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown nel workspace?

⇒ **Il rapporto salvato in Libreria È la scusa.** 9 ricerche web, 14 pagine aperte, 484.171 token di
ingresso pagati, e il documento permanente è la frase con cui il modello si giustifica per non averlo
scritto. Nessun errore da nessuna parte: `outcome: success`, `terminata: "done"`.

### 1.5 Che cosa mostra la sezione

`GET /api/v1/sessions/d2a453a8-…/research` risponde:

```json
{"ricerche":[{"id":"d2a453a8-…","titolo":"Come stanno evolvendo gli harness agentici desktop …",
 "stato":"done","avviataAlle":"2026-09-11T18:56:46.041Z"}],"errore":null}
```

Quattro campi. **`reportLibraryId` non esce dalla rotta** (§2.4): la sezione non ha, letteralmente,
il modo di sapere dove sia il rapporto. Perciò mostra «Conclusa» e sotto, scritta a mano in
`harness-ui/public/index.html:1011`:

> «Fino a 20 ricerche recenti di questo progetto. **La consultazione del rapporto e delle fonti non
> è ancora disponibile qui.**»

### 1.6 Il seguito dell'owner, e perché non ha rimediato

Alle 19:12 l'owner ha scritto **dentro la sessione di ricerca**: «salvalo solo nella lobreria».
Secondo `RunStarted` con `seguito: true`, seconda `document_create`, **stesso rifiuto**. La risposta
finale ricomincia da «Mi dispiace, ma la sessione attuale è in modalità **sola lettura**…».

E il guaio è che quel giro **non ripara neanche il record**: `onConclusioneFn` è passato solo alla
prima chiamata di `avviaESegui` (`research-orchestrator.mjs:171`); un giro di seguito nella stessa
sessione non lo porta (`session-registry.mjs:2810/2840/2846`). La metadata resta ferma a
`aggiornataAlle: 19:00:33`, `terminata: "done"`, con il puntatore alla scusa.

⇒ **Dalla chat non esiste una via per rimediare.** Nemmeno quella che l'owner ha provato.

---

## 2. La causa, con file:riga

Non è un difetto: sono **cinque**, in fila, e ognuno da solo sarebbe innocuo.

### 2.1 Il permesso è scritto a mano, e vieta la consegna

`harness-ui/src/research-orchestrator.mjs:165-177`:

```js
async function avvia({ cartella, question, depth }) {
    const id = randomUUIDFn();
    await creaRicercaFn({ cartella, id, domanda: question, profondita: depth || 'deep' });
    avviaESeguiFn({
      sessionId: id, cartella, taskId: 'ricerca', task: { consegna: promptRicerca(question, depth) },
      permessiRichiesti: 'Read only',                                    // ← riga 170
      onConclusioneFn: (risultato) => onConclusioneRicerca({ cartella, id, risultato }),
    });
```

La doc di testa dello stesso file (righe 31-34) dichiara la scelta come difesa in profondità:

> «`permessi:'Read only'` — la ricerca non deve MAI scrivere/eseguire nel progetto ospite, solo
> cercare/leggere/sintetizzare: difesa in profondità, il prompt lo dice E il permesso lo garantisce,
> mai uno solo dei due.»

Il ragionamento è giusto e **la conseguenza non era stata vista**: una ricerca che non può scrivere
**non può consegnare**. `'Read only'` diventa `livelloAccesso: 'lettura'`
(`session-registry.mjs:2557-2560`), e il cancello del kernel
(`harness-ui/src/kernel/talosHarness.mjs:4706-4708`) rifiuta **tutto** ciò che tocca il disco:

```js
if (!haOverride && livelloAccesso === 'lettura') {
    return { consentito: false, via: 'livello-lettura',
             motivo: 'la sessione è in sola lettura: nessuna scrittura, comando o documento è permesso in questo momento.' }
}
```

Non c'è una via di mezzo dichiarabile oggi: `'Workspace write'` permette `scrivi` **ma nega
esplicitamente `document_create`** (`talosHarness.mjs:4709-4712` e la tipologia a 4623-4636).
Cioè: **nessuno dei quattro livelli attuali descrive «può depositare il proprio rapporto e nient'altro»**.

### 2.2 L'attrezzo è offerto e poi negato

`harness-ui/src/session-registry.mjs:1436-1455` mette `document_create` e le mutazioni Libreria
nella lista `strumentiEstesi` **per ogni sessione**, con il commento che lo dichiara di proposito:

> «MUTANO davvero (passano dal gate di permesso nel kernel stesso), ma il loro OFFRIRLE al modello
> segue lo stesso principio "schema fisso, sempre in lista" … è `verificaPermessoScrittura` dentro
> `talosHarness.mjs`, non questa lista, a decidere se una chiamata passa.»

Verificato nel kernel: `livelloAccesso` compare **solo** dentro `verificaPermessoScrittura` e nelle
chiamate a essa (`grep -n livelloAccesso talosHarness.mjs` — 4660, 4689, 4706, 4709, 4731, poi solo
siti di chiamata da 6223 in giù). **La lista degli attrezzi non è mai filtrata dal permesso.**

⇒ Il modello vede un attrezzo che **per costruzione** non potrà mai usare, lo chiama, viene respinto,
e da lì in poi passa il resto del giro a spiegare all'utente perché non può. È la forma già nota in
questo repo — *un cancello che promette e nega* — applicata al caso in cui l'intera consegna dipende
da quell'attrezzo.

### 2.3 «L'ultimo messaggio» non è «il rapporto»

`harness-ui/src/research-orchestrator.mjs:73-81`:

```js
/** L'ultimo messaggio assistente con testo VERO — quello che diventa il rapporto. */
function estraiTestoRapporto(messaggiFinali) {
  for (let i = messaggiFinali.length - 1; i >= 0; i -= 1) {
    const m = messaggiFinali[i];
    if (m?.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0) return m.content.trim();
  }
  return null;
}
```

E `research-orchestrator.mjs:123-139`:

```js
const testo = estraiTestoRapporto(risultato?.esito?.messaggiFinali);
if (!testo) { await aggiornaRicercaFn({ cartella, id, terminata: 'failed' }); return; }
let reportLibraryId;
try { reportLibraryId = await salvaVoceLibreriaFn({ …, testo }); } catch { … }
const finitaBene = risultato?.esito?.comeFinita === 'concluso';
await aggiornaRicercaFn({ cartella, id, terminata: finitaBene ? 'done' : 'failed', reportLibraryId });
```

L'unico controllo è **«esiste del testo?»**. Una scusa di 290 byte è testo. Non c'è un controllo di
**forma** (un rapporto ha almeno un titolo, delle fonti, delle affermazioni), né di **lunghezza
minima rispetto al lavoro fatto** (23 chiamate a strumenti → 290 byte è un rapporto di 12 byte per
chiamata), né di **rifiuto** (nel giro c'erano due `REFUSED`, e nessuno li guarda).

⇒ È la stessa classe di difetto delle lezioni già in memoria: **`successo` non distingue una risposta
dal rifiuto di darne una**.

### 2.4 «Conclusa» è calcolato su `terminata`, e `terminata` non guarda il contenuto

`research-orchestrator.mjs:96-100`:

```js
function statoVivo(voceRicerca, voceSessione) {
    if (voceRicerca.terminata) return voceRicerca.terminata;
    if (!voceSessione || voceSessione.interrotta) return 'failed';
    return voceSessione.conclusa ? 'paused' : 'running';
}
```

e `research-orchestrator.mjs:243-256` (`elenca`) proietta **solo quattro campi**:

```js
const conStato = record.map((r) => ({ id: r.id, titolo: r.titolo || r.domanda,
                                      stato: statoVivo(r, sessioni.get(r.id)),
                                      avviataAlle: r.avviataAlle }));
```

`reportLibraryId` **non c'è**. Passa così anche nel registro (`session-registry.mjs:4183-4194`) e
nella rotta (`http-app.mjs:4530-4545`). Il frontend riceve `stato:'done'` e lo traduce in un timbro
verde: `harness-ui/frontend/src/components/ricerca.js:2`

```js
['done',{testo:'Conclusa',tono:'success'}]
```

⇒ Lo stato è **onesto sul processo** («la corsa è finita da sola») e **falso sul prodotto** («c'è un
rapporto»). Chi legge la sezione legge la seconda cosa.

### 2.5 La sezione non ha mai avuto un lettore — e il testo lo dice due volte, sbagliando

- `harness-ui/frontend/src/components/ricerca.js:21` — il pulsante c'è ma è spento da sempre:
  ```js
  const apri=el(doc,'button',…,'Apri rapporto'); apri.type='button'; apri.hidden=true; apri.dataset.richiede='fase3';
  ```
- `harness-ui/public/index.html:1011` — «La consultazione del rapporto e delle fonti non è ancora
  disponibile qui.»
- La sezione **nuova** (porting mockup dell'11/09, `.claude/RAPPORTO-PORTING-SEZIONI-2026-09-11.md`)
  eredita il debito e lo scrive nel dettaglio, `frontend/src/components/sezioni-adattatori.js:467-468`:
  > «Di questa ricerca il server manda per ora soltanto titolo, stato e data di avvio. Il rapporto e
  > le fonti vivono in .harness-ui-research/, dentro il progetto, e non si consultano ancora da qui.»
  > «Lo stato "Conclusa" non certifica le fonti del rapporto.»
- ⛔ **Quasi-incidente dichiarato**: `sezioni-adattatori.js:418` dice
  `['done', 'Il rapporto è stato scritto in .harness-ui-research/.']` — **è falso**.
  `.harness-ui-research/` contiene **solo** la metadata JSON; il rapporto sta in
  `.harness-ui-library/<lib-id>/contenuto` (`research-orchestrator.mjs:132`,
  `research-store.mjs:56-60`). La frase manda l'owner a cercare in una cartella dove il rapporto non
  c'è. L'ho trovata leggendo, non da uno screenshot — e l'ho quasi copiata nel disegno prima di
  aprire la cartella vera.
- ⛔ **Secondo quasi-incidente**: stavo per scrivere che il rapporto non era stato salvato. È stato
  salvato: `lib-de24350b-…` esiste. Se non avessi aperto il file `contenuto` avrei descritto un
  difetto diverso (e più facile) da quello vero.

### 2.6 Riassunto della catena

```
research_start (chat, madre Full access)
   └─ avvia()  ── permessiRichiesti:'Read only'  [scritto a mano, §2.1]
        └─ sessione figlia, padreId:null  [non agganciata, §1.2]
             └─ 9 web_search + 14 naviga  ── 484.171 token, cache 0
                  └─ document_create ──> REFUSED  [attrezzo offerto e negato, §2.2]
                       └─ ultimo messaggio = la scusa
                            └─ estraiTestoRapporto() la prende  [§2.3]
                                 └─ salvata in Libreria come "Research - …md" (290 byte)
                                      └─ terminata:'done'  [§2.4]
                                           └─ sezione: «Conclusa» + «non consultabile qui»  [§2.5]
```

Nessun errore, nessun rosso, nessun test che cada. **Cinque decisioni ragionevoli che insieme
producono una bugia.**

---

## 3. Cosa fa il mobile oggi

`AVM/mobile/src/lib/research/` — **21 file, 4.229 righe** (più `tools/researchTools.ts`, 429, e i due
schermi, 2.025). Letto file per file; sotto, le capacità con file:riga.

### 3.1 Portabilità nel kernel Node — verificata file per file

Requisito per §6: sono TypeScript senza Vue? **Sì, 20 su 21.**

```
grep -ln "from 'vue'|@capacitor|@/services|@/stores" *.ts   →   researchRegistry.ts   (solo)
grep -n  "window\.|localStorage|navigator\."  *.ts          →   nessuno
```

(Gli unici `document.` sono un **parametro** di nome `document` che contiene una stringa Markdown —
`researchDossier.ts:72-79`, `researchReport.ts:162-169` — non il DOM.)

| file | righe | dipendenze esterne | portabile tale e quale |
|---|---:|---|:--:|
| `researchRun.ts` | 492 | nessuna | ✅ |
| `researchVerification.ts` | 544 | nessuna (solo `researchOpposing`) | ✅ |
| `researchSynthesis.ts` | 282 | nessuna | ✅ |
| `researchOpposing.ts` | 279 | nessuna | ✅ |
| `researchPlan.ts` | 271 | nessuna | ✅ |
| `researchCard.ts` | 211 | nessuna | ✅ |
| `researchRecheckHistory.ts` | 176 | nessuna | ✅ |
| `researchRecheck.ts` | 176 | nessuna | ✅ |
| `researchReport.ts` | 175 | nessuna | ✅ |
| `researchLedger.ts` | 162 | nessuna | ✅ |
| `researchCollector.ts` | 155 | nessuna (I/O per `deps`) | ✅ |
| `researchNarration.ts` | 150 | nessuna | ✅ |
| `researchIndependence.ts` | 147 | nessuna | ✅ |
| `researchCitationExport.ts` | 118 | nessuna | ✅ |
| `researchFidelity.ts` | 115 | nessuna | ✅ |
| `researchOpenCards.ts` | 112 | nessuna | ✅ |
| `researchDossier.ts` | 94 | nessuna | ✅ |
| `researchOutline.ts` | 85 | nessuna | ✅ |
| `researchRecheckDocument.ts` | 57 | nessuna | ✅ |
| `researchPdf.ts` | 259 | `@/lib/documents/reportBuilder` | ⚠️ serve anche quello |
| `researchRegistry.ts` | 169 | **`vue` (`shallowRef`)**, `@/services/researchRuntime` | ❌ si riscrive (è 169 righe di mappa + watcher) |

⇒ **~3.800 righe di logica pura** sono portabili. Tutte usano `deps` iniettate per l'I/O
(`researchCollector.ts:61-88`, `researchVerification.ts:116-140`, `researchRecheck.ts:85-89`): la
rete e il disco entrano da fuori, che è esattamente ciò che serve per farle girare nel kernel Node.

⛔ **Non sono senza costo**: sono TypeScript, e `harness-ui/src/` è ESM `.mjs` puro. Vedi §7 lotto 0.

### 3.2 Le capacità del mobile, con la riga che le prova

| # | capacità | dove | in una riga |
|---|---|---|---|
| M1 | **Macchina a stati event-sourced** | `researchRun.ts:158-201` (11 eventi), `:250-397` (`talosResearchApply`), `:398-410` (`talosResearchReplay`) | lo stato si **rigioca** dal giornale; un evento incoerente viene **ignorato**, mai un throw, perché «un giro che non si può rigiocare è lavoro pagato perso» (`:239-249`) |
| M2 | **Dieci stati, non tre** | `researchRun.ts:58-68` | `planning · awaiting_plan_approval · collecting · synthesising · verifying · pause_requested · paused · done · cancelled · failed` |
| M3 | **`pause_requested` ≠ `paused`** | `researchRun.ts:41-57` | «drain then checkpoint»: il passo già pagato si finisce, poi si riposa. Collassarli farebbe mentire lo schermo |
| M4 | **`interrupted` ≠ `failed`** | `researchRun.ts:89-96` | «il primo è un risultato, il secondo è una domanda — e solo il secondo vale la pena di riprovare» |
| M5 | **Chiave di idempotenza senza il numero di tentativo** | `researchRun.ts:203-216` | due tentativi dello stesso passo devono essere riconoscibili come **lo stesso**, così il fornitore può deduplicare: «ogni ricerca è denaro» |
| M6 | **Piano approvabile prima di spendere** | `researchPlan.ts:101-137`, stato `awaiting_plan_approval`, eventi `plan_proposed`/`plan_approved` (`researchRun.ts:168-169`) | 2/4/6 rami secondo la profondità (`:43-47`), un ramo per **faccia** della domanda (`:63-70`: fatti e numeri · fonti contrarie · chi lo dice e con quale interesse · quanto è recente · casi reali · cosa resta incerto) |
| M7 | **Piano modificabile** | `researchPlan.ts:217-268` (`…PlanWithout`, `…PlanWith`, `…PlanReworded`) | togliere, aggiungere, riformulare un ramo |
| M8 | **Costo detto prima — e il rifiuto di inventarlo** | `researchPlan.ts:139-216` | il **lavoro** (ricerche, pagine, minuti, token) è aritmetica e si mostra sempre; il **denaro** solo dove un prezzo pubblicato è stato davvero ottenuto, altrimenti «non conoscibile da qui»: «un prezzo inventato è peggio di nessun prezzo, perché verrebbe creduto» (`:11-22`) |
| M9 | **Verifica a tre livelli** | `researchVerification.ts:21-43` | **L1** come è stata ottenuta la fonte (pagina / estratto / mai raccolta) · **L2** il passaggio è davvero nel testo tenuto, **e dove** (`talosResearchLocate:191-203`, offset) · **L3** quel passaggio sostiene quell'affermazione — **una** affermazione contro **un** passaggio |
| M10 | **Il giudice non è l'autore** | `researchVerification.ts:209-250` | `talosResearchPickJudge` scarta chi ha scritto; `talosResearchJudgeOrder` ordina: motore **sul dispositivo** (gratis, di nessuna famiglia) → altro fornitore → **ultimo** il fornitore dell'autore con un modello diverso. Nessun giudice ⇒ `unchecked` **scritto**, mai un passaggio auto-concesso |
| M11 | **«Contesa» ≠ «parziale»** | `researchVerification.ts:45-63`, `researchOpposing.ts:159-272` | parziale = una fonte lo dice a metà; **contesa** = due fonti dicono l'opposto. Si cerca **apposta** una fonte contraria e si affiancano le due versioni |
| M12 | **Indipendenza delle fonti: gruppi, non URL** | `researchIndependence.ts:1-30`, `:64-146` | tre siti che riprendono lo stesso comunicato **non sono tre prove**. Tre regole difendibili sul dominio registrabile, con la lista dei secondi livelli (`:45-56`) per non fondere `bbc.co.uk` e `theguardian.co.uk` |
| M13 | **Quattro misure di fedeltà, con `null` onesto** | `researchFidelity.ts:37-70` | copertura · fedeltà delle citazioni · ancoraggio · **prove distinte**. «Un numero su cui nessuno ha giudicato non è un numero basso: **non è un numero**» — ogni quota è `number \| null`, e ogni punteggio esce **con la sua data** |
| M14 | **Il rapporto è un artefatto strutturato** | `researchReport.ts:79-152` | prosa per la persona **e** un record JSON recintato (` ```talos-research-report `) nello stesso file: affermazione, passaggio verbatim, offset, verdetto, **nome del giudice**, fonti con data dichiarata e «pagina letta / solo estratto» |
| M15 | **Il rapporto si rilegge, o ammette di non poterlo** | `researchReport.ts:154-175` | `null` invece di un recupero parziale: «un segno di verifica sbagliato è peggio di nessuno» |
| M16 | **Ri-verifica nel tempo (R12)** | `researchRecheck.ts:1-29`, `:76-160` | teniamo il **testo**, non l'URL ⇒ si può chiedere *«dice ancora questo?»*. Due misure di natura diversa: sopravvivenza del testo tenuto (shingle di 5 parole, **containment**, soglia 0,95 — `:33-37`, `:69-83`) e, senza soglia, **ogni passaggio citato è ancora ritrovabile?** |
| M17 | **Storia delle ri-verifiche** | `researchRecheckHistory.ts:43-151` | le tappe si accumulano in un blocco recintato dentro il documento, e si rileggono |
| M18 | **Registro «come è stato costruito»** | `researchLedger.ts:1-32`, `:34-110` | sommario → dettaglio → dati grezzi. **Pagine davvero aperte** contate dalle fonti (non dai passi), affermazioni **davvero giudicate** contate dai verdetti, falliti e interrotti **a parte**, tempo **lavorato** ≠ tempo d'orologio |
| M19 | **Sei secchi, e `running` lo decide il vivo** | `researchCard.ts:23-96` | `running` viene dal registro **vivo**, non dal giornale; `cancelled` e `paused` sono **decisioni** e non stanno con ciò che il telefono ha ucciso |
| M20 | **La scheda guida col bilancio, non col conteggio** | `researchCard.ts:4-21` | «tutti e cinque i concorrenti guidano col volume — "56 siti" — e nessuno dice se le affermazioni hanno retto» |
| M21 | **Esportazione delle citazioni** | `researchCitationExport.ts:80-118` | BibTeX e RIS |
| M22 | **Esportazione PDF a tre toni** | `researchPdf.ts:37-43`, `:236+` | `report` · `brief` · `dossier` |
| M23 | **Otto attrezzi, con la differenza scritta** | `tools/researchTools.ts:104-429` | `research_list · start · read · rename · pause · resume · cancel · delete`. La testa (`:21-31`) spiega **perché** non si confondono con `library_*`: «i rapporti di ricerca SONO file di Libreria» |
| M24 | **`start` torna subito** | `researchTools.ts:39-47` | «una ricerca dura minuti, e un tool che aspetta terrebbe occupato il giro di conversazione» |
| M25 | **Una pagina propria per il rapporto** | `screens/ResearchReportScreen.vue:1-20` | «il rapporto si apriva dentro una riga della lista — cinquemila parole sotto un elenco». Ora ha un indirizzo suo, guidato dal **bilancio** |

### 3.3 Che cosa il desktop ha preso, e che cosa ha dichiarato debito

`harness-ui/src/research-store.mjs:1-44` lo dice per esteso e onestamente (owner, 30/8: «Fetta onesta
(consigliato)»):

> «stesso CONTRATTO (nomi/schema/semantica dei tool), esecuzione riusando la macchina GIÀ costruita
> di Harness Desktop … **invece del motore event-sourced mobile (pianificazione a più linee di
> indagine, verifica/indipendenza/citazioni/approvazione piano) — dichiarato debito, non perso in
> silenzio.**»

⇒ Il desktop ha **M23, M24** e metà di **M19** (`statoVivo`). Di M1-M22 non ha **niente**.
Non è una scoperta di oggi: è scritto. Quello che è nuovo oggi è che **la fetta è troppo sottile per
reggere il proprio stato**: senza M14 (rapporto strutturato) non c'è nulla su cui `terminata:'done'`
possa essere controllato, e senza M20 non c'è nulla da mostrare nella sezione.

---

## 4. Cosa fanno i concorrenti

Letto nel codice clonato in `%LOCALAPPDATA%\Temp\talos-competitor` (Hermes `@365e283`, v0.21.0
«Pantheon»; Claude Code `f173a697`, 02/09/2026).

### 4.1 Che cosa ho trovato, con file:riga

**Hermes Agent v0.21 — l'obiettivo primario da battere.**
La ricerca profonda **non è una capacità nativa**: è una *optional skill* che avvolge un servizio di
terzi a pagamento.
- `optional-skills/research/parallel-cli/SKILL.md:16-23` — «Use `parallel-cli` … **This is an
  optional third-party workflow, not a Hermes core capability.** … Parallel is a paid service with a
  free tier».
- `:25-30` — ciò che la rende «agent-native»: `--json`, esecuzione non interattiva, **lavori asincroni
  lunghi con `--no-wait`, `status`, `poll`**, concatenamento di contesto con
  `--previous-interaction-id`.
- Nativamente Hermes ha `web_search` e `web_extract`
  (`website/docs/user-guide/features/web-search.md:10-14`), con **nove** fornitori e una rotazione
  keyless a giro (`:19-39`); `web_extract` ha un **budget di caratteri deterministico** (15.000 per
  pagina, testa 75% / coda 25%, resto **scritto su disco** con il percorso e la chiamata `read_file`
  esatta per sfogliarlo — `:47-57`, tetto 2 MB); e una **cache dei risultati** pensata proprio per il
  ventaglio di sotto-agenti che cercano la stessa cosa (`:65-70`).
- `optional-skills/research/research-paper-writing/SKILL.md:65` — «Never hallucinate citations.
  **AI-generated citations have ~40% error rate.** Always fetch programmatically. Mark unverifiable
  citations as `[CITATION NEEDED]`.» ⇒ Hermes **conosce** il problema e lo affronta **con una regola
  scritta nel prompt di una skill**, non con un controllo meccanico.
- Nessun negozio di rapporti, nessuno stato riprendibile, nessuna verifica misurata:
  `grep -ril "deep.research" hermes-agent-v21` dà 8 file, tutti documentazione, skill opzionali, test,
  e `toolset_distributions.py:59` («70% chance of browser tools for deep research»).

**Claude Code 2.1.x.** C'è un `/deep-research` vero, con un **verificatore**. Dal `CHANGELOG.md`
(sorgente non distribuito, quindi queste sono le sole prove disponibili):
- `:1601` (v2.1.196) — «Fixed `/deep-research` misreporting verifier failures as "all claims
  refuted" instead of `unverified`». ⇒ hanno **tre esiti** (sostenuta / smentita / **non
  verificata**) e hanno già pagato il prezzo di confonderne due — la stessa distinzione di M13.
- `:1360` (v2.1.207) — «Fixed Deep research runs labeling every Fetch-phase agent "unknown" — chips
  now show the source hostname». ⇒ le fasi sono **agenti separati** (Fetch è una fase nominata) e la
  UI mostra **da quale host** viene ogni pezzo.
- `:1035` (v2.1.218) — «Changed `/deep-research` to start only when invoked manually; **Claude no
  longer launches it on its own**». ⇒ hanno tolto l'avvio autonomo: è costoso e sorprendeva.
- Nessuna traccia di pausa/ripresa, ri-verifica nel tempo, o esportazione delle citazioni.

**Codex.** Solo un **ruolo** dichiarativo, non un motore:
`codex-rs/external-agent-migration/src/service_tests/general/detection.rs:746` —
`name: researcher … skills: [deep-research] … tools: Bash, Read … effort: high`.

**DeepSeek harness.** «Deep research» è un sotto-agente in background e basta:
`packages/subagent/tool-subagent/tests/tool-subagent.spec.ts:871` —
`callSubagent(ctx, { description: 'deep research', prompt: 'dig in', run_in_background: true })`.

**opencode.** Solo un ramo sugli identificativi di modello:
`packages/opencode/src/provider/transform.ts:629` — `if (id.includes("deep-research")) return ["medium"]`.

**cline.** Solo una voce di catalogo modelli:
`sdk/packages/llms/src/catalog/catalog.generated.ts:11676` — `"qwen-deep-research"`.

**openclaw.** Come opencode, solo un ramo sugli identificativi di modello:
`src/agents/models.profiles.live.test.ts:1262` — `if (id.includes("deep-research")) { … }`.

**OpenHands / goose / pi-mono.** `grep -ril "deep.research|deepresearch"` su tutto il clone:
**zero file**.

### 4.2 La tabella — stesse colonne per tutti

Legenda: ✅ c'è nel codice · ◑ parziale · ❌ assente · ▢ delegato a un servizio di terzi
· n/d non ispezionabile (sorgente non distribuito).

| # | capacità | **TALOS desktop oggi** | **TALOS mobile** | Hermes v0.21 | Claude Code 2.1.x | Codex | DSH | opencode/cline/goose/OpenHands/openclaw |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| C1 | ricerca lunga in background, avviabile dalla chat | ✅ | ✅ | ▢ | ✅ | ◑ | ◑ | ❌ |
| C2 | piano mostrato prima di spendere | ❌ | ✅ M6 | ❌ | n/d | ❌ | ❌ | ❌ |
| C3 | piano **approvabile e modificabile** | ❌ | ✅ M7 | ❌ | n/d | ❌ | ❌ | ❌ |
| C4 | costo/lavoro **detto prima** | ❌ | ✅ M8 | ❌ | ❌ | ❌ | ❌ | ❌ |
| C5 | più linee di indagine parallele | ❌ | ✅ M6 | ▢ | ✅ (fasi/agenti) | ❌ | ◑ | ❌ |
| C6 | citazione: il passaggio è **nel testo** (meccanico) | ❌ | ✅ M9-L2 | ❌ | n/d | ❌ | ❌ | ❌ |
| C7 | citazione: il passaggio **sostiene** l'affermazione | ❌ | ✅ M9-L3 | ❌ | ✅ | ❌ | ❌ | ❌ |
| C8 | il giudice **non è** l'autore | ❌ | ✅ M10 | ❌ | n/d | ❌ | ❌ | ❌ |
| C9 | «non verificata» distinta da «smentita» | ❌ | ✅ M13 | ❌ | ✅ (`:1601`) | ❌ | ❌ | ❌ |
| C10 | fonti **contrarie** cercate apposta | ❌ | ✅ M11 | ❌ | n/d | ❌ | ❌ | ❌ |
| C11 | fonti **indipendenti** contate a gruppi | ❌ | ✅ M12 | ❌ | ❌ | ❌ | ❌ | ❌ |
| C12 | rapporto come **artefatto strutturato** rileggibile | ❌ | ✅ M14-M15 | ❌ | n/d | ❌ | ❌ | ❌ |
| C13 | **consultazione nel prodotto** (piano, passi, fonti, rapporto) | ❌ | ✅ M25 | ❌ | ◑ (chip host) | ❌ | ❌ | ❌ |
| C14 | registro «come è stato costruito» | ❌ | ✅ M18 | ❌ | ◑ | ❌ | ❌ | ❌ |
| C15 | pausa / ripresa senza ripagare | ◑ (c'è il meccanismo, §6.6) | ✅ M3-M5 | ▢ (`--no-wait`+`poll`) | ❌ | ❌ | ❌ | ❌ |
| C16 | sopravvive alla morte del processo (giornale rigiocabile) | ❌ | ✅ M1 | ❌ | n/d | ❌ | ❌ | ❌ |
| C17 | **ri-verifica nel tempo** delle fonti | ❌ | ✅ M16-M17 | ❌ | ❌ | ❌ | ❌ | ❌ |
| C18 | esportazione citazioni (BibTeX/RIS) | ❌ | ✅ M21 | ❌ | ❌ | ❌ | ❌ | ❌ |
| C19 | esportazione PDF | ❌ | ✅ M22 | ❌ | ❌ | ❌ | ❌ | ❌ |
| C20 | lo stato dichiarato **è controllato** contro il prodotto | ❌ §2.4 | ◑ | ❌ | ❌ | ❌ | ❌ | ❌ |
| C21 | cache dei risultati web fra rami / sotto-agenti | ❌ (`cached_tokens:0`) | ❌ | ✅ | n/d | ❌ | ❌ | ❌ |
| C22 | budget deterministico per pagina, con spillover su disco | ❌ | ◑ (tetto fonti, `researchPlan.ts:99`) | ✅ | n/d | ❌ | ❌ | ❌ |

**Come si legge.** Il desktop ha **una** colonna piena su 22. Il mobile ne ha 19. Hermes — l'obiettivo
da battere — ne ha **tre**, e due (C21, C22) sono ingegneria del *fetch*, non della ricerca: sono
esattamente le due in cui **loro** sono avanti a noi **e al mobile**. Su tutto il resto della
ricerca profonda, Hermes non compete: delega a Parallel.ai.

⇒ Il «+1» non si dichiara: si legge nelle righe **C17, C11, C10, C20, C4** — nessun concorrente
ispezionato ne ha nessuna, e il mobile ne ha quattro su cinque. Vedi §6.8.

---

## 5. Fonti web — con data e col numero che portano

Ricerca fatta **prima** di scrivere §6. Scartato tutto ciò che non porta una misura.
⚠️ **`WebSearch` era esaurito per questa sessione** (200/200): tutte le fonti sotto sono state prese
con `WebFetch` **diretto** su arXiv/anthropic.com e sull'API di arXiv. Non ho potuto cercare per
parole chiave, quindi la rassegna è **ampia ma non esaustiva** — vedi §8.

| # | fonte | data | il numero che porta |
|---|---|---|---|
| F1 | **«Cited but Not Verified: Parsing and Evaluating Source Attribution in LLM Deep Research Agents»**, Onweller, Lumer, Huber, Ramchandani, Subbiah, Feld — [arXiv:2605.06635](https://arxiv.org/abs/2605.06635) | 07/05/2026 | il link risolve **>94%** delle volte; la fonte è in tema **>80%**; la fonte **sostiene davvero** l'affermazione solo **39-77%**. E l'accuratezza del *fact check* **cala di ~42%** passando da 2 a 150 recuperi ⇒ **il modo più profondo è quello con le citazioni meno affidabili** |
| F2 | **«Do LLM Attribution Metrics Transfer?»**, Ding, Nannapaneni, De la Cruz Weinstein — [arXiv:2606.23915](https://arxiv.org/abs/2606.23915) | 22/06/2026 | uno scorer NLI da scaffale fa **AUROC 0,90** su affermazioni corte e **crolla a 0,53 (il caso)** su risposte lunghe; le classifiche fra metriche **si invertono** fra dataset (Kendall τ = **−0,64**) ⇒ si giudica **un'affermazione contro un passaggio**, mai il rapporto intero |
| F3 | **«Beyond Single-shot Writing: Deep Research Agents are Unreliable at Multi-turn Report Revision»**, Chen, Li, Nie, Zhang, Ye, Zhao — [arXiv:2601.13217](https://arxiv.org/abs/2601.13217) | 19/01/2026 | su **5** agenti di ricerca profonda, una revisione chiesta dall'utente fa **regredire il 16-27%** del contenuto già coperto **e della qualità delle citazioni** ⇒ un rapporto «vivo» va **versionato**, non riscritto sopra |
| F4 | **«Mr.LHDR: A Benchmark for Multimodal Real-World Long-Horizon Deep Research Agents»**, Guo, Cao, Zhao et al. — [arXiv:2609.11318](https://arxiv.org/abs/2609.11318) | **10/09/2026** | catene di prove interdipendenti: **12,1** conclusioni intermedie per domanda, profondità media **10,4** passi; il sistema migliore fa **43,1%** di accuratezza complessiva e **34,3%** stretta ⇒ il collo è «integrazione sostenuta e coerente delle prove», non il recupero del singolo fatto |
| F5 | **«Sci-MMR: Benchmarking Multi-Step Evidence-Grounded Scientific Reasoning»**, Li, Yang, Xi et al. — [arXiv:2609.11243](https://arxiv.org/abs/2609.11243) | **10/09/2026** | 235 compiti, 8 modelli di punta: **l'accuratezza della risposta supera di oltre 20 punti** il recupero completo delle prove ⇒ **si risponde bene senza avere le prove**. Guasti: **57,2%** acquisizione delle prove, **31,8%** integrazione. Con le prove servite su un piatto, il migliore arriva al **69,1%** |
| F6 | **«Explore Before Committing: Hypothesis-Guided Search for Deep Research Agents»**, Zhou, Chen, Zhang, Gao, Teh, Chen — [arXiv:2609.01294](https://arxiv.org/abs/2609.01294) | **01/09/2026** | rami indipendenti **limitati**, confrontati per **prove** prima di scegliere: da **46,7 a 60,0** su BC-small (Qwen3.5-122B), **con meno chiamate ad attrezzi di cinque traiettorie indipendenti**; regge su 4 benchmark e 3 modelli |
| F7 | **«From Inertia to Objectivity: Improving Deep Research Agents with Noise Isolation»**, Zhang, Zhang, Fu, Lin, Wang — [arXiv:2608.23045v2](https://arxiv.org/abs/2608.23045) | 24/08/2026 (rev. 27/08) | «una volta che un agente ha prodotto una domanda, un piano o una conclusione intermedia, diventa **meno obiettivo** nel giudicarne le conseguenze» (benchmark IBIS); isolare il contesto ai punti di decisione: **−33% di costo in token**, un 8B pari a GPT-4o su GAIA/WebWalkerQA/BrowseComp |
| F8 | **«Not Worth Another Token: Marginal Value Estimation for Efficient Deep Research Agents»**, Kolukuluru et al. — [arXiv:2608.08389v2](https://arxiv.org/abs/2608.08389) | 09/08/2026 (rev. 01/09) | potatura del contesto per stadio: **fino a −73% di token** con poca perdita di qualità; «nessun metodo domina su qualità, efficienza e fedeltà insieme» |
| F9 | **«Carnot: Interpretable, Interactive, and Optimized Execution of Deep Research Queries»**, Russo, Agarwal, Li, Gu, Cafarella, Khattab, Kraska, Madden (VLDB 2026) — [arXiv:2608.09532](https://arxiv.org/abs/2608.09532) | 10/08/2026 | l'utente **vede il grafo di esecuzione compilato prima di eseguirlo** e può «criticare il piano, eseguire gli operatori a passi, ispezionare i dati intermedi, o modificare direttamente il codice»; scopo dichiarato: **intercettare le assunzioni allucinate** e governare costo e latenza. ⚠️ è un *demo paper*: **nessun numero** nell'abstract |
| F10 | **«Structurally-bounded Agentic Graph Exploration for Evidence-Grounded Scholarly DeepSearch»** — [arXiv:2608.24809](https://arxiv.org/abs/2608.24809) | 25/08/2026 | esplorazione **limitata strutturalmente** sul grafo delle citazioni, misurata a **recall@50** contro gli agenti di ricerca profonda aperti |
| F11 | **«DeepResearch Bench»**, Du, Xu, Zhu, Wang, Mao — [arXiv:2506.11763](https://arxiv.org/abs/2506.11763) | 13/06/2025 | **100** compiti da dottorato in **22** campi; introduce il **conteggio delle citazioni efficaci** e l'**accuratezza complessiva delle citazioni** come metrica a sé |
| F12 | **Anthropic, «How we built our multi-agent research system»** — [anthropic.com](https://www.anthropic.com/engineering/multi-agent-research-system) | 13/06/2025 | multi-agente **+90,2%** sul singolo agente; gli agenti usano **~4×** i token di una chat e i multi-agente **~15×**; **3-5** sotto-agenti in parallelo; la parallelizzazione taglia il tempo **fino al 90%**; e la ripresa si fa con «retry logic and regular checkpoints» che riprendono **da dove l'errore è avvenuto** |

**Cosa cambia nel disegno, per ciascuna.**
F1+F2 ⇒ la verifica deve essere **meccanica prima** (il passaggio è nel testo?) e **granulare poi**
(una affermazione, un passaggio); e va **rinforzata** proprio quando la ricerca è profonda, perché è
lì che peggiora. F3 ⇒ un rapporto modificato **si versiona**. F5 ⇒ la misura da mostrare non è
«risposta plausibile» ma **prove recuperate**. F6+F10 ⇒ i rami paralleli vanno **limitati** e
**confrontati per prove**, non moltiplicati. F7 ⇒ chi giudica non deve avere in contesto ciò che ha
prodotto — **conferma dall'esterno** M10 del mobile, che era stato scritto prima. F8+F12 ⇒ il costo
è **15×**, quindi la potatura e la cache non sono ottimizzazioni facoltative. F9 ⇒ far vedere e
**criticare il piano prima** è la direzione che sta prendendo anche la ricerca accademica.
F4 ⇒ il collo è **tenere insieme** le prove lungo una catena lunga.

---

## 6. Il disegno

### 6.1 Il principio

> **Una ricerca approfondita è un artefatto, non una conversazione.**
> La sessione è il modo in cui l'artefatto viene prodotto; l'artefatto è ciò che resta, si consulta,
> si riprende, si ri-verifica e si esporta. Oggi il desktop tiene solo la sessione e chiama
> «rapporto» l'ultima frase che ne esce.

Tre conseguenze, ognuna direttamente contro un difetto di §2:

1. **La consegna è un attrezzo, non un effetto collaterale.** Il rapporto si deposita con una
   chiamata esplicita che il kernel **permette** in una ricerca e **solo** verso il posto della
   ricerca (§6.3). Contro §2.1 e §2.2.
2. **Lo stato si calcola sul prodotto, non sulla corsa.** `done` richiede un artefatto che passi una
   forma minima; tutto il resto ha un nome suo (§6.5). Contro §2.3 e §2.4.
3. **Ogni ricerca ha un indirizzo dove si consulta.** Piano, linee, passi, fonti, affermazioni con i
   loro verdetti, rapporto, esportazioni (§6.7). Contro §2.5.

### 6.2 L'architettura, e cosa si riusa dal mobile

```
                      ┌───────────────────────────── kernel Node (harness-ui/src) ───────────────┐
 chat ──research_start─┤                                                                          │
                      │  research-orchestrator.mjs   ← resta il direttore (avvia/pausa/riprendi)  │
                      │        │                                                                  │
                      │        ├─ research/run.mjs         ◄── PORTO di researchRun.ts      (M1-M5)│
                      │        ├─ research/plan.mjs        ◄── PORTO di researchPlan.ts     (M6-M8)│
                      │        ├─ research/verification.mjs◄── PORTO di researchVerification (M9-M11)
                      │        ├─ research/independence.mjs◄── PORTO di researchIndependence (M12) │
                      │        ├─ research/fidelity.mjs    ◄── PORTO di researchFidelity    (M13) │
                      │        ├─ research/report.mjs      ◄── PORTO di researchReport      (M14-M15)
                      │        ├─ research/recheck.mjs     ◄── PORTO di researchRecheck(+History)(M16-M17)
                      │        ├─ research/ledger.mjs      ◄── PORTO di researchLedger      (M18) │
                      │        ├─ research/card.mjs        ◄── PORTO di researchCard        (M19-M20)
                      │        └─ research/citations.mjs   ◄── PORTO di researchCitationExport(M21)│
                      │                                                                            │
                      │  research-store.mjs  →  .harness-ui-research/<id>/                        │
                      │                            ├── giornale.jsonl   (eventi, append-only)     │
                      │                            ├── piano.json                                 │
                      │                            ├── fonti/<sha256>.txt  (il testo TENUTO)      │
                      │                            └── rapporto.md   (prosa + record recintato)   │
                      │                                                                            │
                      │  library-store.mjs   →  .harness-ui-library/<lib-id>/  (copia pubblicata)  │
                      └────────────────────────────────────────────────────────────────────────────┘
```

**Cosa NON si riusa dal mobile:** `researchRegistry.ts` (169 righe, `shallowRef` di Vue) — il suo
lavoro qui lo fa già la mappa `sessioni` di `session-registry.mjs`; e `researchPdf.ts`, che tira
dentro `@/lib/documents/reportBuilder` (il desktop ha già `src/document-report.mjs`, da valutare
separatamente).

**Cosa si riusa e come.** Le ~3.800 righe di §3.1 sono **pure**, con l'I/O iniettato per `deps`. Il
porto è meccanico (tipi via JSDoc invece che TypeScript), **non** una riscrittura. La regola: chi
porta un file porta **anche i suoi test** dal mobile, tradotti, e li fa girare **prima** di
agganciarlo. Un file portato che non ha i suoi test non è portato.

⛔ **Non è «copiare il mobile».** L'owner ha chiesto di **migliorarlo e renderlo più robusto**: le
differenze volute sono in §6.8. E la memoria dice che il mobile non è di questa lane: qui si **legge**
`AVM/mobile/` e si **scrive** solo in `harness-ui/` (nessun file del mobile è stato toccato).

### 6.3 Il permesso giusto: `'Research'`

Il problema è che i quattro livelli di oggi (`talosHarness.mjs:4623-4636`) non hanno una parola per
«può depositare il proprio rapporto, e nient'altro». Se ne aggiunge **una**:

| livello | `scrivi` | `shell` | `document_create` | **`research_deposit`** |
|---|:--:|:--:|:--:|:--:|
| `lettura` | ✗ | ✗ | ✗ | ✗ |
| **`ricerca`** (nuovo) | ✗ | ✗ | ✗ | ✅ **solo** dentro `.harness-ui-research/<id>/` |
| `scrittura-area` | ✅ dentro `cartella` | ✗ | ✗ | ✗ |
| `su-richiesta` | chiede | chiede | chiede | chiede |
| `accesso-pieno` | ✅ | ✅ | ✅ | ✅ |

- Il punto di innesto è `verificaPermessoScrittura` (`talosHarness.mjs:4660`), un ramo accanto a
  `livello-scrittura-area` (`:4709-4721`), con lo stesso controllo di percorso risolto
  (`resolve` + `startsWith(radice + sep)`) ma con radice `join(cartella, '.harness-ui-research', id)`.
- La stringa della pillola resta invisibile: **niente nomi tecnici a schermo** — in UI la sessione di
  una ricerca mostra «**Ricerca approfondita**», non «Research» né «ricerca».
- `research-orchestrator.mjs:170` passa `permessiRichiesti: 'Research'`; §2.1 chiude.
- ⛔ Il verso contrario si prova esplicitamente: con `livelloAccesso:'ricerca'`, `scrivi` su un
  percorso qualunque, `shell`, `document_create` e `research_deposit` **fuori** dalla propria cartella
  devono essere tutti respinti. Un cancello si prova anche nel verso in cui deve dire di no.

### 6.4 La lista degli attrezzi si filtra sul permesso

Oggi `session-registry.mjs:1436-1455` offre tutto sempre (§2.2). Il cambiamento è minimo e mirato:
una sessione con `livelloAccesso` `lettura` o `ricerca` **non riceve nella lista** gli attrezzi che
quel livello nega per costruzione (`scrivi`, `shell`, `document_create`, le mutazioni Libreria,
`generate_image`, `tool_create`).

Perché vale la pena, misurato su questa corsa: la prima `document_create` è la chiamata **652** su
979 eventi; da lì in poi la sessione ha smesso di fare ricerca e ha cominciato a negoziare con
l'utente. Un attrezzo mai offerto non si chiama mai.

⛔ **Il rischio, dichiarato:** TALOS-BANCO passa `strumentiEstesi` per costruire la parità fra
harness. Il filtro deve valere **per livello**, non per lista, e il banco non usa `lettura`/`ricerca`
⇒ impatto nullo per costruzione, **da provare con un test dedicato** e non da dichiarare qui.

### 6.5 Lo stato dice la verità sul prodotto

`terminata` smette di essere una parola sola derivata da `comeFinita` e diventa il risultato di un
**cancello di consegna** (`research-orchestrator.mjs:113-140`):

```
onConclusioneRicerca(risultato)
  ├─ richiesta === 'paused'     → resta riprendibile            (invariato)
  ├─ richiesta === 'cancelled'  → 'cancelled'                   (invariato)
  ├─ esiste .harness-ui-research/<id>/rapporto.md
  │    e il record recintato si rilegge (report.mjs parse)
  │    e ha ≥1 affermazione e ≥1 fonte                → 'done'
  ├─ esiste ma il record non si rilegge / è vuoto     → 'senza-rapporto'
  ├─ non esiste, e fra i risultati degli attrezzi
  │    c'è almeno un REFUSED di permesso              → 'bloccata-dal-permesso'
  ├─ non esiste, e i giri sono finiti                 → 'giri-esauriti'
  └─ altrimenti                                        → 'failed'
```

Cinque conseguenze volute:

- **`'done'` non si può più ottenere con una scusa.** Serve un artefatto che si rilegga.
- **`'bloccata-dal-permesso'` è la diagnosi del guasto di stasera**, e nomina il colpevole.
  ⛔ Non è un ripiego: è il caso in cui il prodotto ha sbagliato e deve dirlo lui, non l'owner.
- **`'giri-esauriti'` esiste già come guasto noto** in questo repo (banco: «TALOS esaurisce i giri,
  non le capacità») e oggi si legge `failed` come tutto il resto.
- Il testo dell'ultimo messaggio **non è più il rapporto**: al massimo è un allegato («ciò che il
  modello ha detto alla fine»), mostrato come tale.
- ⛔ **La compatibilità all'indietro**: le ricerche già su disco hanno `terminata:'done'` e un
  `reportLibraryId` che punta a un file che può essere una scusa. All'apertura, se il record
  recintato non si legge, lo stato mostrato è `'senza-rapporto'` **calcolato al volo**, senza
  riscrivere il file. Mai riscrivere in silenzio un record già pagato.

### 6.6 La sessione figlia, agganciata e riprendibile

- **`padreId`**: `avvia()` passa il `sessionId` della sessione che ha chiamato `research_start`
  (disponibile in `session-registry.mjs:2670`, dove `onRicercaAvvia` è costruito con `voce` in
  scope). Così la ricerca compare nell'albero della chat che l'ha ordinata, e dalla chat si torna
  alla ricerca. Chiude «parte una sessione nuova» di §1.2.
- **Nome**: oggi `nome: null` ⇒ in elenco la ricerca è una riga senza titolo. Si scrive la domanda,
  troncata, con l'etichetta umana «Ricerca approfondita».
- **Ripresa**: il meccanismo **c'è già** e funziona (`research-orchestrator.mjs:204-222`, riuso di
  `voce.controller.abort()` e `avviaESegui` con `messaggiIniziali`), ma riprende **la conversazione**,
  non **il lavoro**: `riprendi()` rifiuta se `voce.messaggiFinali` è assente, cioè se il server è
  stato riavviato (`:207-213` — «cannot be resumed: start a new one»). Col giornale su disco (M1) la
  ripresa diventa: rigioca `giornale.jsonl` → `talosResearchNextStep` → riparte **dal passo dopo
  l'ultimo committato**, anche dopo un riavvio. È la differenza che F12 chiama «regular checkpoints».
- ⛔ **Aperto, da decidere con l'owner**: se il lavoro già pagato di una ricerca `'bloccata-dal-permesso'`
  esistente possa essere **ripreso** col permesso nuovo invece di essere rifatto. I 484.171 token di
  stasera sono in `messaggiFinali`. Non lo do per scontato: va misurato se il contesto è ancora
  ricostruibile.

### 6.7 La sezione «Ricerca approfondita» dove ogni ricerca si CONSULTA

**Forma.** Eredita l'impianto **elenco a sinistra, dettaglio a destra** appena portato
(`frontend/src/components/sezione-elenco-dettaglio.js`, `sezioni-adattatori.js:423-473`) — non se ne
inventa un altro. Cambia **cosa** c'è nel dettaglio.

**La riga dell'elenco** guida col **bilancio**, mai col conteggio delle fonti (M20, e la ragione
è misurata: F5 dice che la risposta sembra buona anche quando le prove non ci sono). Tre pezzi:
titolo · timbro di stato · una riga di bilancio quando c'è un rapporto
(«**9 sostenute · 2 in parte · 1 contesa · 3 non verificate**»), e quando non c'è, **il perché**
(«Ferma: il permesso le vietava di consegnare»).

**Il dettaglio** è una pagina a fasce, dall'alto:

```
┌────────────────────────────────────────────────────────────────────┐
│  Come stanno evolvendo gli harness agentici desktop nel 2026…      │  ← la domanda, non un'etichetta
│  Conclusa · 11 settembre 2026, 20:56 · 4 min 12 s di lavoro   [⋯]  │  ← stato, quando, lavoro, menu
├────────────────────────────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░▒▒▒░░░░░░░                                    │  ← IL BILANCIO, la barra
│  9 sostenute · 2 in parte · 1 contesa · 3 non verificate            │
│  Verificate da: (modello) — mai dal modello che ha scritto          │
│  Prove distinte: 7 gruppi su 14 indirizzi                           │
├──────────────┬──────────────┬───────────┬──────────┬───────────────┤
│  Rapporto    │ Affermazioni │  Fonti    │  Piano   │ Come è andata │  ← cinque viste, non cinque schermi
├──────────────┴──────────────┴───────────┴──────────┴───────────────┤
│  … la vista scelta …                                                │
└────────────────────────────────────────────────────────────────────┘
```

- **Rapporto** — la prosa, leggibile, col markdown già reso dalla chat (si riusa il render esistente,
  non se ne scrive un secondo). In testa: se il record recintato non si rilegge, **lo dice**, e
  mostra ciò che c'è.
- **Affermazioni** — una riga per affermazione: il testo, il **passaggio verbatim** della fonte con
  la porzione citata **evidenziata** (gli offset ci sono, `researchVerification.ts:191-203`), il
  verdetto a parole (`researchReport.ts:67-77`: «sostenuta dalla fonte» / «solo in parte» / «NON
  sostenuta» / «contesa — le fonti non concordano» / «non verificata»), e chi l'ha giudicata. Su una
  **contesa**, le due versioni **affiancate**, mai mediate (M11).
- **Fonti** — titolo, indirizzo, data dichiarata, «pagina letta» o «solo estratto», e il **gruppo di
  indipendenza** di appartenenza, così «3 fonti» che sono un gruppo solo si vedono a colpo d'occhio.
  Per ciascuna, l'esito dell'ultima ri-verifica: **intatta / cambiata / irraggiungibile**, con la
  data.
- **Piano** — le linee di indagine, con quanto ognuna ha portato. Su una ricerca in corso, è qui che
  si approva o si modifica prima che parta.
- **Come è andata** — il registro (M18): sommario per tappe, poi i passi, con falliti e interrotti
  **a parte** e il tempo **lavorato**.

**Le azioni.** Sono più di due ⇒ **un menu overflow «⋯» più il tasto destro sulla riga**, mai bottoni
affiancati (regola dell'owner, 10/09). Voci, in parole umane:
*Apri il rapporto · Rinomina · Metti in pausa / Riprendi · **Controlla se le fonti dicono ancora
questo** · Esporta (documento · citazioni BibTeX · citazioni RIS) · Copia negli appunti · Elimina*.
La conferma dell'eliminazione scrive **la conseguenza** («si cancella anche il rapporto in Libreria»),
come già fa la riga della Libreria.

**Tema e voce.**
- **Calm chiaro e scuro, entrambi**: i timbri di stato si dichiarano con i token esistenti
  (`tokens.css`), mai con colori nuovi; la barra del bilancio usa i quattro toni già in uso
  (success/warning/danger/muted) invece di inventarne una scala. **Ogni vista si fotografa nei due
  temi** prima di dirla finita.
- **Niente nomi tecnici a schermo**: mai `research_start`, `document_create`, `reportLibraryId`,
  `.harness-ui-research`. La mappa nome-tecnico → nome-umano esiste già
  (`frontend/src/legacy/app.js:2335-2342`) e va estesa lì, in un posto solo. I nomi che riceve il
  modello **non si toccano** (sono il contratto col kernel).
- **Il vuoto è un invito**: «Nessuna ricerca in questo progetto. Chiedi in chat di avviarne una, e
  comparirà qui mentre lavora.» — non «0 elementi».
- **Gli errori non si scusano e dicono cosa fare**: «Il rapporto non si rilegge: il record di questa
  ricerca è incompleto. Ciò che è stato raccolto resta nelle Fonti.»
- **Movimento**: solo quello che risponde a un gesto (apertura di una vista, espansione di
  un'affermazione). ⛔ Nessuna animazione d'ingresso: in questo progetto due regole universali con
  `!important` (`body.reduce-motion *` e `@media (prefers-reduced-motion) *`) le spengono tutte a
  valle, e una cura scritta qui morirebbe in silenzio.

### 6.8 I «+1» — e perché la tabella li dimostra

Ognuno è una riga della tabella §4.2 dove **tutti i concorrenti ispezionati hanno ❌**. Non sono
dichiarazioni: sono colonne vuote.

| +1 | che cos'è | la riga che lo dimostra | come si misura (non a parole) |
|---|---|---|---|
| **+1.1 — «dice ancora questo?»** | ri-verifica nel tempo dei passaggi citati, non del codice HTTP | **C17**: ❌ per Hermes, Claude Code, Codex, DSH, tutti | su N fonti ri-lette: quante **intatte / cambiate / irraggiungibili**, e quanti **passaggi citati ancora ritrovabili**. Fattibile solo perché teniamo il **testo** (`researchRecheck.ts:1-29`). F1 dice perché conta: il link vivo che non dice più quella cosa è il pericolo, non il link morto |
| **+1.2 — prove, non URL** | conteggio a **gruppi di indipendenza** | **C11**: ❌ per tutti | «7 prove distinte su 14 indirizzi» invece di «14 fonti». Regola pubblicata e verificabile (`researchIndependence.ts:1-30`) |
| **+1.3 — la contraria si cerca apposta** | una fonte che dice il contrario, col suo passaggio, affiancata | **C10**: ❌ per tutti | quota di affermazioni con almeno una contraria **cercata**; quante finiscono `contested`. F7 dà la ragione misurata: l'agente che ha prodotto una conclusione è **meno obiettivo** nel giudicarla |
| **+1.4 — lo stato è controllato** | `done` solo con un artefatto che si rilegge | **C20**: ❌ per tutti, **compreso il TALOS di oggi** | il cancello di §6.5 si prova **al contrario**: si dà in pasto la scusa da 290 byte di stasera e deve uscire `'bloccata-dal-permesso'`, mai `'done'` |
| **+1.5 — il costo detto prima** | lavoro sempre, denaro solo se un prezzo pubblicato è stato ottenuto | **C4**: ❌ per tutti | il piano dichiara ricerche/pagine/token attesi; a fine corsa si mostrano **accanto** quelli spesi. Il divario stimato/speso è esso stesso una misura. F12: i multi-agente costano **~15×** una chat — il numero va detto prima, non scoperto dopo |

⛔ **Onestà sul confronto**: su **C21** (cache dei risultati web fra rami) e **C22** (budget
deterministico per pagina con spillover su disco) **Hermes è avanti a noi e al mobile**, e non di
poco: `web_extract` con tetto 15.000 caratteri, testa+coda, il resto su disco col comando esatto per
sfogliarlo. Sulla nostra corsa di stasera, `cached_tokens: 0` su 484.171 dice che questo è il nostro
buco più caro. Vanno nel disegno come lotti (§7, L6), non nella lista dei «+1».

---

## 7. I lotti

Nessuna stima in ore: **mai ore non misurate**. Ogni lotto dichiara i file e la prova che lo chiude.

### L0 — Il ponte TypeScript → `.mjs` (abilitante, si fa per primo)
- **Perché:** ~3.800 righe di logica pura del mobile non entrano in `harness-ui/src/` senza decidere
  **come**. Tre vie, da scegliere con l'owner: (a) traduzione a mano con tipi in JSDoc — nessuna
  dipendenza nuova, ma una copia da riallineare; (b) un passo di build che compila i `.ts` in
  `src/research/` — dipendenza nuova in un progetto che oggi non ne ha; (c) `.d.ts` a mano sopra
  `.mjs` tradotti. **Non decido io**: è la scelta che vincola tutti gli altri lotti.
- **Chiude con:** una decisione scritta e **un** file portato di prova (`researchOutline.ts`, 85
  righe, zero dipendenze) coi suoi test tradotti, verdi.

### L1 — Il permesso `'Research'` e il filtro degli attrezzi
- **File:** `src/kernel/talosHarness.mjs` (ramo in `verificaPermessoScrittura` ~4709; tipo a 4623),
  `src/session-registry.mjs` (mappa permessi 2557-2560; filtro di `strumentiEstesi` ~1436-1455),
  `src/research-orchestrator.mjs:170`.
- **Test:** `tests/` — `research_deposit` dentro la propria cartella **passa**; fuori **è respinto**;
  `scrivi`/`shell`/`document_create` sotto `'ricerca'` **respinti**; il livello `lettura` invariato;
  **TALOS-BANCO non cambia lista** (test dedicato, perché è la regressione che temo).
- **⛔ Prova al contrario obbligatoria**, come sopra.

### L2 — Il cancello di consegna e gli stati onesti
- **File:** `src/research-orchestrator.mjs:113-140` (`onConclusioneRicerca`), `:96-100` (`statoVivo`),
  `src/research-store.mjs` (nuovi valori di `terminata`).
- **Test:** la scusa da **290 byte di stasera**, verbatim, come fixture → deve dare
  `'bloccata-dal-permesso'`; un rapporto vero → `'done'`; giri esauriti → `'giri-esauriti'`; una
  ricerca **già su disco** con `terminata:'done'` e un rapporto illeggibile → mostrata
  `'senza-rapporto'` **senza riscrivere il file**.

### L3 — Il porto del motore (lotti indipendenti, uno per file)
Ordine consigliato, dal meno legato al più legato:
`outline → card → independence → citations → ledger → report → fidelity → plan → verification (+opposing, openCards) → recheck (+History, Document) → run → collector → synthesis`.
- **File:** nuovi, sotto `src/research/`. **Nessun file esistente cambia** fino a L4.
- **Test:** per ogni file, i suoi test del mobile tradotti, verdi, **prima** dell'aggancio.
- ⛔ Un file portato senza i suoi test **non conta come portato**.

### L4 — Il giornale su disco e la ripresa vera
- **File:** `src/research-store.mjs` (da `<id>.json` a `<id>/` con `giornale.jsonl`, `piano.json`,
  `fonti/`, `rapporto.md`), `src/research-orchestrator.mjs` (`riprendi` che rigioca invece di
  rileggere `messaggiFinali`).
- **⛔ Vincolo, da una lezione già pagata in questo repo:** ciò che è costato denaro **non si
  sovrascrive mai**. Scrittura su temporaneo + `os.replace`; il giornale è **solo append**; le
  ricerche vecchie (`<id>.json`) si leggono ancora e si migrano **al primo tocco**, mai in blocco.
- **Test:** una corsa registrata, rigiocata, deve dare lo **stesso** stato; un giornale con un evento
  duplicato non deve contare due volte la spesa (`researchRun.ts:239-249` lo prevede già); un
  giornale troncato a metà riga deve **caricarsi lo stesso**.

### L5 — Le rotte
- **File:** `src/http-app.mjs` — la lista dei metodi a ~842 e il ramo a ~4530.
  - `GET /api/v1/sessions/:id/research` → aggiungere ai quattro campi: `reportLibraryId`,
    `bilancio` (sostenute/in parte/contese/non verificate), `proveDistinte`, `motivo` quando lo stato
    non è `done`.
  - `GET /api/v1/sessions/:id/research/:ricercaId` → **nuova**, di sola lettura: piano, passi, fonti,
    affermazioni coi verdetti, rapporto.
  - `POST /api/v1/sessions/:id/research/:ricercaId/riverifica` e `.../pausa` `.../ripresa` →
    **da decidere con l'owner**: la sezione oggi è di sola lettura per una scelta scritta
    (`RAPPORTO-PORTING-SEZIONI-2026-09-11.md`, punto 3 — «un pulsante lì sarebbe una promessa che
    nessuna rotta può mantenere»). O si aggiungono le rotte, o le azioni restano solo dalla chat.
    **Non lo decido io.**
- **Test:** la conformità dei metodi (405 con `Allow` esatto) e il contratto della nuova rotta.

### L6 — Cache e budget del *fetch* (dove Hermes è avanti)
- **File:** il percorso di `web_search`/`naviga` (`src/duckduckgo-search.mjs`, il ramo `naviga` nel
  kernel), `src/research/collector.mjs`.
- **Cosa:** una cache dei risultati a chiave URL **dentro la corsa** (le linee parallele cercano le
  stesse cose), e un budget deterministico per pagina col resto **scritto in `fonti/`** e il percorso
  detto al modello — che è anche ciò che rende possibile +1.1, perché il testo va tenuto comunque.
- **Misura di chiusura:** `cached_tokens` e token totali di una corsa `deep` **prima e dopo**, sulla
  stessa domanda. Oggi la baseline è **484.171 / 0**.

### L7 — La sezione
- **File:** `frontend/src/components/sezioni-adattatori.js:408-473` (l'adattatore Ricerca),
  un nuovo `frontend/src/components/ricerca-dettaglio.js` per le cinque viste,
  `frontend/src/components/ricerca.js` (il pulsante a `:21` smette di essere `hidden`),
  `public/index.html:1011` (la frase sparisce **quando** è falsa, non prima).
- **⛔ Da correggere nello stesso giro, perché è falsa oggi:** `sezioni-adattatori.js:418`
  («Il rapporto è stato scritto in .harness-ui-research/»).
- **Prove:** foto **chiaro e scuro**, **1440×900 e 1024×800**, per: elenco pieno, elenco vuoto,
  dettaglio con rapporto, dettaglio **senza** rapporto (lo stato di stasera), le cinque viste, il
  menu «⋯» aperto, il tasto destro. Ogni foto guardata una per una, difetti annotati **tutti** e
  corretti **in lotto**, riverifica visiva **una volta sola alla fine**.
- **Cancello:** `tests/parity/nessun-errore-a-runtime.spec.mjs` rilanciato — build verde e test verdi
  non guardano il runtime.

### L8 — La verifica vera, sul 4174
- La stessa domanda dell'owner, rilanciata **con il permesso nuovo**, su `glm-5.3-flash`.
- **Chiude solo se:** in `.harness-ui-research/<id>/rapporto.md` c'è un rapporto con affermazioni e
  fonti; lo stato in sezione è `Conclusa` **e** il bilancio non è vuoto; il rapporto si apre dalla
  sezione; «Controlla se le fonti dicono ancora questo» risponde qualcosa di sensato.
- ⛔ **Foto DURANTE, non solo alla fine**: ciò che scorre si fotografa a intervalli.

**Dipendenze:** L0 → L3 → L4; L1 → L2; L5 dopo L2; L7 dopo L5; L8 ultimo. L6 è indipendente e si può
fare in qualunque momento dopo L4.

---

## 8. Cosa NON ho verificato

1. **Non ho eseguito niente.** Nessun test, nessun `npm run`, nessun giro col modello: il compito era
   il disegno. Ogni numero qui viene da `GET` sul 4174, da file su disco, o dalle fonti di §5.
2. **`WebSearch` era esaurito** (200/200 per questa sessione). Le fonti di §5 sono prese con
   `WebFetch` diretto su arXiv e anthropic.com, più due interrogazioni all'API di arXiv. Non ho
   potuto cercare per parole chiave ⇒ **non ho coperto i prodotti**: OpenAI Deep Research (la pagina
   ufficiale risponde **403** a `WebFetch`), Gemini Deep Research, Perplexity, Kimi Researcher,
   Hermes research mode lato sito. Le loro caselle nella tabella §4.2 sono riempite **solo** dove
   c'era codice o changelog nel clone; per i prodotti chiusi ho scritto `n/d`, mai una supposizione.
   ⇒ **Se serve la rassegna prodotti, va rifatta con la ricerca accesa.**
3. **Claude Code**: il clone non contiene il sorgente, solo `CHANGELOG.md`. Tutto ciò che dico di
   `/deep-research` viene da tre righe di changelog (`:1035`, `:1360`, `:1601`). Non so se abbia
   pausa/ripresa, artefatto strutturato, o ri-verifica: ho scritto `n/d`, non `❌`.
4. **Non ho letto tutti e 21 i file del mobile riga per riga.** Ho letto per intero le teste e le
   firme di tutti; ho letto il corpo di `researchRun.ts` (1-260), `researchPlan.ts` (1-140),
   `researchVerification.ts` (1-130, 200-270), `researchReport.ts` (1-175), `researchRecheck.ts`
   (1-110), `researchIndependence.ts` (1-70), `researchCard.ts` (1-100), `researchFidelity.ts`
   (1-70), `researchLedger.ts` (1-60). Di `researchSynthesis.ts`, `researchCollector.ts`,
   `researchPdf.ts`, `researchOpposing.ts`, `researchNarration.ts`, `researchOpenCards.ts`,
   `researchDossier.ts`, `researchRecheckHistory.ts`, `researchRecheckDocument.ts` ho letto **solo**
   testa ed export. Le loro righe in §3.2 sono quindi **meno provate** delle altre.
5. **La stima «~3.800 righe portabili» è aritmetica sui conteggi di riga**, non una prova che il
   porto funzioni. L0 esiste apposta per misurarlo su un file solo prima di impegnarsi.
6. **Non ho provato che il filtro degli attrezzi (§6.4) sia innocuo per TALOS-BANCO.** È il rischio
   che mi preoccupa di più in questo disegno, ed è per questo che L1 lo mette come test esplicito
   invece che come nota.
7. **Non so se il lavoro già pagato della ricerca di stasera sia recuperabile** (§6.6, ultimo punto):
   484.171 token sono in `messaggiFinali`, ma non ho verificato se una ripresa col permesso nuovo
   ricostruirebbe il contesto. Va misurato, non assunto.
8. **Non ho guardato la sezione dal vivo sul 4174** (nessuna foto): ho letto il codice che la
   disegna. La descrizione di §1.5 viene dalle foto dell'owner e dalle stringhe nel sorgente.
9. **Le due rotte di scrittura di L5 sono una domanda, non una proposta chiusa.** La sezione è di
   sola lettura per una scelta presa oggi da un altro agente, con una ragione scritta. Cambiarla è
   una decisione dell'owner.
10. **Quasi-incidenti dichiarati** (§2.5): stavo per scrivere che il rapporto non era stato salvato —
    era salvato, ed era la scusa; e stavo per ripetere che il rapporto vive in `.harness-ui-research/`
    perché lo dice il nostro stesso codice — vive in `.harness-ui-library/`. Entrambi trovati aprendo
    la cartella vera invece di fidarmi di una stringa.
