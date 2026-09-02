import { createFloatingPositioner } from './floating-position.js';

let menuSequence = 0;

export function createMenuButton(initialProps = {}) {
  const documentObj = initialProps.document || globalThis.document;
  const root = documentObj.createElement('span');
  root.className = 'talos-menu';
  const trigger = documentObj.createElement('button');
  trigger.type = 'button';
  trigger.className = 'talos-button talos-button--secondary talos-button--md';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = documentObj.createElement('div');
  const menuId = `talos-menu-${++menuSequence}`;
  menu.id = menuId;
  menu.className = 'talos-menu__surface';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  trigger.setAttribute('aria-controls', menuId);
  root.append(trigger, menu);
  let props = { placement: 'bottom-start', ...initialProps };
  let open = false;
  let destroyed = false;
  const positioner = createFloatingPositioner({ reference: trigger, floating: menu, placement: props.placement });

  function items() { return [...menu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')]; }
  function focusAt(index) {
    const candidates = items();
    candidates[(index + candidates.length) % candidates.length]?.focus();
  }
  function setOpen(next, focus = null) {
    if (destroyed || open === next) return false;
    open = next;
    trigger.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    menu.dataset.state = open ? 'open' : 'closed';
    if (open) {
      positioner.start();
      void positioner.update();
      queueMicrotask(() => { if (focus === 'first') focusAt(0); else if (focus === 'last') focusAt(items().length - 1); });
    } else {
      positioner.stop();
      if (focus === 'trigger') trigger.focus({ preventScroll: true });
    }
    return true;
  }
  function render() {
    if (!String(props.label || '').trim()) throw new TypeError('MenuButton richiede un nome');
    if (!Array.isArray(props.items) || props.items.length === 0) throw new TypeError('MenuButton richiede voci');
    trigger.textContent = props.label;
    if (props.testId) trigger.dataset.testid = props.testId;
    menu.setAttribute('aria-label', props.label);
    menu.replaceChildren();
    for (const item of props.items) {
      const button = documentObj.createElement('button');
      button.type = 'button';
      button.className = 'talos-menu__item';
      button.setAttribute('role', 'menuitem');
      button.dataset.menuId = String(item.id);
      button.textContent = String(item.label);
      button.tabIndex = -1;
      if (item.disabled) button.setAttribute('aria-disabled', 'true');
      menu.append(button);
    }
  }
  const onTriggerClick = () => setOpen(!open, open ? 'trigger' : 'first');
  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true, event.key === 'ArrowDown' ? 'first' : 'last');
    }
  };
  const onMenuKeyDown = (event) => {
    const current = event.target.closest?.('[role="menuitem"]');
    if (!current) return;
    const candidates = items();
    const index = candidates.indexOf(current);
    if (event.key === 'ArrowDown') { event.preventDefault(); focusAt(index + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusAt(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusAt(0); }
    else if (event.key === 'End') { event.preventDefault(); focusAt(candidates.length - 1); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false, 'trigger'); }
    else if (event.key === 'Tab') setOpen(false);
  };
  const onMenuClick = (event) => {
    const item = event.target.closest?.('[role="menuitem"]');
    if (!item || item.getAttribute('aria-disabled') === 'true') return;
    const selected = props.items.find((candidate) => String(candidate.id) === item.dataset.menuId);
    selected?.onSelect?.(selected);
    props.onSelect?.(selected);
    setOpen(false, 'trigger');
  };
  const onOutside = (event) => { if (open && !root.contains(event.target)) setOpen(false); };
  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeyDown);
  menu.addEventListener('keydown', onMenuKeyDown);
  menu.addEventListener('click', onMenuClick);
  documentObj.addEventListener('pointerdown', onOutside, true);
  render();
  return Object.freeze({
    element: root,
    open: (focus = 'first') => setOpen(true, focus),
    close: (returnFocus = false) => setOpen(false, returnFocus ? 'trigger' : null),
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      positioner.destroy();
      trigger.removeEventListener('click', onTriggerClick);
      trigger.removeEventListener('keydown', onTriggerKeyDown);
      menu.removeEventListener('keydown', onMenuKeyDown);
      menu.removeEventListener('click', onMenuClick);
      documentObj.removeEventListener('pointerdown', onOutside, true);
      root.remove();
      return true;
    },
  });
}

