import test from 'node:test';
import assert from 'node:assert/strict';

/*
 * BUG-11 (owner 05/10/2026) — SONDA: dopo «Aggiungi» (pulsante [data-nuova]) la lista
 * della sezione resta popolata. Con lo strumento finto DOM si monta la sezione Memoria
 * esattamente come la aggancia legacy/app.js (caricaPannelloMemoria → aggiornaPaginaMemoria).
 */

/* ───────────────────────────────── finto DOM ───────────────────────────────── */

function rimuoviFiglio(padre, figlio) {
  const i = padre.children.indexOf(figlio);
  if (i >= 0) padre.children.splice(i, 1);
}

function sincronizzaDataset(nodo, nome, valore) {
  const chiave = nome.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (valore === '' || valore === undefined) nodo.dataset[chiave] = '';
  else nodo.dataset[chiave] = String(valore);
}

function creaElemento(tag, doc) {
  const attributi = new Map();
  const ascolti = new Map();
  const figli = [];
  const nodo = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    children: figli,
    dataset: {},
    /* ⛔ Il DOM vero espone CSSStyleDeclaration anche sull'oggetto `style`: il componente scrive
       `--td-larghezza-dettaglio` (sezione-elenco-dettaglio, `costruisciScheletro`). Il finto la
       simula con una mappa: setProperty registra, getPropertyValue rilegge. */
    style: {
      _dichiarazioni: {},
      setProperty(nome, valore) { this._dichiarazioni[String(nome)] = String(valore); },
      getPropertyValue(nome) { return this._dichiarazioni[String(nome)] ?? ''; },
    },
    hidden: false,
    disabled: false,
    checked: false,
    indeterminate: false,
    tabIndex: 0,
    value: '',
    title: '',
    parentNode: null,
    ownerDocument: doc,
    append(...nuovi) {
      for (const n of nuovi) {
        if (!n || typeof n !== 'object' || n.nodeType === undefined) continue;
        if (n.parentNode) rimuoviFiglio(n.parentNode, n);
        n.parentNode = nodo;
        figli.push(n);
      }
    },
    replaceChildren(...nuovi) {
      for (const n of [...figli]) n.parentNode = null;
      figli.length = 0;
      nodo.append(...nuovi);
    },
    replaceWith(...nuovi) {
      const p = nodo.parentNode;
      if (!p) return;
      const i = p.children.indexOf(nodo);
      p.children.splice(i, 1, ...nuovi);
      for (const n of nuovi) n.parentNode = p;
      nodo.parentNode = null;
    },
    remove() {
      if (nodo.parentNode) rimuoviFiglio(nodo.parentNode, nodo);
      nodo.parentNode = null;
    },
    setAttribute(nome, valore) {
      attributi.set(String(nome), String(valore));
      if (String(nome).startsWith('data-')) sincronizzaDataset(nodo, String(nome), String(valore));
    },
    getAttribute(nome) { return attributi.has(String(nome)) ? attributi.get(String(nome)) : null; },
    removeAttribute(nome) { attributi.delete(String(nome)); },
    hasAttribute(nome) { return attributi.has(String(nome)); },
    addEventListener(tipo, f) { if (!ascolti.has(tipo)) ascolti.set(tipo, []); ascolti.get(tipo).push(f); },
    removeEventListener(tipo, f) { const l = ascolti.get(tipo); if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } },
    emit(tipo, evento = {}) {
      for (const f of [...(ascolti.get(tipo) || [])]) {
        f({ target: nodo, currentTarget: nodo, preventDefault() {}, stopPropagation() {}, ...evento });
      }
    },
    click() { nodo.emit('click'); },
    focus() { doc._attivo = nodo; },
    blur() { if (doc._attivo === nodo) doc._attivo = null; },
    getClientRects() { return [nodo]; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 120, height: 40, top: 0, left: 0, right: 120, bottom: 40 }; },
    querySelector(sel) { return seleziona(nodo, sel)[0] || null; },
    querySelectorAll(sel) { return seleziona(nodo, sel); },
    matches(sel) { return combaciaComplesso(nodo, sel, nodo); },
    closest(sel) {
      for (let n = nodo; n; n = n.parentNode) {
        if (n.nodeType === 1 && combaciaComplesso(n, sel, n)) return n;
      }
      return null;
    },
    /* ⛔ BUG-11 (cura gen.2): il finto elemento NON ha `animate`. `motion()` di motion-mockup.js
       esce alla PRIMA guardia (`typeof elemento.animate !== 'function'`) e torna `null` — che qui
       è una risposta, non un errore. Un `animate` fintizio che tornasse `null` (o un oggetto
       incompleto) farebbe invece cadere `motion` su `animazione.finished` al primo dettaglio che
       si apre, e il banco mentirebbe su dove il difetto sta. */
    get classList() { return listaClassi(nodo); },
    get className() { return attributi.get('class') || ''; },
    set className(v) { attributi.set('class', String(v)); },
    get textContent() { return figli.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); },
    set textContent(v) {
      for (const c of [...figli]) if (typeof c !== 'string') c.parentNode = null;
      figli.length = 0;
      if (v !== undefined && v !== null) figli.push(String(v));
    },
    get innerHTML() { return nodo.textContent; },
    set innerHTML(v) { nodo.textContent = String(v); },
    noValidate: false,
  };
  return nodo;
}

function listaClassi(nodo) {
  const leggi = () => (nodo.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  return {
    add(...c) { const s = new Set(leggi()); for (const x of c) s.add(x); nodo.setAttribute('class', [...s].join(' ')); },
    remove(...c) { const s = new Set(leggi()); for (const x of c) s.delete(x); nodo.setAttribute('class', [...s].join(' ')); },
    contains(c) { return leggi().includes(c); },
    toggle(c, forza) { const s = new Set(leggi()); const attivo = forza === undefined ? !s.has(c) : Boolean(forza); if (attivo) s.add(c); else s.delete(c); nodo.setAttribute('class', [...s].join(' ')); return attivo; },
  };
}

/* ── mini selettore CSS: tag, .classe, [attr], [attr="v"], :scope, :first-child, :not(...),
      combinatori « » e «>», gruppi con la virgola. Basta all'impianto delle sezioni. ── */

/* ⛔ BUG-11 (fix banco): il selettore di `parolaTesta` (sezioni-adattatori) è
   `.td-detail-head > span:first-child` — con separatori CONSECUTIVI (« » «>» « »). Il vecchio
   tokenizzatore li emetteva tutti e tre, e `combaciaComplesso` (che assume l'alternanza
   composto-separatore) finiva a valutare «>» come un TAG: `pezziComposto` crashava su `m[0]`.
   Ora una sequenza di separatori collassa in UN token, e «>» vince su « » (discendente diretto). */
function tokenizza(complesso) {
  const tokens = [];
  let composto = '';
  let sep = null;
  for (const ch of complesso) {
    if (ch === '>' || ch === ' ') {
      if (composto.trim()) {
        if (tokens.length) tokens.push(sep ?? ' ');
        tokens.push(composto.trim());
        composto = '';
        sep = null;
      }
      if (ch === '>') sep = '>';
      else if (sep === null) sep = ' ';
      continue;
    }
    composto += ch;
  }
  if (composto.trim()) {
    if (tokens.length) tokens.push(sep ?? ' ');
    tokens.push(composto.trim());
  }
  return tokens;
}

function pezziComposto(composto) {
  const pezzi = [];
  let i = 0;
  while (i < composto.length) {
    const ch = composto[i];
    if (ch === '*') { pezzi.push({ tipo: 'tutto' }); i++; continue; }
    if (ch === '.') { const m = /^[^.:> ]+/.exec(composto.slice(i + 1)); pezzi.push({ tipo: 'classe', nome: m[0] }); i += 1 + m[0].length; continue; }
    if (ch === '[') { const fine = composto.indexOf(']', i); const interno = composto.slice(i + 1, fine); const u = /^(.+?)="(.*)"$/.exec(interno); pezzi.push(u ? { tipo: 'attr', nome: u[1], valore: u[2] } : { tipo: 'attr', nome: interno, valore: null }); i = fine + 1; continue; }
    if (ch === ':') {
      const m = /^:([a-z-]+)(\(([^)]*)\))?/i.exec(composto.slice(i));
      pezzi.push({ tipo: 'pseudo', nome: m[1], argomento: m[3] || null });
      i += m[0].length; continue;
    }
    const m = /^[^.:>\[ ]+/.exec(composto.slice(i));
    pezzi.push({ tipo: 'tag', nome: m[0].toLowerCase() });
    i += m[0].length;
  }
  return pezzi;
}

function combaciaComposto(nodo, composto, radice) {
  for (const p of pezziComposto(composto)) {
    if (p.tipo === 'tutto') continue;
    if (p.tipo === 'tag' && nodo.tagName !== p.nome.toUpperCase()) return false;
    if (p.tipo === 'classe' && !nodo.classList.contains(p.nome)) return false;
    if (p.tipo === 'attr') {
      const nome = p.nome;
      const dallAttributo = nodo.getAttribute(nome);
      if (p.valore === null) {
        const presente = dallAttributo !== null || Object.prototype.hasOwnProperty.call(nodo.dataset, nome.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
        if (!presente) return false;
      } else if (dallAttributo !== p.valore) return false;
    }
    if (p.tipo === 'pseudo') {
      if (p.nome === 'scope') { if (nodo !== radice) return false; }
      else if (p.nome === 'first-child') { const f = nodo.parentNode?.children.filter((c) => c.nodeType === 1) || []; if (f[0] !== nodo) return false; }
      else if (p.nome === 'not') { if (combaciaComposto(nodo, p.argomento, radice)) return false; }
      else return false;
    }
  }
  return true;
}

function combaciaComplesso(nodo, complesso, radice) {
  const tokens = tokenizza(complesso);
  const prova = (n, i) => {
    if (!n || n.nodeType !== 1) return false;
    if (!combaciaComposto(n, tokens[i], radice)) return false;
    if (i === 0) return true;
    const sep = tokens[i - 1];
    const prossimo = i - 2;
    if (sep === '>') return prova(n.parentNode, prossimo);
    let p = n.parentNode;
    while (p && p.nodeType === 1) { if (prova(p, prossimo)) return true; p = p.parentNode; }
    return false;
  };
  return prova(nodo, tokens.length - 1);
}

function seleziona(radice, selettore) {
  const gruppi = String(selettore).split(',').map((s) => s.trim()).filter(Boolean);
  const trovati = [];
  const visita = (n) => {
    for (const g of gruppi) if (combaciaComplesso(n, g, radice)) { trovati.push(n); break; }
    for (const c of n.children) if (typeof c !== 'string') visita(c);
  };
  for (const c of radice.children) if (typeof c !== 'string') visita(c);
  return trovati;
}

function documentoFinto() {
  const doc = {};
  doc.documentElement = creaElemento('html', doc);
  doc.body = creaElemento('body', doc);
  doc.createElement = (tag) => creaElemento(tag, doc);
  doc.createElementNS = (_ns, tag) => creaElemento(tag, doc);
  doc._attivo = null;
  Object.defineProperty(doc, 'activeElement', { get: () => doc._attivo });
  doc.querySelectorAll = (sel) => seleziona(doc.body, sel);
  doc.querySelector = (sel) => seleziona(doc.body, sel)[0] || null;
  return doc;
}

/* ─────────────── lo schermo della sezione, come nel template ─────────────── */

function schermoSezione(id, nome, chiaveStato) {
  const doc = documentoFinto();
  const schermo = creaElemento('section', doc);
  schermo.setAttribute('id', id);
  schermo.classList.add('talos-screen');
  const topbar = creaElemento('div', doc);
  topbar.classList.add('talos-topbar');
  const percorso = creaElemento('span', doc);
  percorso.classList.add('talos-topbar__path');
  topbar.append(percorso);
  const pagina = creaElemento('div', doc);
  pagina.classList.add('talos-page');
  const testa = creaElemento('div', doc);
  testa.classList.add('talos-page__head');
  const h2 = creaElemento('h2', doc);
  h2.textContent = nome;
  const spiegazione = creaElemento('p', doc);
  spiegazione.textContent = 'spiegazione';
  const statoRiga = creaElemento('p', doc);
  statoRiga.classList.add('talos-page__note');
  statoRiga.setAttribute('data-' + chiaveStato, '');
  statoRiga.setAttribute('role', 'status');
  testa.append(h2, spiegazione, statoRiga);
  pagina.append(testa);
  schermo.append(topbar, pagina);
  doc.body.append(schermo);
  return { doc, schermo };
}

/* ─────────────────────────── il banco per una sezione ─────────────────────────── */

const stampoMemoria = (id, genere) => ({ id, genere, titolo: 'Ricordo ' + id, contenuto: 'contenuto di ' + id, aggiornataAlle: null });

/**
 * Riproduce il cablaggio di legacy/app.js per una sezione scrivibile:
 * `carica(dati)` = la `mostra()` di `caricaPannello*`, con il `mostra([], {caricamento:true})`
 * SINCRONO prima della lettura e il render dei dati quando la lettura torna.
 */
function bancoSezione({ monta, iniziali, idSchermo, chiaveStato, campoRisposta = 'voce' }) {
  const { doc, schermo } = schermoSezione(idSchermo, 'Sezione', chiaveStato);
  const archivio = [...iniziali];
  const creati = [];
  const rete = {
    post: async (indirizzo, corpo) => {
      const id = 'creata-' + (creati.length + 1);
      const voce = { id, aggiornataAlle: new Date().toISOString(), origine: 'persona', ...corpo };
      creati.push(voce);
      archivio.push(voce);
      /* Il campo di risposta è dello SCHEMA (`schema.campoRisposta`): memoria → `memoria`,
         note → `nota`, attività → `attivita` (modulo-voce.js, SCHEMI). `salva` legge
         `dati[schema.campoRisposta]`: con la chiave sbagliata la voce creata risulta null. */
      return { [campoRisposta]: voce };
    },
    patch: async () => ({}),
    elimina: async () => ({}),
    leggi: async () => ({}),
  };
  const opzioni = {
    sessionId: 'sess-1',
    rete,
    notifica: () => {},
    onMenu: () => {},
    /* Come `caricaPannello*` di app.js: un salvataggio RICARICA la sezione dal server
       (`salva` → `ricarica()` → `opzioni.onCambiata || opzioni.onAggiorna`). */
    onAggiorna: () => { void carica(); },
  };
  const aggiorna = (dati, extra = {}) => monta(schermo, dati, { ...opzioni, ...extra });
  let caricamentoInCorso = null;
  async function carica() {
    // come `caricaPannello*` di app.js: prima lo stato di caricamento (lista VUOTA), poi i dati
    aggiorna([], { caricamento: true });
    await Promise.resolve();
    const dati = [...archivio];
    aggiorna(dati);
    return dati;
  }
  const schede = () => [...schermo.querySelectorAll('.td-card')].map((c) => c.dataset.item);
  return { doc, schermo, rete, creati, archivio, carica, aggiorna, schede };
}

test('BUG-11 — SONDA memoria: dopo «Nuovo ricordo» la lista conserva le voci', async () => {
  const { aggiornaPaginaMemoria } = await import('../frontend/src/components/sezioni-adattatori.js');
  const banco = bancoSezione({
    monta: aggiornaPaginaMemoria,
    iniziali: [stampoMemoria('m1', 'preference'), stampoMemoria('m2', 'policy_note'), stampoMemoria('m3', 'procedure')],
    idSchermo: 'schermoMemoria',
    chiaveStato: 'memory-stato',
    campoRisposta: 'memoria', // SCHEMI.memory.campoRisposta (modulo-voce.js) — `salva` legge `dati.memoria`
  });
  await banco.carica();
  assert.deepEqual(banco.schede(), ['m1', 'm2', 'm3']);

  const pulsante = banco.schermo.querySelector('[data-nuova]');
  assert.ok(pulsante, 'il pulsante «Nuovo ricordo» esiste');
  pulsante.click();

  const dopo = banco.schede();
  console.log('schede dopo il click:', JSON.stringify(dopo));
  assert.ok(dopo.includes('m1') && dopo.includes('m2') && dopo.includes('m3'), 'dopo «Aggiungi» le voci restano: ' + JSON.stringify(dopo));
});


/*
 * BUG-11 — accettazione (2) dell'owner: «l'elemento creato è visibile senza ricliccare la sezione».
 * ⛔ Questa prova NON è la sonda rossa/verde del difetto (quella sopra): il percorso salva → ricarica →
 *   selezione era già corretto (`salva` → `ricarica()` → `mostra(dati)` → `sincronizza` consuma
 *   `m.selezionaDopo`, sezione-elenco-dettaglio.js) e resta verde anche SENZA la cura. Serve a
 *   sorvegliare che la cura non lo rompa: se qualcuno «aggiustasse» il bottone toccando quel
 *   percorso, questa diventa rossa.
 * Nota sui selettori del finto DOM: `.name` è una proprietà, non un attributo, quindi i campi si
 *   cercano per CLASSE (`td-edit-title` / `td-edit-body`); e `[data-item="…"]` non combacia sui
 *   valori scritti direttamente in `dataset`, quindi la scheda creata si cerca fra le `.td-card`.
 */
test('BUG-11 — accettazione 2: dopo «Salva» la voce creata è visibile e scelta, senza ricliccare la sezione', async () => {
  const { aggiornaPaginaMemoria } = await import('../frontend/src/components/sezioni-adattatori.js');
  const banco = bancoSezione({
    monta: aggiornaPaginaMemoria,
    iniziali: [stampoMemoria('m1', 'preference'), stampoMemoria('m2', 'policy_note')],
    idSchermo: 'schermoMemoriaSalva',
    chiaveStato: 'memory-stato',
    campoRisposta: 'memoria',
  });
  await banco.carica();
  banco.schermo.querySelector('[data-nuova]').click();

  // compila il modulo della bozza come farebbe la persona
  const titolo = banco.schermo.querySelector('.td-edit-title');
  const contenuto = banco.schermo.querySelector('.td-edit-body');
  assert.ok(titolo && contenuto, 'il modulo della bozza ha titolo e contenuto');
  titolo.value = 'Ricordo nuovo';
  titolo.emit('input');
  contenuto.value = 'Contenuto del ricordo nuovo';
  contenuto.emit('input');

  const salvaBtn = banco.schermo.querySelector('.td-detail-footer .talos-button--primary');
  assert.ok(salvaBtn, 'il pulsante «Salva» esiste nel dettaglio');
  salvaBtn.click();

  await new Promise((r) => setTimeout(r, 0)); // drena le microtask: POST → ricarica (onAggiorna) → mostra(dati)

  const schede = banco.schede();
  assert.ok(['m1', 'm2', 'creata-1'].every((id) => schede.includes(id)), 'la voce creata è in elenco, accanto alle vecchie: ' + JSON.stringify(schede));
  const creata = [...banco.schermo.querySelectorAll('.td-card')].find((c) => c.dataset.item === 'creata-1');
  assert.ok(creata, 'la scheda della voce creata è disegnata');
  assert.equal(creata.dataset.selected, 'true', 'la voce creata è SELEZIONATA senza ricliccare la sezione');
  assert.equal(banco.schermo.querySelector('[data-detail]')?.dataset.detail, 'true', 'il dettaglio è aperto sulla voce creata');
});
