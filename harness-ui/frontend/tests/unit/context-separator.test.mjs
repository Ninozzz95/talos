import test from 'node:test';
import assert from 'node:assert/strict';
import { creaSeparatoreContesto, aggiornaSeparatoreContesto } from '../../src/components/context-separator.js';

function node() { return { dataset: {}, children: [], setAttribute() {}, addEventListener() {}, append(...items) { this.children.push(...items); }, querySelectorAll() { return this.children; }, remove() { this.removed = true; } }; }
const document = { createElement: node };
test('CTX-UI-SEPARATOR-DEDUP: replay and reload produce one separator per persisted version', () => {
  const container = node();
  const event = { id: 'e1', sessionId: 's', versionId: 'v1', kind: 'context.committed', createdAt: '2026-09-09T00:00:00Z' };
  aggiornaSeparatoreContesto(container, [event, { ...event, id: 'e2' }], { sessionId: 's', document });
  aggiornaSeparatoreContesto(container, [event], { sessionId: 's', document });
  assert.equal(container.children.length, 1);
  const reloaded = node(); aggiornaSeparatoreContesto(reloaded, [event, event], { sessionId: 's', document });
  assert.equal(reloaded.children.length, 1);
});
test('CTX-UI-SEPARATOR-SCOPE: foreign sessions and uncommitted jobs are not publication evidence', () => {
  const container = node();
  aggiornaSeparatoreContesto(container, [{ id: 'e', sessionId: 'foreign', versionId: 'v', kind: 'context.committed' }, { id: 'p', sessionId: 's', state: 'summarizing', kind: 'context.progress' }], { sessionId: 's', document });
  assert.equal(container.children.length, 0);
  assert.equal(creaSeparatoreContesto({ sessionId: 's' }, { document }), null);
});
/*
 * 25/09/2026 — la riga «Riassunto automatico non riuscito» (evento `context.compaction.cooling` del motore, ticket della
 * CLI sui riassunti rifiutati richiesti a ogni passo): una per lavoro fallito, anche rigiocata; l'orario è assoluto.
 */
test('CTX-UI-COOLING-ROW: a paused automatic compaction is one row per failed job, with an absolute time, never a publication', () => {
  const container = node();
  const cooling = { id: 'cooling-j1', sessionId: 's', jobId: 'j1', kind: 'context.compaction.cooling', state: 'failed', createdAt: '2026-09-25T10:00:00.000Z', payload: { code: 'CTX_INVALID_SUMMARY', attempts: 2, waitSeconds: 300, retryAfter: '2026-09-25T10:05:00.000Z' } };
  aggiornaSeparatoreContesto(container, [cooling, cooling], { sessionId: 's', document });
  aggiornaSeparatoreContesto(container, [cooling], { sessionId: 's', document });
  assert.equal(container.children.length, 1, 'replay doubled the row');
  const [row] = container.children;
  assert.match(row.className, /talos-context-separator--cooling/u);
  assert.equal(row.dataset.contextVersion, undefined, 'a failed job is not a context version');
  const testo = row.children[0].textContent;
  const ora = new Date('2026-09-25T10:05:00.000Z').toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  assert.equal(testo, `Riassunto automatico non riuscito 2 volte di fila. Nuovo tentativo automatico dopo le ${ora}`);
  assert.doesNotMatch(testo, /CTX_|cooling|fra \d/u, 'technical names or a relative time on screen');
  // un secondo lavoro fallito è una riga sua; una pubblicazione resta il separatore di sempre
  aggiornaSeparatoreContesto(container, [{ ...cooling, id: 'cooling-j2', jobId: 'j2', payload: { ...cooling.payload, attempts: 1 } }, { id: 'v', sessionId: 's', versionId: 'v1', kind: 'context.version.committed' }], { sessionId: 's', document });
  assert.equal(container.children.length, 3);
  assert.match(container.children[1].children[0].textContent, /^Riassunto automatico non riuscito\. Nuovo tentativo/u);
  assert.equal(container.children[2].children[0].textContent, 'Contesto compattato');
  assert.equal(creaSeparatoreContesto({ ...cooling, jobId: undefined }, { document }), null, 'a pause without its job has no identity');
});
/*
 * B1 parte 3, review della sessione desktop (10/10/2026): un separatore STACCATO con un turno vecchio (finestra della rigiocata)
 * si aggiorna dov'è attraverso `staccato(chiave)`, e non rinasce in fondo alla colonna. AL CONTRARIO: senza `staccato`, o per
 * una sessione diversa, nasce come prima.
 */
test('B1-SEP-STACCATO: the engine separator detached with an old turn is found through staccato, not duplicated', () => {
  const event = { id: 'e1', sessionId: 's', versionId: 'v1', kind: 'context.committed', createdAt: '2026-09-09T00:00:00Z' };
  const prima = node();
  const [staccatoNodo] = aggiornaSeparatoreContesto(prima, [event], { sessionId: 's', document });
  const colonna = node(); // la colonna dopo lo smontaggio: il separatore non c'è più
  const chiavi = [];
  const trovati = aggiornaSeparatoreContesto(colonna, [event], { sessionId: 's', document, staccato: (k) => { chiavi.push(k); return staccatoNodo; } });
  assert.equal(colonna.children.length, 0, 'not appended again');
  assert.deepEqual(trovati, [staccatoNodo]);
  assert.deepEqual(chiavi, [staccatoNodo.dataset.contextSeparator], 'asked by its own key');
  // al contrario: senza staccato nasce in colonna; uno staccato di un'altra sessione non si prende
  aggiornaSeparatoreContesto(colonna, [event], { sessionId: 's', document });
  assert.equal(colonna.children.length, 1);
  const altra = node();
  aggiornaSeparatoreContesto(altra, [event], { sessionId: 's', document, staccato: () => ({ ...staccatoNodo, dataset: { ...staccatoNodo.dataset, contextSession: 'x' } }) });
  assert.equal(altra.children.length, 1, 'a detached row of another session is not reused');
});
