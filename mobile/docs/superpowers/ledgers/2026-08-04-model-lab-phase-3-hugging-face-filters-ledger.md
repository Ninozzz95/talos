# Model Lab mobile — Fase 3: filtri e semantica Hugging Face

Data: 2026-08-04
Owner: main agent della lane mobile
Stato: PLANNED — NON IMPLEMENTATA
Prerequisito: Fase 2 `IMPLEMENTED`, inclusi screenshot fisici
Specifica: `../specs/2026-08-04-model-lab-mobile-hub-design.md`
Ricerca: `../research/2026-08-04-model-lab-mobile-hub-research.md`
Piano: `../plans/2026-08-04-model-lab-mobile-hub-plan.md`

## 1. Obiettivo e confine

Rendere veri, stabili e leggibili tutti i filtri della pagina Modelli locali.
Chat, Q4, licenza, orientamento al codice e Gira qui devono avere un'autorità
documentata. Le opzioni provider non possono sparire per effetto del proprio
filtro. Il token Hugging Face si sposta in Provider e accessi senza cambiare
ancora metodo di autenticazione.

Non si implementa OAuth, non si cambia il trasporto download e non si affronta
ancora il rendering progressivo del catalogo TALOS.

## 2. Inventario esatto dei file

### Creare

1. `mobile/src/lib/models/licensePolicy.ts`
2. `mobile/tests/unit/models/licensePolicy.test.ts`
3. `mobile/src/components/talos/models/TalosMobileHuggingFaceAccessCard.vue`
4. `mobile/tests/unit/models/TalosMobileHuggingFaceAccessCard.test.ts`
5. `mobile/tests/e2e/mobile-model-lab-filters.e2e.spec.ts`
6. `mobile/docs/superpowers/evidence/model-lab/phase-3/filters-combined-results.png`
7. `mobile/docs/superpowers/evidence/model-lab/phase-3/filters-empty-provider-stable.png`
8. `mobile/docs/superpowers/evidence/model-lab/phase-3/hugging-face-access-card.png`
9. `mobile/docs/superpowers/evidence/model-lab/phase-3/manifest.md`

### Modificare

10. `mobile/src/lib/models/browseFilters.ts`
11. `mobile/src/lib/models/huggingFace.ts`
12. `mobile/src/lib/models/presentation.ts`
13. `mobile/src/stores/localModels.ts`
14. `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
15. `mobile/src/components/talos/models/TalosMobileModelLabHub.vue`
16. `mobile/src/screens/SettingsModelsProvidersScreen.vue`
17. `mobile/src/i18n/locales/it.ts`
18. `mobile/src/i18n/locales/en.ts`
19. `mobile/tests/unit/models/browseFilters.test.ts`
20. `mobile/tests/unit/models/huggingFaceBrowse.test.ts`
21. `mobile/tests/unit/models/huggingFaceClient.test.ts`
22. `mobile/tests/unit/models/huggingFaceDiscovery.test.ts`
23. `mobile/tests/unit/models/presentation.test.ts`
24. `mobile/tests/unit/stores/localModels.test.ts`
25. `mobile/tests/unit/components/localModelsSection.test.ts`
26. `mobile/tests/unit/models/TalosMobileModelLabHub.test.ts`
27. `mobile/tests/unit/screens/settingsModelsScreens.test.ts`
28. `mobile/tests/unit/theme/modelLabThemeTokenContract.test.ts`
29. `mobile/tests/unit/i18n/localization.test.ts`
30. `mobile/tests/unit/i18n/localizationCoverage.test.ts`
31. `mobile/tests/e2e/mobile-model-lab-navigation.e2e.spec.ts`
32. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-3-hugging-face-filters-ledger.md`
33. `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`

### Eliminare

Nessun file.

Qualunque aggiunta richiede un emendamento preventivo. In particolare, non si
crea un secondo store credenziali prima della Fase 5.

## 3. Contratti e simboli pubblici

### Policy licenza

- `TalosLicenceDisposition = 'permissive-declared' | 'restricted' |
  'custom' | 'unknown'`
- `TALOS_PERMISSIVE_MODEL_LICENCES`
- `talosModelLicenceId(tags, cardLicence?)`
- `talosClassifyModelLicence(licence)`
- `talosHasDeclaredPermissiveLicence(model)`

Allowlist esatta:

```text
apache-2.0
mit
bsd
bsd-2-clause
bsd-3-clause
isc
bsl-1.0
cc0-1.0
unlicense
zlib
```

### Browse/filter

- `TalosBrowseFilterId` conserva gli ID persistiti
  `fits|chat|code|q4|open-licence`;
- la label di `code` diventa **Orientato al codice**;
- la label di `open-licence` diventa **Licenza permissiva dichiarata**;
- `talosModelIsChatCapable(model)`;
- `talosModelIsCodeOriented(model)`;
- `talosModelHasQ4Variant(model)`;
- `talosBrowsePublishers(models, selectedPublisher)`;
- `talosModelPassesFilter(model, filter, device)`;
- `talosApplyBrowseFilters(models, activeFilters, device)`.

`TalosBrowsableModel` usa i campi normalizzati della Fase 1:
`tags`, `task`, `hasChatTemplate`, `browseVariant`, `licence` e verdict quando
calcolato. Nessun helper rilegge il nome per Q4 o fit quando il contratto ha il
dato canonico.

### Hugging Face

`TalosHuggingFaceModel.downloads` resta compatibile ma il copy è esplicitamente
30 giorni. Il modello conserva `downloadsAllTime` soltanto se richiesto e
disponibile; non sostituisce il campo esistente in modo ambiguo.

`TalosMobileHuggingFaceAccessCard` espone stato token manuale, salva/dimentica
tramite le API store esistenti e non riceve mai il token come prop o testo DOM.
La Fase 5 può estenderla con OAuth senza spostarla di nuovo.

## 4. Scenari RED → GREEN permanenti

### F3-RED-01 — Fits è noto e congiunto

RED: verdict unknown, storage-blocked o memory-blocked passa **Gira qui**.
GREEN: passano soltanto `fits` e `tight`; stessa funzione della pillola.

### F3-RED-02 — Chat non è “text generation”

RED: ogni `text-generation` passa anche senza conversational/chat template.
GREEN: passa tag `conversational` OR `hasChatTemplate`; pipeline da sola non
basta.

### F3-RED-03 — Code è un'euristica dichiarata

RED: una facet inesistente viene presentata come metadata HF.
GREEN: helper deterministico testato su tag/ID noti, label “Orientato al
codice”, nessun claim canonico.

### F3-RED-04 — Q4 viene dai file

RED: repository con “Q4” nel nome ma nessun sibling Q4 passa; repo senza Q4
nel nome ma con sibling Q4 fallisce.
GREEN: il secondo passa, il primo no.

### F3-RED-05 — licenza fail-closed

RED: assente, OpenRAIL, Llama, `other`, custom o `cc-by-4.0` passano come
permissive.
GREEN: soltanto allowlist esatta e dichiarata passa; case/alias sono
normalizzati in modo esplicito e testato.

### F3-RED-06 — AND fra filtri

RED: attivare Code+Fits produce un'unione o perde uno dei vincoli.
GREEN: ogni riga soddisfa tutti i filtri attivi; scenario 30B permanente.

### F3-RED-07 — provider non scompare

RED: selezionare un publisher riduce i risultati e rimuove l'opzione dal
select, lasciando una label generica.
GREEN: opzioni da `store.results` non filtrati + selezione; nome stabile e i18n.

### F3-RED-08 — zero risultati azionabile

RED: lista vuota senza spiegazione o controlli fuori schermo.
GREEN: conteggio zero, frase contestuale e **Reimposta filtri** con touch target
48dp.

### F3-RED-09 — filtri a capo

RED: chip/select producono scroll orizzontale o taglio a 360px.
GREEN: wrapping verticale, ordine stabile e `scrollWidth <= clientWidth`.

### F3-RED-10 — token HF in una sola area

RED: credential form appare in Locale e Provider.
GREEN: solo Provider e accessi; Locale espone al massimo stato/access link, non
input segreto.

### F3-RED-11 — nessun segreto nel DOM/store

RED: token salvato appare in HTML, state serializzato o errore.
GREEN: soltanto boolean/status; valore rimane nel secure store esistente.

### F3-RED-12 — download label vera

RED: UI dice “download” o “totali” sul campo rolling.
GREEN: “ultimi 30 giorni” in entrambe le lingue e test di copy.

## 5. Ordine TDD eseguibile

1. Scrivere e far fallire policy licenza F3-RED-05.
2. Implementare `licensePolicy.ts` puro, senza regex permissiva unica.
3. Scrivere e far fallire F3-RED-01…06 in `browseFilters.test.ts`.
4. Migrare filtri ai dati normalizzati e al verdict centrale.
5. Scrivere F3-RED-07…09 a livello helper/componente/E2E.
6. Correggere derivazione provider, wrapping e empty state.
7. Scrivere F3-RED-10…12; creare access card e spostare il form.
8. Eseguire upstream, regressioni, build e prova fisica.

## 6. Comandi di prova

Da `mobile/`:

```powershell
npx vitest run tests/unit/models/licensePolicy.test.ts tests/unit/models/browseFilters.test.ts tests/unit/models/huggingFaceBrowse.test.ts tests/unit/models/huggingFaceClient.test.ts tests/unit/models/huggingFaceDiscovery.test.ts tests/unit/models/presentation.test.ts
npx vitest run tests/unit/models/TalosMobileHuggingFaceAccessCard.test.ts tests/unit/stores/localModels.test.ts tests/unit/components/localModelsSection.test.ts tests/unit/models/TalosMobileModelLabHub.test.ts tests/unit/screens/settingsModelsScreens.test.ts tests/unit/theme/modelLabThemeTokenContract.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts
$env:TALOS_RUN_HF_UPSTREAM='1'; npx vitest run tests/integration/huggingFaceBrowseUpstream.integration.test.ts; Remove-Item Env:TALOS_RUN_HF_UPSTREAM
npx playwright test tests/e2e/mobile-model-lab-filters.e2e.spec.ts tests/e2e/mobile-model-lab-navigation.e2e.spec.ts --workers=1
npm run typecheck
npm run test:unit
npm run build
```

Da root:

```powershell
git diff --check
git diff --name-only
git status --short
```

## 7. Pin upstream

Usare la stessa OpenAPI e le stesse revision della Fase 1. Il live gate deve
provare almeno:

- Qwen3.5-4B: conversational/chat template/Q4 sibling;
- un modello text-generation privo di chat evidence: non passa Chat;
- license metadata dichiarato e valore assente;
- campo downloads rolling.

Se un modello volatile non è stabile, si aggiunge una fixture pin con revision e
motivazione prima di cambiare il test; non si indebolisce la semantica.

## 8. Cancello visivo fisico

File obbligatori:

1. `phase-3/filters-combined-results.png` — almeno due filtri attivi, risultati
   tutti conformi e controlli interi;
2. `phase-3/filters-empty-provider-stable.png` — zero-state, provider selezionato
   ancora visibile e reset;
3. `phase-3/hugging-face-access-card.png` — pagina Provider, card token manuale,
   nessun valore segreto;
4. `phase-3/manifest.md`.

Verifica a 360×792 CSS px: nessun chip tagliato, nessuno scroll orizzontale,
label italiane complete, touch target, focus e tema coerenti. Prima di salvare
gli screenshot il campo token deve essere vuoto e qualunque identità personale
deve essere esclusa.

Solo PNG freschi della build verificata permettono `GREEN DEVICE` e poi
`IMPLEMENTED`.

## 9. Prova umana e one-up

Domanda: “se attivo Chat + Q4 + Gira qui, ogni risultato è davvero una Q4 da
chat che RAM e disco di questo telefono possono sostenere?”

One-up L2: PocketPal offre filtri e dettaglio file; TALOS rende il fit live una
facet combinabile e conserva una semantica licenza fail-closed, con stato zero
risultati recuperabile.

## 10. Rollback

La policy licenze e i helper sono puri e possono essere disattivati tornando a
mostrare tutti i risultati, mai tornando a classificare unknown/restricted come
permissive. Il form token può essere rimontato temporaneamente solo su richiesta
owner, mantenendo invariato secure storage. Nessun rollback tocca route o
capienza delle fasi precedenti.

## 11. Registro emendamenti

Nessun emendamento al momento della stesura.
