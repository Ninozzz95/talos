# Model Lab mobile — Fase 4: coerenza telefonica e scala catalogo

Data: 2026-08-04
Owner: main agent della lane mobile
Stato: PLANNED — NON IMPLEMENTATA
Prerequisito: Fase 3 `IMPLEMENTED`, inclusi screenshot fisici
Specifica: `../specs/2026-08-04-model-lab-mobile-hub-design.md`
Ricerca: `../research/2026-08-04-model-lab-mobile-hub-research.md`
Piano: `../plans/2026-08-04-model-lab-mobile-hub-plan.md`

## 1. Obiettivo e confine

Rendere Catalogo e Modelli locali leggibili, compatti e armoniosi su un telefono
360×792 senza perdere comportamento reale. Il dettaglio repository diventa una
pagina con URL e parent. Il catalogo TALOS rende 40 profili alla volta e può
raggiungere deterministicamente tutti gli altri.

Non si cambia semantica provider/fit/filter, non si introduce
virtualizzazione/dipendenza nuova e non si implementa OAuth.

Baseline di scala osservata: il catalogo corrente rende 476 card insieme e
produce circa 141.839 CSS px di altezza. Questa misura va rifatta prima e dopo.

## 2. Inventario esatto dei file

### Creare

1. `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`
2. `mobile/src/components/talos/models/TalosMobileLocalModelRow.vue`
3. `mobile/src/components/talos/models/TalosMobileCatalogProfileRow.vue`
4. `mobile/src/lib/models/progressiveModelList.ts`
5. `mobile/src/lib/models/readmeSummary.ts`
6. `mobile/src/screens/SettingsModelsLocalRepoScreen.vue`
7. `mobile/tests/unit/models/TalosMobileLocalRepoDetail.test.ts`
8. `mobile/tests/unit/models/TalosMobileLocalModelRow.test.ts`
9. `mobile/tests/unit/models/TalosMobileCatalogProfileRow.test.ts`
10. `mobile/tests/unit/models/progressiveModelList.test.ts`
11. `mobile/tests/unit/screens/settingsModelsLocalRepoScreen.test.ts`
12. `mobile/tests/e2e/mobile-model-lab-coherence.e2e.spec.ts`
13. `mobile/docs/superpowers/evidence/model-lab/phase-4/local-overview-360x792.png`
14. `mobile/docs/superpowers/evidence/model-lab/phase-4/local-repo-detail-360x792.png`
15. `mobile/docs/superpowers/evidence/model-lab/phase-4/catalog-initial-40.png`
16. `mobile/docs/superpowers/evidence/model-lab/phase-4/catalog-after-more.png`
17. `mobile/docs/superpowers/evidence/model-lab/phase-4/manifest.md`

### Modificare

18. `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
19. `mobile/src/components/talos/models/TalosMobileModelCatalog.vue`
20. `mobile/src/components/talos/models/TalosMobileModelAdvancedOptions.vue`
21. `mobile/src/screens/SettingsModelsLocalScreen.vue`
22. `mobile/src/screens/SettingsModelsCatalogScreen.vue`
23. `mobile/src/lib/mobileRoutes.ts`
24. `mobile/src/App.vue`
25. `mobile/src/i18n/locales/it.ts`
26. `mobile/src/i18n/locales/en.ts`
27. `mobile/tests/unit/components/localModelsSection.test.ts`
28. `mobile/tests/unit/models/TalosMobileModelCatalog.test.ts`
29. `mobile/tests/unit/models/TalosMobileModelAdvancedOptions.test.ts`
30. `mobile/tests/unit/models/readmeDescription.test.ts`
31. `mobile/tests/unit/navigation/modelLabRoutes.test.ts`
32. `mobile/tests/unit/lib/backNavigation.test.ts`
33. `mobile/tests/unit/shell/appShell.test.ts`
34. `mobile/tests/unit/screens/settingsModelsScreens.test.ts`
35. `mobile/tests/unit/theme/modelLabThemeTokenContract.test.ts`
36. `mobile/tests/unit/build/initialChunkContract.test.ts`
37. `mobile/scripts/verify-initial-chunk.mjs`
38. `mobile/tests/unit/i18n/localization.test.ts`
39. `mobile/tests/unit/i18n/localizationCoverage.test.ts`
40. `mobile/tests/e2e/mobile-model-lab-navigation.e2e.spec.ts`
41. `mobile/tests/e2e/mobile-model-lab-parity.e2e.spec.ts`
42. `mobile/tests/e2e/mobile-model-lab-filters.e2e.spec.ts`
43. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-4-mobile-coherence-catalog-ledger.md`
44. `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`

### Eliminare

Nessun file. La decomposizione di `TalosMobileLocalModels.vue` è incrementale:
non si elimina il componente radice né si riscrive lo store.

## 3. Contratti e simboli pubblici

### Route

`TalosMobileRouteName` aggiunge `settings-models-local-repo` con path
`/settings/models/local/:owner/:repo` e parent `settings-models-local`.

Nuovo screen `SettingsModelsLocalRepoScreen` valida entrambi i parametri. Un
parametro vuoto/array o una repo non apribile mostra un errore azionabile e non
invoca il client con una stringa corrotta.

### Rendering progressivo

- `TALOS_MODEL_CATALOG_PAGE_SIZE = 40`;
- `TalosProgressiveModelListState`;
- `talosInitialModelLimit()`;
- `talosNextModelLimit(current, total)`;
- `talosVisibleModelProfiles(profiles, limit)`.

Il limite si azzera a 40 quando cambia search/provider. L'ordinamento della
lista filtrata non cambia; **Mostra altri** aggiunge al massimo 40 e scompare
quando tutti sono visibili.

### Componenti

- `TalosMobileCatalogProfileRow`: una riga per profilo con azioni reali e
  dettagli espandibili;
- `TalosMobileLocalModelRow`: una riga repository con verdict, metadata e link
  route-native;
- `TalosMobileLocalRepoDetail`: carica card/file della route e rende varianti;
- `talosReadmeSummary(markdown)` in `readmeSummary.ts`: pulizia deterministica,
  testo conciso e fallback null.

`readmeDescription.test.ts` smette di testare una copia locale della funzione e
importa il simbolo di produzione.

### Compatibilità da preservare

- azioni select/hide/probe/rename/manual model del catalogo;
- ricerca e provider filter;
- store locale, download, stop, delete, rename, installed models e leftovers;
- repository ID e revision senza perdita;
- componenti lazy e bundle gate;
- verdict e filtri delle fasi precedenti;
- nessuna scheda dispositivo o tasto Back aggiunto nel dettaglio.

## 4. Regole visuali misurabili

- massimo 40 `[data-model-card]`/righe al primo render del catalogo;
- nessun `scrollWidth > clientWidth` a 360 CSS px;
- ogni azione primaria almeno `--talos-touch-target`;
- titolo repository va a capo e non usa ellissi come unica accessibilità;
- metadata secondari massimo due righe prima di un'espansione;
- README iniziale conciso; testo completo soltanto dietro disclosure accessibile;
- azioni per riga raggruppate senza più di una coppia primaria simultanea;
- nessuna nested card ridondante che ripeta autore/repo/verdict;
- nessun dato dispositivo nelle pagine figlie;
- tutte le nuove surface entrano nel gate statico Theme Engine.

## 5. Scenari RED → GREEN permanenti

### F4-RED-01 — 476 card non montano insieme

RED: primo render produce 476 card e altezza ~141.839px.
GREEN: esattamente 40 righe, conteggio “40 di 476” e Mostra altri.

### F4-RED-02 — incremento e fine lista

RED: Mostra altri duplica/salta elementi o resta dopo l'ultimo.
GREEN: 40→80→…→476, ordine/ID unici, azione scompare a fine lista.

### F4-RED-03 — reset del limite

RED: dopo aver caricato 120, una query da 20 e il successivo reset mostrano
120 senza intenzione.
GREEN: ogni cambio search/provider riparte da 40; il clear è deterministico.

### F4-RED-04 — tutte le azioni sopravvivono

RED: estrarre la row perde select, visibility, probe, rename o advanced.
GREEN: ogni azione emette lo stesso controller call e gestisce busy/error.

### F4-RED-05 — route repository round-trip

RED: cliccare `owner/repo` usa stato interno senza URL o Back perde il parent.
GREEN: URL con owner/repo, reload riapre lo stesso dettaglio, Back torna alla
lista conservando stato utile.

### F4-RED-06 — repository ID sicuro

RED: slash, spazi o caratteri encoded vengono concatenati manualmente e
corrompono la route/API.
GREEN: params nominati/encoded da router e ricomposizione validata
`owner/repo`.

### F4-RED-07 — nessun duplicato strutturale

RED: dettaglio contiene device card o un secondo Back.
GREEN: zero device card, zero body-back, un solo header Back dal parent table.

### F4-RED-08 — titolo e README telefonici

RED: titolo lungo viene tagliato e README mostra badge/link markdown grezzo.
GREEN: wrapping; summary di produzione pulito; disclosure del completo
accessibile.

### F4-RED-09 — lista locale resta funzionale

RED: estrazione row perde stato download/installato, rename/delete o verdict.
GREEN: test caratterizzano ogni stato/azione esistente prima e dopo refactor.

### F4-RED-10 — nessun overflow con zoom

RED: 360px o UI scale massima taglia filtro, titolo, azioni o select.
GREEN: `scrollWidth <= clientWidth`, wrapping e target raggiungibili.

### F4-RED-11 — chunk e bundle

RED: detail/advanced entra nel primo paint o il pacco supera il limite.
GREEN: dynamic entry raggiungibile e limite rispettato senza alzarlo.

## 6. Ordine TDD eseguibile

1. Caratterizzare tutte le azioni esistenti prima dell'estrazione.
2. Scrivere F4-RED-01…03 sul helper puro e componente catalogo.
3. Implementare limite 40/+40, poi estrarre `CatalogProfileRow` con F4-RED-04.
4. Scrivere F4-RED-05…07 su route/detail e farli fallire.
5. Aggiungere route/screen/detail; spostare la vista repository fuori dalla
   lista senza cambiare lo store.
6. Estrarre `readmeSummary.ts` e `LocalModelRow` con F4-RED-08/09.
7. Eseguire F4-RED-10/11, suite, build, misura DOM e dispositivo.

## 7. Comandi di prova

Da `mobile/`:

```powershell
npx vitest run tests/unit/models/progressiveModelList.test.ts tests/unit/models/TalosMobileCatalogProfileRow.test.ts tests/unit/models/TalosMobileModelCatalog.test.ts tests/unit/models/TalosMobileLocalModelRow.test.ts tests/unit/models/TalosMobileLocalRepoDetail.test.ts tests/unit/models/readmeDescription.test.ts tests/unit/components/localModelsSection.test.ts
npx vitest run tests/unit/screens/settingsModelsLocalRepoScreen.test.ts tests/unit/screens/settingsModelsScreens.test.ts tests/unit/navigation/modelLabRoutes.test.ts tests/unit/lib/backNavigation.test.ts tests/unit/shell/appShell.test.ts tests/unit/theme/modelLabThemeTokenContract.test.ts tests/unit/build/initialChunkContract.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts
npx playwright test tests/e2e/mobile-model-lab-coherence.e2e.spec.ts tests/e2e/mobile-model-lab-navigation.e2e.spec.ts tests/e2e/mobile-model-lab-parity.e2e.spec.ts tests/e2e/mobile-model-lab-filters.e2e.spec.ts --workers=1
npm run typecheck
npm run test:unit
npm run build
```

Misura Playwright da registrare nel ledger:

```text
profile count totale
row count montato iniziale
document.scrollHeight iniziale
row count dopo Mostra altri
document.scrollHeight dopo Mostra altri
scrollWidth/clientWidth a viewport e UI scale massima
```

Da root:

```powershell
git diff --check
git diff --name-only
git status --short
```

## 8. Cancello visivo fisico

File obbligatori:

1. `phase-4/local-overview-360x792.png` — filtri e almeno due righe locali;
2. `phase-4/local-repo-detail-360x792.png` — titolo lungo, summary, varianti e
   unico Back di header;
3. `phase-4/catalog-initial-40.png` — conteggio 40/total e gerarchia iniziale;
4. `phase-4/catalog-after-more.png` — conteggio 80/total dopo azione reale;
5. `phase-4/manifest.md`.

Per ogni PNG il manifest registra route, scroll position e conteggio DOM. Le
catture devono provenire dal OnePlus fisico a viewport 360×792 e mostrare
abbastanza chrome da rendere visibili eventuali tagli. Devono essere ispezionati
wrapping, densità, contrasto, target e duplicazioni.

La fase non è implementata se uno screenshot “sembra bello” ma il conteggio DOM
o il manifest non prova lo scenario.

## 9. Prova umana e one-up

Domande:

- “posso capire un repository e scegliere una variante senza attraversare una
  parete di card?”
- “posso raggiungere il modello numero 476 senza che il primo render paghi 476
  componenti?”

One-up L2: gerarchia browse/detail nativa come PocketPal, ma con verdict
device-aware già nell'elenco, catalogo cloud e locale nello stesso hub e ogni
stato legato al Theme Engine.

## 10. Rollback

Il limite progressivo è additivo: in caso di regressione si mantiene 40 righe e
si disabilita l'azione con un errore onesto, non si torna a 476 card. La route
dettaglio è additiva; lo store conserva il suo contratto interno. Ogni estrazione
può essere ricomposta con patch mirata perché i test caratterizzano gli eventi;
non si resetta `TalosMobileLocalModels.vue` wholesale.

## 11. Registro emendamenti

Nessun emendamento al momento della stesura.
