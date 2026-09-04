/*
 * Un DOM finto piccolo per le primitive del design system.
 *
 * ⛔ Conta le scritture di `textContent` in `el.scrittureTesto`: serve a
 * distinguere «non riscritto» da «riscritto uguale», che sul testo non si vede
 * e su una regione live e' la differenza fra un annuncio e cinquanta.
 *
 * ⛔ Modella `parentNode` come fa il browser, e lo AZZERA quando un nodo viene
 * staccato (`remove`, `replaceChildren`). Prima non esisteva affatto: un
 * componente che chiede «sono ancora attaccato?» avrebbe avuto `undefined` per
 * sempre e riattaccato a ogni giro senza che nessuna prova protestasse.
 *
 * ⛔ Modella `textContent` come fa il browser: **assegnarlo cancella i figli**.
 * La prima versione non lo faceva, e ha lasciato passare un componente che
 * scriveva `nodo.textContent = valore` e poi ri-appendeva un figlio contando
 * su quella cancellazione. Un DOM finto piu' permissivo del vero non protegge:
 * mente. Il comportamento nel browser resta coperto dal banco Playwright.
 */
export function fakeDocument() {
  function creaElemento(tagName) {
    const el = {
      nodeType: 1,
      tagName: String(tagName).toUpperCase(),
      className: '',
      id: '',
      type: '',
      value: '',
      hidden: false,
      selected: false,
      placeholder: '',
      dataset: {},
      attributi: new Map(),
      children: [],
      parent: null,
      ascoltatori: new Map(),
      classList: {
        add(...nomi) { el.className = [...new Set(`${el.className} ${nomi.join(' ')}`.trim().split(/\s+/))].filter(Boolean).join(' '); },
      },
      setAttribute(nome, valore) { el.attributi.set(nome, String(valore)); },
      getAttribute(nome) { return el.attributi.has(nome) ? el.attributi.get(nome) : null; },
      removeAttribute(nome) { el.attributi.delete(nome); },
      hasAttribute(nome) { return el.attributi.has(nome); },
      append(...nodi) { for (const n of nodi) { n.parent = el; if (!el.children.includes(n)) el.children.push(n); } },
      prepend(...nodi) { for (const n of nodi) n.parent = el; el.children = [...nodi, ...el.children.filter((c) => !nodi.includes(c))]; },
      insertBefore(nodo, riferimento) {
        nodo.parent = el;
        const i = el.children.indexOf(riferimento);
        el.children.splice(i < 0 ? el.children.length : i, 0, nodo);
      },
      replaceChildren(...nodi) {
        for (const vecchio of el.children) if (!nodi.includes(vecchio)) vecchio.parent = null;
        el.children = nodi;
        for (const n of nodi) n.parent = el;
      },
      contains(nodo) { return el.children.includes(nodo); },
      remove() {
        if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
        el.parent = null;
      },
      addEventListener(tipo, fn) { el.ascoltatori.set(tipo, [...(el.ascoltatori.get(tipo) || []), fn]); },
      removeEventListener(tipo, fn) { el.ascoltatori.set(tipo, (el.ascoltatori.get(tipo) || []).filter((f) => f !== fn)); },
      lancia(tipo, evento) { for (const fn of el.ascoltatori.get(tipo) || []) fn(evento); },
      focus() { el.focused = true; },
    };
    // Il nome vero del DOM. `parent` resta il campo interno che lo regge.
    Object.defineProperty(el, 'parentNode', { get() { return el.parent; }, enumerable: false });
    Object.defineProperty(el, 'parentElement', { get() { return el.parent; }, enumerable: false });
    let testoProprio = '';
    Object.defineProperty(el, 'textContent', {
      get() { return el.children.length ? el.children.map((c) => c.textContent).join('') : testoProprio; },
      set(valore) {
        testoProprio = String(valore ?? '');
        for (const vecchio of el.children) vecchio.parent = null;
        el.children = [];
        // ⛔ Si conta OGNI assegnazione, anche quella che riscrive la stessa
        // stringa: nel browser e' comunque una mutazione, e su una regione
        // live una mutazione e' un annuncio. Una prova che confronta solo il
        // testo non distingue «non riscritto» da «riscritto identico».
        el.scrittureTesto = (el.scrittureTesto || 0) + 1;
      },
      enumerable: true,
    });
    return el;
  }
  return { createElement: creaElemento };
}

/** Il testo come lo leggerebbe una persona: figli compresi. */
export const testoDi = (el) => el.textContent;

/** Cerca in profondità il primo nodo che soddisfa il predicato. */
export function trova(el, predicato) {
  if (predicato(el)) return el;
  for (const figlio of el.children) {
    const trovato = trova(figlio, predicato);
    if (trovato) return trovato;
  }
  return null;
}
