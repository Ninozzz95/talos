import {
  assertTalosDesignTokens,
  createBadge,
  createButton,
  createField,
  createIconButton,
  createKbd,
  createListRow,
  createMeasure,
  createMenuButton,
  createSelect,
  createSheet,
  createStatusDot,
  createSwitch,
  createTabs,
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
