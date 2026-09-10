import test from 'node:test';
import assert from 'node:assert/strict';

import { disegnaAgenti } from '../../src/components/inspector.js';

/*
 * ⛔⛔ PO-08 (10/09/2026) — la card di un sotto-agente si apre.
 *
 * Owner 08/09: «cliccando il sommario/la riga di un sotto-agente si apre la conversazione diretta
 * con quell'agente dentro il pannello destro».
 *
 * ⛔ Il caso che queste prove difendono davvero è il VERSO CONTRARIO: una card che SEMBRA cliccabile
 *   e non fa niente. È il difetto trovato stamattina nella Libreria — un pulsante «Apri» disegnato,
 *   `hidden`, e collegato a niente: a schermo prometteva, e nessun test se n'era accorto perché
 *   provavano tutti che il caso buono funzionasse.
 */

/** Un documento finto: qui serve solo creare nodi, ascoltare e lanciare eventi. */
function documentoFinto() {
  const crea = (tag) => {
    const attributi = new Map();
    const nodo = {
      tag,
      tagName: tag.toUpperCase(),
      classi: new Set(),
      dataset: {},
      figli: [],
      ascolti: [],
      testoProprio: '',
      tabIndex: -1,
      get className() { return [...nodo.classi].join(' '); },
      set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: {
        add: (...c) => c.forEach((x) => nodo.classi.add(x)),
        remove: (...c) => c.forEach((x) => nodo.classi.delete(x)),
        contains: (c) => nodo.classi.has(c),
      },
      get textContent() { return nodo.testoProprio !== '' ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
      set textContent(v) { nodo.testoProprio = String(v); },
      /* ⛔ Nel DOM vero `setAttribute('class', …)` E `className` sono la STESSA cosa, e un SVG creato
         con `createElementNS` non ha `className` scrivibile: si usa l'attributo. Un finto che tiene
         le due strade separate misura sé stesso — è lo stesso difetto che stamattina ha lasciato
         passare per verde un wrapper con l'arità sbagliata. */
      setAttribute: (k, v) => {
        if (k === 'class') { nodo.className = String(v); return; }
        attributi.set(k, String(v));
      },
      getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
      append: (...x) => nodo.figli.push(...x),
      appendChild: (x) => { nodo.figli.push(x); return x; },
      replaceChildren: (...x) => { nodo.figli = [...x]; },
      addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
      lancia: (t, e = {}) => { for (const a of nodo.ascolti.filter((x) => x.t === t)) a.m({ type: t, preventDefault() {}, ...e }); },
      /** Cerca in profondità il primo discendente con quella classe (il finto non ha querySelector). */
      trova: (classe) => (nodo.classi.has(classe) ? nodo : nodo.figli.map((f) => f.trova?.(classe)).find(Boolean) || null),
    };
    return nodo;
  };
  return { createElement: crea, createElementNS: (_ns, tag) => crea(tag) };
}

const FIGLIA = {
  sessionId: 'c8c18234-42c6-40ef-ad4f-f04f1b76d7f8',
  taskCorto: 'Crea riepilogo.md con tre righe sul registro dei processi',
  task: 'Nel workspace corrente crea (o sovrascrivi se esiste già) un file chiamato riepilogo.md…',
  conclusa: true,
  esitoDelega: 'concluso',
  avviataAlle: '2026-09-10T00:18:00.000Z',
};

function disegna(figlie, azioni) {
  const d = documentoFinto();
  const contenitore = d.createElement('div');
  disegnaAgenti(d, contenitore, figlie, azioni);
  return { d, contenitore, card: contenitore.figli[0] };
}

test('PO-08, AL CONTRARIO: senza qualcuno che ascolti, la card resta ESATTAMENTE com\'era', () => {
  const { card } = disegna([FIGLIA], {});
  assert.equal(card.getAttribute('role'), null, '⛔ una card con role=button che non fa niente è una promessa rotta');
  assert.equal(card.tabIndex, -1, 'e nemmeno raggiungibile da tastiera: non c\'è niente da raggiungere');
  assert.ok(!card.classi.has('talos-inspector-card--apribile'));
  assert.equal(card.trova('talos-inspector-card__vai'), null, 'niente chevron: non porta da nessuna parte');
});

test('PO-08, AL CONTRARIO: una delega senza id non è apribile nemmeno se qualcuno ascolta', () => {
  let aperte = 0;
  const { card } = disegna([{ ...FIGLIA, sessionId: null }], { onApri: () => { aperte += 1; } });
  assert.equal(card.getAttribute('role'), null, 'senza id non c\'è nessuna conversazione da aprire');
  card.lancia('click');
  assert.equal(aperte, 0);
});

test('PO-08: con un ascoltatore la card diventa un bersaglio vero — mouse E tastiera', () => {
  const viste = [];
  const { card } = disegna([FIGLIA], { onApri: (f) => viste.push(f.sessionId) });

  assert.equal(card.getAttribute('role'), 'button');
  assert.equal(card.tabIndex, 0, '⛔ senza questo la card si apre col mouse e non con Invio: metà delle persone resta fuori');
  assert.ok(card.classi.has('talos-inspector-card--apribile'));
  assert.ok(card.trova('talos-inspector-card__vai'), 'il chevron dice che porta altrove, prima del clic');

  card.lancia('click');
  assert.deepEqual(viste, [FIGLIA.sessionId], 'e passa la figlia giusta, non un indice');
});

test('PO-08: l\'etichetta dice SU QUALE delega si sta per agire', () => {
  const { card } = disegna([FIGLIA], { onApri: () => {} });
  const etichetta = card.getAttribute('aria-label');
  assert.match(etichetta, /^Apri la conversazione di: /);
  assert.match(etichetta, /riepilogo\.md/, 'il compito, non «apri»: in un elenco di quattro deleghe «apri» non dice quale');
});

test('PO-08: Invio e Spazio aprono, gli altri tasti no', () => {
  let aperte = 0;
  const { card } = disegna([FIGLIA], { onApri: () => { aperte += 1; } });

  let impedito = 0;
  card.lancia('keydown', { key: 'Enter', preventDefault() { impedito += 1; } });
  card.lancia('keydown', { key: ' ', preventDefault() { impedito += 1; } });
  assert.equal(aperte, 2);
  assert.equal(impedito, 2, 'lo Spazio va fermato, o la pagina scorre sotto le mani di chi ha appena aperto');

  /* ⛔ Il verso contrario del tasto: Tab deve continuare a spostare il fuoco, non aprire niente. */
  card.lancia('keydown', { key: 'Tab', preventDefault() { impedito += 1; } });
  assert.equal(aperte, 2, 'Tab non apre');
  assert.equal(impedito, 2, 'e nemmeno viene intercettato');
});

test('PO-08: il tasto destro porta le coordinate del puntatore, e non apre il menu del browser', () => {
  const chiamate = [];
  let impedito = 0;
  const { card } = disegna([FIGLIA], { onApri: () => {}, onMenu: (f, dove) => chiamate.push([f.sessionId, dove.x, dove.y]) });
  card.lancia('contextmenu', { clientX: 1098, clientY: 311, preventDefault() { impedito += 1; } });
  assert.deepEqual(chiamate, [[FIGLIA.sessionId, 1098, 311]]);
  assert.equal(impedito, 1, 'senza questo si apre il menu del browser SOPRA il nostro');
});

test('PO-08, AL CONTRARIO: senza `onMenu` il tasto destro resta quello del browser', () => {
  let impedito = 0;
  const { card } = disegna([FIGLIA], { onApri: () => {} });
  card.lancia('contextmenu', { clientX: 10, clientY: 10, preventDefault() { impedito += 1; } });
  assert.equal(impedito, 0, 'non si toglie il menu del sistema per rimpiazzarlo con niente');
});

test('PO-08: due deleghe, due card, ognuna con la sua', () => {
  const seconda = { ...FIGLIA, sessionId: 'altra-figlia', taskCorto: 'Aggiungi una riga a riepilogo.md' };
  const viste = [];
  const d = documentoFinto();
  const contenitore = d.createElement('div');
  disegnaAgenti(d, contenitore, [FIGLIA, seconda], { onApri: (f) => viste.push(f.sessionId) });
  assert.equal(contenitore.figli.length, 2);
  contenitore.figli[1].lancia('click');
  contenitore.figli[0].lancia('click');
  assert.deepEqual(viste, ['altra-figlia', FIGLIA.sessionId], 'ogni card apre la PROPRIA, non l\'ultima disegnata');
});
