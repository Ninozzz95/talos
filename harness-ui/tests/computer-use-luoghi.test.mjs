/*
 * I luoghi di «Consenti sempre» (owner 03/11/2026, decisione 75): il registro nella cartella dei dati e le rotte sul gestore HTTP VERO.
 * Si aggiunge solo dalla carta del compito (nessuna rotta aggiunge), si toglie da Impostazioni, e un file storto vale come elenco vuoto:
 * nel dubbio TALOS chiede la carta.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { ORIGINE_REMOTA } from '../src/origine-remota.mjs';
import { creaRegistroLuoghi, TETTO_LUOGHI } from '../src/computer-use/luoghi-ricordati.mjs';
import { creaRotteLuoghi } from '../src/computer-use/luoghi-rotte.mjs';

async function cartella(t) {
  const dir = await mkdtemp(join(tmpdir(), 'luoghi-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir));
  return dir;
}
const orologio = () => { let t = Date.parse('2026-11-03T10:00:00.000Z'); return () => (t += 1000); };

test('LUOGHI-01: ricorda, legge per il ciclo e per lo schermo; domini in minuscolo; ripetere aggiorna la data', async (t) => {
  const r = creaRegistroLuoghi({ file: join(await cartella(t), 'l.json'), adesso: orologio() });
  assert.deepEqual(await r.perIlCiclo(), { domini: [], app: [] }, 'file che non c\'è: vuoto');
  assert.deepEqual(await r.ricorda({ domini: [' Negozio.Example '], app: ['Esplora file'] }), { aggiunti: 2 });
  assert.deepEqual(await r.perIlCiclo(), { domini: ['negozio.example'], app: ['Esplora file'] });
  const prima = (await r.elenco()).voci.find((v) => v.tipo === 'dominio').quando;
  await r.ricorda({ domini: ['negozio.example'] });
  const voci = (await r.elenco()).voci;
  assert.equal(voci.length, 2, 'niente doppioni');
  assert.ok(voci[0].quando > prima && voci[0].nome === 'negozio.example', 'il più recente in cima, con la data nuova');
});

test('LUOGHI-02: nomi storti scartati, mai scritti', async (t) => {
  const r = creaRegistroLuoghi({ file: join(await cartella(t), 'l.json'), adesso: orologio() });
  assert.deepEqual(await r.ricorda({ domini: ['', '  ', 3, null, 'a b.example', '-x.example', 'x'.repeat(254), 'riga\nnuova'], app: ['', 'tab\tqui'] }), { aggiunti: 0 });
  assert.deepEqual(await r.perIlCiclo(), { domini: [], app: [] });
  assert.deepEqual(await r.ricorda({ domini: 'negozio.example' }), { aggiunti: 0 }, 'non un elenco');
});

test('LUOGHI-03: togli uno, per tipo e nome esatti; svuota; ciò che non c\'è non cambia niente', async (t) => {
  const r = creaRegistroLuoghi({ file: join(await cartella(t), 'l.json'), adesso: orologio() });
  await r.ricorda({ domini: ['negozio.example', 'banca.example'], app: ['negozio.example'] });
  assert.deepEqual(await r.togli({ tipo: 'dominio', nome: 'NEGOZIO.example' }), { tolti: 1 });
  assert.deepEqual(await r.perIlCiclo(), { domini: ['banca.example'], app: ['negozio.example'] }, 'il programma con lo stesso nome resta');
  assert.deepEqual(await r.togli({ tipo: 'dominio', nome: 'altro.example' }), { tolti: 0 });
  assert.deepEqual(await r.togli({ tipo: 'sito', nome: 'banca.example' }), { tolti: 0 });
  assert.deepEqual(await r.svuota(), { tolti: 2 });
  assert.deepEqual(await r.perIlCiclo(), { domini: [], app: [] });
});

test('LUOGHI-04: file storto o voci storte valgono come vuoto, e il salvataggio dopo lo riscrive pulito', async (t) => {
  const dir = await cartella(t);
  const file = join(dir, 'l.json');
  for (const storto of ['non json', '[]', '{"voci":"x"}', '{"voci":[{"tipo":"sito","nome":"a.example"},{"tipo":"dominio"},null]}']) {
    await writeFile(file, storto);
    assert.deepEqual(await creaRegistroLuoghi({ file }).perIlCiclo(), { domini: [], app: [] }, storto);
    assert.deepEqual((await creaRegistroLuoghi({ file }).elenco()).voci, [], `anche a schermo: ${storto}`);
  }
  await writeFile(file, '{"voci":[{"tipo":"dominio","nome":"buono.example","quando":"mai"},{"tipo":"dominio","nome":"BUONO.example"}]}');
  const r = creaRegistroLuoghi({ file, adesso: orologio() });
  assert.deepEqual((await r.elenco()).voci, [{ tipo: 'dominio', nome: 'buono.example', quando: null }], 'data non valida = senza data, doppioni uniti');
  await r.ricorda({ app: ['Esplora file'] });
  assert.equal(JSON.parse(await readFile(file, 'utf8')).voci.length, 2);
});

test('LUOGHI-05: scritture insieme non si perdono; oltre il tetto restano le più recenti', async (t) => {
  const r = creaRegistroLuoghi({ file: join(await cartella(t), 'l.json'), adesso: orologio() });
  await Promise.all(Array.from({ length: 20 }, (_, i) => r.ricorda({ domini: [`d${i}.example`] })));
  assert.equal((await r.perIlCiclo()).domini.length, 20);
  await r.ricorda({ domini: Array.from({ length: TETTO_LUOGHI + 5 }, (_, i) => `n${i}.example`) });
  const d = (await r.perIlCiclo()).domini;
  assert.equal(d.length, TETTO_LUOGHI);
  assert.ok(d.includes(`n${TETTO_LUOGHI + 4}.example`) && !d.includes('d0.example'), 'restano i più recenti, vanno i vecchi');
});

test('LUOGHI-06: le rotte senza HTTP: forma del corpo, conferma obbligatoria per svuotare, nessuna rotta che aggiunge', async (t) => {
  const registro = creaRegistroLuoghi({ file: join(await cartella(t), 'l.json'), adesso: orologio() });
  await registro.ricorda({ domini: ['negozio.example'] });
  const rotta = creaRotteLuoghi({ registro });
  const base = '/api/v1/computer-use/remembered-places';
  assert.equal((await rotta({ method: 'GET', percorso: base })).dati.voci.length, 1);
  for (const corpo of [{}, { tipo: 'dominio' }, { tipo: 'x', nome: 'a' }, { tipo: 'dominio', nome: ' ' }, { tipo: 'dominio', nome: 'a', altro: 1 }, null, [1]]) {
    assert.equal((await rotta({ method: 'POST', percorso: `${base}/remove`, corpo })).errore?.code, 'QUERY_INVALID', JSON.stringify(corpo));
  }
  for (const corpo of [{}, { conferma: 'true' }, { conferma: true, tutto: true }]) {
    assert.equal((await rotta({ method: 'POST', percorso: `${base}/clear`, corpo })).errore?.code, 'QUERY_INVALID', JSON.stringify(corpo));
  }
  assert.equal((await registro.perIlCiclo()).domini.length, 1, 'niente tolto dalle richieste storte');
  assert.equal((await rotta({ method: 'POST', percorso: `${base}/add`, corpo: { tipo: 'dominio', nome: 'x.example' } })).stato, 404);
  assert.equal((await rotta({ method: 'POST', percorso: base })).stato, 405);
  assert.equal((await creaRotteLuoghi({ registro: null })({ method: 'GET', percorso: base })).stato, 503);
});

async function banco(t, { conRegistro = true } = {}) {
  const registro = conRegistro ? creaRegistroLuoghi({ file: join(await cartella(t), 'l.json'), adesso: orologio() }) : null;
  if (registro) await registro.ricorda({ domini: ['negozio.example', 'banca.example'] });
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, luoghiFn: () => registro });
  const server = createServer((req, res) => { if (req.headers['x-prova-dal-dispositivo']) req[ORIGINE_REMOTA] = { dispositivoId: 'pad' }; return app(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  const indirizzo = `http://127.0.0.1:${server.address().port}`;
  const finestra = { origin: indirizzo, 'sec-fetch-site': 'same-origin' };
  const chiedi = async (percorso, { metodo = 'GET', corpo, intestazioni = finestra } = {}) => {
    const r = await fetch(indirizzo + percorso, { method: metodo, headers: { 'content-type': 'application/json', ...intestazioni }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { stato: r.status, json: await r.json().catch(() => null), intestazioni: r.headers };
  };
  return { registro, chiedi };
}

test('LUOGHI-HTTP-01: dalla finestra si legge, si toglie uno e si svuota con la conferma', async (t) => {
  const b = await banco(t);
  const elenco = await b.chiedi('/api/v1/computer-use/remembered-places');
  assert.deepEqual([elenco.stato, elenco.json.data.voci.length, elenco.intestazioni.get('cache-control')], [200, 2, 'private, no-store']);
  assert.equal((await b.chiedi('/api/v1/computer-use/remembered-places/remove', { metodo: 'POST', corpo: { tipo: 'dominio', nome: 'banca.example' } })).json.data.tolti, 1);
  assert.deepEqual((await b.registro.perIlCiclo()).domini, ['negozio.example']);
  assert.equal((await b.chiedi('/api/v1/computer-use/remembered-places/clear', { metodo: 'POST', corpo: {} })).json.error.code, 'QUERY_INVALID');
  assert.equal((await b.chiedi('/api/v1/computer-use/remembered-places/clear', { metodo: 'POST', corpo: { conferma: true } })).json.data.tolti, 1);
});

test('LUOGHI-HTTP-02: senza la finestra, da un sito estraneo o dal telefono non si tocca niente', async (t) => {
  const b = await banco(t);
  const togli = { metodo: 'POST', corpo: { tipo: 'dominio', nome: 'negozio.example' } };
  assert.equal((await b.chiedi('/api/v1/computer-use/remembered-places/remove', { ...togli, intestazioni: {} })).stato, 403);
  assert.equal((await b.chiedi('/api/v1/computer-use/remembered-places/remove', { ...togli, intestazioni: { origin: 'https://cattivo.example', 'sec-fetch-site': 'cross-site' } })).stato, 403);
  assert.equal((await b.chiedi('/api/v1/computer-use/remembered-places/remove', { ...togli, intestazioni: { 'x-prova-dal-dispositivo': '1' } })).stato, 403);
  assert.equal((await b.chiedi('/api/v1/computer-use/remembered-places', { intestazioni: { 'x-prova-dal-dispositivo': '1' } })).stato, 403, 'il telefono passerà dal ponte');
  assert.equal((await b.registro.perIlCiclo()).domini.length, 2);
});

test('LUOGHI-HTTP-03: senza registro 503 col suo codice; metodo sbagliato 405 con Allow; una query sulla rotta è rifiutata', async (t) => {
  const vuoto = await banco(t, { conRegistro: false });
  const r = await vuoto.chiedi('/api/v1/computer-use/remembered-places');
  assert.deepEqual([r.stato, r.json.error.code], [503, 'COMPUTER_USE_UNAVAILABLE']);
  const b = await banco(t);
  const sbagliato = await b.chiedi('/api/v1/computer-use/remembered-places', { metodo: 'POST', corpo: {} });
  assert.deepEqual([sbagliato.stato, sbagliato.intestazioni.get('allow')], [405, 'GET']);
  assert.notEqual((await b.chiedi('/api/v1/computer-use/remembered-places?tutto=1')).stato, 200);
});
