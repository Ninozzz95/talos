import { defineComponent } from '../ui/component.js';

let tabsSequence = 0;

function normalizedItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new TypeError('Tabs richiede almeno una voce');
  const ids = new Set();
  return items.map((item) => {
    const id = String(item?.id || '');
    const label = String(item?.label || '');
    if (!id || !label || ids.has(id)) throw new TypeError('Tabs contiene id o label non validi');
    ids.add(id);
    return { ...item, id, label };
  });
}

export const createTabs = defineComponent('Tabs', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const root = documentObj.createElement('section');
  root.className = 'talos-tabs';
  const list = documentObj.createElement('div');
  list.className = 'talos-tabs__list';
  list.setAttribute('role', 'tablist');
  const panels = documentObj.createElement('div');
  panels.className = 'talos-tabs__panels';
  root.append(list, panels);
  const prefix = `talos-tabs-${++tabsSequence}`;
  let props = { activation: 'manual', orientation: 'horizontal', ...initialProps };

  function activate(id) {
    if (id === props.value) return;
    props.onChange?.(id);
  }

  function render() {
    const items = normalizedItems(props.items);
    if (!items.some((item) => item.id === props.value)) throw new TypeError('Tabs value non osservato');
    if (!['manual', 'automatic'].includes(props.activation)) throw new TypeError('attivazione Tabs non valida');
    const focusedId = list.contains(documentObj.activeElement)
      ? documentObj.activeElement?.dataset?.tabId
      : null;
    list.setAttribute('aria-label', String(props.label || 'Viste'));
    list.setAttribute('aria-orientation', props.orientation);
    list.replaceChildren();
    panels.replaceChildren();
    for (const item of items) {
      const selected = item.id === props.value;
      const tab = documentObj.createElement('button');
      tab.type = 'button';
      tab.className = 'talos-tabs__tab';
      tab.id = `${prefix}-tab-${item.id}`;
      tab.dataset.tabId = item.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('aria-controls', `${prefix}-panel-${item.id}`);
      tab.tabIndex = selected ? 0 : -1;
      tab.textContent = item.label;
      const panel = documentObj.createElement('section');
      panel.className = 'talos-tabs__panel';
      panel.id = `${prefix}-panel-${item.id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.hidden = !selected;
      if (typeof item.content === 'string') panel.textContent = item.content;
      else if (item.content) panel.append(item.content);
      list.append(tab);
      panels.append(panel);
    }
    if (focusedId) list.querySelector(`[data-tab-id="${focusedId}"]`)?.focus({ preventScroll: true });
  }

  const onClick = (event) => {
    const tab = event.target.closest?.('[role="tab"]');
    if (tab && list.contains(tab)) activate(tab.dataset.tabId);
  };
  const onKeyDown = (event) => {
    const tab = event.target.closest?.('[role="tab"]');
    if (!tab || !list.contains(tab)) return;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(tab);
    let nextIndex = null;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else if ((props.orientation === 'vertical' && event.key === 'ArrowDown') || (props.orientation !== 'vertical' && event.key === 'ArrowRight')) nextIndex = (index + 1) % tabs.length;
    else if ((props.orientation === 'vertical' && event.key === 'ArrowUp') || (props.orientation !== 'vertical' && event.key === 'ArrowLeft')) nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (nextIndex !== null) {
      event.preventDefault();
      tabs[nextIndex].focus();
      if (props.activation === 'automatic') activate(tabs[nextIndex].dataset.tabId);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && props.activation === 'manual') {
      event.preventDefault();
      activate(tab.dataset.tabId);
    }
  };
  list.addEventListener('click', onClick);
  list.addEventListener('keydown', onKeyDown);
  render();
  return {
    element: root,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { list.removeEventListener('click', onClick); list.removeEventListener('keydown', onKeyDown); root.remove(); },
  };
});
