/** Copy owned by the settings layout. Never translate provider responses, file names or input values. */
export const SETTINGS_COPY: ReadonlyArray<readonly [string, string, string]> = [
  ['[data-settings-group="design"] > .talos-eyebrow', 'Aspetto', 'Appearance'],
  ['[data-settings-group="design"] > h3', 'Tema, testo e pannelli', 'Theme, text and panels'],
  ['[data-settings-group="design"] > p', 'Preferenze di questo browser. I messaggi e i dati del progetto restano sul server locale.', 'Browser preferences. Messages and project data stay on the local server.'],
  ['[data-settings-group="sfondo"] > .talos-eyebrow', 'Movimento', 'Motion'],
  ['[data-settings-group="sfondo"] > h3', 'Sfondo e risorse', 'Background and resources'],
  ['[data-settings-group="sfondo"] > p', 'Regola il movimento e quando sospenderlo. Il risparmio dati e le preferenze del sistema hanno la precedenza.', 'Adjust motion and when it pauses. Data-saving and system preferences take precedence.'],
  ['[data-settings-group="animazioni"] > .talos-eyebrow', 'Interazioni', 'Interactions'],
  ['[data-settings-group="animazioni"] > h3', 'Animazioni dell’interfaccia', 'Interface animation'],
  ['[data-settings-group="animazioni"] > p', 'Scegli un profilo o regola durata, intensità e parti animate.', 'Choose a profile or adjust duration, intensity and animation families.'],
  ['[data-settings-group="desktop"] > .talos-eyebrow', 'Desktop', 'Desktop'],
  ['[data-settings-group="desktop"] > h3', 'Spazio di lavoro', 'Workspace'],
  ['[data-settings-group="desktop"] > p', 'Preferenze della finestra e dello spazio di lettura.', 'Window and reading-space preferences.'],
  ['#setting-panel-tools > .talos-card > h3', 'Strumenti agente e permessi', 'Agent tools and permissions'],
  ['#setting-panel-tools > .talos-card > p', 'Regole salvate con la sessione, conservate dopo un ricaricamento.', 'Rules saved with the session and retained after reloading.'],
  ['#setting-panel-tools [data-open-sheet="permissions"]', 'Gestisci permessi', 'Manage permissions'],
  ['#setting-panel-tools [data-vaia="capability"]', 'Gestisci strumenti', 'Manage tools'],
  ['#setting-panel-providers > .talos-card > h3', 'Provider e accessi', 'Providers and access'],
  ['#setting-panel-providers > .talos-card > p', 'Stato della configurazione sul server locale. Una chiave presente non prova la connessione.', 'Configuration on the local server. A stored key does not prove connectivity.'],
  ['#setting-panel-providers [data-model-lab-go]', 'Gestisci chiavi e indirizzi', 'Manage keys and addresses'],
  ['#setting-panel-memoria > .talos-card > h3', 'Memoria e contesto', 'Memory and context'],
  ['#setting-panel-memoria > .talos-card > p:first-of-type', 'Quanto della finestra del modello è già occupato prima che tu scriva: descrizioni degli strumenti, istruzioni e ricordi. Il resto è disponibile alla conversazione.', 'Context already occupied before you write: tool descriptions, instructions and memories. The remainder is available to the conversation.'],
  ['#setting-panel-memoria > .talos-card > p:last-child', 'Il conto degli strumenti è una stima del testo dello schema, non dei token che conterà il fornitore.', 'Tool usage is an estimate of schema text, not the tokens the provider will count.'],
  ['#setting-panel-costi > .talos-card > h3', 'Costi e consumo', 'Costs and usage'],
  ['#setting-panel-costi > .talos-card > p:first-of-type', 'Consumo per giorno e modello dalle sessioni registrate su questo computer. Nessuna chiamata a un fornitore.', 'Usage by day and model from sessions recorded on this computer. No provider request is made.'],
  ['#setting-panel-costi h4:first-of-type', 'Per giorno', 'By day'],
  ['#setting-panel-costi h4:last-of-type', 'Per modello', 'By model'],
  ['#costiNota', 'Gli importi in denaro sono dichiarati dal fornitore. Qui si contano i token registrati nelle sessioni, non si stima un addebito.', 'Currency amounts are reported by the provider. This page counts recorded session tokens, not estimated charges.'],
  ['#setting-panel-privacy > .talos-card:first-child > h3', 'Sicurezza e privacy', 'Security and privacy'],
  ['#setting-panel-privacy > .talos-card:first-child > p', 'Dati locali e preferenze del profilo. I permessi della singola sessione sono in “Strumenti agente e permessi”.', 'Local data and profile preferences. Session permissions are under “Agent tools and permissions”.'],
  ['#settingsTrasferimento > h3', 'Trasferisci le preferenze', 'Transfer preferences'],
  ['#settingsTrasferimento > p:first-of-type', 'Esporta o importa un file di preferenze, oppure ripristina i valori iniziali. Queste azioni non trasferiscono le conversazioni.', 'Export or import a preferences file, or restore defaults. These actions do not transfer conversations.'],
  ['#settingsEsporta', 'Esporta in un file', 'Export to a file'],
  ['#settingsImporta', 'Importa da un file', 'Import from a file'],
  ['#settingsRipristina', 'Ripristina i valori iniziali', 'Restore defaults'],
  ['#settingsSvuotaLocali', 'Svuota le preferenze di questo browser', 'Clear this browser’s preferences'],
  ['#setting-panel-workspace > .talos-card > h3', 'File e workspace', 'Files and workspace'],
  ['#setting-panel-workspace > .talos-card > p', 'Cartella e dati della sessione corrente.', 'Folder and data for the current session.'],
  ['#setting-panel-workspace [data-open-panel="inspector"]', 'Apri l’albero dei file', 'Open the file tree'],
  ['#settingsNuovaSessioneAltrove', 'Nuova sessione in un’altra cartella', 'New session in another folder'],
  ['#setting-panel-account > .talos-card > h3', 'Configurazione e diagnostica', 'Configuration and diagnostics'],
  ['#setting-panel-account > .talos-card > p', 'Controlli e configurazione dell’agente. Il backup non è disponibile da questa pagina.', 'Agent controls and configuration. Backup is not available from this page.'],
  ['[data-td-studio-temi] .td-studio-rimando__copia strong', 'Temi e atmosfere', 'Themes and atmospheres'],
  ['[data-td-studio-temi] .td-studio-rimando__copia p', 'Palette, modalità chiara o scura e sfondi animati si regolano nello studio temi, con anteprima.', 'Adjust palettes, light or dark mode and animated backgrounds in the theme studio, with a preview.'],
];
export function localizeSettingsCopy(root: HTMLElement, language: string): void {
  for (const [selector, it, en] of SETTINGS_COPY) {
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      // Listed elements contain copy only. Do not remount forms, counters or server-rendered facts.
      const value = language === 'en' ? en : it;
      if (element.textContent !== value) element.textContent = value;
    }
  }
  const button = root.querySelector<HTMLElement>('[data-td-studio-temi] button');
  if (button) {
    const text = [...button.childNodes].find(child => child.nodeType === 3 && child.textContent?.trim());
    if (text) text.textContent = language === 'en' ? ' Open theme studio' : ' Apri studio temi';
  }
  for (const cell of root.querySelectorAll<HTMLTableCellElement>('#setting-panel-costi th')) {
    const keys = {Giorno:'Day', Sessioni:'Sessions', Giri:'Turns', Token:'Tokens', 'In cache':'Cached', Modello:'Model'};
    const original = cell.dataset.settingsLabel || cell.textContent || '';
    cell.dataset.settingsLabel = original;
    cell.textContent = language === 'en' ? keys[original as keyof typeof keys] || original : original;
  }
}
