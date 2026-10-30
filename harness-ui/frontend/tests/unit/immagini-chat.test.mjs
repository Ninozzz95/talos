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

/* 27/10/2026 (view_image, contratto punto 8): il riquadro riusato per la miniatura nella riga d'attività. Un documento finto minimo. */
function documentoFinto() {
  const crea = (tag) => {
    const ascoltatori = {};
    return {
      tagName: tag.toUpperCase(), attributi: {}, figli: [], classList: { classi: new Set(), add(c) { this.classi.add(c); }, contains(c) { return this.classi.has(c); } },
      set className(v) { for (const c of String(v).split(/\s+/u).filter(Boolean)) this.classList.add(c); }, get className() { return [...this.classList.classi].join(' '); },
      setAttribute(k, v) { this.attributi[k] = String(v); }, append(...n) { this.figli.push(...n); },
      addEventListener(tipo, fn) { (ascoltatori[tipo] ??= []).push(fn); }, emetti(tipo) { for (const fn of ascoltatori[tipo] ?? []) fn(); },
    };
  };
  return { createElement: crea };
}
test('IMAGE-VI-01 — la miniatura porta le misure vere e la decodifica asincrona; senza misure valide nessun attributo inventato', async () => {
  const { creaAnteprimaImmagine } = await import('../../src/components/immagini-chat.js');
  const url = '/api/v1/chat-images/' + 'a'.repeat(64);
  const conMisure = creaAnteprimaImmagine({ url, nome: 'foto.png', larghezza: 640, altezza: 480 }, { compatta: true, document: documentoFinto() });
  const img = conMisure.figli.find((n) => n.tagName === 'IMG');
  assert.equal(img.width, 640); assert.equal(img.height, 480); assert.equal(img.decoding, 'async'); assert.equal(img.loading, 'lazy');
  const senza = creaAnteprimaImmagine({ url, nome: 'foto.png', larghezza: -3, altezza: 1.5 }, { document: documentoFinto() }).figli.find((n) => n.tagName === 'IMG');
  assert.equal(senza.width, undefined); assert.equal(senza.height, undefined);
});
test('IMAGE-VI-02 — un\'immagine che non arriva lo dice nel riquadro e il riquadro non si apre più (come Hermes, mai sparire in silenzio)', async () => {
  const { creaAnteprimaImmagine } = await import('../../src/components/immagini-chat.js');
  const riquadro = creaAnteprimaImmagine({ url: '/api/v1/chat-images/' + 'b'.repeat(64), nome: 'persa.png' }, { document: documentoFinto() });
  const img = riquadro.figli.find((n) => n.tagName === 'IMG');
  const didascalia = riquadro.figli.find((n) => n.classList.contains('talos-image-card__caption'));
  assert.equal(riquadro.disabled, undefined);
  img.emetti('error');
  assert.equal(riquadro.disabled, true);
  assert.ok(riquadro.classList.contains('talos-image-card--rotta'));
  assert.match(didascalia.textContent, /persa\.png/u);
  assert.notEqual(didascalia.textContent, 'persa.png', 'la didascalia dice che non si è caricata, non solo il nome');
});
