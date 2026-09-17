/** NAV-02: actual command list. The host retains action execution and modal lifecycle. */
import { createScope } from '../../app/lifecycle.ts';
import { commandDisabledReason, findCommands, nextCommandIndex } from '../../services/commands/registry.ts';
import type { CommandContext, CommandMatch } from '../../services/commands/registry.ts';
export interface CommandPaletteOptions {
  field: HTMLInputElement;
  list: HTMLElement;
  empty: HTMLElement | null;
  translate(text: string): string;
  shortcutLabel(combo: string): string;
  context(): CommandContext;
  execute(id: string): void | Promise<void>;
  reportError(error: unknown): void;
}
export function createCommandPalette(options: CommandPaletteOptions) {
  const { field, list, empty } = options;
  const doc = field.ownerDocument, scope = createScope(), t = options.translate;
  let matches: CommandMatch[] = [], selected = -1;
  const status = doc.createElement('p'); status.className = 'command-palette__status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
  list.after(status); list.classList.add('command-palette__results');
  field.setAttribute('role', 'combobox'); field.setAttribute('aria-controls', list.id);
  field.setAttribute('aria-autocomplete', 'list'); field.autocomplete = 'off'; field.spellcheck = false;
  list.setAttribute('role', 'listbox');
  const rows = () => [...list.querySelectorAll<HTMLButtonElement>('[data-command]')];
  const idOf = (id: string) => `${list.id}-command-${id}`;
  function setActive(index: number, scroll = true) {
    selected = index >= 0 && index < matches.length ? index : -1;
    for (const row of rows()) {
      const active = row.dataset.command === matches[selected]?.command.id;
      row.classList.toggle('command-active', active); row.setAttribute('aria-selected', String(active));
    }
    const active = matches[selected];
    if (active) {
      field.setAttribute('aria-activedescendant', idOf(active.command.id));
      if (scroll) doc.getElementById(idOf(active.command.id))?.scrollIntoView({ block: 'nearest' });
    } else field.removeAttribute('aria-activedescendant');
  }
  function render(query = field.value) {
    if (scope.disposed) return;
    const former = matches[selected]?.command.id;
    matches = findCommands(query, options.context(), t);
    field.placeholder = t('Cerca comandi, sezioni o strumenti…');
    field.setAttribute('aria-label', t('Cerca comandi e destinazioni'));
    list.setAttribute('aria-label', t('Comandi e destinazioni'));
    const fragment = doc.createDocumentFragment();
    // Stable groups with labelled options; no HTML from a command or translated string is parsed.
    for (const group of [...new Set(matches.map(item => item.command.group))]) {
      const container = doc.createElement('div'); container.className = 'command-palette__group';
      container.setAttribute('role', 'group');
      const heading = doc.createElement('p'); heading.className = 'command-palette__group-label';
      heading.id = `${list.id}-group-${fragment.childNodes.length}`; heading.textContent = t(group);
      container.setAttribute('aria-labelledby', heading.id); container.append(heading);
      for (const item of matches.filter(match => match.command.group === group)) {
        const command = item.command, row = doc.createElement('button');
        row.type = 'button'; row.className = 'command-palette__item'; row.dataset.command = command.id; row.id = idOf(command.id);
        row.tabIndex = -1; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false');
        row.setAttribute('aria-disabled', String(Boolean(item.disabledReason)));
        const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
        const use = doc.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#${command.icon}`); svg.append(use);
        const copy = doc.createElement('span'); copy.className = 'command-palette__copy';
        const label = doc.createElement('span'); label.className = 'command-palette__label'; label.textContent = t(command.label);
        const detail = doc.createElement('small'); detail.textContent = t(item.disabledReason || command.description);
        copy.append(label, detail); row.append(svg, copy);
        if (command.shortcut) { const key = doc.createElement('kbd'); key.className = 'talos-kbd'; key.textContent = options.shortcutLabel(command.shortcut); row.append(key); }
        container.append(row);
      }
      fragment.append(container);
    }
    list.replaceChildren(fragment);
    // Keyboard order must match the grouped DOM order, not the ranking across separate groups.
    const order = rows().map(row => row.dataset.command);
    matches.sort((a, b) => order.indexOf(a.command.id) - order.indexOf(b.command.id));
    if (empty) { empty.hidden = matches.length > 0; empty.textContent = t('Nessun comando trovato. Prova un nome di sezione o cancella la ricerca.'); }
    status.textContent = matches.length ? `${matches.length} ${t('risultati')}` : '';
    const previousIndex = matches.findIndex(item => item.command.id === former);
    const firstEnabled = matches.findIndex(item => !item.disabledReason);
    setActive(previousIndex >= 0 ? previousIndex : firstEnabled >= 0 ? firstEnabled : matches.length ? 0 : -1, false);
  }
  function run(index: number) {
    const item = matches[index]; if (!item || scope.disposed) return;
    // Availability may have changed after rendering. Never trust a stale enabled button.
    const reason = commandDisabledReason(item.command, options.context());
    if (reason) { render(); status.textContent = t(reason); field.focus({ preventScroll: true }); return; }
    try { Promise.resolve(options.execute(item.command.id)).catch(options.reportError); }
    catch (error) { options.reportError(error); }
  }
  // Editing the query is not an accordion toggle. The legacy root delegates
  // aria-expanded/aria-controls clicks; this field owns its list's visibility.
  field.addEventListener('click', event => event.stopPropagation(), { signal: scope.signal });
  field.addEventListener('input', () => render(), { signal: scope.signal });
  field.addEventListener('keydown', event => {
    if (event.isComposing || event.key === 'Process' || event.keyCode === 229 || event.defaultPrevented) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setActive(nextCommandIndex(matches.length, selected, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') { event.preventDefault(); run(selected); }
    // Home/End remain native text-editing keys. Escape belongs to the shared overlay manager.
  }, { signal: scope.signal });
  list.addEventListener('pointerover', event => {
    const target = event.target as Element | null;
    const row = target?.closest<HTMLButtonElement>('[data-command]');
    if (row && list.contains(row)) setActive(matches.findIndex(item => item.command.id === row.dataset.command), false);
  }, { signal: scope.signal });
  list.addEventListener('mousedown', event => { if ((event.target as Element | null)?.closest('[data-command]')) event.preventDefault(); }, { signal: scope.signal });
  list.addEventListener('click', event => {
    const row = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-command]');
    if (row && list.contains(row)) run(matches.findIndex(item => item.command.id === row.dataset.command));
  }, { signal: scope.signal });
  doc.documentElement.addEventListener('talos:lingua', () => render(), { signal: scope.signal });
  return {
    prepare() { field.value = ''; selected = -1; field.setAttribute('aria-expanded', 'true'); render(''); },
    focus() { if (!scope.disposed) field.focus({ preventScroll: true }); },
    dispose() { scope.dispose(); field.removeAttribute('aria-activedescendant'); field.setAttribute('aria-expanded', 'false'); status.remove(); },
  };
}
