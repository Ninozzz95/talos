# Ledger Fase 1 — Compatta: stato di lavoro osservabile (K)

Data avvio: 2026-08-30  
Perimetro: Harness UI desktop nel worktree `AVM-harness-desktop`, nessun
mirror mobile e nessun cambiamento a TALOS-BANCO.

## Decisione owner e problema riprodotto

Finding K dalla QA visiva del 2026-08-30: `compactSession()` invia la POST
reale a `/api/v1/sessions/:sessionId/compact`, che può richiedere un giro LLM
di circa due minuti, ma il bottone `#compactSessionBtn` non cambia stato. Il
secondo click può quindi avviare una seconda richiesta concorrente e lo
schermo non spiega se il lavoro è in corso o se la UI si è bloccata.

Percorso UI: topbar → bottone `#compactSessionBtn` (oppure palette `⌘K` →
`[data-command="compact"]`) → `compactSession()` in
`mobile/public/harness-ui/app.js:5547` → `apiPost()` → endpoint reale
`harness-ui/src/http-app.mjs:1097-1121` →
`sessionRegistry.compatta()` → `compattaSessione()` del kernel.

La causa è locale e verificata leggendo il codice: `compactSession()` ha solo
`try/catch`, nessun lock di re-entrancy, nessun `disabled`, `aria-busy` o
messaggio di stato. Il backend invece mantiene già il contratto reale e non
va duplicato né modificato in questa fase.

## Ricerca web primaria (obbligatoria prima del codice)

Eseguita il 2026-08-30, fonti aggiornate alla data:

- Hermes configuration/context compression:
  https://hermes-agent.nousresearch.com/docs/user-guide/configuration
  — mostra l'avviso di ciclo (`Compacting context…`), progresso di retry e
  completamento; il CLI espone anche una barra di pressione del contesto.
- Hermes agent loop:
  https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop/
  — compressione come operazione distinta, memoria flush prima del riassunto,
  tool-pair non spezzate e nuova lineage.
- pi context compaction:
  https://github.com/earendil-works/pi/issues/92
  — comando compattazione disponibile nel TUI/RPC e compaction event
  persistito, con attenzione a non rompere i turni/tool pair.
- OpenAI Codex compaction UX feedback:
  https://github.com/openai/codex/issues/24071
  e https://github.com/openai/codex/issues/23969 — la perdita di un
  indicatore vicino al composer è stata segnalata come regressione: lo stato
  di contesto deve restare visibile e a bassa frizione.

Decisione upstream: **adattare** il minimo comune (stato visibile, blocco del
doppio avvio, ripristino certo su successo/errore) al contratto esistente di
TALOS. Non adottare un nuovo progress protocollo: l'endpoint restituisce solo
`compattato`, quindi inventare percentuali sarebbe fabbricazione.

## Confronto competitivo per questo fix

| Prodotto | Forza osservata | Debolezza/limite | Decisione TALOS |
|---|---|---|---|
| Hermes | ciclo esplicito `Compacting context…` + completamento/retry; pressione contesto osservabile | le notifiche di progresso sui canali chat sono opt-in e non prova di una percentuale precisa dell'operazione | adottare stato start/success/error, mantenere l'allowlist e non inventare progressi |
| pi-agent | compaction event persistito e comando disponibile in tutti i modi | UI primaria TUI/RPC, non un riferimento desktop visuale completo | adattare evento/risultato al toast e al controllo locale TALOS |
| Codex | feedback diretto conferma il valore di un indicatore vicino al composer | app closed: il ticket non prova il protocollo interno né un'API pubblica | usare solo il principio verificabile: stato leggibile vicino al comando |
| Claude Code | riferimento di usabilità coding e compattazione manuale | UI proprietaria, nessuna fonte primaria pubblica sufficiente per dettagli | confronto empirico solo se ripetibile; non copiare semantiche non verificabili |
| DeepSeek Harness | architettura plugin e separazione host/client | developer preview, non una UX di compattazione comparabile | N/A per questo micro-fix |
| Gemini/ChatGPT/OpenClaw/local runners | possono avere indicatori o spinner propri | superfici chiuse/eterogenee, nessuna prova primaria uniforme per questo percorso | N/A salvo confronto screenshot riproducibile |

Obiettivo one-up: **L3** sul percorso visivo: oltre al feedback start/end,
TALOS garantisce che una sola richiesta possa esistere alla volta e che il
controllo torni attivo anche sul percorso contrario di errore; nessuna
percentuale o successo finto.

## Piano di esecuzione a livello di codice

### File da modificare

1. `mobile/public/harness-ui/app.js`
   - simbolo `compactSession()`;
   - aggiornare solo il bottone esistente `#compactSessionBtn` e i comandi
     esistenti che passano da `compactSession()`;
   - nessuna nuova astrazione o endpoint.
2. `harness-ui/scripts/qa-visual-pipeline.mjs`
   - aggiungere scenario sintetico `qa-compact-loading` che stubba SOLO la
     risposta HTTP della POST compact, congela la Promise e prova start,
     doppio click, success e failure/retry via browser CDP reale;
   - screenshot durante e dopo ogni percorso, con taccuino automatico.
3. `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
   - append-only: riproduzione K, immagini e ispezione completa, confronto
     competitor, esito contrario.

### File da non toccare

`harness-ui/src/http-app.mjs`, `harness-ui/src/session-registry.mjs`, kernel
importato, TALOS-BANCO, worktree mobile principale.

### RED prima del codice

Scenario `qa-compact-loading` eseguito contro `http://127.0.0.1:4174`:

- con la Promise compact trattenuta, dopo click reale il bottone deve avere
  `disabled=true`, `aria-busy=true` e un'etichetta di lavoro;
- un secondo click mentre la Promise è trattenuta non deve aumentare il
  contatore POST;
- dopo una risposta envelope di successo il bottone torna attivo e compare
  il toast già previsto;
- dopo una rejection il bottone torna attivo, compare l'errore e un retry
  successivo è possibile.

Il RED atteso sul codice attuale è: `disabled=false`, `aria-busy` assente,
secondo click non bloccato.

### GREEN e regressioni

- `node harness-ui/scripts/qa-visual-pipeline.mjs qa-compact-loading`
  (Chrome dedicato/CDP; almeno desktop 1440×900 e laptop 1024×800 tramite
  `?qa=desktop`/`?qa=laptop`);
- `node --test tests/*.test.mjs` dalla directory `harness-ui`;
- `node --test harness-ui/tests/*.test.mjs` dalla radice: il finding
  F0-TEST-PATH resta separato e deve essere riportato se ancora rosso;
- `git diff --check`.

### Percorso contrario e rollback

Percorso contrario obbligatorio: errore/rete rifiutata → nessun lock residuo,
toast di errore, retry singolo funzionante; anche doppio click durante errore
trattenuto deve restare una sola POST.  
Rollback: ripristinare esclusivamente il blocco `compactSession()` e lo
scenario QA aggiunto, senza alterare lo stato del server o le sessioni reali.

### Verifica visiva e taccuino

Per ogni viewport: screenshot pre-click, durante attesa, dopo successo,
during failure e dopo retry; ogni immagine va ispezionata interamente (non
solo il bottone) per layout, contrasto, testo, focus, toast e sovrapposizioni.
La verifica Pad a quattro orientamenti appartiene al mirror mobile e non è
un gate di questo fix desktop; va comunque marcata `N/A — perimetro desktop`
e ripresa nella fase mobile dedicata.

## Stato

- Fase 0 baseline: completata.
- Fase 1 K: **completata RED → GREEN sul server locale**. Il lock di
  re-entrancy, lo stato accessibile e lo spinner rispettano il contratto
  esistente; il backend non è stato modificato.
- Ownership: **desktop soltanto**. La lane `AVM`/mobile è stata usata solo
  come riferimento documentale; nessun file mobile principale, Pad o
  TALOS-BANCO è stato toccato o dichiarato verificato.

## Evidenza RED → GREEN (2026-08-30)

### RED riprodotto prima del fix

Comando eseguito contro il server locale `http://127.0.0.1:4174`:

```text
node harness-ui/scripts/qa-visual-pipeline.mjs qa-compact-loading --url=http://127.0.0.1:4174/ --porta=9561
```

Esito: **exit 1**, come previsto. Con la POST trattenuta il DOM restava
`disabled=false`, `aria-busy` assente e label `Comprimi il contesto`; il
secondo click non era bloccato. Le due schermate RED sono state ispezionate
interamente e non mostravano alcun segnale visivo di lavoro in corso.

### GREEN desktop 1440×900

```text
node harness-ui/scripts/qa-visual-pipeline.mjs qa-compact-loading --url=http://127.0.0.1:4174/ --porta=9564
```

Esito: **exit 0**, 0 eccezioni JS, 0 errori console e una sola richiesta
fallita nota al favicon preesistente (`/favicon.ico`, 404). Report:

`harness-ui/.qa-runs/qa-compact-loading-2026-08-30T16-09-58-149Z/report.json`

Stati misurati: durante la POST `disabled=true`, `aria-busy=true`, label
`Compattazione in corso`, secondo click ancora a **1** richiesta; su errore il
lock viene rilasciato e il retry porta il contatore a **3** richieste totali.

### GREEN laptop 1024×800

```text
node harness-ui/scripts/qa-visual-pipeline.mjs qa-compact-loading --url=http://127.0.0.1:4174/?qa=laptop --porta=9565
```

Esito: **exit 0**, stessi stati e stesso unico 404 del favicon. Report:

`harness-ui/.qa-runs/qa-compact-loading-2026-08-30T16-10-13-225Z/report.json`

## Ispezione visiva completa e taccuino

Per ciascuna viewport sono state guardate tutte le sei immagini (pre-click,
loading, successo, errore-loading, errore e retry), non solo il bottone:

- topbar, sidebar delle sessioni, chat centrale e rail destro conservano
  allineamento, densità e token del tema;
- il controllo di compattazione diventa ambrato e mostra attività senza salto
  di layout; il testo accessibile resta disponibile via label/title;
- i toast di successo, errore e retry restano leggibili in basso a destra,
  senza clipping o sovrapposizioni; l'accumulo osservato nella sequenza è un
  artefatto del test sintetico che forza più esiti, non una regressione del
  singolo percorso utente;
- nessun cambiamento di altezza del composer, nessun focus perso e nessuna
  eccezione fuori dal 404 del favicon preesistente;
- il badge `Demo UI · non collegato` e l'assenza di una sessione reale nel
  fixture restano coerenti con il perimetro dichiarato del test.

Screenshot completi:

- `harness-ui/.qa-runs/qa-compact-loading-2026-08-30T16-09-58-149Z/`
  (1440×900)
- `harness-ui/.qa-runs/qa-compact-loading-2026-08-30T16-10-13-225Z/`
  (1024×800)

## Confronto competitivo e decisione finale

Hermes rende esplicito l'avvio della compattazione, i retry e il completamento;
pi persiste l'evento di compattazione preservando le coppie tool; i report
pubblici di Codex confermano che perdere l'indicatore vicino al composer è una
regressione UX. TALOS adotta questi segnali verificabili ma fa un passo in più
nel proprio perimetro: lock unico contro il doppio invio, stato accessibile,
reset garantito su successo **e** errore, senza percentuali inventate perché
l'endpoint restituisce solo l'envelope `compattato`.

Il confronto con Claude Code, DeepSeek Harness, Gemini, ChatGPT, OpenClaw e
runner locali è `N/A` per questa micro-superficie: non esiste una fonte
primaria pubblica e riproducibile che esponga lo stesso contratto desktop;
non vengono quindi dichiarate parità non misurate.

## Gate residui e rollback

- `node --test tests/*.test.mjs` dalla directory `harness-ui`: **960 pass,
  0 fail** dopo il fix.
- Il comando dalla radice con il path documentato può mantenere il finding
  indipendente `F0-TEST-PATH` (un test risolve `src/...` dalla cwd sbagliata):
  non è stato corretto in questa fase.
- `git diff --check`: **pulito** (verificato dopo l'aggiornamento del
  ledger e del taccuino).
- Rollback minimo: rimuovere il guard e gli attributi di loading aggiunti a
  `compactSession()`, la regola CSS/spinner e lo scenario QA; nessun dato reale
  o stato del server viene alterato.

Nessun commit o push è stato eseguito in questa fase.
