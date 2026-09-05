/*
 * Un DOM finto piccolo per le primitive del design system.
 *
 * ⛔ Capisce un SOTTOINSIEME di selettori CSS — nomi di tag, `[attr="valore"]`,
 * `.classe`, `:not(...)` e le liste separate da virgola — e su qualunque altra
 * forma **LANCIA**. Non torna `null`: un DOM finto che tace su un selettore
 * che non capisce fa passare una prova mentre nel browser l'elemento c'e'.
 * L'errore rumoroso e' l'unica risposta onesta a «non lo so fare».
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
/** Un pezzo di selettore semplice: tag, `.classe`, `[attr="v"]`, `:not(...)`. */
function compilaSemplice(pezzo) {
  const prove = [];
  let resto = pezzo.trim();
  const consuma = (regex, fabbrica) => {
    for (;;) {
      const m = resto.match(regex);
      if (!m) return;
      prove.push(fabbrica(m));
      resto = resto.slice(0, m.index) + resto.slice(m.index + m[0].length);
    }
  };
  consuma(/:not\(([^)]*)\)/, (m) => {
    const dentro = compilaSelettore(m[1]);
    return (el) => !dentro(el);
  });
  consuma(/\[([A-Za-z_:][-A-Za-z0-9_:.]*)(?:="([^"]*)")?\]/, (m) => (el) => (
    m[2] === undefined ? el.getAttribute(m[1]) !== null : el.getAttribute(m[1]) === m[2]
  ));
  consuma(/\.([-A-Za-z0-9_]+)/, (m) => (el) => String(el.className).split(/\s+/).includes(m[1]));
  const tag = resto.trim();
  if (tag) {
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(tag)) {
      throw new Error(`selettore non supportato dal DOM finto: «${pezzo}». Aggiungilo invece di aggirarlo.`);
    }
    prove.push((el) => el.tagName === tag.toUpperCase());
  }
  if (prove.length === 0) throw new Error(`selettore vuoto o non supportato: «${pezzo}»`);
  return (el) => prove.every((prova) => prova(el));
}

/** Il selettore intero, comprese le liste separate da virgola. */
function compilaSelettore(selettore) {
  if (typeof selettore !== 'string' || selettore.trim() === '') {
    throw new Error('selettore mancante');
  }
  if (/[>+~]/.test(selettore)) {
    throw new Error(`combinatori non supportati dal DOM finto: «${selettore}»`);
  }
  /*
   * ⛔ Il combinatore DISCENDENTE (`A B`) non e' supportato, e va detto. Prima
   * lo spazio veniva mangiato e `[data-testid="x"] input` diventava «un
   * elemento che e' insieme quell'attributo E un input» — cioe' nessuno: la
   * prova falliva senza spiegare, e nel browser avrebbe trovato l'elemento.
   * Un finto che non sa una forma lo dichiara, invece di rispondere qualcosa.
   */
  for (const pezzo of selettore.split(',')) {
    if (/\S\s+\S/.test(pezzo.trim())) {
      throw new Error(`combinatore discendente non supportato dal DOM finto: «${pezzo.trim()}». Cerca il contenitore e poi dentro.`);
    }
  }
  const alternative = selettore.split(',').map((pezzo) => compilaSemplice(pezzo));
  return (el) => alternative.some((prova) => prova(el));
}

export function fakeDocument() {
  // `activeElement`: chi ha ricevuto `focus()` per ultimo, come nel browser.
  let attivo = null;
  function creaElemento(tagName) {
    const el = {
      nodeType: 1,
      tagName: String(tagName).toUpperCase(),
      className: '',
      type: '',
      value: '',
      hidden: false,
      selected: false,
      placeholder: '',
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
      // Come nel DOM: profondo, e include SE STESSO.
      contains(nodo) {
        for (let corrente = nodo; corrente; corrente = corrente.parent) if (corrente === el) return true;
        return false;
      },
      remove() {
        if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
        el.parent = null;
      },
      addEventListener(tipo, fn) { el.ascoltatori.set(tipo, [...(el.ascoltatori.get(tipo) || []), fn]); },
      removeEventListener(tipo, fn) { el.ascoltatori.set(tipo, (el.ascoltatori.get(tipo) || []).filter((f) => f !== fn)); },
      /*
       * ⛔ Gli eventi RISALGONO, come nel DOM. Senza la bolla un componente
       * che usa la delega (`list.addEventListener('click', ...)` con
       * `event.target.closest('[role="tab"]')`, che e' come sono scritte le
       * Tabs e il MenuButton) sarebbe impossibile da provare senza conoscere
       * dove sta il listener — e la prova finirebbe per certificare
       * l'implementazione invece del comportamento.
       */
      lancia(tipo, evento = {}) {
        const e = { target: el, ...evento };
        if (e.target === undefined) e.target = el;
        let fermato = false;
        e.stopPropagation = () => { fermato = true; };
        for (let nodo = el; nodo && !fermato; nodo = nodo.parent) {
          e.currentTarget = nodo;
          for (const fn of [...(nodo.ascoltatori.get(tipo) || [])]) fn(e);
        }
        return e;
      },
      focus() { el.focused = true; attivo = el; },
      querySelector(selettore) {
        const prova = compilaSelettore(selettore);
        const cerca = (nodo) => {
          for (const figlio of nodo.children) {
            if (prova(figlio)) return figlio;
            const dentro = cerca(figlio);
            if (dentro) return dentro;
          }
          return null;
        };
        return cerca(el);
      },
      querySelectorAll(selettore) {
        const prova = compilaSelettore(selettore);
        const trovati = [];
        const cerca = (nodo) => { for (const figlio of nodo.children) { if (prova(figlio)) trovati.push(figlio); cerca(figlio); } };
        cerca(el);
        return trovati;
      },
      // Come nel DOM: parte da SE STESSO e risale.
      closest(selettore) {
        const prova = compilaSelettore(selettore);
        for (let nodo = el; nodo; nodo = nodo.parent) if (prova(nodo)) return nodo;
        return null;
      },
    };
    /*
     * ⛔ `id` si RIFLETTE sull'attributo, come nel browser: `el.id = 'x'`
     * produce `id="x"` e un `querySelector('[id="x"]')` lo trova. Tenerlo come
     * proprieta' semplice rendeva cieca la ricerca per id — ed e' esattamente
     * quella che lega una scheda al suo pannello (`aria-controls`).
     */
    Object.defineProperty(el, 'id', {
      get() { return el.attributi.get('id') ?? ''; },
      set(valore) { el.attributi.set('id', String(valore)); },
      enumerable: true,
      configurable: true,
    });

    /*
     * ⛔ `dataset` e gli attributi `data-*` sono LA STESSA COSA nel browser:
     * `el.dataset.tabId = 'x'` produce `data-tab-id="x"`, e un
     * `querySelector('[data-tab-id="x"]')` lo trova. Nel finto erano due
     * depositi separati, quindi la ricerca per attributo sarebbe stata cieca
     * proprio dove il prodotto la usa. Un Proxy li tiene uniti.
     */
    const aTrattini = (nome) => `data-${String(nome).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    el.dataset = new Proxy({}, {
      get: (_, nome) => (typeof nome === 'string' && el.attributi.has(aTrattini(nome)) ? el.attributi.get(aTrattini(nome)) : undefined),
      set: (_, nome, valore) => { el.attributi.set(aTrattini(nome), String(valore)); return true; },
      has: (_, nome) => el.attributi.has(aTrattini(nome)),
      deleteProperty: (_, nome) => { el.attributi.delete(aTrattini(nome)); return true; },
      ownKeys: () => [...el.attributi.keys()].filter((k) => k.startsWith('data-')).map((k) => k.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });

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
  const documento = {
    createElement: creaElemento,
    get activeElement() { return attivo; },
  };
  return documento;
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
