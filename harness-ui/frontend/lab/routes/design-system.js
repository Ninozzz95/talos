import {
  assertTalosDesignTokens,
  createActivityBundle,
  createApprovalCard,
  createBadge,
  createCheckCard,
  createComposer,
  createConversation,
  createDataTable,
  createButton,
  createField,
  createIconButton,
  createKbd,
  createListRow,
  createMeasure,
  createMenuButton,
  createNavGroup,
  createNavItem,
  createResizablePane,
  createSelect,
  createSettingRow,
  createSheet,
  createSessionItem,
  createSignedReceipt,
  createStatusDot,
  createSwitch,
  createMessage,
  createTabs,
  createTurn,
  createTurnSpine,
  createTooltip,
} from '../../src/design-system/index.js';
import { createAnnouncementRegion } from '../../src/ui/announcement-region.js';
import { createFocusManager } from '../../src/ui/focus-manager.js';
import { createOverlayManager } from '../../src/ui/overlay-manager.js';

function headingGroup(documentObj, title) {
  const group = documentObj.createElement('section');
  group.className = 'design-system-lab__group';
  const heading = documentObj.createElement('h2');
  heading.textContent = title;
  const row = documentObj.createElement('div');
  row.className = 'design-system-lab__row';
  group.append(heading, row);
  return { group, row };
}

export function mountDesignSystemLab(root) {
  const documentObj = root.ownerDocument;
  const html = documentObj.documentElement;
  html.dataset.talosTheme = 'calm';
  html.dataset.talosMode = 'dark';

  const surface = documentObj.createElement('main');
  surface.className = 'design-system-lab';
  const header = documentObj.createElement('header');
  header.className = 'design-system-lab__header';
  const titleBlock = documentObj.createElement('div');
  const eyebrow = documentObj.createElement('p');
  eyebrow.className = 'foundation-eyebrow';
  eyebrow.textContent = 'Fase 3 · grammatica operativa';
  const heading = documentObj.createElement('h1');
  heading.textContent = 'Una sola voce per ogni controllo';
  const copy = documentObj.createElement('p');
  copy.className = 'foundation-copy';
  copy.textContent = 'Primitive Calm controllate, leggibili e pronte per le superfici desktop TALOS.';
  titleBlock.append(eyebrow, heading, copy);
  const signal = documentObj.createElement('div');
  signal.className = 'design-system-lab__signal';
  const status = createBadge({ document: documentObj, label: 'Sincronizzato', tone: 'success', live: true, ariaLabel: 'Stato sincronizzato' });
  const signalCopy = documentObj.createElement('span');
  signalCopy.textContent = 'token / focus / motion';
  signal.append(status.element, signalCopy);
  header.append(titleBlock, signal);
  const grid = documentObj.createElement('div');
  grid.className = 'design-system-lab__grid';
  surface.append(header, grid);
  root.replaceChildren(surface);

  const announcements = createAnnouncementRegion({ document: documentObj, root });
  const focusManager = createFocusManager(documentObj);
  const overlays = createOverlayManager({
    root,
    focusManager,
    announce: (message) => announcements.announce(message),
    inertExempt: (element) => announcements.owns(element),
  });
  const components = [status];

  const actions = headingGroup(documentObj, 'Azioni');
  const primary = createButton({ document: documentObj, label: 'Salva modifica', variant: 'primary', testId: 'ds-button-primary', onPress: () => announcements.announce('Modifica salvata') });
  const disabledReason = documentObj.createElement('p');
  disabledReason.id = 'ds-publish-reason';
  disabledReason.className = 'design-system-lab__reason';
  disabledReason.textContent = 'Collega un repository per pubblicare.';
  const disabled = createButton({ document: documentObj, label: 'Pubblica modifica', variant: 'secondary', disabled: true, describedBy: disabledReason.id });
  const icon = documentObj.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'i';
  const iconButton = createIconButton({ document: documentObj, label: 'Informazioni sincronizzazione', variant: 'ghost', icon, testId: 'ds-icon-button' });
  const tooltip = createTooltip({ trigger: iconButton.element, content: 'Le modifiche locali sono allineate.', placement: 'top', delayMs: 0 });
  actions.row.append(primary.element, disabled.element, tooltip.element);
  actions.group.append(disabledReason);
  grid.append(actions.group);
  components.push(primary, disabled, iconButton, tooltip);

  const preferences = headingGroup(documentObj, 'Preferenze');
  const switchLabel = documentObj.createElement('label');
  switchLabel.className = 'design-system-lab__switch-label';
  const switchText = documentObj.createElement('span');
  switchText.textContent = 'Aggiornamenti automatici';
  let switchChecked = false;
  let updatesSwitch;
  updatesSwitch = createSwitch({
    document: documentObj,
    label: 'Aggiornamenti automatici',
    checked: switchChecked,
    onChange: (checked) => {
      switchChecked = checked;
      updatesSwitch.update({ checked });
      announcements.announce(checked ? 'Aggiornamenti automatici attivati' : 'Aggiornamenti automatici disattivati');
    },
  });
  switchLabel.append(switchText, updatesSwitch.element);
  preferences.row.append(switchLabel);
  grid.append(preferences.group);
  components.push(updatesSwitch);

  const navigation = headingGroup(documentObj, 'Viste progetto');
  navigation.group.classList.add('design-system-lab__group--wide');
  let tabValue = 'overview';
  let tabs;
  const tabItems = [
    { id: 'overview', label: 'Panoramica', content: 'Stato del progetto, branch e attività essenziali.' },
    { id: 'activity', label: 'Attività', content: 'Eventi recenti e cambiamenti verificati.' },
    { id: 'details', label: 'Dettagli', content: 'Permessi, percorso e strumenti disponibili.' },
  ];
  tabs = createTabs({
    document: documentObj,
    label: 'Viste progetto',
    items: tabItems,
    value: tabValue,
    activation: 'manual',
    onChange: (value) => {
      tabValue = value;
      tabs.update({ value });
      announcements.announce(`Vista ${tabItems.find((item) => item.id === value)?.label || value}`);
    },
  });
  navigation.row.append(tabs.element);
  grid.append(navigation.group);
  components.push(tabs);

  const disclosure = headingGroup(documentObj, 'Contesto e dettagli');
  disclosure.group.classList.add('design-system-lab__group--wide');
  const lastAction = documentObj.createElement('p');
  lastAction.className = 'design-system-lab__feedback';
  lastAction.dataset.testid = 'ds-last-action';
  lastAction.textContent = 'Nessuna azione selezionata';
  const menu = createMenuButton({
    document: documentObj,
    label: 'Azioni progetto',
    items: [
      { id: 'open', label: 'Apri cartella' },
      { id: 'duplicate', label: 'Duplica progetto' },
      { id: 'archive', label: 'Archivia progetto' },
    ],
    onSelect: (item) => {
      lastAction.textContent = item.label;
      announcements.announce(`${item.label} selezionato`);
    },
  });
  const apply = createButton({ document: documentObj, label: 'Applica', variant: 'primary', onPress: () => announcements.announce('Dettagli applicati') });
  const sheetContent = documentObj.createElement('div');
  const environment = documentObj.createElement('p');
  environment.textContent = 'Ambiente locale controllato da TALOS. Nessuna modifica viene eseguita da questa prova.';
  sheetContent.append(environment);
  const sheet = createSheet({
    document: documentObj,
    overlayManager: overlays,
    title: 'Dettagli ambiente',
    description: 'Controlla il contesto prima di applicare una modifica.',
    content: sheetContent,
    actions: [apply.element],
  });
  const openSheet = createButton({ document: documentObj, label: 'Apri dettagli ambiente', variant: 'secondary', onPress: () => sheet.open(openSheet.element) });
  disclosure.row.append(menu.element, openSheet.element);
  disclosure.group.append(lastAction);
  grid.append(disclosure.group);
  components.push(menu, apply, sheet, openSheet);

  /*
   * Fase 1 del redesign: le sei primitive nuove sul banco, dove i test del
   * browser le guardano davvero. Ognuna nello stato che conta.
   */
  const misure = headingGroup(documentObj, 'Misure e stato');
  const misurata = createMeasure({ document: documentObj, value: '1.565', unit: 'test', testId: 'ds-measure-measured' });
  const stimata = createMeasure({ document: documentObj, value: '7,5k', unit: 'token', provenance: 'estimated', testId: 'ds-measure-estimated' });
  const puntoVivo = createStatusDot({ document: documentObj, tone: 'live', label: 'in corso', testId: 'ds-dot-live' });
  const puntoMuto = createStatusDot({ document: documentObj, tone: 'success', testId: 'ds-dot-decorative' });
  misure.row.append(misurata.element, stimata.element, puntoVivo.element, puntoMuto.element);
  grid.append(misure.group);
  components.push(misurata, stimata, puntoVivo, puntoMuto);

  const scorciatoie = headingGroup(documentObj, 'Scorciatoie');
  const comandoModello = createButton({ document: documentObj, label: 'Cambia modello', variant: 'secondary', testId: 'ds-shortcut-target' });
  const tasti = createKbd({ document: documentObj, keys: ['Ctrl', '⇧', 'M'], control: comandoModello.element, testId: 'ds-kbd' });
  scorciatoie.row.append(comandoModello.element, tasti.element);
  grid.append(scorciatoie.group);
  components.push(comandoModello, tasti);

  const ingressi = headingGroup(documentObj, 'Ingressi');
  const lente = documentObj.createElement('span');
  lente.textContent = '⌕';
  const ricerca = createField({ document: documentObj, label: 'Cerca nelle conversazioni', placeholder: 'Cerca chat…', icon: lente, testId: 'ds-field' });
  const modello = createSelect({
    document: documentObj,
    label: 'Modello principale',
    options: [{ value: 'claude-opus-5', label: 'claude-opus-5' }, { value: 'claude-sonnet-5', label: 'claude-sonnet-5' }],
    value: 'claude-opus-5',
    testId: 'ds-select',
    onChange: (valore) => announcements.announce(`Modello ${valore}`),
  });
  ingressi.row.append(ricerca.element, modello.element);
  grid.append(ingressi.group);
  components.push(ricerca, modello);

  const elenco = headingGroup(documentObj, 'Righe di elenco');
  elenco.group.classList.add('design-system-lab__group--wide');
  const contenitore = documentObj.createElement('div');
  contenitore.className = 'talos-card talos-list';
  contenitore.setAttribute('role', 'listbox');
  contenitore.setAttribute('aria-label', 'Attrezzi della sessione');
  const permesso = createBadge({ document: documentObj, label: 'Chiede', tone: 'warning' });
  const costo = createMeasure({ document: documentObj, value: '412', unit: 'token', provenance: 'estimated' });
  let sceltaCorrente = 'terminale';
  const righe = [
    { id: 'terminale', title: 'Comando nel terminale', subtitle: 'esegue un comando nella cartella della sessione', aside: [costo.element, permesso.element] },
    { id: 'ricerca-file', title: 'Ricerca nei file', subtitle: 'cerca un testo dentro la cartella, senza aprirla tutta', aside: [] },
  ].map((riga) => {
    const componente = createListRow({
      document: documentObj,
      title: riga.title,
      subtitle: riga.subtitle,
      aside: riga.aside,
      interactive: 'select',
      selected: sceltaCorrente === riga.id,
      testId: `ds-list-row-${riga.id}`,
      onPress: () => {
        sceltaCorrente = riga.id;
        for (const [altra, altroId] of coppie) altra.update({ selected: altroId === sceltaCorrente });
        announcements.announce(`${riga.title} selezionato`);
      },
    });
    return [componente, riga.id];
  });
  const coppie = righe;
  for (const [componente] of righe) contenitore.append(componente.element);
  elenco.row.append(contenitore);
  grid.append(elenco.group);
  components.push(permesso, costo, ...righe.map(([c]) => c));

  /* Fase 3: la sidebar come struttura, non come fila di bottoni. */
  const navigazione = headingGroup(documentObj, 'Sidebar');
  navigazione.group.classList.add('design-system-lab__group--wide');
  const nav = documentObj.createElement('nav');
  nav.setAttribute('aria-label', 'Navigazione di prova');
  let luogoCorrente = 'capability';
  const vociLuoghi = [
    { id: 'capability', label: 'Capability', count: 43, unit: 'attrezzi' },
    { id: 'board', label: 'Board', count: 69, unit: 'sessioni' },
  ].map((voce) => createNavItem({
    document: documentObj,
    label: voce.label,
    count: voce.count,
    countUnit: voce.unit,
    current: luogoCorrente === voce.id,
    testId: `ds-nav-${voce.id}`,
    onPress: () => {
      luogoCorrente = voce.id;
      for (const [componente, id] of coppieLuoghi) componente.update({ current: id === luogoCorrente });
      announcements.announce(`${voce.label} aperto`);
    },
  }));
  const coppieLuoghi = vociLuoghi.map((componente, i) => [componente, ['capability', 'board'][i]]);
  const gruppoLuoghi = createNavGroup({ document: documentObj, label: 'Luoghi', items: vociLuoghi.map((v) => v.element), testId: 'ds-nav-group' });

  const listaSessioni = documentObj.createElement('ul');
  listaSessioni.className = 'talos-nav-list';
  listaSessioni.setAttribute('aria-label', 'Sessioni di prova');
  const sessioni = [
    { id: 'w1-02', title: 'W1-02 registro processi', status: 'live', statusLabel: 'in corso', model: 'claude-opus-5', when: '18:09', turns: 7 },
    { id: 'hermes', title: 'Confronto Hermes e Codex', status: 'error', statusLabel: 'giri finiti', model: 'claude-sonnet-5', when: 'ieri', turns: 24 },
  ].map((sessione) => createSessionItem({
    document: documentObj,
    ...sessione,
    current: sessione.id === 'w1-02',
    testId: `ds-session-${sessione.id}`,
    onPress: () => announcements.announce(`${sessione.title} aperta`),
  }));
  for (const s of sessioni) listaSessioni.append(s.element);
  nav.append(gruppoLuoghi.element, listaSessioni);
  navigazione.row.append(nav);
  grid.append(navigazione.group);
  components.push(...vociLuoghi, gruppoLuoghi, ...sessioni);

  /*
   * Fase 4: la conversazione. Qui il banco prova la cosa che conta davvero —
   * che mentre il modello scrive NON si annuncia ogni pezzo, e che alla fine
   * si annuncia il messaggio intero una volta sola.
   */
  const chat = headingGroup(documentObj, 'Conversazione');
  chat.group.classList.add('design-system-lab__group--wide');

  const testoRisposta = documentObj.createElement('p');
  testoRisposta.textContent = 'La guardia è scritta e i test la coprono nei due versi.';
  const messaggioTalos = createMessage({
    document: documentObj,
    author: 'assistant',
    authorLabel: 'TALOS',
    model: 'claude-opus-5',
    time: '18:07',
    content: [testoRisposta],
    testId: 'ds-message',
  });
  const ricevuta = createSignedReceipt({
    document: documentObj,
    text: 'Scrittura eseguita: 18 righe aggiunte, 2 tolte.',
    hash: 'a1f4c39d77b19c02',
    testId: 'ds-receipt',
  });
  const attrezzoRiga = createListRow({
    document: documentObj,
    title: 'Comando nel terminale',
    subtitle: 'node --test tests/*.test.mjs',
    testId: 'ds-bundle-row',
  });
  const durata = createMeasure({ document: documentObj, value: '3,1', unit: 's', testId: 'ds-bundle-duration' });
  const blocco = createActivityBundle({
    document: documentObj,
    count: 7,
    failed: 1,
    summaryWord: 'attrezzi usati in questo giro',
    failedWord: 'fallito',
    content: [attrezzoRiga.element],
    aside: [durata.element],
    testId: 'ds-activity-bundle',
    onToggle: (aperto) => announcements.announce(aperto ? 'Attrezzi del giro aperti' : 'Attrezzi del giro chiusi'),
  });
  const spina = createTurnSpine({
    document: documentObj,
    turns: [{ n: 5, cost: 3 }, { n: 6, cost: 5, outcome: 'warning' }],
    testId: 'ds-turn-spine',
  });
  const giro = createTurn({
    document: documentObj,
    spine: spina.element,
    content: [messaggioTalos.element, blocco.element, ricevuta.element],
    testId: 'ds-turn',
  });

  let scrive = false;
  let conversazione;
  conversazione = createConversation({
    document: documentObj,
    label: 'Conversazione di prova',
    content: [giro.element],
    announce: (messaggio) => announcements.announce(messaggio),
    testId: 'ds-conversation',
  });
  const alternaStream = createButton({
    document: documentObj,
    label: 'Simula una risposta',
    variant: 'secondary',
    testId: 'ds-stream-toggle',
    onPress: () => {
      scrive = !scrive;
      conversazione.update(scrive
        ? { streaming: true }
        : { streaming: false, completedText: testoRisposta.textContent });
    },
  });
  chat.row.append(conversazione.element);
  chat.group.append(alternaStream.element);
  grid.append(chat.group);
  components.push(messaggioTalos, ricevuta, attrezzoRiga, durata, blocco, spina, giro, conversazione, alternaStream);

  const gruppoPermesso = headingGroup(documentObj, 'Richiesta di permesso');
  gruppoPermesso.group.classList.add('design-system-lab__group--wide');
  const consenti = createButton({ document: documentObj, label: 'Consenti una volta', variant: 'primary', testId: 'ds-approval-allow' });
  const nega = createButton({ document: documentObj, label: 'Nega', variant: 'ghost' });
  const differenza = documentObj.createElement('pre');
  differenza.className = 'talos-diff';
  differenza.textContent = '+ silenzioMs: 60_000,';
  let cartaPermesso;
  cartaPermesso = createApprovalCard({
    document: documentObj,
    title: 'Chiede di scrivere src/session-registry.mjs',
    reason: 'Serve per aggiungere le soglie della guardia che hai chiesto: 60 secondi di silenzio e tre ripetizioni identiche.',
    content: [differenza],
    actions: [consenti.element, nega.element],
    expiry: 'Scade a fine sessione',
    announce: (messaggio) => announcements.announce(messaggio),
    testId: 'ds-approval-card',
  });
  const mostraPermesso = createButton({
    document: documentObj,
    label: 'Mostra la richiesta',
    variant: 'secondary',
    testId: 'ds-approval-show',
    onPress: () => cartaPermesso.update({ presented: true }),
  });
  gruppoPermesso.row.append(cartaPermesso.element);
  gruppoPermesso.group.append(mostraPermesso.element);
  grid.append(gruppoPermesso.group);
  components.push(consenti, nega, cartaPermesso, mostraPermesso);

  /* Fase 5: le pagine — Board, Doctor, impostazioni. */
  const pagine = headingGroup(documentObj, 'Pagine');
  pagine.group.classList.add('design-system-lab__group--wide');

  const costoStimato = createMeasure({ document: documentObj, value: '0,08', unit: '$', provenance: 'estimated' });
  let ordine = { column: 'giri', direction: 'descending' };
  let tabella;
  tabella = createDataTable({
    document: documentObj,
    caption: 'Tutte le sessioni',
    columns: [
      { id: 'sessione', label: 'Sessione', rowHeader: true },
      { id: 'stato', label: 'Stato' },
      { id: 'giri', label: 'Giri', align: 'end', sortable: true },
      { id: 'cache', label: 'Cache', align: 'end', sortable: true },
      { id: 'costo', label: 'Costo', align: 'end' },
    ],
    rows: [
      { cells: { sessione: 'W1-02 registro processi', stato: 'in corso', giri: '7', cache: '87%', costo: costoStimato.element } },
      { cells: { sessione: 'Cancello ricerca web', stato: 'conclusa', giri: '3', cache: '91%', costo: '$0,02' } },
    ],
    sort: ordine,
    announce: (messaggio) => announcements.announce(messaggio),
    onSort: (prossimo) => { ordine = prossimo; tabella.update({ sort: ordine }); },
    testId: 'ds-data-table',
  });
  pagine.row.append(tabella.element);

  const riavvia = createButton({ document: documentObj, label: 'Riavvia il server', variant: 'primary', testId: 'ds-check-fix' });
  const avviso = createCheckCard({
    document: documentObj,
    severity: 'warning',
    severityLabel: 'avviso',
    title: 'La pagina è più nuova del server',
    text: 'La pagina caricata è la 0.4.12, il server che risponde è la 0.4.9.',
    actions: [riavvia.element],
    testId: 'ds-check-card',
  });
  const nota = createCheckCard({
    document: documentObj,
    severity: 'ok',
    severityLabel: 'ok',
    title: 'Suite di verifica',
    text: '1.565 test su 1.565 verdi, uscita 0.',
    testId: 'ds-check-card-ok',
  });
  pagine.group.append(avviso.element, nota.element);

  const modelloImpostazione = createSelect({
    document: documentObj,
    label: 'Modello principale',
    options: [{ value: 'claude-opus-5', label: 'claude-opus-5' }, { value: 'claude-sonnet-5', label: 'claude-sonnet-5' }],
    value: 'claude-opus-5',
  });
  const rigaImpostazione = createSettingRow({
    document: documentObj,
    label: 'Modello principale',
    scope: 'vale da subito, anche per la sessione aperta',
    control: modelloImpostazione.element,
    testId: 'ds-setting-row',
  });
  pagine.group.append(rigaImpostazione.element);
  grid.append(pagine.group);
  components.push(costoStimato, tabella, riavvia, avviso, nota, modelloImpostazione, rigaImpostazione);

  /* Fase 6: il guscio — maniglia dei pannelli e compositore. */
  const guscio = headingGroup(documentObj, 'Guscio');
  guscio.group.classList.add('design-system-lab__group--wide');

  const pannello = documentObj.createElement('div');
  pannello.className = 'design-system-lab__pane';
  pannello.id = 'ds-pane';
  const titoloPannello = documentObj.createElement('h3');
  titoloPannello.id = 'ds-pane-title';
  titoloPannello.textContent = 'Barra laterale';
  pannello.append(titoloPannello);
  const larghezzaViva = createMeasure({ document: documentObj, value: '276', unit: 'px', testId: 'ds-pane-width' });
  pannello.append(larghezzaViva.element);
  const maniglia = createResizablePane({
    document: documentObj,
    root: documentObj.documentElement,
    window: documentObj.defaultView,
    token: '--ds-lab-pane-w',
    controls: 'ds-pane',
    labelledBy: 'ds-pane-title',
    min: 220,
    max: 420,
    base: 276,
    value: 276,
    announce: (messaggio) => announcements.announce(messaggio),
    onResize: (px) => larghezzaViva.update({ value: String(px) }),
    testId: 'ds-resizer',
  });
  pannello.append(maniglia.element);
  guscio.row.append(pannello);

  let scriveComposer = false;
  const pillolaModello = createBadge({ document: documentObj, label: 'claude-opus-5', tone: 'neutral' });
  let compositore;
  compositore = createComposer({
    document: documentObj,
    label: 'Messaggio',
    placeholder: 'Scrivi… Invio indirizza il giro in corso',
    sendLabel: 'Invia',
    stopLabel: 'Ferma',
    attachLabel: 'Allega file o immagini',
    capabilityLabel: 'Capability',
    accept: 'image/*,.md,.json',
    attachments: [{ id: 'a1', name: 'schermata.png', tokens: 1240 }],
    onCapability: () => announcements.announce('Capability aperto'),
    onAttach: (files, origine) => announcements.announce(`${files.length} allegato da ${origine}`),
    onRemoveAttachment: (allegato) => announcements.announce(`${allegato.name} tolto`),
    pills: [pillolaModello.element],
    queue: [],
    testId: 'ds-composer',
    onSend: () => {
      scriveComposer = true;
      compositore.update({
        busy: true,
        statusText: 'Comando nel terminale · giro 7',
        queue: ['Poi aggiorna il ledger con i numeri veri'],
      });
      announcements.announce('Messaggio inviato');
    },
    onStop: () => {
      scriveComposer = false;
      compositore.update({ busy: false, queue: [] });
      announcements.announce('Giro fermato');
    },
  });
  guscio.group.append(compositore.element);
  grid.append(guscio.group);
  components.push(larghezzaViva, maniglia, pillolaModello, compositore);

  assertTalosDesignTokens(documentObj.defaultView.getComputedStyle(html));
  html.dataset.visualReady = 'true';

  return () => {
    delete html.dataset.visualReady;
    for (const component of [...components].reverse()) component.destroy();
    overlays.destroy();
    announcements.destroy();
    surface.remove();
  };
}
