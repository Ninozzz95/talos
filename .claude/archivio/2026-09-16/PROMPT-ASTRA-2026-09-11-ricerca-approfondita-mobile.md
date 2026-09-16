# Piano implementativo — Ricerca approfondita, lato MOBILE (11/09/2026)

> Per l'agente della lane mobile (Sonnet 5 Max). Scritto dalla lane desktop dopo il disegno
> comparato `.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md` (918 righe, letto nel codice di
> mobile, desktop e sette concorrenti). **L'owner ha approvato tutto.** Questo file dice che cosa
> il mobile deve aggiungere e rendere più robusto, e quali sono i punti di contratto che il desktop
> sta per **portare tali e quali** dal mobile — quindi non vanno cambiati senza dirlo.
>
> Regole che valgono anche qui: ricerca web PRIMA di scrivere codice (fonte + data nel commit);
> skill `frontend-design` per ogni superficie; foto in **quattro viewport, tablet portrait per
> primo**, tema chiaro E scuro; ogni cancello provato **anche al verso contrario**; niente nomi
> tecnici a schermo; mai ore stimate; il local-first è la premessa (niente che richieda un server).

## 0. Dove sta il mobile oggi, misurato

Tabella a 22 capacità (disegno §4.2): **mobile 19/22**, desktop 1/22, Hermes 3/22, Claude Code
~4 (sorgente non distribuito), Codex/DeepSeek/OpenHands/goose/opencode/cline: 0-1.

Le **tre caselle vuote o a metà** del mobile sono l'oggetto di questo piano:

| # | capacità | mobile oggi | chi ce l'ha |
|---|---|---|---|
| C20 | lo stato dichiarato («Conclusa») è **controllato contro l'artefatto** | ◑ | nessuno — nemmeno noi |
| C21 | **cache dei risultati web** fra rami paralleli della stessa ricerca | ❌ | **Hermes** |
| C22 | **budget deterministico per pagina**, col resto tenuto su disco e indicato al modello | ◑ (solo tetto fonti, `researchPlan.ts:99`) | **Hermes** |

Tutto il resto (piano approvabile, verifica a tre livelli, giudice ≠ autore, contraria cercata
apposta, indipendenza a gruppi, ri-verifica nel tempo, giornale rigiocabile, BibTeX/RIS/PDF) il
mobile **ce l'ha già** e nessun concorrente ispezionato lo ha: non si tocca se non per i punti
del §3.

## 1. Il contratto che il desktop porta dal mobile — NON cambiare senza avvisare

Il desktop porterà in `harness-ui/src/research/` **20 file su 21** di
`mobile/src/lib/research/` (tutti tranne `researchRegistry.ts`, che dipende da Vue), tradotti a
mano in `.mjs` con JSDoc, **coi loro test**. Perché le due lane restino allineate, questi sono i
punti di contratto — ogni modifica deve essere **additiva**, testata e comunicata con l'elenco dei
file toccati:

1. **Gli 11 eventi del giornale** e la macchina a stati — `researchRun.ts:58-68` (dieci stati),
   `:158-201` (eventi), `:250-397` (`talosResearchApply`), `:398-410` (`talosResearchReplay`).
   `pause_requested ≠ paused`, `interrupted ≠ failed` restano.
2. **Il record recintato del rapporto** ` ```talos-research-report ` — `researchReport.ts:79-152`
   (scrittura) e `:154-175` (rilettura che torna `null` invece di un recupero parziale). Il desktop
   lo userà come **cancello di consegna** (§2.1): se cambia forma, cambia in entrambi.
3. **Le regole di indipendenza** — `researchIndependence.ts:1-30`, `:64-146`.
4. **La chiave di idempotenza senza numero di tentativo** — `researchRun.ts:203-216`: è la base
   della cache di §2.2.
5. **Gli otto attrezzi** e la loro semantica — `tools/researchTools.ts:104-429`
   (`research_list · start · read · rename · pause · resume · cancel · delete`; `start` torna
   subito, `:39-47`).
6. **I sei secchi della scheda** — `researchCard.ts:23-96` — si **estendono** coi tre stati nuovi
   di §2.1, non si rinominano.

## 2. I tre lotti — file, cosa, prova

### MB-1 · C20 — «Conclusa» solo con un artefatto che si rilegge

**Perché**: sul desktop la ricerca di stasera è «done» con un rapporto di **290 byte** che è la
scusa del modello («La sessione è in sola lettura, quindi non posso creare documenti…»). Il mobile
è ◑: `researchReport.ts:154-175` sa già dire `null`, ma **nessuno lega quel `null` allo stato**.

- **File**: `researchRun.ts` (transizione a `done`), `researchCard.ts:23-96` (secchi),
  `researchReport.ts` (nessun cambio di forma), `screens/ResearchScreen.vue` e
  `ResearchReportScreen.vue` (i tre stati nuovi a schermo, con parole umane).
- **Cosa**: `done` si concede solo se il record recintato si rilegge **e** ha ≥ 1 affermazione e
  ≥ 1 fonte. Altrimenti tre stati nuovi, con nome proprio:
  `senza-rapporto` (esiste ma non si rilegge / vuoto) · `bloccata-dal-permesso` (fra i risultati
  degli attrezzi c'è un rifiuto di permesso e nessun rapporto) · `giri-esauriti`.
  ⛔ Le ricerche già su disco con `done` e un rapporto illeggibile si mostrano `senza-rapporto`
  **calcolato al volo, senza riscrivere il file**: ciò che è costato denaro non si sovrascrive.
- **Prova al contrario, obbligatoria**: la scusa di stasera, verbatim, come fixture → deve dare
  `bloccata-dal-permesso`, mai `done`:
  > La sessione è in sola lettura, quindi non posso creare documenti direttamente. Tuttavia, posso
  > darti il contenuto completo in un formato pronto per essere salvato, o posso provare a
  > scriverlo in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown
  > nel workspace?
  E il verso opposto: un rapporto vero con record valido → `done`.
- **A schermo**: la scheda guida col **bilancio** (M20), e per i tre stati nuovi dice **cosa fare**
  («Riprendi con i permessi giusti», «Riprendi: i giri sono finiti»), non solo cosa è successo.

### MB-2 · C21 — cache dei risultati web dentro la corsa

**Perché**: le linee parallele del piano (2/4/6 rami, `researchPlan.ts:43-47`) cercano spesso le
stesse cose; ogni ricerca è denaro (M5). Hermes: `website/docs/user-guide/features/web-search.md:65-70`
(cache pensata proprio per il ventaglio di sotto-agenti). Baseline desktop su una corsa `deep`:
**484.171 token in ingresso, `cached_tokens: 0`**. Il mobile ha la sua baseline: **misurarla prima**.

- **File**: `researchCollector.ts` (l'I/O entra per `deps`, `:61-88` — la cache si mette **lì**,
  come dipendenza iniettata, così i test la controllano), `researchRun.ts` (nessun evento nuovo:
  un colpo di cache è un passo che **non paga**, e lo dice nel registro M18).
- **Cosa**: chiave = URL normalizzato (schema, host in minuscolo, senza frammento, query ordinata)
  + tipo (`search` con la query normalizzata / `extract`); vale **per corsa** e sopravvive alla
  pausa (sta nel giornale o accanto, mai solo in memoria: il telefono uccide i processi). Il
  registro «come è stato costruito» (M18) conta le pagine **servite dalla cache** separate da quelle
  aperte davvero: il numero di «pagine aperte» resta onesto.
- **Misura di chiusura**: la stessa domanda, profondità `deep`, **prima e dopo**: token totali,
  chiamate di rete, secondi. Tre ripetizioni, mediana. Se la cache non taglia almeno le chiamate
  di rete duplicate misurate (contale prima: quante URL uguali fra rami), il lotto non chiude.

### MB-3 · C22 — budget deterministico per pagina, il resto tenuto e indicato

**Perché**: oggi il tetto è sulle **fonti** (`researchPlan.ts:99`), non sui **caratteri per
pagina**: una pagina enorme entra intera nel contesto o viene tagliata senza dire dove. Hermes:
`web_extract` con **15.000 caratteri** per pagina, **testa 75 % / coda 25 %**, il resto **scritto
su disco** col percorso e la chiamata esatta per sfogliarlo (`web-search.md:47-57`, tetto 2 MB).
Il mobile tiene già il testo per la ri-verifica (M16: «teniamo il testo, non l'URL»): manca solo
che il modello sappia **dove** e come chiedere il resto.

- **File**: `researchCollector.ts` (il taglio), `researchVerification.ts:191-203`
  (`talosResearchLocate`: l'offset del passaggio deve puntare al **testo tenuto intero**, non alla
  finestra mostrata — altrimenti la ri-verifica M16 cerca nel posto sbagliato), il prompt del
  collettore (dice al modello: «hai visto 15.000 caratteri su N; il resto è in <riferimento>»).
- **Cosa**: budget dichiarato in un posto solo (costante con il perché), testa+coda, il testo
  intero tenuto **con la stessa chiave di §2.2**; il piano (M8) mostra il budget per pagina fra le
  cose «dette prima». ⛔ La ri-verifica nel tempo confronta il testo **intero** tenuto, non la
  finestra.
- **Prova al contrario**: una pagina sotto il budget entra intera e non porta nessun riferimento;
  una sopra porta testa, coda e riferimento, e `talosResearchLocate` trova un passaggio che sta
  **nel mezzo tagliato**.
- **Misura di chiusura**: token per pagina prima/dopo sulla stessa corsa di MB-2, e nessun calo
  del bilancio delle affermazioni (copertura e fedeltà, M13) oltre l'intervallo delle tre
  ripetizioni.

## 3. Robustezza — ciò che l'owner ha chiesto in più («migliorala e rendila più robusta»)

1. **Ripresa dopo la morte del processo, provata davvero**: `talosResearchReplay` esiste (M1). La
   prova che manca: un giornale **troncato a metà riga** (il telefono uccide mentre scrive) deve
   caricarsi lo stesso e riprendere dal passo dopo l'ultimo committato; un evento **duplicato**
   non deve contare due volte la spesa (`researchRun.ts:239-249` lo prevede: provarlo).
2. **`running` lo decide il vivo** (M19): dopo un riavvio dell'app, nessuna ricerca deve restare
   «in corso» per sempre — provare che una corsa uccisa esce come `interrupted`, non `running` né
   `failed`.
3. **Il giudice ≠ autore anche quando c'è un solo fornitore** (M10): provare il caso in cui il
   motore sul dispositivo è l'unico disponibile — deve dichiarare «giudicato dallo stesso
   modello» nel record, non tacere (è il `null` onesto di M13).
4. **Scheda e pagina del rapporto in quattro viewport, chiaro e scuro**, con i tre stati nuovi e
   con una ricerca **senza rapporto**: è lo stato che l'owner ha visto sul desktop e che nessuna
   foto del mobile ha mai mostrato.

## 4. Ordine, dipendenze, consegna

`MB-1` → `MB-2` → `MB-3` (MB-3 riusa la chiave di MB-2). Il §3 si fa dentro MB-1 (punti 1-2-4)
e MB-2 (punto 3).

Ogni lotto chiude con: test nuovi (anche al verso contrario) verdi · `npm run typecheck` (non a
mano) · vitest **se si tocca il nativo** · foto quattro viewport × due temi guardate una per una ·
un rapporto con **riproduzione → causa con prova → cura → riverifica coi numeri** · l'elenco dei
file di `lib/research/` toccati, per il desktop.

⛔ **Non toccare**: `harness-ui/` (lane desktop), i nomi degli 11 eventi, la forma del record
recintato, gli otto attrezzi. Se uno di questi deve cambiare, prima si scrive perché e lo si
manda alla lane desktop.

## 5. Fonti già raccolte (dettaglio e citazioni verbatim nel disegno, §5)

- «Cited but Not Verified», arXiv, 07/05/2026 — la fonte sostiene l'affermazione solo nel
  **39-77 %** dei casi; il fact-check cala del **42 %** da 2 a 150 recuperi ⇒ C22 (meno rumore per
  pagina) e M9-L3 (giudizio sul passaggio) sono la stessa battaglia.
- «From Inertia to Objectivity: Improving Deep Research Agents with Noise Isolation»,
  arXiv:2608.23045, 24/08/2026 (rev. 27/08) — isolare il rumore delle pagine dal ragionamento ⇒
  budget per pagina con il resto **fuori** dal contesto (MB-3).
- HypoSearch, 01/09/2026 — **46,7 → 60,0** con rami limitati ⇒ il piano a 2/4/6 rami è la forma
  giusta; la cache fra rami (MB-2) è ciò che li rende sostenibili.
- Sci-MMR, 10/09/2026 — la risposta è «giusta» **20 punti oltre** le prove recuperate ⇒ C20: lo
  stato si controlla contro l'artefatto, non contro la conclusione del modello.
- Anthropic, «How we built our multi-agent research system» — multi-agente **~15×** i token di
  una chat ⇒ MB-2 e MB-3 sono un obbligo di costo, non una rifinitura.
- Hermes Agent v0.21, `website/docs/user-guide/features/web-search.md:47-70` — budget 15.000,
  75/25, spill su disco, cache per sotto-agenti: l'unico punto in cui l'obiettivo da battere è
  davanti a noi.

⛔ **Non coperto**: i prodotti commerciali (OpenAI/Gemini/Perplexity Deep Research) non sono
stati ispezionati (quota di ricerca esaurita in quella sessione). Prima di scrivere codice per
MB-2/MB-3, una ricerca web di agosto-settembre 2026 su cache e budget di estrazione nei deep
research agent è obbligatoria: fonte + data nel commit.
