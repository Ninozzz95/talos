# L3b — il porto del motore di ricerca, metà «b» (11/09/2026)

> Lotto L0 via (a) + L3 di `.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md`.
> Dieci file da `AVM/mobile/src/lib/research/*.ts` a `harness-ui/src/research/*.mjs`,
> ESM con tipi in JSDoc, **coi test del mobile tradotti e verdi prima di qualunque aggancio**.
> ⛔ `AVM/mobile/` è stato solo **letto**: `git status` del mobile non ha una riga mia.

---

## 1. Ricerca web PRIMA di scrivere — fonte + data

⛔ Il budget `WebSearch` della sessione era **esaurito (200/200)** al primo tentativo. Le due
domande del brief sono state chiuse con `WebFetch` su **fonti primarie**, non su training data:

| domanda | fonte | data della fonte | cosa ha cambiato nel codice |
|---|---|---|---|
| *event-sourced state machine replay idempotency* | [Microsoft Learn — Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) | `ms.date: 2026-03-27`, aggiornata `2026-08-15` | Ha **confermato tre scelte del mobile** e me ne ha date le parole: (a) *«Event handlers must be idempotent so processing a duplicate event doesn't change the outcome … design state mutations that are inherently safe to repeat»* ⇒ è esattamente `step_finished` che scrive `spend: event.spend` invece di sommarlo (`run.mjs`); (b) *«Tolerant deserialization: design event consumers to ignore unknown fields»* ⇒ il ramo `default` di `talosResearchApply` che ignora un `kind` sconosciuto, che ho **provato** (test mio: un evento `'quello-che-verra'` da una versione più nuova); (c) *«Set up past events, issue a command, and assert on the new events produced»* (given-when-then) ⇒ è la forma dei test tradotti, e mi ha fatto aggiungere il test sui **dieci stati** e sui due predicati `isTerminal`/`isResting`, che il mobile non provava. |
| *porting TypeScript to JSDoc-typed JavaScript* | [TypeScript Handbook — JSDoc Reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) | pagina viva del handbook 5.x, letta 11/09/2026 | Forma dei tipi portati: `@typedef {object}` + `@property` per le interfacce, `@typedef {A\|B}` per le union, `@template {Vincolo} T` per i generici (`talosResearchPickJudge`, `scegli`), `[p]` per gli opzionali, e **`import('./x.mjs').Tipo` invece di `@import`** perché `@import` vuole `checkJs` e `harness-ui/` **non ha un `tsconfig.json`** (verificato: nessuno alla radice, nessuno script `typecheck`). ⇒ I JSDoc qui sono contratto leggibile + aiuto all'editor, non un cancello: **lo dico invece di lasciarlo credere**. |

⛔ Nessuna dipendenza nuova. `package.json` non è stato toccato.

---

## 2. La tabella — file per file

| # | mobile `.ts` | righe TS | → desktop `.mjs` | righe mjs | test del mobile | tradotti | scritti da me | **verdi** |
|---|---|---:|---|---:|---|---:|---:|---:|
| 1 | `researchPlan.ts` | 271 | `plan.mjs` | 301 | `researchPlan.test.ts` (116) | 8 | 3 | **11 / 11** |
| 2 | `researchOpposing.ts` | 279 | `opposing.mjs` | 305 | `researchOpposing.test.ts` (280) | 28 | 0 | **28 / 28** |
| 3 | `researchOpenCards.ts` | 112 | `open-cards.mjs` | 131 | `researchOpenCards.test.ts` (110) | 14 | 0 | **14 / 14** |
| 4 | `researchVerification.ts` | 544 | `verification.mjs` | 572 | `researchVerification.test.ts` (401) | 39 | 2 | **41 / 41** |
| 4b | *(idem)* | — | *(idem)* | — | `researchContested.test.ts` (127) | 11 | 0 | **11 / 11** |
| 5 | `researchRecheck.ts` | 176 | `recheck.mjs` | 194 | `researchRecheck.test.ts` (124) | 7 | 0 | **7 / 7** |
| 6 | `researchRecheckHistory.ts` | 176 | `recheck-history.mjs` | 192 | `researchRecheckHistory.test.ts` (116) | 10 | 0 | **10 / 10** |
| 7 | `researchRecheckDocument.ts` | 57 | `recheck-document.mjs` | 69 | ⛔ **non esiste** | 0 | 6 | **6 / 6** |
| 8 | `researchRun.ts` | 492 | `run.mjs` | 527 | `researchRun.test.ts` (282) | 22 | 4 | **26 / 26** |
| 9 | `researchCollector.ts` | 155 | `collector.mjs` | 164 | `researchCollector.test.ts` (104) | 7 | 0 | **7 / 7** |
| 10 | `researchSynthesis.ts` | 282 | `synthesis.mjs` | 309 | `researchSynthesis.test.ts` (218) | 17 | 2 | **19 / 19** |
| | **totale** | **2.544** | | **2.764** | **1.878 righe di test** | **163** | **17** | **180 / 180** |

Le `.mjs` sono più lunghe delle `.ts` (+220 righe, +8,6%) per una ragione sola: i tipi che in
TypeScript stanno sulla riga della firma qui stanno in un blocco `@typedef` sopra. **Nessuna riga di
logica è stata aggiunta o tolta.**

### Il controllo di fedeltà, fatto a macchina

Per ogni coppia ho confrontato **l'insieme dei nomi esportati** (`export function|const|interface|type`
nel `.ts` contro `export function|const` + `@typedef` nel `.mjs`):

```
researchPlan            TS  271  mjs  301   MANCANTI: nessuno
researchOpposing        TS  279  mjs  305   MANCANTI: nessuno
researchOpenCards       TS  112  mjs  131   MANCANTI: nessuno
researchVerification    TS  544  mjs  572   MANCANTI: nessuno
researchRecheck         TS  176  mjs  194   MANCANTI: nessuno
researchRecheckHistory  TS  176  mjs  192   MANCANTI: nessuno
researchRecheckDocument TS   57  mjs   69   MANCANTI: nessuno
researchRun             TS  492  mjs  527   MANCANTI: nessuno (*)
researchCollector       TS  155  mjs  164   MANCANTI: nessuno
researchSynthesis       TS  282  mjs  309   MANCANTI: nessuno
```

(*) `TalosResearchEvent` risultava mancante a un primo giro: era un **falso positivo del mio grep** —
è un `@typedef` su 13 righe e il nome sta sull'ultima (`run.mjs:187`). Verificato a mano.

---

## 3. Scostamenti dal mobile — **due**, dichiarati uno per uno

Non zero. Sono questi, e **nessuno dei due cambia una semantica**:

1. **`vi.fn()` → una chiusura che registra le chiamate** (`collector.test.mjs`, ultimo caso).
   Vitest non c'è nel kernel e il brief vieta dipendenze nuove. L'asserzione è identica:
   `search` viene chiamata **una volta**, con `(BRANCH.question, 7)` — cioè con la dimensione che
   l'utente aveva approvato in R-2.
2. **I `describe`/`it` di vitest diventano `test(..., async (t) => await t.test(...))`.**
   `node:test` non ha `describe`; la forma annidata tiene i gruppi leggibili nel resoconto e
   **conserva l'ordine e i nomi originali**. Effetto collaterale contabile: il conteggio di
   `node --test` include il test padre, quindi «28 verdi» su `opposing` sono 22 casi + 6 gruppi.

⛔ Tutto il resto è **verbatim**: stesse costanti (`ECO 0.9`, `PAVIMENTO 4`, `MASSIMO 400`,
`INTACT_AT 0.95`, `SHINGLE 5`, `MAX_CHARS_PER_SOURCE 20_000`, `COMPLETION_SHARE 0.15`,
`TALOS_LOCAL_SOURCES_TOTAL 6`), stesse regex (`INCOLLATE`, `VERDICT`, `SOLO_VERDETTO`,
`PLACEHOLDER`), stessi testi dei prompt **carattere per carattere** (virgolette curve comprese: sono
asserite dai test), stessi nomi esportati.

### I punti che il disegno chiedeva di guardare — tutti provati

| dal brief | dove | prova |
|---|---|---|
| 11 eventi, 10 stati | `run.mjs:180-193`, `:66` | test mio: `TALOS_RESEARCH_TERMINAL` è esattamente `['done','cancelled','failed']`, e i due predicati sono provati **su tutti e dieci** gli stati |
| `pause_requested ≠ paused` | `run.mjs:360-368` | «tiene separati "chiesto di fermarsi" e "fermo", perché in mezzo c'è del denaro» — il passo in volo finisce `done`, la spesa è contata |
| `interrupted ≠ failed` | `run.mjs:425-437` | recovery marca `interrupted`, ed è l'unico stato che `nextStep` ripropone |
| chiave senza il tentativo (`:203-216`) | `run.mjs:196` | stessa chiave dopo un secondo tentativo; diversa per passo e per giro |
| replay IGNORA l'incoerente, mai lancia (`:398-410`) | `run.mjs:262-407` | **test mio**: nove eventi fuori posto su uno stato in cui nessuno ha senso, `assert.doesNotThrow` su tutti, più un `kind` che questa versione non conosce |
| duplicato non conta due volte (`:239-249`) | `run.mjs:314-331` | `spend` uguale con una o due `step_finished`; `run_started` ripetuto non azzera piano e ricevute |
| **⭐ giornale troncato a metà riga** (test in più, mio) | `run.test.mjs` | JSONL con la quinta riga mozzata (processo morto dentro `appendFile`): la riga si **salta**, il replay riesce, lo stato è quello dell'ultimo evento completo, e **la spesa non viene inventata** |
| L1/L2/L3 (`:21-43`) | `verification.mjs:82-96` | `resolved` separa `page`/`snippet`/`missing` su una corsa vera a due fonti |
| `talosResearchLocate` con offset (`:191-203`) | `verification.mjs:207` | `text.slice(from,to)` **restituisce il passaggio**, su un testo con spazi doppi e virgolette curve messi lì apposta |
| giudice ≠ autore (`:209-250`) | `verification.mjs:236` | l'autore rinominato viene comunque riconosciuto **dal modello**, e con lui solo la funzione torna `null` |
| «contesa» ≠ «parziale» (`:45-63`) | `verification.mjs:517` + `contested.test.mjs` | contesa **fuori** da sostenute, parziali e non verificate; su un «no» una contraria **conferma**, non contesta |
| 2/4/6 rami (`:43-47`) | `plan.mjs:52` | crescita provata su tutte e tre le profondità |
| approvazione/modifica (`:101-137`, `:217-268`) | `plan.mjs:115, 231-268` | togliere `b2` e aggiungere dà `b5`, **mai un secondo `b2`** |
| costo detto prima, rifiuto di inventarlo (`:139-216`) | `plan.mjs:220` | `{known:false}` **senza** `amount`, e non uno zero |
| I/O per `deps` (`:61-88`) | `collector.mjs:66` | i sette test usano `search`/`read` finti: **la rete non viene mai toccata** |

### Le lacune del mobile che ho chiuso con test miei (17)

- **`recheck-document.mjs` — 6 test, tutti miei.** È l'unico dei dieci senza un `*.test.ts` nel
  mobile (cercato in `tests/unit/research/`: venti file, quel nome non c'è). I casi vengono dai tre
  impegni che i suoi commenti dichiarano, più il caso limite che il commento sul `filter` nomina:
  la riga bianca prima del recinto, **verificata contando le righe**, perché senza quella prosa e
  blocco si toccano e un lettore Markdown tratta il recinto come testo.
- **`talosResearchJudgeOrder`** (`verification.mjs`) era esportata e **nessun test la nominava**.
  Porta la regola che rende credibile il rapporto — dispositivo primo, casa dell'autore **ultima** —
  e un porto che invertisse l'ordine passava ogni altro test del file.
- **`talosResearchFollowUpPrompt`** (`synthesis.mjs`): stessa situazione. Provato che dichiara «nessuna
  ricerca nuova», che ordina di **scriverlo** invece di rispondere a memoria, e che mantiene la
  stessa forma a tre colonne della sintesi.
- **`localAuthor`** e **`talosResearchSynthesisLoad`** (`plan.mjs`): il commento del sorgente dichiara
  «sei fonti in tutto **a QUALSIASI profondità**» e racconta che il difetto opposto («più profonda
  che rende meno») c'era già stato. Nessun test lo copriva: ora sì, su tutte e tre le profondità.
- **`talosResearchStepIdFor`** (`run.mjs`): provato che il nome è funzione del **solo** ramo+tipo, e
  che `workLeft` riconosce come fatto quel nome e non un altro.

---

## 4. La suite completa — una volta sola, alla fine

```
node --test tests/*.test.mjs tests/research/*.test.mjs
ℹ tests 2598   ℹ pass 2591   ℹ fail 7
```

**I miei: 180 su 180 verdi, zero rossi.**

⛔ **I 7 rossi non sono miei, e lo dico con la prova invece di chiederlo per buono.** Stanno in
`tests/research-orchestrator.test.mjs` e `tests/session-registry.test.mjs`, e vengono dai file che
**altri agenti stanno scrivendo adesso** (`git status`: ` M research-orchestrator.mjs`,
` M research-store.mjs`, ` M session-registry.mjs`, ` M kernel/talosHarness.mjs` — i lotti L1/L2).

La prova che non posso averli causati io è strutturale, non un'opinione:

```
grep -rn "research/" src/*.mjs src/kernel/*.mjs tests/*.test.mjs | grep "from '"
   →  (vuoto)
```

**Nessun file esistente importa `src/research/`**, che è esattamente ciò che L3 prescrive
(«Nessun file esistente cambia fino a L4»). La mia metà è un albero nuovo, appeso a niente.

⛔ Nota misurata, perché è il tipo di numero che inganna: **un primo giro della suite dava 346
rossi**, tutti da un `ReferenceError: leggiRapporto is not defined` in `research-orchestrator.mjs:234`
— l'altro agente era **a metà di una scrittura**. Rilanciata pochi minuti dopo: 7. ⇒ Un conteggio di
rossi raccolto mentre un altro agente scrive **non è una misura**; va ripetuto e attribuito, non
riportato.

---

## 5. L'incrocio con l'altro agente — riuscito, senza toccargli niente

Tre dei miei file nominano moduli della sua metà. Nessuno l'ho scritto io:

| mio file | importa da lui | esisteva? |
|---|---|---|
| `recheck.mjs` | `report.mjs` (tipo `TalosResearchReportRecord`) | sì, a disco |
| `recheck-document.mjs` | — (usa i miei `recheck` e `recheck-history`) | — |
| `contested.test.mjs` | `report.mjs` → **`talosResearchSupportLabel` a runtime** | sì |

`contested.test.mjs` è l'unico punto in cui **codice suo gira dentro un test mio** — ed è come stava
nel mobile, dove `researchContested.test.ts` importa da `researchVerification` **e** da
`researchReport`. Gira: 11 su 11. Non ho aspettato nessun file e non ne ho scritto nessuno dei suoi.

---

## 6. Cosa NON ho verificato — per nome

1. **Nessun giro col modello, nessun 4174, nessuna rete.** Vietato dal brief e rispettato: `collector`
   e `verification` sono provati **solo** con `deps` finte. Che il `search`/`read` veri si comportino
   come i finti **non è provato da niente qui dentro**.
2. **Nessun aggancio.** I dieci file non sono importati da niente fuori dai loro test. Che
   `research-orchestrator.mjs` li sappia usare è **L4**, e non l'ho toccato.
3. **I JSDoc non sono controllati da un compilatore.** `harness-ui/` non ha `tsconfig.json` né uno
   script `typecheck`; i tipi sono contratto leggibile, non un cancello. Un `@typedef` sbagliato qui
   **non fa rosso nessun test**.
4. **La lettura del giornale dal disco.** Il mio test sul troncamento costruisce il JSONL in memoria e
   salta la riga mozzata: prova l'invariante al livello che `run.mjs` possiede (è aritmetica su una
   lista, non legge file). Che `research-store.mjs` salti davvero una riga mozzata leggendo da disco
   **è L4**, e questo test non lo copre — lo dico invece di lasciar credere che la riga del disegno
   sia già chiusa.
5. **I 7 rossi degli altri.** Ho provato che non sono miei; **non li ho diagnosticati e non li ho
   toccati**, perché sono file che un altro agente sta scrivendo in questo momento.
6. **Nessuna prova visiva.** Non c'è UI in questo lotto.
7. **`researchRegistry.ts` e `researchPdf.ts`** restano fuori, come dice §6.2 del disegno. Non erano
   miei e non li ho portati.
