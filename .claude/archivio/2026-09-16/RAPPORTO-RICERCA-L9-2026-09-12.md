# L9 — il motore portato LAVORA dentro la corsa (12/09/2026)

> Lane `lane/harness-desktop`. Nessun 4174, nessun giro col modello, nessuna chiamata di rete
> vera: modello e rete finti, iniettati. Il giro vero lo lancia l'owner.

---

## 1. Cosa c'era — lo stato di fatto, misurato

Dal ledger (`CODA-UNICA-DEBITI-2026-09-06.md`, voce «L8 #2 ✅ CHIUDE») e dai rapporti L3a/L3b/L4/L6/L8:

| cosa | stato prima di oggi |
|---|---|
| `src/research/` | **24 file, ~650 test verdi, QUATTRO chiamanti**: `report.mjs`, `run.mjs`, `verification.mjs` (solo il bilancio), `recheck.mjs` |
| `plan.mjs` | portato e provato, **mai chiamato**. `piano` nella voce: `[]` |
| `collector.mjs` + `fetch-cache` + `page-budget` | portati e provati, **mai chiamati**. `passi: []`, `spesa: 0`, `cache.json` vuoto per costruzione (dichiarato in `research-orchestrator.mjs`: «oggi nessuno riempie questa cache») |
| verifica a tre livelli, contraria, indipendenza, fedeltà | portate e provate, **mai chiamate**. Giro vero del 12/09: ricerca `done`, **38 affermazioni su 38 «non verificate»**, 28 fonti, `judge: null` |
| giornale | **3 eventi** (`run_started`, `run_resumed`, `run_finished`) |
| `fonti/<sha256>.txt` | scritte da nessuno |

⛔ Nessuno di quei 650 test poteva vederlo: provavano i **moduli**, mai il fatto che qualcuno li
chiamasse. È la stessa forma di «IL CANCELLO SEMANTICO ERA SPENTO DA SEMPRE».

---

## 2. Fonti — ricerca web PRIMA di scrivere (obbligo owner)

⛔ `WebSearch` **esaurito** (200/200 per questa sessione, come per L1-L8) ⇒ fonti primarie via
`WebFetch`, tutte lette il **12/09/2026**.

| fonte | citazione verbatim | dove pesa |
|---|---|---|
| Panickssery, Bowman, Feng — «LLM Evaluators Recognize and Favor Their Own Generations», **arXiv:2404.13076**, 15/04/2024 | «LLMs such as GPT-4 and Llama 2 have non-trivial accuracy at distinguishing themselves from other LLMs and humans»; «**a linear correlation between self-recognition capability and the strength of self-preference bias**» | il giudice **non può essere l'autore**; `modelloGiudice` sulla metadata fin dalla nascita; `judge: null` dichiarato quando non c'è nessun altro |
| Gao et al. — «Enabling Large Language Models to Generate Text with Citations», **arXiv:2305.14627** (benchmark ALCE), 24/05/2023, rev. 31/10/2023 | «on the ELI5 dataset, **even the best models lack complete citation support 50% of the time**» | il passaggio dichiarato non è una prova finché non lo si **ritrova** nel testo tenuto ⇒ il testo delle pagine va conservato, e L2 gira anche senza giudice |
| Anthropic — «How we built our multi-agent research system» | «multi-agent systems use about **15× more tokens than chats**»; «saving its plan to Memory to persist the context»; «systems that can **resume from where the agent was**» | il costo si dice **prima**; il piano su disco; la ripresa dal giornale |

**Il vincolo che non conoscevo** (e che nessuna di queste tre pagine è stata letta per cercare):
il costo di una corsa multi-agente non è dominato dalla generazione ma dalla **rilettura del
contesto**. ⇒ si conta la **finestra** (ciò che arriva al modello), non il testo conservato:
conservare di più non costa un token, mostrare di più sì.

---

## 3. L'aggancio — file:riga

### 3.1 Nuovo: `src/research/raccolta-viva.mjs` (il ponte)

`harness-ui/src/research/raccolta-viva.mjs` — `creaRaccoltaViva({cache, registra, tieniFonte,
annotaFonte, piano, tettoFinestra, tettoConservato})`.

⛔ **La porta è UNA SOLA**: espone `around(descrittore, produttore)`, cioè la **stessa firma** di
`fetch-cache.mjs`. Il kernel riceve un `cacheWeb` e non sa cosa ci sia dietro. Un secondo punto di
aggancio nel kernel sarebbe un secondo contratto da tenere allineato.

Per ogni chiamata:
- `step_started` → `cache.around(...)` → `step_finished` con la **spesa** (`searches`/`pages`/`tokens`);
  su un guasto `step_failed` **e rilancia** (`raccolta-viva.mjs:~300`);
- `extract`: il testo si **tiene** (`fonti/<sha256>.txt`, `resultRef` nel giornale), l'indice
  `url → ref` si aggiorna, la **finestra** (testa+coda col marcatore) si calcola e si memorizza;
- `search`: gli **estratti** dei risultati si tengono come fonti `snippet` — senza, un'affermazione
  su una pagina mai aperta darebbe «la fonte citata non esiste fra quelle raccolte», un motivo
  **falso** per un fatto vero.

⛔ **L'attribuzione al ramo è una CONVENZIONE dichiarata, non una misura**: la k-esima ricerca
distinta è il k-esimo ramo del piano; oltre il piano `oltre-N` (mai `b<N>`, così nessuno li scambi
per rami approvati); le letture ereditano il ramo della ricerca che le ha trovate. È onesta perché
la **consegna adesso elenca le linee nell'ordine** — ma resta una convenzione: esatto è il
**conteggio**, approssimata è l'appartenenza.

### 3.2 `src/research-orchestrator.mjs`

| punto | cosa fa |
|---|---|
| import (`:63-100`) | `plan.mjs`, `raccolta-viva.mjs`, `opposing`, `independence`, `fidelity`, `talosResearchVerify`, `talosResearchPickJudge` — il motore entra in scena |
| `creaResearchOrchestrator` (DI) | 7 porte nuove, tutte iniettabili: `scriviPianoFn`, `scriviFonteFn`, `leggiFonteFn`, `scriviIndiceFontiFn`, `leggiIndiceFontiFn`, **`pianificaFn = null`**, **`chiediAlModelloFn = null`**, `modelliGiudiceFn`, `prezzoFn` |
| `montaRaccolta({cartella,id,cache})` | crea la raccolta della corsa; `raccoltaDellaRicerca(id)` è ciò che `session-registry` passa al kernel |
| `costruisciPiano({question,depth})` | `talosResearchPlanFor` (2/4/6 rami) + `pianificaFn` **opzionale** che può cambiare **solo il testo** dei rami (mai il numero né le stime: un modello che si stima il costo da solo dichiara ciò che gli conviene) |
| `costoDetto(piano)` | lavoro sempre; **denaro solo con un prezzo pubblicato** (`talosResearchPlanCost`) |
| `avvia()` | sceglie il **giudice** (`talosResearchPickJudge`, «chiunque tranne l'autore») e lo scrive sulla metadata; poi `run_started` → piano → `plan_proposed` → `piano.json` → `plan_approved {auto:true}` → consegna **col piano dentro** → `avviaESegui` |
| `componiRapporto({cartella,id,…})` | **NUOVO**: compone col compositore puro, riempie `source.text` dal testo tenuto, poi `talosResearchVerify` (L1/L2/L3 + contraria) → `independence` → `fidelity` → riscrive il documento con `talosResearchReportDocument`. Passo `verifica:verify` nel giornale, con la sua spesa |
| `ripristinaCacheFetch()` | rilegge `piano.json` e `indice-fonti.json` e **rimonta la raccolta**: senza, la cura varrebbe solo finché il server non si riavvia |
| `voceEsposta()` | 16° campo: **`modelloGiudice`** |
| `leggi()` | campo nuovo **`costoAtteso`** (lo stimato accanto allo speso); `piano`/`passi`/`spesa`/`bilancio`/`giudice` c'erano già e **adesso non sono più vuoti** |
| `consegnaDiRipresa()` | «source **text**(s)» invece di «source page(s)» — in `fonti/` finiscono anche gli estratti |

### 3.3 `src/kernel/talosHarness.mjs` — minimo e dichiarato (117 righe, di cui ~90 di commento)

1. **due parametri opzionali** accanto a `ricercaWeb`: `cacheWeb`, `onPaginaLetta`;
2. `cacheWeb` **inoltrato al planner** (§7-B del rapporto L6 lo segnala come «da non dimenticare»);
3. ramo `naviga` (`:7001`): passa da `cacheWeb.around` e mostra `onPaginaLetta(...)` quando c'è;
4. ramo `web_search` (`:7012`): passa da `cacheWeb.around` (§7-C applicato alla lettera);
5. `research_deposit`: `await componiRapportoRicercaFn({ id: ricercaId, … })` in un `try/catch`,
   più la riga di esito che dice al modello **chi ha giudicato e con che bilancio**.

⛔ **Deviazione dichiarata dal diff §7-B di L6**: quel diff importava `talosResearchPageBudget`
**dentro il kernel**. Non l'ho fatto — il kernel dichiara trenta righe sopra `research_deposit`
che «nessun file di `src/research/` entra in questo kernel, che è condiviso col mobile». Il budget
si calcola dove vive e al kernel arriva già il testo da mostrare (`onPaginaLetta`). Stesso effetto,
un import in meno, confine intatto.

⛔ **`fromCache` NON entra mai nell'`esito`**: byte identici fra una pagina riaperta e una servita
dalla cache, o il prefisso esatto su cui si regge la cache del prompt del fornitore si azzera.

### 3.4 `src/research-store.mjs`, `src/agent-service.mjs`, `src/session-registry.mjs`

- **store**: `NOME_INDICE_FONTI` + `scriviIndiceFonti`/`leggiIndiceFonti` (mappa `url → ref`,
  riscritta atomica, `page` batte `snippet`); campo `modelloGiudice` in `creaRicerca`.
  ⛔ Perché un file in più: `fonti/` è indirizzata dal **contenuto**, e un'impronta non dice da
  quale indirizzo quel testo venga — la verifica ha esattamente quella domanda.
- **agent-service**: pass-through di `cacheWeb`/`onPaginaLetta` (zero logica, come tutto lì) +
  `chiediAlModelloUnaVolta({modello,chiave,prompt})`, costruita su `chiamaConRitenta` (la **stessa**
  del kernel: stesso backoff, stesso rispetto dello stop). `attrezzi: []` non è un dettaglio — un
  giudice che potesse cercare conferme farebbe l'opposto del suo mestiere.
- **session-registry**: aggancia le 7 porte; `componiRapportoRicercaFn` diventa
  `researchOrchestrator.componiRapporto({...arg, cartella: voce.cartella})`; `cacheWeb`/
  `onPaginaLetta` = `raccoltaDellaRicerca(sessionId)` — **`undefined` per ogni sessione che non è
  una ricerca**.

---

## 4. Il contratto (additivo)

`voceEsposta` passa da 15 a **16 campi**: nuovo `modelloGiudice`. `leggi()` guadagna
**`costoAtteso`**. Nessuno dei 15 cambia nome, tipo o significato.

⛔ **Perché `modelloGiudice` e non basta `giudice`**: sono due fatti diversi. `giudice` (nel record
del rapporto) è **chi ha giudicato davvero**; `modelloGiudice` è **chi era stato scelto** alla
partenza. Quando divergono — un giudice designato che non ha mai risposto — è il caso che la sezione
deve poter mostrare, e senza questo campo sarebbe indistinguibile da «non c'era nessun altro
modello». Test `CONTRATTO §6.4` aggiornato col perché
(`tests/research-orchestrator.test.mjs`, e `tests/http-routes-research.test.mjs` per la rotta).

---

## 5. Le prove — tutte con modello e rete finti

`node --test tests/*.test.mjs tests/research/*.test.mjs` → **2888 test, 2888 verdi, 0 rossi**
(28,5 s). Due file nuovi, 27 test:

**`tests/research/raccolta-viva.test.mjs` (11)** — passo+ramo+spesa di una ricerca; secondo ramo e
`oltre-1`; stessa ricerca due volte (cache, stesso passo, seconda non pagata); pagina tenuta +
finestra + `resultRef` + indice; stessa pagina due volte; estratti come `snippet` e **verso
contrario** (una prova più debole non sostituisce una più forte); lettura fallita → `step_failed` **e
rilancia**; fonte non scrivibile → la corsa continua e `resultRef: null`; pagina vuota → nessuna
fonte e `paginaLetta` risponde `null`; i due tetti.

**`tests/ricerca-motore-nella-corsa.test.mjs` (16)** — piano **2/4/6** per profondità; piano nel
giornale (`plan_proposed` → `plan_approved {auto:true}`) e su disco; **costo detto prima** (lavoro
sempre, denaro solo col prezzo); la consegna porta le linee numerate; **passi nel giornale e spesa
contata**; cache che prende su una URL ripetuta; **verifica vera con giudice ≠ autore**; **verso
contrario: nessun altro modello ⇒ `judge:null` dichiarato**; **verso contrario: passaggio assente ⇒
mai «sostenuta», e il giudice non viene nemmeno pagato**; **contraria trovata ⇒ `contested`**;
**ripresa dopo riavvio** dal passo giusto con le linee aperte; `web_search` via cache con **byte
identici**; `naviga` con finestra testa+coda; **garanzia TALOS-BANCO**; guasto della verifica che non
porta via il rapporto; **catena intera** `research_deposit` → server verifica → record sul disco coi
verdetti veri.

⛔ **TALOS-BANCO**: due giri identici senza `cacheWeb` pagano **due** ricerche, l'uscita è
**byte per byte** la stringa che il banco misura da mesi, e **nessuna cartella `.harness-ui-research`
nasce**. La lista degli attrezzi era già pinnata da
`tests/ricerca-permesso-e-consegna.test.mjs` («REGRESSIONE, IL VERSO FORTE»), verde.

---

## 6. ⛔⛔⛔ Il difetto trovato per strada — vale più del lotto che lo ha prodotto

**Il budget da 15.000 caratteri di L6 non passava dalla porta.**

`TALOS_RESEARCH_PAGE_BUDGET = 15_000` è misurato su **430 pagine vere** (rapporto L6). Ma il
risultato di un attrezzo, nel kernel, viene tagliato a **8.000 caratteri** prima di entrare nel
messaggio `role:'tool'` (`talosHarness.mjs`: `String(esito).slice(0, 8_000)`, salvo `contextHooks`
attivi). ⇒ una finestra da 15.191 caratteri arrivava al modello **senza marcatore e senza coda**:
esattamente le due cose per cui il budget esiste, tolte in silenzio da un tetto scritto in un altro
file, in un altro lotto.

⇒ Cura: `TALOS_RESEARCH_FINESTRA_SOTTO_IL_KERNEL = 7_500`, e il numero è **aritmetica**:
7.500 mostrati + ~190 di marcatore (che porta il percorso `fonti/<64 hex>.txt`) + ~60 della riga di
testa di `naviga` ≈ 7.750 su 8.000. ⛔ La **prima** versione della costante era 7.800 e continuava
a perdere la coda perché confrontavo il tetto con `cap` invece che col **totale** — lo stesso
errore una seconda volta, in miniatura, e l'ha trovato di nuovo **il test, non il ragionamento**.
Resta comunque **quasi il doppio** dei 4.000 di oggi, e porta la coda.

⛔ Non si alza il tetto del kernel: quel `slice` vale per **ogni** attrezzo di **ogni** harness,
banco compreso.

Guardia permanente: `tests/research/raccolta-viva.test.mjs`, test «IL TETTO CHE VINCE È QUELLO DEL
KERNEL».

---

## 7. Cosa NON ho verificato — per nome

1. **Il giro vero.** Nessuna chiamata al 4174, nessun modello, nessuna rete: il brief lo vieta e la
   verifica dal vivo la lancia l'owner. Tutto ciò che c'è qui è provato con deps iniettate.
2. **Il giudice vero.** `chiediAlModelloUnaVolta` non è mai stata eseguita contro OpenRouter. La
   forma della risposta che `talosResearchParseVerdict` legge è provata dai test del modulo (portati
   dal mobile, misurati sul Pad il 20/08), non da una risposta vera di `glm-5.3-flash`.
3. **La qualità del piano scritto nella consegna.** Che la figlia **segua** le linee nell'ordine è
   un'ipotesi: la consegna glielo chiede, nessuno l'ha misurato. Se non le segue, l'attribuzione
   dei passi al ramo peggiora (il **conteggio** resta esatto).
4. **`modelliGiudiceFn` di default è povero**: conosce solo il modello predefinito del server. Se la
   ricerca gira su quello, `talosResearchPickJudge` risponde `null` e **non ci sarà giudice**
   (dichiarato, mai aggirato). Scegliere un modello giudice dalle Impostazioni è un lotto di UI.
5. **L'approvazione del piano è automatica** (`plan_approved {auto:true}`). Il pulsante con cui una
   persona toglie/aggiunge/riformula un ramo prima che parta **non esiste**: è un lotto UI a parte,
   e l'evento separato lascia il posto già pronto.
6. **`talosResearchProgressOf` adesso può dire «10 di 4»**: il suo totale viene dal solo piano, e i
   passi `read`/`verify` non ci sono dentro. Oggi non lo chiama nessuno sul desktop (solo
   `card.mjs`, a sua volta senza chiamanti): **debito dichiarato**, non toccato.
7. **`synthesis.mjs` resta senza chiamanti** e il diff §7-A di L6 non è stato applicato: sul desktop
   la prosa la scrive la figlia, non il sintetizzatore portato.
8. **`elencaFonti` conta testi tenuti, non pagine aperte** (da oggi ci sono dentro anche gli
   estratti). L'unico posto che lo leggeva diceva «source page(s)» e adesso dice «source text(s)».
9. **Trovato e NON corretto** (fuori dal perimetro L9, si registra e si lascia a un sì separato):
   `src/kernel/talosHarness.test.mjs` ha **3 rossi preesistenti**, verificati **non** miei
   (`uscitaUtile` è byte-identico a HEAD, il file di test non è stato toccato):
   - «un uscita lunga tiene testa E coda» attende `/caratteri tolti nel mezzo/` mentre il kernel
     scrive «tolti N caratteri **dal** mezzo» dal 10/09: **test rimasto indietro a una cura**;
   - due test di `ambienteSenzaCredenziali` confrontano il **numero di chiavi** di `process.env`:
     misurano l'ambiente, non l'oggetto (lezione del 10/09). Rossi su questa macchina.
   E `npm run kernel:controlla` dichiara le due copie divergenti (repo 8.641 righe vs mobile 6.260):
   **preesistente**, non toccato da qui.
10. ⛔⛔ **Un altro agente sta scrivendo nella STESSA cartella di lavoro adesso**: durante questo
    lotto sono comparsi modificati `harness-ui/frontend/src/components/avvio-sessione.js`,
    `frontend/tests/unit/avvio-sessione.test.mjs`, `tests/http-routes-sessions.test.mjs`,
    `tests/session-registry.test.mjs`, e **dentro `src/session-registry.mjs` ci sono anche le sue
    righe** (blocco «BC-14», il cancello `cartellaLibera`/Full access). **Non sono mie.** Prima di
    qualunque `git add`/`commit` va deciso chi committa cosa — è la lezione «DUE SESSIONI, STESSA
    CARTELLA, intrecciano i commit».

---

## 8. Quanto costerà in più per corsa — ⚠️ STIMA DICHIARATA COME STIMA

⛔ **Aritmetica, non una misura.** La baseline è il giro vero del 12/09 (ricerca `3029dea2`:
18 giri, **265.670 token di ingresso**, `cached_tokens: 0`, 38 affermazioni, 28 fonti).

| voce | effetto per corsa | come si ottiene |
|---|---|---|
| piano | **0 token** | deterministico (`plan.mjs`), nessuna chiamata |
| giornale, `fonti/`, indice | **0 token** | solo disco |
| consegna col piano | **+~150 token, una volta** | 4-6 righe nella consegna iniziale |
| **verifica** | **+~40.000-80.000 token** | ~38 chiamate al giudice (prompt ≈ 400-900 token, uscita ≈ 30) + fino a ~38 per la contraria (solo dopo un «sì»/«in parte») |
| finestra `naviga` 4.000 → 7.500 | **+~12.000 token** | ~14 `naviga` × ~875 token in più |
| cache della corsa | **risparmio IGNOTO** | le ricerche/pagine ripetute della corsa del 12/09 non sono state contate: `cached_tokens: 0` dice che il fornitore non cacheggiava, non quante URL fossero doppie |

⇒ **Stima netta: da +15% a +35% di token per corsa**, dominata dalla verifica, con un risparmio
dalla cache **non misurato** e quindi non scontato. ⛔ Non è un numero misurato: è la somma di
conteggi su una corsa passata, e va confermata sul primo giro vero. Il contesto lo dà Anthropic:
una corsa multi-agente costa già «about 15× more tokens than chats» — questo lotto aggiunge il
**controllo**, che è la cosa che nessun concorrente ispezionato ha, e non è gratis.

---

## 9. Riepilogo

**Cosa devi fare tu**
- Dire sì/no/dopo al **giro vero sul 4174** (è l'unica cosa che manca per chiudere: ogni riga qui è
  provata con modello e rete finti).
- Decidere **chi committa `src/session-registry.mjs`**: dentro ci sono anche le righe di un altro
  agente che lavora nella stessa cartella adesso (§7.10).
- Dire sì/no al **pulsante di approvazione del piano** (oggi `auto:true`, dichiarato) e alla
  **scelta del modello giudice dalle Impostazioni** (senza, una ricerca sul modello predefinito non
  avrà mai un giudice): sono due lotti UI, non di motore.

**Cosa faccio io**
- Niente in automatico: il lotto è chiuso e verde (2888/2888). Se dai il via al giro vero, lo
  preparo e leggo il giornale, il `piano.json`, le `fonti/` e il bilancio del record.

**Cosa rimane**
- I nove punti non verificati di §7, per nome — in particolare i **3 rossi preesistenti** del test
  del kernel e la divergenza di `kernel:controlla`, che **non ho toccato** perché non sono L9.
- La stima di costo di §8 resta una **stima**: si conferma solo sul primo giro vero.
