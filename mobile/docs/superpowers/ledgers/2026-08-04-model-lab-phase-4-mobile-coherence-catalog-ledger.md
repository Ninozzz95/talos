# Model Lab mobile — Fase 4: coerenza telefonica e scala catalogo

Data piano: 2026-08-04
Data chiusura: 2026-08-05
Owner: main agent della lane mobile
Stato: IMPLEMENTED — GREEN DEVICE — APK CONSEGNATA
Prerequisito: Fase 3 `IMPLEMENTED`, soddisfatto incluse prove fisiche
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

Baseline di scala fresca sul dispositivo Fase 3 a 360×792: il catalogo corrente
rende **479 card** insieme e la surface `settings-models-catalog-screen` misura
**171.838 CSS px** di altezza scrollabile. I valori storici 476/141.839 sono
superati. Questa misura va rifatta dopo il GREEN.

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
45. `mobile/tests/unit/router/routeWiring.test.ts`
46. `mobile/src/stores/localModels.ts`
47. `mobile/tests/unit/stores/localModels.test.ts`

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

Lo store mantiene inoltre il target di una pausa attraverso il cambio route ed
espone `talosResumeLocalDownload()`: lista e dettaglio non possiedono più una
copia locale divergente dello stesso trasferimento.

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

### F4-RED-12 — Back invalida il repository in volo

RED: una `listGgufFiles`/`pathsInfo` avviata dal dettaglio termina dopo Back e
risuscita `store.repo`, facendo sparire la lista o riaprendo il vecchio body.
GREEN: `talosCloseModelRepo()` invalida la generazione prima di azzerare lo
stato; ogni risposta tardiva è ignorata e il parent resta stabile.

### F4-RED-13 — pausa/ripresa sopravvive al Back

RED: il dettaglio conserva `started`/`paused` in ref locali; dopo pausa e Back
la lista non mostra più il trasferimento e non può ricostruire la richiesta.
GREEN: lo store conserva la richiesta nativa avviata, espone lo stato `paused`
e `talosResumeLocalDownload()` riusa esattamente repo, revision, file, byte,
hash e label anche quando `store.repo` è già stato chiuso.

### F4-RED-14 — il denominatore del catalogo non cambia sotto filtro

RED: l'introduzione della finestra progressiva usa `filteredProfiles.length`
come totale e trasforma il contratto esistente “1 di 2 modelli” in “1 di 1”.
GREEN: `shown` è il numero realmente montato, mentre `total` resta il catalogo
completo scoperto; ricerca e provider filter non riscrivono il denominatore.

### F4-RED-15 — le azioni variante non collidono a 360 px

RED: la griglia forza due colonne sul telefono e la label italiana “Controlla
questo telefono” invade il pulsante “Scarica” nella prova fisica.
GREEN: una colonna sotto `sm`, due colonne da `sm` in su, con label wrappable e
contenuta; screenshot fisico nuovo senza sovrapposizione.

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

### 2026-08-05 — baseline e inventario riconciliati prima del codice

La ricognizione sul tree Fase 3 e sul OnePlus fisico ha invalidato due assunti:

- il catalogo reale contiene 479 profili unici e monta 479 `[data-model-card]`;
  a 360×792/DPR 3 la surface ha `clientHeight=692`,
  `scrollHeight=171838`, `scrollWidth=clientWidth=360`;
- aprire una riga Hugging Face mantiene `/settings/models/local`, crea un Back
  nel body (`talos-models-back`) oltre al Back dell'header e usa stato interno:
  reload/deep link non identificano il repository.

`tests/unit/router/routeWiring.test.ts` enumera esplicitamente ogni route e
screen reale; va quindi modificato insieme alla route nuova ed è aggiunto come
file 45. Nessun altro file prodotto è ancora stato toccato. Geometria tablet
ripristinata a 2400×3392/density 420 dopo la misura.

### 2026-08-05 — gate standards-first riconfermato prima del RED

Il refresh Fase 4 è registrato nella sezione 15 del dossier. Decisioni bloccanti:

- **ADOPT** named route/params e codifica di Vue Router;
- **ADAPT** il list-detail Android a una route compact dedicata, deep-linkable,
  con il solo Back dell'header;
- **ADAPT** una finestra progressiva pura 40/+40 con key e ordine stabili;
- **ADOPT** `details`/`summary` nativo per il README completo;
- **REJECT** nuove dipendenze di virtualizzazione/markdown e nuove API HF.

Pin installati letti dal tree: Vue 3.5.40, Vue Router 5.2.0, Vite 7.3.6,
Vitest 4.1.10, Playwright 1.61.1 e TypeScript 5.9.3. Il client HF, le revision e
il gate live 3/3 appena chiuso nella Fase 3 restano il pin reale: questa fase non
cambia il wire. Il limite initial JS resta 600.000 byte e non verrà alzato.

### 2026-08-05 — regressione lifecycle scoperta durante l'estrazione

Il route detail rende osservabile un difetto già presente nello store:
`talosCloseModelRepo()` azzerava lo stato ma non incrementava `repoGeneration`.
Una risposta HF tardiva poteva quindi ricreare il repository dopo Back. Aggiunti
i file 46–47 all'inventario e lo scenario permanente F4-RED-12 prima di toccare
store o relativo test. Il fix resta nella lane mobile e non cambia il wire HF.

### 2026-08-05 — fixture E2E del catalogo resa deterministica

Il primo GREEN browser del nuovo scenario progressivo ha trovato zero profili,
non per un difetto della surface ma perché la setup produce lo `storageState`
provider in un file opt-in e questa nuova spec non lo aveva ancora dichiarato;
inoltre i cataloghi scoperti vengono ricostruiti via rete a ogni
inizializzazione. Lo scenario F4-RED-10 deve quindi usare esplicitamente quello
stato e registrare prima di `goto` una risposta Gemini primaria e deterministica
con almeno 80 modelli chat, come già fanno gli altri E2E provider. Il test
continuerà a percorrere la UI reale e
misurerà 40/+40; non verranno iniettati profili direttamente nello storage né
allentate le asserzioni. Il locator del conteggio viene inoltre confinato alla
screen catalogo, perché il composer sottostante possiede legittimamente un
secondo live region `status`.

### 2026-08-05 — regressione pausa/ripresa tra route

L'estrazione del dettaglio in una route autonoma rende i ref component-locali
`started`/`paused` insufficienti: al Back vengono distrutti e la lista non può
riprendere i byte già presenti. Aggiunto F4-RED-13 prima del fix. Non servono
nuovi file oltre ai numeri 18, 46 e 47 già inventariati; il nuovo simbolo
pubblico è `talosResumeLocalDownload()` e `transfer.paused` diventa l'unica
fonte di verità UI condivisa.

### 2026-08-05 — regressioni trovate dalla matrice E2E Fase 4

La matrice 13-test ha chiuso 11 scenari e ha fermato la fase su due contratti:

- il conteggio progressivo aveva sostituito il totale globale con il totale
  filtrato; registrato come F4-RED-14 e coperto sia unit sia parity E2E;
- la metadata provenance è ora correttamente dentro la disclosure compatta, ma
  l'E2E manual-model la cercava senza aprire “Dettagli e azioni”. Il percorso
  viene corretto per interagire come un utente, senza rendere visibile di nuovo
  il blocco avanzato nel primo paint.

### 2026-08-05 — F4-RED-15 trovato dal primo screenshot fisico

Il primo APK Fase 4 è installabile e il dettaglio reale apre 27 varianti con URL
pinned, ma lo screenshot 360×792 mostra la label del controllo device oltre il
proprio bottone. La fase non è accettata visivamente. Il fix resta nei file 1 e
7 già inventariati; dopo il GREEN l'APK e tutte le evidenze saranno rigenerati,
senza riutilizzare lo screenshot difettoso.

## 12. Consuntivo finale e riconciliazione del tree — 2026-08-05

### 12.1 File effettivamente creati

Tutti i 17 file della sezione **Creare** esistono. I sei simboli di produzione,
i sei test/E2E e le cinque evidenze prescritte sono quelli nominati ai numeri
1–17; non è stato introdotto alcun file prodotto aggiuntivo.

### 12.2 File effettivamente modificati dalla Fase 4

La modifica di comportamento/documentazione è rimasta nei seguenti file già
inventariati:

1. `mobile/src/components/talos/models/TalosMobileLocalModels.vue`;
2. `mobile/src/components/talos/models/TalosMobileModelCatalog.vue`;
3. `mobile/src/lib/mobileRoutes.ts`;
4. `mobile/src/App.vue`;
5. `mobile/src/i18n/locales/it.ts`;
6. `mobile/src/i18n/locales/en.ts`;
7. `mobile/src/stores/localModels.ts`;
8. `mobile/tests/unit/components/localModelsSection.test.ts`;
9. `mobile/tests/unit/models/TalosMobileModelCatalog.test.ts`;
10. `mobile/tests/unit/models/readmeDescription.test.ts`;
11. `mobile/tests/unit/navigation/modelLabRoutes.test.ts`;
12. `mobile/tests/unit/router/routeWiring.test.ts`;
13. `mobile/tests/unit/stores/localModels.test.ts`;
14. `mobile/tests/e2e/mobile-model-lab-parity.e2e.spec.ts`;
15. questo ledger;
16. il piano master;
17. `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`;
18. il dossier di ricerca.

I seguenti percorsi pianificati sono stati ispezionati ed eseguiti come gate,
ma il contratto corrente era già sufficiente e la Fase 4 non li ha modificati:

- `TalosMobileModelAdvancedOptions.vue` e relativo test;
- `SettingsModelsLocalScreen.vue` e `SettingsModelsCatalogScreen.vue`;
- `backNavigation.test.ts`, `appShell.test.ts`, `settingsModelsScreens.test.ts` e
  `modelLabThemeTokenContract.test.ts`;
- `initialChunkContract.test.ts` e `scripts/verify-initial-chunk.mjs`;
- `localization.test.ts` e `localizationCoverage.test.ts`;
- `mobile-model-lab-navigation.e2e.spec.ts`.

`mobile-model-lab-filters.e2e.spec.ts` è una creazione della Fase 3 presente
nello stesso dirty tree: in Fase 4 è stata soltanto rieseguita. Le modifiche già
presenti in `settingsModelsScreens.test.ts` e
`modelLabThemeTokenContract.test.ts` appartengono analogamente alla Fase 3 e
non vengono riattribuite a questa fase. Nessun file è stato eliminato, nessuna
dipendenza è stata aggiunta e nessuna lane desktop/core/validator/control-plane
è stata toccata.

### 12.3 Esito funzionale misurato

- Il catalogo fisico scopre 479 modelli ma monta 40 righe al primo paint e 80
  dopo una attivazione reale di **Mostra altri**. Gli 80 ID sono unici,
  l'ordinamento è stabile e il denominatore resta globale sotto filtro.
- L'altezza a 360×792 scende da 171838 CSS px della baseline a 9812 al primo
  paint; dopo 40 righe aggiuntive è 19453. In entrambi gli stati
  `scrollWidth=clientWidth=360`.
- La lista locale mostra 20 repository reali in righe compatte. Una riga apre
  una route nominata con owner/repo e revision; il reload riapre lo stesso
  repository.
- Il dettaglio reale rende 27 set di varianti, zero device card, zero Back nel
  body e un solo Back di header. Titolo e README fanno wrapping/disclosure.
- F4-RED-12 invalida le risposte HF tardive al Back; F4-RED-13 mantiene la
  richiesta nativa completa per pausa/ripresa fra route.
- F4-RED-15 forza una colonna sotto `sm`: i due controlli variante occupano
  separatamente x=29…331 CSS px e non collidono più.

### 12.4 Gate automatici e upstream finali

- Focused TDD e scenari permanenti: F4-RED-01…15 GREEN.
- `npm run test:unit`: 408 file passati, 3 skipped; 3633 test passati,
  10 skipped. Due run precedenti avevano esposto, uno per volta, due diversi
  timeout da 5 secondi del chat controller sotto carico; entrambi erano verdi
  isolati e il run ufficiale finale è passato sul source invariato.
- `npm run typecheck`: GREEN.
- E2E Model Lab finali: 13/13 GREEN con un worker.
- `npm run build`: GREEN; JS iniziale 599981/600000 byte, CSS iniziale
  205078/220000, gzip JS/CSS 193253/31361. Un build intermedio da 600034 byte è
  stato correttamente respinto e ridotto senza alzare il tetto.
- Gate live Hugging Face: 3/3 GREEN su OpenAPI canonica, revision Qwen pin e
  revision non-chat; il wire non è cambiato.
- `npx cap sync android`: GREEN.
- `.\gradlew.bat testDebugUnitTest assembleDebug -PtalosSideBySide
  --no-daemon --console=plain`: GREEN, 591 task, 31 eseguiti e 560 up-to-date.
- Installazione `ai.talos.dev` sul OnePlus fisico: GREEN.

### 12.5 Cancello fisico finale

Le quattro catture finali provengono dall'APK definitiva installata sul OnePlus
OPD2415, Android 16/API 36, con override temporaneo 1080×2376/density 480 e
viewport 360×792/DPR 3. Sono state ispezionate singolarmente dal main agent:

1. `local-overview-360x792.png` — SHA-256
   `70d06534d04c2d7e34ea0802cb0d124124de6313ea2bfc66c17cf4c6b6f85e98`;
2. `local-repo-detail-360x792.png` — SHA-256
   `550475f50c15e22e90db73ee855b87caef3406a9c1cdf579918b9b482c6928f9`;
3. `catalog-initial-40.png` — SHA-256
   `884f9203db0bd290fb7cd7fb71e76722568311dd05418346e09177d408c75d9a`;
4. `catalog-after-more.png` — SHA-256
   `93cef747769590529f1e764c25d6c4055e569d9818a37d15594af242171ab2cb`.

Route, interazioni, conteggi DOM, scroll metric, hash, tema e controlli PII sono
nel `phase-4/manifest.md`. Dopo le catture sono stati confermati
2400×3392/density 420 fisici e auto-rotazione attiva. Il forward task-owned
`tcp:9222` è stato rimosso; un diverso `tcp:9223`, non creato dalla cattura, è
stato preservato. `git diff --check` è verde e PNG/manifest Fase 4 non sono
ignorati (`git check-ignore` exit 1, senza output). Nessun difetto visivo o
funzionale Fase 4 resta aperto.

### 12.6 APK consegnata e punto di arresto

- sorgente:
  `mobile/android/app/build/outputs/apk/debug/app-debug.apk`;
- copia Desktop:
  `C:\Users\Antonino\Desktop\TALOS-mobile-phase-4-20260805.apk`;
- timestamp UTC: `2026-08-05T08:01:08.0928758Z`;
- byte: 30574412;
- SHA-256:
  `085e98242359d7bd03d5c2408eb638859f9421112ec92f8b31b264ccbb272e32`;
- identità byte sorgente/Desktop: PASS.

La Fase 4 termina qui. La Fase 5 è `HOLD OWNER REVIEW`: nessuna sua ricerca
operativa, RED o modifica prodotto è stata avviata. Il vincolo repository
`AGENTS.md` vieta commit dell'agente; non è stato eseguito commit né push.
