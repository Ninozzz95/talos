# Model Lab mobile — Fase 2: hub, navigazione e Theme Engine

Data: 2026-08-04
Owner: main agent della lane mobile
Stato: IMPLEMENTED — GREEN DEVICE (2026-08-05)
Prerequisito: Fase 1 `IMPLEMENTED`, inclusi screenshot fisici
Specifica: `../specs/2026-08-04-model-lab-mobile-hub-design.md`
Ricerca: `../research/2026-08-04-model-lab-mobile-hub-research.md`
Piano: `../plans/2026-08-04-model-lab-mobile-hub-plan.md`

## 1. Obiettivo e confine

Sostituire il pannello Model Lab a tre tab con un hub e tre pagine dedicate.
Una sola scheda dispositivo vive nell'hub. Ogni decisione visiva delle
superfici Model Lab esistenti e nuove usa token centrali derivati dal Theme
Engine.

Non si cambia la semantica dei filtri (Fase 3), non si ridisegna ancora il
dettaglio/lista a scala (Fase 4), non si implementa OAuth (Fase 5).

## 2. Inventario esatto dei file

### Creare

1. `mobile/src/components/talos/models/TalosMobileModelLabHub.vue`
2. `mobile/src/components/talos/models/TalosMobileDeviceCapacityCard.vue`
3. `mobile/src/screens/SettingsModelsScreen.vue`
4. `mobile/src/screens/SettingsModelsProvidersScreen.vue`
5. `mobile/src/screens/SettingsModelsCatalogScreen.vue`
6. `mobile/src/screens/SettingsModelsLocalScreen.vue`
7. `mobile/tests/unit/models/TalosMobileModelLabHub.test.ts`
8. `mobile/tests/unit/models/TalosMobileDeviceCapacityCard.test.ts`
9. `mobile/tests/unit/screens/settingsModelsScreens.test.ts`
10. `mobile/tests/unit/navigation/modelLabRoutes.test.ts`
11. `mobile/tests/unit/theme/modelLabThemeTokenContract.test.ts`
12. `mobile/tests/e2e/mobile-model-lab-navigation.e2e.spec.ts`
13. `mobile/docs/superpowers/evidence/model-lab/phase-2/hub-paper-light.png`
14. `mobile/docs/superpowers/evidence/model-lab/phase-2/hub-terminal-dark.png`
15. `mobile/docs/superpowers/evidence/model-lab/phase-2/providers-no-device-duplicate.png`
16. `mobile/docs/superpowers/evidence/model-lab/phase-2/manifest.md`
87. `mobile/docs/superpowers/evidence/model-lab/phase-2/sidebar-without-model-lab.png`
88. `mobile/docs/superpowers/evidence/model-lab/phase-2/settings-single-model-lab-entry.png`
91. `mobile/docs/superpowers/evidence/model-lab/phase-2/hub-tablet-native.png`

### Modificare

17. `mobile/packages/design-tokens/src/index.ts`
18. `mobile/packages/design-tokens/tests/design-tokens.test.ts`
19. `mobile/src/theme/applyDesignTokens.ts`
20. `mobile/tests/unit/theme/applyDesignTokens.test.ts`
21. `mobile/src/lib/talosThemes.ts`
22. `mobile/src/stores/theme.ts`
23. `mobile/tests/unit/theme/themeStore.test.ts`
24. `mobile/tests/unit/theme/identityFieldDisposition.test.ts`
25. `mobile/src/style.css`
26. `mobile/src/lib/mobileRoutes.ts`
27. `mobile/src/App.vue`
28. `mobile/src/screens/SettingsScreen.vue`
29. `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
30. `mobile/src/components/talos/settings/settingsTabs.ts`
31. `mobile/src/lib/navigation/viewRegistry.ts`
32. `mobile/src/components/talos/models/TalosMobileProviderRuntimePanel.vue`
33. `mobile/src/components/talos/models/TalosMobileModelCatalog.vue`
34. `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
35. `mobile/src/components/talos/models/TalosModelFitBar.vue`
36. `mobile/src/components/talos/models/TalosMobileModelAdvancedOptions.vue`
37. `mobile/src/i18n/locales/it.ts`
38. `mobile/src/i18n/locales/en.ts`
39. `mobile/scripts/verify-initial-chunk.mjs`
40. `mobile/tests/unit/build/initialChunkContract.test.ts`
41. `mobile/tests/unit/screens/settingsScreen.test.ts`
42. `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
43. `mobile/tests/unit/settings/settingsTabs.test.ts`
44. `mobile/tests/unit/navigation/viewRegistry.test.ts`
45. `mobile/tests/unit/lib/backNavigation.test.ts`
46. `mobile/tests/unit/shell/appShell.test.ts`
47. `mobile/tests/unit/models/TalosMobileProviderRuntimePanel.test.ts`
48. `mobile/tests/unit/models/TalosMobileModelCatalog.test.ts`
49. `mobile/tests/unit/models/TalosMobileModelAdvancedOptions.test.ts`
50. `mobile/tests/unit/components/localModelsSection.test.ts`
51. `mobile/tests/unit/models/fitBar.test.ts`
52. `mobile/tests/unit/i18n/localization.test.ts`
53. `mobile/tests/unit/i18n/localizationCoverage.test.ts`
54. `mobile/tests/e2e/mobile-model-lab-parity.e2e.spec.ts`
55. `mobile/tests/e2e/mobile-settings-parity.e2e.spec.ts`
56. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-2-hub-navigation-theme-ledger.md`
57. `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`
58. `mobile/tests/unit/shell/sheetChromeDedup.test.ts`
59. `mobile/tests/e2e/chatFixtures.ts`
60. `mobile/playwright.config.ts`
61. `mobile/tests/e2e/mobile-shell.e2e.spec.ts`
62. `mobile/docs/feature-parity.json`
63. `mobile/tests/unit/router/routeWiring.test.ts`
64. `mobile/tests/unit/settings/settingsGroups.test.ts`
65. `mobile/tests/unit/ui/talosThemedTabs.test.ts`
66. `mobile/upstream/desktop-ported-libs-manifest.json`
67. `mobile/src/screens/ChatScreen.vue`
68. `mobile/tests/unit/screens/chatScreen.test.ts`
69. `mobile/tests/e2e/mobile-f2-journeys.e2e.spec.ts`
70. `mobile/tests/e2e/mobile-composer-state.e2e.spec.ts`
71. `mobile/tests/e2e/mobile-chat-files.e2e.spec.ts`
72. `mobile/tests/e2e/mobile-library-all-links.e2e.spec.ts`
73. `mobile/tests/e2e/mobile-f6-tablet.e2e.spec.ts`
74. `mobile/tests/e2e/mobile-provider-model-refresh.e2e.spec.ts`
75. `mobile/tests/e2e/mobile-prompt-enhancer-slash-commands.e2e.spec.ts`
76. `mobile/tests/e2e/completionMock.ts`
77. `mobile/src/lib/chat/providers/openAiCompatibleAdapter.ts`
78. `mobile/tests/unit/chat/openAiCompatibleAdapter.test.ts`
79. `mobile/docs/superpowers/research/2026-08-04-model-lab-mobile-hub-research.md`
80. `mobile/src/components/talos/ui/TalosRowActions.vue`
81. `mobile/tests/unit/components/talosRowActions.test.ts`
83. `mobile/src/services/nativeFraming.ts`
84. `mobile/tests/unit/services/nativeFraming.test.ts`
85. `mobile/src/components/shell/TalosMobileSidebar.vue`
86. `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
89. `mobile/docs/superpowers/plans/2026-08-04-model-lab-mobile-hub-plan.md`
90. `mobile/docs/superpowers/evidence/model-lab/README.md`

### Eliminare

82. `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue`

L'eliminazione avviene solo dopo che tutti i consumer sono migrati. Un file
ulteriore richiede emendamento preventivo.

## 3. Contratti e simboli pubblici

### Theme Engine

Nuovi export centrali:

- `TalosLayoutDensityTokens`;
- `TalosComponentRadiusTokens`;
- `TALOS_LAYOUT_DENSITY_SCALE`;
- `TALOS_COMPONENT_RADIUS_SCALE`;
- `talosLayoutTokensFor(density, radius)`.

CSS applicate da `applyTalosMobileDesignTokens()`:

- `--talos-space-page`;
- `--talos-space-section`;
- `--talos-space-card`;
- `--talos-space-control`;
- `--talos-space-inline`;
- `--talos-icon-size`;
- `--talos-touch-target`;
- `--talos-radius-card`;
- `--talos-radius-control`.

`--talos-touch-target` è sempre `3rem`; non scala sotto 48dp con density
compact. `TALOS_RADIUS_SCALE` e `TALOS_DENSITY_SCALE` restano esportati e
compatibili.

### Navigazione

`TalosMobileRouteName` aggiunge:

- `settings-models`;
- `settings-models-providers`;
- `settings-models-catalog`;
- `settings-models-local`.

Nuovi componenti pubblici:

- `TalosMobileModelLabHub`;
- `TalosMobileDeviceCapacityCard`;
- i quattro screen nominati nell'inventario.

`TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB = 'models'` preserva il deep-link storico.
`models` resta nel tipo tab solo per parse/compatibilità ma viene rimosso da
`TALOS_MOBILE_SETTINGS_GROUPS` e dal `role=tablist`. Il primo pannello inline
reale diventa `ai_defaults`.

La surface `models` viene rimossa da `TALOS_VIEW_SURFACES`: le pagine non hanno
un remembered tab. `talosRememberedView` e il key storico restano genericamente
compatibili e innocui.

### Compatibilità da preservare

- `/settings?tab=models` → `replace` verso `settings-models`;
- eventi contestuali chat/composer `open-model-lab`;
- route `settings` e tutte le altre settings tab;
- componenti provider/catalogo/locale e loro API;
- lazy loading di catalogo e advanced options;
- limite bundle vigente, ristabilito nella Fase 1.

Il vecchio evento pubblico `TalosMobileSidebar.openModelLab` viene invece
rimosso intenzionalmente: il drawer espone `Impostazioni` come unico ingresso
primario e il link `Impostazioni → Model Lab` definisce la gerarchia. Le
scorciatoie contestuali dal picker, dal composer, dalla checklist e dal comando
`/model` restano perché partono dal compito che richiede la configurazione e non
duplicano la tassonomia principale.

## 4. Contratto statico Theme Engine

`modelLabThemeTokenContract.test.ts` legge l'elenco esatto:

1. `TalosMobileModelLabHub.vue`
2. `TalosMobileDeviceCapacityCard.vue`
3. `TalosMobileProviderRuntimePanel.vue`
4. `TalosMobileModelCatalog.vue`
5. `TalosMobileLocalModels.vue`
6. `TalosModelFitBar.vue`
7. `TalosMobileModelAdvancedOptions.vue`
8. `SettingsModelsScreen.vue`
9. `SettingsModelsProvidersScreen.vue`
10. `SettingsModelsCatalogScreen.vue`
11. `SettingsModelsLocalScreen.vue`

Il test fallisce su:

- colore letterale o classe palette;
- `var(--..., fallback)`;
- Tailwind visuale con spazio/raggio/durata codificati;
- `box-shadow` o `transition-duration` locale;
- focus/status non tokenizzati.

Sono ammesse soltanto dimensioni strutturali motivate nel test: percentuali,
breakpoint, griglie e troncamento. Ogni eccezione è una stringa esatta con
commento e non una regex permissiva.

## 5. Scenari RED → GREEN permanenti

### F2-RED-01 — le tre destinazioni non sono tab

RED: Model Lab espone `role=tablist` e nessuna route dedicata.
GREEN: hub con tre `RouterLink`, URL nominati e contenuto montato soltanto nella
pagina figlia.

### F2-RED-02 — deep link legacy

RED: `/settings?tab=models` apre il pannello storico o aggiunge due entry
history.
GREEN: un solo `replace` canonico verso `/settings/models`.

### F2-RED-03 — parent lineare

RED: System Back da catalogo/locale/provider torna alla chat o apre il menu.
GREEN: ogni figlia torna all'hub; hub torna a Settings tramite la stessa tavola.

### F2-RED-04 — Model Lab fuori dal tablist Settings

RED: su tablet un `RouterLink` è figlio del `role=tablist`, violando la
grammatica.
GREEN: link standalone fuori dal tablist; account/gruppi inline restano tab.

### F2-RED-05 — device una volta sola

RED: card device appare in hub e nelle pagine figlie.
GREEN: esattamente una in hub, zero in provider/catalogo/locale.

### F2-RED-06 — dati device unknown

RED: zero/null viene stampato come `0 B liberi`.
GREEN: **Da misurare**, azione di retry reale e nessun dato inventato.

### F2-RED-07 — raggi e densità centrali

RED: cambiare identity radius/density non modifica card/control spacing oppure
riduce il touch target sotto 48dp.
GREEN: token centrali cambiano in matrice; touch target resta invariato.

### F2-RED-08 — nessuna scorciatoia CSS

RED: una fixture inserisce `#FFD21E`, `rounded-xl`, `p-4` o fallback CSS in una
surface e il gate passa.
GREEN: il gate fallisce per ogni classe di violazione e passa sulle sole
espressioni token.

### F2-RED-09 — mode/preset live

RED: il passaggio Paper chiaro → Terminal scuro lascia colore/raggio/spacing
precedente in una pagina lazy.
GREEN: le proprietà calcolate cambiano senza reload e le pagine figlie ereditano
il root Theme Engine.

### F2-RED-10 — chunk boundary

RED: le nuove pagine o il catalogo entrano nella closure statica del primo
paint.
GREEN: route/surface pesanti restano dynamic entries raggiungibili e bundle
entro il limite.

### F2-RED-11 — phone e tablet Settings

RED: phone non apre l'hub o tablet perde la selezione inline preesistente.
GREEN: entrambe le grammatiche hanno navigazione/accessibilità corretta.

### F2-RED-12 — il deep link esplicito vince sul ricordo

RED: dopo aver aperto l'hub, entrare in `/settings/models/providers` e
ricaricare rimonta `/settings/models`, perché `last_route` sovrascrive la route
figlia richiesta dal browser.
GREEN: `last_route` viene ripristinata soltanto dal punto d'ingresso neutro
`/`; ogni URL Model Lab esplicito sopravvive a cold boot/reload e conserva
pagina e stato persistito.

### F2-RED-13 — registri globali senza residui del pannello

RED: la suite completa conserva l'elenco route precedente, pretende `models`
nel gruppo Settings, usa la surface tab rimossa o rileva drift non registrato
nel fork mobile di `talosThemes.ts`.
GREEN: route wiring include le quattro pagine, `models` è esplicitamente
parse-only e fuori dai gruppi/tab, il componente tabs rifiuta quella surface e
il manifest hash registra la divergenza mobile verificata contro il desktop.

### F2-RED-14 — tutti gli ingressi arrivano alle route reali

RED: checklist iniziale, picker composer, comando `/model` o viaggi provider
aprono ancora `/settings?tab=models` e dipendono dal canonicalizer legacy.
GREEN: ogni ingresso runtime usa una route nominata; chiave → Provider, scelta
modello → Catalogo, inviti generici → hub. I sette E2E adiacenti attraversano
la gerarchia e non cercano più pannello/select eliminati.

### F2-RED-15 — viaggi adiacenti seguono la UI corrente

RED: il batch esteso salta il consenso immagine, il secondo passo
dell'enhancer, il disclosure Appearance o la navigazione fra Search e Agent
Tools; onboarding e scroll tablet misurano inoltre conteggi/elementi obsoleti.
GREEN: ogni E2E compie le stesse azioni visibili richieste a una persona e il
test tablet misura il vero scrollport `settings-category-list`, non il tablist
interno non scrollabile.

### F2-RED-16 — gli E2E OpenAI parlano il protocollo corrente

RED: i viaggi File e Libreria intercettano soltanto `/v1/chat/completions`,
mentre l'adapter OpenAI invia testo e tool a `/v1/responses`; Playwright lascia
quindi uscire la richiesta reale e i test ricevono un 401 invece della fixture.
GREEN: il mock condiviso riconosce il body Responses, restituisce gli eventi
SSE e gli `output[]` propri di quel protocollo, e il viaggio Libreria riconosce
`function_call_output` nel secondo turno. Le fixture compatibili
`chat/completions` restano supportate.

### F2-RED-17 — `/responses` conserva gli allegati autorizzati

RED: il viaggio reale File prova che `responsesCompletionData()` riduce ogni
turno utente alla sola stringa `content`; `parts` viene ignorato e OpenAI non
riceve né il documento estratto né l'immagine autorizzata, pur vedendoli nella
UI. GREEN: un test unitario caratterizza il wire esatto con `input_text` e
`input_image`; l'adapter conserva testo/documento/immagine nel messaggio
Responses senza campi privati AVM, e l'E2E verifica lo stesso payload dal
composer fino alla route provider.

### F2-RED-18 — il menu di riga resta sopra il dialogo che lo apre

RED: dentro Media (layer 95), `TalosRowActions` teleporta il proprio menu al
`body` su layer 90; focus e ruoli esistono, ma ogni tap su una voce viene
intercettato dal dialogo davanti. GREEN: il popup condiviso vive sul layer 110,
sopra dialoghi/viewer (95) e select (100) ma sotto il lock screen (120); unit
contract ed E2E provano rispettivamente lo stacking dichiarato e il tap reale
su `menuitemcheckbox`.

### F2-RED-19 — la barra di stato segue il tema applicato

RED: la prova fisica Paper/chiaro mostra sfondo chiaro dietro la status bar ma
ora, batteria e icone restano bianchi. `main.ts` configura il framing soltanto
al bootstrap dalla preferenza di sistema; `setTheme()`, `setMode()` e un cambio
live del sistema riapplicano il DOM ma non il chrome Android. GREEN: ogni
`applyCurrent()` dello store inoltra al plugin lo schema effettivamente risolto
e il `--background` appena applicato. Un test permanente prova il cambio live
scuro → chiaro; una nuova APK sul dispositivo API 36 deve mostrare icone scure
su Paper/chiaro e chiare su Terminal/scuro.

### F2-RED-20 — un solo ingresso primario al Model Lab

RED: il drawer principale mostra sia `Laboratorio modelli` sia `Impostazioni`,
mentre il Centro impostazioni contiene un secondo link allo stesso hub. La
stessa destinazione appare quindi come figlia e come peer del proprio parent.
GREEN: il drawer non renderizza né emette più `openModelLab`; espone soltanto
`Impostazioni`. Dentro il Centro impostazioni esiste esattamente un link
`settings-model-lab-link`, fuori dal tablist, che raggiunge
`/settings/models`. I collegamenti contestuali della chat restano operativi.

Test RED nominato:
`TalosMobileSidebar.test.ts — F2-RED-20 keeps Model Lab under Settings instead
of duplicating it in primary navigation`. Il viaggio permanente
`mobile-model-lab-navigation.e2e.spec.ts` deve aprire drawer → Impostazioni →
Laboratorio modelli e verificare l'assenza della voce gemella nel drawer.

## 6. Ordine TDD eseguibile

1. Scrivere F2-RED-07/08 nel package token e static gate; confermare rosso.
2. Implementare scale e default centrali; tokenizzare tutte le surface elencate.
3. Scrivere F2-RED-01…05 sulle route/hub; confermare rosso.
4. Aggiungere route/screen/hub/device e migrare App/Settings.
5. Eliminare il vecchio pannello e la surface `models` soltanto a consumer zero.
6. Scrivere F2-RED-09…15; aggiornare chunk verifier e regressioni.
7. Scrivere F2-RED-20, rimuovere il solo ingresso primario duplicato e migrare
   i viaggi E2E attraverso Impostazioni.
8. Eseguire matrice automatica, E2E, build e device.

## 7. Comandi di prova

Da `mobile/`:

```powershell
npx vitest run packages/design-tokens/tests/design-tokens.test.ts tests/unit/theme/applyDesignTokens.test.ts tests/unit/theme/themeStore.test.ts tests/unit/theme/identityFieldDisposition.test.ts tests/unit/theme/modelLabThemeTokenContract.test.ts tests/unit/services/nativeFraming.test.ts
npx vitest run tests/unit/navigation/modelLabRoutes.test.ts tests/unit/navigation/viewRegistry.test.ts tests/unit/lib/backNavigation.test.ts tests/unit/screens/settingsScreen.test.ts tests/unit/screens/settingsModelsScreens.test.ts tests/unit/settings/settingsTabs.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts tests/unit/shell/appShell.test.ts
npx vitest run tests/unit/models/TalosMobileModelLabHub.test.ts tests/unit/models/TalosMobileDeviceCapacityCard.test.ts tests/unit/models/TalosMobileProviderRuntimePanel.test.ts tests/unit/models/TalosMobileModelCatalog.test.ts tests/unit/models/TalosMobileModelAdvancedOptions.test.ts tests/unit/components/localModelsSection.test.ts tests/unit/models/fitBar.test.ts tests/unit/build/initialChunkContract.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts
npx playwright test tests/e2e/mobile-model-lab-navigation.e2e.spec.ts tests/e2e/mobile-model-lab-parity.e2e.spec.ts tests/e2e/mobile-settings-parity.e2e.spec.ts --workers=1
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

## 8. Cancello visivo fisico

File obbligatori:

1. `phase-2/hub-paper-light.png` — hub intero, Paper/light, device e tre link;
2. `phase-2/hub-terminal-dark.png` — stessa gerarchia, Terminal/dark;
3. `phase-2/providers-no-device-duplicate.png` — pagina Provider con header e
   primo contenuto, zero card dispositivo;
4. `phase-2/sidebar-without-model-lab.png` — drawer completo senza una voce
   autonoma Model Lab e con Impostazioni raggiungibile;
5. `phase-2/settings-single-model-lab-entry.png` — Centro impostazioni con un
   solo link Model Lab nella gerarchia;
6. `phase-2/hub-tablet-native.png` — hub dopo cold start alla geometria nativa
   del tablet, senza clipping e con status bar in contrasto;
7. `phase-2/manifest.md`.

Verifiche visive:

- nessun tab strip Model Lab;
- device in cima una sola volta;
- tre card chiaramente navigabili, senza clipping a 360×792;
- raggi/spazi/colori cambiano fra le due identità senza incoerenze locali;
- touch target almeno 48dp;
- Back della figlia indica e raggiunge Model Lab;
- nessun dato personale/chiave visibile.

La fase non è `IMPLEMENTED` se manca anche una sola immagine, se l'APK non
corrisponde al tree verificato o se il manifest ha difetti non vuoti.

## 9. Prova umana e one-up

Baseline concorrenti: browse/detail e provider grouping, ma superfici separate o
desktop-first. One-up L2: una IA telefonica comprensibile in quattro tocchi,
con contesto dispositivo unico e ogni decisione visuale governata dal tema.

Domanda di review: “senza conoscere TALOS, capisco dove impostare un accesso,
sfogliare modelli e gestire ciò che è sul telefono, e so sempre dove torno?”

## 10. Rollback

Le route nuove sono additive e il deep link legacy resta. Il rollback rimuove
con patch le quattro route/screen/hub e riattiva temporaneamente il consumer
storico soltanto se l'owner lo richiede; non tocca la Fase 1 né resetta i token
centrali usati altrove. L'eliminazione del vecchio pannello non avviene finché
build/E2E non provano consumer zero.

## 11. Registro emendamenti

### 2026-08-04 — stub del pannello eliminato

L'ispezione consumer-zero ha trovato in
`tests/unit/shell/sheetChromeDedup.test.ts` uno stub nominale del componente
storico, non un consumer runtime. Il file entra nell'inventario di modifica:
lo stub viene rimosso insieme al componente per impedire che un test continui a
normalizzare un simbolo non più esistente. Nessun contratto di prodotto cambia.

### 2026-08-04 — ingresso provider condiviso degli E2E

Il primo run Playwright ha fallito nel setup globale, prima dei test di fase:
`tests/e2e/chatFixtures.ts` apriva ancora
`[data-settings-tab="models"]`. Il file entra nell'inventario di modifica e
viene migrato sul percorso reale sidebar → Model Lab → Provider; la selezione
del modello passa al composer, che è il contratto già dichiarato dal prodotto
dopo la rimozione del selettore predefinito storico. Il timeout diventa lo
scenario permanente F2-RED-01/F2-RED-11 del setup condiviso.

### 2026-08-04 — seed onboarding E2E obsoleto

Il run applicativo ha mostrato il modal di prima installazione sopra Settings:
`playwright.config.ts` pre-seminava `intro_version: 2`, mentre il contratto
runtime corrente è `TALOS_MOBILE_INTRO_VERSION = 3`. Il file entra
nell'inventario e il seed del solo returning-user viene riallineato a 3; i test
dedicati al fresh install continuano a sovrascriverlo con storage vuoto. Questo
non cambia il prodotto: ripristina la precondizione dichiarata dal config. Il
rerun esteso ha poi trovato lo stesso valore 2 nel seed immersivo condiviso di
`tests/e2e/chatFixtures.ts`; viene riallineato allo stesso contratto 3, senza
saltare o chiudere il modal durante i test.

### 2026-08-04 — reload di una route figlia sovrascritto dal ricordo

Il primo corpus Playwright delle nuove route ha scoperto `F2-RED-12`: il link
hub → Provider arrivava correttamente alla pagina figlia, ma al reload
`App.vue` ripristinava sempre il `last_route` registrato dall'ingresso sidebar
e rimontava l'hub. `tests/unit/shell/appShell.test.ts` caratterizza ora entrambe
le metà del contratto: `/` continua a ripristinare l'ultima stazione, mentre un
URL figlio esplicito vince. L'E2E di parità resta la prova browser permanente.

### 2026-08-04 — consumer E2E storico e documento di parità

L'ispezione consumer-zero ha trovato due riferimenti correnti non storici.
`tests/e2e/mobile-shell.e2e.spec.ts` asseriva ancora il vecchio
`/settings?tab=models` e il tablist eliminato; entra nell'inventario e viene
migrato all'hub routato. `docs/feature-parity.json` nominava ancora il pannello
eliminato come surface attiva; entra nell'inventario e viene riallineato alle
quattro route/screen. I ledger storici restano immutati come evidenza del loro
tempo.

### 2026-08-04 — categoria Tavily corretta nel viaggio Settings

`tests/e2e/mobile-settings-parity.e2e.spec.ts` cercava il controllo Tavily in
`ai_defaults`, ma la tassonomia prodotto lo espone nella categoria `search`.
Il test viene corretto sulla categoria reale; nessun codice prodotto cambia e
lo scenario continua a provare il confine browser ufficiale di Tavily.

### 2026-08-04 — chiusura registri emersa dalla suite completa

Il primo `npm run test:unit` completo (3.598 test) ha portato alla luce quattro
contratti non coperti dai run focalizzati: route wiring, copertura gruppi
Settings, fixture del tab condiviso e pin del fork desktop. Entrano
nell'inventario i tre test da riallineare e
`upstream/desktop-ported-libs-manifest.json`. Il desktop a revisione congelata
`76a0aa9` è stato ricontrollato: conserva i soli raggi letterali e non possiede
la scala di densità mobile. La decisione upstream è quindi **adapt** nel fork
mobile tramite `@talos-mobile/design-tokens`, con nuovo hash e motivazione
esplicita; nessun file della lane desktop viene modificato.

### 2026-08-04 — ingressi chat ed E2E adiacenti

La ricerca consumer-zero successiva ha trovato quattro ingressi runtime in
`ChatScreen.vue` e sette spec E2E ancora ancorati al pannello eliminato. Entrano
nell'inventario lo screen, il suo test unitario e le sette spec. La migrazione
non cambia le capacità provate: sostituisce l'indirezione legacy con route
nominate e la selezione predefinita con la card reale del Catalogo. Il
canonicalizer `/settings?tab=models` resta coperto solo dal test legacy
dedicato, come compatibilità in ingresso e non come navigazione interna.

### 2026-08-04 — batch E2E esteso e contratti UI già evoluti

Il batch dei sette spec ha prodotto 22 verdi e otto rossi. L'ispezione degli
snapshot ha escluso regressioni Model Lab: i rossi descrivevano interazioni
visibili già cambiate e non aggiornate nei test. Il consenso immagine è
obbligatorio, l'enhancer apre prima la configurazione, Appearance nasconde le
opzioni avanzate nel disclosure, onboarding mostra cinque indicatori, Tavily è
in Search ma i permessi sono in Agent Tools. Il test tablet interrogava il
`tablist` interno invece del vero scrollport `settings-category-list`. Questi
viaggi vengono riallineati senza bypass, `force` o mutazioni dirette dello
storage, così continuano a rappresentare un utente umano.

### 2026-08-04 — mock E2E rimasto sul precedente endpoint OpenAI

Il secondo run del batch esteso ha isolato due 401 non causati dal Model Lab:
`mobile-chat-files` e `mobile-library-all-links` registravano la sola route
`/v1/chat/completions`, ma l'adapter OpenAI corrente usa intenzionalmente
`/v1/responses` per far convivere tool e ragionamento. Entra nell'inventario
`tests/e2e/completionMock.ts`: il mock viene reso bilingue per i due protocolli,
senza riportare il prodotto al vecchio endpoint. Lo stesso run ha mostrato due
derive puramente procedurali: l'enhancer deve inviare tramite il controllo
visibile e l'intro deve attraversare Modello, Autonomia e Background prima
della CTA. Entrambe restano dentro F2-RED-15.

### 2026-08-04 — allegati persi dal wire Responses

Dopo aver corretto l'intercettazione, `mobile-chat-files` ha raggiunto il mock
ma il payload catturato conteneva soltanto la richiesta testuale. L'ispezione
ha isolato il difetto in `responsesCompletionData()`: il ramo OpenAI nuovo non
serializzava `turn.parts`, mentre quello OpenAI-compatible storico lo faceva.
Entrano nell'inventario adapter, test unitario e dossier di ricerca. La fonte
ufficiale Responses verificata il 2026-08-04 richiede blocchi `input_text` e
`input_image` con `image_url` stringa; decisione **ADAPT** dietro l'adapter AVM,
senza esporre `attachmentId`, grant, URI Vault o SHA al provider.

### 2026-08-04 — menu azioni dietro il pannello Media

Il viaggio File ha superato F2-RED-17 e poi si è bloccato su un tap reale:
`TalosRowActions` teleporta il popup al `body` con `z-[90]`, mentre
`TalosMobileChatMediaPanel` è un dialogo fixed a `z-[95]`. Il menu era dunque
presente per accessibilità e tastiera ma fisicamente dietro il pannello. Entrano
nell'inventario componente e unit contract. Secondo CSS Positioned Layout 3,
i box fixed formano stacking context e `z-index` ne determina il painting order;
la decisione è **ADAPT** la scala già in uso: popup 110, sotto il lock screen
120 e sopra dialoghi 95/select 100. Nessuna modifica desktop.

### 2026-08-04 — chrome Android non sincronizzato col tema live

Il primo screenshot obbligatorio Paper/chiaro della fase 2 ha reso quasi
invisibili ora e icone della status bar. La mappatura `Style.Dark`/`Style.Light`
esistente è coerente con `@capacitor/status-bar` 8, ma viene eseguita soltanto
una volta in `main.ts` usando `prefers-color-scheme`: il cambio tema successivo
non la richiama. Entrano nell'inventario il servizio e il suo test, mentre
store e relativo test erano già previsti. La documentazione ufficiale
Capacitor 8 precisa inoltre che su Android 16 `backgroundColor` e
`overlaysWebView` non hanno più effetto per l'edge-to-edge obbligatorio; resta
supportato `setStyle`. La guida Android richiede esplicitamente icone di sistema
in contrasto col contenuto retrostante. Decisione **ADAPT**: conservare i due
setter come compatibilità per Android precedenti, ma sincronizzare `setStyle`
ad ogni applicazione del tema risolto. Nessun file Android nativo e nessun file
desktop vengono modificati.

### 2026-08-05 — Model Lab duplicato nel drawer e in Impostazioni

La prova umana dell'owner ha rilevato che il vecchio ingresso Model Lab del
drawer è sopravvissuto alla nuova gerarchia. L'hub era quindi raggiungibile sia
come peer di Impostazioni sia come suo figlio, contraddicendo il percorso
approvato `Impostazioni → Model Lab`. Entrano nell'inventario
`TalosMobileSidebar.vue` e il suo test unitario; `App.vue` e gli E2E coinvolti
erano già inventariati.

La guida Android corrente sulle impostazioni raccomanda di collocare le
preferenze contestuali vicino alla funzione interessata e, quando esiste una
navigazione laterale, di esporre `Settings` come destinazione ordinata dopo le
altre. La guida sui pattern di navigazione riserva drawer/bar/rail alle
destinazioni primarie dello stesso livello gerarchico. Decisione **ADAPT**:
`Impostazioni` resta l'unico parent primario nel drawer; Model Lab resta una
route figlia con link unico nel Centro impostazioni, mentre composer, picker,
checklist e `/model` conservano scorciatoie contestuali. Nessun package, file
desktop o protocollo cambia.

Il primo run browser dopo il GREEN unitario ha prodotto un'apparente
contraddizione: il test dedicato vedeva il drawer nuovo, mentre un test shell
vedeva ancora la voce rimossa. La causa era `vite preview` con
`reuseExistingServer` sopra un `dist` precedente. Dopo `npm run build`, lo
stesso corpus è passato 20/20 e il batch esteso 37/37. La prova valida è quindi
sempre quella su bundle rigenerato; il run stale resta registrato e non viene
conteggiato come evidenza prodotto.

### 2026-08-05 — prova tablet nativa dopo il reset del viewport telefono

Il protocollo richiedeva sia il viewport telefono sia il layout nativo del
tablet. La prima cattura immediatamente successiva a `wm size reset` e
`wm density reset` ha fotografato il breve riavvio configurazione Android,
prima che il framing nativo venisse riapplicato, con icone di status bar ancora
chiare. Non è stata promossa. Un cold start della stessa APK ha riprodotto
Paper/chiaro con icone scure e layout tablet stabile; entra quindi
`hub-tablet-native.png` nell'inventario e nel cancello. Geometria finale
riconfermata: 2400×3392, density 420, nessun override residuo.

## 12. Chiusura implementativa osservata

Data gate: 2026-08-05. Base Git incorporata nella build:
`3b6a4fbc2e051b5f2769eed4176353c91174b50b`, più i dirty path prodotto elencati
nel manifest di fase.

- RED permanente F2-RED-20 provato: 1 test falliva sulla voce Model Lab nel
  drawer; GREEN dopo la rimozione dell'emit e del consumer App.
- unit focalizzati di shell/Settings/route: 71/71;
- E2E browser sul bundle rigenerato: 37/37 nel batch esteso;
- suite unitaria completa fresca: 401 file passati, 3 saltati; 3593 test
  passati, 9 saltati (3602 totali);
- `npm run build`: GREEN; JavaScript iniziale 599681/600000 byte, CSS
  203928/220000 byte, parity gate GREEN;
- `npx cap sync android`: GREEN, 15 plugin;
- Gradle `testDebugUnitTest assembleDebug -PtalosSideBySide`: GREEN, 591 task;
- APK `ai.talos.dev`: 31103284 byte, SHA-256
  `b6a24bc695127aaf912719f6a4d102e3f484aef71ddecc8d73fd32438406aa3d`;
- dispositivo fisico OnePlus OPD2415/API 36: sei PNG ispezionati in originale,
  cinque a 360×792 CSS/DPR 3 e uno a 914×1292 CSS/DPR 2.625;
- account di prova generico usato solo durante le catture telefono; preferenza
  originale ripristinata e sentinel di sessione eliminato prima del cold start;
- `wm size` e `wm density` ripristinati ai valori fisici 2400×3392/420;
- `git diff --check`: GREEN; nessun file desktop modificato.

Il dispatch reviewer separato è stato tentato con gli agenti
`019fcf25-dd5e-7091-80e9-a4d1c938ef26` e
`019fcf25-debe-7eb1-9caa-e1c51d365027`, ma il workspace li ha lasciati in
`pending_init` per esaurimento crediti; sono stati chiusi senza output. Il main
agent ha quindi eseguito l'audit sorgente, statico, automatico e fisico. Questo
non sostituisce il batch reviewer obbligatorio della Fase 5.5, che resta un gate
separato da ritentare. Difetti aperti di Fase 2: nessuno.
