/*
 * Un DOM finto per le prove dei disegnatori dei blocchi (interfaccia generativa, 02/11/2026). jsdom non è fra le dipendenze del
 * frontend (vedi `caricamento-vivo.test.mjs`): qui quanto basta ai disegnatori — elementi, SVG, testo, attributi, classi, eventi,
 * e un `querySelectorAll` per selettori semplici (tag, `.classe`, `[attr]`, `[attr="v"]`, discendenti separati da spazio).
 * ⛔ `innerHTML`, `outerHTML` e `insertAdjacentHTML` LANCIANO: un disegnatore che li usasse cadrebbe in ogni prova.
 */
const VIETATO = (nome) => () => { throw new Error(`${nome} non si usa nei blocchi: il testo del modello entra solo come testo`); };

class Nodo extends EventTarget {
  constructor(doc, tag, ns) {
    super();
    this.ownerDocument = doc;
    this.tagName = tag ? (ns ? tag : tag.toUpperCase()) : '#text';
    this.namespaceURI = ns || null;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this._testo = '';
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.type = '';
    const self = this;
    this.classList = {
      get _set() { return new Set(String(self.getAttribute('class') || '').split(/\s+/u).filter(Boolean)); },
      add(...c) { const s = this._set; c.forEach((x) => s.add(x)); self.setAttribute('class', [...s].join(' ')); },
      remove(...c) { const s = this._set; c.forEach((x) => s.delete(x)); self.setAttribute('class', [...s].join(' ')); },
      contains(c) { return this._set.has(c); },
      toggle(c, si) { const ha = this._set.has(c); const vuole = si === undefined ? !ha : si; if (vuole) this.add(c); else this.remove(c); return vuole; },
    };
  }
  get children() { return this.childNodes.filter((n) => n.tagName !== '#text'); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', String(v)); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  get isConnected() { let p = this; while (p.parentNode) p = p.parentNode; return p === this.ownerDocument.body; }
  append(...figli) {
    for (let f of figli) {
      if (typeof f === 'string') f = this.ownerDocument.createTextNode(f);
      if (f.parentNode) f.remove();
      f.parentNode = this;
      this.childNodes.push(f);
    }
  }
  replaceWith(nuovo) { const c = this.parentNode.childNodes; if (nuovo.parentNode) nuovo.remove(); c[c.indexOf(this)] = nuovo; nuovo.parentNode = this.parentNode; this.parentNode = null; }
  replaceChildren(...figli) { for (const f of this.childNodes) f.parentNode = null; this.childNodes = []; this.append(...figli); }
  prepend(...figli) { const resto = this.childNodes; this.childNodes = []; this.append(...figli); for (const f of resto) this.childNodes.push(f); }
  /** Un evento con `bubbles` risale (05/11/2026, cure di G-A): il nodo, i suoi antenati e, se è nella pagina, il documento. */
  dispatchEvent(ev) {
    if (!ev.bubbles) return super.dispatchEvent(ev);
    Object.defineProperty(ev, 'target', { value: this, configurable: true });
    const percorso = [];
    for (let p = this; p; p = p.parentNode) percorso.push(p);
    if (percorso.at(-1) === this.ownerDocument.body) percorso.push(this.ownerDocument);
    for (const n of percorso) {
      EventTarget.prototype.dispatchEvent.call(n, ev);
      if (ev.cancelBubble) break;
    }
    return !ev.defaultPrevented;
  }
  contains(altro) { for (let p = altro; p; p = p.parentNode) if (p === this) return true; return false; }
  closest(selettore) { for (let p = this; p && p.tagName; p = p.parentNode) if (p.matches?.(selettore)) return p; return null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  before(nuovo) { const p = this.parentNode; if (!p) return; if (nuovo.parentNode) nuovo.remove(); p.childNodes.splice(p.childNodes.indexOf(this), 0, nuovo); nuovo.parentNode = p; }
  remove() { if (this.parentNode) { const c = this.parentNode.childNodes; c.splice(c.indexOf(this), 1); this.parentNode = null; } }
  get textContent() { return this.tagName === '#text' ? this._testo : this.childNodes.map((f) => f.textContent).join(''); }
  set textContent(v) { if (this.tagName === '#text') { this._testo = String(v); return; } this.replaceChildren(this.ownerDocument.createTextNode(String(v))); }
  focus() { this.ownerDocument.activeElement = this; }
  set innerHTML(_v) { VIETATO('innerHTML')(); }
  get innerHTML() { return VIETATO('innerHTML')(); }
  set outerHTML(_v) { VIETATO('outerHTML')(); }
  insertAdjacentHTML() { VIETATO('insertAdjacentHTML')(); }
  /** Tutti i discendenti, in ordine. */
  *discendenti() { for (const f of this.children) { yield f; yield* f.discendenti(); } }
  matches(compatto) { return combacia(this, compatto); }
  querySelectorAll(selettore) {
    const passi = selettore.trim().match(/(?:[^\s[\]]+|\[[^\]]*\])+/gu);
    let insieme = [this];
    for (const p of passi) {
      const fuori = new Set();
      for (const radice of insieme) for (const n of radice.discendenti()) if (combacia(n, p)) fuori.add(n);
      insieme = [...fuori];
    }
    return insieme;
  }
  querySelector(s) { return this.querySelectorAll(s)[0] ?? null; }
}

function combacia(n, selettore) {
  if (n.tagName === '#text') return false;
  /* una lista con le virgole: basta un pezzo */
  const pezzi = selettore.split(/,(?![^(]*\))/u).map((x) => x.trim()).filter(Boolean);
  if (pezzi.length > 1) return pezzi.some((p) => combacia(n, p));
  let compatto = pezzi[0] ?? '';
  /* `:not(x)`: il nodo NON deve combaciare con x */
  for (const [intero, dentro] of [...compatto.matchAll(/:not\(([^)]*)\)/gu)]) {
    if (combacia(n, dentro)) return false;
    compatto = compatto.replace(intero, '');
  }
  const tag = compatto.match(/^[a-zA-Z][\w-]*/u)?.[0];
  if (tag && n.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  for (const [, i] of compatto.matchAll(/#([\w-]+)/gu)) if (n.id !== i && n.getAttribute('id') !== i) return false;
  for (const [, c] of compatto.matchAll(/\.([\w-]+)/gu)) if (!n.classList.contains(c)) return false;
  for (const [, k, uguale, virgolette] of compatto.matchAll(/\[([\w-]+)(=(?:"([^"]*)"|[^\]]*))?\]/gu)) {
    /* un valore senza virgolette conta come tra virgolette (`[role=menuitem]`) */
    const v = uguale === undefined ? undefined : (virgolette ?? uguale.slice(1));
    /* `disabled` qui è una proprietà (il DOM vero la riflette nell'attributo) */
    if (k === 'disabled' && v === undefined) { if (!n.disabled && !n.hasAttribute('disabled')) return false; continue; }
    const reale = k.startsWith('data-') ? (n.dataset[k.slice(5).replace(/-([a-z])/gu, (_, x) => x.toUpperCase())] ?? n.getAttribute(k)) : n.getAttribute(k);
    if (reale === null || reale === undefined) return false;
    if (v !== undefined && String(reale) !== v) return false;
  }
  return true;
}

export function documento() {
  /* il documento è un EventTarget: gli eventi che risalgono arrivano fin qui, e chi ascolta «fuori dal menu» li sente */
  const doc = Object.assign(new EventTarget(), {
    createElement: (tag) => new Nodo(doc, tag),
    createElementNS: (ns, tag) => new Nodo(doc, tag, ns),
    createTextNode: (testo) => { const n = new Nodo(doc, null); n._testo = String(testo); return n; },
    activeElement: null,
  });
  doc.body = new Nodo(doc, 'body');
  return doc;
}

export const clic = (n) => n.dispatchEvent(new Event('click', { bubbles: true }));

/**
 * Spento? (G-G2, 06/11/2026, UIG-5.6) I tasti dei blocchi `scelte` e `modulo` si spengono con `aria-disabled="true"`, non con
 * `disabled`: un `<button disabled>` in Chrome non è garantito che riceva `contextmenu`, e il tasto destro deve aprire il menu del
 * blocco. I campi di testo restano `disabled`. Le prove guardano tutte e due.
 */
export const spento = (n) => Boolean(n?.disabled) || n?.getAttribute?.('aria-disabled') === 'true';

/**
 * La voce `id` del menu «⋯» di un blocco (scena 8, 05/11/2026): il menu non vive nel blocco ma nel corpo della pagina, uno solo
 * (`menu-del-blocco.js`). Lo apre se è chiuso e restituisce il tasto vero della voce; `null` se il blocco non ha il menu.
 */
export function voceDelMenu(nodo, id) {
  const tasto = nodo.querySelector('button[aria-haspopup="menu"]');
  if (!tasto) return null;
  if (tasto.getAttribute('aria-expanded') !== 'true') clic(tasto);
  return nodo.ownerDocument.body.querySelector(`#menuDelBlocco button[data-${id}]`);
}
/** Tutte le voci del menu «⋯» del blocco, aperto. */
export function vociDelMenu(nodo) {
  const tasto = nodo.querySelector('button[aria-haspopup="menu"]');
  if (!tasto) return [];
  if (tasto.getAttribute('aria-expanded') !== 'true') clic(tasto);
  return nodo.ownerDocument.body.querySelectorAll('#menuDelBlocco [role="menuitem"]');
}

/** Un orologio finto per `setTimeout`/`setInterval`, come `caricamento-vivo.test.mjs`. */
export function orologio() {
  let ora = 0, prossimo = 1;
  const attese = new Map();
  const timer = {
    setTimeout(fn, ms) { const id = prossimo++; attese.set(id, { fn, quando: ora + (ms || 0) }); return id; },
    clearTimeout(id) { attese.delete(id); },
    setInterval(fn, ms) { const id = prossimo++; attese.set(id, { fn, quando: ora + ms, ogni: ms }); return id; },
    clearInterval(id) { attese.delete(id); },
  };
  const avanza = (ms) => {
    const fine = ora + ms;
    for (;;) {
      let primo = null;
      for (const [id, a] of attese) if (a.quando <= fine && (!primo || a.quando < primo[1].quando)) primo = [id, a];
      if (!primo) break;
      const [id, a] = primo;
      ora = a.quando;
      if (a.ogni) a.quando += a.ogni; else attese.delete(id);
      a.fn();
    }
    ora = fine;
  };
  return { timer, avanza, adesso: () => ora, attese: () => attese.size };
}
