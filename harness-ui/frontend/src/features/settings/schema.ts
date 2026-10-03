/** SET-01: presentation metadata only. Values and validation remain with the existing preference owner. */
import { LINGUA_PSEUDO, linguaCorrenteDiT, t } from '../../components/lingua.js';
import { TESTI } from '../../i18n/testi/index.js';
export type SettingsLanguage = 'it' | 'en';
export type LocalText = Readonly<{ it: string; en: string; chiave: string }>;
export type SettingsSection = 'appearance' | 'chat' | 'tools' | 'memoria' | 'privacy' | 'models' | 'costi' | 'workspace' | 'account';
export interface LegacySettingField {
  id: string; chiave: string; titolo: string; sezione: string; gruppo: string; tipo: string;
  opzioni?: readonly (readonly string[])[]; min?: number; max?: number; unita?: string;
}
export interface SettingSearchEntry {
  id: string; section: SettingsSection; label: string; description: string;
  terms: string; kind: 'field' | 'section' | 'action'; studio: boolean;
}
/*
 * 03/10/2026, seconda ondata della lingua: le parole stanno nel dizionario (area `impostazioni`), non più in coppie scritte qui.
 *   `text(chiave)` dà lo stesso oggetto di prima — `it` ed `en` letti dal dizionario quando si leggono —, così chi legge
 *   `.it`/`.en` (la ricerca delle Impostazioni, che cerca nelle due lingue) non cambia. In pseudo-lingua `localText` passa da
 *   `t()`, che marca il testo: lo strato 3 del cancello vede le Impostazioni come il resto dell'app.
 */
export const localText = (value: LocalText, language: string): string =>
  linguaCorrenteDiT() === LINGUA_PSEUDO ? t(value.chiave) : value[language === 'en' ? 'en' : 'it'];
const text = (chiave: string): LocalText => Object.freeze({
  chiave,
  get it() { return TESTI.it[chiave] as string; },
  get en() { return TESTI.en[chiave] as string; },
});
/** Lo stesso testo a due lingue, per chi compone le Impostazioni fuori da questo file (`settings-view.ts`). */
export const localTextKey = text;
export const SETTINGS_SECTIONS: Readonly<Record<SettingsSection, { title: LocalText; eyebrow?: LocalText; description: LocalText; scope: LocalText; icon: string; keywords: string }>> = {
  appearance: { title: text('impostazioni.sections.appearance.title'), eyebrow: text('impostazioni.sections.appearance.eyebrow'), description: text('impostazioni.sections.appearance.description'), scope: text('impostazioni.sections.appearance.scope'), icon: 'image', keywords: /* lingua: termini di ricerca scritti apposta nelle due lingue */ 'theme colore color font animation animazioni accessibilità accessibility' },
  chat: { title: text('impostazioni.sections.chat.title'), description: text('impostazioni.sections.chat.description'), scope: text('impostazioni.sections.chat.scope'), icon: 'chat', keywords: 'message messaggi invio enter input text testo font composer' },
  tools: { title: text('impostazioni.sections.tools.title'), description: text('impostazioni.sections.tools.description'), scope: text('impostazioni.sections.tools.scope'), icon: 'sliders', keywords: 'tools permissions permessi policy search ricerca web duckduckgo tavily brave chiave key' },
  memoria: { title: text('impostazioni.sections.memoria.title'), description: text('impostazioni.sections.memoria.description'), scope: text('impostazioni.sections.memoria.scope'), icon: 'brain', keywords: 'memory contesto context tokens token memoria finestra compaction' },
  privacy: { title: text('impostazioni.sections.privacy.title'), description: text('impostazioni.sections.privacy.description'), scope: text('impostazioni.sections.privacy.scope'), icon: 'shield', keywords: 'privacy security sicurezza dati data export esporta import importa backup reset ripristina' },
  /* ⛔ 23/09/2026 — DECISIONE OWNER: «Provider e accessi» è TOLTA DEL TUTTO dalle Impostazioni
     («Toglierla del tutto»). Era una seconda porta sugli STESSI fornitori della scheda «Provider»
     del laboratorio qui sotto: due superfici per una cosa sola. Le sue parole di ricerca passano
     qui, così chi cerca «chiave», «API key» o «provider» trova il posto vero e mai un vuoto.
     Ricerca 23/09/2026 — Jakob Nielsen (NN/g), «Reduce Redundancy: Decrease Duplicated Design
     Decisions»: «User interface complexity increases when a single feature or hypertext link is
     presented in multiple ways». Il vecchio id `providers` resta solo come INDIRIZZO RITIRATO
     (`SEZIONI_RITIRATE` sotto), mai come sezione. */
  models: { title: text('impostazioni.sections.models.title'), eyebrow: text('impostazioni.sections.models.eyebrow'), description: text('impostazioni.sections.models.description'), scope: text('impostazioni.sections.models.scope'), icon: 'cpu', keywords: 'model modelli laboratorio lab runtime ollama lm studio gguf hugging face download gpu ram provider providers fornitore fornitori api key chiave chiavi credenziale credenziali token endpoint address indirizzo openai anthropic openrouter gemini accessi' },
  costi: { title: text('impostazioni.sections.costi.title'), description: text('impostazioni.sections.costi.description'), scope: text('impostazioni.sections.costi.scope'), icon: 'chart', keywords: 'cost costi prezzo price token usage consumo billing spesa' },
  workspace: { title: text('impostazioni.sections.workspace.title'), description: text('impostazioni.sections.workspace.description'), scope: text('impostazioni.sections.workspace.scope'), icon: 'folder', keywords: 'folder directory cartella file project progetto workspace path percorso' },
  account: { title: text('impostazioni.sections.account.title'), description: text('impostazioni.sections.account.description'), scope: text('impostazioni.sections.account.scope'), icon: 'activity', keywords: 'account doctor diagnostica diagnostic backup recovery recupero configurazione' },
};
/*
 * ⛔ 23/09/2026 — GLI INDIRIZZI RITIRATI, e dove portano adesso. Owner: «Provider e accessi» tolta
 *   del tutto; la gestione dei fornitori vive SOLO in Laboratorio modelli → scheda «Provider».
 *   Un indirizzo vecchio (la sezione salvata in `talos.harness.desktop.settings.section.v1`, un
 *   `setSettingsSection('providers')` rimasto in giro) non deve ricadere in silenzio su «Aspetto»:
 *   porta alla casa nuova, sulla scheda giusta. È la semantica del 301: «the target resource has
 *   been assigned a new permanent URI and any future references to this resource ought to use one
 *   of the enclosed URIs» (RFC 9110 §15.4.2, letta il 23/09/2026) — per questo chi applica il
 *   rinvio riscrive anche il ricordo salvato (`app.js`, `setSettingsSection`).
 */
export const SEZIONI_RITIRATE: Readonly<Record<string, Readonly<{ section: SettingsSection; labTab: string }>>> = Object.freeze({
  providers: Object.freeze({ section: 'models', labTab: 'providers' }),
});
/** La destinazione vera di un id di sezione: vivo ⇒ sé stesso; ritirato ⇒ la sua casa nuova; ignoto ⇒ `null`. */
export function risolviSezioneImpostazioni(id: unknown): { section: SettingsSection; labTab: string | null } | null {
  const chiave = typeof id === 'string' ? id : '';
  if (Object.hasOwn(SETTINGS_SECTIONS, chiave)) return { section: chiave as SettingsSection, labTab: null };
  const ritirata = Object.hasOwn(SEZIONI_RITIRATE, chiave) ? SEZIONI_RITIRATE[chiave] : undefined;
  return ritirata ? { section: ritirata.section, labTab: ritirata.labTab } : null;
}
export const CHAT_FIELDS = new Set(['chatFontScaleSelect', 'composerPlusSelect', 'messageStyleSelect', 'streamingAnimationSelect', 'chatFullWidthToggle', 'askTimeoutSelect']);
export function sectionForField(field: LegacySettingField): SettingsSection {
  if (CHAT_FIELDS.has(field.id)) return 'chat';
  return Object.hasOwn(SETTINGS_SECTIONS, field.sezione) ? field.sezione as SettingsSection : 'appearance';
}
export const FIELD_HELP: Readonly<Record<string, LocalText>> = {
  themePresetSelect: text('impostazioni.fieldHelp.themePresetSelect'),
  colorModeSelect: text('impostazioni.fieldHelp.colorModeSelect'),
  uiDensitySelect: text('impostazioni.fieldHelp.uiDensitySelect'),
  uiLanguageSelect: text('impostazioni.fieldHelp.uiLanguageSelect'),
  sceneOverrideSelect: text('impostazioni.fieldHelp.sceneOverrideSelect'),
  uiFontScaleSelect: text('impostazioni.fieldHelp.uiFontScaleSelect'),
  chatFontScaleSelect: text('impostazioni.fieldHelp.chatFontScaleSelect'),
  // 24/09/2026, decisione owner 35.
  askTimeoutSelect: text('impostazioni.fieldHelp.askTimeoutSelect'),
  composerPlusSelect: text('impostazioni.fieldHelp.composerPlusSelect'),
  messageStyleSelect: text('impostazioni.fieldHelp.messageStyleSelect'),
  streamingAnimationSelect: text('impostazioni.fieldHelp.streamingAnimationSelect'),
  windowPresentationSelect: text('impostazioni.fieldHelp.windowPresentationSelect'),
  backgroundMotionToggle: text('impostazioni.fieldHelp.backgroundMotionToggle'),
  interfaceMotionToggle: text('impostazioni.fieldHelp.interfaceMotionToggle'),
  pauseWhenHiddenToggle: text('impostazioni.fieldHelp.pauseWhenHiddenToggle'),
  respectDataSaverToggle: text('impostazioni.fieldHelp.respectDataSaverToggle'),
  reducedMotionToggle: text('impostazioni.fieldHelp.reducedMotionToggle'),
  motionModeSelect: text('impostazioni.fieldHelp.motionModeSelect'),
  motionQualitySelect: text('impostazioni.fieldHelp.motionQualitySelect'),
  motionSpeedRange: text('impostazioni.fieldHelp.motionSpeedRange'),
  motionIntensityRange: text('impostazioni.fieldHelp.motionIntensityRange'),
  motionGlowRange: text('impostazioni.fieldHelp.motionGlowRange'),
  motionDensityRange: text('impostazioni.fieldHelp.motionDensityRange'),
  motionDepthRange: text('impostazioni.fieldHelp.motionDepthRange'),
  motionTrailsRange: text('impostazioni.fieldHelp.motionTrailsRange'),
  motionContrastRange: text('impostazioni.fieldHelp.motionContrastRange'),
  motionParallaxRange: text('impostazioni.fieldHelp.motionParallaxRange'),
  motionProfileSelect: text('impostazioni.fieldHelp.motionProfileSelect'),
  motionEasingSelect: text('impostazioni.fieldHelp.motionEasingSelect'),
  motionDurationRange: text('impostazioni.fieldHelp.motionDurationRange'),
  motionUiIntensityRange: text('impostazioni.fieldHelp.motionUiIntensityRange'),
  motionStaggerRange: text('impostazioni.fieldHelp.motionStaggerRange'),
  motionWindowsToggle: text('impostazioni.fieldHelp.motionWindowsToggle'),
  motionSurfacesToggle: text('impostazioni.fieldHelp.motionSurfacesToggle'),
  motionNavigationToggle: text('impostazioni.fieldHelp.motionNavigationToggle'),
  motionComposerToggle: text('impostazioni.fieldHelp.motionComposerToggle'),
  motionMessagesToggle: text('impostazioni.fieldHelp.motionMessagesToggle'),
  motionFeedbackToggle: text('impostazioni.fieldHelp.motionFeedbackToggle'),
  immersiveHeaderToggle: text('impostazioni.fieldHelp.immersiveHeaderToggle'),
  chatFullWidthToggle: text('impostazioni.fieldHelp.chatFullWidthToggle'),
};
export function normalizeSearch(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim();
}
/** Le due voci di una chiave del dizionario, per la ricerca nelle due lingue (vuoto se la chiave non c'è). */
const bilingue = (chiave: string): string[] => [TESTI.it[chiave], TESTI.en[chiave]].filter((v): v is string => typeof v === 'string');
export function buildSettingsIndex(fields: readonly LegacySettingField[], studioIds: readonly string[], language: SettingsLanguage, translate: (value: string) => string): SettingSearchEntry[] {
  const entries: SettingSearchEntry[] = Object.entries(SETTINGS_SECTIONS).map(([id, section]) => ({ id, section: id as SettingsSection, kind: 'section', studio: false,
    label: localText(section.title, language), description: localText(section.description, language), terms: [section.title.it, section.title.en, section.description.it, section.description.en, section.keywords].join(' ') }));
  for (const field of fields) {
    const section = sectionForField(field), help = FIELD_HELP[field.id];
    entries.push({ id: field.id, section, kind: 'field', studio: studioIds.includes(field.id), label: translate(field.titolo),
      description: help ? localText(help, language) : '', terms: [field.id, field.chiave, field.titolo, translate(field.titolo), SETTINGS_SECTIONS[section].title.it, SETTINGS_SECTIONS[section].title.en,
        help?.it, help?.en, ...(field.opzioni || []).flatMap(option => [option[1] || '', translate(option[1] || '')]),
        /* 03/10/2026, corsia S2: `titolo` e le etichette delle opzioni sono ora nella lingua CORRENTE (getter sul dizionario):
           la ricerca trova il campo in tutte e due le lingue leggendo le due voci, come per le sezioni qui sopra. */
        ...bilingue(`impostazioni.field.${field.id}.title`),
        ...(field.opzioni || []).flatMap(option => bilingue(`impostazioni.field.${field.id}.option.${String(option[0]).replace(/[^A-Za-z0-9_]/gu, '_')}`))].join(' ') });
  }
  entries.push({ id: 'workspaceRestore', section: 'appearance', label: localText(text('impostazioni.search.workspaceRestore.title'), language), description: localText(text('impostazioni.search.workspaceRestore.description'), language), terms: 'Riprendi workspace avvio ripristino sessione restore startup session', kind: 'field', studio: false });
  return entries;
}
export function searchSettings(entries: readonly SettingSearchEntry[], query: string): SettingSearchEntry[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return entries.filter(entry => terms.every(term => normalizeSearch(entry.terms).includes(term)))
    .sort((a, b) => Number(b.kind === 'section') - Number(a.kind === 'section') || a.label.localeCompare(b.label));
}
