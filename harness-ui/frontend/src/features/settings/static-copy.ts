/*
 * ⛔ SETTE RIGHE RITIRATE IL 19/09/2026, e ognuna con la sua prova — non «sembravano morte».
 *   Erano i sette `#setting-panel-<x> > .talos-card > h3` (tools, providers, memoria, costi,
 *   privacy, workspace, account): il selettore non pesca più **nessun elemento**, misurato su
 *   tutte e dieci le sezioni aperte una per una (`artifacts/zoom-bar/inerti.mjs`, 4174 in sola
 *   lettura). Il titolo di quelle carte lo porta ora `settings-view.ts`, in italiano **e** in
 *   inglese — ed è una prova a dirlo: `_fase2-forme.spec.mjs` FORME-05.
 *   ⛔ E la misura ha corretto la diagnosi: le righe non erano «inerti» (elemento presente con un
 *   altro testo) ma **assenti** (nessun elemento). Le altre **14** righe di questa tabella sono
 *   VIVE e restano: le spiegazioni, gli `h4` dei costi, le etichette delle azioni.
 *   ⭐ Perché si ritira solo con due segnali d'accordo (statico + runtime) e mai con uno solo:
 *   la pratica sulla rimozione del codice morto — `dead-code-eliminator` e `gh-aw/DEADCODE.md`,
 *   letti il 19/09/2026 — dice che «non trovo chi la usa» **non è una prova**. Qui i due segnali
 *   sono il selettore nel sorgente e il DOM vivo che non lo contiene in nessuno stato.
 */
import { LINGUA_PSEUDO, linguaCorrenteDiT, t } from '../../components/lingua.js';
import { TESTI } from '../../i18n/testi/index.js';
/** Copy owned by the settings layout. Never translate provider responses, file names or input values. */
export const SETTINGS_COPY: ReadonlyArray<readonly [string, string]> = [
  ['[data-settings-group="design"] > .talos-eyebrow', 'impostazioni.copy.appearance'],
  ['[data-settings-group="design"] > h3', 'impostazioni.copy.themeTextAndPanels'],
  ['[data-settings-group="design"] > p', 'impostazioni.copy.browserPreferencesMessagesAndProject'],
  ['[data-settings-group="sfondo"] > .talos-eyebrow', 'impostazioni.copy.motion'],
  ['[data-settings-group="sfondo"] > h3', 'impostazioni.copy.backgroundAndResources'],
  ['[data-settings-group="sfondo"] > p', 'impostazioni.copy.adjustMotionAndWhenIt'],
  ['[data-settings-group="animazioni"] > .talos-eyebrow', 'impostazioni.copy.interactions'],
  ['[data-settings-group="animazioni"] > h3', 'impostazioni.copy.interfaceAnimation'],
  ['[data-settings-group="animazioni"] > p', 'impostazioni.copy.chooseAProfileOrAdjust'],
  ['[data-settings-group="desktop"] > .talos-eyebrow', 'impostazioni.copy.desktop'],
  ['[data-settings-group="desktop"] > h3', 'impostazioni.copy.workspace'],
  ['[data-settings-group="desktop"] > p', 'impostazioni.copy.windowAndReadingSpacePreferences'],
  ['#setting-panel-tools > .talos-card > p', 'impostazioni.copy.rulesSavedWithTheSession'],
  ['#setting-panel-tools [data-open-sheet="permissions"]', 'impostazioni.copy.managePermissions'],
  ['#setting-panel-tools [data-vaia="capability"]', 'impostazioni.copy.manageTools'],
  /* ⛔ 23/09/2026 — le due righe di `#setting-panel-providers` sono ritirate con la sezione
     (decisione owner, «Provider e accessi» tolta del tutto): il pannello non esiste più, e un
     selettore che non pesca niente è una riga morta — la stessa ragione delle sette del 19/09. */
  ['#setting-panel-memoria > .talos-card > p:first-of-type', 'impostazioni.copy.contextAlreadyOccupiedBeforeYou'],
  ['#setting-panel-memoria > .talos-card > p:last-child', 'impostazioni.copy.toolUsageIsAnEstimate'],
  ['#setting-panel-costi > .talos-card > p:first-of-type', 'impostazioni.copy.usageByDayAndModel'],
  ['#setting-panel-costi h4:first-of-type', 'impostazioni.copy.byDay'],
  ['#setting-panel-costi h4:last-of-type', 'impostazioni.copy.byModel'],
  ['#costiNota', 'impostazioni.copy.currencyAmountsAreReportedBy'],
  ['#setting-panel-privacy > .talos-card:first-child > p', 'impostazioni.copy.localDataAndProfilePreferences'],
  ['#settingsTrasferimento > h3', 'impostazioni.copy.transferPreferences'],
  ['#settingsTrasferimento > p:first-of-type', 'impostazioni.copy.exportOrImportAPreferences'],
  ['#settingsEsporta', 'impostazioni.copy.exportToAFile'],
  ['#settingsImporta', 'impostazioni.copy.importFromAFile'],
  ['#settingsRipristina', 'impostazioni.copy.restoreDefaults'],
  ['#settingsSvuotaLocali', 'impostazioni.copy.clearThisBrowsersPreferences'],
  ['#setting-panel-workspace > .talos-card > p', 'impostazioni.copy.folderAndDataForThe'],
  ['#setting-panel-workspace [data-open-panel="inspector"]', 'impostazioni.copy.openTheFileTree'],
  ['#settingsNuovaSessioneAltrove', 'impostazioni.copy.newSessionInAnotherFolder'],
  // 01/10/2026: per chiave, non «la prima carta»: la scheda «Aggiornamenti» ora sta in testa e prendeva questo testo
  ['#setting-panel-account > [data-settings-card="account-controls"] > p', 'impostazioni.copy.agentControlsAndConfigurationBackup'],
  ['[data-td-studio-temi] .td-studio-rimando__copia strong', 'impostazioni.copy.themesAndAtmospheres'],
  ['[data-td-studio-temi] .td-studio-rimando__copia p', 'impostazioni.copy.adjustPalettesLightOrDark'],
];
/*
 * 03/10/2026, seconda ondata della lingua: le parole stanno nel dizionario (area `impostazioni`, `copy.*`). `language` resta il
 *   parametro di chi chiama (la lingua delle Impostazioni); in pseudo-lingua passa da `t()`, che marca, così lo strato 3 vede anche
 *   queste righe.
 */
const parola = (chiave: string, language: string): string =>
  linguaCorrenteDiT() === LINGUA_PSEUDO ? t(chiave) : (TESTI[language === 'en' ? 'en' : 'it'][chiave] as string);
/* Le intestazioni della tabella dei costi arrivano dal modello HTML in italiano: la parola di partenza dice quale chiave. */
const COLONNE_COSTI: Readonly<Record<string, string>> = { Giorno: 'impostazioni.copy.costsColumn.day', Sessioni: 'impostazioni.copy.costsColumn.sessions',
  Giri: 'impostazioni.copy.costsColumn.turns', Token: 'impostazioni.copy.costsColumn.tokens', 'In cache': 'impostazioni.copy.costsColumn.cached', Modello: 'impostazioni.copy.costsColumn.model' };
export function localizeSettingsCopy(root: HTMLElement, language: string): void {
  for (const [selector, chiave] of SETTINGS_COPY) {
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      // Listed elements contain copy only. Do not remount forms, counters or server-rendered facts.
      const value = parola(chiave, language);
      if (element.textContent !== value) element.textContent = value;
    }
  }
  const button = root.querySelector<HTMLElement>('[data-td-studio-temi] button');
  if (button) {
    const text = [...button.childNodes].find(child => child.nodeType === 3 && child.textContent?.trim());
    if (text) text.textContent = ` ${parola('impostazioni.copy.openThemeStudio', language)}`;
  }
  for (const cell of root.querySelectorAll<HTMLTableCellElement>('#setting-panel-costi th')) {
    const original = cell.dataset.settingsLabel || cell.textContent || '';
    cell.dataset.settingsLabel = original;
    const chiave = COLONNE_COSTI[original];
    cell.textContent = chiave ? parola(chiave, language) : original;
  }
}
