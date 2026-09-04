import assert from 'node:assert/strict';
import test from 'node:test';

import { createNavGroup, createNavItem } from '../../src/design-system/nav-item.js';
import { createSessionItem } from '../../src/design-system/session-item.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const doc = () => fakeDocument();

/* ---------------- NavItem ---------------- */

test('NAV-01 una voce è un <li> con dentro un <button>: la lista è vera', () => {
  const v = createNavItem({ document: doc(), label: 'Capability' });
  assert.equal(v.element.tagName, 'LI');
  assert.equal(v.element.children[0].tagName, 'BUTTON');
});

test('NAV-02 la voce corrente si dichiara come PAGINA', () => {
  const v = createNavItem({ document: doc(), label: 'Board', current: true });
  assert.equal(v.element.children[0].getAttribute('aria-current'), 'page');
  v.update({ current: false });
  assert.equal(v.element.children[0].getAttribute('aria-current'), null);
});

test('NAV-03 il conteggio porta la sua unità per chi ascolta', () => {
  const v = createNavItem({ document: doc(), label: 'Capability', count: 43, countUnit: 'attrezzi' });
  const conto = trova(v.element, (e) => e.className === 'talos-nav-item__count');
  assert.equal(testoDi(conto), '43 attrezzi');
  // Il numero resta visibile da solo: l'unità vive in un nodo `sr-only`
  // accanto, quindi chi guarda legge «43» e chi ascolta «43 attrezzi».
  const unita = trova(conto, (e) => e.className === 'sr-only');
  assert.equal(unita.textContent, ' attrezzi');
  assert.equal(conto.children.filter((c) => c.className !== 'sr-only').map((c) => c.textContent).join(''), '43');
});

test('NAV-04 la scorciatoia finisce su aria-keyshortcuts del pulsante', () => {
  const v = createNavItem({ document: doc(), label: 'Nuova sessione', shortcut: { keys: ['Ctrl', 'N'] } });
  assert.equal(v.element.children[0].getAttribute('aria-keyshortcuts'), 'Control+N');
});

test('NAV-05 AL CONTRARIO senza label non si monta, e una scorciatoia di una lettera è rifiutata', () => {
  assert.throws(() => createNavItem({ document: doc() }), /richiede una label/);
  assert.throws(() => createNavItem({ document: doc(), label: 'X', shortcut: { keys: ['N'] } }), /una lettera sola/);
});

test('NAV-06 premere la voce chiama chi ascolta, e smette dopo destroy', () => {
  const premuti = [];
  const v = createNavItem({ document: doc(), label: 'Memoria', onPress: () => premuti.push(1) });
  v.element.children[0].lancia('click', {});
  v.destroy();
  v.element.children[0].lancia('click', {});
  assert.equal(premuti.length, 1);
});

/* ---------------- NavGroup ---------------- */

test('GROUP-01 il blocco è un elenco vero, nominato dall\'etichetta VISIBILE', () => {
  const d = doc();
  const voci = ['Capability', 'Board'].map((l) => createNavItem({ document: d, label: l }).element);
  const g = createNavGroup({ document: d, label: 'Luoghi', items: voci });
  const ul = trova(g.element, (e) => e.tagName === 'UL');
  const titolo = trova(g.element, (e) => e.className === 'talos-eyebrow');
  assert.equal(ul.children.length, 2);
  assert.equal(ul.getAttribute('aria-labelledby'), titolo.id);
  assert.equal(titolo.textContent, 'Luoghi');
  // ⛔ Niente aria-label duplicato: i browser non lo traducono.
  assert.equal(ul.getAttribute('aria-label'), null);
});

test('GROUP-02 due blocchi hanno nomi diversi, quindi si distinguono', () => {
  const d = doc();
  const a = createNavGroup({ document: d, label: 'Luoghi', items: [] });
  const b = createNavGroup({ document: d, label: 'Sessioni', items: [] });
  const idA = trova(a.element, (e) => e.tagName === 'UL').getAttribute('aria-labelledby');
  const idB = trova(b.element, (e) => e.tagName === 'UL').getAttribute('aria-labelledby');
  assert.notEqual(idA, idB);
});

test('GROUP-03 AL CONTRARIO un blocco senza etichetta non si monta', () => {
  assert.throws(() => createNavGroup({ document: doc(), items: [] }), /richiede una label visibile/);
});

/* ---------------- SessionItem ---------------- */

test('SESSION-01 la sessione aperta è «corrente», NON «pagina»', () => {
  const s = createSessionItem({ document: doc(), title: 'W1-02', status: 'live', statusLabel: 'in corso', current: true });
  assert.equal(s.element.children[0].getAttribute('aria-current'), 'true');
});

test('SESSION-02 lo stato ha un nome, non solo un colore', () => {
  const s = createSessionItem({ document: doc(), title: 'Confronto Hermes', status: 'error', statusLabel: 'giri finiti', model: 'claude-sonnet-5' });
  const sotto = trova(s.element, (e) => e.className === 'talos-session-item__sub');
  assert.equal(testoDi(sotto), 'giri finiti · claude-sonnet-5');
  const pallino = trova(s.element, (e) => String(e.className).startsWith('talos-dot'));
  assert.match(pallino.className, /talos-dot--danger/);
  assert.equal(pallino.getAttribute('aria-hidden'), 'true');
});

test('SESSION-03 i giri portano la loro unità', () => {
  const s = createSessionItem({ document: doc(), title: 'x', status: 'done', statusLabel: 'conclusa', turns: 7, when: '18:09' });
  const aside = trova(s.element, (e) => e.className === 'talos-session-item__aside');
  assert.equal(testoDi(aside), '18:097 giri');
});

test('SESSION-04 AL CONTRARIO uno stato senza nome, o inventato, non si monta', () => {
  assert.throws(() => createSessionItem({ document: doc(), title: 'x', status: 'live' }), /nome dello stato/);
  assert.throws(() => createSessionItem({ document: doc(), title: 'x', status: 'boh', statusLabel: 'y' }), /stato sessione non valido/);
  assert.throws(() => createSessionItem({ document: doc(), status: 'done', statusLabel: 'conclusa' }), /richiede un titolo/);
});

test('SESSION-05 ogni stato ha il suo tono, e sono cinque distinti', () => {
  const toni = ['live', 'waiting', 'done', 'error', 'interrupted'].map((status) => {
    const s = createSessionItem({ document: doc(), title: 't', status, statusLabel: 'n' });
    return trova(s.element, (e) => String(e.className).startsWith('talos-dot')).className;
  });
  assert.equal(new Set(toni).size, 5);
});
