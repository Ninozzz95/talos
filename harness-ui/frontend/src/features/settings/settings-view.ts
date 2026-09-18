import { localizeSettingsCopy } from './static-copy.ts';
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
/*
 * ⭐ 18/09/2026 — LA MAPPA DELLE ICONE DELLE SEZIONI, in un posto solo.
 * Lo schema porta il nome dello sprite che il mockup disegna (`SETTINGS_SECTIONS[].icon`); sei
 * di quelli non esistono fra gli sprite del progetto, e al loro posto si usa il segno PIU'
 * VICINO fra i 49 che ci sono — mai un disegno nuovo, che sarebbe l'unica icona di un
 * vocabolario inventato.
 */
const SPRITE_SEZIONE: Record<string, string> = {
  chat: 'send', sliders: 'settings', cpu: 'command', key: 'link', chart: 'bolt', activity: 'user',
};
function iconaSezione(id: SettingsSection): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i talos-nav-item__icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  const sprite = SETTINGS_SECTIONS[id]?.icon ?? 'settings';
  use.setAttribute('href', '#i-' + (SPRITE_SEZIONE[sprite] ?? sprite));
  svg.append(use);
  return svg;
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
  /* ⭐ 18/09/2026 — IL CERCATORE DEL MOCKUP (FASE 1b). Il mockup lo ha in SIDEBAR, con la
     scorciatoia e i risultati in una modale; l'app lo aveva solo come campo in alto. */
  openSearch: { it: 'Cerca impostazioni', en: 'Search settings' },
  paletteTitle: { it: 'Trova un’impostazione', en: 'Find a setting' },
  palettePlaceholder: { it: 'Tema, API key, memoria, animazioni…', en: 'Theme, API key, memory, animations…' },
  paletteClose: { it: 'Chiudi la ricerca', en: 'Close search' },
  shortcut: { it: 'Ctrl K', en: 'Ctrl K' },
  /* Il glifo della scorciatoia non si annuncia: «Ctrl K» letto da uno screen reader è
     «Control K», e va detto a parole invece che lasciato al caso. */
  shortcutSpoken: { it: 'Scorciatoia Control K', en: 'Control K shortcut' },
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
    /*
     * ⭐⭐ 18/09/2026 — L'ICONA DELLA VOCE. Il mockup ne ha una per ognuna delle dieci
     *   (`TALOS-Calm-Lab-04.html`, foto dell'owner in `Downloads/exa/`): la colonna si legge
     *   a colpo d'occhio, e senza icone è un elenco di parole. Lo schema la porta già
     *   (`SETTINGS_SECTIONS[].icon`) e nessuno la disegnava.
     * ⛔ Sei degli sprite dello schema (`chat`, `sliders`, `cpu`, `key`, `chart`, `activity`)
     *   NON esistono fra i 49 del progetto: si mappano sul segno più vicino fra quelli che ci
     *   sono, invece di inventare un disegno nuovo. La mappa sta qui, in un posto solo.
     */
    button.append(iconaSezione(id), node('span', 'talos-nav-item__label')); buttons.set(id, button); list.append(button);
    const item = node('option'); item.value = id; mobile.append(item);
    button.addEventListener('click', () => choose(id), { signal });
  }
  const heading = node('header', 'settings-section-heading'); heading.dataset.settingsChrome = '';
  const headingCopy = node('div'); const eyebrow = node('span', 'talos-eyebrow'); const h2 = node('h2'); const description = node('p'); const scope = node('span', 'settings-scope');
  h2.tabIndex = -1; h2.dataset.settingsHeading = ''; eyebrow.dataset.settingsEyebrow = ''; headingCopy.append(eyebrow, h2, description); heading.append(headingCopy, scope);
  /*
   * ⭐⭐ 18/09/2026 — IL BREADCRUMB. Il mockup ce l'ha («Impostazioni › Laboratorio modelli»), qui
   *   non esisteva (misurato: 0 elementi con `[class*=breadcrumb]` nello schermo).
   * ⛔ La forma è quella che chiede WAI-ARIA, non una inventata: `<nav aria-label="Breadcrumb">`
   *   (obbligatorio il nome, perché in pagina ci sono PIÙ `<nav>` — questa è l'unica cosa che
   *   distingue le due landmark), `<ol>` perché l'ordine è significativo, `aria-current="page"`
   *   sull'ultima voce, e i **separatori in CSS** (`li + li::before`) perché uno screen reader non
   *   deve annunciarli.
   *   Fonte: W3C WAI-ARIA APG, pattern Breadcrumb (`w3.org/WAI/ARIA/apg/patterns/breadcrumb/`),
   *   letto il 18/09/2026; conferma da W3C Design System e VA Design System (ADR 002).
   * ⛔ L'ultima voce è **testo, non un link**: è la pagina in cui sei già, e un link che non naviga
   *   è un link morto (VA ADR 002, dicembre 2024, che ha superato l'ADR 001).
   */
  const breadcrumb = node('nav', 'settings-breadcrumb'); breadcrumb.setAttribute('aria-label', 'Breadcrumb');
  const crumbList = node('ol'); crumbList.setAttribute('role', 'list'); const crumbWhere = node('li'); const crumbHere = node('li'); const crumbNow = node('span');
  crumbNow.dataset.settingsCrumb = ''; crumbNow.setAttribute('aria-current', 'page'); crumbHere.append(crumbNow);
  crumbList.append(crumbWhere, crumbHere); breadcrumb.append(crumbList);
  const results = node('section', 'settings-search-results'); results.dataset.settingsChrome = ''; results.id = 'settingsSearchResults'; results.setAttribute('role', 'region');
  const resultTitle = node('h2'); const status = q<HTMLElement>('[data-settings-results]') || node('p');
  status.dataset.settingsResults = ''; status.className = 'settings-result-count'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const resultList = node('ul', 'settings-result-list'); const noResults = node('div', 'settings-empty');
  const emptyTitle = node('h3'); const emptyHelp = node('p'); noResults.append(emptyTitle, emptyHelp); results.append(resultTitle, status, resultList, noResults);
  content.prepend(breadcrumb, heading, results);
  /*
   * ⭐⭐ 18/09/2026 — IL CERCATORE DEL MOCKUP (FASE 1b), e il salto alla riga in un posto solo.
   * Il mockup ha il cercatore in SIDEBAR (`#open-settings-search` + `kbd` «Ctrl K») e i
   * risultati in una modale; l'app lo aveva solo come campo in alto. Qui il gesto del mockup
   * si aggiunge, e il campo in alto RESTA: due porte, nessuna funzione persa.
   *
   * ⛔ PERCHÉ `<dialog>` NATIVO E NON UNA MODALE NOSTRA. `showModal()` dà gratis quello che
   *   altrimenti si riscrive a mano e si sbaglia: il fuoco entra ed è contenuto, lo sfondo
   *   diventa inerte per gli screen reader, Esc chiude, e il fuoco TORNA a chi l'ha aperto.
   *   Fonte: W3C WCAG Technique H102 e CSS-Tricks "There is No Need to Trap Focus on a Dialog
   *   Element", letti il 18/09/2026 — e il progetto lo prevede già: il suo gestore dei veli
   *   tratta i `<dialog>` aperti da altri come ospiti legittimi (`manager.ts:46-48`).
   * ⛔ NON si aggiunge un trap di fuoco in JS (`over-trapping` impedisce di raggiungere la
   *   barra del browser) e NON si aggiunge `inert` a mano: lotterebbe col ritorno del fuoco.
   * ⛔ NIENTE `tabindex` sul `<dialog>`: il browser lo gestisce.
   * ⛔ IL TITOLO STA PRIMA DEL BOTTONE DI CHIUSURA, o `showModal()` dà il fuoco al primo
   *   focusabile e il dialogo si apre SCORRATO IN FONDO (W3C H102).
   * ⛔ Il click sullo sfondo NON è nativo: si ascolta `event.target === dialog`. E `closedby`
   *   non è Baseline (Safari non ce l'ha): per questo c'è un bottone di chiusura VISIBILE.
   */
  function vaiAllaRiga(entry: { id: string; section: SettingsSection; studio: boolean }) {
    choose(entry.section);
    if (entry.studio) { options.openStudio(entry.id); return; }
    const row = q<HTMLElement>('[data-setting-row="' + entry.id + '"]');
    for (let ancestor: HTMLElement | null = row; ancestor; ancestor = ancestor.parentElement) if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    const control = row?.querySelector<HTMLElement>('input,select,textarea,button') || h2;
    screen.querySelector('[data-settings-hit]')?.removeAttribute('data-settings-hit');
    if (row) row.dataset.settingsHit = '';
    control.focus({ preventScroll: true }); control.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  const palette = node('dialog', 'settings-palette'); palette.dataset.settingsChrome = '';
  const paletteBox = node('div', 'settings-palette__box');
  const paletteHead = node('div', 'settings-palette__head');
  const paletteTitle = node('h2', 'settings-palette__title'); paletteTitle.id = 'settingsPaletteTitle';
  const paletteClose = node('button', 'talos-button talos-button--ghost settings-palette__close'); paletteClose.type = 'button';
  paletteHead.append(paletteTitle, paletteClose);
  const paletteField = node('div', 'settings-palette__field');
  const paletteQuery = node('input', 'settings-palette__input'); paletteQuery.type = 'search'; paletteQuery.id = 'settingsPaletteQuery';
  paletteQuery.setAttribute('aria-controls', 'settingsPaletteResults');
  const paletteStatus = node('p', 'settings-palette__count'); paletteStatus.setAttribute('role', 'status'); paletteStatus.setAttribute('aria-live', 'polite');
  const paletteList = node('ul', 'settings-palette__results'); paletteList.id = 'settingsPaletteResults';
  const paletteEmpty = node('p', 'settings-palette__empty');
  const paletteIcona = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  paletteIcona.setAttribute('class', 'i settings-palette__icon'); paletteIcona.setAttribute('aria-hidden', 'true');
  const paletteUse = document.createElementNS('http://www.w3.org/2000/svg', 'use'); paletteUse.setAttribute('href', '#i-search');
  paletteIcona.append(paletteUse);
  paletteField.append(paletteIcona, paletteQuery);
  paletteBox.append(paletteHead, paletteField, paletteStatus, paletteList, paletteEmpty);
  palette.append(paletteBox);
  palette.setAttribute('aria-labelledby', paletteTitle.id);
  screen.append(palette);

  /** Un risultato, uguale in pagina e nella palette: nessuna copia della logica di salto. */
  function bottoneRisultato(entry: { id: string; section: SettingsSection; label: string; description: string; studio: boolean }, dentroPalette: boolean) {
    const button = node('button', 'settings-result'); button.type = 'button'; button.dataset.settingsResult = entry.id;
    const trail = node('span', 'settings-result__path', localText(SETTINGS_SECTIONS[entry.section].title, options.language()));
    button.append(trail, node('strong', '', entry.label), node('span', 'settings-result__help', entry.description));
    if (entry.studio) button.append(node('span', 'settings-result__destination', tx('studio')));
    button.addEventListener('click', () => { if (dentroPalette) palette.close(); vaiAllaRiga(entry); });
    return button;
  }
  /** L'indice è lo stesso della ricerca in pagina: una sola fonte, due porte. */
  const risultati = (termine: string) => searchSettings(buildSettingsIndex(options.fields, options.studioIds, options.language(), options.translate), termine);

  function disegnaPalette() {
    const matches = risultati(paletteQuery.value);
    paletteStatus.textContent = options.language() === 'en' ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}` : `${matches.length} ${matches.length === 1 ? 'risultato' : 'risultati'}`;
    paletteEmpty.hidden = matches.length > 0;
    paletteList.replaceChildren(...matches.map(entry => { const li = node('li'); li.append(bottoneRisultato(entry, true)); return li; }));
  }
  function apriPalette() {
    if (palette.open) return;
    disegnaPalette();
    palette.showModal();
    // ⛔ Il fuoco si mette a mano: `autofocus` non è affidabile su tutti i browser desktop.
    paletteQuery.select(); paletteQuery.focus({ preventScroll: true });
  }
  paletteClose.addEventListener('click', () => palette.close(), { signal });
  paletteQuery.addEventListener('input', disegnaPalette, { signal });
  palette.addEventListener('click', event => { if (event.target === palette) palette.close(); }, { signal });
  palette.addEventListener('close', () => { paletteQuery.value = ''; }, { signal });

  const cercaBottone = node('button', 'settings-nav__search talos-nav-item'); cercaBottone.type = 'button'; cercaBottone.dataset.settingsOpenSearch = '';
  const cercaEtichetta = node('span', 'talos-nav-item__label');
  const cercaTasto = node('kbd', 'settings-nav__kbd'); cercaTasto.setAttribute('aria-hidden', 'true');
  const cercaDetto = node('span', 'workspace-sr');
  const cercaIcona = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  cercaIcona.setAttribute('class', 'i talos-nav-item__icon'); cercaIcona.setAttribute('aria-hidden', 'true');
  const cercaUse = document.createElementNS('http://www.w3.org/2000/svg', 'use'); cercaUse.setAttribute('href', '#i-search');
  cercaIcona.append(cercaUse);
  cercaBottone.append(cercaIcona, cercaEtichetta, cercaDetto, cercaTasto);
  cercaBottone.addEventListener('click', () => apriPalette(), { signal });
  nav.insertBefore(cercaBottone, list);
  /*
   * ⛔ LA SCORCIATOIA È GLOBALE MA GUARDATA: Ctrl K non deve rubare il tasto a chi sta SCRIVENDO —
   *   il composer della chat è a un passo da qui. Fonte: le linee guida sulla command palette
   *   lette il 18/09/2026 («guard the global hotkey so it doesn't fire while the user is typing
   *   in an input/textarea/contenteditable»). Ctrl K resta raggiungibile dal bottone in sidebar.
   */
  const scrive = (target: EventTarget | null) => {
    const el = target as HTMLElement | null; if (!el || !el.tagName) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
  };
  doc.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
    /*
     * ⛔ CTRL K È GIÀ PRESO, e l'ho scoperto misurando: l'app ha una sua palette dei COMANDI
     *   (`#veloComandi`, con `#cercaComando` e `#risultatiComandi`) e il suo piè di pagina
     *   dichiara proprio «Ctrl K». Un secondo Ctrl K globale non apre due cose: ne ruba una.
     * ⛔ La cura non è togliere la scorciatoia a chi ce l'ha: è DARLE UN AMBITO. Dentro lo
     *   schermo Impostazioni vince il cercatore delle impostazioni — è quello che il mockup
     *   mette lì, ed è il contesto in cui l'utente sta lavorando; fuori, Ctrl K resta ai
     *   comandi, esattamente come prima. Nessuna funzione persa in nessuno dei due posti.
     *   Fonte: le linee guida sulla command palette lette il 18/09/2026 — «treat it as global,
     *   don't reuse the binding for any in-page filter input».
     */
    if (!screen.classList.contains('active')) return;
    if (scrive(event.target)) return;
    event.preventDefault(); apriPalette();
  }, { signal });

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
    localizeSettingsCopy(screen, options.language());
    const searching = Boolean(search!.value.trim());
    for (const [id, button] of buttons) {
      const active = id === selected && !searching;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = id === selected ? 0 : -1;
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    mobile.value = selected; clear.hidden = !searching;
    for (const panel of panels()) panel.hidden = searching || panel.dataset.settingsPanel !== selected;
    heading.hidden = searching; results.hidden = !searching; breadcrumb.hidden = searching;
    const metadata = SETTINGS_SECTIONS[selected];
    h2.textContent = localText(metadata.title, options.language()); description.textContent = localText(metadata.description, options.language()); scope.textContent = localText(metadata.scope, options.language());
    crumbNow.textContent = localText(metadata.title, options.language());
    /* L'eyebrow c'e' solo dove il mockup ce l'ha (Aspetto, Laboratorio): per le altre otto
       sezioni resta nascosto, invece di mostrare una parola inventata per simmetria. */
    if (metadata.eyebrow) { eyebrow.textContent = localText(metadata.eyebrow, options.language()); eyebrow.hidden = false; }
    else { eyebrow.textContent = ''; eyebrow.hidden = true; }
    if (!searching) { resultList.replaceChildren(); status.textContent = ''; return; }
    const matches = risultati(search!.value);
    status.hidden = false; status.textContent = options.language() === 'en' ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}` : `${matches.length} ${matches.length === 1 ? 'risultato' : 'risultati'}`;
    noResults.hidden = matches.length > 0;
    /* Una sola fabbrica di risultati per la pagina e per la palette: la logica di salto sta in
       `vaiAllaRiga`, non duplicata in due gestori. */
    resultList.replaceChildren(...matches.map(entry => { const li = node('li'); li.append(bottoneRisultato(entry, false)); return li; }));
  }
  function refresh() {
    title.textContent = tx('title'); subtitle.textContent = tx('subtitle'); searchName.textContent = tx('search'); search!.setAttribute('aria-label', tx('search')); search!.placeholder = tx('placeholder');
    clear.textContent = tx('clear'); crumbWhere.textContent = tx('title'); mobileLabel.textContent = tx('mobile'); mobile.setAttribute('aria-label', tx('mobile')); list.setAttribute('aria-label', tx('sections')); nav!.setAttribute('aria-label', tx('sections'));
    groups.forEach((g, i) => { g.textContent = tx(i === 0 ? 'behaviour' : 'infrastructure'); });
    for (const [id, button] of buttons) { button.querySelector('span')!.textContent = localText(SETTINGS_SECTIONS[id].title, options.language()); const option = mobile.querySelector('option[value="' + id + '"]'); if (option) option.textContent = button.textContent; }
    for (const field of options.fields) { const help = q<HTMLElement>('[data-setting-help="' + field.id + '"]'); if (help && FIELD_HELP[field.id]) help.textContent = localText(FIELD_HELP[field.id]!, options.language()); }
    resultTitle.textContent = tx('results'); results.setAttribute('aria-label', tx('results')); emptyTitle.textContent = tx('empty'); emptyHelp.textContent = tx('emptyHelp');
    // Il cercatore del mockup (FASE 1b): bottone in sidebar, palette, e il glifo della scorciatoia.
    cercaEtichetta.textContent = tx('openSearch'); cercaBottone.setAttribute('aria-label', tx('openSearch'));
    cercaTasto.textContent = tx('shortcut'); cercaDetto.textContent = tx('shortcutSpoken');
    paletteTitle.textContent = tx('paletteTitle'); paletteQuery.placeholder = tx('palettePlaceholder');
    paletteQuery.setAttribute('aria-label', tx('paletteTitle')); paletteClose.textContent = tx('paletteClose');
    paletteEmpty.textContent = tx('empty'); paletteList.setAttribute('aria-label', tx('results'));
    if (!save.dataset.state) save.textContent = tx('appearanceAuto'); else save.textContent = tx(save.dataset.state === 'saved' ? 'saved' : 'unsaved');
    const chatGroup = q<HTMLElement>('[data-settings-chat-controls]'); if (chatGroup) { chatGroup.querySelector('h3')!.textContent = tx('chatGroup'); chatGroup.querySelector('p')!.textContent = tx('chatHelp'); }
    const sessionFacts = q<HTMLElement>('#settingsChatFacts'); const sessionCard = sessionFacts?.closest<HTMLElement>('.talos-settings__section');
    if (sessionCard) { const name = sessionCard.querySelector('h3'); const note = sessionCard.querySelector(':scope > p'); const link = sessionCard.querySelector('[data-settings-go="appearance"]'); if (name) name.textContent = tx('currentSession'); if (note) note.textContent = tx('currentSessionHelp'); if (link) link.textContent = tx('appearanceLink'); }
    const summary = q<HTMLElement>('[data-settings-advanced] > summary'); if (summary) { summary.querySelector('span')!.textContent = tx('advanced'); summary.querySelector('small')!.textContent = tx('advancedHelp'); }
    localizeSettingsCopy(screen, options.language());
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
