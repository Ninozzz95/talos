import test from 'node:test';
import assert from 'node:assert/strict';
import { riscriviHtml, proxyPagina, bersaglioLocale, SCRIPT_OVERLAY } from '../src/browser-proxy.mjs';

// Browser oltre Hermes (06/09) — il proxy locale: solo bersagli locali, riscrittura del documento.

const intestazioni = (obj) => ({ get: (k) => obj[k.toLowerCase()] ?? null });

test('PROXY-LOCALE: localhost, 127.0.0.1 e ::1 sì; un sito remoto no', () => {
  assert.equal(bersaglioLocale(new URL('http://localhost:5173/')), true);
  assert.equal(bersaglioLocale(new URL('http://127.0.0.1:4199/x')), true);
  assert.equal(bersaglioLocale(new URL('http://[::1]:3000/')), true);
  assert.equal(bersaglioLocale(new URL('https://github.com/')), false);
  assert.equal(bersaglioLocale(new URL('http://192.168.1.10/')), false);
});

test('PROXY-RISCRITTURA: via la CSP in pagina, base sull’origine vera, il nostro script per primo nel head', () => {
  const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><title>x</title></head><body><p>ciao</p></body></html>';
  const out = riscriviHtml(html, 'http://localhost:5173/app/', 'http://127.0.0.1:4174');
  assert.ok(!/content-security-policy/i.test(out));
  // lo script è ASSOLUTO sulla nostra origine: con <base> sul dev server un percorso relativo andrebbe a finire là (trovato dal vivo il 06/09)
  assert.ok(out.includes('<head><base href="http://localhost:5173/app/"><script src="http://127.0.0.1:4174' + SCRIPT_OVERLAY + '" data-talos-url="http://localhost:5173/app/"></script><title>'));
  // AL CONTRARIO: una base già presente resta quella della pagina
  const conBase = riscriviHtml('<html><head><base href="/x/"></head><body></body></html>', 'http://localhost:1/');
  assert.equal((conBase.match(/<base /g) || []).length, 1);
  // senza head: si crea
  assert.ok(riscriviHtml('<html><body>solo</body></html>', 'http://localhost:1/').includes('<html><head><base href='));
});

test('PROXY-PAGINA: un sito remoto è rifiutato prima di qualunque fetch; un dev server locale viene riscritto; non-HTML rifiutato', async () => {
  const remoto = await proxyPagina('https://github.com/', { fetchFn: async () => { throw new Error('mai chiamato'); } });
  assert.deepEqual([remoto.ok, remoto.codice], [false, 'BROWSER_PROXY_SOLO_LOCALE']);
  const locale = await proxyPagina('http://localhost:5173/', { fetchFn: async () => new Response('<html><head></head><body>dev</body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }), origineNostra: 'http://127.0.0.1:4175' });
  assert.equal(locale.ok, true);
  assert.ok(locale.html.includes('http://127.0.0.1:4175' + SCRIPT_OVERLAY) && locale.html.includes('<base href="http://localhost:5173/">'));
  const css = await proxyPagina('http://localhost:5173/a.css', { fetchFn: async () => ({ url: 'http://localhost:5173/a.css', status: 200, headers: intestazioni({ 'content-type': 'text/css' }), body: { cancel: async () => {} } }) });
  assert.deepEqual([css.ok, css.codice], [false, 'BROWSER_PROXY_NON_HTML']);
  // un redirect che esce dal computer si rifiuta
  const fuori = await proxyPagina('http://localhost:5173/', { fetchFn: async () => ({ url: 'https://example.org/', status: 200, headers: intestazioni({ 'content-type': 'text/html' }), body: { cancel: async () => {} }, text: async () => '' }) });
  assert.equal(fuori.codice, 'BROWSER_PROXY_SOLO_LOCALE');
  const morto = await proxyPagina('http://localhost:1/', { fetchFn: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(morto.codice, 'BROWSER_PROXY_IRRAGGIUNGIBILE');
});
