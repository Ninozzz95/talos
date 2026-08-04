# Model Lab mobile — Fase 1: capienza e variante Hugging Face

Data: 2026-08-04
Owner: main agent della lane mobile
Stato: IMPLEMENTED — review risolta, gate automatizzati/upstream/device verdi
Dipendenze: nessuna fase del nuovo piano
Specifica: `../specs/2026-08-04-model-lab-mobile-hub-design.md`
Ricerca/pin: `../research/2026-08-04-model-lab-mobile-hub-research.md`
Piano master: `../plans/2026-08-04-model-lab-mobile-hub-plan.md`

## 1. Obiettivo e confine

Completare senza scartarlo il WIP che rende il disco un vincolo distinto dalla
RAM. Tutti i percorsi di lista, filtro, catalogo, dettaglio e tool devono usare
lo stesso verdetto discriminato. La lista Hugging Face deve giudicare una
variante Q4 rappresentativa e dichiarare se il peso è esatto o stimato.

Non si modifica navigazione, struttura hub, OAuth, desktop o runtime download.

## 2. Stato osservato da preservare

HEAD di ricognizione: `f7a88a599e48` su `lane/talos-mobile`.

Modifiche preesistenti, ownership dell'utente/sessione precedente:

1. `mobile/src/lib/models/browseFilters.ts`
2. `mobile/src/lib/models/catalogue.ts`
3. `mobile/src/lib/models/fit.ts`
4. `mobile/src/lib/models/fitBadge.ts`
5. `mobile/src/lib/models/sizeFromName.ts`

Non usare reset, checkout, stash distruttivo o riscrittura wholesale. Prima
dell'implementazione si registra il diff corrente; ogni sovrapposizione viene
integrata intenzionalmente.

Baseline RED osservata, da riprodurre:

- typecheck: import `talosEstimatedBand` eliminato, storage nullable e firma
  `TalosFilterDevice` non migrati;
- suite focalizzata: 61 passati, 3 falliti;
- 30B passa erroneamente il filtro Fits;
- Code+Fits include erroneamente lo stesso 30B;
- `sizeFromName.test.ts` chiama un export non più presente.

## 3. Inventario esatto dei file

### Creare

1. `mobile/src/lib/models/browseVariant.ts`
2. `mobile/tests/unit/models/browseVariant.test.ts`
3. `mobile/tests/fixtures/huggingface/qwen35-4b-list.json`
4. `mobile/tests/fixtures/huggingface/qwen25-32b-paths-info.json`
5. `mobile/tests/fixtures/huggingface/llama31-70b-paths-info.json`
6. `mobile/tests/integration/huggingFaceBrowseUpstream.integration.test.ts`
7. `mobile/docs/superpowers/evidence/model-lab/README.md`
8. `mobile/docs/superpowers/evidence/model-lab/phase-1/storage-first.png`
9. `mobile/docs/superpowers/evidence/model-lab/phase-1/memory-after-storage.png`
10. `mobile/docs/superpowers/evidence/model-lab/phase-1/manifest.md`
11. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-1-capacity-ledger.md`
12. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-2-hub-navigation-theme-ledger.md`
13. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-3-hugging-face-filters-ledger.md`
14. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-4-mobile-coherence-catalog-ledger.md`
15. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-5-provider-oauth-ledger.md`
16. `mobile/docs/superpowers/plans/2026-08-04-model-lab-mobile-hub-plan.md`
17. `mobile/docs/superpowers/research/2026-08-04-model-lab-mobile-hub-research.md`
18. `mobile/docs/superpowers/specs/2026-08-04-model-lab-mobile-hub-design.md`

### Modificare

19. `mobile/src/lib/models/browseFilters.ts`
20. `mobile/src/lib/models/catalogue.ts`
21. `mobile/src/lib/models/fit.ts`
22. `mobile/src/lib/models/fitBadge.ts`
23. `mobile/src/lib/models/sizeFromName.ts`
24. `mobile/src/lib/models/huggingFace.ts`
25. `mobile/src/lib/models/modelTools.ts`
26. `mobile/src/services/deviceCapacity.ts`
27. `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
28. `mobile/src/components/talos/models/TalosModelFitBar.vue`
29. `mobile/src/i18n/locales/it.ts`
30. `mobile/src/i18n/locales/en.ts`
31. `mobile/tests/unit/models/browseFilters.test.ts`
32. `mobile/tests/unit/models/catalogue.test.ts`
33. `mobile/tests/unit/models/modelFit.test.ts`
34. `mobile/tests/unit/models/fitBadge.test.ts`
35. `mobile/tests/unit/models/fitBar.test.ts`
36. `mobile/tests/unit/models/sizeFromName.test.ts`
37. `mobile/tests/unit/models/huggingFaceBrowse.test.ts`
38. `mobile/tests/unit/models/modelTools.test.ts`
39. `mobile/tests/unit/models/huggingFaceClient.test.ts`
40. `mobile/tests/unit/services/deviceCapacity.test.ts`
41. `mobile/tests/unit/components/localModelsSection.test.ts`
42. `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`
43. `mobile/docs/superpowers/INDEX.md`

### Ispezionare e regredire senza modifica risultante

44. `mobile/src/stores/localModels.ts`
45. `mobile/tests/unit/stores/localModels.test.ts`
46. `mobile/tests/unit/i18n/localization.test.ts`
47. `mobile/tests/unit/i18n/localizationCoverage.test.ts`

### Eliminare

Nessun file.

Qualunque file non elencato richiede un emendamento datato in questo ledger
prima della modifica, con il motivo per cui l'ispezione ha invalidato
l'inventario.

## 4. Contratti e simboli pubblici

### Nuovi

- `TalosCapacityState = 'unknown' | 'fits' | 'tight' |
  'memory-blocked' | 'storage-blocked'`
- `TalosCapacityUnknownReason = 'model-size' | 'memory-measurement' |
  'storage-measurement'`
- `TalosCapacityVerdict` come unione discriminata da `state`
- `TalosBrowseVariantSource = 'sibling-lfs' | 'parameter-estimate' |
  'name-estimate'`
- `TalosBrowseVariant`
- `TALOS_MOBILE_QUANTISATION_ORDER`
- `talosSelectMobileBrowseVariant(model)`
- `talosEstimateGgufBytesFromParameters(parameters, quantisation)`
- `talosNormaliseStorageMeasurement(value)`

### Modificati intenzionalmente

- `TalosDeviceCapacity.freeStorageBytes` resta `number | null`;
- `TalosCapacityVerdict` non assume più che misura assente significhi fit;
- `TalosHuggingFaceModel.gguf.fileBytes` viene sostituito da
  `repositoryFileBytes` e non alimenta il fit della variante;
- `TalosHuggingFaceModel` aggiunge `siblings`, `hasChatTemplate` e la variante
  normalizzata necessaria alla browse list;
- `talosEstimatedCapacity()` restituisce sempre il discriminante centrale;
- `talosFitBadge()` accetta il verdetto, non una ricostruzione parallela di
  band/limit/byte;
- `talosModelPassesFilter()` e `talosApplyBrowseFilters()` ricevono lo stesso
  `TalosFilterDevice | null`.
- `talosBrowseCapacitySize()` sceglie la stessa variante o fallback legacy per
  riga, filtro e badge senza inventare una Q4 quando il client ha già dichiarato
  `browseVariant: null`.

### Rimossi intenzionalmente

- `talosEstimatedBand`: la decisione non appartiene a `sizeFromName.ts`.

Tutti i chiamanti e test vengono migrati nello stesso slice; non si reintroduce
un alias di compatibilità che giudica soltanto la RAM.

### Simboli compatibili da preservare

- `TalosModelShape`, `TalosDeviceCapacity`, `TalosModelFit`;
- `talosModelFit`, `talosKvCacheBytes`, `talosMaxContextFor`;
- `talosStorageShortfall`, `TALOS_STORAGE_RESERVE_BYTES`,
  `TALOS_TIGHT_HEADROOM_BYTES`;
- `talosEstimateSizeFromName` come stima di peso, non verdetto;
- `TalosHuggingFaceClient`, `talosCreateHuggingFaceClient` e metodi esistenti;
- API pubblica dello store `localModels` e namespace delle credenziali HF.

## 5. Scenari RED → GREEN permanenti

### F1-RED-01 — storage sconosciuto non è successo

RED: `freeStorageBytes = null` produce una pillola positiva e passa **Gira
qui**.
GREEN: verdict `unknown/storage-measurement`, label **Da verificare**, filtro
positivo falso; il download nativo resta fail-closed.

### F1-RED-02 — storage precede RAM

RED: un file oltre spazio+riserva viene giudicato dalla sola RAM.
GREEN: `storage-blocked`, byte mancanti e barra contro lo spazio allocabile;
fixture Llama 70B.

### F1-RED-03 — RAM dopo storage

RED: un file che entra sul disco ma eccede la memoria riceve testo ambiguo.
GREEN: `memory-blocked`, barra contro RAM utilizzabile; fixture Qwen 32B.

### F1-RED-04 — filtro e badge divergono

RED: 30B passa Fits mentre la riga lo rifiuta; Code+Fits eredita la divergenza.
GREEN: entrambi consumano lo stesso verdict e il modello non passa.

### F1-RED-05 — riserva unica

RED: catalogo confronta solo `fileBytes` mentre fit/download tengono 1 GiB.
GREEN: un telefono con 700 MiB di margine rifiuta in tutti i percorsi per lo
stesso shortfall.

### F1-RED-06 — zero plugin non è zero disco

RED: `deviceCapacity.ts` propaga `0` come misura autorevole.
GREEN: zero, negativo, NaN e infinito diventano `null`; valore positivo resta
invariato.

### F1-RED-07 — `totalFileSize` non è Q4

RED: Qwen3.5-4B usa 8.424.393.632 byte per una Q4_K_M da 2.740.937.888.
GREEN: selector sceglie Q4_K_M dai sibling e preserva separatamente il totale
repository. Nella risposta browse corrente i sibling portano soltanto il nome:
il peso viene quindi stimato dai 4.205.751.296 parametri e marcato
`parameter-estimate`. `sibling-lfs` è usato soltanto quando il boundary riceve
davvero byte positivi; `paths-info` resta l'autorità esatta nel dettaglio.

### F1-RED-08 — fallback marcato

RED: un repo senza sibling LFS presenta una stima come misura.
GREEN: source `parameter-estimate` o `name-estimate`, prefisso/label stimato e
verdetto unknown se nessuna stima affidabile esiste.

### F1-RED-09 — barra disegna il limite corretto

RED: colore/testo parla di disco ma ratio usa RAM.
GREEN: storage-blocked usa `(file+riserva)/storage`; memory-blocked usa
`working/usableRam`; `unknown` non disegna un rapporto fittizio.

### F1-RED-10 — client upstream shape drift

RED: una risposta senza array sibling o con numeri non positivi entra nel
contratto.
GREEN: parser shape-safe, fallback esplicito, fixture pin e test live opt-in.

### F1-RED-11 — filtro e riga usano la stessa variante

RED: la riga usa `browseVariant`, ma **Gira qui** ristima dal nome e può
nascondere una riga verde o includerne una rossa.
GREEN: un solo selector di byte alimenta entrambi; `browseVariant: null` resta
unknown, mentre soltanto una riga legacy senza il campo può usare il fallback
dal nome.

### F1-RED-12 — shard contigui e totale coerente

RED: due indici distinti bastano a dichiarare completo un set `0,2 of 2`, e un
mix `of-2/of-3` può essere sommato come misura esatta.
GREEN: ogni shard dichiara lo stesso totale e gli indici sono esattamente
`1…N`; altrimenti la variante non viene offerta.

### F1-RED-13 — una variante è davvero GGUF

RED: un file breve di metadati che contiene `Q4_K_M` nel nome può battere il
vero `.gguf`.
GREEN: soltanto path con estensione `.gguf` entrano nel ranking.

### F1-RED-14 — `paths-info` è un boundary shape-safe

RED: payload non-array, righe non-oggetto, byte non positivi/non finiti e oid
non SHA entrano per cast nel contratto esatto.
GREEN: payload non-array produce lista vuota; righe senza path o byte positivi
sono scartate; digest non valido diventa `null`, mai checksum inventato.

### F1-RED-15 — set incompleto non riceve un fit positivo

RED: il dettaglio calcola **Gira bene** sui byte dei soli shard presenti e poi
avverte che ne mancano altri.
GREEN: un set incompleto riceve verdict unknown/model-size e conserva il warning
e il blocco download.

### F1-RED-16 — ordinamento indipendente dalla locale

RED: candidati di uguale lunghezza passano da `localeCompare` e possono
cambiare scelta tra locale italiana, inglese o sistema.
GREEN: tie-break Unicode per code unit, identico su ogni device.

### F1-RED-17 — il dettaglio apre la revisione vista

RED: la browse response conserva `sha`, ma il tap apre sempre `main`, creando
una finestra TOCTOU tra badge, file e download.
GREEN: il tap passa al repository lo SHA della riga; `main` resta solo fallback
quando l'upstream non ha fornito una revisione valida.

## 6. Ordine TDD eseguibile

1. Eseguire il baseline senza cambiare file.
2. Aggiungere F1-RED-01…06 ai test fit/device/filter/catalogue e confermare il
   rosso atteso.
3. Portare `TalosCapacityVerdict` alla forma discriminata e migrare
   `fitBadge.ts`/`TalosModelFitBar.vue`.
4. Migrare tutti i chiamanti; eliminare ogni import di `talosEstimatedBand`.
5. Aggiungere fixture/selector e confermare F1-RED-07…10.
6. Espandere `siblings` e normalizzare i dati HF.
7. Migrare store/UI/tool e i18n.
8. Eseguire gate focalizzati, regressioni, upstream e device.

## 7. Comandi di prova

Da `mobile/`:

```powershell
npm run typecheck
npx vitest run tests/unit/models/modelFit.test.ts tests/unit/models/fitBadge.test.ts tests/unit/models/fitBar.test.ts tests/unit/models/sizeFromName.test.ts tests/unit/models/browseVariant.test.ts tests/unit/models/browseFilters.test.ts tests/unit/models/catalogue.test.ts
npx vitest run tests/unit/models/huggingFaceBrowse.test.ts tests/unit/models/huggingFaceClient.test.ts tests/unit/models/modelTools.test.ts tests/unit/stores/localModels.test.ts tests/unit/services/deviceCapacity.test.ts tests/unit/components/localModelsSection.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts
$env:TALOS_RUN_HF_UPSTREAM='1'; npx vitest run tests/integration/huggingFaceBrowseUpstream.integration.test.ts; Remove-Item Env:TALOS_RUN_HF_UPSTREAM
npm run test:unit
npm run build
```

Da root:

```powershell
git diff --check
git status --short
git diff --name-only
```

Il test live non usa token né modifica il Hub. Se la rete/upstream non è
disponibile, la fase non oltrepassa `GREEN AUTOMATED`.

## 8. Pin upstream e gate reale

- OpenAPI SHA-256 canonico, dopo la sostituzione dei quattro default volatili
  documentati nel dossier:
  `92e1d8823c21541a993b28d0453b868bd0e42099d1090746a97ac3b84a8489f1`;
- Qwen3.5-4B revision `e87f176479d0855a907a41277aca2f8ee7a09523`;
- Qwen2.5-32B revision `2116cbb385b8ce3a4d28cf3bf1cd2039a55821a6`;
- Llama-3.1-70B revision `83fb6e83d0a8aada42d499259bc929d922e9a558`.

Il live gate confronta il fingerprint OpenAPI canonico e ID, revision, path,
byte e SHA delle fixture. ETag/hash raw dell'OpenAPI cambiano a ogni richiesta e
non sono un gate. Un drift canonico emenda il ledger; non aggiorna fixture
silenziosamente.

## 9. Cancello visivo fisico

File obbligatori:

1. `phase-1/storage-first.png` — route Locale, Llama 70B, messaggio spazio e
   barra storage;
2. `phase-1/memory-after-storage.png` — route Locale, Qwen 32B, messaggio RAM e
   barra memoria;
3. `phase-1/manifest.md` — due scenari e SHA-256.

Matrice minima: tema attivo dell'owner, modalità corrente, densità/raggio
registrati; viewport atteso 360×792. La cattura deve mostrare intera riga,
etichetta, barra e spiegazione. Non vale una fixture browser o uno screenshot
antecedente alla build.

Promozione:

- `GREEN DEVICE`: entrambi i PNG verificati, nessun overflow, vincolo e numeri
  coerenti, difetti vuoti;
- `IMPLEMENTED`: tutti gli altri gate verdi e ledger aggiornato con hash/revisione.

## 10. Prova umana e one-up

Domanda che lo screenshot deve risolvere senza interpretazione tecnica:
“devo liberare spazio o scegliere un modello che richiede meno RAM?”

Riga doctrine:

- baseline PocketPal: warning file-level RAM e storage nel dettaglio;
- one-up L2 TALOS: stesso verdict già in browse, filtro e catalogo, con misura
  live del telefono e riserva unica;
- prova: le due fixture fisiche sopra, non un claim testuale.

## 11. Rollback

Il rollback logico è disabilitare il consumo della nuova variante/tri-state e
continuare a mostrare **Da verificare**, non ripristinare il vecchio successo
RAM-only. I cinque file WIP non possono essere riportati al pre-WIP con comandi
distruttivi. Qualunque rollback viene applicato con patch chirurgica sulle sole
righe introdotte e conserva namespace store, client HF e gate nativo.

## 12. Registro emendamenti

- 2026-08-04 — L'owner ha autorizzato esplicitamente un commit locale al
  termine di ogni fase e ha vietato il push. Il piano master entra quindi
  nell'inventario della Fase 1 per sostituire il precedente divieto di commit.
  Questo non autorizza staging fuori dalla lane `mobile`, né `.codex/`, né
  commit prima del cancello fisico della fase.
- 2026-08-04 — Esecuzione avviata da HEAD
  `f7a88a599e48cb63727a4fc12f673cbecf9615fd`, branch
  `lane/talos-mobile`. Il checkout è già la lane dedicata e contiene i cinque
  file WIP elencati nella sezione 2; si lavora in place per preservarli senza
  stash, reset o ricostruzioni in un worktree privo del WIP.
- 2026-08-04 — Probe live dell'endpoint lista
  `GET /api/models?...&expand[]=siblings&expand[]=gguf&expand[]=sha` sulla
  revisione pin Qwen3.5-4B: i 28 sibling contengono `rfilename`, ma non `size`
  né `lfs`. L'endpoint modello con `blobs=true` espone invece i byte LFS, ma
  richiederebbe una chiamata per ogni riga e violerebbe il vincolo di rate-limit
  mobile. F1-RED-07 è corretto di conseguenza: selezione Q4 reale, stima da
  parametri dichiarata nel browse, misura esatta soltanto quando presente o in
  `paths-info`. Decisione upstream: ADAPT dietro selector AVM; REJECT della
  fan-out request per riga e di `totalFileSize` come peso variante.
- 2026-08-04 — L'owner ha sostituito il telefono collegato con un tablet e ha
  autorizzato l'emulazione del viewport telefonico sul nuovo dispositivo. Il
  gate resta fisico: si registrano prima `wm size`/`wm density`, si applica un
  override temporaneo equivalente a 360×792 CSS, si catturano le prove ADB e si
  ripristinano i valori originali anche in caso di fallimento. La stessa build
  viene inoltre verificata alla geometria tablet nativa; il target responsive
  telefonico non viene allentato.
- 2026-08-04 — Inventario riconciliato prima del commit con lo stato Git reale.
  Store locale, test client/store e due suite i18n erano stati ispezionati e
  regrediti ma non richiedevano patch, quindi sono passati alla lista
  “ispezionare senza modifica”. Spec, ricerca, piano master, INDEX, README
  evidenze e ledger Fasi 2–5 erano documenti di programma creati nella stessa
  sessione prima del prodotto: vengono enumerati esplicitamente e inclusi nel
  commit Fase 1 affinché il passaggio alla prossima sessione sia
  autosufficiente e non ignorato da Git.
- 2026-08-04 — Review pre-commit read-only: nessun Critical, sei Important nel
  percorso variante/filter/split/paths-info/dettaglio e un'ulteriore finestra
  TOCTOU individuata dal main agent. La fase torna a `RED REOPENED`; F1-RED-11
  …17 diventano regressioni permanenti. Il manifest e i PNG già catturati
  descrivono l'APK precedente e non possono promuovere la nuova build: dopo il
  GREEN si ricostruisce, reinstalla e ricattura sul device fisico.
- 2026-08-04 — Follow-up review read-only dopo il secondo ciclo TDD: nessun
  Critical o Important residuo. Tutti e sette i finding sono risolti e coperti
  da regressioni permanenti. L'APK precedente e le sue catture sono stati
  sostituiti, non riutilizzati.

## 13. Registro esecuzione

### Baseline RED — 2026-08-04

- `npm run typecheck`: rosso atteso con 4 errori: import rimosso in
  `TalosMobileLocalModels.vue`, due formatter ancora non nullable e firma
  `TalosFilterDevice` non migrata in `browseFilters.ts`.
- suite focalizzata su fit/filter/catalogue/badge/size/HF: 6 file, 64 test;
  61 passati e 3 falliti per le ragioni attese.
- F1-RED-04 riprodotto: il 30B passa `fits` e `code + fits`.
- migrazione dell'export rimosso riprodotta: `talosEstimatedBand is not a
  function`.
- Nessun fallimento estraneo alla baseline; il prodotto non è stato modificato
  durante questa prova.

### GREEN automatizzato e upstream — 2026-08-04

- RED di specifica: 7 file, 80 test; 18 fallimenti mirati prima del GREEN.
- Nucleo capienza GREEN: 7 file, 80/80 test.
- Contratto browse/variant HF GREEN: 3 file, 31/31 test.
- Regressione focalizzata completa Fase 1 dopo review: 15 file, 198/198 test.
- `npm run typecheck`: verde.
- `npm run test:unit`: 396 file passati, 3 skip; 3.576 test passati,
  9 skip su 3.585.
- `npm run build`: verde; parity ledger verde; chunk JavaScript iniziale
  597.055/600.000 byte, CSS iniziale 200.300/220.000 byte.
- gate live `TALOS_RUN_HF_UPSTREAM=1`: 2/2 verde; fingerprint OpenAPI
  canonico e revision/path/byte/SHA delle tre fixture verificati.
- Un primo gate OpenAPI ha rivelato che `localeCompare` rendeva il
  canonicalizzatore dipendente dalla locale. Prova comparativa sulla stessa
  risposta: ordinamento Unicode lessicografico = pin atteso
  `92e1d882...8489f1`; `localeCompare` = falso hash `06de52e2...604746`.
  Corretto il gate, non il pin upstream.
- `git diff --check`: verde; nessun path prodotto fuori da `mobile`.
- A quel checkpoint il dispositivo sostitutivo era stato rilevato ma il gate
  fisico era ancora pendente: OnePlus OPD2415, seriale `2ea6573c`, Android
  16/API 36, 2400×3392 e density 420 native. La promozione successiva è
  registrata qui sotto.

### Review RED → GREEN e promozione definitiva — 2026-08-04

- Secondo RED mirato: 9 fallimenti su 73 test per variante condivisa, shard,
  estensione GGUF, boundary `paths-info`, dettaglio incompleto e ordinamento;
  il test revisione immutabile ha fallito 1/10 separatamente.
- GREEN dei test toccati: 5 file, 83/83; regressione focalizzata completa:
  15 file, 198/198. Typecheck, unit completa, build e gate live HF sono verdi.
- Review indipendente finale: nessun Critical o Important residuo; i finding
  F1-RED-11…17 risultano risolti con test nominati.
- `npx cap sync android`: verde. `testDebugUnitTest assembleDebug
  -PtalosSideBySide`: `BUILD SUCCESSFUL`, 591 task (31 eseguiti, 560 up-to-date).

- APK side-by-side `ai.talos.dev` costruito con test Android e installato sul
  OnePlus OPD2415; SHA-256
  `94b68dbfe2ede416d321c91579e0c7945b2f72440d5c1bd4cbc4a8bb5174dc3f`.
- Geometria nativa verificata a 2400×3392/density 420. Per il gate telefono è
  stato applicato temporaneamente 1080×2376/density 480, rotazione verticale
  bloccata, ottenendo 360×792 CSS a DPR 3; size, density e rotazione automatica
  originali sono stati ripristinati e riconfermati dopo le catture.
- `storage-first.png`: ricerca reale del repo Llama 70B, circa 39 GB contro
  38 GB allocatabili; etichetta **Spazio insufficiente** e barra storage
  ispezionate a pixel originali. SHA-256
  `7515693d91baec4ec6f528782bce13265ed9cee8a41765d03c30a4c9659fca52`.
- `memory-after-storage.png`: ricerca reale del repo Qwen 32B, circa 18 GB che
  supera 3.9 GB RAM ma entra sul disco; etichetta **RAM insufficiente** e barra
  memoria ispezionate a pixel originali. SHA-256
  `0282e9eab65002c9de2b6a636aa2eee5f28a3dc7577c55f75f9c679d0912e466`.
- Tema `calm` dark, density comfortable, radius soft, UI scale large, reduced
  motion off. Nessun overflow non intenzionale, target insufficiente, segreto,
  PII o difetto visivo aperto.
- PNG e manifest non sono ignorati da Git; hash ricontrollati byte per byte.
  Tutti i gate della fase sono verdi: promossa a `IMPLEMENTED`.
- Gate pre-commit ripetuto dopo l'ultimo aggiornamento documentale: regressione
  focalizzata 15 file, 198/198; `npm run typecheck` verde; `git diff --check`,
  corrispondenza hash manifest e `git check-ignore` delle evidenze verdi.
