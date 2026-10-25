/*
 * 24/10/2026 — le rotte delle VERSIONI di una voce di Libreria (owner: «vedere e ripristinare», «si tengono tutte»; la carta in chat
 * resta sulla sua versione). Il registro è finto ma il magazzino è quello VERO, su disco: le rotte passano dalle stesse funzioni
 * della CLI (`library-store.mjs`).
 *   GET  /api/v1/sessions/:id/library/:voceId/versions              → { versioni, totale }
 *   POST /api/v1/sessions/:id/library/:voceId/versions/:n/restore   → una versione NUOVA col contenuto della n
 *   POST /api/v1/sessions/:id/pagine {voceId, versione}             → la pagina di QUELLA versione
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { aggiungiVersione, elencaVersioni, leggiVersione, leggiVoce, ripristinaVersione, salvaVoce } from '../src/library-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const GETTONE = 'a'.repeat(64);
const cookie = { cookie: `talos_token=${GETTONE}` };

async function avvia(t) {
  const dati = mkdtempSync(join(tmpdir(), 'talos-http-versioni-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  const id = await salvaVoce({ cartella: dati, nome: 'Sales.html', mediaType: 'text/html', origine: 'generated', modello: 'm', testo: '<p>v1</p>' });
  await aggiungiVersione({ cartella: dati, id, testo: '<p>v2</p>' });
  const nessuna = (code = 'LIBRARY_NOT_FOUND') => ({ erroreAvvio: 'not found', code });
  const sessionRegistry = {
    elencaVersioniLibreria: async (s, voceId) => {
      if (s !== 's-1') return nessuna('NOT_FOUND');
      const versioni = await elencaVersioni({ cartella: dati, id: voceId });
      return versioni ? { ok: true, versioni, totale: versioni.length } : nessuna();
    },
    scaricaVersioneLibreria: async (s, voceId, n) => {
      const v = s === 's-1' ? await leggiVersione({ cartella: dati, id: voceId, n }) : null;
      return v ? { ok: true, nome: v.nome, bytes: Buffer.from(v.testo) } : nessuna();
    },
    scaricaVoceLibreria: async (s, voceId) => {
      const v = s === 's-1' ? await leggiVoce({ cartella: dati, id: voceId }) : null;
      return v ? { ok: true, nome: v.nome, bytes: Buffer.from(v.testo) } : nessuna();
    },
    ripristinaVersioneLibreria: async (s, voceId, n) => {
      const r = s === 's-1' ? await ripristinaVersione({ cartella: dati, id: voceId, n, sessionId: s }) : null;
      return r ? { ok: true, ...r } : nessuna();
    },
  };
  const app = createHttpApp({ staticHandler: async () => null, sessionRegistry, listaTaskDisponibili: () => [], token: GETTONE });
  const server = createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  return { base: `http://127.0.0.1:${server.address().port}`, dati, id };
}
const json = async (r) => ({ status: r.status, corpo: await r.json() });
const post = (base, percorso, corpo) => fetch(`${base}${percorso}`, { method: 'POST', headers: { 'content-type': 'application/json', ...cookie }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });

test('LIB-VER-HTTP-01 — l\'elenco delle versioni', async (t) => {
  const { base, id } = await avvia(t);
  const r = await json(await fetch(`${base}/api/v1/sessions/s-1/library/${id}/versions`, { headers: cookie }));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.data.totale, 2);
  assert.deepEqual(r.corpo.data.versioni.map((v) => v.n), [1, 2]);
  const manca = await json(await fetch(`${base}/api/v1/sessions/s-1/library/lib-00000000-0000-4000-8000-000000000000/versions`, { headers: cookie }));
  assert.equal(manca.status, 404);
  /* AL CONTRARIO: senza il cookie no */
  assert.equal((await fetch(`${base}/api/v1/sessions/s-1/library/${id}/versions`)).status, 401);
});

test('LIB-VER-HTTP-02 — la pagina di UNA versione: la carta del giro 1 resta sulla v1 anche dopo la v2', async (t) => {
  const { base, id } = await avvia(t);
  const v1 = await json(await post(base, '/api/v1/sessions/s-1/pagine', { voceId: id, versione: 1 }));
  assert.equal(v1.status, 200, JSON.stringify(v1.corpo));
  assert.equal(await (await fetch(`${base}${v1.corpo.data.indirizzo}`)).text(), '<p>v1</p>');
  const ultima = await json(await post(base, '/api/v1/sessions/s-1/pagine', { voceId: id }));
  assert.equal(await (await fetch(`${base}${ultima.corpo.data.indirizzo}`)).text(), '<p>v2</p>');
  for (const corpo of [{ voceId: id, versione: 0 }, { voceId: id, versione: 1.5 }, { voceId: id, versione: '1' }, { voceId: id, versione: 1, altro: 1 }]) {
    assert.equal((await post(base, '/api/v1/sessions/s-1/pagine', corpo)).status, 400, JSON.stringify(corpo));
  }
  assert.equal((await post(base, '/api/v1/sessions/s-1/pagine', { voceId: id, versione: 9 })).status, 404);
});

test('LIB-VER-HTTP-03 — Ripristina crea una versione NUOVA; un numero non valido è 404; GET non ripristina', async (t) => {
  const { base, dati, id } = await avvia(t);
  const r = await json(await post(base, `/api/v1/sessions/s-1/library/${id}/versions/1/restore`));
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.data.versione, 3);
  assert.equal((await leggiVoce({ cartella: dati, id })).testo, '<p>v1</p>');
  for (const n of ['0', 'abc', '01', '1234567']) {
    assert.equal((await post(base, `/api/v1/sessions/s-1/library/${id}/versions/${n}/restore`)).status, 404, n);
  }
  assert.equal((await post(base, `/api/v1/sessions/s-1/library/${id}/versions/7/restore`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/s-1/library/${id}/versions/1/restore`, { headers: cookie })).status, 405);
  assert.equal((await elencaVersioni({ cartella: dati, id })).length, 3, 'niente altro scritto');
});
