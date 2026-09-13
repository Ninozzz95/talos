import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

/*
 * ⛔⛔⛔ BC-03 (11/09/2026) — LA SCHEDA NON DEVE MAI PROMETTERE CIÒ CHE NON DÀ.
 *
 * Il bug dell'08/09 diceva «la scheda Agenti resta vuota anche quando le figlie ci sono»: quella
 * parte è curata e provata altrove (`tests/bc03-delega-visibile.test.mjs`, dal disco fino alla
 * rotta). Guardando la scheda PIENA sul server isolato è però saltato fuori il resto dello stesso
 * difetto: lo stato vuoto prometteva «i suoi giri, le sue richieste di permesso e il pulsante per
 * fermarlo», e la card piena non mostra i giri, non mostra nessuna richiesta di permesso, e il
 * «pulsante per fermarlo» esisteva solo sul TASTO DESTRO — invisibile a chi non lo sa già.
 *
 * ⇒ Queste prove tengono ferme le due metà: le parole dello stato vuoto, e il «…» che rende vera
 *   l'unica di quelle tre promesse che valeva la pena mantenere.
 */

/** `trova` del finto cerca per CLASSE: un `<use>` non ne ha, quindi qui si cerca per tag. */
function trovaPerTag(nodo, tag) {
  if (nodo?.tag === tag) return nodo;
  for (const figlio of nodo?.figli ?? []) { const t = trovaPerTag(figlio, tag); if (t) return t; }
  return null;
}

/** Il finto non ha `querySelector`: il «…» si trova per `data-azione`, come lo troverebbe una persona. */
function trovaBottoneMenu(nodo) {
  if (nodo?.dataset?.azione === 'menu') return nodo;
  for (const figlio of nodo?.figli ?? []) { const t = trovaBottoneMenu(figlio); if (t) return t; }
  return null;
}

test('BC-03: la card porta un «…» visibile, e apre lo STESSO menu del tasto destro', () => {
  const chiamate = [];
  const { card } = disegna([FIGLIA], { onApri: () => {}, onMenu: (f, dove) => chiamate.push([f.sessionId, dove]) });
  const bottone = trovaBottoneMenu(card);
  assert.ok(bottone, '⛔ senza un bersaglio visibile, «ferma questa delega» si scopre solo per caso');
  assert.equal(bottone.getAttribute('aria-haspopup'), 'menu', 'chi ascolta la pagina deve sapere che si apre un menu');
  assert.match(bottone.getAttribute('aria-label'), /riepilogo\.md/, 'l\'etichetta dice su QUALE delega, non «azioni»');
  assert.equal(trovaPerTag(bottone, 'use')?.getAttribute('href'), '#i-more', 'l\'icona dello sprite, non tre punti scritti a mano');

  bottone.lancia('click', { stopPropagation() {} });
  assert.equal(chiamate.length, 1);
  assert.equal(chiamate[0][0], FIGLIA.sessionId);
  assert.equal(chiamate[0][1].ancora, bottone, 'il menu si ancora al bottone: da tastiera non c\'è nessun puntatore');
});

test('BC-03, AL CONTRARIO: il «…» apre il menu e NON la conversazione — un gesto, una risposta', () => {
  let aperte = 0; let menu = 0; let fermato = 0;
  const { card } = disegna([FIGLIA], { onApri: () => { aperte += 1; }, onMenu: () => { menu += 1; } });
  const bottone = trovaBottoneMenu(card);
  bottone.lancia('click', { stopPropagation() { fermato += 1; } });
  assert.equal(menu, 1);
  assert.equal(aperte, 0, '⛔ la card intera è cliccabile: senza stopPropagation il «…» apriva il menu E la figlia');
  assert.equal(fermato, 1, 'e lo fa fermando la propagazione, non sperando che nessuno clicchi');
});

test('BC-03, AL CONTRARIO: Invio sul «…» non apre la conversazione della figlia', () => {
  let aperte = 0;
  const { card } = disegna([FIGLIA], { onApri: () => { aperte += 1; }, onMenu: () => {} });
  const bottone = trovaBottoneMenu(card);
  card.lancia('keydown', { key: 'Enter', target: bottone, preventDefault() {} });
  assert.equal(aperte, 0, 'il tasto premuto era del bottone, non della card');
  card.lancia('keydown', { key: 'Enter', target: card, preventDefault() {} });
  assert.equal(aperte, 1, 'e la card continua ad aprirsi con Invio, come prima');
});

test('BC-03, AL CONTRARIO: senza `onMenu` non compare nessun «…» — mai un bottone che non aziona niente', () => {
  const { card } = disegna([FIGLIA], { onApri: () => {} });
  assert.equal(trovaBottoneMenu(card), null);
  const senzaId = disegna([{ ...FIGLIA, sessionId: null }], { onApri: () => {}, onMenu: () => {} });
  assert.equal(trovaBottoneMenu(senzaId.card), null, 'senza id non c\'è nessuna delega da fermare');
});

test('BC-03: lo stato vuoto non promette giri e permessi che la scheda piena non mostra', () => {
  const d = documentoFinto();
  const contenitore = d.createElement('div');
  const quante = disegnaAgenti(d, contenitore, []);
  assert.equal(quante, 0);
  const testo = contenitore.figli[0].textContent;
  assert.match(testo, /Nessun sotto-agente in questa sessione/, 'lo stato vuoto onesto resta: nessuna figlia, nessuna riga');
  assert.doesNotMatch(testo, /richieste di permesso/, '⛔ nessuno le mostra: prometterle è mentire in anticipo');
  assert.doesNotMatch(testo, /i suoi giri/, '⛔ i giri stanno nella conversazione della figlia, non in questa scheda');
  assert.match(testo, /si ferma/, 'e ciò che resta promesso — aprire e fermare — la card lo fa davvero');
});

/*
 * ⛔⛔⛔ BC-03, secondo giro (11/09/2026) — LA STESSA FRASE VIVEVA IN DUE COPIE, E UNA ERA RIMASTA
 *   VECCHIA.
 *
 * Misurato sul server isolato (store seminato, `frontend/dist` fresco, 1440×900, tema chiaro e
 * scuro): la scheda «Agenti» di una sessione senza deleghe mostrava ancora la promessa smentita
 * — «qui compaiono i suoi giri, le sue richieste di permesso e il pulsante per fermarlo» — perché
 * lo stato vuoto È SCRITTO DUE VOLTE: in `src/components/inspector.js` (che `disegnaAgenti` usa) e
 * come markup statico in `index.template.html` dentro `#railAgenti`. La cura di stamattina aveva
 * corretto la prima e lasciato la seconda: quella statica è ciò che si legge al PRIMO disegno della
 * pagina, prima che il JS riscriva la colonna, e è ciò che resta se il JS non arriva mai.
 *
 * ⭐ Ricerca 11/09/2026 (dev.to/jkettmann «Don't duplicate your data», en.wikipedia.org/wiki/
 *   Single_source_of_truth): un dato tenuto in due posti non resta allineato dalla disciplina —
 *   diverge, e diverge in silenzio. Qui non si può togliere la copia statica (il template è il
 *   mockup, ed è ciò che si vede al primo pixel) ⇒ la si LEGA: se le due frasi divergono di nuovo,
 *   questa prova diventa rossa invece di lasciarlo scoprire a una foto.
 */
const TEMPLATE_AGENTI = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');

/** Il testo dello stato vuoto scritto a mano nel template, dentro `#railAgenti`. */
export function statoVuotoDelTemplate(html) {
  const pannello = /<div class="talos-inspector__body" id="railAgenti"[^>]*>([\s\S]*?)<\/div>\s*<div class="talos-inspector__body"/.exec(html)
    || /id="railAgenti"[^>]*>([\s\S]*?)<div class="talos-inspector__body"/.exec(html);
  const dentro = pannello ? pannello[1] : html;
  const p = /<p class="talos-inspector__hint">([^<]*)<\/p>/.exec(dentro);
  return p ? p[1].trim() : null;
}

test('BC-03: lo stato vuoto del TEMPLATE dice la stessa cosa di quello che disegna il JS', () => {
  const d = documentoFinto();
  const contenitore = d.createElement('div');
  disegnaAgenti(d, contenitore, []);
  const dalJs = contenitore.figli[0].textContent.replace('Sotto-agenti', '').trim();
  const dalTemplate = statoVuotoDelTemplate(TEMPLATE_AGENTI);
  assert.ok(dalTemplate, 'lo stato vuoto statico deve esistere: è il primo pixel che si vede');
  assert.equal(dalTemplate, dalJs, '⛔ due copie della stessa frase: se divergono, la pagina promette una cosa al primo disegno e qualcosa di diverso al secondo');
});

test('BC-03, AL CONTRARIO: la guardia MORDE su una frase divergente', () => {
  const finto = TEMPLATE_AGENTI.replace(/<div class="talos-inspector__body" id="railAgenti"/, '<div class="talos-inspector__body" id="railAgenti"')
    .replace(statoVuotoDelTemplate(TEMPLATE_AGENTI), 'Qui compaiono i suoi giri e le sue richieste di permesso.');
  assert.equal(statoVuotoDelTemplate(finto), 'Qui compaiono i suoi giri e le sue richieste di permesso.', 'il lettore legge davvero il template, non una costante scritta qui');
});

test('BC-03, AL CONTRARIO: la promessa smentita non è rimasta da nessuna parte nel template', () => {
  assert.doesNotMatch(TEMPLATE_AGENTI, /richieste di permesso/, '⛔ nessuno le mostra: prometterle è mentire in anticipo, anche in un attributo');
});
