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
  const locale = await proxyPagina('http://localhost:5173/', { fetchFn: async () => ({ url: 'http://localhost:5173/', status: 200, headers: intestazioni({ 'content-type': 'text/html; charset=utf-8' }), text: async () => '<html><head></head><body>dev</body></html>' }), origineNostra: 'http://127.0.0.1:4175' });
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

/*
 * ⛔ 16/09/2026, P0 corsia B punto 4 — lo stesso difetto del modulo accanto, e nello stesso giorno:
 *   il `catch` del proxy diceva «La pagina non risponde» per QUALUNQUE guasto. Su un dev server la
 *   differenza è tutta: «non l'hai acceso» (ECONNREFUSED) e «ci ho messo troppo» (scadenza) portano
 *   due gesti diversi di chi sta programmando. La classificazione è una sola, condivisa con
 *   `browser-frame.mjs`: due tabelle che dicono la stessa cosa divergono senza che nessuno lo veda.
 */
test('PROXY-GUASTO: porta chiusa, nome inesistente e scadenza si raccontano per quello che sono', async () => {
  const conCausa = (code) => { const e = new TypeError('fetch failed'); e.cause = Object.assign(new Error(code), { code }); return e; };
  const chiedi = (errore) => proxyPagina('http://localhost:5173/', { fetchFn: async () => { throw errore; } });

  const spento = await chiedi(conCausa('ECONNREFUSED'));
  assert.equal(spento.genere, 'rifiuto');
  assert.match(spento.motivo, /Nessuno risponde/i, 'un dev server spento si dice così, non «la pagina non risponde»');

  const scaduto = await chiedi(conCausa('UND_ERR_CONNECT_TIMEOUT'));
  assert.equal(scaduto.genere, 'timeout');
  assert.match(scaduto.motivo, /non ha risposto in tempo/i);

  // AL CONTRARIO: un guasto che non so nominare non si traveste da uno che conosco
  const ignoto = await chiedi(new TypeError('fetch failed'));
  assert.equal(ignoto.genere, 'rete');
  assert.match(ignoto.motivo, /raggiungere il sito/i);
});

/*
 * ⛔ 16/09/2026, giro di riparazione — anche il percorso del proxy porta i PARAMETRI del guasto,
 * non solo la frase italiana già composta: è la metà del contratto che permette a chi disegna di
 * scrivere la frase nella lingua di chi guarda. Senza, il proxy resterebbe l’unico punto in cui
 * il pannello può tornare mezzo inglese e mezzo italiano.
 */
test('PROXY-PARAMETRI: i secondi del timeout arrivano come dato, e un guasto senza parametri non ne inventa', async () => {
  const lento = await proxyPagina('http://127.0.0.1:5173/', { fetchFn: () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }, millisecondi: 6000 });
  assert.equal(lento.ok, false);
  assert.equal(lento.genere, 'timeout');
  assert.equal(lento.dettagli.secondi, 6);
  const morto = await proxyPagina('http://127.0.0.1:5173/', { fetchFn: () => { const e = new TypeError('fetch failed'); e.cause = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }); throw e; } });
  assert.deepEqual(morto.dettagli, {});
});
