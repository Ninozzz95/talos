# L3a — il porto di nove moduli del motore di ricerca, dal mobile al kernel Node (11/09/2026)

Lotto L3, metà «a» (disegno `.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md`, §3.1 · §3.2 · §6.2 · §7).
Via scelta dall'owner per L0: **(a) traduzione a mano con tipi in JSDoc**, nessuna dipendenza nuova.

Cartelle nuove: `harness-ui/src/research/` e `harness-ui/tests/research/`.
⛔ `AVM/mobile/` **solo letto**: nessun file del mobile è stato toccato (`git status` del mobile non lo nomina).

---

## 1. La tabella — file per file

| mobile (`src/lib/research/`) | righe TS | desktop (`src/research/`) | righe mjs | casi nel test del mobile | casi tradotti | verdi |
|---|---:|---|---:|---:|---:|:--:|
| `researchOutline.ts` | 85 | `outline.mjs` | 111 | 9 | 9 | ✅ 9/9 |
| `researchCard.ts` | 211 | `card.mjs` | 235 | 12 | 12 | ✅ 12/12 |
| `researchIndependence.ts` | 147 | `independence.mjs` | 159 | 11 | 11 | ✅ 11/11 |
| `researchCitationExport.ts` | 118 | `citations.mjs` | 142 | 11 | 11 | ✅ 11/11 |
| `researchLedger.ts` | 162 | `ledger.mjs` | 166 | 10 | 10 | ✅ 10/10 |
| `researchReport.ts` | 175 | `report.mjs` | 203 | 8 | 8 | ✅ 8/8 |
| `researchFidelity.ts` | 115 | `fidelity.mjs` | 122 | 7 | 7 | ✅ 7/7 |
| `researchDossier.ts` | 94 | `dossier.mjs` | 114 | 4 | 4 | ✅ 4/4 |
| `researchNarration.ts` | 150 | `narration.mjs` | 181 | 23 | 23 | ✅ 23/23 |
| **totale** | **1.257** | | **1.433** | **95** | **95** | **✅ 95/95** |

**Nessun test scritto da me al posto di uno del mobile**: tutti e nove i file avevano i loro
(`mobile/tests/unit/research/*.test.ts`), e il conteggio dei casi combacia file per file — 95 contro
95, zero persi e zero inventati. `vitest` → `node:test` + `node:assert/strict`;
`toBeCloseTo(x, 5)` è diventato un confronto con tolleranza `1e-5`, che è la stessa cosa detta a mano.

Le righe `.mjs` sono più delle `.ts` per una ragione sola: i tipi TypeScript in linea diventano
blocchi `@typedef` JSDoc, che occupano più righe e non cambiano una virgola del comportamento.

---

## 2. Scostamenti dal mobile: **ZERO**, e provati due volte invece che dichiarati

### 2.1 I miei test passano anche contro il TypeScript **del mobile**

I 95 test tradotti sono stati rilanciati contro i `.ts` originali del mobile, eseguiti da Node col
type-stripping nativo (v24.18.0), con le loro dipendenze puntate ai miei moduli portati:
**95/95 verdi anche lì**. Cioè: nessuna delle attese distingue il porto dall'originale.

⛔ **E il differenziale morde** — provato al contrario, guastando un carattere alla volta nel TS del
mobile, un modulo per volta: `independence` (il taglio del dominio), `outline` (il divisore dei
secondi), `card` (il nome di un secchio), `ledger` (i tentativi), `fidelity` (la copertura),
`dossier` (il recinto), `narration` (una chiave i18n), `citations` (il tipo RIS). **8 guasti su 8
hanno fatto protestare esattamente il file giusto.** Senza questa prova il differenziale sarebbe stato
un cancello inerte che passa come uno vero.

Script e copie in
`…/scratchpad/confronto/` (`prepara-differenziale.sh`, `dif-*.test.mjs`, `mobile-*.mts`).

### 2.2 `report.mjs` — il record recintato, **byte per byte**

È il pezzo che il cancello di consegna userà (§6.5), quindi «uguale» doveva voler dire uguale davvero.
Lo stesso ingresso è passato per `researchReport.ts` del mobile e per `report.mjs`, su **5 casi**
(pieno con un verdetto negativo · senza giudice · passaggio mai trovato nella fonte · contesa con una
fonte citata ma mai raccolta · zero affermazioni e zero fonti): **documento identico carattere per
carattere in tutti e cinque**, e la rilettura di ciascuno recupera lo stesso record dall'altro. I tre
rifiuti (`null` invece di un recupero parziale) rifiutano in entrambi.

⛔ Anche questo provato al contrario: cambiata **una parola** nella copia del TS
(«rapporto» → «resoconto») il confronto è diventato rosso al primo caso.

Script: `…/scratchpad/confronto/confronta.mjs`.

---

## 3. Le dipendenze sull'altra metà di L3

Quattro dei miei file importano moduli che porta la sessione parallela, col nome concordato in §6.2:

| mio file | importa da loro | a runtime? |
|---|---|:--:|
| `outline.mjs` | `run.mjs` (`talosResearchIsTerminal`, `talosResearchStepIdFor`) | sì |
| `card.mjs` | `run.mjs` (`…IsResting`, `…IsTerminal`, `…ProgressOf`) | sì |
| `narration.mjs` | `run.mjs` (`…IsResting`, `…IsTerminal`, `…WorkLeft`) + `card.mjs` (mio) | sì |
| `report.mjs` | `verification.mjs` (`talosResearchVerifiedStanding`) | sì |
| `ledger.mjs` | — (ma dipende da `outline.mjs`, quindi da `run.mjs` a catena) | indiretto |
| `fidelity.mjs`, `dossier.mjs` | `verification.mjs` / `collector.mjs` **solo tipi** | no (JSDoc si cancella) |

I test di questi file passano da `tests/research/_dipendenza-in-corso.mjs`, che **salta con motivo
dichiarato** se manca un file dell'altra metà — e **rilancia** se a mancare è un file mio, così un mio
refuso resta rosso. (Stessa forma della lezione del 10/09 «il catch GIUSTO nasconde il bug SBAGLIATO».)

**Al momento della corsa finale l'altra metà era già sul disco** (`run.mjs`, `verification.mjs`,
`collector.mjs`, `plan.mjs`, `opposing.mjs`, `open-cards.mjs`, `recheck*.mjs`): **0 test saltati**.
La rete di sicurezza resta per chi rilancerà la suite in un momento diverso.

**Non portati, come da brief:** `researchRegistry.ts` (Vue) e `researchPdf.ts`.
**Non toccati:** `plan`, `verification`, `opposing`, `openCards`, `recheck*`, `run`, `collector`,
`synthesis` — sono dell'altra sessione.

⛔ **Una sovrapposizione da segnalare:** i due casi sull'ordine dei giudici
(`talosResearchJudgeOrder`) nel mobile stanno **dentro `researchReport.test.ts` e in nessun altro
posto** (verificato: `researchVerification.test.ts` non lo nomina mai). Li ho quindi tradotti qui
(RAPPORTO-07/08) per non perderli. L'altra sessione ne ha scritti due suoi in
`verification.test.mjs`, marcati «⭐ MIO»: **si sovrappongono, non si contraddicono** — decide chi
consolida se tenerne una copia sola.

---

## 4. La ricerca web fatta PRIMA di scrivere

- **TypeScript — JSDoc Reference / Type Checking JavaScript Files**
  (<https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html>, letta l'11/09/2026).
  Confermato: `@typedef` · `@param` · `@returns` · `@type` · `@template` · `@callback` tipizzano JS
  puro; **`@import {X} from './y'`** (TS 5.5+) porta un tipo in scope **senza** creare un import a
  runtime — che è precisamente ciò che serve per i tipi che vengono dai file dell'altra metà;
  il controllo si accende con `// @ts-check` per file o con `checkJs: true` in
  `jsconfig.json`/`tsconfig.json`.
- **Il repo ha già qualcosa che valida il JSDoc? NO.** `harness-ui/` non ha né `jsconfig.json` né
  `tsconfig.json` (cercati in tutto il repo: ce l'hanno `mobile/`, `control-plane/`, `validator/`,
  `browser-worker/`, `artifact-worker/` — non `harness-ui/`). `typescript@5.9.2` è in
  `devDependencies` ma **nessuno script di `package.json` lo invoca**, e in `src/` esiste **un solo**
  file con `@typedef` (`src/kernel/talosHarness.mjs`), **zero** con `// @ts-check`.
  ⇒ Ho usato JSDoc come **documentazione dei tipi**, con `@import` dove serve, e **non** ho acceso
  `// @ts-check` né aggiunto un `jsconfig.json`: sarebbe una decisione sul posture del progetto, non
  una riga di L3. **Proposta, non fatta:** un `jsconfig.json` con `checkJs` limitato a
  `src/research/` darebbe al porto la rete che il TypeScript del mobile aveva — da decidere l'owner.

---

## 5. La suite

- **I miei nove file, da soli:** `95 tests · 95 pass · 0 fail · 0 skipped`.
- **Tutto `tests/research/` (i miei nove + i nove dell'altra sessione):**
  `275 tests · 275 pass · 0 fail · 0 skipped`.
- **`node --test tests/*.test.mjs tests/research/*.test.mjs`**, come chiesto, una volta:
  **`2579 tests · 2573 pass · 6 fail`**.

⛔ **I 6 rossi non sono miei, e il numero non è attribuibile: la suite non è ermetica adesso.**
Tutti e sei venivano da `ReferenceError: estraiTestoRapporto is not defined` dentro
`src/research-orchestrator.mjs:190` — un file che **non ho mai toccato**, che `git status` segna
`M` e che un'altra sessione (lotto L2, «cancello di consegna») sta riscrivendo in questo momento:
il commento alla riga 108 dice «Si chiamava `estraiTestoRapporto`», cioè la rinomina era a metà.

La prova che è in movimento, e non un difetto fisso: **rilanciando gli stessi due file pochi minuti
dopo, i rossi sono passati da 6 a 298**, e una terza corsa dell'intera suite (esclusi quei due file)
ne ha dati **48**, su file **diversi** (`bc03-delega-visibile`, `comando-nella-conversazione`,
`delega-parallelo-sequenza-cartella`, `context-engine-*`, `documento-non-finisce-nella-radice`) —
tutti dipendenti da `src/session-registry.mjs` e `src/kernel/talosHarness.mjs`, anch'essi `M` per
mano di altre sessioni. `tests/bc03-delega-visibile.test.mjs` **da solo è 6/6 verde**.
⇒ È esattamente la lezione del 02/09 «il CONTEGGIO di una suite non ermetica non è una prova»:
il totale va rimisurato quando L1 e L2 hanno finito di scrivere.

**In nessuna delle tre corse un rosso è caduto dentro `tests/research/`.**

---

## 6. Cosa NON ho verificato

1. **Nessun rapporto del mobile VERO come fixture.** Cercato su disco (`AVM/`,
   `AVM-harness-desktop/harness-ui/.harness-ui-*`, `.sessions-store`): l'unico posto dove compare
   la stringa ` ```talos-research-report ` fuori dal codice è un documento di disegno
   (`AVM/.claude/consegne/ricerca-approfondita-mobile-2026-09-11/disegno-implementativo.md`), che la
   **cita** e non ne contiene uno. ⇒ L'equivalenza del record è provata contro il **TypeScript del
   mobile eseguito**, che è una garanzia più forte di un file d'esempio, ma **non contro un rapporto
   uscito davvero da un telefono**.
2. **Una lacuna vera, ereditata dal mobile:** nessun test guarda l'intestazione
   `## Non raggiungibili` del dossier — misurato, non supposto: guastandola, tutti i test restano
   verdi, e `researchDossier.test.ts` non la nomina mai. È un buco del test **originale**; non l'ho
   colmato perché il porto è meccanico e una prova in più sarebbe uno scostamento. Va registrato.
3. **Niente aggancio.** Nessun file esistente è stato modificato: `src/research/` è codice nuovo che
   **nessuno chiama ancora**. L'aggancio è L4/L5, e questi moduli non sono mai stati eseguiti dentro
   un giro vero.
4. **Nessun giro col modello, nessun 4174, nessun git** — come da brief.
5. **Il JSDoc non è controllato da nessuno** (vedi §4): i tipi sono documentazione, non un cancello.
   Se un `@param` dice una bugia, oggi non se ne accorge niente.
6. **Nessuna verifica visiva**: qui non c'è UI.
