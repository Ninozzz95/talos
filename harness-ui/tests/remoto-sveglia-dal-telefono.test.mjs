import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import { ALPN_LAVORO } from '../src/remoto/accoppiamento.mjs';
import { svegliaValida } from '../src/remoto/dispositivi.mjs';
import { codifica, creaLettore } from '../src/remoto/filo.mjs';
import { creaRemoto } from '../src/remoto/index.mjs';

/*
 * R-M5 (Mobile, 21/10/2026) — la sveglia del telefono dopo l'accoppiamento. L'iscrizione Web Push arriva dopo `pair.ok` (il
 * distributore vuole la VAPID del PC) e cambia quando il distributore ne dà una nuova: `device.wake` la aggiorna, SOLO per il telefono
 * che parla; `device.wake.test` manda subito una sveglia («Prova la notifica»). Trasporto, binding e Web Push FINTI: nessuna rete.
 * Ogni prova ha il suo verso contrario.
 */
const P256DH = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const AUTH = Buffer.alloc(16, 9).toString('base64url');
const ISCRIZIONE = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: P256DH, auth: AUTH } };

function banco(t, { invia = null, sessioni = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-remoto-sveglia-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const inviate = [];
  let gestisci = null;
  const remoto = creaRemoto({
    keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'impostazioni.json'), fileTelefoni: join(dir, 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: (id) => sessioni.includes(id), elenca: () => [] }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => ({}), nomePc: 'PC di Nino',
    avviaTrasporto: async ({ gestisci: g }) => { gestisci = g; return { id: 'pc-id', relayDiCasa: () => 'https://relay.example/', indirizziDiretti: () => [], ferma: async () => {} }; },
    inviaWebPush: async (iscrizione, ...resto) => { inviate.push(iscrizione.endpoint); return invia ? invia(iscrizione, ...resto) : { statusCode: 201 }; },
  });
  return { remoto, inviate, gestisci: (c) => gestisci(c) };
}

/** Un telefono accoppiato davvero (saluto + «Collega» sul PC), poi la sua connessione di lavoro: `chiedi(op, args)` → la risposta. */
async function telefono(b, id, { sveglia } = {}) {
  const coda = []; let fine = false; const attesi = []; const lettore = creaLettore(); const ricevuti = [];
  const conn = (alpn) => ({
    remoteId: id, alpn, chiusa: new Promise(() => {}), chiudi() { fine = true; while (attesi.length) attesi.shift()(null); },
    stream: { leggi: () => (coda.length ? Promise.resolve(coda.shift()) : fine ? Promise.resolve(null) : new Promise((x) => attesi.push(x))),
      scrivi: async (byte) => { if (!fine) ricevuti.push(...lettore.aggiungi(byte)); }, finisci: async () => {} },
  });
  const manda = (m) => { const byte = codifica(m); const a = attesi.shift(); if (a) a(byte); else coda.push(byte); };
  const { gettone } = await b.remoto.apriAccoppiamento();
  const fattoPair = b.gestisci(conn('talos-remote-pair/1'));
  manda({ t: 'pair.hello', gettone, nome: id, ...(sveglia ? { sveglia } : {}) });
  await new Promise((x) => setTimeout(x, 20));
  await b.remoto.conferma((await b.remoto.stato()).attese.at(-1).id);
  manda({ t: 'bye' }); fine = true; while (attesi.length) attesi.shift()(null);
  await fattoPair.catch(() => {});
  fine = false; ricevuti.length = 0;
  b.gestisci(conn(ALPN_LAVORO));
  let n = 0;
  return {
    async chiedi(op, args) {
      n += 1; const numero = `n-${id}-${n}`;
      manda({ t: 'req', n: numero, op, args });
      for (let i = 0; i < 200 && !ricevuti.some((m) => m.n === numero); i += 1) await new Promise((x) => setTimeout(x, 5));
      return ricevuti.find((m) => m.n === numero);
    },
  };
}

test('WAKE-01 un\'iscrizione vale solo se è una sveglia vera: https, p256dh di 65 byte con 0x04, auth di 16 byte', () => {
  assert.deepEqual(svegliaValida(ISCRIZIONE), ISCRIZIONE);
  const con = (cambi) => ({ ...ISCRIZIONE, ...cambi, keys: { ...ISCRIZIONE.keys, ...(cambi.keys ?? {}) } });
  for (const [perche, iscrizione] of [
    ['http', con({ endpoint: 'http://fcm.googleapis.com/x' })],
    ['un indirizzo del PC', con({ endpoint: 'file:///C:/x' })],
    ['credenziali nell\'indirizzo', con({ endpoint: 'https://u:p@push.example/x' })],
    ['non un URL', con({ endpoint: 'push.example/x' })],
    ['troppo lungo', con({ endpoint: `https://push.example/${'a'.repeat(2100)}` })],
    ['p256dh di 64 byte', con({ keys: { p256dh: Buffer.alloc(64, 4).toString('base64url') } })],
    ['p256dh compresso (0x03)', con({ keys: { p256dh: Buffer.concat([Buffer.from([3]), Buffer.alloc(64, 7)]).toString('base64url') } })],
    ['auth di 15 byte', con({ keys: { auth: Buffer.alloc(15, 9).toString('base64url') } })],
    ['caratteri non base64url', con({ keys: { auth: `${AUTH.slice(0, -1)}+` } })],
    ['chiavi mancanti', { endpoint: ISCRIZIONE.endpoint }],
  ]) assert.equal(svegliaValida(iscrizione), null, perche);
});

test('WAKE-02 device.wake: il telefono aggiorna la SUA iscrizione, mai quella di un altro; null = non svegliarmi più', async (t) => {
  const b = banco(t);
  await b.remoto.imposta({ relay: { modo: 'n0' }, acceso: true });
  const pad = await telefono(b, 'tel-pad');
  const altro = await telefono(b, 'tel-altro');
  const sveglie = async () => Object.fromEntries((await b.remoto.stato()).telefoni.map((v) => [v.nome, v.sveglia]));
  assert.deepEqual(await sveglie(), { 'tel-pad': false, 'tel-altro': false }, 'premessa: accoppiati senza iscrizione');
  const r = await pad.chiedi('device.wake', { sveglia: ISCRIZIONE, telefono: 'tel-altro', id: 'tel-altro' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data, { sveglia: true });
  assert.deepEqual(await sveglie(), { 'tel-pad': true, 'tel-altro': false }, '⛔ l\'id negli argomenti non conta: vale il canale');
  // un'iscrizione che non vale si rifiuta, con lo stato 400, e quella di prima resta
  const rotta = await pad.chiedi('device.wake', { sveglia: { ...ISCRIZIONE, endpoint: 'http://x/y' } });
  assert.equal(rotta.ok, false); assert.equal(rotta.code, 'BAD_MESSAGE'); assert.equal(rotta.stato, 400);
  assert.equal((await sveglie())['tel-pad'], true);
  // AL CONTRARIO: null la toglie
  assert.deepEqual((await pad.chiedi('device.wake', { sveglia: null })).data, { sveglia: false });
  assert.deepEqual(await sveglie(), { 'tel-pad': false, 'tel-altro': false });
  void altro;
});

test('WAKE-03 device.wake.test: una sveglia adesso a QUEL telefono, sotto il tetto di una ogni 10 s; senza iscrizione lo dice', async (t) => {
  const b = banco(t);
  await b.remoto.imposta({ relay: { modo: 'n0' }, acceso: true });
  const pad = await telefono(b, 'tel-pad');
  assert.deepEqual((await pad.chiedi('device.wake.test', {})).data, { esito: 'senza-iscrizione' });
  assert.deepEqual(b.inviate, []);
  await pad.chiedi('device.wake', { sveglia: ISCRIZIONE });
  assert.deepEqual((await pad.chiedi('device.wake.test', {})).data, { esito: 'inviata' });
  assert.deepEqual(b.inviate, [ISCRIZIONE.endpoint]);
  const subito = (await pad.chiedi('device.wake.test', {})).data;
  assert.equal(subito.esito, 'troppo-presto');
  assert.ok(subito.attendiMs > 0 && subito.attendiMs <= 10_000, JSON.stringify(subito));
  assert.equal(b.inviate.length, 1, 'il tetto vale anche per la prova');
});

test('WAKE-04 anche il saluto dell’accoppiamento passa dalla stessa regola: un’iscrizione http non si salva', async (t) => {
  const b = banco(t);
  await b.remoto.imposta({ relay: { modo: 'n0' }, acceso: true });
  await telefono(b, 'tel-http', { sveglia: { ...ISCRIZIONE, endpoint: 'http://push.example/x' } });
  await telefono(b, 'tel-buono', { sveglia: ISCRIZIONE });
  const sveglie = Object.fromEntries((await b.remoto.stato()).telefoni.map((v) => [v.nome, v.sveglia]));
  assert.deepEqual(sveglie, { 'tel-http': false, 'tel-buono': true });
});

test('WAKE-05 un endpoint che punta al PC o ai metadati di un cloud non è mai una sveglia; le reti private sì', () => {
  const con = (endpoint) => ({ ...ISCRIZIONE, endpoint });
  for (const endpoint of ['https://localhost/x', 'https://api.localhost/x', 'https://127.0.0.1:4174/x', 'https://2130706433/x', 'https://0x7f.1/x',
    'https://[::1]/x', 'https://[::ffff:127.0.0.1]/x', 'https://169.254.169.254/latest', 'https://metadata.google.internal/x', 'https://0.0.0.0/x',
    'https://[fe80::1]/x', 'https://100.100.100.200/x', 'https://[fd00:ec2::254]/x', 'https://224.0.0.1/x']) {
    assert.equal(svegliaValida(con(endpoint)), null, endpoint);
  }
  // AL CONTRARIO: un push service e un ntfy di casa in https passano
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/x', 'https://192.168.1.10/up/x', 'https://ntfy.casa.example/up']) {
    assert.ok(svegliaValida(con(endpoint)), endpoint);
  }
});

test('WAKE-06 il tetto della prova è prenotato prima dell’invio: con l’invio che fallisce e con tre prove in parallelo parte UNA sveglia', async (t) => {
  const fallisce = banco(t, { invia: async () => { throw Object.assign(new Error('boom'), { statusCode: 500 }); } });
  await fallisce.remoto.imposta({ relay: { modo: 'n0' }, acceso: true });
  const pad = await telefono(fallisce, 'tel-pad');
  await pad.chiedi('device.wake', { sveglia: ISCRIZIONE });
  const esiti = [];
  for (let i = 0; i < 5; i += 1) esiti.push((await pad.chiedi('device.wake.test', {})).data.esito);
  assert.deepEqual(esiti, ['fallita', 'troppo-presto', 'troppo-presto', 'troppo-presto', 'troppo-presto']);
  assert.equal(fallisce.inviate.length, 1, 'un POST solo');
  const lento = banco(t, { invia: async () => { await new Promise((x) => setTimeout(x, 150)); return { statusCode: 201 }; } });
  await lento.remoto.imposta({ relay: { modo: 'n0' }, acceso: true });
  const tab = await telefono(lento, 'tel-tab');
  await tab.chiedi('device.wake', { sveglia: ISCRIZIONE });
  const insieme = await Promise.all([tab.chiedi('device.wake.test', {}), tab.chiedi('device.wake.test', {}), tab.chiedi('device.wake.test', {})]);
  assert.deepEqual(insieme.map((r) => r.data.esito).sort(), ['inviata', 'troppo-presto', 'troppo-presto']);
  assert.equal(lento.inviate.length, 1, 'in parallelo, un POST solo');
});

test('WAKE-07 AL CONTRARIO: una prova senza iscrizione non occupa il posto, quella dopo la nuova iscrizione parte subito', async (t) => {
  const b = banco(t);
  await b.remoto.imposta({ relay: { modo: 'n0' }, acceso: true });
  const pad = await telefono(b, 'tel-pad');
  assert.equal((await pad.chiedi('device.wake.test', {})).data.esito, 'senza-iscrizione');
  await pad.chiedi('device.wake', { sveglia: ISCRIZIONE });
  assert.equal((await pad.chiedi('device.wake.test', {})).data.esito, 'inviata');
});

test('WAKE-SEEN-01 (Mobile, 21/10) device.seen: la carta di una sessione VERA è sullo schermo; id sbagliato o sessione sconosciuta rifiutati', async (t) => {
  const b = banco(t, { sessioni: ['875beafa-4e78-46cc-b96e-7dcae3da3898'] });
  await b.remoto.imposta({ relay: { modo: 'n0' }, acceso: true });
  const pad = await telefono(b, 'tel-pad');
  const ok = await pad.chiedi('device.seen', { sessionId: '875beafa-4e78-46cc-b96e-7dcae3da3898' });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.data, { seen: true });
  assert.deepEqual((await pad.chiedi('device.seen', { sessionId: '875beafa-4e78-46cc-b96e-7dcae3da3898', requestId: 'r-1' })).data, { seen: true }, 'idempotente; requestId ignorato');
  const ignota = await pad.chiedi('device.seen', { sessionId: 'non-esiste' });
  assert.equal(ignota.ok, false); assert.equal(ignota.code, 'NOT_FOUND'); assert.equal(ignota.stato, 404);
  for (const sessionId of ['..', '../x', '', 5, null]) {
    const r = await pad.chiedi('device.seen', { sessionId });
    assert.equal(r.code, 'BAD_MESSAGE', String(sessionId)); assert.equal(r.stato, 400);
  }
});
