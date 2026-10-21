import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { ALPN_ACCOPPIAMENTO, ALPN_LAVORO, codiceDiVerifica, creaAccoppiamento } from '../src/remoto/accoppiamento.mjs';
import { creaElencoDispositivi } from '../src/remoto/dispositivi.mjs';
import { codifica, creaLettore } from '../src/remoto/filo.mjs';
import { creaServizioRemoto } from '../src/remoto/servizio.mjs';

/*
 * 18/10/2026 — controllo remoto, il servizio del PC sopra un trasporto FINTO in memoria (nessuna rete): accoppiamento sui suoi tre
 * esiti, ammissione per elenco PRIMA di leggere, richieste con idempotenza, revoca che chiude subito. Ogni prova ha il suo verso
 * contrario.
 */
const PC = 'pc-endpoint-id';
const TEL = 'telefono-endpoint-id';
const ALTRO = 'sconosciuto-endpoint-id';

/** Una coda di byte con lettura asincrona; `fine()` fa tornare null a chi legge. */
function coda() {
  const pezzi = []; const attesi = []; let finita = false;
  return {
    metti(b) { if (finita) return; const a = attesi.shift(); if (a) a(b); else pezzi.push(b); },
    fine() { finita = true; while (attesi.length) attesi.shift()(null); },
    prendi() { if (pezzi.length) return Promise.resolve(pezzi.shift()); if (finita) return Promise.resolve(null); return new Promise((r) => attesi.push(r)); },
    get finita() { return finita; },
  };
}

/** Una connessione finta: il lato PC per il servizio, il lato telefono per la prova. */
function connessione(remoteId, alpn) {
  const versoPc = coda(); const versoTel = coda();
  let chiudi; const chiusa = new Promise((r) => { chiudi = r; });
  const stato = { letture: 0, chiusaCon: null };
  const lettore = creaLettore(); const ricevuti = []; const attese = [];
  const consegna = (m) => { const a = attese.shift(); if (a) a(m); else ricevuti.push(m); };
  (async () => { for (;;) { const b = await versoTel.prendi(); if (b == null) { while (attese.length) attese.shift()(null); return; } for (const m of lettore.aggiungi(b)) consegna(m); } })();
  const pc = {
    remoteId, alpn, chiusa,
    stream: {
      leggi: () => { stato.letture += 1; return versoPc.prendi(); },
      scrivi: async (b) => { versoTel.metti(b); },
      finisci: async () => {},
    },
    chiudi(code) { if (stato.chiusaCon) return; stato.chiusaCon = code; versoPc.fine(); versoTel.fine(); chiudi(code); },
  };
  const tel = {
    manda: (m) => versoPc.metti(codifica(m)),
    finisciScrittura: () => versoPc.fine(),
    ricevi: () => (ricevuti.length ? Promise.resolve(ricevuti.shift()) : new Promise((r) => attese.push(r))),
  };
  return { pc, tel, stato, chiusa };
}

function banco(t, { operazioni = null, attesaDopoPairOkMs = 50 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-remoto-srv-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const accoppiamento = creaAccoppiamento();
  const dispositivi = creaElencoDispositivi({ file: join(dir, 'telefoni.json') });
  const eseguite = [];
  const ops = operazioni ?? {
    async esegui(op, args, ctx) {
      eseguite.push({ op, args, da: ctx.dispositivo.nome });
      if (op === 'eco') return { eco: args.testo };
      throw Object.assign(new Error('Unknown operation.'), { code: 'UNKNOWN_OPERATION' });
    },
  };
  const avvisi = [];
  // attesa dopo `pair.ok` corta: queste prove non guardano la chiusura (la guarda SRV-11)
  const servizio = creaServizioRemoto({ pcId: PC, nomePc: 'PC di Nino', vapidPubblica: 'BPUB', accoppiamento, dispositivi, operazioni: ops, avvisa: (a) => avvisi.push(a), attesaDopoPairOkMs });
  return { accoppiamento, dispositivi, servizio, eseguite, avvisi };
}

async function accoppiaTelefono(b, { nome = 'Pad di Nino', remoteId = TEL } = {}) {
  const { gettone } = b.accoppiamento.apri({ pcId: PC });
  const c = connessione(remoteId, ALPN_ACCOPPIAMENTO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'pair.hello', gettone, nome, piattaforma: 'Android · app TALOS', sveglia: { endpoint: 'https://fcm.example/x', keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url'), auth: Buffer.alloc(16, 9).toString('base64url') } } /* 21/10: la forma vera (RFC 8291), `svegliaValida` */ });
  const codice = await c.tel.ricevi();
  return { c, fatto, gettone, codice };
}

test('SRV-01 accoppiamento completo: codice uguale ai due capi, «Collega» sul PC registra PRIMA di rispondere', async (t) => {
  const b = banco(t);
  const { c, fatto, gettone, codice } = await accoppiaTelefono(b);
  /* il telefono vede chi è il PC PRIMA di confermare (mockup v5: «Computer … · Programma TALOS desktop») */
  assert.deepEqual(codice, { v: 1, t: 'pair.code', codice: codiceDiVerifica({ pcId: PC, telefonoId: TEL, gettone }), pc: { id: PC, nome: 'PC di Nino', programma: 'TALOS desktop' } });
  const [attesa] = b.accoppiamento.inAttesa();
  assert.equal(attesa.codice, codice.codice, 'il PC mostra lo stesso codice');
  assert.equal(attesa.piattaforma, 'Android · app TALOS', 'e sotto il nome la piattaforma del telefono');
  const voce = await b.servizio.conferma(attesa.id);
  const ok = await c.tel.ricevi();
  assert.equal(ok.t, 'pair.ok');
  assert.deepEqual(ok.dispositivo, { id: voce.id, nome: 'Pad di Nino' });
  assert.deepEqual(ok.pc, { id: PC, nome: 'PC di Nino', programma: 'TALOS desktop', vapid: 'BPUB' });
  await fatto;
  assert.equal((await b.dispositivi.ammesso(TEL)).id, voce.id);
  assert.equal(voce.sveglia, true, 'l\'iscrizione Web Push del saluto è registrata');
});

test('SRV-02 «Annulla» sul PC: il telefono riceve PAIR_REJECTED e NON è ammesso', async (t) => {
  const b = banco(t);
  const { c, fatto } = await accoppiaTelefono(b);
  b.servizio.rifiuta(b.accoppiamento.inAttesa()[0].id);
  assert.equal((await c.tel.ricevi()).code, 'PAIR_REJECTED');
  await fatto;
  assert.equal(c.stato.chiusaCon, 'PAIR_REJECTED');
  assert.equal(await b.dispositivi.ammesso(TEL), null);
  assert.equal(b.accoppiamento.stato().sbagliati, 1);
});

test('SRV-03 gettone sbagliato: PAIR_TOKEN_INVALID e chiusura, nessuna attesa aperta', async (t) => {
  const b = banco(t);
  b.accoppiamento.apri({ pcId: PC });
  const c = connessione(ALTRO, ALPN_ACCOPPIAMENTO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'pair.hello', gettone: Buffer.alloc(16, 9).toString('base64url') });
  assert.equal((await c.tel.ricevi()).code, 'PAIR_TOKEN_INVALID');
  await fatto;
  assert.equal(c.stato.chiusaCon, 'PAIR_TOKEN_INVALID');
  assert.deepEqual(b.accoppiamento.inAttesa(), []);
});

test('SRV-04 il telefono annulla: l\'attesa sparisce dal PC e non conta come sbagliato', async (t) => {
  const b = banco(t);
  const { c, fatto } = await accoppiaTelefono(b);
  c.tel.manda({ t: 'pair.cancel' });
  await fatto;
  assert.equal(c.stato.chiusaCon, 'PAIR_CANCELLED');
  assert.deepEqual(b.accoppiamento.inAttesa(), []);
  assert.equal(b.accoppiamento.stato().sbagliati, 0);
});

test('SRV-05 il telefono chiude la SUA scrittura dopo il saluto: non è un annullamento, la conferma arriva lo stesso', async (t) => {
  const b = banco(t);
  const { c, fatto } = await accoppiaTelefono(b);
  c.tel.finisciScrittura();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(b.accoppiamento.inAttesa().length, 1, 'l\'attesa è ancora lì');
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id);
  assert.equal((await c.tel.ricevi()).t, 'pair.ok');
  await fatto;
});

test('SRV-06 lavoro: uno sconosciuto riceve NOT_PAIRED senza che il PC legga un solo byte', async (t) => {
  const b = banco(t);
  const c = connessione(ALTRO, ALPN_LAVORO);
  c.tel.manda({ t: 'req', n: 'abcdefgh', op: 'eco', args: { testo: 'ciao' } });
  await b.servizio.gestisci(c.pc);
  assert.equal((await c.tel.ricevi()).code, 'NOT_PAIRED');
  assert.equal(c.stato.letture, 0, 'nessuna lettura prima dell\'ammissione');
  assert.equal(c.stato.chiusaCon, 'NOT_PAIRED');
  assert.deepEqual(b.eseguite, []);
});

test('SRV-07 richieste: risposta col suo n, stesso n due volte = una sola esecuzione, ping/pong, errore dell\'operazione tipizzato', async (t) => {
  const b = banco(t);
  const acc = await accoppiaTelefono(b);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'req', n: 'n-000001', op: 'eco', args: { testo: 'uno' } });
  assert.deepEqual(await c.tel.ricevi(), { v: 1, t: 'res', n: 'n-000001', ok: true, data: { eco: 'uno' } });
  c.tel.manda({ t: 'req', n: 'n-000001', op: 'eco', args: { testo: 'DUE' } });
  assert.deepEqual((await c.tel.ricevi()).data, { eco: 'uno' }, 'la stessa risposta, non una nuova esecuzione');
  assert.equal(b.eseguite.length, 1);
  assert.equal(b.eseguite[0].da, 'Pad di Nino', 'l\'operazione sa da quale telefono arriva');
  c.tel.manda({ t: 'ping', s: 7 });
  assert.deepEqual(await c.tel.ricevi(), { v: 1, t: 'pong', s: 7 });
  c.tel.manda({ t: 'req', n: 'n-000002', op: 'shell.exec', args: {} });
  const no = await c.tel.ricevi();
  assert.equal(no.ok, false); assert.equal(no.code, 'UNKNOWN_OPERATION');
  c.tel.manda({ t: 'req', n: 'x', op: 'eco' });
  assert.equal((await c.tel.ricevi()).code, 'BAD_MESSAGE', 'un n troppo corto non entra');
  assert.deepEqual(b.servizio.inLinea().length, 1);
  c.tel.finisciScrittura();
  await fatto;
  assert.deepEqual(b.servizio.inLinea(), []);
});

test('SRV-08 revoca dal PC: la connessione viva si chiude SUBITO e il telefono non rientra', async (t) => {
  const b = banco(t);
  const acc = await accoppiaTelefono(b);
  const voce = await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'ping', s: 1 }); await c.tel.ricevi();
  await b.servizio.revoca(voce.id);
  await fatto;
  assert.equal(c.stato.chiusaCon, 'REVOKED');
  assert.deepEqual(b.servizio.inLinea(), []);
  const di = connessione(TEL, ALPN_LAVORO);
  await b.servizio.gestisci(di.pc);
  assert.equal((await di.tel.ricevi()).code, 'NOT_PAIRED');
});

test('SRV-09 un ALPN sconosciuto si chiude senza risposta', async (t) => {
  const b = banco(t);
  const c = connessione(TEL, 'talos-remote/9');
  await b.servizio.gestisci(c.pc);
  assert.equal(c.stato.chiusaCon, 'UNKNOWN_ALPN');
  assert.equal(c.stato.letture, 0);
});

test('SRV-10 una revoca scritta nell\'elenco da un\'altra strada (dal telefono) ferma la richiesta successiva con REVOKED', async (t) => {
  const b = banco(t);
  const acc = await accoppiaTelefono(b);
  const voce = await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'req', n: 'n-000010', op: 'eco', args: { testo: 'prima' } });
  assert.equal((await c.tel.ricevi()).ok, true);
  await b.dispositivi.revoca(voce.id, 'telefono');
  c.tel.manda({ t: 'req', n: 'n-000011', op: 'eco', args: { testo: 'dopo' } });
  assert.equal((await c.tel.ricevi()).code, 'REVOKED');
  await fatto;
  assert.equal(b.eseguite.length, 1, 'la richiesta dopo la revoca non è eseguita');
});

test('SRV-11 per un telefono in linea il PC sa la strada di adesso (mockup: «diretto, 38 ms»); scollegato, niente', async (t) => {
  const b = banco(t);
  const acc = await accoppiaTelefono(b);
  const voce = await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  c.pc.percorso = () => ({ tipo: 'diretto', rttMs: 38 });
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'ping', s: 1 }); await c.tel.ricevi();
  assert.deepEqual(b.servizio.percorsi(), { [voce.id]: { tipo: 'diretto', rttMs: 38 } });
  c.tel.finisciScrittura(); await fatto;
  assert.deepEqual(b.servizio.percorsi(), {});
});

test('SRV-10 (D-RM4-5) un rifiuto col suo motivo arriva al telefono con reason e params ripuliti; senza motivo, come prima', async (t) => {
  const operazioni = {
    async esegui(op) {
      if (op === 'session.start') throw Object.assign(new Error('Invalid configuration'), { code: 'CONFIG_INVALID', reason: 'provider-key-missing-named',
        params: { provider: 'OpenRouter', cartella: 'C:\\Users\\Mario\\x\\progetto' } });
      throw Object.assign(new Error('boom'), { code: 'OPERATION_FAILED' });
    },
  };
  const b = banco(t, { operazioni });
  const acc = await accoppiaTelefono(b);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'req', n: 'n-000010', op: 'session.start', args: {} });
  const r = await c.tel.ricevi();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'CONFIG_INVALID');
  assert.equal(r.reason, 'provider-key-missing-named');
  assert.deepEqual(r.params, { provider: 'OpenRouter', cartella: '…/progetto' });
  c.tel.manda({ t: 'req', n: 'n-000011', op: 'altro', args: {} });
  const s = await c.tel.ricevi();
  assert.equal(s.code, 'OPERATION_FAILED');
  assert.ok(!('reason' in s) && !('params' in s), 'senza motivo la risposta resta quella di prima');
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-11 (Mobile, 19/10) dopo pair.ok il PC chiude la sua scrittura e ASPETTA il telefono; il tetto chiude comunque', async (t) => {
  // un tetto lungo: la connessione resta aperta finché il telefono non chiude il suo lato
  const lungo = banco(t, { attesaDopoPairOkMs: 60_000 });
  const a = await accoppiaTelefono(lungo);
  await lungo.servizio.conferma(lungo.accoppiamento.inAttesa()[0].id);
  assert.equal((await a.c.tel.ricevi()).t, 'pair.ok');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(a.c.stato.chiusaCon, null, 'il PC non chiude finché il telefono non ha chiuso la sua scrittura');
  a.c.tel.finisciScrittura();
  await a.fatto;
  assert.equal(a.c.stato.chiusaCon, 'DONE', 'chiuso subito dopo il telefono');
  // al contrario: un telefono che non chiude mai non tiene aperta la connessione oltre il tetto
  const corto = banco(t, { attesaDopoPairOkMs: 200 });
  const b = await accoppiaTelefono(corto, { remoteId: 'f'.repeat(64) });
  await corto.servizio.conferma(corto.accoppiamento.inAttesa()[0].id);
  assert.equal((await b.c.tel.ricevi()).t, 'pair.ok');
  const inizio = Date.now();
  await b.fatto;
  assert.equal(b.c.stato.chiusaCon, 'DONE');
  assert.ok(Date.now() - inizio >= 150, 'ha aspettato il tetto');
});

test('SRV-12 (RA-04, Mobile 20/10) un rifiuto porta lo stato HTTP della rotta; un numero fuori da 400-599 o non intero no', async (t) => {
  const stati = { a: 409, b: 422, c: 200, d: 450.5, e: '500' };
  const operazioni = { async esegui(op) { throw Object.assign(new Error('no'), { code: 'X_' + op.toUpperCase(), stato: stati[op] }); } };
  const b = banco(t, { operazioni });
  const acc = await accoppiaTelefono(b);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  const risposte = {};
  for (const [i, op] of Object.keys(stati).entries()) {
    c.tel.manda({ t: 'req', n: `n-00002${i}`, op, args: {} });
    risposte[op] = await c.tel.ricevi();
  }
  assert.equal(risposte.a.stato, 409);
  assert.equal(risposte.b.stato, 422);
  for (const op of ['c', 'd', 'e']) assert.ok(!('stato' in risposte[op]), `${op}: ${JSON.stringify(risposte[op])}`);
  c.tel.finisciScrittura();
  await fatto;
});
