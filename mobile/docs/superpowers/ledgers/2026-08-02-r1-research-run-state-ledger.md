# R-1 — lo stato ripartibile di una ricerca

Data: 2026-08-02 · Fase 2 della scaletta owner · Spec: `specs/2026-07-26-deep-research-spec.md` §2.2, §9

R-1 è la fase che la spec mette per prima perché **è la parte che non si può
aggiungere dopo**: lo stato serializzabile è insieme la ripresa (R6) e la
giuntura cloud (R1b). Farla per ultima significherebbe riscrivere.

---

## Checkpoint di ricerca web (REGOLA ZERO)

| Query | Fonti | Impatto sul disegno |
|---|---|---|
| Android 16 foreground service `dataSync` `onTimeout`, limite 6 ore | developer.android.com (FGS timeouts, behavior-changes-15), home-assistant/android#5338, b4x forum | **Confermato e precisato**: 6 ore ogni 24 per `dataSync`, contate **separatamente** da `mediaProcessing`; allo scadere arriva `onTimeout()` e restano **pochi secondi** per `stopSelf()`; poi un nuovo avvio lancia `ForegroundServiceStartNotAllowedException` finché l'utente non riporta l'app in primo piano, che azzera il contatore. ⇒ una run lunga **deve** poter essere interrotta a metà e ripresa: non è una gentilezza, è l'unico modo in cui può esistere |
| OEM aggressivi: ColorOS / OxygenOS che uccidono i servizi | dontkillmyapp.com/oneplus, androidauthority, gadgethacks, singularity-app | OnePlus ha «uno dei limiti di background più severi sul mercato», e le impostazioni concesse dall'utente **si riazzerano con gli aggiornamenti di firmware**; nel 2026 OxygenOS converge su ColorOS, che è la variante più aggressiva. Il dispositivo di prova è un OnePlus: ⇒ il processo **verrà** ucciso, va progettato come normalità e non come guasto |
| Durable execution, checkpointing, idempotenza per agenti (2026) | zylos.ai (×3), agentmarketcap, appscale.blog, vadim.blog, aiworkflowlab | Due meccanismi dominano: **journal append-only con replay** e **checkpoint su database a ogni nodo**. LangGraph: `MemorySaver` per lo sviluppo, SQLite/Postgres in produzione — **esattamente il doppio repository che questo repo ha già**. Le chiavi di idempotenza sono indicate come requisito di prima classe. Un registro di eventi ordinato abilita anche **fork, audit e conversione in test di regressione** |
| I concorrenti riprendono una ricerca interrotta? | community.openai.com (×3), wikipedia ChatGPT Deep Research, learnwithcheer | ChatGPT permette di **aggiungere contesto** a metà senza perdere il lavoro, ma **fermarla del tutto obbliga a ricominciare da capo**; nei forum abbondano run bloccate su «Researching…» e «Streaming interrupted» senza recupero. Su Gemini e Perplexity non risulta nulla di pubblico sulla ripresa |

### La riga L3 (dottrina one-up)

Non è parità e non è un gradino sopra: è **strutturale**.

I concorrenti girano su un server, quindi «ripartire» per loro è una comodità
che possono permettersi di non avere — e infatti non ce l'hanno: fermare una
ricerca significa ricominciarla. TALOS gira dentro un telefono che **la
ucciderà**: Doze, il budget di sei ore, e un OEM che riazzera i permessi a ogni
aggiornamento di firmware. Il vincolo che rende la cosa più difficile a noi è
esattamente ciò che produce la capacità che loro non hanno.

E siccome lo stato è serializzabile, la stessa proprietà è la giuntura cloud
(R1b): far migrare l'esecuzione fuori dal telefono non è codice in più.

---

## Una divergenza deliberata dalla letteratura

La guida di Temporal deriva la chiave di idempotenza da **run + attività +
NUMERO DI TENTATIVO**. Qui il numero di tentativo è **escluso** dalla chiave.

Il motivo è che i due contesti vogliono cose opposte. Là la chiave serve a
distinguere due tentativi perché il secondo *deve* rieseguire. Qui l'utente paga
di tasca sua (BYOK) e ogni ricerca è denaro: due tentativi dello stesso passo
logico devono poter essere riconosciuti come **lo stesso**, così che un
fornitore capace di deduplicare non faccia pagare due volte. Il numero di
tentativo resta registrato accanto, come prova di cosa è successo, non dentro la
chiave.

Detto esplicitamente perché è una divergenza, non una dimenticanza.

---

## Cosa è costruito in questa unità

Il cuore puro: il registro append-only, lo stato derivato, il punto di ripresa e
la contabilità della spesa. Nessun Android, nessuna rete, nessuna intelligenza —
la spec chiede «una run finta che dorme e riprende».

## Cosa NON è costruito, e va detto

- La persistenza SQLite (qui c'è il contratto e l'implementazione in memoria,
  che è il pattern già in uso nel repo).
- Il foreground service, la notifica e la ripresa reale dopo un kill.
- **La verifica su dispositivo**: il tablet è fermo prima dello sblocco. Finché
  non gira su un telefono vero, questa fase resta «costruita, non esercitata» —
  la stessa categoria del centro download.
