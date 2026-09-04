import { defineComponent } from '../ui/component.js';

/*
 * ⛔ Il CONTRASSEGNO sta sulla scheda, non nel pannello. Ricerca del
 * 05/09/2026: un pannello non attivo porta `hidden` e quindi esce dall'albero
 * di accessibilita' — un avviso scritto li' dentro non esiste per chi ascolta,
 * e nemmeno una regione live messa li' parlerebbe. La scheda invece resta
 * sempre nell'albero. Stesso schema di `nav-item.js`: il numero si vede, la
 * sua unita' e' testo per chi ascolta («Processi, 2 avvisi», non «Processi 2»).
 * Fonti: accessibility.build/guides/accessible-tabs ·
 * a11y-collective.com/blog/accessibility-tab/
 */
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
  /*
   * ⛔ Il secondo giro visivo ha trovato le schede della Topbar disegnate SOPRA
   * il titolo: non era il wrap, era questo contenitore di pannelli VUOTO che
   * dava altezza alla barra. Un componente usato per meta' porta con se' anche
   * la meta' che non serve, e si vede.
   */
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
    panels.hidden = Boolean(props.pannelliAltrove);
    for (const item of items) {
      const selected = item.id === props.value;
      const tab = documentObj.createElement('button');
      tab.type = 'button';
      tab.className = 'talos-tabs__tab';
      tab.id = `${prefix}-tab-${item.id}`;
      tab.dataset.tabId = item.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(selected));
      /*
       * ⛔ `aria-controls` funziona anche quando il pannello sta ALTROVE nel
       * DOM — e' proprio l'attributo che regge quel legame (ricerca
       * 05/09/2026: w3.org/WAI/ARIA/apg/patterns/tabs/ ·
       * developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tab_role).
       * Con `pannelliAltrove` la barra non disegna nessun pannello: li possiede
       * chi la usa, e ogni voce porta l'id del suo. ⛔ Se quell'id non c'e' NON
       * si scrive un `aria-controls` che punta al vuoto: un riferimento
       * appeso e' peggio di un attributo assente.
       */
      if (props.pannelliAltrove) {
        if (item.controls) tab.setAttribute('aria-controls', String(item.controls));
        else tab.removeAttribute('aria-controls');
      } else {
        tab.setAttribute('aria-controls', `${prefix}-panel-${item.id}`);
      }
      tab.tabIndex = selected ? 0 : -1;
      const etichetta = documentObj.createElement('span');
      etichetta.className = 'talos-tabs__label';
      etichetta.textContent = item.label;
      tab.append(etichetta);
      if (item.count !== undefined && item.count !== null) {
        const conto = documentObj.createElement('span');
        conto.className = 'talos-tabs__count';
        const contoValore = documentObj.createElement('span');
        contoValore.textContent = String(item.count);
        const contoUnita = documentObj.createElement('span');
        contoUnita.className = 'sr-only';
        contoUnita.textContent = item.countUnit ? ` ${item.countUnit}` : '';
        conto.append(contoValore, contoUnita);
        tab.append(conto);
      }
      if (props.pannelliAltrove) {
        list.append(tab);
        continue;
      }
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
