import { SETTINGS_SECTIONS, CHAT_FIELDS, FIELD_HELP, buildSettingsIndex, searchSettings, localText } from './schema.ts';
import type { LegacySettingField, SettingsLanguage, SettingsSection } from './schema.ts';

interface SettingsViewOptions {
  fields: readonly LegacySettingField[];
  studioIds: readonly string[];
  language: () => SettingsLanguage;
  translate: (value: string) => string;
  chooseSection: (section: string) => void;
  openStudio: (fieldId: string) => void;
}
const words = {
  title: { it: 'Impostazioni', en: 'Settings' },
  subtitle: { it: 'Un posto per configurare il tuo modo di lavorare.', en: 'One place to configure the way you work.' },
  search: { it: 'Cerca un’impostazione', en: 'Search settings' },
  placeholder: { it: 'Cerca per nome, funzione o parola chiave…', en: 'Search by name, function or keyword…' },
  clear: { it: 'Cancella ricerca', en: 'Clear search' },
  sections: { it: 'Sezioni delle impostazioni', en: 'Settings sections' },
  mobile: { it: 'Sezione impostazioni', en: 'Settings section' },
  behaviour: { it: 'Comportamento', en: 'Behaviour' },
  infrastructure: { it: 'Infrastruttura', en: 'Infrastructure' },
  results: { it: 'Risultati della ricerca', en: 'Search results' },
  empty: { it: 'Nessuna impostazione trovata', en: 'No settings found' },
  emptyHelp: { it: 'Prova un termine più generale, come “tema”, “permessi” o “provider”.', en: 'Try a broader term such as “theme”, “permissions” or “provider”.' },
  studio: { it: 'Apri nello studio temi', en: 'Open in theme studio' },
  appearanceAuto: { it: 'Le preferenze di aspetto si applicano subito.', en: 'Appearance preferences apply immediately.' },
  saved: { it: 'Preferenza salvata in questo profilo.', en: 'Preference saved in this profile.' },
  unsaved: { it: 'Salvataggio non riuscito. La modifica potrebbe durare solo fino alla chiusura: libera spazio o verifica lo storage del profilo.', en: 'Could not save. This change may last only until you close the app: free space or check profile storage.' },
  chatGroup: { it: 'Lettura e scrittura', en: 'Reading and writing' },
  chatHelp: { it: 'Preferenze visuali della conversazione. Non cambiano il modello o i permessi.', en: 'Conversation appearance. These settings do not change the model or permissions.' },
  advanced: { it: 'Regolazioni avanzate del movimento', en: 'Advanced motion controls' },
  advancedHelp: { it: 'Durata, curva e famiglie di transizioni', en: 'Duration, easing and transition families' },
  currentSession: { it: 'Sessione corrente', en: 'Current session' },
  currentSessionHelp: { it: 'Modello e preferenze operative della conversazione attiva.', en: 'Model and operational preferences of the active conversation.' },
  appearanceLink: { it: 'Temi e movimento', en: 'Themes and motion' },
};

/** Composes existing controls; never copies their values into a second settings store. */
export function createSettingsView(screen: HTMLElement, options: SettingsViewOptions) {
  const doc = screen.ownerDocument;
  const controller = new AbortController();
  const signal = controller.signal;
  const q = <T extends Element>(selector: string) => screen.querySelector<T>(selector);
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', value = '') => {
    const element = doc.createElement(tag); element.className = className; element.textContent = value; return element;
  };
  const tx = (key: keyof typeof words) => localText(words[key], options.language());
  const page = q<HTMLElement>(':scope > .talos-page');
  const layout = q<HTMLElement>('.talos-settings');
  const nav = q<HTMLElement>('.talos-settings__nav');
  const firstPanel = q<HTMLElement>('#setting-panel-appearance');
  if (!page || !layout || !nav || !firstPanel?.parentElement) throw Error('Settings structure is incomplete.');
  const content = firstPanel.parentElement;
  content.classList.add('settings-content'); screen.dataset.settingsUi = 'v3';
  const panels = () => [...content.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e.hasAttribute('data-settings-panel'));
  const search = q<HTMLInputElement>('[data-settings-query]');
  if (!search) throw Error('Settings search is missing.');
  const previousQuery = search.value;
  const current = screen.dataset.settingsSection;
  let selected: SettingsSection = current && Object.hasOwn(SETTINGS_SECTIONS, current) ? current as SettingsSection : 'appearance';
  // Remove only feature-owned chrome during a remount. Native fields remain connected.
  for (const element of screen.querySelectorAll('[data-settings-chrome]')) element.remove();
  // The search input may have been inside the removed toolbar; retain the same object.
  const header = node('header', 'settings-header'); header.dataset.settingsChrome = '';
  const copy = node('div', 'settings-header__copy');
  const title = node('h1'); const subtitle = node('p'); copy.append(title, subtitle);
  const save = node('p', 'settings-save'); save.dataset.settingsSave = ''; save.setAttribute('role', 'status');
  header.append(copy, save);
  const toolbar = node('div', 'settings-toolbar'); toolbar.dataset.settingsChrome = '';
  const searchWrap = node('label', 'settings-search'); searchWrap.htmlFor = 'settingsSearch';
  const searchName = node('span', 'workspace-sr');
  search.id = 'settingsSearch'; search.type = 'search'; search.className = 'settings-search__input';
  search.setAttribute('aria-controls', 'settingsSearchResults');
  const clear = node('button', 'talos-button talos-button--secondary'); clear.type = 'button'; clear.dataset.settingsClear = '';
  searchWrap.append(searchName, search); toolbar.append(searchWrap, clear);
  page.insertBefore(header, layout); page.insertBefore(toolbar, layout);
  nav.replaceChildren(); nav.className = 'talos-settings__nav settings-nav';
  const list = node('div', 'settings-nav__list'); list.setAttribute('role', 'tablist'); list.setAttribute('aria-orientation', 'vertical');
  const mobileWrap = node('label', 'settings-mobile-nav');
  const mobileLabel = node('span');
  const mobile = node('select', 'talos-select'); mobile.dataset.settingsMobile = ''; mobile.id = 'settingsSectionSelect'; mobileWrap.htmlFor = mobile.id;
  mobileWrap.append(mobileLabel, mobile); nav.append(mobileWrap, list);
  const buttons = new Map<SettingsSection, HTMLButtonElement>();
  const groups: HTMLSpanElement[] = [];
  for (const [i, key] of Object.keys(SETTINGS_SECTIONS).entries()) {
    const id = key as SettingsSection;
    if (i === 0 || i === 5) { const heading = node('span', 'settings-nav__group'); heading.setAttribute('aria-hidden', 'true'); groups.push(heading); list.append(heading); }
    const button = node('button', 'talos-nav-item settings-nav__item'); button.type = 'button'; button.id = 'setting-tab-' + id; button.dataset.settingsTab = id;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'setting-panel-' + id);
    button.append(node('span', 'talos-nav-item__label')); buttons.set(id, button); list.append(button);
    const item = node('option'); item.value = id; mobile.append(item);
    button.addEventListener('click', () => choose(id), { signal });
  }
  const heading = node('header', 'settings-section-heading'); heading.dataset.settingsChrome = '';
  const headingCopy = node('div'); const h2 = node('h2'); const description = node('p'); const scope = node('span', 'settings-scope');
  h2.tabIndex = -1; h2.dataset.settingsHeading = ''; headingCopy.append(h2, description); heading.append(headingCopy, scope);
  const results = node('section', 'settings-search-results'); results.dataset.settingsChrome = ''; results.id = 'settingsSearchResults'; results.setAttribute('role', 'region');
  const resultTitle = node('h2'); const status = q<HTMLElement>('[data-settings-results]') || node('p');
  status.dataset.settingsResults = ''; status.className = 'settings-result-count'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const resultList = node('ul', 'settings-result-list'); const noResults = node('div', 'settings-empty');
  const emptyTitle = node('h3'); const emptyHelp = node('p'); noResults.append(emptyTitle, emptyHelp); results.append(resultTitle, status, resultList, noResults);
  content.prepend(heading, results);

  const restore = q<HTMLInputElement>('[data-workspace-restore]');
  if (restore && !restore.closest('.settings-field-control')) {
    const wrapper = node('div', 'settings-field-control'); restore.before(wrapper); wrapper.append(restore); restore.classList.add('talos-switch'); restore.setAttribute('role', 'switch');
  }
  // Five chat controls used to live under Appearance. Move the original nodes, not clones.
  const chat = q<HTMLElement>('#setting-panel-chat');
  if (chat) {
    let group = chat.querySelector<HTMLElement>('[data-settings-chat-controls]');
    if (!group) { group = node('section', 'talos-card talos-settings__section'); group.dataset.settingsChatControls = ''; group.append(node('h3'), node('p')); chat.prepend(group); }
    for (const id of CHAT_FIELDS) { const row = q<HTMLElement>('[data-setting-row="' + id + '"]'); if (row) group.append(row); }
  }
  const animation = q<HTMLElement>('[data-settings-group="animazioni"]');
  if (animation && !animation.querySelector('[data-settings-advanced]')) {
    const details = node('details', 'settings-advanced'); details.dataset.settingsAdvanced = '';
    const summary = node('summary'); summary.append(node('span'), node('small')); details.append(summary);
    for (const child of [...animation.children]) if ((child.hasAttribute('data-setting-row') && child.getAttribute('data-setting-row') !== 'motionProfileSelect') || child.id === 'resetMotionButton') details.append(child);
    animation.append(details);
  }
  function choose(id: SettingsSection) { search!.value = ''; options.chooseSection(id); }
  function select(id: string, preserveSearch = false) {
    selected = Object.hasOwn(SETTINGS_SECTIONS, id) ? id as SettingsSection : 'appearance'; screen.dataset.settingsSection = selected;
    if (!preserveSearch) search!.value = '';
    render();
  }
  function render() {
    const searching = Boolean(search!.value.trim());
    for (const [id, button] of buttons) {
      const active = id === selected && !searching;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = id === selected ? 0 : -1;
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    mobile.value = selected; clear.hidden = !searching;
    for (const panel of panels()) panel.hidden = searching || panel.dataset.settingsPanel !== selected;
    heading.hidden = searching; results.hidden = !searching;
    const metadata = SETTINGS_SECTIONS[selected];
    h2.textContent = localText(metadata.title, options.language()); description.textContent = localText(metadata.description, options.language()); scope.textContent = localText(metadata.scope, options.language());
    if (!searching) { resultList.replaceChildren(); status.textContent = ''; return; }
    const matches = searchSettings(buildSettingsIndex(options.fields, options.studioIds, options.language(), options.translate), search!.value);
    status.hidden = false; status.textContent = options.language() === 'en' ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}` : `${matches.length} ${matches.length === 1 ? 'risultato' : 'risultati'}`;
    noResults.hidden = matches.length > 0;
    resultList.replaceChildren(...matches.map(entry => {
      const li = node('li'); const button = node('button', 'settings-result'); button.type = 'button'; button.dataset.settingsResult = entry.id;
      const trail = node('span', 'settings-result__path', localText(SETTINGS_SECTIONS[entry.section].title, options.language()));
      const label = node('strong', '', entry.label); const help = node('span', 'settings-result__help', entry.description);
      button.append(trail, label, help);
      if (entry.studio) button.append(node('span', 'settings-result__destination', tx('studio')));
      button.addEventListener('click', () => {
        choose(entry.section);
        if (entry.studio) { options.openStudio(entry.id); return; }
        const row = q<HTMLElement>('[data-setting-row="' + entry.id + '"]');
        for (let ancestor: HTMLElement | null = row; ancestor; ancestor = ancestor.parentElement) if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        const control = row?.querySelector<HTMLElement>('input,select,textarea,button') || h2;
        screen.querySelector('[data-settings-hit]')?.removeAttribute('data-settings-hit');
        if (row) row.dataset.settingsHit = '';
        control.focus({ preventScroll: true }); control.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      li.append(button); return li;
    }));
  }
  function refresh() {
    title.textContent = tx('title'); subtitle.textContent = tx('subtitle'); searchName.textContent = tx('search'); search!.setAttribute('aria-label', tx('search')); search!.placeholder = tx('placeholder');
    clear.textContent = tx('clear'); mobileLabel.textContent = tx('mobile'); mobile.setAttribute('aria-label', tx('mobile')); list.setAttribute('aria-label', tx('sections')); nav!.setAttribute('aria-label', tx('sections'));
    groups.forEach((g, i) => { g.textContent = tx(i === 0 ? 'behaviour' : 'infrastructure'); });
    for (const [id, button] of buttons) { button.querySelector('span')!.textContent = localText(SETTINGS_SECTIONS[id].title, options.language()); const option = mobile.querySelector('option[value="' + id + '"]'); if (option) option.textContent = button.textContent; }
    for (const field of options.fields) { const help = q<HTMLElement>('[data-setting-help="' + field.id + '"]'); if (help && FIELD_HELP[field.id]) help.textContent = localText(FIELD_HELP[field.id]!, options.language()); }
    resultTitle.textContent = tx('results'); results.setAttribute('aria-label', tx('results')); emptyTitle.textContent = tx('empty'); emptyHelp.textContent = tx('emptyHelp');
    if (!save.dataset.state) save.textContent = tx('appearanceAuto'); else save.textContent = tx(save.dataset.state === 'saved' ? 'saved' : 'unsaved');
    const chatGroup = q<HTMLElement>('[data-settings-chat-controls]'); if (chatGroup) { chatGroup.querySelector('h3')!.textContent = tx('chatGroup'); chatGroup.querySelector('p')!.textContent = tx('chatHelp'); }
    const sessionFacts = q<HTMLElement>('#settingsChatFacts'); const sessionCard = sessionFacts?.closest<HTMLElement>('.talos-settings__section');
    if (sessionCard) { const name = sessionCard.querySelector('h3'); const note = sessionCard.querySelector(':scope > p'); const link = sessionCard.querySelector('[data-settings-go="appearance"]'); if (name) name.textContent = tx('currentSession'); if (note) note.textContent = tx('currentSessionHelp'); if (link) link.textContent = tx('appearanceLink'); }
    const summary = q<HTMLElement>('[data-settings-advanced] > summary'); if (summary) { summary.querySelector('span')!.textContent = tx('advanced'); summary.querySelector('small')!.textContent = tx('advancedHelp'); }
    render();
  }
  mobile.addEventListener('change', () => choose(mobile.value as SettingsSection), { signal });
  search.addEventListener('input', render, { signal });
  search.addEventListener('keydown', event => { if (event.key === 'Escape' && search.value) { event.stopPropagation(); search.value = ''; render(); } }, { signal });
  clear.addEventListener('click', () => { search.value = ''; render(); search.focus(); }, { signal });
  list.addEventListener('keydown', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('[data-settings-tab]'); if (!target) return;
    const order = [...buttons.values()], i = order.indexOf(target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? order.length - 1 : event.key === 'ArrowDown' ? (i + 1) % order.length : event.key === 'ArrowUp' ? (i - 1 + order.length) % order.length : -1;
    if (next < 0) return; event.preventDefault(); order[next]!.focus(); choose(order[next]!.dataset.settingsTab as SettingsSection);
  }, { signal });
  doc.addEventListener('talos:settings-persisted', event => {
    const saved = (event as CustomEvent<{ saved: boolean }>).detail?.saved === true;
    save.dataset.state = saved ? 'saved' : 'unsaved'; save.setAttribute('role', saved ? 'status' : 'alert'); save.textContent = tx(saved ? 'saved' : 'unsaved');
  }, { signal });
  search.value = previousQuery; refresh();
  return { select, refresh, dispose: () => controller.abort() };
}
