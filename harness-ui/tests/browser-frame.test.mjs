import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaIntestazioni, verificaIncorniciabile, urlAmmesso } from '../src/browser-frame.mjs';

// K-I (06/09) — la cornice del Browser: si decide dalle intestazioni, con le regole di MDN.

const intestazioni = (obj) => ({ get: (k) => obj[k.toLowerCase()] ?? null });
const NOSTRA = 'http://127.0.0.1:4174';

test('FRAME-XFO: DENY e SAMEORIGIN vietano; senza intestazioni si può', () => {
  assert.equal(valutaIntestazioni(intestazioni({ 'x-frame-options': 'DENY' }), NOSTRA).incorniciabile, false);
  assert.equal(valutaIntestazioni(intestazioni({ 'x-frame-options': 'sameorigin' }), NOSTRA).incorniciabile, false);
  assert.equal(valutaIntestazioni(intestazioni({}), NOSTRA).incorniciabile, true);
});

test('FRAME-CSP: frame-ancestors prevale su X-Frame-Options; * e la nostra origine ammettono, self e none no', () => {
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "frame-ancestors 'none'", 'x-frame-options': 'ALLOWALL' }), NOSTRA).incorniciabile, false);
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "default-src 'self'; frame-ancestors *" }), NOSTRA).incorniciabile, true);
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': 'frame-ancestors http://127.0.0.1:4174' }), NOSTRA).incorniciabile, true);
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "frame-ancestors 'self'" }), NOSTRA).incorniciabile, false);
  // AL CONTRARIO: una CSP senza frame-ancestors lascia decidere X-Frame-Options
  assert.equal(valutaIntestazioni(intestazioni({ 'content-security-policy': "default-src 'self'", 'x-frame-options': 'DENY' }), NOSTRA).incorniciabile, false);
});

test('FRAME-URL: solo http/https, niente credenziali', () => {
  assert.equal(urlAmmesso(new URL('file:///C:/x')).ok, false);
  assert.equal(urlAmmesso(new URL('http://user:pw@example.org/')).ok, false);
  assert.equal(urlAmmesso(new URL('http://localhost:5173/')).ok, true);
});

test('FRAME-VERIFICA: legge intestazioni e titolo con un fetch finto, e non scarica la pagina intera', async () => {
  let cancellato = false;
  // il titolo sta nel primo pezzo; il resto della pagina non arriva mai chiuso: se il lettore non annulla, il test resta appeso
  const corpo = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<html><head><title>  Dev  server </title></head><body>' + 'x'.repeat(5_000))); }, cancel() { cancellato = true; } });
  const fetchFn = async () => ({ url: 'http://localhost:5173/', status: 200, headers: intestazioni({ 'content-type': 'text/html; charset=utf-8' }), body: corpo });
  const esito = await verificaIncorniciabile('localhost:5173'.replace(/^/, 'http://'), { fetchFn, origineNostra: NOSTRA });
  assert.deepEqual(esito, { url: 'http://localhost:5173/', incorniciabile: true, motivo: null, stato: 200, titolo: 'Dev server' });
  assert.equal(cancellato, true);
  const negato = await verificaIncorniciabile('https://example.org/x', { fetchFn: async () => ({ url: 'https://example.org/x', status: 200, headers: intestazioni({ 'x-frame-options': 'DENY' }), body: { cancel: async () => {} } }), origineNostra: NOSTRA });
  assert.equal(negato.incorniciabile, false);
  assert.match(negato.motivo, /DENY/);
  const morto = await verificaIncorniciabile('http://localhost:1/', { fetchFn: async () => { throw new TypeError('fetch failed'); }, origineNostra: NOSTRA });
  assert.deepEqual([morto.incorniciabile, morto.motivo], [false, 'La pagina non risponde']);
  const nonUrl = await verificaIncorniciabile('non è un url', { fetchFn: async () => { throw new Error('mai chiamato'); }, origineNostra: NOSTRA });
  assert.equal(nonUrl.motivo, 'URL non valido');
});
