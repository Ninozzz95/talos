/** DS-04. Owns modal interaction, not the action that opened a dialog or its business outcome. */
import { createScope } from '../../app/lifecycle.ts';
export interface ModalOptions {
  content?: HTMLElement;
  backdrop?: HTMLElement;
  opener?: Element | null;
  initialFocus?: HTMLElement | null;
  requestClose(): void;
}
interface Entry { layer: HTMLElement; content: HTMLElement; opener: Element | null; openerId: string; openerAction: string | null;
  close: () => void; zIndex: string; ariaModal: string | null; backdrop: { node: HTMLElement; tab: string | null; hidden: string | null; z: string } | null; }
export interface OverlayManager {
  activate(layer: HTMLElement, options: ModalOptions): void;
  deactivate(layer: HTMLElement, restore?: boolean): void;
  handleKey(event: KeyboardEvent): boolean;
  requestCloseTop(): boolean;
  readonly depth: number;
  dispose(): void;
}
const managers = new WeakMap<Document, OverlayManager>();
const candidates = 'button,input:not([type="hidden"]),select,textarea,a[href],summary,[tabindex]';
export function modalTabTarget<T>(items: readonly T[], active: T | null, backwards: boolean): T | null {
  if (!items.length) return null;
  if (!items.includes(active as T)) return backwards ? items.at(-1)! : items[0]!;
  if (backwards && active === items[0]) return items.at(-1)!;
  if (!backwards && active === items.at(-1)) return items[0]!;
  return null;
}
export function registeredOverlayManager(doc: Document) { return managers.get(doc); }
export function createOverlayManager(doc: Document): OverlayManager {
  const existing = managers.get(doc); if (existing) return existing;
  const scope = createScope();
  const stack: Entry[] = [];
  const inertBefore = new Map<HTMLElement, boolean>();
  let observer: MutationObserver | null = null;
  let restoring = false;
  const shown = (el: HTMLElement) => el.isConnected && !el.hidden && (el.tagName !== 'DIALOG' || el.hasAttribute('open'));
  const visible = (el: HTMLElement) => shown(el) && !el.closest('[hidden],[inert]') && el.getClientRects().length > 0 && doc.defaultView?.getComputedStyle(el).visibility !== 'hidden';
  const top = () => stack.at(-1);
  /* La base della scala dei modali: `--ui-z-modal` (200 se non dichiarata), +10 per livello. */
  const modalBaseZ = () => Number.parseInt(doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue('--ui-z-modal') || '200', 10) || 200;
  function focusable(entry: Entry): HTMLElement[] {
    return [...entry.content.querySelectorAll<HTMLElement>(candidates)].filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && visible(el));
  }
  // A native modal opened by an independent host keeps the browser's own focus contract.
  function foreignNativeModal() {
    return [...doc.querySelectorAll<HTMLElement>('dialog[open]')].some(el => el.matches(':modal') && !stack.some(e => e.layer === el));
  }
  function releaseInert() { for (const [el, before] of inertBefore) el.inert = before; inertBefore.clear(); }
  function restoreAttribute(el: HTMLElement, name: string, value: string | null) {
    if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
  }
  function refresh() {
    const current = top();
    const wanted = new Set<HTMLElement>();
    if (current && !foreignNativeModal()) {
      for (let node: HTMLElement | null = current.layer; node?.parentElement && node !== doc.body; node = node.parentElement) {
        for (const other of node.parentElement.children) {
          if (other === node || other === current.backdrop?.node || !('inert' in other) || ['SCRIPT', 'STYLE', 'LINK'].includes(other.tagName)) continue;
          wanted.add(other as HTMLElement);
        }
      }
    }
    // Apply only the changed leases; streaming DOM updates must not toggle the whole background.
    for (const [el, before] of inertBefore) if (!wanted.has(el)) { el.inert = before; inertBefore.delete(el); }
    for (const el of wanted) if (!inertBefore.has(el)) { inertBefore.set(el, el.inert); el.inert = true; }
  }
  function focusFirst(entry: Entry, preferred?: HTMLElement | null) {
    const target = preferred && visible(preferred) ? preferred : focusable(entry)[0];
    if (target) { target.focus({ preventScroll: true }); return; }
    // Focus a heading, not the entire dialog, when there is no available control.
    const heading = entry.content.querySelector<HTMLElement>('h1,h2,h3');
    if (heading) { if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
  function restoreFocus(entry: Entry) {
    const owner = entry.opener as HTMLElement | null;
    let target = owner && typeof owner.focus === 'function' && visible(owner) ? owner : null;
    if (!target && entry.openerId) target = doc.getElementById(entry.openerId);
    if (!target && entry.openerAction) target = [...doc.querySelectorAll<HTMLElement>('[data-home-action]')].find(el => el.dataset.homeAction === entry.openerAction) || null;
    const current = top();
    if (current && (!target || !current.content.contains(target))) { focusFirst(current); return; }
    if (target && visible(target)) target.focus({ preventScroll: true });
    /* ⛔ 18/09/2026 — il ripiego era il primo pulsante della barra della workspace, che non esiste
       più (rimossa su ordine dell'owner): ora è la prima voce della barra laterale, che c'è sempre. */
    else if (!current) doc.querySelector<HTMLElement>('.talos-sidebar .talos-nav-item, .talos-sidebar button')?.focus({ preventScroll: true });
  }
  function deactivate(layer: HTMLElement, restore = true) {
    const index = stack.findIndex(e => e.layer === layer); if (index < 0) return;
    const wasTop = index === stack.length - 1;
    const [entry] = stack.splice(index, 1); if (!entry) return;
    entry.layer.style.zIndex = entry.zIndex;
    delete entry.layer.dataset.modalOwned;
    restoreAttribute(entry.content, 'aria-modal', entry.ariaModal);
    if (entry.backdrop) {
      restoreAttribute(entry.backdrop.node, 'tabindex', entry.backdrop.tab);
      restoreAttribute(entry.backdrop.node, 'aria-hidden', entry.backdrop.hidden);
      entry.backdrop.node.style.zIndex = entry.backdrop.z;
    }
    refresh();
    if (!stack.length) { observer?.disconnect(); observer = null; }
    if (restore && wasTop && !scope.disposed) { restoring = true; try { restoreFocus(entry); } finally { restoring = false; } }
  }
  function prune() {
    for (const entry of [...stack].reverse()) if (!shown(entry.layer)) deactivate(entry.layer);
    refresh();
  }
  function activate(layer: HTMLElement, options: ModalOptions) {
    if (scope.disposed) return;
    const old = stack.find(e => e.layer === layer);
    if (old) { old.close = options.requestClose; refresh(); return; }
    const content = options.content || layer;
    const opener = options.opener === undefined ? doc.activeElement : options.opener;
    const entry: Entry = { layer, content, opener, openerId: opener?.id || '', openerAction: opener?.getAttribute('data-home-action') || null,
      close: options.requestClose, zIndex: layer.style.zIndex, ariaModal: content.getAttribute('aria-modal'),
      backdrop: options.backdrop ? { node: options.backdrop, tab: options.backdrop.getAttribute('tabindex'), hidden: options.backdrop.getAttribute('aria-hidden'), z: options.backdrop.style.zIndex } : null };
    stack.push(entry);
    layer.dataset.modalOwned = 'true';
    const baseZ = modalBaseZ();
    layer.style.zIndex = String(baseZ + stack.length * 10);
    if (entry.backdrop) { entry.backdrop.node.tabIndex = -1; entry.backdrop.node.setAttribute('aria-hidden', 'true'); entry.backdrop.node.style.zIndex = String(baseZ + stack.length * 10 - 1); }
    content.setAttribute('aria-modal', 'true');
    refresh();
    const Observer = doc.defaultView?.MutationObserver;
    if (!observer && Observer && doc.body) {
      observer = new Observer(prune); observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open'] });
    }
    focusFirst(entry, options.initialFocus);
  }
  function handleKey(event: KeyboardEvent): boolean {
    const current = top();
    if (!current || event.defaultPrevented || scope.disposed || foreignNativeModal()) return false;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); current.close(); return true; }
    if (event.key !== 'Tab') return false;
    const items = focusable(current), target = modalTabTarget(items, doc.activeElement as HTMLElement, event.shiftKey);
    if (target || !items.length) { event.preventDefault(); if (target) target.focus({ preventScroll: true }); else focusFirst(current); return true; }
    return false;
  }
  doc.addEventListener('focusin', event => {
    const current = top();
    if (!current || restoring || foreignNativeModal() || current.content.contains(event.target as Node)) return;
    restoring = true; try { focusFirst(current); } finally { restoring = false; }
  }, { signal: scope.signal });
  const api = { activate, deactivate, handleKey, requestCloseTop() { const current = top(); if (!current) return false; current.close(); return true; }, get depth() { return stack.length; },
    dispose() { if (scope.disposed) return; scope.dispose(); observer?.disconnect(); observer = null; for (const entry of [...stack].reverse()) deactivate(entry.layer, false); releaseInert(); managers.delete(doc); } };
  managers.set(doc, api); return api;
}
