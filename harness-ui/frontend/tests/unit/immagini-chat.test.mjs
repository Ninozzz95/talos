import test from 'node:test';
import assert from 'node:assert/strict';
import { payloadImmagini, urlImmagineValida } from '../../src/components/immagini-chat.js';

test('IMAGE-07 — invia solo id dei pixel caricati, senza percorsi o dati del browser', () => {
  assert.deepEqual(payloadImmagini([{ tipo: 'testo' }, { tipo: 'immagine', id: 'a'.repeat(64), url: '/api/v1/chat-images/' + 'a'.repeat(64), nome: 'x.png' }]), [{ id: 'a'.repeat(64) }]);
  assert.throws(() => payloadImmagini([{ tipo: 'immagine', nome: 'persa.png' }]), /caricata/);
});
test('IMAGE-07b — la preview non carica indirizzi remoti o script', () => {
  for (const url of ['https://example.com/a.png', 'javascript:alert(1)', 'data:text/html,abc', '/api/v1/chat-images/../secret']) assert.equal(urlImmagineValida(url), false);
  assert.equal(urlImmagineValida('/api/v1/chat-images/' + 'a'.repeat(64)), true);
});
