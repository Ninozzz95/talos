import test from 'node:test';
import assert from 'node:assert/strict';
import { mountUserQuestionDock } from '../../src/components/user-question-dock.js';

class Element {
  constructor(doc, tagName) {
    this.ownerDocument = doc;
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.value = '';
    this.checked = false;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((node) => node !== this);
    this.parentElement = null;
  }
  get childElementCount() { return this.children.length; }
  setAttribute(key, value) { this[key] = value; }
  getAttribute(key) { return this[key] ?? null; }
  /* 23/09 riparazione Ask: più ascoltatori per tipo (il dock ne mette due su un'opzione) e un
     evento con i campi veri (`key`, `type`), non il nome del tipo travestito da tasto. */
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type, init = {}) {
    for (const callback of this.listeners.get(type) || []) callback({ type, key: type, preventDefault() {}, ...init });
  }
  click() { this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
}

function fixture() {
  const saved = new Map();
  const doc = {
    defaultView: { sessionStorage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: (key) => saved.delete(key),
    } },
    createElement(tag) { return new Element(this, tag); },
    activeElement: null,
  };
  const root = doc.createElement('div');
  const composer = doc.createElement('textarea');
  const all = (tag) => {
    const nodes = [];
    const visit = (node) => {
      if (node.tagName === tag) nodes.push(node);
      for (const child of node.children) visit(child);
    };
    visit(root);
    return nodes;
  };
  const button = (label) => all('button').find((node) => node.textContent === label);
  const byId = (id) => {
    let found = null;
    const visit = (node) => { if (node.id === id) found = node; for (const child of node.children) visit(child); };
    visit(root);
    return found;
  };
  return { root, composer, saved, all, button, byId };
}

/* 23/09 — i tre gesti che il browser vero produce su un radio (WAI-ARIA APG Radio Group; e Chrome
   emette anche un `click` con detail 0 sulla freccia, react#7407): il puntatore passa dalla
   etichetta, la tastiera dal radio stesso. */
function scegli(input, gesto) {
  if (gesto === 'puntatore') input.parentElement.dispatch('pointerdown');
  else input.dispatch('keydown', { key: gesto });
  input.checked = true;
  input.dispatch('change');
}

const question = {
  sessionId: 's-1', requestId: 'r-1',
  questions: [
    { id: 'choices', question: 'Choose?', multiSelect: true, options: [
      { label: 'A', description: 'First' }, { label: 'B', description: 'Second' },
    ] },
    { id: 'reason', question: 'Why?' },
  ],
};

test('R4-ASK-DOCK-MULTI: review never submits, edit preserves answers, confirm uses canonical POST shape', () => {
  const view = fixture();
  const submitted = [];
  const controller = mountUserQuestionDock({ ...view, question, onSubmit: (body) => { submitted.push(body); } });
  const [a, b, other] = view.all('input');
  const [reason] = view.all('textarea');
  a.checked = true;
  a.dispatch('change');
  b.checked = true;
  b.dispatch('change');
  other.value = 'C';
  other.dispatch('input');
  view.button('Rivedi risposte').click();
  assert.deepEqual(submitted, []);
  assert.equal(view.button('Conferma e invia').disabled, true, 'all questions are mandatory');
  view.button('Modifica risposte').click();
  assert.deepEqual(controller.readDraft(), { choices: ['A', 'B', 'C'] });
  reason.value = '  Because  ';
  reason.dispatch('input');
  view.button('Rivedi risposte').click();
  assert.equal(view.button('Conferma e invia').disabled, false);
  view.button('Conferma e invia').click();
  assert.deepEqual(submitted, [{
    requestId: 'r-1', status: 'answered',
    answers: { choices: ['A', 'B', 'C'], reason: 'Because' },
  }]);
  controller.render({ stage: 'resolved', status: 'answered' });
  assert.equal(view.saved.size, 0);
  assert.equal(view.root.children[0].dataset.state, 'resolved');
});

test('R4-ASK-DRAFT: same live request restores local draft; another request cannot inherit it', () => {
  const view = fixture();
  const first = mountUserQuestionDock({ ...view, question, onSubmit() {} });
  const [choice] = view.all('input');
  choice.checked = true;
  choice.dispatch('change');
  first.destroy();
  const second = mountUserQuestionDock({ ...view, question, onSubmit() {} });
  assert.deepEqual(second.readDraft(), { choices: ['A'] });
  second.destroy();
  const third = mountUserQuestionDock({ ...view, question: { ...question, requestId: 'r-2' }, onSubmit() {} });
  assert.deepEqual(third.readDraft(), {});
  third.destroy();
});

test('R4-ASK-SKIP: explicit confirmation skips the entire request without answers', () => {
  const view = fixture();
  const submitted = [];
  mountUserQuestionDock({ ...view, question, onSubmit: (body) => { submitted.push(body); } });
  view.button('Salta').click();
  assert.deepEqual(submitted, []);
  view.button('Conferma salto').click();
  assert.deepEqual(submitted, [{ requestId: 'r-1', status: 'skipped' }]);
});

test('R4-ASK-SINGLE-AUTOSUBMIT: explicit final radio choice sends once without review', () => {
  const view = fixture();
  const submitted = [];
  view.composer.focus();
  mountUserQuestionDock({
    ...view,
    question: {
      sessionId: 's-1', requestId: 'r-single',
      questions: [
        { id: 'first', question: 'First?', options: [
          { label: 'A', description: 'First' }, { label: 'B', description: 'Second' },
        ] },
        { id: 'second', question: 'Second?', options: [
          { label: 'C', description: 'Third' }, { label: 'D', description: 'Fourth' },
        ] },
      ],
    },
    onSubmit: (body) => { submitted.push(body); },
  });
  assert.equal(view.composer.ownerDocument.activeElement, view.composer, 'mount cannot steal composer focus');
  assert.deepEqual(submitted, [], 'no default choice or automatic submit on mount');
  const [first, , , third] = view.all('input');
  scegli(first, 'puntatore');
  assert.deepEqual(submitted, [], 'the first of two questions does not submit');
  scegli(third, 'puntatore');
  assert.deepEqual(submitted, [{
    requestId: 'r-single', status: 'answered', answers: { first: 'A', second: 'C' },
  }]);
  third.dispatch('change');
  assert.equal(submitted.length, 1, 'duplicate change while busy cannot submit twice');
});

test('R4-ASK-OVERLAP-DOCK: a second request cannot erase the first draft or hide its card', () => {
  const view = fixture();
  const first = mountUserQuestionDock({ ...view, question, onSubmit() {} });
  const [reason] = view.all('textarea');
  reason.value = 'Do not lose this';
  reason.dispatch('input');
  const second = mountUserQuestionDock({
    ...view,
    question: { sessionId: 's-1', requestId: 'r-2', questions: [{ id: 'next', question: 'Next?' }] },
    onSubmit() {},
  });
  assert.equal(view.root.childElementCount, 2);
  assert.deepEqual(first.readDraft(), { reason: 'Do not lose this' });
  second.destroy();
  assert.equal(view.root.childElementCount, 1);
  assert.equal(view.root.hidden, false);
});

const singola = {
  sessionId: 's-1', requestId: 'r-one',
  questions: [{ id: 'scelta', question: 'Quale canale?', options: [
    { label: 'Stabile', description: 'Per tutti' }, { label: 'Anteprima', description: 'Solo tester' },
  ] }],
};

test('R4-ASK-ARROW-NO-SUBMIT (D2): navigating options with arrows selects but never sends', () => {
  const view = fixture();
  const submitted = [];
  const controller = mountUserQuestionDock({ ...view, question: singola, onSubmit: (body) => { submitted.push(body); } });
  const [, second] = view.all('input');
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    scegli(second, key);
    assert.deepEqual(submitted, [], key + ' is navigation, not an explicit choice');
  }
  assert.deepEqual(controller.readDraft(), { scelta: 'Anteprima' }, 'the selection is kept as a draft');
  assert.equal(view.root.children[0].dataset.state, 'answer');
  scegli(second, ' ');
  assert.deepEqual(submitted, [{ requestId: 'r-one', status: 'answered', answers: { scelta: 'Anteprima' } }],
    'Space on the focused radio is the keyboard click: it sends');
});

test('R4-ASK-POINTER-SUBMIT: a pointer click after an arrow still counts as an explicit choice', () => {
  const view = fixture();
  const submitted = [];
  mountUserQuestionDock({ ...view, question: singola, onSubmit: (body) => { submitted.push(body); } });
  const [first, second] = view.all('input');
  scegli(second, 'ArrowDown');
  assert.deepEqual(submitted, []);
  scegli(first, 'puntatore');
  assert.deepEqual(submitted, [{ requestId: 'r-one', status: 'answered', answers: { scelta: 'Stabile' } }]);
});

test('R4-ASK-OPTION-NAME (D7): label and description are separate accessible parts', () => {
  const view = fixture();
  mountUserQuestionDock({ ...view, question: singola, onSubmit() {} });
  const [first] = view.all('input');
  const name = view.byId(first['aria-labelledby']);
  const description = view.byId(first['aria-describedby']);
  assert.ok(name && description, 'the radio points at a name and a description');
  assert.equal(name.textContent, 'Stabile');
  assert.equal(description.textContent, 'Per tutti');
  assert.notEqual(name.id, description.id);
});

test('R4-ASK-FOCUS-RETURN (MUT-8): answering from inside the card returns focus to the composer', () => {
  const view = fixture();
  const controller = mountUserQuestionDock({ ...view, question: singola, onSubmit() {} });
  const [first] = view.all('input');
  first.focus();
  controller.render({ stage: 'resolved', status: 'answered' });
  assert.equal(view.composer.ownerDocument.activeElement, view.composer, 'focus is not lost to <body>');
  const other = mountUserQuestionDock({ ...view, question: { ...singola, requestId: 'r-two' }, onSubmit() {} });
  const outside = view.composer.ownerDocument.createElement('button');
  outside.focus();
  other.render({ stage: 'resolved', status: 'skipped' });
  assert.equal(view.composer.ownerDocument.activeElement, outside, 'focus elsewhere is not pulled into the composer');
});

test('R4-ASK-FOCUS-RETURN-AFTER-DISABLE: focus dropped to <body> while busy still returns to the composer', async () => {
  const view = fixture();
  const doc = view.composer.ownerDocument;
  doc.body = doc.createElement('body');
  let chiudi;
  const controller = mountUserQuestionDock({ ...view, question: singola, onSubmit: () => new Promise((resolve) => { chiudi = resolve; }) });
  const [first] = view.all('input');
  first.focus();
  scegli(first, 'puntatore');
  assert.equal(first.disabled, true, 'controls are disabled while the POST is pending');
  doc.activeElement = doc.body; // HTML focus fixup rule: a disabled focused control drops focus to <body>
  chiudi();
  await Promise.resolve();
  controller.render({ stage: 'resolved', status: 'answered' });
  assert.equal(doc.activeElement, view.composer);
});

test('R4-ASK-LIVE-ANNOUNCE (D1): a live question is announced politely without moving focus', () => {
  const view = fixture();
  const doc = view.composer.ownerDocument;
  const scheduled = [];
  doc.body = doc.createElement('body');
  doc.getElementById = (id) => (doc.body.children.find((node) => node.id === id) || null);
  view.composer.focus();
  mountUserQuestionDock({ ...view, question: singola, onSubmit() {}, annuncia: true, pianifica: (fn) => scheduled.push(fn) });
  assert.equal(doc.activeElement, view.composer, 'mount never steals focus');
  const region = doc.getElementById('talosAnnuncioDomanda');
  assert.ok(region, 'a live region exists before its text changes');
  assert.equal(region.role, 'status');
  assert.equal(region['aria-live'], 'polite');
  assert.equal(region.textContent, '', 'text is set in a later task, after the region is registered');
  for (const fn of scheduled.splice(0)) fn();
  assert.match(region.textContent, /Quale canale\?/);
  assert.doesNotMatch(region.textContent, /\?\./, 'no «?.» after a question mark');
  mountUserQuestionDock({ ...view, question: { ...singola, requestId: 'r-replay' }, onSubmit() {}, pianifica: (fn) => scheduled.push(fn) });
  assert.equal(scheduled.length, 0, 'replayed questions are not announced again');
});

/*
 * ⛔ 24/09/2026 — decisioni owner 10, 11, 31, 32 (memoria `decisioni-owner-f3-workflow-plan-ask-23-09.md`): una domanda
 *   alla volta, «perché conta» e consigliata per prima, tasti 1-9 quando il fuoco è nella scheda, nessun furto di fuoco,
 *   e la ricevuta «Decisione» completa con stati distinti. Fonti: `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md`
 *   (Q7, Q8: Spec Kit una alla volta con il suo perché; Claude Code con la scheda di revisione finale; numeri 1-9).
 */
const trePassi = {
  sessionId: 's-1', requestId: 'r-passi', at: '2026-09-24T13:01:00.000Z', origine: { modalita: 'piano', agente: 'principale' },
  questions: [
    { id: 'strada', question: 'Quale strada?', why: 'Decide quale file cambia per primo.', options: [
      { label: 'B', description: 'Seconda', recommended: true }, { label: 'A', description: 'Prima' },
    ] },
    { id: 'canale', question: 'Quale canale?', why: 'Decide chi riceve la versione.', options: [
      { label: 'Stabile', description: 'Per tutti' }, { label: 'Anteprima', description: 'Solo tester' },
    ] },
  ],
};
const visibili = (view) => view.all('fieldset').filter((node) => !node.hidden);
const testi = (node) => [node.textContent ?? '', ...node.children.flatMap((child) => testi(child))];

test('R4-ASK-ONE-AT-A-TIME: una domanda per volta, la scelta esplicita porta alla successiva, Indietro torna', () => {
  const view = fixture();
  const submitted = [];
  mountUserQuestionDock({ ...view, question: trePassi, onSubmit: (body) => { submitted.push(body); } });
  assert.deepEqual(visibili(view).map((node) => node.dataset.questionId), ['strada']);
  assert.ok(testi(view.root).includes('Domanda 1 di 2'));
  const [b] = view.all('input');
  scegli(b, 'puntatore');
  assert.deepEqual(submitted, [], 'la prima di due domande non invia');
  assert.deepEqual(visibili(view).map((node) => node.dataset.questionId), ['canale']);
  assert.ok(testi(view.root).includes('Domanda 2 di 2'));
  view.button('Indietro').click();
  assert.deepEqual(visibili(view).map((node) => node.dataset.questionId), ['strada']);
  assert.equal(b.checked, true, 'tornare indietro non perde la scelta');
  view.button('Avanti').click();
  const stabile = view.all('input').find((node) => node.value === 'Stabile');
  scegli(stabile, 'puntatore');
  assert.deepEqual(submitted, [{ requestId: 'r-passi', status: 'answered', answers: { strada: 'B', canale: 'Stabile' } }]);
});

test('R4-ASK-WHY-AND-RECOMMENDED: il perché si legge sotto la domanda, la consigliata è la prima e lo dice', () => {
  const view = fixture();
  mountUserQuestionDock({ ...view, question: trePassi, onSubmit() {} });
  const tutto = testi(view.root);
  assert.ok(tutto.includes('Perché conta: Decide quale file cambia per primo.'));
  const [prima] = view.all('input');
  assert.equal(prima.value, 'B');
  const descritta = String(prima['aria-describedby'] || '').split(' ').map((id) => view.byId(id)?.textContent);
  assert.ok(descritta.includes('Consigliata'), 'la consigliata lo dice anche a chi usa un lettore di schermo');
  assert.equal(tutto.filter((t) => t === 'Consigliata').length, 1, 'una sola consigliata a schermo');
});

test('R4-ASK-KEYS-1-9: con il fuoco nella scheda il tasto 2 sceglie la seconda opzione; mai mentre si scrive in «Altro»', () => {
  const view = fixture();
  const submitted = [];
  mountUserQuestionDock({ ...view, question: singola, onSubmit: (body) => { submitted.push(body); } });
  const card = view.root.children[0];
  const [, anteprima, altro] = view.all('input');
  card.dispatch('keydown', { key: '2', target: altro });
  assert.deepEqual(submitted, [], 'nel campo Altro il 2 è testo');
  assert.equal(anteprima.checked, false);
  card.dispatch('keydown', { key: '7', target: card });
  assert.deepEqual(submitted, [], 'un numero senza opzione non fa niente');
  card.dispatch('keydown', { key: '2', target: card });
  assert.equal(anteprima.checked, true);
  assert.deepEqual(submitted, [{ requestId: 'r-one', status: 'answered', answers: { scelta: 'Anteprima' } }],
    'il tasto è un gesto esplicito come il clic: la scelta singola finale parte');
});

test('R4-ASK-RECEIPT-DECISION: la ricevuta dice domanda, perché, risposta, opzioni offerte con la consigliata, chi e quando', () => {
  const view = fixture();
  const controller = mountUserQuestionDock({ ...view, question: trePassi, onSubmit() {} });
  controller.render({ stage: 'resolved', status: 'answered',
    esito: { answers: { strada: 'A', canale: 'Il mio canale' }, at: '2026-09-24T13:02:00.000Z', da: 'persona' } });
  const card = view.root.children[0];
  assert.equal(card.dataset.state, 'resolved');
  const tutto = testi(card);
  // La ricevuta si cerca nel SUO riquadro: la domanda nascosta resta nel DOM e ha lo stesso «Perché conta».
  const cerca = (node) => (String(node.className || '').split(' ').includes('talos-question-card__receipt') ? node
    : node.children.map(cerca).find(Boolean) || null);
  const ricevuta = testi(cerca(card));
  assert.ok(tutto.includes('Decisione') && tutto.includes('Risposta inviata'));
  for (const atteso of ['Quale strada?', 'Perché conta: Decide quale file cambia per primo.', 'A', 'Altro: «Il mio canale»']) {
    assert.ok(ricevuta.includes(atteso), 'la ricevuta non dice «' + atteso + '»');
  }
  assert.ok(tutto.some((t) => /^Chiesta alle \d\d:\d\d in modalità Piano · hai risposto alle \d\d:\d\d$/u.test(t)), 'chi e quando');
  assert.ok(tutto.some((t) => /^Opzioni offerte \(2\)$/u.test(t)));
  assert.ok(tutto.includes('Consigliata') && tutto.includes('Scelta'), 'la consigliata e la scelta restano distinguibili');
});

test('R4-ASK-RECEIPT-STATES: saltata, annullata per motivo, interrotta, scaduta e ipotesi dichiarata sono frasi diverse', () => {
  const casi = [
    [{ status: 'skipped', esito: { da: 'persona' } }, 'Domanda saltata'],
    [{ status: 'cancelled', esito: { motivo: 'fermato', da: 'persona' } }, 'Domanda annullata: hai fermato il giro'],
    [{ status: 'cancelled', esito: { motivo: 'nuovo-messaggio', da: 'persona' } }, 'Domanda chiusa: hai scritto un altro messaggio'],
    [{ status: 'cancelled', esito: { motivo: 'interrotta', da: 'sistema' } }, 'Domanda interrotta: il server si è riavviato prima della risposta'],
    [{ status: 'expired', esito: { da: 'sistema' } }, 'Domanda scaduta: nessuna risposta in tempo, il giro si è fermato'],
    [{ status: 'unanswerable', esito: { motivo: 'nessuna-interfaccia', da: 'sistema' } }, 'Nessuno poteva rispondere: TALOS prosegue con l’ipotesi più prudente e la dichiara'],
  ];
  const frasi = new Set();
  for (const [stato, frase] of casi) {
    const view = fixture();
    const controller = mountUserQuestionDock({ ...view, question: trePassi, onSubmit() {} });
    controller.render({ stage: 'resolved', ...stato });
    const tutto = testi(view.root);
    assert.ok(tutto.includes(frase), stato.status + ': manca «' + frase + '»');
    assert.ok(tutto.includes('Nessuna risposta'), stato.status + ': nessuna risposta inventata');
    frasi.add(frase);
  }
  assert.equal(frasi.size, casi.length);
});

test('R4-ASK-FREE-TEXT-HINT: una domanda a risposta libera dice dove e che cosa scrivere', () => {
  const view = fixture();
  mountUserQuestionDock({ ...view, question: { sessionId: 's-1', requestId: 'r-libera', questions: [{ id: 'nome', question: 'Come la chiamo?', why: 'Diventa il nome della cartella.' }] }, onSubmit() {} });
  const [campo] = view.all('textarea');
  assert.equal(campo.placeholder, 'Scrivi la tua risposta…');
});

/* Il conto parte da quando la scheda è a vista, non dalla nascita della domanda: come il timer di Claude Code, che corre mentre
   la domanda è mostrata. Una domanda rimasta aperta per ore (finestra chiusa, riavvio) non scade nell'istante in cui la apri. */
test('R4-ASK-EXPIRY-COUNTDOWN: con la scadenza impostata la scheda conta alla rovescia da quando è a vista e alla fine la chiude scaduta', () => {
  const view = fixture();
  const submitted = [];
  const nata = Date.parse('2026-09-24T13:00:00.000Z');
  let adesso = nata + 57_000;
  let tic = null;
  mountUserQuestionDock({ ...view, question: { ...singola, requestId: 'r-scade', at: '2026-09-24T13:00:00.000Z' },
    onSubmit: (body) => { submitted.push(body); }, scadenzaMs: 60_000, adesso: () => adesso,
    ogniSecondo: (fn) => { tic = fn; return () => { tic = null; }; } });
  assert.ok(testi(view.root).includes('Scade fra 1:00'), 'il tempo parte da quando la scheda è a vista');
  adesso = nata + 57_000 + 50_000;
  tic();
  assert.ok(testi(view.root).includes('Scade fra 0:10'));
  assert.deepEqual(submitted, []);
  adesso = nata + 57_000 + 60_500;
  tic();
  assert.deepEqual(submitted, [{ requestId: 'r-scade', status: 'expired' }]);
  assert.equal(tic, null, 'il conto si ferma');
});

test('R4-ASK-NO-EXPIRY-BY-DEFAULT: senza impostazione la domanda non scade e non conta', () => {
  const view = fixture();
  let pianificato = false;
  mountUserQuestionDock({ ...view, question: singola, onSubmit() {}, ogniSecondo: () => { pianificato = true; return () => {}; } });
  assert.equal(pianificato, false);
  assert.equal(testi(view.root).some((t) => /^Scade fra/u.test(t)), false);
});

test('R4-ASK-RECEIPT-ALTROVE: con la testata «da un’altra finestra» la ricevuta non dice «hai risposto» (revisione Codex, rilievo 3)', () => {
  for (const [status, testata, ricevuta, mai] of [
    ['answered', 'Risposta inviata da un’altra finestra', 'risposta da un’altra finestra alle ', 'hai risposto'],
    ['skipped', 'Domanda saltata da un’altra finestra', 'saltata da un’altra finestra alle ', 'hai saltato'],
  ]) {
    const view = fixture();
    const controller = mountUserQuestionDock({ ...view, question: trePassi, onSubmit() {} });
    controller.render({ stage: 'resolved', status, altrove: true,
      esito: { answers: { strada: 'A', canale: 'Il mio canale' }, at: '2026-09-24T13:02:00.000Z', da: 'persona' } });
    const tutto = testi(view.root.children[0]);
    assert.ok(tutto.includes(testata), testata);
    assert.ok(tutto.some((t) => t.includes(ricevuta)), 'la ricevuta dice chi: ' + ricevuta);
    assert.ok(!tutto.some((t) => t.includes(mai)), 'mai «' + mai + '» sotto una risposta data altrove');
  }
});
