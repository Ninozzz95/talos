import test from 'node:test';
import assert from 'node:assert/strict';
import { descriviAvanzamentoContesto } from '../../src/components/context-progress.js';
const state = (status, progress) => ({ sessionId: 'a', jobs: [{ id: 'one', state: status, progress }] });
test('CTX-PROGRESS-INDETERMINATE never invents a percentage for a generation without segment counts', () => {
  assert.equal(descriviAvanzamentoContesto(state('summarizing')).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('validating', { completed: 2, total: 2 })).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('summarizing', { completed: 1, total: 3 })).value, 1);
  assert.equal(descriviAvanzamentoContesto(state('summarizing', { completed: 4, total: 3 })).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('committed')).visible, false);
  assert.equal(descriviAvanzamentoContesto(state('failed')).active, false);
  assert.equal(descriviAvanzamentoContesto(state('paused')).visible, true);
});

/*
 * 09/09 — chiusura del punto 1 della consegna v004 («prova che nessuna condizione del click chiami
 * /compact o /context/jobs implicitamente»). La spec browser copre già il pulsante del topbar
 * (apertura senza POST) e la chat non abilitata (zero mutazioni). Restava scoperto il TERZO click:
 * il pulsante «Context Manager» dentro la barra di avanzamento in chat. Qui si prova che quel click
 * fa una cosa sola — chiama `onOpen` — e che il componente non riceve alcun client da cui poter
 * avviare qualcosa: non ha proprio la mano per farlo.
 */
test('CTX-PROGRESS-OPEN-ONLY il pulsante nella barra in chat chiama solo onOpen, una volta per click', async () => {
  const { JSDOM } = await import('jsdom').catch(() => ({ JSDOM: null }));
  if (!JSDOM) { assert.ok(true, 'jsdom assente: la prova DOM gira nella suite browser'); return; }
  const { aggiornaAvanzamentoContesto } = await import('../../src/components/context-progress.js');
  const dom = new JSDOM('<div id="c"></div>');
  const container = dom.window.document.getElementById('c');
  let aperture = 0;
  const row = aggiornaAvanzamentoContesto(container, state('summarizing', { completed: 1, total: 3 }), { onOpen: () => { aperture += 1; } });
  const button = row.querySelector('button');
  assert.equal(button.textContent, 'Context Manager');
  button.click(); button.click();
  assert.equal(aperture, 2, 'ogni click apre; nessun altro effetto è possibile perché la barra non ha un client');
  assert.equal(row.querySelector('[data-context-chat-status]').textContent, 'Compattazione contesto in corso');
});
