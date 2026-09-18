/** Keyed desktop list renderer. No subscription, timer or listener is created per row. */
import { FILTRI_SIDEBAR, modelloRigaSidebar, selezionaRigheSidebar, statoSidebar } from './sidebar-state.js';
import { oraCompatta } from './session-item.js';
import { giriDellaSessione, spiegaGiriFermati } from './consumo-sessione.js';

const text = (node, value) => { const next = String(value ?? ''); if (node.textContent !== next) node.textContent = next; };
const attr = (node, name, value) => {
  if (value === null || value === undefined) { if (node.hasAttribute(name)) node.removeAttribute(name); }
  else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
};
const klass = (node, name, value) => { if (node.classList.contains(name) !== Boolean(value)) node.classList.toggle(name, Boolean(value)); };
const hidden = (node, value) => { if (node.hidden !== Boolean(value)) node.hidden = Boolean(value); };

export function creaVistaSidebar({ root, section, search, state, getContext, onOpen, onMenu, onToggle,
  onPending = () => {}, onRetry = () => {}, onPreferences = () => {}, now = Date.now } = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const entries = new Map(), visible = new Set(), cleanup = [];
  let order = [], desired = [], context = getContext(), pointerInside = false, pendingOrder = false, pendingFilter = false;
  let menu = null, menuId = null, focusedId = null, destroyed = false, frame = null;
  let pending = null, pendingButton = null, lastPendingName = null, selectionSignature = '';
  const signature = ctx => JSON.stringify([ctx.selection, [...(ctx.selected || [])].sort()]);
  const dirty = new Set();
  const element = (tag, cls, value) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (value !== undefined) text(n, value); return n; };
  const listen = (node, type, fn, options) => { node.addEventListener(type, fn, options); cleanup.push(() => node.removeEventListener(type, fn, options)); };
  const icon = id => { const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true'); const use = doc.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#${id}`); svg.append(use); return svg; };
  const sidebar = section.closest('.talos-sidebar');
  sidebar.dataset.sidebarLive = 'true';
  attr(root, 'role', 'list'); attr(root, 'aria-label', 'Sessioni');
  // In icon mode labels remain accessible; the same label is available to pointer users.
  const setNavTip = item => {
    if (!item || !sidebar.contains(item)) return;
    const label = item.querySelector('.talos-nav-item__label')?.textContent?.trim() || item.getAttribute('aria-label');
    if (label) attr(item, 'data-tip', label);
  };
  for (const item of sidebar.querySelectorAll('.talos-nav-item')) setNavTip(item);
  const navTip = event => setNavTip(event.target.closest?.('.talos-nav-item'));
  listen(sidebar, 'pointerover', navTip); listen(sidebar, 'focusin', navTip);
  const head = section.querySelector('.talos-sidebar__block-head');
  const sticky = element('div', 'td-sidebar-sticky');
  section.insertBefore(sticky, root);
  if (head) sticky.append(head);
  const count = head?.querySelector('.talos-nav-item__count');
  if (count) text(count, '—');
  const filter = element('select', 'td-sidebar-filter');
  attr(filter, 'aria-label', 'Filtra sessioni');
  for (const [value, label] of Object.entries(FILTRI_SIDEBAR)) { const opt = element('option', '', label); opt.value = value; filter.append(opt); }
  filter.value = state.local.filter;
  head?.append(filter);
  const info = element('div', 'td-sidebar-feed');
  const connection = element('span', 'td-sidebar-connection'); attr(connection, 'role', 'status'); attr(connection, 'aria-live', 'polite');
  const totals = element('span', 'td-sidebar-totals');
  const retry = element('button', 'talos-button talos-button--ghost talos-button--sm td-sidebar-retry', 'Riprova'); retry.type = 'button';
  info.append(connection, totals, retry); sticky.append(info);
  const compact = element('button', 'td-sidebar-compact-status'); compact.type = 'button';
  const compactCount = element('span'); compact.append(icon('i-list'), compactCount);
  sidebar.insertBefore(compact, sidebar.querySelector('.talos-sidebar__foot'));
  listen(compact, 'click', () => { sidebar.querySelector('#sessionsCollapseBtn')?.click(); search?.focus(); });
  const empty = element('div', 'td-sidebar-empty');
  const emptyText = element('p'); attr(emptyText, 'role', 'status');
  const reset = element('button', 'talos-button talos-button--secondary talos-button--sm', 'Mostra tutte'); reset.type = 'button';
  empty.append(emptyText, reset); section.append(empty);
  const observer = typeof win.IntersectionObserver === 'function' ? new win.IntersectionObserver(changes => {
    for (const change of changes) {
      const id = change.target.dataset.sidebarId;
      if (change.isIntersecting) { visible.add(id); dirty.add(id); } else visible.delete(id);
    }
    requestPaint();
  }, { root: section }) : null;

  function create(id) {
    const row = element('div', 'td-session-row td-session-live-row'); row.dataset.sidebarId = id; attr(row, 'role', 'listitem');
    const check = element('input', 'talos-checkbox td-session-check'); check.type = 'checkbox'; check.dataset.sessionSelect = id;
    const open = element('button', 'talos-session-item real-session-item td-session-open'); open.type = 'button'; open.dataset.realSessionId = id; open.dataset.sidebarAction = 'open';
    const content = element('span', 'td-session-content');
    const title = element('span', 'talos-session-item__title');
    const titleLine = element('span', 'td-session-title-line'), pin = element('span', 'td-session-pin', 'Fissata');
    titleLine.append(title, pin);
    const sub = element('span', 'talos-session-item__sub');
    const status = element('span', 'td-session-status'); const glyph = icon('i-clock'); const label = element('span', 'talos-session-item__state');
    status.append(glyph, label);
    const detail = element('span', 'td-session-detail');
    sub.append(status, detail); content.append(titleLine, sub);
    const aside = element('span', 'talos-session-item__aside');
    const time = element('span', 'td-session-time'); const metric = element('span', 'td-session-metric');
    aside.append(time, metric); open.append(content, aside);
    const more = element('button', 'td-session-menu'); more.type = 'button'; more.dataset.sidebarAction = 'menu';
    attr(more, 'aria-haspopup', 'menu'); attr(more, 'aria-expanded', 'false'); more.append(icon('i-more'));
    row.append(check, open, more);
    const entry = { row, open, check, more, title, pin, sub, status, glyph: glyph.firstChild, label, detail, time, metric, depth: 0, distinct: null };
    entries.set(id, entry); observer?.observe(row);
    return entry;
  }
  function childCounts() {
    const counts = new Map();
    for (const row of state.rows.values()) {
      if (!statoSidebar(row).active) continue;
      const visited = new Set([row.sessionId]); let parent = row.padreId;
      while (parent && state.rows.has(parent) && !visited.has(parent)) {
        visited.add(parent); counts.set(parent, (counts.get(parent) || 0) + 1); parent = state.rows.get(parent).padreId;
      }
    }
    return counts;
  }
  let activeChildren = new Map();
  function patch(id) {
    const e = entries.get(id), row = state.rows.get(id);
    if (!e || !row) return;
    const current = id === context.current;
    const m = modelloRigaSidebar(row, { now: now(), current, unread: current ? 0 : state.unread(id), pinned: state.local.pinned.has(id),
      childrenActive: activeChildren.get(id) || 0, fresh: state.freshness === 'live', nomeDistintivo: e.distinct });
    text(e.title, m.name); hidden(e.pin, !m.pinned); text(e.label, m.state.label); text(e.detail, m.detail);
    hidden(e.detail, !m.detail);
    attr(e.glyph, 'href', `#${m.state.icon}`);
    attr(e.row, 'data-tone', m.state.tone); attr(e.row, 'data-current', current ? 'true' : null);
    attr(e.row, 'data-pinned', m.pinned ? 'true' : null); attr(e.row, 'data-unread', m.unread > 0 ? 'true' : null);
    attr(e.open, 'data-session-state', m.state.key); attr(e.open, 'aria-current', current ? 'true' : null);
    attr(e.open, 'aria-label', `${state.freshness !== 'live' ? 'Dati non aggiornati, ' : ''}${m.accessibleName}${e.depth ? ', sotto-agente' : ''}${m.pinned ? ', fissata' : ''}`);
    attr(e.open, 'data-tip', m.tooltip); attr(e.status, 'data-tip', m.tooltip);
    attr(e.more, 'aria-label', `Azioni per ${m.name}`); attr(e.more, 'data-tip', `Azioni per ${m.name}`);
    attr(e.check, 'aria-label', `Seleziona ${m.name}`);
    const selected = context.selected?.has(id) === true;
    if (e.check.checked !== selected) e.check.checked = selected;
    hidden(e.check, !context.selection); hidden(e.more, context.selection);
    klass(e.row, 'td-session-selection', context.selection); klass(e.row, 'is-selected', selected);
    klass(e.open, 'is-selected', selected);
    const time = m.state.active && state.freshness === 'live' && m.elapsed ? m.elapsed : oraCompatta(row.avviataAlle, new Date(now()));
    text(e.time, time);
    const metric = m.unread > 0 ? `${m.unread} nuov${m.unread === 1 ? 'a' : 'e'}` : m.giri !== null ? `${m.giri} gir${m.giri === 1 ? 'o' : 'i'}` : '';
    text(e.metric, metric); attr(e.metric, 'data-unread', m.unread > 0 ? 'true' : null);
    const fermati = giriDellaSessione(row).fermati;
    attr(e.metric, 'title', !m.unread && fermati > 0 ? spiegaGiriFermati(fermati) : null);
    // Keep the existing tooltip current only when this row actually owns it.
    if (e.open.getAttribute('aria-describedby') === 'talosTip' || e.status.getAttribute('aria-describedby') === 'talosTip') {
      const tip = doc.getElementById('talosTip');
      if (tip && !tip.hidden) text(tip.querySelector('[data-tip-testo]') || tip, m.tooltip);
    }
  }
  function locked() { return pointerInside || root.contains(doc.activeElement) || Boolean(menu); }
  function roving(id = focusedId || context.current) {
    const available = order.filter(key => entries.has(key) && !entries.get(key).row.hidden);
    const active = available.includes(id) ? id : available.includes(context.current) ? context.current : available[0];
    focusedId = active || null;
    for (const [key, e] of entries) {
      const tab = key === active ? 0 : -1;
      if (e.open.tabIndex !== tab) e.open.tabIndex = tab;
      if (e.more.tabIndex !== tab) e.more.tabIndex = tab;
      if (e.check.tabIndex !== tab) e.check.tabIndex = tab;
    }
  }
  function place() {
    if (locked() && order.length) { pendingOrder = true; return; }
    const scroll = section.scrollTop;
    // Append/insert only the nodes whose position changed; unchanged updates do
    // not remove a single node and never reset a native control's state.
    let anchor = pending ? pending.nextSibling : root.firstChild;
    for (const id of desired) {
      const node = entries.get(id)?.row;
      if (!node) continue;
      if (node !== anchor) root.insertBefore(node, anchor);
      anchor = node.nextSibling;
    }
    order = [...desired]; pendingOrder = false;
    if (section.scrollTop !== scroll) section.scrollTop = scroll;
    roving();
  }
  function paint() {
    frame = null;
    if (destroyed || doc.visibilityState === 'hidden') return;
    for (const id of dirty) patch(id);
    dirty.clear();
    if (pendingFilter && !locked()) { pendingFilter = false; sync({ filter: true }); }
    if (pendingOrder && !locked()) place();
  }
  function requestPaint() {
    if (!destroyed && frame === null && doc.visibilityState !== 'hidden') frame = win.requestAnimationFrame(paint);
  }
  function pendingRow() {
    const name = context.pendingName;
    if (name === null || name === undefined) { pending?.remove(); pending = null; pendingButton = null; lastPendingName = null; return; }
    if (!pending) {
      pending = element('div'); attr(pending, 'role', 'listitem');
      pendingButton = element('button', 'talos-session-item real-session-item is-pending td-session-pending'); pendingButton.type = 'button';
      pendingButton.dataset.sidebarAction = 'pending'; attr(pendingButton, 'aria-current', 'true'); pending.append(pendingButton); root.prepend(pending);
    }
    if (name !== lastPendingName) { text(pendingButton, `Nuova · ${name || 'sessione'} · in attesa del primo messaggio`); lastPendingName = name; }
  }
  function status() {
    const texts = { caricamento: 'Caricamento…', connessione: 'Connessione…', live: 'Live', riconnessione: 'Riconnessione…',
      offline: 'Offline', stale: 'Non aggiornato', errore: 'Non disponibile' };
    attr(sidebar, 'data-sidebar-connection', state.freshness);
    text(connection, texts[state.freshness] || texts.stale);
    hidden(retry, state.freshness === 'live' || state.freshness === 'caricamento' || state.freshness === 'connessione');
    attr(root, 'aria-busy', !state.loaded && ['caricamento', 'connessione'].includes(state.freshness) ? 'true' : 'false');
    if (count) text(count, state.loaded ? state.rows.size : '—');
    const values = [...state.rows.values()].map(statoSidebar);
    const active = values.filter(s => s.active).length, waiting = values.filter(s => s.attention).length;
    text(totals, state.loaded ? `${active} attive${waiting ? ` · ${waiting} da vedere` : ''}` : '');
    text(compactCount, state.loaded ? active : '—');
    const compactName = `${texts[state.freshness] || texts.stale}: ${state.loaded ? `${active} sessioni attive${waiting ? `, ${waiting} da vedere` : ''}` : 'sessioni in caricamento'}. Espandi la barra per vederle.`;
    attr(compact, 'aria-label', compactName); attr(compact, 'data-tip', compactName);
    attr(totals, 'data-tip', state.freshness === 'live' ? 'Conteggi delle sessioni sincronizzate' : 'Conteggi dell’ultima copia ricevuta; potrebbero essere cambiati');
    const shown = desired.filter(id => entries.has(id) && !entries.get(id).row.hidden).length;
    hidden(empty, shown > 0 || Boolean(pending));
    const filtered = Boolean(search?.value.trim()) || state.local.filter !== 'tutte';
    text(emptyText, !state.loaded ? ['errore', 'offline', 'stale'].includes(state.freshness) ? 'Impossibile caricare le sessioni. Riprova quando la connessione è disponibile.' : 'Caricamento delle sessioni…'
      : filtered ? 'Nessuna sessione corrisponde al filtro.' : 'Nessuna sessione ancora. Usa Nuova per iniziare.');
    hidden(reset, !state.loaded || !filtered);
  }
  function sync(result = {}) {
    if (destroyed) return;
    const old = context; context = getContext();
    pendingRow();
    const nextChildren = childCounts();
    for (const id of new Set([...activeChildren.keys(), ...nextChildren.keys()])) {
      if (activeChildren.get(id) !== nextChildren.get(id)) dirty.add(id);
    }
    activeChildren = nextChildren;
    for (const id of result.removed || []) {
      const e = entries.get(id); if (!e) continue;
      const hadFocus = e.row.contains(doc.activeElement), oldIndex = order.indexOf(id);
      const wasCheckbox = doc.activeElement === e.check;
      if (menuId === id) { menu?.chiudi?.(); menu = null; menuId = null; }
      observer?.unobserve(e.row); visible.delete(id); entries.delete(id); e.row.remove();
      order = order.filter(key => key !== id);
      if (hadFocus) {
        focusedId = null;
        const neighbors = [...order.slice(oldIndex), ...order.slice(0, oldIndex).reverse()];
        const next = neighbors.map(key => entries.get(key)).find(item => item && !item.row.hidden);
        (wasCheckbox && context.selection ? next?.check : next?.open)?.focus({ preventScroll: true });
        if (!next) search?.focus({ preventScroll: true });
      }
    }
    const nextSignature = signature(context);
    const selectionChanged = selectionSignature !== nextSignature; selectionSignature = nextSignature;
    const currentChanged = old.current !== context.current;
    if (currentChanged) { dirty.add(old.current); dirty.add(context.current); }
    const recalc = result.structure || result.snapshot || result.filter || !desired.length || (result.changed?.size && (search?.value.trim() || state.local.filter !== 'tutte'));
    if (recalc) {
      const rows = selezionaRigheSidebar(state, { query: search?.value || '' });
      desired = rows.map(item => item.sessione.sessionId);
      for (const item of rows) {
        const id = item.sessione.sessionId;
        let e = entries.get(id);
        if (!e) { e = create(id); root.append(e.row); order.push(id); dirty.add(id); }
        // Realtime must not remove a focused/hovered action under the user's hands.
        // Explicit search/filter changes are intentional; server-driven filtering waits.
        if (locked() && !result.filter && e.row.hidden !== item.hidden) pendingFilter = true;
        else hidden(e.row, item.hidden);
        if (e.depth !== item.profondita || e.distinct !== item.nomeDistintivo) { e.depth = item.profondita; e.distinct = item.nomeDistintivo; dirty.add(id); }
        attr(e.row, 'data-depth', item.profondita);
        if (e.row.style.getPropertyValue('--talos-delega-livello') !== String(item.profondita)) e.row.style.setProperty('--talos-delega-livello', String(item.profondita));
        attr(e.row, 'data-tree-last', item.ultima ? 'true' : null);
        attr(e.row, 'data-filter-context', item.context ? 'true' : null);
      }
      pendingOrder = true; place();
    }
    for (const id of result.changed || []) dirty.add(id);
    // Ancestor activity summaries depend on the changed child's state.
    if (selectionChanged || result.connection) for (const id of entries.keys()) dirty.add(id);
    roving(); status(); requestPaint();
  }
  function openMenu(event, id, keyboard = false) {
    const e = entries.get(id), row = state.rows.get(id);
    if (!e || !row || context.selection) return;
    event?.preventDefault(); event?.stopPropagation();
    menu?.chiudi?.(); menuId = id;
    menu = onMenu(row, e.more, event, keyboard, () => { menu = null; menuId = null; requestPaint(); });
  }
  listen(root, 'click', event => {
    const target = event.target.closest('[data-sidebar-action]'); if (!target) return;
    const action = target.dataset.sidebarAction;
    if (action === 'pending') { onPending(); return; }
    const id = target.closest('[data-sidebar-id]')?.dataset.sidebarId;
    const row = state.rows.get(id); if (!row) return;
    if (action === 'menu') { openMenu(event, id, event.detail === 0); return; }
    if (context.selection) onToggle(id, !context.selected?.has(id)); else onOpen(row);
  });
  listen(root, 'change', event => {
    const id = event.target.dataset.sessionSelect;
    if (id && state.rows.has(id)) onToggle(id, event.target.checked);
  });
  listen(root, 'contextmenu', event => { const id = event.target.closest('[data-sidebar-id]')?.dataset.sidebarId; if (id) openMenu(event, id); });
  listen(root, 'keydown', event => {
    const id = event.target.closest('[data-sidebar-id]')?.dataset.sidebarId;
    if (!id) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { openMenu(event, id, true); return; }
    const ids = order.filter(key => entries.has(key) && !entries.get(key).row.hidden);
    const i = ids.indexOf(id); if (i < 0) return;
    const next = event.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : event.key === 'ArrowUp' ? Math.max(0, i - 1)
      : event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); roving(ids[next]);
    const e = entries.get(ids[next]); (event.target.matches('input') && context.selection ? e.check : e.open).focus();
  });
  listen(root, 'focusin', event => { const id = event.target.closest('[data-sidebar-id]')?.dataset.sidebarId; if (id) roving(id); });
  listen(root, 'focusout', () => { win.queueMicrotask(() => { if (!destroyed) requestPaint(); }); });
  listen(root, 'pointerenter', () => { pointerInside = true; });
  listen(root, 'pointerleave', () => { pointerInside = false; requestPaint(); });
  listen(filter, 'change', () => { state.local.filter = filter.value; onPreferences(); sync({ filter: true }); });
  if (search) listen(search, 'input', () => sync({ filter: true }));
  listen(reset, 'click', () => { if (search) search.value = ''; state.local.filter = 'tutte'; filter.value = 'tutte'; onPreferences(); sync({ filter: true }); search?.focus(); });
  listen(retry, 'click', onRetry);
  sync({ snapshot: true });
  return {
    sync,
    tick() {
      if (doc.visibilityState === 'hidden' || sidebar.getClientRects().length === 0) return;
      // One clock, only visible rows. IntersectionObserver is a viewport hint, not a data source.
      const ids = observer ? visible : order.filter(id => { const box = entries.get(id)?.row.getBoundingClientRect(); const viewport = section.getBoundingClientRect(); return box && box.bottom >= viewport.top && box.top <= viewport.bottom; });
      for (const id of ids) if (!entries.get(id)?.row.hidden) dirty.add(id);
      requestPaint();
    },
    destroy() {
      if (destroyed) return; destroyed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      observer?.disconnect(); menu?.chiudi?.();
      for (const remove of cleanup) remove();
      info.remove(); empty.remove(); filter.remove(); compact.remove();
      if (head) section.insertBefore(head, sticky); sticky.remove();
      for (const entry of entries.values()) entry.row.remove();
      pending?.remove(); delete sidebar.dataset.sidebarLive;
      entries.clear(); visible.clear(); dirty.clear();
    },
  };
}
