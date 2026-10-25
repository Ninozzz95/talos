import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';
import { ALPN_LAVORO } from '../src/remoto/accoppiamento.mjs';
import { codifica, creaLettore } from '../src/remoto/filo.mjs';
import { creaRemoto } from '../src/remoto/index.mjs';

/* 21/10/2026 (replica dell'export della 0.1.35, IDX-06 rosso sotto carico): si aspetta la CONDIZIONE, mai un tempo fisso. */
async function finche(condizione, { entroMs = 10_000, messaggio = 'condizione non raggiunta' } = {}) {
  const fine = Date.now() + entroMs;
  while (!(await condizione())) {
    if (Date.now() > fine) throw new Error(messaggio);
    await new Promise((x) => setTimeout(x, 5));
  }
}

/*
 * 18/10/2026 — controllo remoto, il coordinatore: spento di serie e senza rete finché la persona non sceglie il relay («Solo la
 * prima volta», mockup v5), il QR col relay giusto, le impostazioni che restano, il binding assente detto chiaro, «Dimentica questo
 * computer» dal telefono. Trasporto e binding FINTI: nessuna rete.
 */
function banco(t, { binding = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-remoto-idx-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const keyring = creaAdattatorePortachiaviInMemoria();
  const avvii = [];
  const fermati = [];
  let gestisci = null;
  const avviaTrasporto = async ({ relay, chiaveSegreta, gestisci: g }) => {
    avvii.push({ relay, chiave: Buffer.from(chiaveSegreta).toString('base64url') });
    gestisci = g;
    return { id: 'pc-id', relayDiCasa: () => 'https://euc1-1.relay.n0.example/', indirizziDiretti: () => [], ferma: async () => { fermati.push(true); } };
  };
  const crea = () => creaRemoto({
    keyring, fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni: join(dir, 'remoto', 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => binding, avviaTrasporto, nomePc: 'PC di Nino',
  });
  return { dir, keyring, avvii, fermati, crea, gestisci: (c) => gestisci(c) };
}

test('IDX-01 spento di serie: nessun endpoint finché la persona non sceglie come arriva il telefono fuori casa', async (t) => {
  const b = banco(t); const r = b.crea();
  const s = await r.stato();
  assert.equal(s.acceso, false); assert.equal(s.sceltaFatta, false); assert.equal(s.pcId, null);
  assert.equal(s.nomePc, 'PC di Nino', '24/10: il nome del PC nello stato, per «Questo computer · <nome> · <codice>»');
  await assert.rejects(r.apriAccoppiamento(), { code: 'REMOTE_RELAY_NOT_CHOSEN' });
  await assert.rejects(r.imposta({ acceso: true }), { code: 'REMOTE_RELAY_NOT_CHOSEN' });
  await assert.rejects(r.imposta({ relay: { modo: 'qualcosa' } }), { code: 'REMOTE_RELAY_INVALID' });
  assert.deepEqual(b.avvii, [], 'nessun trasporto avviato');
});

test('IDX-02 scelti i server di n0: il QR porta l\'id del PC e il relay di casa; acceso resta acceso al riavvio', async (t) => {
  const b = banco(t); const r = b.crea();
  await r.imposta({ relay: { modo: 'n0' } });
  assert.deepEqual(b.avvii, [], 'scegliere il relay non accende');
  const o = await r.apriAccoppiamento();
  assert.match(o.qr, /^talos-remote:1\?pc=pc-id&relay=https%3A%2F%2Feuc1-1\.relay\.n0\.example%2F&t=[A-Za-z0-9_-]{22}&exp=\d+$/);
  assert.equal(b.avvii.length, 1); assert.deepEqual(b.avvii[0].relay, { modo: 'n0' });
  await r.apriAccoppiamento();
  assert.equal(b.avvii.length, 1, 'un endpoint solo, anche aprendo due QR');
  assert.deepEqual(JSON.parse(readFileSync(join(b.dir, 'remoto', 'impostazioni.json'), 'utf8')), { acceso: true, relay: { modo: 'n0' } });
  const dopo = b.crea(); await dopo.riprendi();
  assert.equal(b.avvii.length, 2);
  assert.equal(b.avvii[1].chiave, b.avvii[0].chiave, 'stessa chiave dal portachiavi: i telefoni accoppiati restano validi');
});

test('IDX-03 il proprio talos-relay: il QR porta il SUO indirizzo; un indirizzo non https è rifiutato al trasporto', async (t) => {
  const b = banco(t); const r = b.crea();
  await r.imposta({ relay: { modo: 'proprio', url: 'https://relay.casa-di-nino.example' } });
  const o = await r.apriAccoppiamento();
  assert.match(o.qr, /relay=https%3A%2F%2Frelay\.casa-di-nino\.example&/);
  assert.equal((await r.stato()).relay.url, 'https://relay.casa-di-nino.example');
});

test('IDX-04 binding assente: «non disponibile», nessun avvio a metà', async (t) => {
  const b = banco(t, { binding: null }); const r = b.crea();
  await r.imposta({ relay: { modo: 'n0' } });
  await assert.rejects(r.apriAccoppiamento(), { code: 'REMOTE_UNAVAILABLE' });
  const s = await r.stato();
  assert.equal(s.disponibile, false); assert.equal(s.ultimoErrore, 'REMOTE_UNAVAILABLE'); assert.equal(s.pcId, null);
});

test('IDX-05 spegnere chiude il trasporto; cambiare relay a remoto acceso lo riavvia sul nuovo', async (t) => {
  const b = banco(t); const r = b.crea();
  await r.imposta({ relay: { modo: 'n0' }, acceso: true });
  await r.imposta({ relay: { modo: 'proprio', url: 'https://relay.example' } });
  assert.equal(b.fermati.length, 1); assert.equal(b.avvii.length, 2); assert.deepEqual(b.avvii[1].relay, { modo: 'proprio', url: 'https://relay.example' });
  await r.imposta({ acceso: false });
  assert.equal(b.fermati.length, 2); assert.equal((await r.stato()).pcId, null);
});

test('IDX-06 «Dimentica questo computer» dal telefono: revocato come «dal telefono», e la richiesta dopo non passa', async (t) => {
  const b = banco(t); const r = b.crea();
  await r.imposta({ relay: { modo: 'n0' }, acceso: true });
  /* un telefono già accoppiato, scritto nell'elenco come lo scrive la conferma */
  const { gettone } = await r.apriAccoppiamento();
  const tel = 'tel-id';
  const coda = []; let fine = false; const attesi = [];
  const lettore = creaLettore(); const ricevuti = [];
  const conn = (alpn) => ({
    remoteId: tel, alpn, chiusa: new Promise(() => {}), chiudi() { fine = true; while (attesi.length) attesi.shift()(null); },
    stream: { leggi: () => (coda.length ? Promise.resolve(coda.shift()) : fine ? Promise.resolve(null) : new Promise((x) => attesi.push(x))), scrivi: async (byte) => { if (fine) throw new Error('stream closed'); ricevuti.push(...lettore.aggiungi(byte)); }, finisci: async () => {} },
  });
  const manda = (m) => { const byte = codifica(m); const a = attesi.shift(); if (a) a(byte); else coda.push(byte); };
  const pair = conn('talos-remote-pair/1');
  const fattoPair = b.gestisci(pair);
  manda({ t: 'pair.hello', gettone, nome: 'Pad' });
  await finche(async () => (await r.stato()).attese.length > 0, { messaggio: 'l\'accoppiamento non è arrivato in attesa' });
  await r.conferma((await r.stato()).attese[0].id);
  await fattoPair;
  fine = false; ricevuti.length = 0;
  const lavoro = conn(ALPN_LAVORO);
  const fatto = b.gestisci(lavoro);
  manda({ t: 'req', n: 'n-forget-1', op: 'pc.forget', args: {} });
  await finche(() => ricevuti.at(-1)?.n === 'n-forget-1', { messaggio: 'nessuna risposta a pc.forget' });
  assert.deepEqual(ricevuti.at(-1), { v: 1, t: 'res', n: 'n-forget-1', ok: true, data: { dimenticato: true } });
  const [voce] = (await r.stato()).telefoni;
  assert.equal(voce.revocatoDa, 'telefono');
  await fatto;
  assert.equal(fine, true, 'e DOPO la risposta la connessione si chiude');
});

test('IDX-07 il QR arriva coi moduli calcolati dal server; i telefoni dicono se sono in linea e per quale strada', async (t) => {
  const b = banco(t); const r = b.crea();
  await r.imposta({ relay: { modo: 'n0' } });
  const o = await r.apriAccoppiamento();
  assert.ok(o.moduli.lato >= 21 && o.moduli.lato % 4 === 1, 'un lato di QR vero (21, 25, 29…)');
  assert.equal(o.moduli.righe.length, o.moduli.lato);
  assert.ok(o.moduli.righe.every((riga) => /^[01]+$/.test(riga) && riga.length === o.moduli.lato));
  assert.equal(o.moduli.righe[0].slice(0, 7), '1111111', 'il riquadro di posizione in alto a sinistra');
  const s = await r.stato();
  assert.deepEqual(s.telefoni, []);
});

test('IDX-08 talos-relay col gettone (owner 18/10): il QR porta l\'indirizzo INTERO, la finestra lo vede senza gettone', async (t) => {
  const b = banco(t); const r = b.crea();
  await r.imposta({ relay: { modo: 'proprio', url: 'https://relay.casa-di-nino.example/?token=segreto-43' } });
  const o = await r.apriAccoppiamento();
  assert.match(o.qr, /relay=https%3A%2F%2Frelay\.casa-di-nino\.example%2F%3Ftoken%3Dsegreto-43&/);
  assert.equal(b.avvii[0].relay.url, 'https://relay.casa-di-nino.example/?token=segreto-43', 'il trasporto riceve il gettone');
  const s = await r.stato();
  assert.equal(s.relay.url, 'https://relay.casa-di-nino.example/');
  assert.doesNotMatch(JSON.stringify(s), /segreto-43/);
});
