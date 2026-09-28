/*
 * F5 File reader (26/09/2026) — la RESA di una pagina HTML (decisione owner «con script ma senza rete»):
 *   `POST /api/v1/sessions/:id/pagine` {percorso} | {voceId} — col cookie, crea il lasciapassare;
 *   `GET /api/v1/pagine/:lasciapassare/<segmenti>` — senza cookie: la pagina e i vicini della SUA cartella.
 * Il lasciapassare esiste perché le sottorisorse di una cornice a origine nulla arrivano `cross-site` e senza il cookie
 * Strict (misurato il 26/09, `pagine-lasciapassare.mjs`). Si provano le intestazioni che la contengono, i vicini che deve
 * servire, l'ambito della cartella, ogni modo di uscirne, la scadenza, e l'esenzione dal cookie nei due versi.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import http, { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp, politicaPagina, tipoPerPagina } from '../src/http-app.mjs';
import { creaLasciapassarePagine } from '../src/pagine-lasciapassare.mjs';
import { WorkspaceFileError, leggiFilePagina } from '../src/workspace-files.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const GETTONE_SERVER = 'a'.repeat(64);

function preparaCartelle(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-pagina-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const cartella = join(radice, 'progetto');
  const fuori = join(radice, 'fuori');
  mkdirSync(join(cartella, 'guida'), { recursive: true });
  mkdirSync(fuori);
  writeFileSync(join(cartella, 'index.html'), '<!doctype html><link rel="stylesheet" href="stile.css"><p>radice</p>');
  writeFileSync(join(cartella, 'pagina.html'), '<!doctype html><script src="app.js"></script><p>pagina</p>');
  writeFileSync(join(cartella, 'stile.css'), 'p{color:red}');
  writeFileSync(join(cartella, 'app.js'), 'document.body.dataset.ok = "1";');
  writeFileSync(join(cartella, 'dati.bin'), Buffer.from([0, 1, 2, 3]));
  writeFileSync(join(cartella, 'guida', 'index.html'), '<p>guida</p>');
  writeFileSync(join(cartella, 'guida', 'nota.css'), 'p{}');
  writeFileSync(join(fuori, 'segreto.html'), '<p>fuori</p>');
  // una giunzione (su Windows non chiede privilegi) che dall'interno porta FUORI dalla cartella di sessione
  symlinkSync(fuori, join(cartella, 'scorciatoia'), 'junction');
  return cartella;
}

async function avvia(t, { cartella, voci = new Map(), lasciapassarePagine, token = null }) {
  const sessionRegistry = {
    leggiPagina: async (idSessione, segmenti) => {
      if (idSessione !== 's-1') return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await leggiFilePagina({ cartella, segmenti })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },
    scaricaVoceLibreria: async (_idSessione, voceId) => (voci.has(voceId)
      ? { ok: true, ...voci.get(voceId) }
      : { erroreAvvio: 'Questa voce della Libreria non esiste', code: 'LIBRARY_NOT_FOUND' }),
  };
  const app = createHttpApp({ staticHandler: async () => null, sessionRegistry, listaTaskDisponibili: () => [], token,
    ...(lasciapassarePagine ? { lasciapassarePagine } : {}) });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const cookie = { cookie: `talos_token=${GETTONE_SERVER}` };
async function crea(base, corpo, intestazioni = {}) {
  const r = await fetch(`${base}/api/v1/sessions/s-1/pagine`, { method: 'POST', headers: { 'content-type': 'application/json', ...intestazioni }, body: JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json() };
}
const indirizzo = async (base, corpo, intestazioni) => (await crea(base, corpo, intestazioni)).corpo.data.indirizzo;

test('PAGINE-CREA: un lasciapassare per una pagina o per la cartella che vale il suo index.html; mai per ciò che non è una pagina', async (t) => {
  const voci = new Map([['v-html', { bytes: Buffer.from('<p>voce</p>'), nome: 'Relazione.html', dimensione: 11 }],
    ['v-pdf', { bytes: Buffer.from('%PDF-1.7'), nome: 'Relazione.pdf', dimensione: 8 }]]);
  const base = await avvia(t, { cartella: preparaCartelle(t), voci });
  const pagina = await indirizzo(base, { percorso: 'index.html' });
  assert.match(pagina, /^\/api\/v1\/pagine\/[A-Za-z0-9_-]{43}\/index\.html$/u);
  const guida = await indirizzo(base, { percorso: 'guida' });
  assert.match(guida, /\/index\.html$/u);
  assert.equal(await (await fetch(`${base}${guida}`)).text(), '<p>guida</p>');
  assert.notEqual(pagina.split('/')[4], guida.split('/')[4], 'ogni pagina ha il suo lasciapassare');
  for (const [corpo, status, codice] of [[{ percorso: 'stile.css' }, 400, 'QUERY_INVALID'], [{ percorso: 'manca.html' }, 404, 'FILE_NOT_FOUND'],
    [{ voceId: 'v-pdf' }, 400, 'QUERY_INVALID'], [{ voceId: 'manca' }, 404, 'LIBRARY_NOT_FOUND'], [{ percorso: 'index.html', altro: 1 }, 400, 'QUERY_INVALID'],
    [{}, 400, 'QUERY_INVALID'], [{ percorso: '' }, 400, 'QUERY_INVALID'], [{ percorso: '../fuori/segreto.html' }, 400, 'QUERY_INVALID']]) {
    const esito = await crea(base, corpo);
    assert.equal(esito.status, status, JSON.stringify(corpo));
    assert.equal(esito.corpo.error.code, codice, JSON.stringify(corpo));
  }
  assert.match(await indirizzo(base, { voceId: 'v-html' }), /\/Relazione\.html$/u);
});

test('PAGINE-HEADERS: la pagina esce col suo tipo e con la CSP che la contiene (sandbox senza same-origin, niente rete)', async (t) => {
  const base = await avvia(t, { cartella: preparaCartelle(t) });
  const pagina = await indirizzo(base, { percorso: 'index.html' });
  const r = await fetch(`${base}${pagina}`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<!doctype html><link rel="stylesheet" href="stile.css"><p>radice</p>');
  assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(r.headers.get('allow-csp-from'), base);
  const csp = r.headers.get('content-security-policy');
  const direttive = csp.split(';').map((d) => d.trim());
  assert.equal(direttive[0], 'sandbox allow-scripts', 'la sandbox è la prima direttiva e concede SOLO gli script');
  assert.doesNotMatch(csp, /allow-same-origin|allow-popups|allow-forms|allow-top-navigation|allow-modals/u);
  assert.ok(direttive.includes("connect-src 'none'"));
  assert.ok(direttive.includes("form-action 'none'"));
  assert.ok(direttive.includes("frame-ancestors 'self'"));
  const cartellaPagina = `${base}${pagina.slice(0, pagina.lastIndexOf('/') + 1)}`;
  assert.ok(direttive.includes(`script-src ${cartellaPagina} 'unsafe-inline' 'unsafe-eval'`));
  assert.equal(csp, `sandbox allow-scripts; ${politicaPagina(cartellaPagina)}; frame-ancestors 'self'`);
});

test('PAGINE-VICINI: CSS e JS accanto alla pagina coi loro tipi, la query ignorata, un tipo ignoto come byte anonimi', async (t) => {
  const base = await avvia(t, { cartella: preparaCartelle(t) });
  const cartellaPagina = (await indirizzo(base, { percorso: 'pagina.html' })).replace(/pagina\.html$/u, '');
  const css = await fetch(`${base}${cartellaPagina}stile.css?v=2`);
  assert.equal(css.status, 200);
  assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal((await fetch(`${base}${cartellaPagina}app.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(`${base}${cartellaPagina}dati.bin`)).headers.get('content-type'), 'application/octet-stream');
  assert.equal(await (await fetch(`${base}${cartellaPagina}guida/`)).text(), '<p>guida</p>', 'una sottocartella vale il suo index.html');
  assert.equal(tipoPerPagina('LEGGIMI'), 'application/octet-stream', 'senza estensione non si indovina');
  assert.equal(tipoPerPagina('constructor'), 'application/octet-stream');
  assert.equal(tipoPerPagina('a.HTML'), 'text/html; charset=utf-8');
});

test('PAGINE-AMBITO: il lasciapassare di una sottocartella non legge la cartella sopra; un file con la barra in fondo non è una cartella', async (t) => {
  const base = await avvia(t, { cartella: preparaCartelle(t) });
  const guida = (await indirizzo(base, { percorso: 'guida/index.html' })).replace(/index\.html$/u, '');
  assert.equal((await fetch(`${base}${guida}nota.css`)).status, 200);
  assert.equal((await fetch(`${base}${guida}stile.css`)).status, 404, 'stile.css sta nella cartella SOPRA');
  const pagina = (await indirizzo(base, { percorso: 'pagina.html' })).replace(/pagina\.html$/u, '');
  const r = await fetch(`${base}${pagina}pagina.html/`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, 'FILE_NOT_FOUND');
});

test('PAGINE-FUGHE: nessun modo di uscire — .. codificato, %2F dentro un segmento, :, \\, segmenti vuoti, giunzione', async (t) => {
  const base = await avvia(t, { cartella: preparaCartelle(t) });
  const radice = (await indirizzo(base, { percorso: 'index.html' })).replace(/index\.html$/u, '');
  /* `%2e%2e` intero come segmento il parser WHATWG degli URL lo tratta come `..` e lo TOGLIE prima di ogni rotta (sia
     `fetch` sia il `new URL` del server): qui si mangerebbe il lasciapassare stesso. Si prova anche con una richiesta
     grezza, che non passa dal parser del client. */
  assert.equal((await fetch(`${base}${radice}%2e%2e/fuori/segreto.html`)).status, 404);
  const grezza = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/`, { path: `${radice}%2e%2e/%2e%2e/fuori/segreto.html` }, (r) => {
      let corpo = ''; r.on('data', (d) => { corpo += d; }); r.on('end', () => resolve({ status: r.statusCode, corpo }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.notEqual(grezza.status, 200, 'richiesta grezza con %2e%2e');
  assert.doesNotMatch(grezza.corpo, /fuori/u);
  for (const percorso of ['..%2Ffuori%2Fsegreto.html', 'guida%2F..%2F..%2Ffuori%2Fsegreto.html', 'pagina.html%3Asegreto',
    'C%3A%5CWindows%5Cwin.ini', 'guida%5C..%5Cindex.html', 'guida//index.html', '.%2Findex.html', '%00.html']) {
    const r = await fetch(`${base}${radice}${percorso}`);
    assert.equal(r.status, 400, percorso);
    assert.equal((await r.json()).error.code, 'QUERY_INVALID', percorso);
  }
  assert.equal((await fetch(`${base}${radice}scorciatoia/segreto.html`)).status, 400, 'la giunzione porta fuori: realpath la respinge');
  assert.equal((await fetch(`${base}${radice}%E0%A4%A`)).status, 404, 'una codifica rotta non è un percorso');
});

test('PAGINE-GETTONE: sconosciuto, malformato, scaduto o revocato vale 404; il tempo riparte a ogni uso', async (t) => {
  let adesso = 1_000_000;
  const lasciapassarePagine = creaLasciapassarePagine({ ora: () => adesso, durataMs: 1000 });
  const base = await avvia(t, { cartella: preparaCartelle(t), lasciapassarePagine });
  const pagina = await indirizzo(base, { percorso: 'index.html' });
  assert.equal((await fetch(`${base}/api/v1/pagine/${'b'.repeat(43)}/index.html`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/pagine/corto/index.html`)).status, 404);
  adesso += 900;
  assert.equal((await fetch(`${base}${pagina}`)).status, 200, 'usato prima della scadenza');
  adesso += 900;
  assert.equal((await fetch(`${base}${pagina}`)).status, 200, 'il tempo è ripartito dall\'uso precedente');
  adesso += 1001;
  assert.equal((await fetch(`${base}${pagina}`)).status, 404, 'scaduto');
  const altra = await indirizzo(base, { percorso: 'index.html' });
  assert.equal(lasciapassarePagine.revoca(altra.split('/')[4]), true);
  assert.equal((await fetch(`${base}${altra}`)).status, 404, 'revocato');
});

test('PAGINE-LIBRERIA: una voce HTML si serve al suo nome e basta; la sua CSP non apre altro', async (t) => {
  const voci = new Map([['v-html', { bytes: Buffer.from('<p>voce</p>'), nome: 'Relazione.html', dimensione: 11 }]]);
  const base = await avvia(t, { cartella: preparaCartelle(t), voci });
  const voce = await indirizzo(base, { voceId: 'v-html' });
  const r = await fetch(`${base}${voce}`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<p>voce</p>');
  assert.equal((await fetch(`${base}${voce.replace(/Relazione\.html$/u, 'stile.css')}`)).status, 404, 'una voce non ha vicini');
  assert.equal((await fetch(`${base}${voce}/`)).status, 404);
});

test('PAGINE-GETTONE-SERVER: la creazione vuole il cookie; la lettura col lasciapassare no — ma solo in GET e solo sotto /pagine/', async (t) => {
  const base = await avvia(t, { cartella: preparaCartelle(t), token: GETTONE_SERVER });
  assert.equal((await crea(base, { percorso: 'index.html' })).status, 401, 'senza cookie non si crea niente');
  const pagina = await indirizzo(base, { percorso: 'index.html' }, cookie);
  const r = await fetch(`${base}${pagina}`); // come le sottorisorse della cornice: niente cookie
  assert.equal(r.status, 200);
  assert.equal((await fetch(`${base}/api/v1/pagine/${'c'.repeat(43)}/index.html`)).status, 404, 'esente dal cookie non vuol dire aperto');
  assert.equal((await fetch(`${base}/api/v1/sessions`)).status, 401, 'l\'esenzione non si allarga alle altre rotte');
  assert.equal((await fetch(`${base}${pagina}`, { method: 'POST' })).status, 401, 'solo GET è esente');
});

test('PAGINE-METODI: la lettura è solo GET (405 con l\'Allow vero), la creazione solo POST', async (t) => {
  const base = await avvia(t, { cartella: preparaCartelle(t) });
  const pagina = await indirizzo(base, { percorso: 'index.html' });
  const r = await fetch(`${base}${pagina}`, { method: 'DELETE' });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'GET, HEAD');
  const p = await fetch(`${base}/api/v1/sessions/s-1/pagine`, { method: 'PUT' });
  assert.equal(p.status, 405);
  assert.equal(p.headers.get('allow'), 'POST');
});

test('PAGINE-SEGMENTI: le regole sul nome valgono anche chiamando leggiFilePagina direttamente', async (t) => {
  const cartella = preparaCartelle(t);
  for (const segmenti of [['..', 'fuori'], ['a:b'], ['a\\b'], ['a/b'], ['', 'index.html'], ['.'], ['a\0']]) {
    await assert.rejects(leggiFilePagina({ cartella, segmenti }), (e) => e instanceof WorkspaceFileError && e.code === 'QUERY_INVALID', JSON.stringify(segmenti));
  }
  await assert.rejects(leggiFilePagina({ cartella, segmenti: 'index.html' }), WorkspaceFileError, 'i segmenti sono un elenco');
  assert.equal((await leggiFilePagina({ cartella, segmenti: [] })).nome, 'index.html');
  assert.equal((await leggiFilePagina({ cartella, segmenti: ['guida', ''] })).bytes.toString(), '<p>guida</p>');
});

test('LASCIAPASSARE: 32 byte in base64url, al più 256 vivi (cade il meno usato), forma controllata prima della ricerca', () => {
  let n = 0;
  const casuali = () => { n += 1; return Buffer.alloc(32, n); };
  const registro = creaLasciapassarePagine({ massimo: 3, casuali });
  const [a, b, c] = [registro.crea({ x: 1 }), registro.crea({ x: 2 }), registro.crea({ x: 3 })];
  assert.match(a, /^[A-Za-z0-9_-]{43}$/u);
  assert.deepEqual(registro.usa(a), { x: 1 }); // a torna il più recente
  registro.crea({ x: 4 });
  assert.equal(registro.usa(b), null, 'b era il meno usato ed è caduto');
  assert.deepEqual(registro.usa(a), { x: 1 });
  assert.deepEqual(registro.usa(c), { x: 3 });
  assert.equal(registro.quanti, 3);
  assert.equal(registro.usa(`${a}x`), null, 'forma sbagliata');
  assert.equal(registro.usa(undefined), null);
  assert.throws(() => { registro.usa(a).x = 9; }, TypeError, 'l\'ambito è congelato');
});
