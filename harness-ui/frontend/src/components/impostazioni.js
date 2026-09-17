import { CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI } from './impostazioni-campi.js';
import { t, linguaCorrenteDiT } from './lingua.js';
import { CONTROLLI_MIGRATI, apriStudioTemi } from './theme-studio.js';
import { FIELD_HELP, localText, normalizeSearch } from '../features/settings/schema.ts';
import { localizeSettingsCopy } from '../features/settings/static-copy.ts';
import { createSettingsView } from '../features/settings/settings-view.ts';

const views = new WeakMap();
const rowListeners = new WeakMap();
/** Retained for consumers that need to search the historical field contract. */
export function filtraImpostazioni(campi, query) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return campi.filter(field => {
    const content = normalizeSearch([field.titolo, t(field.titolo), field.gruppo, ...(field.opzioni || []).flat()].join(' '));
    return terms.every(term => content.includes(term));
  });
}
function node(tag, className = '', text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text != null) element.textContent = text;
  return element;
}
/** Reuses the actual input, including its storage listener. No parallel preference state. */
export function creaSettingRow(field, value, { controllo, output, prefisso = 'setting-', defaultValues = {} } = {}) {
  const row = node('div', 'talos-setting'); row.dataset.c = 'SettingRow'; row.dataset.settingRow = field.id;
  const info = node('div', 'settings-field-info');
  const label = node('label', 'talos-setting__label', t(field.titolo)); label.dataset.testoIt = field.titolo;
  const input = controllo || document.createElement(field.tipo === 'select' ? 'select' : 'input');
  rowListeners.get(input)?.();
  if (!controllo) {
    input.id = prefisso + field.id;
    if (field.tipo === 'select') for (const [key, title] of field.opzioni) {
      const option = node('option', '', t(title)); option.value = key; option.dataset.testoIt = title; input.append(option);
    }
    else { input.type = field.tipo; if (field.tipo === 'range') { input.min = field.min; input.max = field.max; } }
  } else {
    for (const previous of [...(input.labels || [])]) previous.removeAttribute('for');
    if (field.tipo === 'select') for (const option of input.options) {
      const original = option.dataset.testoIt || option.textContent; option.dataset.testoIt = original; option.textContent = t(original);
    }
  }
  label.htmlFor = input.id; info.append(label);
  if (FIELD_HELP[field.id]) {
    const help = node('p', 'talos-setting__help', localText(FIELD_HELP[field.id], linguaCorrenteDiT()));
    help.id = 'settingsHelp-' + field.id; help.dataset.settingHelp = field.id; info.append(help);
    const previous = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && !id.startsWith('settingsHelp-'));
    input.setAttribute('aria-describedby', [...previous, help.id].join(' '));
  }
  const controls = node('div', 'settings-field-control');
  let updateOutput = () => {};
  if (field.tipo === 'checkbox') {
    input.className = 'talos-switch'; input.setAttribute('role', 'switch'); input.dataset.c = 'Switch'; input.checked = Boolean(value); controls.append(input);
  } else {
    input.value = String(value ?? '');
    if (field.tipo === 'select') { input.className = 'talos-select'; controls.append(input); }
    else {
      input.className = '';
      const range = node('div', 'talos-setting__control');
      const amount = output || node('output'); amount.htmlFor = input.id; amount.className = 'talos-mono'; amount.value = input.value;
      const measure = node('span', 'talos-measure'); measure.append(amount, field.unita || ''); range.append(input, measure); controls.append(range);
      updateOutput = () => { amount.value = input.value; };
    }
  }
  const reset = node('button', 'settings-reset', '↶'); reset.type = 'button'; reset.dataset.settingReset = field.id; reset.dataset.resetLabel = field.titolo;
  const resetLabel = () => { const name = (linguaCorrenteDiT() === 'en' ? 'Reset: ' : 'Ripristina: ') + t(field.titolo); reset.setAttribute('aria-label', name); reset.title = name; };
  resetLabel();
  const update = () => {
    updateOutput(); const current = field.tipo === 'checkbox' ? input.checked : input.value;
    reset.hidden = !Object.hasOwn(defaultValues, field.chiave) || String(current) === String(defaultValues[field.chiave]);
  };
  reset.addEventListener('click', () => {
    if (!Object.hasOwn(defaultValues, field.chiave)) return;
    if (field.tipo === 'checkbox') input.checked = Boolean(defaultValues[field.chiave]); else input.value = String(defaultValues[field.chiave]);
    input.dispatchEvent(new Event(field.tipo === 'range' ? 'input' : 'change', { bubbles: true })); update(); input.focus();
  });
  const changed = () => { update(); row.removeAttribute('data-settings-hit'); };
  input.addEventListener('input', changed); input.addEventListener('change', changed);
  rowListeners.set(input, () => { input.removeEventListener('input', changed); input.removeEventListener('change', changed); });
  update(); controls.append(reset); row.append(info, controls); return row;
}
export function mostraSezioneImpostazioni(screen, section) {
  if (!screen) return;
  const selected = SEZIONI_IMPOSTAZIONI.some(item => item.id === section) ? section : 'appearance';
  // A repeated render/restoration of the same section must not erase a query typed meanwhile.
  // Explicit tabs/results already clear the query in SettingsView.choose(). A new section still clears it.
  const preserveSearch = screen.dataset.settingsSection === selected;
  screen.dataset.settingsSection = selected;
  const view = views.get(screen);
  if (view) view.select(selected, preserveSearch);
  else for (const panel of screen.querySelectorAll('[data-settings-panel]')) panel.hidden = panel.dataset.settingsPanel !== selected;
}
export function montaImpostazioni(screen, values, { recupera, cambiaSezione, defaultValues = {} } = {}) {
  if (!screen) return;
  views.get(screen)?.dispose();
  for (const field of CAMPI_IMPOSTAZIONI) {
    const previous = screen.querySelector('[data-setting-row="' + field.id + '"]');
    if (!previous) continue;
    // Some controls (density/language) never had a legacy ID. Preserve those on import/remount too.
    const control = recupera?.(field.id) || previous.querySelector('input,select,textarea');
    const output = field.tipo === 'range' ? (recupera?.(field.chiave + 'Output') || previous.querySelector('output')) : null;
    previous.replaceWith(creaSettingRow(field, values[field.chiave], { controllo: control, output, defaultValues }));
  }
  for (const slot of screen.querySelectorAll('[data-settings-reuse]')) {
    const original = recupera?.(slot.dataset.settingsReuse); if (!original) continue;
    original.className = slot.className; slot.replaceWith(original);
  }
  const view = createSettingsView(screen, {
    fields: CAMPI_IMPOSTAZIONI, studioIds: CONTROLLI_MIGRATI, language: linguaCorrenteDiT, translate: t,
    chooseSection: section => cambiaSezione ? cambiaSezione(section) : mostraSezioneImpostazioni(screen, section),
    openStudio: fieldId => {
      apriStudioTemi({ document: screen.ownerDocument });
      const control = screen.ownerDocument.getElementById('td-studio-' + fieldId);
      if (control) { control.focus({ preventScroll: true }); control.scrollIntoView({ block: 'center', behavior: 'instant' }); }
    },
  });
  views.set(screen, view);
  localizeSettingsCopy(screen, linguaCorrenteDiT());
}
/** Retranslate in place; never replace a field containing unsaved text. */
export function ritraduciImpostazioni(screen) {
  if (!screen) return 0;
  let count = 0;
  for (const label of screen.querySelectorAll('.talos-setting__label[data-testo-it]')) { label.textContent = t(label.dataset.testoIt); count++; }
  for (const option of screen.querySelectorAll('.talos-setting select option[data-testo-it]')) { option.textContent = t(option.dataset.testoIt); count++; }
  for (const reset of screen.querySelectorAll('[data-reset-label]')) {
    const name = (linguaCorrenteDiT() === 'en' ? 'Reset: ' : 'Ripristina: ') + t(reset.dataset.resetLabel); reset.setAttribute('aria-label', name); reset.title = name;
  }
  views.get(screen)?.refresh(); localizeSettingsCopy(screen, linguaCorrenteDiT()); return count;
}
