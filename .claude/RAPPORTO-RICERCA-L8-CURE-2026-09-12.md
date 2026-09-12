# L8 — le due cure che il giro vero ha ordinato: il modello che si eredita, il record che scrive il server

Lane `lane/harness-desktop`, 12/09/2026. Cura dei due difetti trovati dal giro vero L8
(madre `c8e9b07b` → figlia `3029dea2`, 08:02-08:09) e **non** dai 2439 test verdi.

⛔ Nessun giro col modello avviato. Nessuna richiesta al 4174 (né GET né altro). Nessun `git`.
Nessun file di `src/research/*.mjs` toccato (letti: `report.mjs`, `verification.mjs`,
`collector.mjs`, `fidelity.mjs`, `ledger.mjs`). Nessun file di `frontend/` toccato.

---

## 1. Cosa ha mostrato il giro vero — file:riga, e i byte

Le prove stanno sul disco, non in una deduzione dal codice.

| fatto | prova |
|---|---|
| la madre girava **`z-ai/glm-5.3-flash`** | `harness-ui/.sessions-store/c8e9b07b-1569-4ab5-821c-a344809eafad.jsonl`, riga 1 (intestazione), campo `modello` |
| la figlia è partita **`z-ai/glm-4.7-flash`** | `harness-ui/.sessions-store/3029dea2-cd82-4373-93a3-6f1eec3eb219.jsonl`, riga 1, campi `modello` e `modelId` |
| e `4.7-flash` è **il default del server**, non una scelta | `harness-ui/src/config.mjs:25` (`MODELLI_AMMESSI[0]`) letto da `parseModello` (`:128`) e usato come `modello` del registro (`session-registry.mjs:1444`) |
| perché `avvia()` non passava nessun modello | `src/research-orchestrator.mjs`, `avviaESeguiFn({…})` — nessun `modelloRichiesta`; a valle `modelloEffettivo = modelIdEffettivo \|\| modelloRichiesta \|\| voceEsistente?.modello \|\| modello` (`session-registry.mjs:2424`), e i primi tre erano assenti |
| conseguenza misurata: **265.670 token dentro, `cache 0`** | rapporto L8 in `.claude/CODA-UNICA-DEBITI-2026-09-06.md`, sezione «L8 (12/09…)» |
| il rapporto è stato depositato, **8.953 byte di prosa buona** | `C:\Users\Antonino\Desktop\.harness-ui-research\3029dea2-…\rapporto.md` — finisce a «16. [RAIL — AI Agent Safety…]», **nessun recinto** |
| e il cancello l'ha respinto, col motivo giusto | stessa cartella, `meta.json`: `"terminata": "senza-rapporto"`, `"motivoDettaglio": "il rapporto non porta il record verificabile (blocco ```talos-research-report)"` |
| la consegna glielo aveva chiesto, campo per campo | la `consegna` dentro l'intestazione della figlia porta l'esempio JSON intero: il modello l'ha letto e l'ha ignorato |
| il giornale ha **1 evento** (`run_started`) | stessa cartella, `giornale.jsonl` — il collettore non è agganciato (noto, L4) |

⇒ Due difetti distinti, e **nessuno dei due era un ramo sbagliato**: il primo era un *argomento
assente*, il secondo una *forma affidata alla prosa*. Nessun test a unità poteva vederli, perché
non c'era niente di rotto da far scattare.

---

## 2. Ricerca web PRIMA di scrivere — fonte + data, e **cosa ha cambiato il codice**

⚠️ **`WebSearch` era esaurito** (200/200 per questa sessione, stessa condizione di L1-L4): tutto
preso con **`WebFetch`** sull'API di arXiv e sulla documentazione viva. Rassegna mirata, **non
esaustiva**.

| # | fonte | data | cosa ha cambiato |
|---|---|---|---|
| C1 | **«The Constraint Tax: Measuring Validity-Correctness Tradeoffs in Structured Outputs for Small Language Models»** — [arXiv:2605.26128v1](https://arxiv.org/abs/2605.26128) | 20/05/2026 | «hard answer-only schema decoding raises schema validity **from 61.5% to 100.0%**, but lowers answer accuracy **from 19.7% to 11.0%**». ⛔ **Il vincolo che non conoscevo**: costringere un modello piccolo a una forma rigida NON è gratis. ⇒ la struttura si mette sullo **scheletro** (chi afferma cosa, su quale fonte, con quale passaggio) e **mai sulla prosa**: `testo` resta libero e il server non ne riscrive una riga. C'è un test che lo verifica byte per byte |
| C2 | **«Constraint Tax in Open-Weight LLMs: An Empirical Study of Tool Calling Suppression Under Structured Output Constraints»** — [arXiv:2606.25605v1](https://arxiv.org/abs/2606.25605) | 24/06/2026 | «when Tool Calling and JSON Schema constraints are simultaneously enabled, **multiple open-weight models cease invoking tools** despite maintaining high schema compliance». ⇒ **niente `response_format`/grammatica sopra la generazione**: la forma vive negli **argomenti dell'attrezzo**, il canale che il modello usa già. Era una cura che avrei potuto proporre e che avrebbe spento l'attrezzo |
| C3 | **«PHREEQC-MCQ-200: A Diagnostic Benchmark for Tool-Augmented Scientific Simulator Agents»** — [arXiv:2607.00436v1](https://arxiv.org/abs/2607.00436) | 01/07/2026 | «the gains are not monotonic: tool-augmented agents also **lose items they answered correctly without tools**, revealing regressions that average accuracy alone hides». ⇒ ogni **tolleranza** del compositore (elenco arrivato come stringa JSON, fonte indicata per numero, barra finale, passaggio mancante) esiste perché la strada nuova non deve poter perdere un deposito che la vecchia accettava. Ognuna ha il suo test |
| C4 | **«When Lower Privileges Suffice»** — [arXiv:2606.20023](https://arxiv.org/abs/2606.20023) (già in L1) | 18/06/2026 | «prompt-level controls provide only **limited mitigation**». ⇒ la conferma che **insistere nella consegna non era la cura**: la forma dichiarata solo a parole *è* un controllo a livello di prompt, e il 12/09 non ha retto |
| C5 | **OpenRouter, «Prompt Caching»** — <https://openrouter.ai/docs/features/prompt-caching> | pagina viva, letta 12/09/2026 | «**Sticky routing is tracked at the account level, per model, and per conversation**»; Z.AI fa caching automatico. ⇒ spiega il `cached_tokens: 0` del giro: un modello diverso è **un'altra chiave di cache**. Non è solo «modello sbagliato», è anche denaro |
| C6 | **«Delegation Without Trust»** — [arXiv:2609.00267v1](https://arxiv.org/abs/2609.00267) · **«Authority Is Not a String»** — [arXiv:2609.08371v1](https://arxiv.org/abs/2609.08371) | 31/08 · 08/09/2026 | «inherited authority must match delegation scope explicitly» / «permissions assigned to one sub-agent are **not automatically available to another**». ⇒ **cosa si eredita e cosa no** va deciso per campo, non «tutto il contesto della madre». Qui si eredita **modello e reasoning** (parametri di esecuzione); i **permessi restano fissati a `'Research'`** come li ha messi L1, e l'eredità non li tocca |

---

## 3. La cura, file:riga

### 3.1 Difetto 1 — la figlia eredita il modello della madre

| dove | cosa |
|---|---|
| `src/session-registry.mjs` `onRicercaAvvia` (~2777) | passa `modello: voce.modello` e `reasoning: voce.reasoning`. ⛔ `voce.modello`, non il parametro chiuso in chiusura: il modello si cambia dalla barra a sessione viva (`aggiornaImpostazioni` scrive `voce.modello`), quindi va letto **adesso** |
| stessa riga | ⛔⛔ **eccezione dichiarata**: madre `provider === 'local'` ⇒ **nessuna eredità**. Lì `voce.modello` è l'id di un GGUF sul disco e la figlia parte comunque `provider:'cloud'` (l'orchestratore non passa né `provider` né `runtimeId`): ereditarlo sarebbe un 400 garantito alla prima chiamata, cioè una cura che rompe un caso che prima funzionava |
| `src/research-orchestrator.mjs` `avvia()` | riceve `modello` e `reasoning`, li gira ad `avviaESeguiFn` come `modelloRichiesta`/`reasoningRichiesto`, e li scrive sulla metadata. `null` ⇒ default del server, **bit-per-bit come prima** |
| `src/research-orchestrator.mjs` `avvia()` | ⭐ aggiunge **`task.ricercaDomanda`** accanto a `task.ricercaId`: il record del rapporto prende la domanda dal **server**, mai dal modello che potrebbe riscriverla. Dentro `task` per la stessa ragione di `ricercaId` — è persistito nell'intestazione e sopravvive a riavvio e resume |
| `src/research-store.mjs` `creaRicerca` | campo **`modello`** sulla metadata (`null` per ogni voce nata prima di oggi). Sulla metadata e non solo sulla voce di sessione, perché la sezione legge dal disco anche dopo un riavvio |
| `src/research-orchestrator.mjs` `voceEsposta` | **quindicesimo campo del contratto**: `modello`. Due ricerche fatte con due modelli diversi non sono confrontabili, e la riga deve dirlo |

⛔ La **ripresa** non ha avuto bisogno di niente: `riprendi()` passa `voceEsistente: voce`, e
`avviaESegui` eredita da lì (`voceEsistente?.modello`). Il modello si fissa una volta, alla nascita.

### 3.2 Difetto 2 — il deposito è strutturato, e il record lo scrive il server

| dove | cosa |
|---|---|
| `src/kernel/talosHarness.mjs` `ATTREZZI_ESTESI`, schema di `research_deposit` (~2346) | tre campi invece di uno: `testo` (prosa), `affermazioni[{testo, fonte, passaggio}]`, `fonti[{url, titolo, dataDichiarata?, letta?}]`, tutti e tre `required`. ⛔ **Nessun `judge`, nessun `claimSupported`**: prima era una raccomandazione nella consegna, adesso è una **superficie che non esiste** — un modello non può timbrare sé stesso se non ha il campo con cui provarci |
| stesso file, dispatch di `research_deposit` (~7726) | tre strade, scelte da **ciò che è arrivato**: (1) argomenti strutturati ⇒ il server compone; (2) solo `testo` ⇒ si scrive com'è (compatibilità); (3) compositore non iniettato ⇒ come (2), cioè il comportamento di ieri per banco e test del kernel |
| stesso file | ⛔ **argomenti mal formati ⇒ risposta a parole e NESSUN FILE**, col motivo che nomina indice e campo (`affermazioni[1].fonte`), più «everything you already found is still valid» perché un rifiuto che non dice come rimediare fa ricominciare da capo |
| stesso file | ⛔ **un deposito senza record lo DICHIARA**: «It carries NO verifiable record, so it will not count as delivered: call research_deposit once more with `affermazioni` and `fonti`». È l'unico momento in cui il modello può ancora rimediare — il 12/09 nessuno glielo ha detto |
| stesso file, ricevuta | `esecuzioneFallita` **non** si accende su un rifiuto di argomenti: quello non è un'esecuzione fallita, e marcarlo tale sporcherebbe la catena con un allarme falso |
| stesso file, parametro `componiRapportoRicercaFn` (~5812) | iniettato, **mai importato**: `talosHarness.mjs` è condiviso col mobile e non importa nulla da `src/research/`. Assente ⇒ comportamento di ieri |
| `src/research-orchestrator.mjs` **`componiRapportoRicerca`** (esportata, ~218) | costruisce il documento con **`talosResearchReportDocument`** — lo stesso scrittore che il cancello rilegge. `judge: null` e `claimSupported: 'unchecked'` **fissi**, `quotePresent: false` (nessuno ha confrontato niente: `fidelity.mjs:96` conta su quel campo), `resolved` = `obtained` della fonte |
| stessa funzione | `obtained` **non si indovina**: lo dichiara il modello con `letta`, assente ⇒ `'snippet'`, l'ipotesi che promette meno. `ledger.mjs:154` conta le pagine davvero aperte su quel campo |
| stessa funzione | tolleranze misurate (C3): elenco come stringa JSON, `fonte` come numero 1-based, barra finale sull'URL, alias `text`/`source`/`passage`, `passaggio` mancante (contato, non fatale) |
| `src/research-orchestrator.mjs` `promptRicerca` | la consegna **non chiede più il recinto**: chiede i tre argomenti e spiega il **perché** (il passaggio verbatim, e che il server costruisce il record). Lo schema dice *cosa*; la consegna dice *perché* |
| `src/session-registry.mjs` (~102, ~2882) | importa `componiRapportoRicerca` e la passa fra le opzioni di sessione |
| `src/agent-service.mjs` (~341, ~1737) | la accetta e la inoltra a `talosLavoraFn`, senza logica propria |

⛔ **Il `summary` del record è il `testo` del modello VERBATIM** (C1): il documento finale è
`# <domanda>` + la prosa del modello + il bilancio + le affermazioni + le fonti + il recinto.

---

## 4. Le prove — nei due versi

`tests/ricerca-deposito-strutturato.test.mjs` (**nuovo**, 21 test) + 3 test nuovi in
`tests/session-registry.test.mjs` (il filo intero del modello) + i contratti aggiornati in
`tests/research-orchestrator.test.mjs`, `tests/http-routes-research.test.mjs`,
`tests/ricerca-permesso-e-consegna.test.mjs`.

**Il modello, filo intero dal registro**
- madre con modello scelto → la figlia parte **con quello**, col suo `reasoning`, con
  `task.ricercaDomanda` e col compositore agganciato.
- ⛔ **provato che morde**: annullata la riga della cura (`modello: null`), il test diventa
  **rosso** — e solo quello. Non è un test che passerebbe comunque.
- madre **senza** modello scelto → default del server, esattamente come prima (nessun default nuovo).
- ⛔ **verso contrario**: madre su **runtime locale** → la figlia **non** riceve l'id del GGUF.
- il contratto della voce: `modello` c'è per una ricerca nuova, ed è `null` onesto per una vecchia.

**Il compositore, il verso che dice di sì**
- 2 affermazioni + 2 fonti → documento che **il cancello vero** (`rileggiRapportoRecintato`) legge:
  `ok:true`, `bilancio {totali:2 … nonVerificate:2}`, `proveDistinte:2`, `ripiego:false`.
- la prosa del modello arriva nel documento **verbatim** (C1), e `record.summary` è quel testo
  carattere per carattere; `record.question` viene dal server.
- `letta:true/assente` → `obtained` `page`/`snippet`; `dataDichiarata` assente → `publishedAt:null`.
- passaggio mancante → **passa**, `senzaPassaggio:1`, e `proveDistinte` **non** lo conta.
- tolleranze: elenchi come stringa JSON, fonte per numero, barra finale.

**Il compositore, il verso che deve dire di no**
- affermazione **senza fonte** → `ok:false`, motivo che nomina `affermazioni[1].fonte`.
- affermazione che punta a un URL **non elencato** → respinta, e il motivo dice **cosa** è arrivato
  (mai una fonte inventata per far quadrare il record).
- `fonti[0].url` che non è http(s) — quattro forme, `''` incluso — respinte.
- elenchi vuoti, non-elenchi, affermazione senza `testo`, `testo` vuoto: ognuno col suo motivo.
- `fonte: 7` con una sola fonte → respinta, **non** ridotta al primo elemento.
- ⛔ **un modello che si timbra da solo** (`checks.claimSupported:'yes'`, `judge:'io-stesso'` fra gli
  argomenti): il record esce `judge:null`, `claimSupported:'unchecked'`, `quotePresent:false`.

**Il kernel, sul disco**
- deposito strutturato → `rapporto.md` vero, riletto dal disco e passato al cancello: `ok:true`,
  bilancio, `proveDistinte:2`, prosa intatta, intestazione = la domanda del server.
- ⛔ affermazione senza fonte → `REFUSED` a parole **e `existsSync(rapporto.md) === false`**.
- ⛔ solo `testo` senza recinto → **depositato lo stesso** (il lavoro pagato non si butta), e la
  risposta dice che non conterà come consegnato; il file è **byte per byte** quello del modello, e
  il cancello risponde col motivo **verbatim** letto in `meta.json` il 12/09.
- il **modo vecchio** (recinto già dentro `testo`) → ancora `deposited`, nessun avviso, file
  non ricomposto.
- **senza compositore iniettato** + argomenti strutturati → scrive `testo` com'è: banco e test del
  kernel invariati.
- `testo` vuoto → ancora respinto, nessun file vuoto.

**Lo schema e la regressione che temevo**
- lo schema nomina i tre campi e i sottocampi; `passaggio.description` contiene «VERBATIM»;
  ⛔ `judge` e `claimSupported` **non compaiono** in nessun punto dello schema.
- ⛔ **TALOS-BANCO non cambia lista**: `ATTREZZI_OPENAI` resta esattamente
  `elenca, cerca, leggi, scrivi, prova, shell, naviga`.

**La consegna**
- non contiene più `talos-research-report` né `"version":1`; contiene `affermazioni`, `fonti`,
  `VERBATIM` e «The server builds the verifiable record».

### I numeri

```
node --test tests/*.test.mjs tests/research/*.test.mjs
ℹ tests 2788   ℹ pass 2788   ℹ fail 0      (26,0 s)
tests/*.test.mjs           → 2463 (erano 2439: +21 nel file nuovo, +3 nel registro)
tests/research/*.test.mjs  →  325 (invariati)
node --test src/kernel/talosHarness.test.mjs → 558, 555 verdi, 3 rossi
```

⛔ I tre rossi del kernel sono **gli stessi tre preesistenti** già dichiarati in L1
(`ambienteSenzaCredenziali` ×2 e «un'uscita lunga tiene testa E coda»): non li ho toccati.

⛔⛔ **E la suite non è ermetica — detto perché un conteggio da solo non è una prova.** Sei giri
della suite intera dopo le due correzioni: **tre puliti** (2788/2788) e **tre** con un rosso, e il
rosso non è mai lo stesso insieme — `L5 — la SCUSA depositata` · `L5 — una ricerca ANNULLATA` ·
`L5 — DETTAGLIO` (quest'ultimo due volte). ⛔ Tutti e tre stanno in
`tests/http-routes-research.test.mjs`, tutti con durata **~3.100-3.300 ms**, cioè un timeout sotto
carico parallelo; lo **stesso file da solo è 17/17 in tre giri consecutivi**. Non è causato da
questo lotto — quel file monta un server vero su `listen(0)`, **mai la 4174** — ma va detto: ho
confrontato gli **insiemi**, non i conteggi, ed è così che l'ho riconosciuto invece di prendere
2788/2788 per una prova.

**Due rossi VERI, invece, li ha prodotti la cura, ed è il loro mestiere:**
il contratto a 14 campi (`research-orchestrator.test.mjs` e `http-routes-research.test.mjs`) e il
messaggio del deposito (`ricerca-permesso-e-consegna.test.mjs`). Aggiornati **spiegando perché**,
non zittiti.

---

## 5. L'artefatto vero, guardato — e i due difetti che solo guardarlo ha trovato

Ho stampato il `rapporto.md` che la cura produce su un carico realistico. Due difetti che
**nessuna asserzione poteva vedere**:

1. ✅ **Corretto**: `supportReason` era in **inglese** dentro una prosa italiana
   («Esito: non verificata — deposited by the model that wrote…»). Quella frase la legge una
   persona. Ora: «depositata dal modello che ha scritto il rapporto: nessun giudice indipendente
   l'ha ancora controllata.»
2. 🔜 **Dichiarato, non corretto**: il documento porta **due titoli `# ` di fila** — quello del
   record (`# <domanda>`, lo scrive `report.mjs`) e quello del modello dentro la sua prosa. Non
   l'ho corretto perché le due cure possibili sono entrambe peggiori: cambiare `report.mjs` è
   fuori perimetro (lane altrui, e il recinto deve restare identico al mobile), e togliere l'H1
   del modello sarebbe **riscrivere la sua prosa**, cioè proprio ciò che C1 dice di non fare.
   Decide l'owner. Conseguenza: cosmetica, e la sezione mostra comunque i campi strutturati
   (`frontend/dist/app.js:4273` legge `lettura.record.sources`).

---

## 6. Le deviazioni dal brief, dichiarate

1. **Il compositore vive in `research-orchestrator.mjs`, iniettato nel kernel** — non importato là.
   Il brief diceva «cura nel kernel e nell'orchestratore»; il kernel però è **condiviso col mobile**
   e non importa nulla da `src/research/` (regola di L4). Un `import` avrebbe legato il kernel a un
   albero che il mobile non ha. Costo: **due righe in `src/agent-service.mjs`** (accettare e
   inoltrare il parametro), file che L1 aveva lasciato fuori perimetro perché di un altro agente.
   Nessun'altra riga di quel file toccata.
2. **`fonti[].letta` in più** rispetto al `{url, titolo, dataDichiarata?}` del brief. Senza,
   `obtained` andrebbe **inventato**: `'page'` dichiarerebbe letta ogni pagina mai aperta,
   `'snippet'` negherebbe le letture vere — e `ledger.mjs:154` ci conta sopra. Un booleano che il
   modello conosce costa meno di un fatto fabbricato.
3. **`task.ricercaDomanda` in più**, accanto a `ricercaId`. Il kernel non conosce la domanda, e
   `record.question` è ciò che il cancello legge come `intestazione`: prenderla dal `testo` del
   modello l'avrebbe esposta a una riscrittura. Stesso meccanismo di `ricercaId`, stessa
   sopravvivenza a riavvio e resume.
4. **Un `{testo}` senza recinto viene ancora DEPOSITATO**, non rifiutato — come chiede il brief
   («→ `senza-rapporto` con motivo»). La risposta a parole è riservata agli argomenti **mal
   formati**. Il confine è: *non so consegnare bene* ⇒ si scrive e si avvisa; *ho consegnato una
   cosa contraddittoria* ⇒ non si scrive niente.
5. **Il campo `modello` è entrato anche nel contratto della voce** (quindicesimo). Il brief
   chiedeva di esporlo; ha reso rossi due test di contratto, aggiornati con la ragione scritta
   accanto.

---

## 7. Cosa NON ho verificato

- ⛔⛔ **Nessun giro col modello vero. Il giro di conferma lo lancia l'owner.** Nessuno di questi
  test dimostra che `glm-5.3-flash` *riempia davvero* `affermazioni` e `fonti` invece di passare il
  solo `testo`. È esattamente il difetto che L8 ha trovato, e vale la lezione già pagata: «il giro
  vero trova quattro difetti che 80 test verdi non vedono». **Cosa guardare nel giro di conferma**:
  (a) l'intestazione della figlia porta `z-ai/glm-5.3-flash`; (b) `cached_tokens` non è più 0;
  (c) `rapporto.md` finisce col recinto; (d) `meta.json` dice `terminata:'done'` e la voce porta
  `bilancio`/`proveDistinte`; (e) se il modello sbaglia gli argomenti, la risposta a parole lo
  rimette in carreggiata **entro i giri rimasti**.
- ⛔ **Il terzo difetto di L8 non è curato**: la sezione non si aggiorna da sola quando la figlia
  finisce (la card resta «In corso» finché non si preme Aggiorna). È `frontend/`, fuori perimetro
  per questo lotto — resta aperto in `.claude/CODA-UNICA-DEBITI-2026-09-06.md`.
- ⛔ **Nessuna verifica visiva, nessuno screenshot, niente 4174.** Il campo `modello` nuovo non è
  mostrato da nessuna parte: esporlo nella card è del frontend.
- ⛔ **Il collettore resta non agganciato** (noto da L4): `giornale` con 3 eventi, `passi 0`,
  `spesa 0`, Piano e Fonti vuoti. Questo lotto non lo tocca.
- ⛔ **La ripresa di una ricerca `senza-rapporto`** con la consegna nuova: non provata. La consegna
  di ripresa porta `task.consegna` per intero, quindi *dovrebbe* portare le istruzioni nuove — ma
  «dovrebbe» non è una misura, e non ho fatto girare quel caso.
- ⛔ **`npm run kernel:controlla` è ROSSO, e lo era già**: repo 8.526 righe · `25b09317106ee3b5`,
  fonte mobile 6.260 righe · `b343ca4da1288ee9`. La copia del repo era già ~2.100 righe avanti
  prima di oggi (L1 la misurava a 8.368); questo lotto ne aggiunge ~158. Decide chi possiede il
  kernel.
- ⛔ **Le tolleranze del compositore sono quelle che ho immaginato**, non quelle misurate su un
  modello vero. Se il giro di conferma mostra una forma sbagliata che non ho previsto, la si
  aggiunge lì — con il caso vero davanti, non a tavolino.
- ⛔ **Niente `git`**: nessun commit, nessun push, come da brief.
