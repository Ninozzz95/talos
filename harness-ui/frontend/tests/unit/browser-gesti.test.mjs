import test from 'node:test';
import assert from 'node:assert/strict';
import { gestoPerIlServer, GESTI_IGNORATI } from '../../src/components/browser-gesti.js';

/*
 * ⛔⛔⛔ 07/09/2026 — owner: «non hai provato dal vivo in tutte le sue sfaccettature il browser nella
 *   app finale». La prova C25 sul 4174 ha dato tre righe rosse: rotella, clic e tasti non facevano
 *   niente. Causa: la vista e il server parlavano due lingue diverse, e nessuno dei due lo diceva —
 *   il gesto partiva, il server rispondeva «non riconosciuto», a schermo silenzio.
 *   Queste prove tengono ferma la traduzione, ognuna con la sua metà al contrario.
 */

const TASTI = { alt: false, ctrl: false, meta: false, shift: false };
const CLIC_SU = { tipo: 'su', x: 120, y: 340, xVista: 120, yVista: 340, dentro: true, pulsante: 'sinistro', clic: 1, tasti: TASTI };

test('CLIC: il rilascio diventa un clic per il server, con le coordinate della PAGINA', () => {
  assert.deepEqual(gestoPerIlServer(CLIC_SU), {
    tipo: 'clic', x: 120, y: 340, tasto: 'sinistro', doppio: false, modificatori: TASTI,
  });
});

test('CLIC, al contrario: la pressione NON manda niente — o ogni clic sarebbe doppio', () => {
  // ⛔ il server manda già la coppia premuto+rilasciato: tradurre anche il «giù» raddoppierebbe tutto
  assert.equal(gestoPerIlServer({ ...CLIC_SU, tipo: 'giu' }), null);
  assert.equal(gestoPerIlServer({ ...CLIC_SU, tipo: 'muovi' }), null);
  assert.ok(GESTI_IGNORATI.includes('giu'));
});

test('CLIC: due clic di fila diventano un doppio clic, e il tasto destro resta destro', () => {
  assert.equal(gestoPerIlServer({ ...CLIC_SU, clic: 2 }).doppio, true);
  assert.equal(gestoPerIlServer({ ...CLIC_SU, pulsante: 'destro' }).tasto, 'destro');
});

test('CLIC fuori dai bordi: non si manda — la vista l’ha già misurato sui metadati del frame', () => {
  assert.equal(gestoPerIlServer({ ...CLIC_SU, dentro: false }), null);
});

test('ROTELLA: i delta cambiano nome, non valore', () => {
  const rotella = { tipo: 'rotella', x: 10, y: 20, deltaX: 0, deltaY: 900, tasti: TASTI };
  assert.deepEqual(gestoPerIlServer(rotella), { tipo: 'rotella', x: 10, y: 20, dx: 0, dy: 900, modificatori: TASTI });
});

test('TASTIERA: la pressione diventa un tasto; il rilascio no, perché il server manda già la sequenza', () => {
  const giu = { tipo: 'tastoGiu', tasto: 'a', codice: 'KeyA', testo: 'a', tasti: TASTI };
  assert.deepEqual(gestoPerIlServer(giu), { tipo: 'tasto', chiave: 'a', testo: 'a', modificatori: TASTI });
  assert.equal(gestoPerIlServer({ ...giu, tipo: 'tastoSu' }), null);
});

test('TASTIERA: un tasto senza nome non si manda, e un tasto speciale non porta testo', () => {
  assert.equal(gestoPerIlServer({ tipo: 'tastoGiu', tasto: '', tasti: TASTI }), null);
  assert.equal(gestoPerIlServer({ tipo: 'tastoGiu', tasto: 'Enter', testo: '', tasti: TASTI }).testo, '');
});

test('AL CONTRARIO — un tipo che non conosciamo non si inventa', () => {
  assert.equal(gestoPerIlServer({ tipo: 'telepatia', x: 1, y: 2 }), null);
  assert.equal(gestoPerIlServer(null), null);
  assert.equal(gestoPerIlServer('clic'), null);
});
