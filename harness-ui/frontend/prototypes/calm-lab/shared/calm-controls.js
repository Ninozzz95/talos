/**
 * Calm controls: custom presentation over the existing value/event owners.
 * Original controls are private compatibility bridges, not a second settings store.
 * No external content is inserted as HTML; no global prototype is modified.
 */
const instances = new WeakMap();
const normalise = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export function rangeValue(raw, min = 0, max = 100, step = 1) {
  const low = Number.isFinite(Number(min)) ? Number(min) : 0;
  const high = Math.max(low, Number.isFinite(Number(max)) ? Number(max) : 100);
  const increment = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 1;
  const number = Number.isFinite(Number(raw)) ? Number(raw) : low;
  return Math.min(high, Math.max(low, Number((low + Math.round((number - low) / increment) * increment).toFixed(10))));
}
export function nextEnabled(options, current, direction) {
  for (let n = 1; n <= options.length; n++) {
    const index = (current + direction * n + options.length * 2) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}
export function typeaheadIndex(options, query, current = -1) {
  const needle = normalise(query);
  if (!needle) return -1;
  for (let n = 1; n <= options.length; n++) {
    const i = (current + n + options.length) % options.length;
    if (!options[i].disabled && normalise(options[i].label).startsWith(needle)) return i;
  }
  return -1;
}

export function mountCalmControls(root = globalThis.document, { scope = null } = {}) {
  if (!root?.querySelectorAll) return { refresh() {}, dispose() {} };
  if (instances.has(root)) return instances.get(root);
  const doc = root.ownerDocument || root;
  const win = doc.defaultView;
  const records = new Map();
  const abort = new win.AbortController();
  const signal = abort.signal;
  let serial = 0, openRecord = null, scheduled = false, disposed = false, positionFrame = 0;
  const sources = 'select:not([multiple]),input[type="checkbox"],input[type="range"]';
  const node = (tag, cls) => { const el = doc.createElement(tag); if (cls) el.className = cls; return el; };
  const attr = (el, key, value) => { const text = String(value); if (el.getAttribute(key) !== text) el.setAttribute(key, text); };
  const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  const listen = (el, event, fn, extra = {}) => el.addEventListener(event, fn, { signal, ...extra });
  const eligible = source => !scope || Boolean(source.closest(scope));
  const hidden = source => source.hidden || source.style.display === 'none' || source.style.visibility === 'hidden';
  let live = null;
  function announce(message) {
    if (!live) { live = node('div', 'calm-sr'); live.dataset.calmUi = ''; live.setAttribute('role', 'alert'); (doc.body || root).append(live); }
    live.textContent = message;
  }
  function name(source) {
    if (source.getAttribute('aria-label')) return source.getAttribute('aria-label');
    const linked = (source.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => doc.getElementById(id)?.textContent || '').join(' ').trim();
    if (linked) return linked;
    const labels = [...(source.labels || [])].map(label => {
      const copy = label.cloneNode(true);
      for (const child of copy.querySelectorAll('select,input,button,output,[data-calm-ui],[data-calm-popup]')) child.remove();
      return copy.textContent.trim();
    }).filter(Boolean);
    return labels.join(' ') || source.title || source.id || 'Controllo';
  }
  function options(source) {
    return [...source.options].map((option, index) => ({ index, value: option.value, label: option.label, disabled: option.disabled || (option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled) }));
  }
  function enabled(record) { return !record.source.disabled && !record.source.matches(':disabled') && !record.source.readOnly; }
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    win.queueMicrotask(() => { scheduled = false; if (!disposed) refresh(); });
  }
  function watchProperty(record, key) {
    const source = record.source;
    const own = Object.getOwnPropertyDescriptor(source, key);
    if (own && !own.configurable) return;
    let proto = source, descriptor;
    while (proto && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(proto, key); proto = Object.getPrototypeOf(proto); }
    if (!descriptor?.get || !descriptor?.set) return;
    Object.defineProperty(source, key, { configurable: true, enumerable: descriptor.enumerable, get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); schedule(); } });
    record.restore.push(() => { if (own) Object.defineProperty(source, key, own); else delete source[key]; });
  }
  function close({ focus = false } = {}) {
    const r = openRecord;
    if (!r) return;
    openRecord = null;
    r.popup?.remove(); r.popup = null; r.items = [];
    attr(r.control, 'aria-expanded', false); r.control.removeAttribute('aria-activedescendant');
    r.control.removeAttribute('aria-controls'); r.query = '';
    if (focus && r.control.isConnected) r.control.focus({ preventScroll: true });
  }
  function position() {
    const r = openRecord;
    if (!r?.popup) return;
    if (!r.control.isConnected || !r.control.getClientRects().length || !enabled(r)) { close(); return; }
    const rect = r.control.getBoundingClientRect();
    const margin = 12, width = Math.min(Math.max(rect.width, 224), Math.max(100, win.innerWidth - margin * 2));
    const below = win.innerHeight - rect.bottom - margin - 6, above = rect.top - margin - 6;
    const upward = below < 180 && above > below;
    const available = Math.max(48, Math.min(320, upward ? above : below));
    Object.assign(r.popup.style, { width: width + 'px', maxHeight: available + 'px', left: Math.max(margin, Math.min(rect.left, win.innerWidth - width - margin)) + 'px', top: upward ? 'auto' : Math.max(margin, rect.bottom + 6) + 'px', bottom: upward ? Math.max(margin, win.innerHeight - rect.top + 6) + 'px' : 'auto' });
  }
  function highlight(r, index) {
    r.active = index;
    for (const [i, item] of r.items.entries()) { item.classList.toggle('is-active', i === index); attr(item, 'aria-selected', i === r.source.selectedIndex); }
    const item = r.items[index];
    if (item) {
      attr(r.control, 'aria-activedescendant', item.id);
      const top = item.offsetTop, bottom = top + item.offsetHeight;
      if (top < r.popup.scrollTop) r.popup.scrollTop = top;
      else if (bottom > r.popup.scrollTop + r.popup.clientHeight) r.popup.scrollTop = bottom - r.popup.clientHeight;
    } else r.control.removeAttribute('aria-activedescendant');
  }
  function commit(r, index) {
    const option = options(r.source)[index];
    if (!option || option.disabled || !enabled(r)) return;
    const changed = r.source.selectedIndex !== index;
    close();
    r.source.selectedIndex = index;
    sync(r);
    r.control.focus({ preventScroll: true });
    if (changed) dispatch(r.source, ['input', 'change']);
  }
  function open(r) {
    if (!enabled(r) || hidden(r.source)) return;
    if (openRecord === r) return;
    close(); sync(r);
    openRecord = r; r.query = ''; r.queryAt = 0; r.signature = JSON.stringify(options(r.source));
    const popup = node('div', 'calm-listbox'); popup.dataset.calmPopup = ''; popup.id = r.control.id + '--listbox';
    popup.setAttribute('role', 'listbox'); popup.setAttribute('aria-label', name(r.source));
    const owner = r.control.closest('dialog,[role="dialog"],[role="alertdialog"]') || doc.body;
    owner.append(popup); r.popup = popup;
    attr(r.control, 'aria-controls', popup.id); attr(r.control, 'aria-expanded', true);
    r.items = options(r.source).map(option => {
      const item = node('div', 'calm-option'); item.id = popup.id + '-' + option.index; item.dataset.index = String(option.index);
      item.setAttribute('role', 'option'); item.setAttribute('aria-disabled', String(option.disabled));
      const label = node('span', 'calm-option__label'); label.textContent = option.label;
      const tick = node('span', 'calm-option__tick'); tick.textContent = '✓'; tick.setAttribute('aria-hidden', 'true');
      item.append(label, tick); popup.append(item); return item;
    });
    popup.addEventListener('pointerdown', e => e.preventDefault());
    popup.addEventListener('click', event => { const item = event.target.closest('[data-index]'); if (item) { event.stopPropagation(); commit(r, Number(item.dataset.index)); } });
    const opts = options(r.source), chosen = r.source.selectedIndex;
    position(); highlight(r, chosen >= 0 && !opts[chosen]?.disabled ? chosen : nextEnabled(opts, -1, 1));
  }
  function dispatch(source, events) { for (const type of events) source.dispatchEvent(new win.Event(type, { bubbles: true })); schedule(); }
  function selectKey(r, event) {
    if (event.isComposing || event.ctrlKey || event.metaKey || (event.altKey && !['ArrowDown', 'ArrowUp'].includes(event.key))) return;
    const key = event.key;
    if (key === 'Escape' && openRecord === r) { event.preventDefault(); event.stopImmediatePropagation(); close({ focus: true }); return; }
    if (key === 'Tab') { if (openRecord === r) close(); return; }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault(); event.stopPropagation(); if (openRecord === r) commit(r, r.active); else open(r); return;
    }
    if (event.altKey && key === 'ArrowUp') { event.preventDefault(); close({ focus: true }); return; }
    const navigation = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'];
    if (navigation.includes(key)) {
      event.preventDefault(); event.stopPropagation(); const wasOpen = openRecord === r; open(r);
      if (openRecord !== r) return;
      const opts = options(r.source);
      let next = r.active;
      if (key === 'Home') next = nextEnabled(opts, -1, 1);
      else if (key === 'End') next = nextEnabled(opts, 0, -1);
      else if (wasOpen) { const direction = ['ArrowUp', 'PageUp'].includes(key) ? -1 : 1; for (let n = 0; n < (key.startsWith('Page') ? 10 : 1); n++) next = nextEnabled(opts, next, direction); }
      highlight(r, next); return;
    }
    if (key.length === 1 && !event.altKey) {
      event.preventDefault(); event.stopPropagation(); open(r); if (openRecord !== r) return;
      const now = Date.now(); r.query = now - r.queryAt > 700 ? key : r.query + key; r.queryAt = now;
      const repeated = [...r.query].every(letter => normalise(letter) === normalise(key));
      const index = typeaheadIndex(options(r.source), repeated ? key : r.query, repeated ? r.active : -1);
      if (index >= 0) highlight(r, index);
    }
  }
  function changeRange(r, value, commitChange = false) {
    if (!enabled(r)) return;
    const s = r.source, next = rangeValue(value, s.min || 0, s.max || 100, s.step === 'any' ? .01 : (s.step || 1));
    if (Number(s.value) !== next) { s.value = String(next); sync(r); dispatch(s, commitChange ? ['input', 'change'] : ['input']); }
  }
  function sync(r) {
    const s = r.source, c = r.control;
    attr(c, 'aria-label', name(s)); attr(c, 'aria-disabled', !enabled(r));
    for (const key of ['aria-describedby', 'aria-invalid', 'aria-required']) { const value = s.getAttribute(key); if (value === null) c.removeAttribute(key); else attr(c, key, value); }
    if (s.required) attr(c, 'aria-required', true);
    if (r.invalid) attr(c, 'aria-invalid', true);
    r.wrap.hidden = hidden(s);
    c.tabIndex = enabled(r) && !hidden(s) ? 0 : -1;
    if (c.tagName === 'BUTTON') c.disabled = !enabled(r);
    if (r.kind === 'select') {
      const label = s.options[s.selectedIndex]?.label || '—'; text(r.value, label);
      if (openRecord === r && (!enabled(r) || hidden(s))) close();
    } else if (r.kind === 'check') {
      attr(c, 'aria-checked', s.indeterminate ? 'mixed' : s.checked); r.wrap.classList.toggle('is-checked', s.checked);
    } else {
      const min = Number(s.min || 0), max = Number(s.max || 100), value = Number(s.value);
      attr(c, 'aria-valuemin', min); attr(c, 'aria-valuemax', max); attr(c, 'aria-valuenow', value);
      const unit = s.dataset.unit || ''; attr(c, 'aria-valuetext', value + (unit ? ' ' + unit : ''));
      const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
      const percent = String(ratio * 100) + '%'; if (c.style.getPropertyValue('--calm-range-progress') !== percent) c.style.setProperty('--calm-range-progress', percent);
      text(r.value, String(value) + unit);
    }
  }
  function enhance(source) {
    if (records.has(source) || !eligible(source) || source.closest('[data-calm-popup]')) return;
    const kind = source.tagName === 'SELECT' ? 'select' : source.type === 'checkbox' ? 'check' : 'range';
    const wrap = node('span', 'calm-control calm-control--' + kind); wrap.dataset.calmUi = '';
    const control = node(kind === 'range' ? 'span' : 'button', 'calm-' + kind);
    if (control.tagName === 'BUTTON') control.type = 'button';
    let id = (source.id || 'calm-source-' + (++serial)) + '--calm';
    while (doc.getElementById(id)) id += '-' + (++serial);
    control.id = id; wrap.append(control);
    const r = { source, control, wrap, kind, restore: [], popup: null, items: [], drag: null, listeners: new win.AbortController(), invalid: false };
    const on = (el, event, fn, extra = {}) => el.addEventListener(event, fn, { signal: r.listeners.signal, ...extra });
    records.set(source, r);
    const tab = source.getAttribute('tabindex'), aria = source.getAttribute('aria-hidden');
    source.dataset.calmSource = ''; source.tabIndex = -1; source.setAttribute('aria-hidden', 'true');
    r.restore.push(() => { delete source.dataset.calmSource; if (tab === null) source.removeAttribute('tabindex'); else source.setAttribute('tabindex', tab); if (aria === null) source.removeAttribute('aria-hidden'); else source.setAttribute('aria-hidden', aria); });
    source.after(wrap);
    for (const prop of kind === 'select' ? ['value', 'selectedIndex'] : kind === 'check' ? ['checked', 'indeterminate'] : ['value']) watchProperty(r, prop);
    const oldFocus = Object.getOwnPropertyDescriptor(source, 'focus');
    Object.defineProperty(source, 'focus', { configurable: true, value: opts => control.focus(opts) });
    r.restore.push(() => { if (oldFocus) Object.defineProperty(source, 'focus', oldFocus); else delete source.focus; });
    if (kind === 'select') {
      control.setAttribute('role', 'combobox'); control.setAttribute('aria-haspopup', 'listbox'); control.setAttribute('aria-expanded', 'false');
      r.value = node('span', 'calm-select__value'); const chevron = node('span', 'calm-select__chevron'); chevron.textContent = '⌄'; chevron.setAttribute('aria-hidden', 'true'); control.append(r.value, chevron);
      on(control, 'click', event => { event.preventDefault(); event.stopPropagation(); if (openRecord === r) close(); else open(r); });
      on(control, 'keydown', event => selectKey(r, event));
    } else if (kind === 'check') {
      control.setAttribute('role', source.getAttribute('role') === 'switch' || /Toggle$/.test(source.id) ? 'switch' : 'checkbox');
      const mark = node('span', 'calm-check__mark'); mark.setAttribute('aria-hidden', 'true'); mark.textContent = '✓'; control.append(mark);
      on(control, 'click', event => { event.preventDefault(); event.stopPropagation(); if (!enabled(r)) return; source.indeterminate = false; source.checked = !source.checked; sync(r); dispatch(source, ['input', 'change']); });
    } else {
      control.setAttribute('role', 'slider'); control.setAttribute('aria-orientation', 'horizontal');
      const track = node('span', 'calm-range__track'); const thumb = node('span', 'calm-range__thumb'); track.setAttribute('aria-hidden', 'true'); thumb.setAttribute('aria-hidden', 'true'); control.append(track, thumb);
      r.value = node('span', 'calm-range__value'); r.value.setAttribute('aria-hidden', 'true'); wrap.append(r.value);
      on(control, 'keydown', event => {
        const step = Number(source.step) > 0 ? Number(source.step) : 1, min = Number(source.min || 0), max = Number(source.max || 100);
        const values = { ArrowRight: Number(source.value) + step, ArrowUp: Number(source.value) + step, ArrowLeft: Number(source.value) - step, ArrowDown: Number(source.value) - step, PageUp: Number(source.value) + step * 10, PageDown: Number(source.value) - step * 10, Home: min, End: max };
        if (!(event.key in values) || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault(); event.stopPropagation(); changeRange(r, values[event.key], true);
      });
      on(control, 'pointerdown', event => {
        if (!enabled(r) || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); control.focus(); r.drag?.abort(); r.drag = new win.AbortController();
        const start = source.value, pointerId = event.pointerId;
        const move = e => { if (e.pointerId !== pointerId) return; const rect = control.getBoundingClientRect(); const min = Number(source.min || 0), max = Number(source.max || 100); const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))); changeRange(r, min + ratio * (max - min)); };
        const done = e => { if (e.pointerId !== pointerId) return; if (e.type === 'pointerup') move(e); r.drag?.abort(); r.drag = null; if (source.value !== start) dispatch(source, ['change']); };
        win.addEventListener('pointermove', move, { signal: r.drag.signal }); win.addEventListener('pointerup', done, { signal: r.drag.signal }); win.addEventListener('pointercancel', done, { signal: r.drag.signal });
        move(event);
      });
    }
    on(source, 'invalid', event => {
      event.preventDefault(); r.invalid = true; sync(r);
      control.focus({ preventScroll: true });
      announce(source.validationMessage || 'Valore richiesto.');
    });
    on(source, 'change', () => { if (r.invalid && source.validity.valid) { r.invalid = false; sync(r); } });
    sync(r);
  }
  function remove(r) { if (openRecord === r) close(); r.listeners.abort(); r.drag?.abort(); r.wrap.remove(); r.restore.reverse().forEach(fn => fn()); records.delete(r.source); }
  function refresh() {
    if (disposed) return;
    for (const r of records.values()) if (!r.source.isConnected || !r.wrap.isConnected || !eligible(r.source)) remove(r);
    const areas = scope ? [...root.querySelectorAll(scope)] : [root];
    if (scope && root.matches?.(scope)) areas.unshift(root);
    for (const area of areas) {
      if (area.matches?.(sources)) enhance(area);
      for (const source of area.querySelectorAll(sources)) enhance(source);
    }
    for (const r of records.values()) { if (r.source.nextElementSibling !== r.wrap) r.source.after(r.wrap); sync(r); }
    if (openRecord) {
      const signature = JSON.stringify(options(openRecord.source));
      if (signature !== openRecord.signature) { const r = openRecord; close(); open(r); r.signature = signature; }
      position();
    }
  }
  listen(doc, 'pointerdown', event => { const r = openRecord; if (r && !r.wrap.contains(event.target) && !r.popup?.contains(event.target)) close(); }, { capture: true });
  listen(doc, 'keydown', event => { if (event.key === 'Escape' && openRecord) { event.preventDefault(); event.stopImmediatePropagation(); close({ focus: true }); } }, { capture: true });
  listen(doc, 'focusin', event => { const r = openRecord; if (r && !r.wrap.contains(event.target) && !r.popup?.contains(event.target)) close(); });
  listen(doc, 'click', event => {
    const label = event.target.closest?.('label');
    if (!label || event.target.closest('button,a,[role="slider"],[data-calm-ui]')) return;
    const r = records.get(label.control); if (!r || !enabled(r)) return;
    event.preventDefault(); r.control.focus(); if (r.kind !== 'range') r.control.click();
  }, { capture: true });
  const onValue = event => { if (records.has(event.target)) schedule(); };
  listen(root, 'change', onValue); listen(root, 'input', onValue);
  listen(root, 'reset', event => { if ([...records.keys()].some(s => s.form === event.target)) win.setTimeout(schedule, 0); });
  const reposition = () => { if (openRecord && !positionFrame) positionFrame = win.requestAnimationFrame(() => { positionFrame = 0; position(); }); };
  listen(win, 'resize', reposition); listen(doc, 'scroll', reposition, { capture: true, passive: true });
  // Ignore transcript/canvas paint. Only mutations that can affect this owner matter.
  function relevant(m) {
    const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (target?.closest('[data-calm-ui],[data-calm-popup]')) return false;
    const inScope = !scope || target?.closest(scope);
    if (m.type === 'attributes') {
      if (inScope && (records.has(target) || target?.matches('option,optgroup,label'))) return true;
      return ['hidden', 'disabled', 'inert'].includes(m.attributeName) && [...records.keys()].some(s => target?.contains(s));
    }
    if (inScope && target?.closest('label,select,option,optgroup')) return true;
    if (m.type === 'childList') return [...m.addedNodes, ...m.removedNodes].some(n =>
      n.nodeType === 1 && (n.matches(sources) || n.querySelector(sources) ||
        n.matches('[data-calm-source]') || n.querySelector('[data-calm-source]')));
    return false;
  }
  const observer = new win.MutationObserver(mutations => { if (mutations.some(relevant)) schedule(); });
  observer.observe(root.documentElement || root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled','hidden','selected','checked','value','min','max','step','label','lang','style','data-theme','data-talos-theme','data-talos-color-mode','aria-label','aria-labelledby','aria-describedby','aria-invalid','aria-required','required','inert','readonly'] });
  const api = { refresh, dispose() { if (disposed) return; disposed = true; close(); live?.remove(); abort.abort(); observer.disconnect(); win.cancelAnimationFrame(positionFrame); for (const r of [...records.values()]) remove(r); instances.delete(root); } };
  instances.set(root, api); refresh(); return api;
}
