import assert from 'node:assert/strict';
import { createECDH, createHash } from 'node:crypto';
import test from 'node:test';
import webpush from 'web-push';
import { GIRO_LUNGO_MS, GRAZIA_COLLEGATO_MS, SVEGLIE_MINIME_MS, creaSveglia } from '../src/remoto/sveglia.mjs';

/*
 * 18/10/2026 — controllo remoto, la SVEGLIA (contratto §E, §10): solo per ciò che serve alla persona, solo ai telefoni non
 * collegati, al più una ogni 10 s, carico opaco; un'iscrizione rifiutata per sempre si dimentica. L'invio è finto (nessuna rete);
 * una prova costruisce la richiesta VERA con web-push senza mandarla, per vedere che il carico è cifrato e firmato col PC.
 */
const ORA = Date.parse('2026-10-18T12:00:00Z');
const orologio = () => { let t = ORA; return { clock: () => t, avanza: (ms) => { t += ms; } }; };
/* la privata riempita a 32 byte come nel prodotto (`identita.mjs:35`, IDX-03): `getPrivateKey()` toglie gli zeri in testa, e una
   volta su ~256 la prova SVE-06 cadeva con «Vapid private key should be 32 bytes long» (misurato il 21/10: 1 su 40) */
const vapid = (() => { const e = createECDH('prime256v1'); e.generateKeys(); const k = e.getPrivateKey(); return { publicKey: e.getPublicKey().toString('base64url'), privateKey: Buffer.concat([Buffer.alloc(32 - k.length), k]).toString('base64url') }; })();

function banco({ telefoni = [{ id: 't1', sveglia: true, revocatoAlle: null }], vivi = [] } = {}) {
  const o = orologio();
  let sessioni = [];
  const inviate = [];
  const dimenticate = [];
  let risposta = async () => ({ statusCode: 201 });
  const iscrizione = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } };
  const s = creaSveglia({
    elenca: () => sessioni, inLinea: () => vivi, vapid, clock: o.clock,
    dispositivi: { elenca: async () => telefoni, iscrizione: async () => iscrizione, aggiornaSveglia: async (id, v) => { dimenticate.push([id, v]); } },
    invia: async (isc, carico, opzioni) => { inviate.push({ isc, carico: JSON.parse(carico), opzioni }); return risposta(); },
  });
  return { s, o, inviate, dimenticate, set: (x) => { sessioni = x; }, rispondi: (f) => { risposta = f; } };
}
const sessione = (extra) => ({ sessionId: 's1', conclusa: false, avviataAlle: new Date(ORA).toISOString(), ...extra });

test('SVE-01 il primo giro fa da base: ciò che aspettava già non sveglia; una carta NUOVA sì, con un carico opaco', async () => {
  const b = banco();
  b.set([sessione({ inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 0);
  b.set([sessione({ inAttesaApprovazione: true }), sessione({ sessionId: 'id-sessione-che-non-deve-uscire', inAttesaDomanda: true })]);
  assert.equal(await b.s.giro(), 1);
  assert.deepEqual(Object.keys(b.inviate[0].carico).sort(), ['v', 'w']);
  assert.equal(b.inviate[0].carico.v, 1);
  assert.equal(b.inviate[0].opzioni.urgency, 'high');
  assert.equal(b.inviate[0].opzioni.vapidDetails.publicKey, vapid.publicKey);
  /* 22/10/2026: un id INCONFONDIBILE, cercato in tutto l'invio (carico, iscrizione e opzioni: TTL, urgency, intestazioni escono dal
     PC anche loro) — prima si cercava «s2», e il 2,9% delle chiavi VAPID casuali lo contiene (misurato su 4.000): la prova cadeva a caso */
  assert.ok(!JSON.stringify(b.inviate[0]).includes('id-sessione-che-non-deve-uscire'), 'nessun id di sessione in ciò che parte');
});

test('SVE-02 la fine di un giro LUNGO sveglia, quella di uno breve no', async () => {
  const b = banco();
  b.set([sessione({}), sessione({ sessionId: 'breve', avviataAlle: new Date(ORA).toISOString() })]);
  await b.s.giro();
  b.o.avanza(GIRO_LUNGO_MS + 1);
  b.set([sessione({ conclusa: true }), sessione({ sessionId: 'breve', conclusa: false })]);
  assert.equal(await b.s.giro(), 1);
  const c = banco();
  c.set([sessione({})]);
  await c.s.giro();
  c.o.avanza(30_000);
  c.set([sessione({ conclusa: true })]);
  assert.equal(await c.s.giro(), 0, 'un giro di 30 s non sveglia nessuno');
});

test('SVE-03 un telefono collegato non si sveglia SUBITO (ha la grazia per confermare); uno senza iscrizione o revocato mai', async () => {
  const b = banco({ telefoni: [{ id: 'vivo', sveglia: true }, { id: 'senza', sveglia: false }, { id: 'rev', sveglia: true, revocatoAlle: 1 }, { id: 'fuori', sveglia: true }], vivi: ['vivo'] });
  b.set([sessione({})]);
  await b.s.giro();
  b.set([sessione({ inAttesaPiano: true })]);
  assert.equal(await b.s.giro(), 1);
});

test('SVE-04 al più una ogni 10 s: cose ravvicinate diventano UNA sveglia, la seconda parte dopo il tetto', async () => {
  const b = banco();
  b.set([sessione({})]);
  await b.s.giro();
  b.set([sessione({ inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 1);
  b.o.avanza(3_000);
  b.set([sessione({ inAttesaApprovazione: true }), sessione({ sessionId: 's2', inAttesaDomanda: true })]);
  assert.equal(await b.s.giro(), 0, 'dentro i 10 s: rimandata');
  b.o.avanza(SVEGLIE_MINIME_MS);
  assert.equal(await b.s.giro(), 1, 'passato il tetto: parte, una sola');
  assert.equal(await b.s.giro(), 0);
});

test('SVE-05 un’iscrizione rifiutata per sempre (410) si dimentica; un errore passeggero no', async () => {
  const b = banco();
  b.set([sessione({})]); await b.s.giro();
  b.rispondi(async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }); });
  b.set([sessione({ inAttesaApprovazione: true })]); await b.s.giro();
  assert.deepEqual(b.dimenticate, [['t1', null]]);
  const c = banco();
  c.set([sessione({})]); await c.s.giro();
  c.rispondi(async () => { throw Object.assign(new Error('busy'), { statusCode: 503 }); });
  c.set([sessione({ inAttesaApprovazione: true })]); await c.s.giro();
  assert.deepEqual(c.dimenticate, []);
});

test('SVE-06 la richiesta VERA di web-push (costruita, non mandata): cifrata aes128gcm, firmata con la VAPID del PC, Urgency high', () => {
  const tel = createECDH('prime256v1'); tel.generateKeys();
  const iscr = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: tel.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 3).toString('base64url') } };
  const carico = JSON.stringify({ v: 1, w: 'opaco' });
  const req = webpush.generateRequestDetails(iscr, carico, { TTL: 3600, urgency: 'high', contentEncoding: 'aes128gcm', vapidDetails: { subject: 'mailto:talos@localhost.invalid', publicKey: vapid.publicKey, privateKey: vapid.privateKey } });
  assert.equal(req.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(req.headers.Urgency, 'high');
  assert.match(req.headers.Authorization, new RegExp(`^vapid t=.+, k=${vapid.publicKey}$`));
  assert.ok(!Buffer.from(req.body).includes(Buffer.from('opaco')), 'il carico viaggia cifrato');
  assert.notEqual(createHash('sha256').update(req.body).digest('hex'), createHash('sha256').update(carico).digest('hex'));
});

/* Owner, 21/10/2026 (dal Mobile): richieste ad alta importanza; giro lungo finito e giro fallito più in basso; niente dalle figlie. */
test('SVE-07 un giro FALLITO sveglia anche se corto, con urgenza high (owner 21/10 sera: anche in Doze); fermato dalla persona o in pausa no', async () => {
  const b = banco();
  b.set([sessione({}), sessione({ sessionId: 'ferma' }), sessione({ sessionId: 'pausa' })]);
  await b.s.giro();
  b.o.avanza(20_000);
  b.set([sessione({ conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'errore' }),
    sessione({ sessionId: 'ferma', conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'fermata' }),
    sessione({ sessionId: 'pausa', conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'in-pausa' })]);
  assert.equal(await b.s.giro(), 1, 'una sveglia: il fallito, non la fermata né la pausa');
  assert.equal(b.inviate[0].opzioni.urgency, 'high');
  // AL CONTRARIO: solo fermata e pausa, nessuna sveglia
  const c = banco();
  c.set([sessione({ sessionId: 'ferma' }), sessione({ sessionId: 'pausa' })]);
  await c.s.giro();
  c.o.avanza(20_000);
  c.set([sessione({ sessionId: 'ferma', conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'fermata' }), sessione({ sessionId: 'pausa', conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'in-pausa' })]);
  assert.equal(await c.s.giro(), 0);
});

test('SVE-08 una figlia non sveglia da sola; quando aspetta, sveglia la MADRE (inAttesaDiscendente), ad alta importanza', async () => {
  const b = banco();
  const madre = (extra) => sessione({ sessionId: 'madre', ...extra });
  const figlia = (extra) => sessione({ sessionId: 'figlia', padreId: 'madre', profonditaDelega: 1, ...extra });
  b.set([madre({}), figlia({})]);
  await b.s.giro();
  b.o.avanza(GIRO_LUNGO_MS + 1);
  b.set([madre({}), figlia({ conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'errore' })]);
  assert.equal(await b.s.giro(), 0, 'la figlia fallita non sveglia');
  b.set([madre({}), figlia({ inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 0, 'la figlia che aspetta non sveglia da sola');
  b.set([madre({ inAttesaDiscendente: true }), figlia({ inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 1, 'la madre che aspetta per lei sì');
  assert.equal(b.inviate[0].opzioni.urgency, 'high');
});

test('SVE-09 urgenza: anche la fine di un giro lungo è high (owner 21/10 sera, «Subito, ma discrete»: il «discreto» è il canale sul telefono); una richiesta in coda col tetto resta high', async () => {
  const b = banco();
  b.set([sessione({}), sessione({ sessionId: 's2' })]);
  await b.s.giro();
  b.o.avanza(GIRO_LUNGO_MS + 1);
  b.set([sessione({ conclusa: true }), sessione({ sessionId: 's2' })]);
  assert.equal(await b.s.giro(), 1);
  assert.equal(b.inviate[0].opzioni.urgency, 'high');
  // dentro il tetto: una richiesta nuova si mette in coda; quando parte è high
  b.o.avanza(1_000);
  b.set([sessione({ conclusa: true }), sessione({ sessionId: 's2', inAttesaDomanda: true })]);
  assert.equal(await b.s.giro(), 0, 'tetto');
  b.o.avanza(SVEGLIE_MINIME_MS);
  b.set([sessione({ conclusa: true }), sessione({ sessionId: 's2', inAttesaDomanda: true })]);
  assert.equal(await b.s.giro(), 1);
  assert.equal(b.inviate[1].opzioni.urgency, 'high');
});

test('SVE-15 (revisione del Mobile, 21/10) «Prova la notifica» porta p:1 nel carico; una sveglia vera no', async () => {
  const b = banco();
  assert.equal((await b.s.svegliaOra('t1')).esito, 'inviata');
  assert.equal(b.inviate.at(-1).carico.p, 1);
  b.set([sessione({})]);
  await b.s.giro();
  b.o.avanza(SVEGLIE_MINIME_MS);
  b.set([sessione({ inAttesaDomanda: true })]);
  assert.equal(await b.s.giro(), 1);
  assert.equal('p' in b.inviate.at(-1).carico, false, JSON.stringify(b.inviate.at(-1).carico));
});

/* Revisione del 21/10 (rossa): fine del giro riconosciuta dal suo istante, durata del giro e non della sessione, passi e figlie. */
const iso = (ms) => new Date(ms).toISOString();
test('SVE-11 un giro che inizia e fallisce fra due sguardi sveglia (fineGiroAlle nuova); la stessa fine non risveglia', async () => {
  const b = banco();
  b.set([sessione({ conclusa: true, ultimoEsito: 'successo', motivoChiusura: 'fine-lavoro', inizioGiroAlle: iso(ORA - 60_000), fineGiroAlle: iso(ORA - 50_000) })]);
  await b.s.giro();
  b.o.avanza(5_000);
  const fallito = sessione({ conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'errore', inizioGiroAlle: iso(ORA + 1_000), fineGiroAlle: iso(ORA + 3_000) });
  b.set([fallito]);
  assert.equal(await b.s.giro(), 1, 'conclusa prima e dopo: lo dice la fine nuova');
  b.o.avanza(SVEGLIE_MINIME_MS + 1);
  b.set([fallito]);
  assert.equal(await b.s.giro(), 0, 'AL CONTRARIO: la stessa fine non sveglia di nuovo');
});

test('SVE-12 «giro lungo» è la durata del GIRO, non l’età della sessione', async () => {
  const b = banco();
  const vecchia = { avviataAlle: iso(ORA - 3 * 60 * 60_000) };
  b.set([sessione({ ...vecchia, conclusa: true, inizioGiroAlle: iso(ORA - 100_000), fineGiroAlle: iso(ORA - 90_000) })]);
  await b.s.giro();
  b.o.avanza(40_000);
  b.set([sessione({ ...vecchia, conclusa: true, ultimoEsito: 'successo', inizioGiroAlle: iso(ORA + 5_000), fineGiroAlle: iso(ORA + 35_000) })]);
  assert.equal(await b.s.giro(), 0, '⛔ un giro di 30 s in una sessione di 3 ore non è lungo');
  b.o.avanza(4 * 60_000);
  b.set([sessione({ ...vecchia, conclusa: true, ultimoEsito: 'successo', inizioGiroAlle: iso(ORA + 60_000), fineGiroAlle: iso(ORA + 60_000 + GIRO_LUNGO_MS + 1) })]);
  assert.equal(await b.s.giro(), 1, 'un giro di oltre 2 minuti sì');
});

test('SVE-13 un passo di Workflow: la sua attesa sveglia, la sua fine (anche fallita) no; una figlia: MCP sì, permesso no (lo dice la madre)', async () => {
  const b = banco();
  const passo = (extra) => sessione({ sessionId: 'passo', passoWorkflow: { runId: 'r', nodeId: 'n' }, ...extra });
  const figlia = (extra) => sessione({ sessionId: 'figlia', padreId: 'madre', profonditaDelega: 1, ...extra });
  b.set([passo({}), figlia({})]);
  await b.s.giro();
  b.o.avanza(20_000);
  b.set([passo({ conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'errore', inizioGiroAlle: iso(ORA + 1_000), fineGiroAlle: iso(ORA + 2_000) }), figlia({ inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 0, 'passo fallito e permesso della figlia: niente');
  b.set([passo({ conclusa: false, inAttesaApprovazione: true }), figlia({ inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 1, 'il permesso del passo sveglia');
  assert.equal(b.inviate.at(-1).opzioni.urgency, 'high');
  const c = banco();
  c.set([figlia({})]);
  await c.s.giro();
  c.set([figlia({ inAttesaRichiestaMcp: true })]);
  assert.equal(await c.s.giro(), 1, 'la richiesta MCP di una figlia non arriva alla madre: sveglia per sé');
});

/*
 * Mobile, 21/10/2026, prova dal vivo sul 4178: «collegato» non vuol dire «visto» (app uccisa con la connessione QUIC ancora in linea
 * ~30 s; app aperta su un'altra sessione; job che mette la notifica e chiude). Una novità esce dalla coda SOLO con `device.seen`.
 */
test('SEEN-01 collegato ma senza conferma (app uccisa, connessione ancora «in linea»): la sveglia parte dopo la grazia, anche collegato', async () => {
  const vivi = ['t1'];
  const b = banco({ vivi });
  b.set([sessione({})]);
  await b.s.giro();
  b.set([sessione({ inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 0, 'collegato: tempo per confermare');
  b.o.avanza(GRAZIA_COLLEGATO_MS - 1);
  assert.equal(await b.s.giro(), 0);
  b.o.avanza(1);
  assert.equal(await b.s.giro(), 1, '⛔ nessuna conferma: la sveglia non va persa');
  assert.equal(b.inviate.at(-1).opzioni.urgency, 'high');
});

test('SEEN-02 la carta confermata dal telefono non sveglia, mai', async () => {
  const vivi = ['t1'];
  const b = banco({ vivi });
  b.set([sessione({ sessionId: 'X' })]);
  await b.s.giro();
  b.set([sessione({ sessionId: 'X', inAttesaDomanda: true })]);
  await b.s.giro();
  b.o.avanza(500);
  b.s.visto('t1', 'X');
  b.o.avanza(60_000);
  assert.equal(await b.s.giro(), 0);
  vivi.length = 0;
  b.o.avanza(SVEGLIE_MINIME_MS);
  assert.equal(await b.s.giro(), 0, 'scollegato dopo: niente sveglia vecchia');
});

test('SEEN-03 la conferma arriva PRIMA che il giro scopra la novità (gli eventi sono istantanei, il giro ogni 5 s): vale', async () => {
  const vivi = ['t1'];
  const b = banco({ vivi });
  b.set([sessione({ sessionId: 'X' })]);
  await b.s.giro();
  b.o.avanza(2_000);
  b.s.visto('t1', 'X'); // la carta è già sullo schermo del telefono
  b.o.avanza(3_000);
  b.set([sessione({ sessionId: 'X', inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 0);
  b.o.avanza(GRAZIA_COLLEGATO_MS);
  assert.equal(await b.s.giro(), 0, 'confermata');
});

test('SEEN-04 una conferma VECCHIA (prima del giro precedente) non vale per una novità nuova della stessa sessione', async () => {
  const vivi = ['t1'];
  const b = banco({ vivi });
  b.set([sessione({ sessionId: 'X' })]);
  b.s.visto('t1', 'X');
  b.o.avanza(1_000);
  await b.s.giro();
  b.o.avanza(5_000);
  b.set([sessione({ sessionId: 'X', inAttesaDomanda: true })]);
  assert.equal(await b.s.giro(), 0);
  b.o.avanza(GRAZIA_COLLEGATO_MS);
  assert.equal(await b.s.giro(), 1, '⛔ quella conferma era di prima');
});

test('SEEN-05 (revisione del 21/10, S4) device.seen vale per la sessione ESATTA: confermare la madre non toglie l’MCP della figlia (la madre non lo disegna); il permesso della figlia è una novità della madre', async () => {
  const vivi = ['t1'];
  const figlia = (extra) => sessione({ sessionId: 'figlia', padreId: 'madre', profonditaDelega: 1, ...extra });
  const b = banco({ vivi });
  b.set([sessione({ sessionId: 'madre' }), figlia({})]);
  await b.s.giro();
  b.set([sessione({ sessionId: 'madre' }), figlia({ inAttesaRichiestaMcp: true })]);
  await b.s.giro();
  b.s.visto('t1', 'madre');
  b.o.avanza(GRAZIA_COLLEGATO_MS);
  assert.equal(await b.s.giro(), 1, '⛔ l’MCP della figlia non era a schermo nella madre');
  // AL CONTRARIO: confermare la figlia sì
  const c = banco({ vivi });
  c.set([sessione({ sessionId: 'madre' }), figlia({})]);
  await c.s.giro();
  c.set([sessione({ sessionId: 'madre' }), figlia({ inAttesaRichiestaMcp: true })]);
  await c.s.giro();
  c.s.visto('t1', 'figlia');
  c.o.avanza(GRAZIA_COLLEGATO_MS);
  assert.equal(await c.s.giro(), 0);
  // il permesso di una figlia è una novità della MADRE (inAttesaDiscendente, C2-R7): confermare la madre basta
  const d = banco({ vivi });
  d.set([sessione({ sessionId: 'madre' }), figlia({})]);
  await d.s.giro();
  d.set([sessione({ sessionId: 'madre', inAttesaDiscendente: true }), figlia({ inAttesaApprovazione: true })]);
  await d.s.giro();
  d.s.visto('t1', 'madre');
  d.o.avanza(GRAZIA_COLLEGATO_MS);
  assert.equal(await d.s.giro(), 0);
});

test('SEEN-06 due novità, una sola confermata: l’altra fa partire la sveglia (il caso X/Y del Mobile)', async () => {
  const vivi = ['t1'];
  const b = banco({ vivi });
  b.set([sessione({ sessionId: 'X' }), sessione({ sessionId: 'Y' })]);
  await b.s.giro();
  b.set([sessione({ sessionId: 'X', inAttesaDomanda: true }), sessione({ sessionId: 'Y', inAttesaApprovazione: true })]);
  await b.s.giro();
  b.s.visto('t1', 'X');
  b.o.avanza(GRAZIA_COLLEGATO_MS);
  assert.equal(await b.s.giro(), 1, 'Y non era a schermo');
});

test('SEEN-07 dopo una conferma, una novità NUOVA della stessa sessione va confermata di nuovo', async () => {
  const vivi = ['t1'];
  const b = banco({ vivi });
  b.set([sessione({ sessionId: 'X' })]);
  await b.s.giro();
  b.set([sessione({ sessionId: 'X', inAttesaDomanda: true })]);
  await b.s.giro();
  b.s.visto('t1', 'X');
  b.o.avanza(6_000);
  b.set([sessione({ sessionId: 'X' })]);
  await b.s.giro();
  b.o.avanza(5_000);
  b.set([sessione({ sessionId: 'X', inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 0);
  b.o.avanza(GRAZIA_COLLEGATO_MS);
  assert.equal(await b.s.giro(), 1, '⛔ la seconda carta non è stata confermata');
});

test('SEEN-08 il job (si collega, mette la notifica, chiude) non conferma: una richiesta nata mentre era collegato sveglia di nuovo', async () => {
  const vivi = [];
  const b = banco({ vivi });
  b.set([sessione({}), sessione({ sessionId: 's2' })]);
  await b.s.giro();
  b.set([sessione({ inAttesaApprovazione: true }), sessione({ sessionId: 's2' })]);
  assert.equal(await b.s.giro(), 1, 'la prima sveglia');
  vivi.push('t1');
  b.o.avanza(2_000);
  b.set([sessione({ inAttesaApprovazione: true }), sessione({ sessionId: 's2', inAttesaDomanda: true })]);
  assert.equal(await b.s.giro(), 0);
  b.o.avanza(3_000); vivi.length = 0;
  assert.equal(await b.s.giro(), 0, 'il tetto dei 10 s vale ancora');
  b.o.avanza(SVEGLIE_MINIME_MS);
  assert.equal(await b.s.giro(), 1, '⛔ la seconda richiesta non va persa');
});

test('SVE-OFF-01 (D-3, 25/10; B-3 del blocco 7) un file offerto a un dispositivo spento lo sveglia una volta: urgenza ALTA come tutte, carico con solo f:1', async () => {
  const b = banco();
  b.set([sessione({})]);
  await b.s.giro();
  b.s.offerta('t1', 'id-sessione-che-non-deve-uscire');
  assert.equal(await b.s.giro(), 1);
  assert.deepEqual(Object.keys(b.inviate[0].carico).sort(), ['f', 'v', 'w']);
  assert.equal(b.inviate[0].carico.f, 1);
  assert.equal(b.inviate[0].opzioni.urgency, 'high', 'decisione owner 21/10 sera: tutte high');
  assert.ok(!JSON.stringify(b.inviate[0]).includes('id-sessione-che-non-deve-uscire'), 'nessun id di sessione in ciò che parte');
  /* una sola: il giro dopo non la ripete */
  b.o.avanza(SVEGLIE_MINIME_MS + 1);
  assert.equal(await b.s.giro(), 0);
});

test('SVE-OFF-02 (D-3) l\'offerta rispetta il tetto dei 10 s e la conferma con device.seen; una richiesta della persona resta «high»', async () => {
  const b = banco();
  b.set([sessione({})]);
  await b.s.giro();
  b.s.offerta('t1', 's1');
  b.s.visto('t1', 's1');
  assert.equal(await b.s.giro(), 0, 'già vista: non parte');
  b.s.offerta('t1', 's2');
  b.set([sessione({}), sessione({ sessionId: 's3', inAttesaApprovazione: true })]);
  assert.equal(await b.s.giro(), 1);
  assert.equal(b.inviate[0].opzioni.urgency, 'high', 'una carta in attesa vince sulla normale');
  assert.equal(b.inviate[0].carico.f, 1);
});

test('SVE-OFF-03 (D-3; B-2 del blocco 7) il cavo in remoto/index: ogni offerta NUOVA va in coda, anche a un dispositivo collegato', async () => {
  const { svegliaPerOfferta } = await import('../src/remoto/index.mjs');
  const chiamate = [];
  const svegliatore = { offerta: (id, s) => chiamate.push([id, s]) };
  assert.equal(svegliaPerOfferta({ stato: 'inviato', dispositivoId: 'tA', sessionId: 's1' }, { svegliatore }), true);
  assert.equal(svegliaPerOfferta({ stato: 'inviato', dispositivoId: 'tB', sessionId: 's1' }, { svegliatore }), true, 'collegato: in coda lo stesso');
  assert.equal(svegliaPerOfferta({ stato: 'in-scaricamento', dispositivoId: 'tA', sessionId: 's1' }, { svegliatore }), false, 'non nuova');
  assert.equal(svegliaPerOfferta({ stato: 'inviato', dispositivoId: 'tA', sessionId: 's1' }, { svegliatore: null }), false, 'remoto spento');
  assert.deepEqual(chiamate, [['tA', 's1'], ['tB', 's1']]);
});

test('SVE-OFF-04 (B-2) un dispositivo COLLEGATO ma fuori da quella conversazione: dopo la grazia la sveglia parte; con device.seen no', async () => {
  const b = banco({ vivi: ['t1'] });
  b.set([sessione({})]);
  await b.s.giro();
  b.s.offerta('t1', 's9');
  assert.equal(await b.s.giro(), 0, 'collegato: prima la grazia');
  b.o.avanza(GRAZIA_COLLEGATO_MS + 1);
  assert.equal(await b.s.giro(), 1, 'nessuna conferma: la sveglia parte');
  const c = banco({ vivi: ['t1'] });
  c.set([sessione({})]);
  await c.s.giro();
  c.s.offerta('t1', 's9');
  c.o.avanza(1000);
  c.s.visto('t1', 's9');
  c.o.avanza(GRAZIA_COLLEGATO_MS + 1);
  assert.equal(await c.s.giro(), 0, 'vista: niente sveglia');
});

test('SVE-OFF-05 (B-4) una device.seen arrivata PRIMA dell\'offerta non la cancella', async () => {
  const b = banco();
  b.set([sessione({})]);
  await b.s.giro();
  b.o.avanza(1000);
  b.s.visto('t1', 's1');
  b.o.avanza(2000);
  b.s.offerta('t1', 's1');
  assert.equal(await b.s.giro(), 1);
});

test('SVE-OFF-06 (revisione a blocco 8, N2) il cavo di creaRemoto passa OGNI offerta alla coda, senza filtro dei collegati', async () => {
  /* Cancello statico (il cavo è una riga dentro creaRemoto): il mutante del revisore rimetteva `inLinea` nella callback e la prova
     sul comportamento, SVE-OFF-03, restava verde perché prova `svegliaPerOfferta` da sola */
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../src/remoto/index.mjs', import.meta.url), 'utf8');
  const cavi = (sorgente.match(/^\s*file\?\.ascoltaOfferte\(.*$/gmu) ?? []).map((riga) => riga.trim());
  assert.equal(cavi.length, 1, 'un cavo solo');
  assert.equal(cavi[0], 'file?.ascoltaOfferte((o) => { svegliaPerOfferta(o, { svegliatore }); });');
});
