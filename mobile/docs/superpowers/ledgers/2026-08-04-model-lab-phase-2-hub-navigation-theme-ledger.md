# Model Lab mobile — Fase 2: hub, navigazione e Theme Engine

Data: 2026-08-04
Owner: main agent della lane mobile
Stato: PLANNED — NON IMPLEMENTATA
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

### Eliminare

58. `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue`

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
- evento sidebar/chat `open-model-lab`;
- route `settings` e tutte le altre settings tab;
- componenti provider/catalogo/locale e loro API;
- lazy loading di catalogo e advanced options;
- limite bundle vigente, ristabilito nella Fase 1.

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

## 6. Ordine TDD eseguibile

1. Scrivere F2-RED-07/08 nel package token e static gate; confermare rosso.
2. Implementare scale e default centrali; tokenizzare tutte le surface elencate.
3. Scrivere F2-RED-01…05 sulle route/hub; confermare rosso.
4. Aggiungere route/screen/hub/device e migrare App/Settings.
5. Eliminare il vecchio pannello e la surface `models` soltanto a consumer zero.
6. Scrivere F2-RED-09…11; aggiornare chunk verifier e regressioni.
7. Eseguire matrice automatica, E2E, build e device.

## 7. Comandi di prova

Da `mobile/`:

```powershell
npx vitest run packages/design-tokens/tests/design-tokens.test.ts tests/unit/theme/applyDesignTokens.test.ts tests/unit/theme/themeStore.test.ts tests/unit/theme/identityFieldDisposition.test.ts tests/unit/theme/modelLabThemeTokenContract.test.ts
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
4. `phase-2/manifest.md`.

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

Nessun emendamento al momento della stesura.
