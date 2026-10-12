import assert from 'node:assert/strict';
import test from 'node:test';

import { intestazioniDellaPagina, paginaDiRitorno, sicuro } from '../src/pagina-ritorno-accesso.mjs';

/* La pagina di ritorno dell'accesso (owner 11/10/2026): porta il segno di TALOS, non carica niente da fuori, non esegue niente. */
const NONCE = 'bm9uY2UtZGktcHJvdmE=';
const base = { lingua: 'en', esito: 'riuscito', titolo: 'Account connected', frase: 'Signed in.', poi: 'You can close this tab.', nonce: NONCE };

test('RITORNO-01 — the page carries the TALOS mark, the outcome, the three texts and the language', () => {
  const html = paginaDiRitorno(base);
  assert.match(html, /^<!doctype html><html lang="en">/u);
  assert.match(html, /<title>Account connected · TALOS<\/title>/u);
  assert.match(html, /<main class="riuscito">/u);
  assert.match(html, /class="segno"[^>]*aria-hidden="true"/u);
  assert.match(html, /<span>TALOS<\/span>/u);
  assert.match(html, /<h1>Account connected<\/h1>/u);
  assert.match(html, /<p>Signed in\.<\/p>/u);
  assert.match(html, /<p class="poi">You can close this tab\.<\/p>/u);
  const ko = paginaDiRitorno({ ...base, lingua: 'it', esito: 'fallito', titolo: 'Non collegato', frase: '', poi: '' });
  assert.match(ko, /<html lang="it">/u);
  assert.match(ko, /<main class="fallito">/u);
  assert.equal((ko.match(/<p[ >]/gu) ?? []).length, 0, 'empty texts leave no empty paragraph');
  assert.notEqual(paginaDiRitorno(base).match(/class="tratto"[^>]*d="([^"]+)"/u)[1], ko.match(/class="tratto"[^>]*d="([^"]+)"/u)[1], 'the two outcomes draw different marks');
});

test('RITORNO-02 — nothing from outside can become markup, and nothing is loaded or run', () => {
  const cattivo = '<script>alert(1)</script><img src=x onerror=alert(1)>"\'&';
  const html = paginaDiRitorno({ ...base, titolo: cattivo, frase: cattivo, poi: cattivo, lingua: '"><script>' });
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('onerror=alert(1)>'), false, 'the attribute stays inside escaped text');
  assert.equal(sicuro(cattivo), '&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
  const pulita = paginaDiRitorno(base);
  for (const vietato of ['<script', 'http://', 'https://', 'url(', '@import', 'javascript:', ' on']) {
    // the SVG namespace is an identifier, not a request
    assert.equal(pulita.replaceAll('xmlns="http://www.w3.org/2000/svg"', '').replace(/<title>.*?<\/title>/u, '').replace(/>[^<]*</gu, '><').includes(vietato), false, vietato);
  }
  assert.equal((pulita.match(/<style nonce="/gu) ?? []).length, 1);
  assert.match(pulita, new RegExp(`<style nonce="${NONCE}">`, 'u'));
});

test('RITORNO-03 — both themes and reduced motion are in the style; the mark is visible without animation', () => {
  const html = paginaDiRitorno(base);
  assert.match(html, /color-scheme:dark light/u);
  assert.match(html, /@media \(prefers-color-scheme:light\)/u);
  assert.match(html, /\.tratto\{stroke-dasharray:1;stroke-dashoffset:0\}/u, 'at rest the stroke is fully drawn');
  assert.match(html, /@media \(prefers-reduced-motion:no-preference\)\{\.tratto\{animation:/u, 'the only motion is opt-in');
});

test('RITORNO-04 — the page refuses to be built without a nonce, a title or a known outcome', () => {
  assert.throws(() => paginaDiRitorno({ ...base, nonce: '' }), /nonce/u);
  assert.throws(() => paginaDiRitorno({ ...base, nonce: `x"><script>` }), /nonce/u);
  assert.throws(() => paginaDiRitorno({ ...base, titolo: '' }), /title/u);
  assert.throws(() => paginaDiRitorno({ ...base, esito: 'forse' }), /outcome/u);
});

test('RITORNO-05 — the headers lock the page down', () => {
  const h = intestazioniDellaPagina({ nonce: NONCE, lingua: 'it' });
  assert.equal(h['Content-Security-Policy'], `default-src 'none'; style-src 'nonce-${NONCE}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  assert.equal(h['Content-Language'], 'it');
  assert.equal(h['Cache-Control'], 'no-store');
  assert.equal(h['Referrer-Policy'], 'no-referrer');
});
