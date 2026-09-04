/*
 * Un DOM finto piccolo per le primitive del design system.
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
      insertBefore(nodo, riferimento) {
        nodo.parent = el;
        const i = el.children.indexOf(riferimento);
        el.children.splice(i < 0 ? el.children.length : i, 0, nodo);
      },
      replaceChildren(...nodi) { el.children = nodi; for (const n of nodi) n.parent = el; },
      contains(nodo) { return el.children.includes(nodo); },
      remove() { if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); },
      addEventListener(tipo, fn) { el.ascoltatori.set(tipo, [...(el.ascoltatori.get(tipo) || []), fn]); },
      removeEventListener(tipo, fn) { el.ascoltatori.set(tipo, (el.ascoltatori.get(tipo) || []).filter((f) => f !== fn)); },
      lancia(tipo, evento) { for (const fn of el.ascoltatori.get(tipo) || []) fn(evento); },
      focus() { el.focused = true; },
    };
    let testoProprio = '';
    Object.defineProperty(el, 'textContent', {
      get() { return el.children.length ? el.children.map((c) => c.textContent).join('') : testoProprio; },
      set(valore) { testoProprio = String(valore ?? ''); el.children = []; },
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
