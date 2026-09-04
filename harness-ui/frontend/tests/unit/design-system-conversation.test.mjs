import assert from 'node:assert/strict';
import test from 'node:test';

import { createActivityBundle } from '../../src/design-system/activity-bundle.js';
import { createApprovalCard } from '../../src/design-system/approval-card.js';
import { createConversation } from '../../src/design-system/conversation.js';
import { createMessage } from '../../src/design-system/message.js';
import { createSignedReceipt } from '../../src/design-system/signed-receipt.js';
import { createTurn, createTurnSpine } from '../../src/design-system/turn.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const doc = () => fakeDocument();

/* ---------------- Conversation: COSA si annuncia mentre scrive ---------------- */

test('LOG-01 la conversazione è un role="log": le voci nuove si annunciano senza rileggere tutto', () => {
  const c = createConversation({ document: doc(), label: 'Conversazione con TALOS' });
  assert.equal(c.element.getAttribute('role'), 'log');
  assert.equal(c.element.getAttribute('aria-label'), 'Conversazione con TALOS');
  assert.equal(c.element.getAttribute('aria-busy'), 'false');
});

test('LOG-02 ⭐ mentre il modello scrive NON si annuncia ogni pezzo: un avviso, poi silenzio', () => {
  const d = doc();
  const detti = [];
  const c = createConversation({ document: d, label: 'Conversazione', announce: (m) => detti.push(m) });
  c.update({ streaming: true });
  assert.equal(c.element.getAttribute('aria-busy'), 'true');
  assert.deepEqual(detti, ['TALOS sta rispondendo']);
  // Il testo continua ad arrivare, un pezzo alla volta: nessun annuncio nuovo.
  c.update({ content: [d.createElement('div')] });
  c.update({ content: [d.createElement('div'), d.createElement('div')] });
  assert.deepEqual(detti, ['TALOS sta rispondendo']);
});

test('LOG-03 ⭐ alla fine si annuncia il messaggio INTERO, una volta sola', () => {
  const detti = [];
  const c = createConversation({ document: doc(), label: 'Conversazione', announce: (m) => detti.push(m) });
  c.update({ streaming: true });
  c.update({ streaming: false, completedText: 'La guardia è scritta e i test la coprono nei due versi.' });
  assert.deepEqual(detti, ['TALOS sta rispondendo', 'La guardia è scritta e i test la coprono nei due versi.']);
  assert.equal(c.element.getAttribute('aria-busy'), 'false');
});

test('LOG-04 AL CONTRARIO due inizi di fila non raddoppiano l\'avviso, e una fine senza inizio non annuncia', () => {
  const detti = [];
  const c = createConversation({ document: doc(), label: 'Conversazione', announce: (m) => detti.push(m) });
  c.update({ streaming: true });
  c.update({ streaming: true });
  assert.deepEqual(detti, ['TALOS sta rispondendo']);
  // Una fine che non ha mai avuto un inizio non annuncia niente.
  const altri = [];
  const d = createConversation({ document: doc(), label: 'Altra', announce: (m) => altri.push(m) });
  d.update({ streaming: false, completedText: 'testo mai iniziato' });
  assert.deepEqual(altri, []);
});

test('LOG-05 AL CONTRARIO un log senza nome non si monta', () => {
  assert.throws(() => createConversation({ document: doc() }), /richiede un nome/);
});

/* ---------------- Message ---------------- */

test('MSG-01 il messaggio è un article nominato dalla sua testata visibile', () => {
  const m = createMessage({ document: doc(), author: 'assistant', authorLabel: 'TALOS', model: 'claude-opus-5', time: '18:04' });
  assert.equal(m.element.tagName, 'ARTICLE');
  const testa = trova(m.element, (e) => e.className === 'talos-message__head');
  assert.equal(m.element.getAttribute('aria-labelledby'), testa.id);
  assert.equal(testoDi(testa), 'TALOSclaude-opus-5 · 18:04');
  assert.equal(m.element.getAttribute('aria-label'), null);
});

test('MSG-02 AL CONTRARIO un autore senza nome, o inventato, non si monta', () => {
  assert.throws(() => createMessage({ document: doc(), author: 'assistant' }), /nome dell'autore/);
  assert.throws(() => createMessage({ document: doc(), author: 'sistema', authorLabel: 'x' }), /autore del messaggio non valido/);
});

test('MSG-03 il testo completo è quello che l\'annuncio finale deve leggere', () => {
  const d = doc();
  const p = d.createElement('p');
  p.textContent = 'Ho letto il registro esistente.';
  const m = createMessage({ document: d, author: 'assistant', authorLabel: 'TALOS', content: [p] });
  assert.equal(trova(m.element, (e) => e.className === 'talos-message__body').textContent, 'Ho letto il registro esistente.');
});

/* ---------------- TurnSpine: la firma, ma non per chi ascolta ---------------- */

test('SPINE-01 la spina è una misura disegnata: si nasconde alle tecnologie assistive', () => {
  const s = createTurnSpine({ document: doc(), turns: [{ n: 1, cost: 1 }] });
  assert.equal(s.element.getAttribute('aria-hidden'), 'true');
});

test('SPINE-02 ogni giro dà un numero e una tacca, e il costo diventa --tick', () => {
  const s = createTurnSpine({ document: doc(), turns: [{ n: 2, cost: 4, outcome: 'info' }, { n: 3, cost: 1 }] });
  assert.equal(s.element.children.length, 4);
  const tacca = s.element.children[1];
  assert.match(tacca.className, /talos-turn-spine__tick--info/);
  assert.equal(tacca.dataset.tick, '4');
  assert.equal(s.element.children[3].className, 'talos-turn-spine__tick');
});

test('SPINE-03 AL CONTRARIO un costo fuori scala o un esito inventato non passano', () => {
  assert.throws(() => createTurnSpine({ document: doc(), turns: [{ n: 1, cost: 42 }] }), /fuori scala/);
  assert.throws(() => createTurnSpine({ document: doc(), turns: [{ n: 1, cost: -1 }] }), /fuori scala/);
  assert.throws(() => createTurnSpine({ document: doc(), turns: [{ n: 1, outcome: 'boh' }] }), /esito del giro non valido/);
});

test('TURN-01 il giro mette la spina prima del contenuto, e senza contenuto non si monta', () => {
  const d = doc();
  const spina = createTurnSpine({ document: d, turns: [{ n: 1 }] }).element;
  const corpo = d.createElement('div');
  const t = createTurn({ document: d, spine: spina, content: corpo });
  assert.deepEqual(t.element.children, [spina, corpo]);
  assert.throws(() => createTurn({ document: d, spine: spina }), /richiede un contenuto/);
});

/* ---------------- ActivityBundle ---------------- */

test('BUNDLE-01 la testata dice quanti E quanti falliti PRIMA di aprirsi', () => {
  const b = createActivityBundle({ document: doc(), count: 7, failed: 1, summaryWord: 'attrezzi usati in questo giro', failedWord: 'fallito' });
  const riassunto = trova(b.element, (e) => e.className === 'talos-activity__summary');
  assert.equal(riassunto.textContent, '7 attrezzi usati in questo giro · 1 fallito');
});

test('BUNDLE-02 senza falliti il riassunto non inventa uno zero', () => {
  const b = createActivityBundle({ document: doc(), count: 3, summaryWord: 'attrezzi' });
  assert.equal(trova(b.element, (e) => e.className === 'talos-activity__summary').textContent, '3 attrezzi');
});

test('BUNDLE-03 è una disclosure vera: aria-expanded e aria-controls verso il corpo', () => {
  const b = createActivityBundle({ document: doc(), count: 2, summaryWord: 'attrezzi' });
  const testa = trova(b.element, (e) => e.className === 'talos-activity__head');
  const corpo = trova(b.element, (e) => e.className === 'talos-activity__body');
  assert.equal(testa.getAttribute('aria-expanded'), 'false');
  assert.equal(testa.getAttribute('aria-controls'), corpo.id);
  assert.equal(corpo.hidden, true);
  testa.lancia('click', {});
  assert.equal(testa.getAttribute('aria-expanded'), 'true');
  assert.equal(corpo.hidden, false);
});

test('BUNDLE-04 AL CONTRARIO un conteggio che non è un intero non passa', () => {
  assert.throws(() => createActivityBundle({ document: doc(), count: '7', summaryWord: 'attrezzi' }), /un intero/);
  assert.throws(() => createActivityBundle({ document: doc(), count: 1 }), /parole del riassunto/);
});

/* ---------------- ApprovalCard ---------------- */

test('APPROVAL-01 è un gruppo con un nome, non una voce del log', () => {
  const d = doc();
  const a = createApprovalCard({ document: d, title: 'Chiede di scrivere', reason: 'Serve per aggiungere le soglie.', actions: [d.createElement('button')] });
  assert.equal(a.element.getAttribute('role'), 'group');
  assert.equal(a.element.getAttribute('aria-label'), 'Chiede di scrivere');
  assert.equal(a.element.tabIndex, -1);
});

test('APPROVAL-02 ⭐ si annuncia UNA volta sola: un avviso ripetuto insegna a spegnerli', () => {
  const d = doc();
  const detti = [];
  const a = createApprovalCard({
    document: d, title: 'Chiede di scrivere', reason: 'Serve per le soglie.',
    actions: [d.createElement('button')], announce: (m) => detti.push(m),
  });
  a.update({ presented: true });
  a.update({ presented: true });
  a.update({ presented: false });
  a.update({ presented: true });
  assert.deepEqual(detti, ['Chiede di scrivere. Serve per le soglie.']);
  assert.equal(a.element.focused, true);
});

test('APPROVAL-03 AL CONTRARIO senza PERCHÉ, o senza azioni, non si monta', () => {
  const d = doc();
  assert.throws(() => createApprovalCard({ document: d, title: 'Chiede', actions: [d.createElement('button')] }), /richiede il PERCHE/);
  assert.throws(() => createApprovalCard({ document: d, title: 'Chiede', reason: 'perché sì', actions: [] }), /almeno un'azione/);
});

/* ---------------- SignedReceipt ---------------- */

test('RECEIPT-01 l\'impronta è corta a schermo e INTERA dove si confronta', () => {
  const r = createSignedReceipt({ document: doc(), text: '18 righe aggiunte, 2 tolte.', hash: 'a1f4c39d77b19c02' });
  const impronta = trova(r.element, (e) => e.className === 'talos-receipt__hash');
  assert.equal(impronta.textContent, 'a1f4…9c02');
  assert.equal(impronta.getAttribute('title'), 'a1f4c39d77b19c02');
  assert.equal(impronta.dataset.hash, 'a1f4c39d77b19c02');
});

test('RECEIPT-02 un\'impronta corta non viene abbreviata', () => {
  const r = createSignedReceipt({ document: doc(), text: 'fatto', hash: 'a1f4c3' });
  assert.equal(trova(r.element, (e) => e.className === 'talos-receipt__hash').textContent, 'a1f4c3');
});

test('RECEIPT-03 AL CONTRARIO una ricevuta senza impronta non si monta', () => {
  assert.throws(() => createSignedReceipt({ document: doc(), text: 'fatto' }), /richiede un'impronta/);
  assert.throws(() => createSignedReceipt({ document: doc(), hash: 'abc' }), /richiede il testo/);
});
