/*
 * Le notifiche del PC sul gestore HTTP VERO (contratto 31/10/2026): dalla finestra si legge e si segna «visto»; una scrittura senza
 * la finestra né il gettone si ferma e il registro non cambia; senza registro le rotte dicono 503, mai un guasto travestito.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpApp } from '../src/http-app.mjs';
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs';
import { ORIGINE_REMOTA } from '../src/origine-remota.mjs';

async function banco(t, { conRegistro = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'notifiche-http-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir));
  const registro = conRegistro ? creaRegistroNotifiche({ file: join(dir, 'n.jsonl'), adesso: () => Date.parse('2026-10-31T10:00:00.000Z') }) : null;
  if (registro) for (let i = 1; i <= 2; i++) await registro.scrivi({ id: `domanda:s:${i}`, fatto: 'domanda', cosa: { tipo: 'sessione', id: 's', nome: 'Una chat' }, istante: '2026-10-31T09:00:00.000Z' });
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, notificheFn: () => registro });
  // il segno che il ponte dei dispositivi mette su una richiesta arrivata dal telefono (`origine-remota.mjs`)
  const server = createServer((req, res) => { if (req.headers['x-prova-dal-dispositivo']) req[ORIGINE_REMOTA] = { dispositivoId: 'pad' }; return app(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  // un flusso SSE rimasto aperto (una prova rossa) non deve tenere appeso il processo: si chiudono anche le connessioni
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const finestra = { origin: base, 'sec-fetch-site': 'same-origin' };
  const chiedi = async (percorso, { metodo = 'GET', corpo, intestazioni = finestra } = {}) => {
    const r = await fetch(base + percorso, { method: metodo, headers: { 'content-type': 'application/json', ...intestazioni }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { stato: r.status, json: await r.json().catch(() => null), intestazioni: r.headers };
  };
  return { registro, chiedi, base, finestra };
}

test('NOTIF-HTTP-01 from the window: read with the cursor, mark seen, mark all seen up to a bound', async (t) => {
  const b = await banco(t);
  const elenco = await b.chiedi('/api/v1/notifications');
  assert.equal(elenco.stato, 200);
  assert.equal(elenco.json.data.voci.length, 2);
  assert.equal(elenco.json.data.totaleDaFare, 2);
  assert.equal(elenco.intestazioni.get('cache-control'), 'private, no-store');
  assert.deepEqual((await b.chiedi('/api/v1/notifications?dopo=1')).json.data.voci.map((v) => v.id), ['domanda:s:2']);
  assert.equal((await b.chiedi('/api/v1/notifications/seen', { metodo: 'POST', corpo: { ids: ['domanda:s:1'] } })).json.data.cambiate, 1);
  assert.equal((await b.chiedi('/api/v1/notifications/seen-all', { metodo: 'POST', corpo: { finoA: 3 } })).json.data.cambiate, 1);
  assert.equal((await b.chiedi('/api/v1/notifications/seen-all', { metodo: 'POST', corpo: {} })).json.error.code, 'QUERY_INVALID');
});

test('NOTIF-HTTP-02 a write without the window or its token stops, and the register does not change', async (t) => {
  const b = await banco(t);
  const prima = await b.registro.ultimoSeq();
  const senza = await b.chiedi('/api/v1/notifications/seen-all', { metodo: 'POST', corpo: { finoA: 99 }, intestazioni: {} });
  assert.equal(senza.stato, 403);
  assert.equal(await b.registro.ultimoSeq(), prima);
  const estraneo = await b.chiedi('/api/v1/notifications/seen', { metodo: 'POST', corpo: { ids: ['domanda:s:1'] }, intestazioni: { origin: 'https://cattivo.example', 'sec-fetch-site': 'cross-site' } });
  assert.equal(estraneo.stato, 403);
  assert.equal(await b.registro.ultimoSeq(), prima);
});

test('NOTIF-HTTP-03 without a register: 503 with its own code; a wrong method: 405 with Allow', async (t) => {
  const b = await banco(t, { conRegistro: false });
  const r = await b.chiedi('/api/v1/notifications');
  assert.equal(r.stato, 503);
  assert.equal(r.json.error.code, 'NOTIFICATIONS_UNAVAILABLE');
  const c = await banco(t);
  const m = await c.chiedi('/api/v1/notifications/seen', { metodo: 'GET' });
  assert.equal(m.stato, 405);
});

test('NOTIF-HTTP-04 AL CONTRARIO: a request from a device never reads nor marks here (the phone uses the bridge)', async (t) => {
  const b = await banco(t);
  const prima = await b.registro.ultimoSeq();
  const dalPad = { ...{ 'x-prova-dal-dispositivo': '1' } };
  const lettura = await b.chiedi('/api/v1/notifications', { intestazioni: dalPad });
  assert.equal(lettura.stato, 403);
  assert.equal(lettura.json.error.code, 'REMOTE_ORIGIN_FORBIDDEN');
  const scrittura = await b.chiedi('/api/v1/notifications/seen-all', { metodo: 'POST', corpo: { finoA: 99 }, intestazioni: dalPad });
  assert.equal(scrittura.stato, 403);
  assert.equal(await b.registro.ultimoSeq(), prima);
});

/* legge gli eventi `data:` di uno stream SSE finché `basta(eventi)` non è vero */
async function leggiEventi(risposta, basta) {
  const lettore = risposta.body.getReader();
  const decoder = new TextDecoder();
  let resto = '';
  const eventi = [];
  while (!basta(eventi)) {
    const { value, done } = await lettore.read();
    if (done) break;
    resto += decoder.decode(value, { stream: true });
    let i;
    while ((i = resto.indexOf('\n\n')) >= 0) {
      const blocco = resto.slice(0, i); resto = resto.slice(i + 2);
      const dati = blocco.split('\n').filter((r) => r.startsWith('data:')).map((r) => r.slice(5).trim()).join('\n');
      if (dati) eventi.push(JSON.parse(dati));
    }
  }
  await lettore.cancel();
  return eventi;
}

test('NOTIF-HTTP-05 the global stream opens without the remote: first the snapshot, then a new entry', { timeout: 10_000 }, async (t) => {
  const b = await banco(t);
  const risposta = await fetch(`${b.base}/api/v1/remote/events`, { headers: b.finestra });
  assert.equal(risposta.status, 200);
  const promessa = leggiEventi(risposta, (ev) => ev.length >= 2);
  await new Promise((r) => setTimeout(r, 50));
  await b.registro.scrivi({ id: 'permesso:s:9', fatto: 'approvazione', cosa: { tipo: 'sessione', id: 's', nome: 'Una chat' } });
  const [foto, nuova] = await promessa;
  assert.deepEqual(foto, { type: 'talos.notifica', voce: null, ultimoSeq: 2, totaleDaFare: 2 });
  assert.equal(nuova.type, 'talos.notifica');
  assert.equal(nuova.voce.id, 'permesso:s:9');
  assert.equal(nuova.ultimoSeq, 3);
  assert.equal(nuova.totaleDaFare, 3);
  assert.ok((await b.registro.elenco()).voci.some((v) => v.id === 'permesso:s:9'), 'whoever rereads after the notice finds the entry');
});

test('NOTIF-HTTP-06 AL CONTRARIO: no remote and no register keeps the old 503; a device never opens the stream', async (t) => {
  const vuoto = await banco(t, { conRegistro: false });
  assert.equal((await fetch(`${vuoto.base}/api/v1/remote/events`, { headers: vuoto.finestra })).status, 503);
  const b = await banco(t);
  const dalPad = await fetch(`${b.base}/api/v1/remote/events`, { headers: { 'x-prova-dal-dispositivo': '1' } });
  assert.equal(dalPad.status, 403);
});
