/*
 * 0.2.4, blocco 6: lo scaricamento di un'immagine dal web passa dal filtro del NUCLEO di `naviga` (`leggiPaginaSicura`, l'unico col DNS
 *   controllato al momento della connessione), con un salto BINARIO: i byte restano byte, tetto in flusso, tempo totale.
 * ⛔ Server finti SOLO su 127.0.0.1, porta scelta dal sistema (0), dentro questa prova. Il salto si chiama DIRETTO col letterale
 *   127.0.0.1 (eccezione dichiarata qui: il controllo dell'indirizzo sta in `validaUrlNaviga`, provato sotto con un trasporto finto).
 *   Nessuna rete vera.
 * Come Hermes: ogni redirect ricontrollato (`tools/vision_tools.py:250-256`), byte in flusso col `content-length` solo come rifiuto
 *   anticipato (`vision_tools.py:287-308`); DNS al connect (`tools/url_safety.py:470-492`).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { scaricaImmagineWeb, unSaltoBinario, BYTE_MASSIMI_IMMAGINE_WEB } from '../src/kernel/talosHarness.mjs';

function servitore(t, gestore) {
  return new Promise((risolvi) => {
    const s = createServer(gestore);
    s.listen(0, '127.0.0.1', () => {
      t.after(() => new Promise((fine) => { s.closeAllConnections?.(); s.close(() => fine()); }));
      risolvi(`http://127.0.0.1:${s.address().port}`);
    });
  });
}
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 10, 0, 0, 0, 10, 8, 2, 0, 0, 0, 0xff, 0xfe, 0x80]);

test('FW-SALTO-01 i byte arrivano INTATTI (niente utf-8 che rompe 0xff), senza cookie, Referer né credenziali; accept immagini', async (t) => {
  let intestazioni = null;
  const base = await servitore(t, (req, res) => { intestazioni = req.headers; res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); });
  const r = await unSaltoBinario(new URL(`${base}/foto.png`));
  assert.equal(r.stato, 200);
  assert.ok(Buffer.isBuffer(r.corpo) && r.corpo.equals(PNG), 'byte identici');
  assert.equal(intestazioni.cookie, undefined);
  assert.equal(intestazioni.referer, undefined);
  assert.equal(intestazioni.authorization, undefined);
  assert.match(intestazioni.accept, /^image\//u);
});

test('FW-SALTO-02 oltre il tetto in flusso (senza content-length): rifiuto e flusso INTERROTTO, non letto tutto', async (t) => {
  let scritti = 0;
  let chiuso = false;
  const base = await servitore(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    const pezzo = Buffer.alloc(64 * 1024, 1);
    const spingi = () => {
      while (!chiuso && scritti < BYTE_MASSIMI_IMMAGINE_WEB * 4) { scritti += pezzo.length; if (!res.write(pezzo)) { res.once('drain', spingi); return; } }
      res.end();
    };
    res.on('close', () => { chiuso = true; });
    spingi();
  });
  await assert.rejects(() => unSaltoBinario(new URL(`${base}/grande.jpg`)), /TALOS_WEB_RESPONSE_TOO_LARGE/u);
  assert.ok(scritti < BYTE_MASSIMI_IMMAGINE_WEB * 4, `il server ha scritto ${scritti} byte: il flusso non si è fermato`);
});

test('FW-SALTO-03 content-length oltre il tetto: rifiuto PRIMA di leggere il corpo', async (t) => {
  const base = await servitore(t, (req, res) => { res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': String(BYTE_MASSIMI_IMMAGINE_WEB + 1) }); res.write(Buffer.alloc(10)); });
  await assert.rejects(() => unSaltoBinario(new URL(`${base}/dichiarata.jpg`)), /TALOS_WEB_RESPONSE_TOO_LARGE/u);
});

test('FW-SALTO-04 tempo TOTALE: un server che sgocciola si ferma alla scadenza, anche se ogni pezzo arriva in tempo', async (t) => {
  const base = await servitore(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'image/png' });
    const timer = setInterval(() => res.write(Buffer.alloc(1)), 50);
    res.on('close', () => clearInterval(timer));
  });
  const inizio = Date.now();
  await assert.rejects(() => unSaltoBinario(new URL(`${base}/lenta.png`), { msRimasti: 400 }), /TALOS_WEB_TIMEOUT/u);
  assert.ok(Date.now() - inizio < 3000, `${Date.now() - inizio} ms`);
});

test('FW-SALTO-05 un NOME che risolve a un indirizzo privato si rifiuta AL MOMENTO della connessione (DNS controllato dentro la connessione)', async (t) => {
  const base = await servitore(t, (req, res) => { res.writeHead(200); res.end(PNG); });
  const porta = new URL(base).port;
  await assert.rejects(() => unSaltoBinario(new URL(`http://localhost:${porta}/foto.png`)), /TALOS_WEB_ADDRESS_NOT_PUBLIC/u);
});

test('FW-OSPITE-01 l ospite del PC coi byte già scaricati: niente disco, stesso store degli allegati, stessi tetti', async () => {
  const { creaGuardaImmagine } = await import('../src/guarda-immagine-ospite.mjs');
  const caricati = [];
  const disco = () => { throw new Error('il disco non si tocca'); };
  const guarda = creaGuardaImmagine({ chatImageStore: { upload: async (x) => { caricati.push(x); return { id: 'e'.repeat(64) }; } }, statFn: disco, readFileFn: disco });
  const r = await guarda({ byte: new Uint8Array(PNG), percorsoMostrato: 'foto.png' });
  assert.equal(r.ok, true, r.esito);
  assert.equal(r.immagine.riferimento, 'e'.repeat(64));
  assert.match(caricati[0].dataUrl, /^data:image\/png;base64,/u);
  const grande = await guarda({ byte: new Uint8Array(26 * 1024 * 1024), percorsoMostrato: 'grande.png' });
  assert.equal(grande.ok, false);
  assert.match(grande.esito, /too large/u);
});

/* La catena intera con un trasporto finto (come `talosHarness.test.mjs`, «leggiPaginaSicura — la camminata sui redirect»). */
const trasporto = (mappa) => async (url) => {
  const v = mappa[url.toString()];
  if (!v) throw new Error(`salto inatteso ${url}`);
  return v;
};
const IMMAGINE = { stato: 200, corpo: PNG };

test('FW-CATENA-01 indirizzi vietati PRIMA di ogni contatto: schema, credenziali, porta, metadati del cloud, privati, IPv6 mappato', async () => {
  const mai = async () => { throw new Error('nessun contatto doveva partire'); };
  for (const [url, motivo] of [
    ['file:///C:/Windows/win.ini', /scheme/u], ['data:image/png;base64,iVBORw0KGgo=', /scheme/u], ['blob:https://x.example/1', /scheme/u],
    ['https://u:p@x.example/a.png', /credentials/u], ['https://x.example:8443/a.png', /port/u],
    ['http://169.254.169.254/latest/meta-data/', /address/u], ['http://10.0.0.1/a.png', /address/u], ['http://[::ffff:127.0.0.1]/a.png', /address/u],
    ['http://localhost/a.png', /hostname/u], ['http://stampante.local/a.png', /hostname/u],
  ]) {
    await assert.rejects(() => scaricaImmagineWeb(url, { unSaltoFn: mai }), motivo, url);
  }
});

test('FW-CATENA-02 OGNI redirect ricontrollato: pubblico → metadati, pubblico → privato, https → http, troppi salti', async () => {
  await assert.rejects(() => scaricaImmagineWeb('https://x.example/a.png', { unSaltoFn: trasporto({ 'https://x.example/a.png': { stato: 302, posizione: 'http://169.254.169.254/latest/' } }) }), /address/u);
  await assert.rejects(() => scaricaImmagineWeb('https://x.example/a.png', { unSaltoFn: trasporto({ 'https://x.example/a.png': { stato: 301, posizione: 'http://192.168.1.1/a.png' } }) }), /address/u);
  await assert.rejects(() => scaricaImmagineWeb('https://x.example/a.png', { unSaltoFn: trasporto({ 'https://x.example/a.png': { stato: 307, posizione: 'http://x.example/a.png' } }) }), /DOWNGRADE/u);
  const giro = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`https://x.example/${i}`, { stato: 302, posizione: `/${i + 1}` }]));
  await assert.rejects(() => scaricaImmagineWeb('https://x.example/0', { unSaltoFn: trasporto(giro) }), /TOO_MANY_REDIRECTS/u);
});

test('FW-CATENA-03 la fine buona: byte e indirizzo finale; uno stato diverso da 200 è un rifiuto con lo stato', async () => {
  const r = await scaricaImmagineWeb('https://x.example/a.png', { unSaltoFn: trasporto({ 'https://x.example/a.png': { stato: 302, posizione: '/b.png' }, 'https://x.example/b.png': IMMAGINE }) });
  assert.equal(r.url, 'https://x.example/b.png');
  assert.ok(Buffer.from(r.byte).equals(PNG));
  await assert.rejects(() => scaricaImmagineWeb('https://x.example/a.png', { unSaltoFn: trasporto({ 'https://x.example/a.png': { stato: 404, corpo: Buffer.alloc(0) } }) }), /HTTP 404/u);
});
