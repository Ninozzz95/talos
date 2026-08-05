# Model Lab mobile — Fase 3: filtri e semantica Hugging Face

Data: 2026-08-04
Owner: main agent della lane mobile
Stato: IMPLEMENTED — GREEN AUTOMATED + GREEN UPSTREAM + GREEN DEVICE
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
12. `mobile/src/lib/models/providerGrouping.ts`
13. `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
14. `mobile/src/components/talos/models/TalosMobileModelLabHub.vue`
15. `mobile/src/screens/SettingsModelsProvidersScreen.vue`
16. `mobile/src/i18n/locales/it.ts`
17. `mobile/src/i18n/locales/en.ts`
18. `mobile/tests/unit/models/browseFilters.test.ts`
19. `mobile/tests/unit/models/huggingFaceBrowse.test.ts`
20. `mobile/tests/unit/models/providerGrouping.test.ts`
21. `mobile/tests/unit/components/localModelsSection.test.ts`
22. `mobile/tests/unit/models/TalosMobileModelLabHub.test.ts`
23. `mobile/tests/unit/screens/settingsModelsScreens.test.ts`
24. `mobile/tests/unit/theme/modelLabThemeTokenContract.test.ts`
25. `mobile/tests/integration/huggingFaceBrowseUpstream.integration.test.ts`
26. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-3-hugging-face-filters-ledger.md`
27. `mobile/docs/superpowers/research/2026-08-04-model-lab-mobile-hub-research.md`
28. `mobile/docs/superpowers/plans/2026-08-04-model-lab-mobile-hub-plan.md`
29. `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`

### Eliminare

Nessun file.

Qualunque aggiunta richiede un emendamento preventivo. In particolare, non si
crea un secondo store credenziali prima della Fase 5.

I seguenti file restano gate regressivi ma non richiedono modifiche secondo
l'ispezione corrente: `huggingFaceClient.test.ts`,
`huggingFaceDiscovery.test.ts`, `presentation.test.ts`,
`localModels.test.ts`, i due test i18n e
`mobile-model-lab-navigation.e2e.spec.ts`.

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

### F3-UPSTREAM-01 — semantica sui dati HF reali pin

RED: il gate live prova soltanto la presenza generica di risultati e non
protegge i campi che alimentano i filtri.
GREEN: sulla revision pin Qwen verifica conversational/chat template,
licenza dichiarata, rolling downloads e sibling Q4; sulla revision pin
`antirez/deepseek-v4-gguf` verifica che `text-generation` senza tag
conversational e senza chat template non passi Chat.

### F3-RED-13 — conteggi singolari leggibili

RED scoperto nel primo viaggio fisico: ogni gruppo con una sola riga mostra
“1 modelli”. GREEN: autore e totale risultati usano la forma singolare in
italiano e inglese; il test componente la rende permanente.

### F3-RED-14 — header accesso HF respirabile a 360 px

RED scoperto nella cattura fisica Provider: il badge “non configurato” occupa
la stessa riga di icona e copy, riducendo titolo e descrizione a una colonna di
circa 80 px. GREEN: a 360 px il copy mantiene almeno 200 px utili e il badge
scende sotto il copy, allineato alla seconda colonna; da `sm` in poi può tornare
in terza colonna. La geometria è protetta da E2E permanente e usa soltanto
spacing, radius, colori e touch target del Theme Engine.

## 5. Ordine TDD eseguibile

1. Scrivere e far fallire policy licenza F3-RED-05.
2. Implementare `licensePolicy.ts` puro, senza regex permissiva unica.
3. Scrivere e far fallire F3-RED-01…06 in `browseFilters.test.ts`.
4. Migrare filtri ai dati normalizzati e al verdict centrale.
5. Scrivere F3-RED-07…09 a livello helper/componente/E2E.
6. Correggere derivazione provider, wrapping e empty state.
7. Scrivere F3-RED-10…12; creare access card e spostare il form.
8. Eseguire upstream, regressioni, build e prova fisica; se la cattura scopre
   una regressione, registrarla e renderla RED prima della correzione.

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

Refresh bloccante eseguito 2026-08-05 prima del codice:

- OpenAPI canonica invariata:
  `92e1d8823c21541a993b28d0453b868bd0e42099d1090746a97ac3b84a8489f1`;
- OIDC invariato: 890 byte, ETag
  `W/"37a-dttZVZA3HSuAYFH2OCoyqXSlr3k"`, SHA-256
  `fc57107dcf0d8a09890016ea57bdde0ccda12227d49d014fbb48dbf270bae435`,
  PKCE S256 e soli auth method `client_secret_basic|client_secret_post`;
- `unsloth/Qwen3.5-4B-GGUF` revision
  `e87f176479d0855a907a41277aca2f8ee7a09523`: 28 sibling, 7 Q4,
  conversational e chat template presenti, `apache-2.0`, downloads rolling e
  all-time distinti;
- `antirez/deepseek-v4-gguf` revision
  `e7f04037032990db0346398d249baf9fb9df1ccc`: `text-generation`, nessun tag
  conversational, nessun chat template, licenza MIT;
- gate upstream pre-modifica: 2/2 verde;
- dipendenze installate uguali ai pin del dossier;
- dispositivo sostitutivo presente: OnePlus OPD2415, seriale `2ea6573c`,
  Android 16/API 36, geometria nativa 2400×3392 a density 420, nessun override.

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

### 2026-08-05 — inventario e gate upstream riconciliati

L'ispezione del tree corrente ha invalidato l'inventario iniziale prima di
qualunque edit prodotto:

- `presentation.ts`, `localModels.ts` e i rispettivi test non devono cambiare:
  il copy rolling appartiene alla UI/i18n e lo store sicuro espone già soltanto
  lo stato booleano;
- `providerGrouping.ts` è l'autorità già esistente per le opzioni publisher e
  deve ospitare `talosBrowsePublishers`, invece di creare logica locale nel
  componente;
- il gate integration esistente deve essere rafforzato per F3-UPSTREAM-01;
- dossier di ricerca e piano master devono registrare rispettivamente il
  refresh bloccante e lo stato della fase.

Decisione upstream: **ADAPT** i metadati ufficiali `cardData`,
`downloadsAllTime`, `gguf`, `siblings`, `pipeline_tag` e `tags` dietro il
normalizzatore TALOS; **REJECT** inferenze positive da pipeline/nome quando HF
offre il dato canonico. Nessun pacchetto viene aggiunto.

Il primo viaggio fisico pre-cattura ha aggiunto F3-RED-13 prima del relativo
edit: l'interfaccia era funzionale e senza overflow, ma “1 modelli” non supera
il cancello umano di coerenza linguistica.

### 2026-08-05 — difetto fisico F3-RED-14 e chiusura

La prima cattura della card HF a 360×792 ha invalidato il layout header: badge,
icona e copy sulla stessa riga lasciavano soltanto 121.375 px al testo. Il
finding è stato registrato come F3-RED-14 e il nuovo E2E è stato osservato RED
prima dell'edit. L'header ora usa una griglia responsive token-only: a 360 px il
copy misura 246 px e il badge scende sotto; a 914 px il badge torna in terza
colonna. La cattura difettosa è stata sostituita con una PNG della nuova APK.

Chiusura verificata:

- unit completi: 403 file passati + 3 skipped; 3616 test passati + 10 skipped;
- E2E Model Lab su `dist` fresco: 11/11;
- upstream Hugging Face live: 3/3;
- typecheck, parity e chunk gate: verdi; JS iniziale 599729/600000 byte, CSS
  iniziale 204327/220000 byte;
- Android: 591 task verdi, package `ai.talos.dev`, APK SHA-256
  `c6716d11f013ba9df1c5834ce145de8c79cdc2d607cb3be1883ceb1ad9fcea45`;
- prove fisiche: tre PNG ispezionate, 0 px overflow, nessun segreto/PII;
- geometria tablet ripristinata e cold start verificato a 914×1292 CSS px.

Manifest autoritativo:
`../evidence/model-lab/phase-3/manifest.md`. Difetti aperti: **nessuno**.
