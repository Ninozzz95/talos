# BRIEF — CORSIA 1 · «Hugging Face» e la barra a faccette (FASE 4)

> Owner 19/09/2026: «via fase 4». Modello: **Opus 5, sforzo high**.
> Scomposizione completa: `.claude/FASE-4-SCOMPOSIZIONE-2026-09-19.md` (leggila prima).
> Documento di ripresa: `.claude/RIPRESA-PARITA-MOCKUP-2026-09-18.md`.

## ⛔ COSA ESISTE GIÀ — misurato il 19/09/2026, non dedotto

- **La barra a faccette ESISTE** ed è un componente completo: `components/catalogo-faccette.js`
  (426 righe) — gruppi `[data-facet-group]`, righe `[data-facet-row]`, caselle
  `input[data-facet-check]`, chip `[data-facet-chip]`, «Vedi altri» `[data-facet-more]`,
  ambito `[data-facet-scope]`, avanzati `#modelLabFacetsAdvanced`, e la barra stessa marcata
  `[data-catalog-facets]` (`:190`) e cercabile come `#modelLabFacets` (`catalogo-modelli.js:129`).
- **È importata e chiamata**: `catalogo-modelli.js:130` chiama `creaBarraFaccette(...)`, `:182`
  chiama `aggiornaBarraFaccette(...)`. La catena `app.js:23 → catalogo-modelli.js → faccette` è
  viva: **non è la classe «funzione senza chiamante»** (verificato, non supposto).
- ⛔ **E NON È NELLA PAGINA.** Misurato sul **4174** il 19/09/2026 con una sonda in sola lettura
  (`artifacts/fase3-banda/recon-faccette.mjs`, scheda «Hugging Face» aperta):
  `#modelLabFacets` **0 copie** · `[data-catalog-facets]` **0** · caselle **0** · gruppi **0**,
  mentre `#modelLabCatalogPanel`… il pannello `huggingface` è `display:block` e alto **1858 px**.
  Causa nella catena: `aggiornaCatalogoModelli` (`:174`) costruisce la barra **solo se `dati` è
  truthy** — `const barra = dati ? barraDelPannello(panel) : null;` — e la appende dentro il pannello
  che riceve. Su questa macchina il registro dice **«Modelli osservati · Catalogo non caricato»**.
- **La prova esiste ed è rossa per un motivo preciso, misurato**: `tests/browser/lab-faccette.spec.mjs`
  — **7 test, tutti `timedOut`** (30 s). Alla riga **195** fa
  `page.getByRole('tab', { name: 'Modelli', exact: true }).click()`: la linguetta che il guscio
  mostra oggi si chiama **«Hugging Face»** (`#labSchedaModels`) — **decisione dell'owner**, non una
  divergenza da correggere nel prodotto.
- Il gemello rosso: **«Model Lab filters have explicit names and hit areas»** in `baseline-shell`
  (il cancello pretende tre controlli: `searchbox` «Cerca nel catalogo», `combobox` «Fornitore»,
  `combobox` «Ordina i modelli»; la riga viva ha altri nomi — misurato `1 · 0 · 0`).

## Il tuo compito

**Collegare la barra a faccette alla scheda «Hugging Face» come la disegna il mockup, e far
diventare verdi le due prove.** Non riscrivere il componente: la sua logica c'è ed è ragionata
(OR dentro una faccetta, AND fra faccette, conteggio calcolato **senza** il filtro della faccetta
stessa). Il difetto è **nella catena di montaggio** e nel **rapporto col catalogo**.

Il disegno da raggiungere (dal DOM vivo del mockup, `C:\Users\Antonino\Downloads\TALOS-Calm-Lab-04.html`,
misurato il 18/09/2026): ricerca + **9 ordinamenti** + chip **Tutti / Locali 12 / Cloud 3 /
Installati 2 / Preferiti** + **4 faccette** (Grandezza, Contesto, Formato, Compatibilità RAM) +
`#catalog-expand` → **12 gruppi** di faccette + **«15 modelli»** + **«Viste salvate (0)»** +
**«Salva vista»**; 15 righe `1122×96` in due gruppi (**SUL DISPOSITIVO 12** / **VIA PROVIDER 3**),
ognuna con glifo, nome 14/550, meta, disponibilità, capacità, stella Preferiti e casella confronta.

## I tuoi file — e SOLO questi

- `harness-ui/frontend/src/components/catalogo-faccette.js`
- `harness-ui/frontend/src/components/catalogo-modelli.js`
- `harness-ui/frontend/src/domain/catalog-engine.ts`
- `harness-ui/frontend/tests/browser/lab-faccette.spec.mjs`
- `harness-ui/frontend/tests/unit/catalog-faccette.test.mjs`

⛔ **NON toccare** (sono dell'orchestratore e di altre corsie): `src/legacy/app.js`,
`src/legacy/frammenti.html`, `src/components/lab-cornice-v3.js`, `src/components/cornice-model-lab.js`,
`src/styles/*` (se ti serve una regola CSS, **chiedila** e motivala con la misura),
`index.template.html`, `public/*`, e **ogni altro spec** (in particolare
`_fase3-banda.spec.mjs`, `lab-guscio.spec.mjs`, `_fase2-niente-perso.spec.mjs`: sono verdi e
devono restare verdi).

## Ricerca web — obbligatoria, prima di scrivere (owner 18/09)

**Fatta, e vale come metro del tuo lavoro** (19/09/2026): il **conteggio per valore** è ciò che
distingue una faccetta da un muro di caselle; **OR dentro una faccetta, AND fra faccette**; i valori
a **zero si grigiano** (`data-facet-zero` esiste già), non si nascondono — salvo faccette con 50+
valori; **«Vedi altri»** oltre 5-10 valori, con ricerca-dentro-la-faccetta sopra 10; **`aria-live`
sui cambi di risultato**; **5-8 faccette visibili** al massimo; lo stato dei filtri vive nell'**URL**.
Fonti: <https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns> ·
<https://www.ideaplan.io/templates/faceted-search-template> ·
<https://www.designsystems.one/design-systems/patterns/filters-and-refinement> ·
<https://www.uixhero.com/resources/ui-components/filter> (lette 19/09/2026).
**E per ogni passo TUO che non è coperto da queste**, cerca prima di scrivere e **cita fonte + data
nel commento**. Se una ricerca non c'è, il passo non è giustificato.

## Cosa dichiara finito il tuo lavoro

1. **`lab-faccette` 7/7 verdi** — e le sue asserzioni **rilette una per una** quando ne cambi una:
   il commento deve dire ancora la stessa cosa dell'asserzione (si adatta il **bersaglio**, mai il
   significato).
2. **«Model Lab filters have explicit names and hit areas» verde** in `baseline-shell`.
3. La barra **vista sul 4174**, con le sue faccette e i conteggi, in **entrambi i temi** a
   1024 e 1440 — foto tue, nel tuo resoconto.
4. `npm run test:unit` **1420/1420** e gli spec che hai toccato verdi.
5. **Il rosso provato**: per ogni difesa che aggiungi, mostra che togliendola la prova diventa
   rossa. Una prova che resta verde quando togli la cosa che nomina **non sta provando niente**.

## Regole di casa che ti riguardano

- ⛔ **Niente `npm run build`** e **niente `public/`**: il bundle lo costruisce l'orchestratore.
  Servi il tuo lavoro con lo **store isolato** e una **porta tua** (`TALOS_HARNESS_UI_TEST_PORT`,
  es. 4194) — il **4174 è del lavoro dell'owner: sola lettura, ogni non-GET fermata**.
- ⛔ **Niente commit, niente push.** Consegni nel messaggio: file toccati, misure, prove
  rosso/verde, ciò che **non** hai potuto verificare.
- ⛔ **I selettori si leggono dal sorgente, non si indovinano**: la prima stesura della mia sonda
  cercava `[data-faccette]` (nome inventato) e rispondeva «la barra non c'è».
- ⛔ **Ci sono duplicati legacy nascosti nel DOM**: ancora i selettori a `#modelLabCard` +
  `[data-model-lab-panel="…"]`, mai al documento intero.
- **Ciò che non si collega si ELENCA, non si inventa**: se il mockup mostra qualcosa che i nostri
  dati non hanno, scrivilo nel resoconto e **non disegnarlo** (owner 18/09).
