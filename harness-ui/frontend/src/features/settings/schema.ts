/** SET-01: presentation metadata only. Values and validation remain with the existing preference owner. */
export type SettingsLanguage = 'it' | 'en';
export type LocalText = Readonly<{ it: string; en: string }>;
export type SettingsSection = 'appearance' | 'chat' | 'tools' | 'memoria' | 'privacy' | 'models' | 'providers' | 'costi' | 'workspace' | 'account';
export interface LegacySettingField {
  id: string; chiave: string; titolo: string; sezione: string; gruppo: string; tipo: string;
  opzioni?: readonly (readonly string[])[]; min?: number; max?: number; unita?: string;
}
export interface SettingSearchEntry {
  id: string; section: SettingsSection; label: string; description: string;
  terms: string; kind: 'field' | 'section' | 'action'; studio: boolean;
}
export const localText = (value: LocalText, language: string): string => value[language === 'en' ? 'en' : 'it'];
const text = (it: string, en: string): LocalText => ({ it, en });
export const SETTINGS_SECTIONS: Readonly<Record<SettingsSection, { title: LocalText; description: LocalText; scope: LocalText; icon: string; keywords: string }>> = {
  appearance: { title: text('Aspetto e movimento', 'Appearance and motion'), description: text('Temi, leggibilità e movimento. Personalizza TALOS senza cambiare i dati del lavoro.', 'Themes, readability and motion. Make TALOS yours without changing your work.'), scope: text('Questo profilo', 'This profile'), icon: 'image', keywords: 'theme colore color font animation animazioni accessibilità accessibility' },
  chat: { title: text('Chat e composer', 'Chat and composer'), description: text('Imposta come leggere e scrivere. Modello e permessi restano quelli della sessione.', 'Choose how to read and write. Model and permissions remain specific to the session.'), scope: text('Profilo e sessione', 'Profile and session'), icon: 'chat', keywords: 'message messaggi invio enter input text testo font composer' },
  tools: { title: text('Strumenti agente e permessi', 'Agent tools and permissions'), description: text('Controlla cosa può fare l’agente e da dove provengono le ricerche web.', 'Control what the agent can do and where web search results come from.'), scope: text('Sessione e server', 'Session and server'), icon: 'sliders', keywords: 'tools permissions permessi policy search ricerca web duckduckgo tavily brave chiave key' },
  memoria: { title: text('Memoria e contesto', 'Memory and context'), description: text('Leggi la ripartizione del contesto e i limiti disponibili. Le misure mancanti restano esplicite.', 'Review context allocation and available limits. Unavailable measurements stay explicit.'), scope: text('Sessione corrente', 'Current session'), icon: 'brain', keywords: 'memory contesto context tokens token memoria finestra compaction' },
  privacy: { title: text('Sicurezza e privacy', 'Security and privacy'), description: text('Gestisci i dati locali e trasferisci le preferenze. Pulizia e ripristino richiedono una scelta esplicita.', 'Manage local data and transfer preferences. Clearing or resetting always requires an explicit choice.'), scope: text('Questo profilo', 'This profile'), icon: 'shield', keywords: 'privacy security sicurezza dati data export esporta import importa backup reset ripristina' },
  models: { title: text('Laboratorio modelli', 'Model laboratory'), description: text('Scegli dove eseguire i modelli. Accessi, cataloghi e runtime hanno stati distinti.', 'Choose where models run. Provider access, catalogues and runtimes have distinct states.'), scope: text('Computer e provider', 'Computer and providers'), icon: 'cpu', keywords: 'model modelli laboratorio lab runtime ollama lm studio gguf hugging face download gpu ram' },
  providers: { title: text('Provider e accessi', 'Providers and access'), description: text('Controlla chiavi e indirizzi configurati. Una credenziale salvata non dimostra una connessione riuscita.', 'Review configured keys and addresses. A saved credential does not prove a successful connection.'), scope: text('Portachiavi e server', 'Keyring and server'), icon: 'key', keywords: 'provider api key chiave token endpoint address indirizzo openai anthropic openrouter gemini accessi' },
  costi: { title: text('Costi e consumo', 'Costs and usage'), description: text('Consulta il consumo registrato per giorno e modello, distinguendo dati disponibili e mancanti.', 'Review recorded usage by day and model, distinguishing known values from missing data.'), scope: text('Sessioni registrate', 'Recorded sessions'), icon: 'chart', keywords: 'cost costi prezzo price token usage consumo billing spesa' },
  workspace: { title: text('File e workspace', 'Files and workspace'), description: text('Verifica cartella e sessione attive prima di cambiare spazio di lavoro.', 'Check the active folder and session before changing workspace.'), scope: text('Workspace corrente', 'Current workspace'), icon: 'folder', keywords: 'folder directory cartella file project progetto workspace path percorso' },
  account: { title: text('Account, Doctor e backup', 'Account, Doctor and backup'), description: text('Diagnostica, configurazione e recupero. Le verifiche si avviano solo su tua richiesta.', 'Diagnostics, configuration and recovery. Checks run only when you request them.'), scope: text('Questo computer', 'This computer'), icon: 'activity', keywords: 'account doctor diagnostica diagnostic backup recovery recupero configurazione' },
};
export const CHAT_FIELDS = new Set(['chatFontScaleSelect', 'composerShapeSelect', 'composerPlusSelect', 'messageStyleSelect', 'streamingAnimationSelect', 'chatFullWidthToggle']);
export function sectionForField(field: LegacySettingField): SettingsSection {
  if (CHAT_FIELDS.has(field.id)) return 'chat';
  return Object.hasOwn(SETTINGS_SECTIONS, field.sezione) ? field.sezione as SettingsSection : 'appearance';
}
export const FIELD_HELP: Readonly<Record<string, LocalText>> = {
  themePresetSelect: text('Palette e atmosfera, nello studio temi.', 'Palette and atmosphere, in the theme studio.'),
  colorModeSelect: text('Chiaro, scuro o preferenza del sistema.', 'Light, dark or the system preference.'),
  uiDensitySelect: text('Regola lo spazio nelle liste, senza ridurre la dimensione del testo.', 'Adjust list spacing without making text smaller.'),
  uiLanguageSelect: text('Traduce menu e controlli; non modifica i messaggi.', 'Translate menus and controls, not your messages.'),
  sceneOverrideSelect: text('Scegli una scena oppure segui l’atmosfera del tema.', 'Choose a scene or follow the theme’s atmosphere.'),
  uiFontScaleSelect: text('Dimensione dei testi dell’interfaccia, indipendente dalla chat.', 'Interface text size, independent of conversation text.'),
  chatFontScaleSelect: text('Dimensione del testo nella conversazione.', 'Text size within the conversation.'),
  composerShapeSelect: text('Scegli lo spazio occupato dall’area di scrittura.', 'Choose the size of the writing area.'),
  composerPlusSelect: text('Mostra gli strumenti aggiuntivi in un cassetto o in un menu.', 'Show additional tools in a drawer or a menu.'),
  messageStyleSelect: text('Presentazione della conversazione: sezioni o fumetti.', 'Conversation presentation: sections or bubbles.'),
  streamingAnimationSelect: text('Come viene mostrato il testo mentre arriva.', 'How incoming text is displayed.'),
  windowPresentationSelect: text('Apri gli strumenti in un pannello o a schermo intero.', 'Open tools in a panel or a full-screen view.'),
  backgroundMotionToggle: text('Attiva la scena animata dietro l’interfaccia.', 'Enable the animated scene behind the interface.'),
  interfaceMotionToggle: text('Transizioni dei controlli, distinte dall’animazione dello sfondo.', 'Control transitions, separate from background animation.'),
  pauseWhenHiddenToggle: text('Sospende lo sfondo quando la finestra non è visibile.', 'Pause the background while the window is hidden.'),
  respectDataSaverToggle: text('Rispetta la preferenza di risparmio dati quando il browser la espone.', 'Respect data-saving preferences when reported by the browser.'),
  reducedMotionToggle: text('Riduce le animazioni dell’app; rispetta anche la preferenza di sistema.', 'Reduce app animation; the system preference is also respected.'),
  motionModeSelect: text('Motore di disegno della scena nello studio temi.', 'Scene rendering engine in the theme studio.'),
  motionQualitySelect: text('Equilibrio fra dettaglio e risorse della scena.', 'Balance scene detail and resource use.'),
  motionSpeedRange: text('Velocità della scena animata.', 'Animated scene speed.'),
  motionIntensityRange: text('Intensità complessiva della scena.', 'Overall scene intensity.'),
  motionGlowRange: text('Luminosità degli effetti della scena.', 'Scene lighting effect strength.'),
  motionDensityRange: text('Quantità di elementi nella scena.', 'Number of elements in the scene.'),
  motionDepthRange: text('Profondità percepita dello sfondo.', 'Perceived background depth.'),
  motionTrailsRange: text('Persistenza delle scie nello sfondo.', 'Background trail persistence.'),
  motionContrastRange: text('Contrasto della scena, non del testo.', 'Scene contrast, not text contrast.'),
  motionParallaxRange: text('Spostamento della scena rispetto al puntatore.', 'Scene movement relative to the pointer.'),
  motionProfileSelect: text('Profilo delle transizioni dell’interfaccia.', 'Interface transition profile.'),
  motionEasingSelect: text('Accelerazione e rallentamento delle transizioni.', 'How transitions accelerate and slow down.'),
  motionDurationRange: text('Durata delle transizioni, in millisecondi.', 'Transition duration, in milliseconds.'),
  motionUiIntensityRange: text('Ampiezza delle animazioni dei controlli.', 'Control animation strength.'),
  motionStaggerRange: text('Intervallo tra elementi animati in sequenza.', 'Delay between elements animated in sequence.'),
  motionWindowsToggle: text('Apertura e chiusura delle finestre.', 'Window opening and closing.'),
  motionSurfacesToggle: text('Transizioni di schede e superfici.', 'Card and surface transitions.'),
  motionNavigationToggle: text('Passaggio fra le sezioni.', 'Transitions between sections.'),
  motionComposerToggle: text('Interazioni nell’area di scrittura.', 'Interactions in the writing area.'),
  motionMessagesToggle: text('Comparsa dei messaggi.', 'Message appearance.'),
  motionFeedbackToggle: text('Conferme e segnali di stato.', 'Confirmations and status feedback.'),
  immersiveHeaderToggle: text('Riduce l’ingombro visivo dell’intestazione.', 'Reduce the visual weight of the header.'),
  chatFullWidthToggle: text('Usa la larghezza disponibile per la conversazione.', 'Use the available width for the conversation.'),
};
export function normalizeSearch(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim();
}
export function buildSettingsIndex(fields: readonly LegacySettingField[], studioIds: readonly string[], language: SettingsLanguage, translate: (value: string) => string): SettingSearchEntry[] {
  const entries: SettingSearchEntry[] = Object.entries(SETTINGS_SECTIONS).map(([id, section]) => ({ id, section: id as SettingsSection, kind: 'section', studio: false,
    label: localText(section.title, language), description: localText(section.description, language), terms: [section.title.it, section.title.en, section.description.it, section.description.en, section.keywords].join(' ') }));
  for (const field of fields) {
    const section = sectionForField(field), help = FIELD_HELP[field.id];
    entries.push({ id: field.id, section, kind: 'field', studio: studioIds.includes(field.id), label: translate(field.titolo),
      description: help ? localText(help, language) : '', terms: [field.id, field.chiave, field.titolo, translate(field.titolo), SETTINGS_SECTIONS[section].title.it, SETTINGS_SECTIONS[section].title.en,
        help?.it, help?.en, ...(field.opzioni || []).flatMap(option => [option[1] || '', translate(option[1] || '')])].join(' ') });
  }
  entries.push({ id: 'workspaceRestore', section: 'appearance', label: translate('Riprendi il workspace all’avvio'), description: localText(text('Riapre la sessione senza avviare operazioni.', 'Reopen the session without starting operations.'), language), terms: 'Riprendi workspace avvio ripristino sessione restore startup session', kind: 'field', studio: false });
  return entries;
}
export function searchSettings(entries: readonly SettingSearchEntry[], query: string): SettingSearchEntry[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return entries.filter(entry => terms.every(term => normalizeSearch(entry.terms).includes(term)))
    .sort((a, b) => Number(b.kind === 'section') - Number(a.kind === 'section') || a.label.localeCompare(b.label));
}
