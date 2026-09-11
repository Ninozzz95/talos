# L1 + L2 — il permesso `'Research'`, il filtro degli attrezzi e il cancello di consegna

Lane `lane/harness-desktop`, 11/09/2026. Implementa i lotti **L1** e **L2** e gli agganci di **§6.6**
del disegno approvato `.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md`.
Nessun giro col modello avviato; sul 4174 nessuna richiesta (né GET né altro) da questa sessione.

---

## 1. Riproduzione — cosa faceva il codice prima della cura

Riprodotto leggendo il codice e i dati veri già raccolti nel disegno (§1), non re-interrogando il
server. La sessione di riferimento è `d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35` dell'11/09, ore 18:56-19:00.

| fatto | prova |
|---|---|
| la ricerca parte `permessi:'Read only'`, scritto a mano | `src/research-orchestrator.mjs:170` (prima della cura) |
| `document_create` le viene offerto lo stesso | `src/session-registry.mjs:1436-1455`, lista non filtrata dal permesso |
| e poi negato a runtime | `REFUSED. la sessione è in sola lettura…`, **due volte** |
| «il rapporto» è l'ultimo messaggio con del testo | `research-orchestrator.mjs:73-81` (`estraiTestoRapporto`) |
| ⇒ il rapporto permanente sono **290 byte di scusa** | voce di Libreria `lib-de24350b-…`, `origine:"generated"` |
| e lo stato è `done` | `:138-139`, derivato da `comeFinita`, mai dal contenuto |
| `reportLibraryId` non esce dalla rotta | `:243-256` proiettava 4 campi |
| `padreId: null`, `nome: null` | riga della sessione in `GET /api/v1/sessions` |

Costo del guasto: 9 `web_search`, 14 `naviga`, **484.171 token di ingresso** pagati, `cached_tokens: 0`.
Nessun errore da nessuna parte: `outcome: success`, `terminata: "done"`.

---

## 2. Ricerca web PRIMA di scrivere — fonte + data, e cosa ha cambiato

⚠️ `WebSearch` era esaurito per questa sessione (200/200, stesso limite che aveva trovato il disegno):
tutto è stato preso con **`WebFetch` diretto** sull'API di arXiv e sugli abstract, più i **cloni dei
concorrenti** in `%LOCALAPPDATA%\Temp\talos-competitor`. Rassegna ampia, **non esaustiva**.

| # | fonte | data | cosa ha cambiato nel codice |
|---|---|---|---|
| R1 | **«Agent Safety Is Action Alignment»**, Li & Zhao — [arXiv:2606.28739](https://arxiv.org/abs/2606.28739) | 27/06/2026 | «action safety requires *least privilege* enforced **outside the model at the action boundary**». ⇒ il filtro della lista **non è** la difesa: la difesa è `verificaPermessoScrittura`. Il test `document_create RESPINTO anche se lo si OFFRE a forza` esiste per questo |
| R2 | **«When Lower Privileges Suffice: Investigating Over-Privileged Tool Selection in LLM Agents»**, Yang, Bu, Yi et al. — [arXiv:2606.20023](https://arxiv.org/abs/2606.20023) | 18/06/2026 (v2 07/07) | la scelta di un attrezzo a privilegio più alto quando ne basta uno più basso è comune «and is further **amplified by transient failures**», e «prompt-level controls provide only **limited mitigation**». ⇒ (a) la consegna del prompt che diceva «non scrivere file» non poteva bastare, e infatti non è bastata; (b) la cura è **togliere dalla lista** l'attrezzo largo e offrirne uno stretto |
| R3 | **«CAPMAS: Capability-Based Delegation of Privileges in Multi-Agent Systems»** — [arXiv:2609.06500](https://arxiv.org/abs/2609.06500) | 06/09/2026 | delega con **riduzione monotona** del privilegio: una figlia non supera la madre. ⇒ vincolo che non avevo: ho verificato che `'ricerca'` non sia mai un'escalation, e l'ho provato (`research_start` è azione `write`, quindi una madre `lettura` non può nemmeno avviare una ricerca) |
| R4 | **«How Many Tools Should an LLM Agent See? A Chance-Corrected Answer»** — [arXiv:2605.24660v2](https://arxiv.org/abs/2605.24660) | 23/05/2026 | su ToolBench, Claude fa **87,1% con una rosa fissa di 5** e **93,1% con 7 scelti**. ⇒ «meno attrezzi» non è di per sé meglio: si tolgono **solo** i nomi che il cancello rifiuterebbe comunque, mai a occhio |
| R5 | **«Cited but Not Verified»** — [arXiv:2605.06635](https://arxiv.org/abs/2605.06635) | 07/05/2026 | la fonte sostiene davvero l'affermazione solo il **39-77%** delle volte. ⇒ contare le fonti richiede prima di **averle**: è il terzo controllo della forma minima |
| R6 | **«Sci-MMR»** — [arXiv:2609.11243](https://arxiv.org/abs/2609.11243) | 10/09/2026 | l'accuratezza della risposta supera di **oltre 20 punti** il recupero delle prove: si risponde bene senza avere le prove. ⇒ un rapporto senza fonti non è «corto», è senza il pezzo che conta |
| R7 | **Claude Code**, clone locale `claude-code/CHANGELOG.md` | letto 11/09/2026 | la plan mode gata al **cancello di chiamata**, e le righe **1172** (plan mode che eseguiva `touch`/`rm` senza prompt), **1538** (chiamate browser di stato non bloccate), **2638** (write non bloccate con una allow-rule `Edit(...)`) documentano **tre bypass diversi**. ⇒ il cancello è il posto giusto **ed è il più fragile**: da lì la scelta di due difese indipendenti sul confine del deposito |
| R8 | **Hermes v0.21**, clone + dossier `cap-01-hermes.md` | letto 11/09/2026 | `tools/approval.py`: `_YOLO_MODE_FROZEN` letto **una volta all'import** perché una skill non possa allentare i permessi a runtime; `write_approval: false` di default (il gate esiste ma non protegge chi non lo accende). ⇒ conferma che un livello nuovo deve essere **acceso per costruzione** da chi avvia, non un'opzione |

---

## 3. La cura, file:riga

### L1 — il livello `'ricerca'` e l'attrezzo `research_deposit`

| dove | cosa |
|---|---|
| `src/kernel/talosHarness.mjs` typedef `LivelloAccessoHarness` (~4864) | quinto livello `'ricerca'`, col perché e il confronto con `ExitPlanMode` |
| `src/kernel/talosHarness.mjs` `verificaPermessoScrittura` (~4993) | ramo `livello-ricerca`: nega tutto tranne `research_deposit`, e per quello controlla `resolve` + `startsWith(radice + sep)` con radice `<cartella>/.harness-ui-research/<id>`. Radice assente ⇒ **negato** (fail-closed, come `scrittura-area` senza `cartella`) |
| `src/kernel/talosHarness.mjs` `ATTREZZI_ESTESI` (~2317) | schema di `research_deposit({ testo })` — **nessun parametro di percorso** |
| `src/kernel/talosHarness.mjs` dispatch (~7696) | il ramo: id da `task.ricercaId` (dato del server), doppia difesa (`idRicercaValido` + cancello), scrittura con `disco.scrivi`, ricevuta con `contenutoScritto` **vero** (hash reale, a differenza di `document_create`) |
| `src/kernel/talosHarness.mjs` mappe (~4310, ~4460, 5165, 5181) | `research_deposit` in `AZIONI_MOBILE_PER_ATTREZZO`, `SICUREZZA_PER_ATTREZZO` (R1, `readsUntrustedContent:true`), `AZIONI_MUTANTI_PER_HOOK`, `ATTREZZI_CON_RICEVUTA` |
| `src/kernel/talosHarness.mjs` `attrezziNegatiDalLivello` (~4960) + `attrezziBase` (~5960) | il filtro §6.4. **La lista dei negati non è scritta a mano**: è derivata da `AZIONI_MOBILE_PER_ATTREZZO`, così chi aggiunge un mutante non deve ricordarsi di una seconda lista |
| `src/session-registry.mjs` (~2557) | `'Research'` → `livelloAccesso:'ricerca'` |
| `src/session-registry.mjs` (~1447) | `research_deposit` nella lista `strumentiEstesi` |
| `src/research-orchestrator.mjs` `avvia()` | `permessiRichiesti: 'Research'`, `task.ricercaId`, `padreId`, `nome` |
| `src/research-store.mjs` | `cartellaDellaRicerca`, `percorsoRapporto`, `idRicercaValido`, `dentroLaRadice`, `scriviRapporto`, `leggiRapporto` |

### L2 — il cancello di consegna e gli stati onesti

| dove | cosa |
|---|---|
| `src/research-store.mjs` `STATI_TERMINATI` | i **sei** valori in un posto solo (erano tre) |
| `src/research-store.mjs` `rileggiRapportoMinimo` | la forma minima **dichiarata**: intestazione + ≥1 affermazione + ≥1 fonte con URL in una sezione fonti |
| `src/research-store.mjs` `aggiornaRicerca` | tre campi nuovi: `conclusaAlle`, `ultimoMessaggio`, `motivoDettaglio` |
| `src/research-store.mjs` `creaRicerca` | due campi nuovi: `padreId`, `nome` |
| `src/research-orchestrator.mjs` `onConclusioneRicerca` | il cancello: rapporto rileggibile → `done`; depositato ma illeggibile → `senza-rapporto`; assente + REFUSED → `bloccata-dal-permesso`; assente + giri finiti → `giri-esauriti`; altrimenti `failed` |
| `src/research-orchestrator.mjs` `ultimoMessaggioDelModello` | era `estraiTestoRapporto`: **il nome era la bugia**. Ora è un allegato |
| `src/research-orchestrator.mjs` `trovaRifiutoDiPermesso` | legge i messaggi `role:'tool'` (il registro), **mai** il racconto dell'assistente |
| `src/research-orchestrator.mjs` `motivoDelloStato` | la frase umana, in italiano, solo quando non è `done` |
| `src/research-orchestrator.mjs` `voceEsposta`/`elenca`/`leggi` | il contratto a 12 campi; `leggi()` corregge **al volo** le ricerche vecchie |
| `src/research-orchestrator.mjs` `promptRicerca` | la consegna dice **come** si consegna e che l'ultimo messaggio **non** è il rapporto |

---

## 4. Le prove — nei due versi

`tests/ricerca-permesso-e-consegna.test.mjs` (**nuovo**, 27 test) · `tests/research-orchestrator.test.mjs`
(riscritto dove la semantica è cambiata) · `tests/session-registry.test.mjs` (filo intero aggiornato).

**Il verso che dice di sì**
- `research_deposit` sotto `ricerca` scrive davvero `.harness-ui-research/<id>/rapporto.md` (byte riletti dal disco).
- un rapporto con titolo + affermazioni + fonti → `done`, e in Libreria finisce **il deposito**, non la chiacchiera finale.
- una ricerca che deposita **e poi** esaurisce i giri resta `done`: chi ha consegnato ha consegnato (l'errore opposto, evitato apposta).
- il rapporto c'è ma la Libreria lancia → resta `done` con `reportLibraryId: null` (una copia fallita non cancella il lavoro pagato).

**Il verso che deve dire di no**
- sotto `ricerca`: `scrivi` respinto e **nessun file** sul disco; `shell` respinto e **nessun marker**; `prova` fuori dalla lista.
- `document_create` respinto **anche offrendolo a forza** con `strumentiEstesi` — la difesa è il cancello, non la lista (R1).
- `ricercaId` ostile `../../altrove` → REFUSED, **niente scritto fuori**.
- `research_deposit` con testo vuoto → REFUSED, **nessun file vuoto**.
- `research_deposit` fuori da una ricerca (nessun `task.ricercaId`), anche con `accesso-pieno` → lo dice, non inventa una cartella.
- `lettura` **invariato**: `research_deposit` respinto lì come tutto il resto, col motivo di sempre.
- **riduzione monotona (R3)**: madre `lettura` → `research_start` REFUSED, `onRicercaAvvia` **mai** chiamata.
- **la fixture obbligatoria**: la scusa verbatim del 11/09 + un `REFUSED` fra i risultati degli attrezzi → `bloccata-dal-permesso`, **mai** `done`; e la Libreria resta vuota.
- **due falsi positivi provati**: la scusa **da sola** (senza REFUSED nel registro) → `failed`; un REFUSED **citato dal modello** in un messaggio `assistant` → `failed`. Il filtro riconosce la cosa, non la menzione.
- forma minima: senza fonti / senza affermazioni / senza titolo / vuoto / non-stringa → tutti respinti, col motivo giusto; un URL **in mezzo alla prosa** non conta come fonte.
- `idRicercaValido` respinge `..`, `.`, `../x`, `a/b`, `a\b`, `C:\Windows`, stringa vuota, 65 caratteri, non-stringhe.
- `dentroLaRadice`: `radice-gemello` **non** contiene `radice/x.md` (un prefisso di stringa non basta), e radice assente non è un «vince tutto».

**La regressione che temevo — TALOS-BANCO**
- `attrezziNegatiDalLivello({})` → insieme **vuoto**: senza `livelloAccesso` non si toglie niente a nessuno.
- la lista del banco resta esattamente `elenca, cerca, leggi, scrivi, prova, shell, naviga`.
- e col `strumentiEstesi` delle varianti la lista è **identica** a quella di prima del filtro (`document_create` incluso).

**Compatibilità all'indietro (§6.5)**
- una ricerca già su disco con `terminata:'done'` e in Libreria la scusa → `leggi()` mostra `senza-rapporto`, **e il record su disco resta intatto** (`terminata` ancora `'done'`, `reportLibraryId` ancora al suo posto): asserito esplicitamente.
- una voce vecchia senza `padreId`/`nome`/`conclusaAlle` non rompe il contratto: `null` onesti, `nome` ricavato dalla domanda.

**Numeri**
- `node --test tests/*.test.mjs` → **2360 test, 2360 verdi, 0 rossi** (erano 2323 prima di questo lotto).
- `node --test src/kernel/talosHarness.test.mjs` → **558 test, 555 verdi, 3 rossi** — gli **stessi tre** preesistenti (`ambienteSenzaCredenziali` ×2 e `un'uscita lunga tiene testa E coda`), non toccati da questo lavoro.

---

## 5. Il contratto esposto — una voce, verbatim

Ogni elemento di `elenca().ricerche` e il corpo di `leggi()` (più `contenutoRapporto`).
La rotta `GET /api/v1/sessions/<id>/research` lo passa **così com'è** (`http-app.mjs:4545`,
`data = { ricerche: esito.ricerche, errore: esito.errore }`): non ho toccato quel file.

```json
{
  "id": "d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35",
  "domanda": "Come stanno evolvendo gli harness agentici desktop nel 2026",
  "question": "Come stanno evolvendo gli harness agentici desktop nel 2026",
  "titolo": "Come stanno evolvendo gli harness agentici desktop nel 2026",
  "nome": "Come stanno evolvendo gli harness agentici desktop nel 2026",
  "stato": "bloccata-dal-permesso",
  "avviataAlle": "2026-09-11T18:56:46.041Z",
  "conclusaAlle": "2026-09-11T19:00:33.549Z",
  "reportLibraryId": null,
  "motivo": "La sessione era in sola lettura e non ha potuto depositare il rapporto: il lavoro è stato fatto, la consegna no.",
  "padreId": "86fad6e7-53c8-4786-9c14-694fd47894ec",
  "ultimoMessaggio": "La sessione è in sola lettura, quindi non posso creare documenti direttamente. Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato…"
}
```

- `stato` ∈ `running | paused | done | cancelled | failed | senza-rapporto | bloccata-dal-permesso | giri-esauriti`.
- `motivo` è `null` **solo** quando `stato === "done"`; altrimenti è sempre una frase italiana.
- `question` e `domanda` sono lo **stesso valore** (alias esplicito, mai una traduzione a metà strada).
- `ultimoMessaggio` è un **allegato**: va mostrato come «ciò che il modello ha detto alla fine», mai come rapporto.
- il test `CONTRATTO §6.4` asserisce le **chiavi esatte** con `deepEqual` sulle chiavi ordinate: se il contratto cambia, il test diventa rosso invece di divergere in silenzio.

---

## 6. Le deviazioni dal disegno, dichiarate

1. **`research_deposit({ testo })` non ha un percorso, e l'id viaggia in `task.ricercaId`.**
   Il disegno diceva radice `join(cartella, '.harness-ui-research', id)`, e quella è la radice usata —
   ma il kernel **non conosce il proprio sessionId** e l'unico punto che potrebbe iniettarlo
   (`agent-service.mjs`, che enumera a mano ogni parametro di `talosLavora`) è di un altro agente
   in questa sessione. `task` è persistito nell'intestazione della sessione, quindi l'id sopravvive
   a un riavvio e a un resume: un parametro nuovo si sarebbe perso alla prima ripresa, cioè proprio
   nel caso in cui una ricerca è lunga.
2. **La voce di Libreria la scrive l'orchestratore alla conclusione, non l'attrezzo.**
   L'attrezzo scrive `rapporto.md`; il cancello lo rilegge e **solo se passa** lo salva in Libreria.
   Così una scrittura di Libreria non avviene mai da dentro una sessione che il permesso limita, e
   in Libreria non può finire un rapporto che il cancello ha respinto.
3. **Il filtro §6.4 vive nel kernel, non in `session-registry.mjs`.** La lista del registro governa
   solo gli attrezzi *estesi*; `scrivi`/`shell`/`prova` sono *base* e si possono togliere solo dove
   `attrezziBase` viene costruito. Farlo in due posti avrebbe creato due liste che divergono.
4. **`prova` è nei negati oltre ai sei nomi elencati in §6.4**, perché il cancello lo rifiuta
   esattamente come `scrivi`/`shell` (`talosHarness.mjs:6608-6620`): lasciarlo offerto avrebbe
   riprodotto lo stesso difetto per un settimo attrezzo.
5. **`'Research'` non è entrato in `PERMESSI_AMMESSI`** (`config.mjs:254`): è deliberato. Nessun
   client HTTP può chiedere quel permesso — lo scrive solo `research-orchestrator.avvia()`.
6. **`leggiRapportoFn` è stato aggiunto ai parametri di `createSessionRegistry`** (righe 1378-1386 e
   1506), fuori dalle tre zone nominate nel brief. Senza, un test del registro avrebbe letto il
   filesystem **vero** della macchina: misurare l'ambiente invece dell'oggetto.

---

## 7. Cosa NON ho verificato

- **Nessun giro col modello vero, nessuno screenshot, niente 4174.** Tutto è provato a unità e a
  filo intero con reti finte: nessuno di questi test dimostra che `glm-5.3-flash` *chiami davvero*
  `research_deposit` invece di rispondere in chat. È il pezzo che il disegno chiama **L8**, e vale
  la lezione già pagata: «il giro vero trova quattro difetti che 80 test verdi non vedono».
- **Il `nome` della SESSIONE non sopravvive a un riavvio** (quello della *ricerca* sì, è sulla
  metadata). Serve una riga `nome-sessione` nel registro: `session-registry.mjs` fuori perimetro.
- **La ripresa di una ricerca `bloccata-dal-permesso` già esistente** col permesso nuovo: §6.6 la
  lascia aperta all'owner e non l'ho toccata. I 484.171 token dell'11/09 sono in `messaggiFinali`,
  ma non ho misurato se il contesto sia ancora ricostruibile.
- **La UI.** «Ricerca approfondita» al posto di `Research`/`ricerca` a schermo, e la resa dei sei
  stati, sono del frontend: non ho aperto `frontend/` né `public/`. In particolare resta **falsa**
  la frase `sezioni-adattatori.js:418` («Il rapporto è stato scritto in .harness-ui-research/»)
  che ora, per le ricerche nuove, è diventata **vera** — ma va comunque riletta da chi possiede
  quel file, perché il rapporto sta in `<id>/rapporto.md`, non nella cartella nuda.
- **Il record recintato vero** (`src/research/report.mjs`): non esiste ancora nel repo. La forma
  minima di oggi è dichiarata tale, e `rileggiRapportoFn` è il punto di innesto per sostituirla.
- **`npm run kernel:controlla` è ROSSO, e lo era già**: le due copie del kernel divergono (repo
  8.368 righe · `2843255cd797744f`, fonte mobile 6.260 righe · `b343ca4da1288ee9`). Non è causato
  da questo lavoro — la copia del repo era già ~2.100 righe avanti — ma va deciso da chi possiede
  il kernel se e quando riallinearle.
- **`elenca()` non rilegge i rapporti**, `leggi()` sì: una ricerca vecchia appare `done` in elenco e
  `senza-rapporto` quando la si apre. È una divergenza **voluta** (20 letture di file a ogni
  apertura della sezione sarebbero un costo per disegnare una lista) e va detta al frontend.
- **Niente git**: nessun commit, nessun push, come da brief.
