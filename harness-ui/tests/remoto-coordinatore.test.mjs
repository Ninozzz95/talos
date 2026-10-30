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
  const crea = (inPiu = {}) => creaRemoto({
    keyring, fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni: join(dir, 'remoto', 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => binding, avviaTrasporto, nomePc: 'PC di Nino', ...inPiu,
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

test('IDX-02 scelti i server di n0: il QR porta l\'id del PC e NON il relay di casa (owner 26/10); acceso resta acceso al riavvio', async (t) => {
  const b = banco(t); const r = b.crea();
  await r.imposta({ relay: { modo: 'n0' } });
  assert.deepEqual(b.avvii, [], 'scegliere il relay non accende');
  const o = await r.apriAccoppiamento();
  assert.match(o.qr, /^talos-remote:1\?pc=pc-id&t=[A-Za-z0-9_-]{22}&exp=\d+$/);
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
  assert.match(o.qr, /relay=https:\/\/relay\.casa-di-nino\.example&/);
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
  assert.match(o.qr, /relay=https:\/\/relay\.casa-di-nino\.example\/\?token=segreto-43&/);
  assert.equal(b.avvii[0].relay.url, 'https://relay.casa-di-nino.example/?token=segreto-43', 'il trasporto riceve il gettone');
  const s = await r.stato();
  assert.equal(s.relay.url, 'https://relay.casa-di-nino.example/');
  assert.doesNotMatch(JSON.stringify(s), /segreto-43/);
});

test('ACC-QR-05 (Mobile, 26/10 notte tarda) un relay scritto con spazi o lettere accentate si salva e va nel QR NORMALIZZATO: il telefono lo legge, il gettone è lo stesso', async (t) => {
  const grezzo = 'https://relay.example/?token=con spazio+più%25e&x=y=z?w';
  const b = banco(t); const r = b.crea();
  await r.imposta({ relay: { modo: 'proprio', url: grezzo } });
  const o = await r.apriAccoppiamento();
  const normale = 'https://relay.example/?token=con%20spazio+pi%C3%B9%25e&x=y=z?w';
  assert.equal(b.avvii[0].relay.url, normale, 'il trasporto riceve la forma normalizzata');
  assert.equal(new URLSearchParams(o.qr.slice(o.qr.indexOf('?') + 1)).get('relay'), normale, 'il QR porta la forma normalizzata');
  assert.doesNotMatch(normale, /[^\x21-\x7e]/u, 'niente spazi né caratteri non ASCII: `java.net.URI` del telefono la accetta');
  assert.equal(new URL(normale).searchParams.get('token'), new URL(grezzo).searchParams.get('token'), 'il gettone letto è lo stesso');
  /* AL CONTRARIO: un indirizzo già pulito resta com'era, senza la barra che `href` aggiungerebbe dopo il dominio (il telefono confronta
     i relay propri come testo: un PC già accoppiato non deve sembrare un altro) */
  const c = banco(t); const r2 = c.crea();
  await r2.imposta({ relay: { modo: 'proprio', url: 'https://relay.casa-di-nino.example' } });
  await r2.apriAccoppiamento();
  assert.equal(c.avvii[0].relay.url, 'https://relay.casa-di-nino.example');
});

/* Revisione blocco 7, C-R1 (27/10/2026): il WHATWG accetta anche `https:host/percorso`, `https:/host/percorso` e `https:\\host\percorso`.
   Lì «la persona non ha scritto `://host/`» era vero, e la barra tolta era quella del PERCORSO: l'host diventava «relay.casa.exampletalos». */
test('ACC-QR-06 (revisione blocco 7) un relay scritto senza le due barre o con le barre rovesce, e con un percorso, tiene host e percorso', async (t) => {
  for (const scritto of ['https:\\\\relay.casa.example\\talos?token=segreto-43', 'https:relay.casa.example/talos?token=segreto-43', 'https:/relay.casa.example/talos?token=segreto-43']) {
    const b = banco(t); const r = b.crea();
    await r.imposta({ relay: { modo: 'proprio', url: scritto } });
    const o = await r.apriAccoppiamento();
    const nelQr = new URLSearchParams(o.qr.slice(o.qr.indexOf('?') + 1)).get('relay');
    for (const [dove, url] of [['salvato', b.avvii[0].relay.url], ['nel QR', nelQr]]) {
      assert.equal(new URL(url).host, 'relay.casa.example', `${dove}: host cambiato in «${url}» (scritto ${scritto})`);
      assert.equal(new URL(url).pathname, '/talos', `${dove}: percorso perso in «${url}»`);
    }
  }
});

/* 26/10/2026 (CLI 0.6.15, T2; contratto `spazio` con CLI e Mobile): il programma e le capacità passano da `creaRemoto` fino al telefono,
   in `pair.code`/`pair.ok` e in `pc.info` alla riconnessione. Lungo TUTTO il filo, non solo nel servizio. */
async function accoppiaEChiedi(b, r, op) {
  await r.imposta({ relay: { modo: 'n0' }, acceso: true });
  const { gettone } = await r.apriAccoppiamento();
  const coda = []; let fine = false; const attesi = [];
  const lettore = creaLettore(); const ricevuti = [];
  const conn = (alpn) => ({
    remoteId: 'tel-id', alpn, chiusa: new Promise(() => {}), chiudi() { fine = true; while (attesi.length) attesi.shift()(null); },
    stream: { leggi: () => (coda.length ? Promise.resolve(coda.shift()) : fine ? Promise.resolve(null) : new Promise((x) => attesi.push(x))), scrivi: async (byte) => { if (fine) throw new Error('stream closed'); ricevuti.push(...lettore.aggiungi(byte)); }, finisci: async () => {} },
  });
  const manda = (m) => { const byte = codifica(m); const a = attesi.shift(); if (a) a(byte); else coda.push(byte); };
  const fattoPair = b.gestisci(conn('talos-remote-pair/1'));
  manda({ t: 'pair.hello', gettone, nome: 'Pad' });
  await finche(async () => (await r.stato()).attese.length > 0);
  const codice = ricevuti.find((m) => m.t === 'pair.code');
  await r.conferma((await r.stato()).attese[0].id);
  await finche(() => ricevuti.some((m) => m.t === 'pair.ok'));
  const ok = ricevuti.find((m) => m.t === 'pair.ok');
  await fattoPair;
  fine = false; ricevuti.length = 0;
  const fatto = b.gestisci(conn(ALPN_LAVORO));
  manda({ t: 'req', n: 'n-info-0001', op, args: {} });
  await finche(() => ricevuti.at(-1)?.n === 'n-info-0001');
  const risposta = ricevuti.at(-1);
  fine = true; while (attesi.length) attesi.shift()(null);
  await fatto;
  return { codice, ok, risposta };
}

test('IDX-10 il programma e le capacità di chi ospita arrivano al telefono: pair.code, pair.ok e pc.info alla riconnessione', async (t) => {
  const b = banco(t); const r = b.crea({ programma: 'TALOS CLI', capacita: ['spazio-worktree', 'NON VALIDA!', 'spazio-worktree'] });
  const { codice, ok, risposta } = await accoppiaEChiedi(b, r, 'pc.info');
  assert.equal(codice.pc.programma, 'TALOS CLI');
  assert.deepEqual(codice.pc.capacita, ['spazio-worktree'], 'solo nomi validi, senza doppioni');
  assert.equal(ok.pc.programma, 'TALOS CLI');
  assert.deepEqual(ok.pc.capacita, ['spazio-worktree']);
  assert.deepEqual(risposta, { v: 1, t: 'res', n: 'n-info-0001', ok: true, data: { id: 'pc-id', nome: 'PC di Nino', programma: 'TALOS CLI', capacita: ['spazio-worktree'] } });
});

test('IDX-11 AL CONTRARIO: senza argomenti tutto come prima — «TALOS desktop» e nessun campo `capacita`', async (t) => {
  const b = banco(t); const r = b.crea();
  const { codice, ok, risposta } = await accoppiaEChiedi(b, r, 'pc.info');
  assert.equal(codice.pc.programma, 'TALOS desktop');
  assert.equal(Object.hasOwn(codice.pc, 'capacita'), false);
  assert.equal(Object.hasOwn(ok.pc, 'capacita'), false);
  assert.deepEqual(risposta.data, { id: 'pc-id', nome: 'PC di Nino', programma: 'TALOS desktop' });
});

test('IDX-12 (revisione blocco 2, N4) un programma vuoto o `null` da chi ospita non arriva così al telefono: «TALOS desktop»', async (t) => {
  for (const programma of [null, '   ', 42]) {
    const b = banco(t); const r = b.crea({ programma });
    const { codice, ok, risposta } = await accoppiaEChiedi(b, r, 'pc.info');
    assert.equal(codice.pc.programma, 'TALOS desktop', String(programma));
    assert.equal(ok.pc.programma, 'TALOS desktop', String(programma));
    assert.equal(risposta.data.programma, 'TALOS desktop', String(programma));
  }
});
