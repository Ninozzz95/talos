import { montaAnteprimaTema } from '../../components/anteprima-tema.js';
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
/** Un segno del progetto, per nome di sprite: nessun disegno nuovo, una sola fabbrica. */
function iconaSprite(sprite: string, className: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i ' + className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + sprite);
  svg.append(use);
  return svg;
}
function iconaSezione(id: SettingsSection): SVGElement {
  const sprite = SETTINGS_SECTIONS[id]?.icon ?? 'settings';
  return iconaSprite(SPRITE_SEZIONE[sprite] ?? sprite, 'talos-nav-item__icon');
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
  /* ⭐⭐ 18/09/2026 — LA STRUTTURA DEL MOCKUP NELLA SEZIONE ASPETTO (i cinque gruppi, la banda
     del tema, la pastiglia contata, «Aggiungi modello»). */
  bandEyebrow: { it: 'Il tuo tema', en: 'Your theme' },
  bandHelp: { it: 'Palette, modalità colore, scene e tutte le regolazioni dello sfondo.', en: 'Palette, colour mode, scenes and every background adjustment.' },
  bandOpen: { it: 'Temi e atmosfere', en: 'Themes and atmospheres' },
  /* ⛔ IL MAIUSCOLO È NEL TESTO, NON IN CSS: nel mockup la didascalia del gruppo è la stringa
     «9 CONTROLLI» scritta così (`${list.length} CONTROLLI` in `settings.mjs`), e il suo stile
     misura `text-transform: none`. Il numero è contato, la parola è questa. */
  groupCount: { it: 'CONTROLLI', en: 'CONTROLS' },
  /* ⛔ E IL SINGOLARE È UNA MIA CORREZIONE DICHIARATA: il mockup scriverebbe «1 CONTROLLI», che in
     italiano è sbagliato. Il numero resta identico; cambia la desinenza. */
  groupCountOne: { it: 'CONTROLLO', en: 'CONTROL' },
  badgeControls: { it: 'controlli', en: 'controls' },
  badgeThemes: { it: 'temi', en: 'themes' },
  addModel: { it: 'Aggiungi modello', en: 'Add model' },
  /* ⛔ IL TITOLO È QUELLO DEL MOCKUP, preso dal suo `<h2 id="dialog-title">` (misurato il
     18/09/2026), non un mio riassunto: «Aggiungi al tuo laboratorio». */
  addModelTitle: { it: 'Aggiungi al tuo laboratorio', en: 'Add to your laboratory' },
  /* ⛔ L'INTRODUZIONE INVECE NON SI PUÒ COPIARE: il mockup dice «In questa anteprima ogni
     operazione è simulata», e qui sarebbe FALSO — le due strade sono vere e toccano il disco.
     Deviazione dichiarata, con le sue parole vere al posto di quelle finte. */
  addModelIntro: { it: 'Un catalogo, due destinazioni. Qui però non c’è nessuna simulazione: un file che hai già su questo computer, o la ricerca vera nel catalogo Hugging Face.', en: 'One catalogue, two destinations. Here nothing is simulated: a file you already have on this computer, or a real search in the Hugging Face catalogue.' },
  addModelFile: { it: 'Importa un file .gguf', en: 'Import a .gguf file' },
  addModelFileHelp: { it: 'Scegli un file dal disco: TALOS lo copia nel catalogo locale e lo rende caricabile.', en: 'Pick a file from disk: TALOS copies it into the local catalogue and makes it loadable.' },
  addModelFileGo: { it: 'Scegli il file', en: 'Choose the file' },
  addModelHf: { it: 'Cerca nel catalogo Hugging Face', en: 'Search the Hugging Face catalogue' },
  addModelHfHelp: { it: 'Apre la scheda Hugging Face del laboratorio, dove la ricerca è vera e i modelli si scaricano.', en: 'Opens the lab’s Hugging Face tab, where the search is real and models can be downloaded.' },
  addModelHfGo: { it: 'Cerca modelli', en: 'Search models' },
  addModelClose: { it: 'Chiudi finestra', en: 'Close window' },
  /* ⛔ Qui NON c'è il nome del controllo di «Spazio di lettura»: quello arriva dal CONTRATTO
     (`chatFullWidthToggle`, titolo e aiuto), così com'è, invece di essere riscritto. Resta solo
     la parola della porta. */
  readSpaceGo: { it: 'Apri Chat e composer', en: 'Open Chat and composer' },
};

/*
 * ⭐⭐ 18/09/2026 — I CINQUE GRUPPI DELLA SEZIONE ASPETTO, con i titoli del mockup.
 * Fonte: `prototypes/calm-lab/src/settings.mjs`, l'array `groups` di `renderSettings` —
 * `['design','Interfaccia e conversazione'] ['sfondo','Accessibilità e risorse']
 * ['animazioni','Movimento dell'interfaccia'] ['desktop','Desktop'] ['chat','Spazio di lettura']` —
 * letto il 18/09/2026. L'ORDINE È QUELLO, e la chiave è la stessa `gruppo` che il contratto
 * `CAMPI_IMPOSTAZIONI` dà a ogni campo: nessuna mappa inventata, nessun raggruppamento nuovo.
 */
const GRUPPI: ReadonlyArray<readonly [string, { it: string; en: string }]> = [
  ['design', { it: 'Interfaccia e conversazione', en: 'Interface and conversation' }],
  ['sfondo', { it: 'Accessibilità e risorse', en: 'Accessibility and resources' }],
  ['animazioni', { it: 'Movimento dell’interfaccia', en: 'Interface motion' }],
  ['desktop', { it: 'Desktop', en: 'Desktop' }],
  ['chat', { it: 'Spazio di lettura', en: 'Reading space' }],
];

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
  /*
   * ⭐⭐ 18/09/2026 — IL TELAIO A DUE COLONNE DEL MOCKUP, e la colonna riservata.
   * Il mockup divide la pagina in `.settings-layout` = `minmax(0,1fr) 300px` con gap 36px:
   * misurato il 18/09/2026 su `TALOS-Calm-Lab-04.html` a 1440 di viewport, la griglia
   * calcolata è `786px 300px` — cioè 1122 − 300 − 36 ⇒ la sorgente è `minmax(0,1fr) 300px`,
   * `gap: 36px` (il brief la scriveva come `786px | 300px`, che è il RISULTATO, non la regola).
   * ⛔ LA COLONNA DA 300px NON È DI QUESTA CORSIA: la disegna l'anteprima. Qui si PRENOTA il
   *   posto con un `div.settings-aside` VUOTO — non si disegna niente e non si riempie, perché
   *   due corsie che scrivono nello stesso riquadro si cancellano a vicenda. Finché è vuota,
   *   la regola `:has(> .settings-aside:empty)` la toglie dal calcolo e la pagina resta a una
   *   colonna come è oggi; il giorno che l'anteprima ci mette qualcosa, il posto c'è già.
   * ⛔ `panels()` GUARDAVA `content.children`, e con il telaio in mezzo i pannelli diventano
   *   NIPOTI: quella riga, non aggiornata, mostrerebbe tutte e dieci le sezioni insieme —
   *   cioè la sezione scelta più nove. Ora legge da `main`, che è il loro genitore vero.
   * ⛔ La riga di stato dei risultati (`[data-settings-results]`) RESTA figlia diretta di
   *   `content`: è l'annuncio della ricerca in pagina e non appartiene a nessuna delle due
   *   colonne. È per attrezzo, non per anno: `status` più sotto è `q('[data-settings-results]')`.
   * ⛔ Al RIMONTAGGIO non si incastra un secondo telaio dentro il primo (sarebbe la forma del
   *   doppio `#schermoHome`): se esiste già, si riusa — `montaImpostazioni` chiama `dispose()`
   *   e ricrea la vista, ma i nodi del pannello sono gli stessi.
   */
  const telaioPrecedente = q<HTMLElement>(':scope > .settings-layout[data-settings-layout]');
  const shell = telaioPrecedente ?? node('div', 'settings-layout');
  const main = shell.querySelector<HTMLElement>(':scope > [data-settings-main]') ?? node('div', 'settings-main');
  const aside = shell.querySelector<HTMLElement>(':scope > [data-settings-preview-mount]') ?? node('div', 'settings-aside');
  shell.dataset.settingsLayout = ''; main.dataset.settingsMain = ''; aside.dataset.settingsPreviewMount = '';
  if (!telaioPrecedente) {
    for (const child of [...content.children]) if (!child.hasAttribute('data-settings-results')) main.append(child);
    shell.append(main, aside);
    content.append(shell);
  }
  const panels = () => [...main.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e.hasAttribute('data-settings-panel'));
  /*
   * ⭐⭐ 18/09/2026 — IL MONTAGGIO DELLA COLONNA DELL'ANTEPRIMA (corsia B → qui).
   * La corsia A ha prenotato lo slot (`[data-settings-preview-mount]`, 300px) e il foglio lo
   * collassa da solo quando è vuoto (`:has(> .settings-aside:empty)`), quindi basta decidere
   * QUANDO montarla: **solo nella sezione Aspetto**, come nel mockup, che la colonna ce l'ha lì.
   * ⛔ E si SMONTA uscendo, non si nasconde: lasciandola montata e vuota, `:empty` non varrebbe
   *   più e resterebbe una colonna da 300px di niente nelle altre nove sezioni.
   * ⛔ `ferma()` del modulo fa esattamente questo — ferma il giro del canvas, spegne gli
   *   osservatori e rimuove la colonna — ed è il motivo per cui è una funzione del modulo e non
   *   una rimozione fatta a mano da qui.
   */
  let anteprimaTema: { ferma(): void; aggiorna(): void } | null = null;
  const sincronizzaAnteprima = (sezione: SettingsSection | null) => {
    if (sezione === 'appearance') {
      if (!anteprimaTema) anteprimaTema = montaAnteprimaTema(aside, { document: doc, lingua: options.language() }) as typeof anteprimaTema;
      else anteprimaTema.aggiorna();
      return;
    }
    if (anteprimaTema) { anteprimaTema.ferma(); anteprimaTema = null; }
  };
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
  /*
   * ⭐ 18/09/2026 — LA CODA DELLA TESTATA. Il mockup tiene i distintivi a DESTRA del titolo
   *   (`.section-heading` con `justify-content: space-between`), nella stessa riga: la pastiglia
   *   dei conteggi in Aspetto e «Aggiungi modello» nel Laboratorio. Qui c'è il posto dove
   *   metterli — un contenitore solo, così l'intestazione continua a essere due blocchi e non
   *   una fila di figli che si spostano a seconda di cosa è visibile.
   */
  const coda = node('div', 'settings-section-heading__aside');
  h2.tabIndex = -1; h2.dataset.settingsHeading = ''; eyebrow.dataset.settingsEyebrow = ''; headingCopy.append(eyebrow, h2, description); coda.append(scope); heading.append(headingCopy, coda);
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
  /*
   * ⛔ `data-settings-chrome` NON È DECORATIVO: è l'unica cosa che la rimozione cerca
   *   (`for (const element of screen.querySelectorAll('[data-settings-chrome]')) element.remove()`).
   *   Senza, il breadcrumb **si duplica a ogni rimontaggio** — trovato dalla review avversaria del
   *   18/09 con un percorso vero (Sicurezza e privacy ▸ Ripristina i valori iniziali ▸ conferma):
   *   i breadcrumb diventavano **1 → 2**, entrambi visibili, a y=182 e y=338.
   */
  breadcrumb.dataset.settingsChrome = '';
  const crumbList = node('ol'); crumbList.setAttribute('role', 'list'); const crumbWhere = node('li'); const crumbHere = node('li'); const crumbNow = node('span');
  crumbNow.dataset.settingsCrumb = ''; crumbNow.setAttribute('aria-current', 'page'); crumbHere.append(crumbNow);
  crumbList.append(crumbWhere, crumbHere); breadcrumb.append(crumbList);
  const results = node('section', 'settings-search-results'); results.dataset.settingsChrome = ''; results.id = 'settingsSearchResults'; results.setAttribute('role', 'region');
  const resultTitle = node('h2'); const status = q<HTMLElement>('[data-settings-results]') || node('p');
  status.dataset.settingsResults = ''; status.className = 'settings-result-count'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const resultList = node('ul', 'settings-result-list'); const noResults = node('div', 'settings-empty');
  const emptyTitle = node('h3'); const emptyHelp = node('p'); noResults.append(emptyTitle, emptyHelp); results.append(resultTitle, status, resultList, noResults);
  content.prepend(breadcrumb, heading, results);
  /* ══════════════════════════════════════════════════════════════════════════════
   * ⭐⭐ 18/09/2026 — LA STRUTTURA DELLA SEZIONE ASPETTO come la disegna il mockup
   * (`TALOS-Calm-Lab-04.html`, letto e misurato il 18/09/2026): la BANDA del tema in cima,
   * i CINQUE GRUPPI con titolo e conteggio, la PASTIGLIA contata, e «Aggiungi modello»
   * nella testata del Laboratorio modelli.
   *
   * ⛔ I NUMERI SONO CONTATI, MAI SCRITTI. I conteggi dei gruppi e la pastiglia escono dal
   *    contratto vero — `options.fields` (= `CAMPI_IMPOSTAZIONI`, 40 campi), le `opzioni` di
   *    `themePresetSelect` (14 temi) — e dalla lista dei controlli che vivono nello studio
   *    temi (`options.studioIds` = `CONTROLLI_MIGRATI`, 14): quelli NON si contano due volte,
   *    perché il gruppo è la loro porta, non la loro casa.
   *    Partizioni misurate alla fonte il 18/09/2026 (`src/components/impostazioni-campi.js`,
   *    campo `gruppo`): design 12 − 3 = 9 · sfondo 15 − 11 = 4 · animazioni 11 · desktop 1 ·
   *    chat 1 — esattamente i numeri del mockup: 9 · 4 · 11 · 1 · 1.
   * ⛔ E la pastiglia si spiega: 40 controlli sono i campi del contratto; le righe in pagina
   *    sono 41 perché `workspaceRestore` è un controllo che il contratto non elenca. Si conta
   *    il contratto, ed è la prova a dire quale riga lo eccede.
   * ══════════════════════════════════════════════════════════════════════════════ */
  const campoDi = (id: string) => options.fields.find(field => field.id === id);
  /** I controlli che il gruppo mostra: i suoi campi, meno quelli che vivono nello studio temi. */
  const contaGruppo = (gruppo: string) => options.fields.filter(field => field.gruppo === gruppo && !options.studioIds.includes(field.id)).length;
  const etichetteTema = campoDi('themePresetSelect')?.opzioni ?? [];

  /*
   * ── LA BANDA DEL TEMA ────────────────────────────────────────────────────────
   * Il mockup: `<section class="theme-launcher">` con la miniatura (`span` + due `i`), un
   * occhiello «IL TUO TEMA», il NOME del tema, la spiegazione, e a destra il bottone che apre
   * lo studio (`.theme-launcher > .button { margin-left: auto }`). Misure applicate in
   * `settings.css`: raggio 14px, padding 23px, margine `28px 0`, miniatura 86×64.
   * ⛔ IL NOME NON SI SCRIVE: si LEGGE. Il mockup lo stampa dal suo stato (`${theme}`) e in
   *   pagina c'è scritto «Calm» solo perché il tema è Calm. Qui la verità sta sulla radice —
   *   `documentElement.dataset.talosTheme`, scritto da `applicaThemeDesktop`
   *   (`src/legacy/app.js:14744-14749`), misurato vivo il 18/09/2026: `calm` — e l'etichetta
   *   si prende dal contratto (`themePresetSelect.opzioni`), non da una parola scritta qui.
   * ⛔ Se la radice tace e il contratto non ha quell'etichetta, il nome RESTA VUOTO: un tema
   *   inventato a schermo è peggio di un nome mancante.
   */
  function nomeTema() {
    const chiave = doc.documentElement.dataset.talosTheme;
    if (!chiave) return '';
    const etichetta = etichetteTema.find(opzione => opzione[0] === chiave)?.[1];
    return etichetta ? options.translate(etichetta) : '';
  }
  const banda = node('section', 'settings-band'); banda.dataset.settingsBand = ''; banda.dataset.settingsChrome = '';
  const bandaSwatch = node('div', 'settings-band__swatch'); bandaSwatch.setAttribute('aria-hidden', 'true');
  bandaSwatch.append(node('span'), node('i'), node('i'));
  const bandaCopia = node('div', 'settings-band__copy');
  const bandaOcchiello = node('span', 'talos-eyebrow settings-band__eyebrow');
  const bandaNome = node('h3', 'settings-band__name'); bandaNome.dataset.settingsBandName = '';
  const bandaAiuto = node('p', 'settings-band__help');
  const bandaApri = node('button', 'talos-button talos-button--primary settings-band__button'); bandaApri.type = 'button';
  const bandaEtichetta = node('span', 'settings-band__button-label');
  /* ⭐ 18/09/2026 — l'icona del mockup, portata VERA invece che sostituita. Il mockup disegna il
     suo bottone «Temi e atmosfere» con `ic:'sun'` (`TALOS-Calm-Lab-04.html:2046`) e il path di quel
     sole sta nel suo dizionario a `:2013`: il simbolo `i-sun` è stato aggiunto allo sprite con
     QUELLE coordinate, senza cambiarne un numero (`index.template.html`, sotto `i-image`).
     ⛔ Prima qui c'era `image`, il segno che l'app mette sulla porta dello studio temi
     (`src/components/theme-studio.js:1054`): era la scelta prudente di ieri, ma il mockup è legge e
     il suo disegno esisteva. Lo studio temi NON si tocca: la sua icona resta dov'è. */
  bandaApri.append(iconaSprite('sun', 'settings-band__icon'), bandaEtichetta);
  bandaApri.addEventListener('click', () => options.openStudio('themePresetSelect'), { signal });
  bandaCopia.append(bandaOcchiello, bandaNome, bandaAiuto);
  banda.append(bandaSwatch, bandaCopia, bandaApri);
  content.insertBefore(banda, shell);
  /* Il tema può cambiare mentre questa schermata è aperta (lo studio è a un clic): il nome
     segue la radice invece di restare quello di quando si è aperta la pagina. */
  const osservaTema = new MutationObserver(() => { bandaNome.textContent = nomeTema(); });
  osservaTema.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-talos-theme'] });

  /*
   * ── LA PASTIGLIA CONTATA E «AGGIUNGI MODELLO», NELLA CODA DELLA TESTATA ──────
   * Il mockup: `<span class="badge muted"><span class="status-dot"></span>40 controlli · 14 temi</span>`
   * (`padding: 4px 7px`, raggio 5px, 11px, `.625rem` nel mockup) e, nella testata del
   * laboratorio, il bottone «Aggiungi modello» con l'icona `plus` (che ESISTE, `#i-plus`).
   */
  const pastiglia = node('span', 'settings-badge'); pastiglia.dataset.settingsBadge = '';
  const pastigliaPunto = node('span', 'settings-badge__dot'); pastigliaPunto.setAttribute('aria-hidden', 'true');
  const pastigliaTesto = node('span', 'settings-badge__label');
  pastiglia.append(pastigliaPunto, pastigliaTesto);
  const aggiungi = node('button', 'talos-button talos-button--primary settings-add-model'); aggiungi.type = 'button'; aggiungi.dataset.settingsAddModel = '';
  const aggiungiEtichetta = node('span', 'settings-add-model__label');
  aggiungi.append(iconaSprite('plus', 'settings-add-model__icon'), aggiungiEtichetta);
  coda.append(pastiglia, aggiungi);

  /*
   * ── LE DUE STRADE VERE DI «AGGIUNGI MODELLO» ────────────────────────────────
   * ⛔ La modale è MARKUP STATICO nel template, non costruita qui: `app.js` lega le porte
   *   `[data-settings-go]` UNA VOLTA SOLA all'avvio (`src/legacy/app.js:4670-4673`), quindi un
   *   bottone creato dopo non eredita quella navigazione — bisognerebbe riscriverla, cioè
   *   duplicarla. Qui si COLLEGA soltanto: la modale si apre e si chiude, e le due strade
   *   portano dove portano le porte che l'app già conosce.
   * ⛔ LA PRIMA STRADA NON IMPORTA NIENTE: chiude la modale e preme il BOTTONE VERO che esiste
   *   da sempre (`#modelLabImportButton`, `src/legacy/app.js`) — stesso gesto, stessa logica,
   *   nessuna copia. Se quel bottone non c'è, non si finge un import: resta la navigazione.
   * ⛔ La seconda porta alla scheda Hugging Face del laboratorio, dove la ricerca è vera.
   */
  const modale = q<HTMLDialogElement>('#settingsAddModel');
  if (modale) {
    aggiungi.addEventListener('click', () => { if (!modale.open) modale.showModal(); }, { signal });
    modale.querySelector('[data-settings-add-close]')?.addEventListener('click', () => modale.close(), { signal });
    modale.addEventListener('click', event => { if (event.target === modale) modale.close(); }, { signal });
    for (const strada of modale.querySelectorAll<HTMLElement>('[data-settings-road]')) {
      strada.addEventListener('click', () => {
        modale.close();
        if (strada.dataset.settingsRoad === 'file') q<HTMLElement>('#modelLabImportButton')?.click();
      }, { signal });
    }
  }

  /*
   * ── I CINQUE GRUPPI: TITOLO E CONTEGGIO ─────────────────────────────────────
   * Il mockup: `<div class="section-heading"><h2 id="group-…">Titolo</h2><span class="text-caption">9 CONTROLLI</span></div>`
   * con le righe SUBITO dopo — nessun occhiello, nessun paragrafo (misurato: i figli del primo
   * gruppo sono `.section-heading` + `.setting-row` × N).
   * ⛔ L'occhiello e il titolo VECCHI RESTANO NEL DOM e si nascondono con `hidden`: togliere
   *   dalla pagina i nodi su cui `static-copy.ts` localizza (`[data-settings-group="design"] >
   *   .talos-eyebrow`, `> h3`) spegnerebbe la traduzione di quelle stringhe — e il DOM è la
   *   memoria delle righe che queste card hanno oggi.
   * ⛔ Il PARAGRAFO INVECE RESTA VISIBILE: il mockup non ce l'ha, ma dice il vero («Preferenze di
   *   questo browser…», «Regola il movimento e quando sospenderlo…») ed è una cosa che il mockup
   *   non ha perché non ha i vincoli che abbiamo noi. Deviazione dichiarata, non dimenticata.
   * ⛔ `role="group"` + `aria-labelledby`: il mockup usa `<section>`, che qui sarebbe un'altra
   *   landmark dentro la pagina; il gruppo con un nome è la traduzione onesta.
   */
  const TITOLI = new Map(GRUPPI);
  function intesta(card: HTMLElement, gruppo: string) {
    const titolo = TITOLI.get(gruppo); if (!titolo) return;
    let testa = card.querySelector<HTMLElement>(':scope > [data-settings-group-head]');
    if (!testa) {
      testa = node('div', 'settings-group__head'); testa.dataset.settingsGroupHead = '';
      const nome = node('h3', 'settings-group__title'); nome.id = 'settings-group-' + gruppo; nome.dataset.settingsGroupTitle = '';
      const conteggio = node('span', 'settings-group__count'); conteggio.dataset.settingsGroupCount = '';
      testa.append(nome, conteggio); card.prepend(testa);
      for (const figlio of [...card.children]) {
        if (figlio === testa) continue;
        if (figlio.classList.contains('talos-eyebrow') || /^H[1-6]$/.test(figlio.tagName)) (figlio as HTMLElement).hidden = true;
      }
    }
    card.setAttribute('role', 'group'); card.setAttribute('aria-labelledby', 'settings-group-' + gruppo);
  }
  for (const [gruppo] of GRUPPI) {
    const card = main.querySelector<HTMLElement>('#setting-panel-appearance > [data-settings-group="' + gruppo + '"]');
    if (card) intesta(card, gruppo);
  }
  /*
   * ── IL QUINTO GRUPPO NON HA UNA CARD, E SE NE ACCORGE ──────────────────────
   * «Spazio di lettura» esiste nel contratto (`chat`: 1 campo, `chatFullWidthToggle`) ma la sua
   * preferenza vive nel pannello Chat, dove la corsia della chat l'ha portata. Il mockup, che
   * ha una lista sola, non conosce il problema.
   * ⛔ Non si duplica il controllo (sarebbe due posti che scrivono lo stesso dato) e non si
   *   cancella il gruppo (sarebbe un controllo che sparisce dal conteggio): la card DICE IL
   *   VERO — nomina il controllo con il titolo e l'aiuto DEL CONTRATTO e apre la sua porta.
   * ⛔ La porta è `data-settings-group-go`, non `data-settings-go`: quell'altro lo lega `app.js`
   *   una volta sola all'avvio, e un attributo che promette un comportamento che non c'è è
   *   peggio di un attributo che non c'è.
   */
  let cardChat = main.querySelector<HTMLElement>('#setting-panel-appearance > [data-settings-group="chat"]');
  if (!cardChat) {
    cardChat = node('div', 'talos-card talos-settings__section'); cardChat.dataset.settingsGroup = 'chat';
    const riga = node('div', 'talos-setting'); riga.dataset.settingsGroupField = 'chatFullWidthToggle';
    const info = node('div');
    const nomeCampo = node('p', 'talos-setting__label'); nomeCampo.dataset.settingsGroupFieldName = '';
    const aiutoCampo = node('p', 'talos-setting__help'); aiutoCampo.dataset.settingsGroupFieldHelp = '';
    info.append(nomeCampo, aiutoCampo);
    const vai = node('button', 'talos-button talos-button--secondary'); vai.type = 'button'; vai.dataset.settingsGroupGo = 'chat';
    vai.addEventListener('click', () => choose('chat'), { signal });
    riga.append(info, vai); cardChat.append(riga);
    main.querySelector<HTMLElement>('#setting-panel-appearance')?.append(cardChat);
  }
  intesta(cardChat, 'chat');

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
  const paletteIcona = iconaSprite('search', 'settings-palette__icon');
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
  const cercaIcona = iconaSprite('search', 'talos-nav-item__icon');
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
    // La colonna dell'anteprima esiste solo dove il mockup la mette, e sparisce altrove —
    // anche durante una ricerca, che sostituisce la vista.
    sincronizzaAnteprima(searching ? null : selected);
    heading.hidden = searching; results.hidden = !searching; breadcrumb.hidden = searching;
    /* ⭐ 18/09/2026 — CHI SI VEDE, PER SEZIONE. La banda e la pastiglia sono dell'Aspetto,
       «Aggiungi modello» è del Laboratorio: ognuna sparisce dove non è la sua sezione, invece
       di restare appesa in tutte e nove le altre. */
    banda.hidden = searching || selected !== 'appearance';
    pastiglia.hidden = selected !== 'appearance';
    aggiungi.hidden = selected !== 'models';
    const metadata = SETTINGS_SECTIONS[selected];
    h2.textContent = localText(metadata.title, options.language()); description.textContent = localText(metadata.description, options.language()); scope.textContent = localText(metadata.scope, options.language());
    /*
     * ⛔ UNA PASTIGLIA SOLA IN ASPETTO — owner, 18/09/2026: «una sola, quella del mockup».
     *   La pastiglia dei due numeri si vede solo qui (`pastiglia.hidden = selected !== 'appearance'`,
     *   riga 611), quindi lo **scope** — «Questo profilo», che dice a cosa si applica la
     *   preferenza — si nasconde **solo qui**, simmetricamente.
     * ⛔ E NON SI PERDE NIENTE: nelle altre **nove** sezioni lo scope resta dov'è, perché lì il
     *   mockup non ha niente da mostrare e non c'è nessuna pastiglia con cui litigare. Nella
     *   stessa testata le due pastiglie erano l'una accanto all'altra, e il mockup ne ha una.
     */
    scope.hidden = selected === 'appearance';
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
    /* ⭐⭐ 18/09/2026 — LA STRUTTURA DELL'ASPETTO: banda, pastiglia, gruppi, e la modale.
       ⛔ I nodi si cercano NEL DOM e non si tengono in una variabile: al rimontaggio le card e i
         gruppi sono gli stessi nodi di prima, e `createSettingsView` non li ricrea — un
         riferimento catturato al primo montaggio punterebbe a elementi staccati. */
    bandaOcchiello.textContent = tx('bandEyebrow'); bandaAiuto.textContent = tx('bandHelp');
    bandaEtichetta.textContent = tx('bandOpen'); bandaNome.textContent = nomeTema();
    const temi = etichetteTema.length;
    pastigliaTesto.textContent = temi
      ? `${options.fields.length} ${tx('badgeControls')} · ${temi} ${tx('badgeThemes')}`
      : `${options.fields.length} ${tx('badgeControls')}`;
    aggiungiEtichetta.textContent = tx('addModel');
    for (const [gruppo, titolo] of GRUPPI) {
      const card = main.querySelector<HTMLElement>('#setting-panel-appearance > [data-settings-group="' + gruppo + '"]');
      const nome = card?.querySelector<HTMLElement>('[data-settings-group-title]');
      if (nome) nome.textContent = localText(titolo, options.language());
      const conteggio = card?.querySelector<HTMLElement>('[data-settings-group-count]');
      if (conteggio) { const quanti = contaGruppo(gruppo); conteggio.textContent = `${quanti} ${quanti === 1 ? tx('groupCountOne') : tx('groupCount')}`; }
    }
    /* Il gruppo che non ha una card nomina il SUO controllo con le parole del contratto. */
    const campoChat = campoDi('chatFullWidthToggle');
    const nomeCampo = q<HTMLElement>('[data-settings-group-field-name]');
    if (nomeCampo && campoChat) nomeCampo.textContent = options.translate(campoChat.titolo);
    const aiutoCampo = q<HTMLElement>('[data-settings-group-field-help]');
    const aiutoChat = campoChat ? FIELD_HELP[campoChat.id] : undefined;
    if (aiutoCampo && aiutoChat) aiutoCampo.textContent = localText(aiutoChat, options.language());
    const vaiChat = q<HTMLElement>('[data-settings-group-go="chat"]'); if (vaiChat) vaiChat.textContent = tx('readSpaceGo');
    /* Le parole della modale: una volta sola, qui — il markup è statico e non porta testo. */
    const occhielloModale = SETTINGS_SECTIONS.models.eyebrow;
    const modaleOcchiello = modale?.querySelector<HTMLElement>('[data-settings-add-eyebrow]');
    if (modaleOcchiello && occhielloModale) modaleOcchiello.textContent = localText(occhielloModale, options.language());
    const testiModale: ReadonlyArray<readonly [string, keyof typeof words]> = [
      ['[data-settings-add-title]', 'addModelTitle'], ['[data-settings-add-intro]', 'addModelIntro'],
      ['[data-settings-add-file]', 'addModelFile'], ['[data-settings-add-file-help]', 'addModelFileHelp'], ['[data-settings-add-file-go]', 'addModelFileGo'],
      ['[data-settings-add-hf]', 'addModelHf'], ['[data-settings-add-hf-help]', 'addModelHfHelp'], ['[data-settings-add-hf-go]', 'addModelHfGo'],
    ];
    for (const [selettore, chiave] of testiModale) { const nodo = q<HTMLElement>(selettore); if (nodo) nodo.textContent = tx(chiave); }
    const chiudiModale = modale?.querySelector<HTMLElement>('[data-settings-add-close]');
    if (chiudiModale) { chiudiModale.setAttribute('aria-label', tx('addModelClose')); chiudiModale.title = tx('addModelClose'); }
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
  return { select, refresh, dispose: () => { osservaTema.disconnect(); controller.abort(); } };
}
