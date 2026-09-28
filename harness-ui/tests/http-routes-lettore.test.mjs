/*
 * F5 File reader (26/09/2026) — le due rotte che servono al lettore oltre alle pagine HTML:
 *   `GET /api/v1/sessions/:id/file/anteprima?percorso=` — il PDF di un file della cartella, IN LINEA, deciso dai byte;
 *   `GET /api/v1/lettore/ospite` — la pagina ospite dei documenti Word e PowerPoint, con una CSP sua.
 * Entrambe esistono per una misura: la CSP della pagina di TALOS non ammette `blob:` in `frame-src` e vieta gli stili in
 * linea, che un `srcdoc` eredita (26/09).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

const PDF = Buffer.from('%PDF-1.7\n%âã\n1 0 obj\n<<>>\nendobj\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const GETTONE = 'b'.repeat(64);

async function avvia(t, { token = null } = {}) {
  const file = new Map([['doc/relazione.pdf', PDF], ['finto.pdf', PNG], ['vero-senza-estensione', PDF], ['Città è.pdf', PDF]]);
  const sessionRegistry = {
    scaricaFile: async (idSessione, percorso) => {
      if (idSessione !== 's-1') return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!file.has(percorso)) return { erroreAvvio: 'File non trovato', code: 'FILE_NOT_FOUND' };
      return { ok: true, bytes: file.get(percorso), dimensione: file.get(percorso).length, nome: percorso.split('/').pop() };
    },
  };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry, listaTaskDisponibili: () => [], token }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const anteprima = (base, percorso, init) => fetch(`${base}/api/v1/sessions/s-1/file/anteprima?percorso=${encodeURIComponent(percorso)}`, init);

test('LETTORE-PDF: un PDF della cartella esce in linea con le intestazioni della rotta della Libreria', async (t) => {
  const base = await avvia(t);
  const r = await anteprima(base, 'doc/relazione.pdf');
  assert.equal(r.status, 200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), PDF);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(r.headers.get('content-disposition'), 'inline; filename="relazione.pdf"; filename*=UTF-8\'\'relazione.pdf');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; sandbox allow-scripts; object-src 'none'");
  const accenti = await anteprima(base, 'Città è.pdf');
  assert.match(accenti.headers.get('content-disposition'), /filename\*=UTF-8''Citt%C3%A0%20%C3%A8\.pdf$/u, 'il nome UTF-8 nella sua forma RFC 6266');
});

test('LETTORE-PDF: decidono i byte — un «.pdf» che è un PNG non esce come PDF, un PDF senza estensione sì', async (t) => {
  const base = await avvia(t);
  const finto = await anteprima(base, 'finto.pdf');
  assert.equal(finto.status, 404);
  assert.equal((await finto.json()).error.code, 'NOT_FOUND');
  assert.equal((await anteprima(base, 'vero-senza-estensione')).status, 200);
  assert.equal((await anteprima(base, 'manca.pdf')).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/altra/file/anteprima?percorso=doc%2Frelazione.pdf`)).status, 404);
  const metodo = await anteprima(base, 'doc/relazione.pdf', { method: 'POST' });
  assert.equal(metodo.status, 405);
  assert.equal(metodo.headers.get('allow'), 'GET, HEAD');
});

test('LETTORE-PDF: col gettone del server la rotta vuole il cookie (la cornice lo porta: parte dalla pagina di TALOS)', async (t) => {
  const base = await avvia(t, { token: GETTONE });
  assert.equal((await anteprima(base, 'doc/relazione.pdf')).status, 401);
  assert.equal((await anteprima(base, 'doc/relazione.pdf', { headers: { cookie: `talos_token=${GETTONE}` } })).status, 200);
});

test('LETTORE-OSPITE: la pagina ospite ha una CSP sua — stili in linea sì, un solo script col nonce, niente rete né origine', async (t) => {
  const base = await avvia(t);
  const r = await fetch(`${base}/api/v1/lettore/ospite`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const csp = r.headers.get('content-security-policy');
  const direttive = csp.split(';').map((d) => d.trim());
  assert.equal(direttive[0], 'sandbox allow-scripts');
  assert.doesNotMatch(csp, /allow-same-origin|allow-popups|allow-forms|allow-top-navigation|connect-src|'unsafe-eval'/u);
  assert.ok(direttive.includes("default-src 'none'"));
  assert.ok(direttive.includes("style-src 'unsafe-inline'"));
  assert.ok(direttive.includes('img-src data:'));
  assert.ok(direttive.includes("frame-ancestors 'self'"));
  const nonce = /script-src 'nonce-([^']+)'/u.exec(csp)?.[1];
  assert.ok(nonce, 'lo script ha un nonce');
  const corpo = await r.text();
  assert.equal((corpo.match(/<script/gu) ?? []).length, 1, 'un solo script');
  assert.ok(corpo.includes(`<script nonce="${nonce}">`), 'il nonce della CSP è quello dello script');
  assert.match(corpo, /e\.source !== genitore/u, 'accetta messaggi solo dalla pagina che la incornicia');
  assert.match(corpo, /tipo: 'talos-lettore-ospite-pronto'/u);
  // 26/09 pomeriggio: la resa si fa qui dentro — solo le due rese note, caricate col nonce di QUESTA pagina
  assert.deepEqual([...corpo.matchAll(/'(\/lettore-ospite-[a-z]+\.js)'/gu)].map((m) => m[1]), ['/lettore-ospite-documento.js', '/lettore-ospite-presentazione.js']);
  assert.match(corpo, /s\.nonce = nonce/u, 'lo script della resa porta il nonce della pagina');
  assert.match(corpo, /tipo: 'talos-lettore-ospite-errore'/u, 'un fallimento si dice alla pagina che incornicia');
  const altra = await fetch(`${base}/api/v1/lettore/ospite`);
  assert.notEqual(/script-src 'nonce-([^']+)'/u.exec(altra.headers.get('content-security-policy'))?.[1], nonce, 'un nonce nuovo a ogni risposta');
  const metodo = await fetch(`${base}/api/v1/lettore/ospite`, { method: 'POST' });
  assert.equal(metodo.status, 405);
});
