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

function banco(t, { operazioni = null, attesaDopoPairOkMs = 50, effimero = undefined } = {}) {
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
  const servizio = creaServizioRemoto({ pcId: PC, nomePc: 'PC di Nino', vapidPubblica: 'BPUB', accoppiamento, dispositivi, operazioni: ops, avvisa: (a) => avvisi.push(a), attesaDopoPairOkMs,
    ...(effimero !== undefined ? { effimero } : {}) });
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

test('SRV-13 (D-37) un messaggio d\'errore arriva al dispositivo senza percorsi del PC, anche oltre il taglio dei 300 caratteri', async (t) => {
  const operazioni = { async esegui(op) {
    if (op === 'lungo') throw Object.assign(new Error(`${'x '.repeat(145)}C:\\Users\\Mario\\AppData\\Local\\segreto\\file.txt`), { code: 'ENOTDIR' });
    throw Object.assign(new Error("ENOTDIR: not a directory, mkdir 'C:\\Users\\Mario\\AppData\\x'"), { code: 'ENOTDIR' });
  } };
  const b = banco(t, { operazioni });
  const acc = await accoppiaTelefono(b);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  for (const [i, op] of ['corto', 'lungo'].entries()) {
    c.tel.manda({ t: 'req', n: `n-00003${i}`, op, args: {} });
    assert.doesNotMatch((await c.tel.ricevi()).message, /Mario|AppData/u, op);
  }
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-14 (D-29) una risposta oltre il tetto del filo rifiuta quella richiesta sola: la connessione resta, e lo stesso n ridà lo stesso rifiuto senza rifare niente', async (t) => {
  let volte = 0;
  const operazioni = { async esegui(op) {
    if (op === 'enorme') { volte += 1; return { testo: 'x'.repeat(2 * 1024 * 1024) }; }
    return { ok: true };
  } };
  const b = banco(t, { operazioni });
  const acc = await accoppiaTelefono(b);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'req', n: 'n-000040', op: 'enorme', args: {} });
  const rifiuto = await c.tel.ricevi();
  assert.deepEqual([rifiuto.ok, rifiuto.code, rifiuto.stato], [false, 'TOO_LARGE', 413]);
  c.tel.manda({ t: 'req', n: 'n-000040', op: 'enorme', args: {} });
  assert.equal((await c.tel.ricevi()).code, 'TOO_LARGE');
  assert.equal(volte, 1);
  c.tel.manda({ t: 'req', n: 'n-000041', op: 'piccola', args: {} });
  assert.deepEqual((await c.tel.ricevi()).data, { ok: true }, 'la connessione è viva');
  assert.equal(c.stato.chiusaCon, null);
  c.tel.finisciScrittura();
  await fatto;
});

/* 24/10/2026 (fetta C del Mobile, PC doppi; contratto v0.3 §B): `pc.effimero` solo per un PC col portachiavi di prova; assente negli
   altri casi (SRV-01 lo prova senza: `deepEqual` sul `pc` intero) */
test('SRV-EFF-01 — un PC effimero lo dice in pair.code e pair.ok; uno vero no (il campo non c\'è, mai false)', async (t) => {
  const b = banco(t, { effimero: true });
  const { c, fatto, codice } = await accoppiaTelefono(b);
  assert.equal(codice.pc.effimero, true);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id);
  const ok = await c.tel.ricevi();
  assert.deepEqual(ok.pc, { id: PC, nome: 'PC di Nino', programma: 'TALOS desktop', vapid: 'BPUB', effimero: true });
  await fatto;
  /* AL CONTRARIO: un valore che non è `true` non accende il campo */
  const vero = banco(t, { effimero: 'si' });
  const due = await accoppiaTelefono(vero);
  assert.equal(Object.hasOwn(due.codice.pc, 'effimero'), false);
  vero.servizio.rifiuta(vero.accoppiamento.inAttesa()[0].id);
  await due.fatto.catch(() => {});
});

test('SRV-15 punto 14: ping e fermare passano mentre una voce lunga aspetta, e la voce lunga risponde dopo', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const operazioni = { async esegui(op) {
    if (op === 'session.git.fetch') { await appeso; return { ok: true, fine: 'fetch' }; }
    if (op === 'session.git.fetch-stop') { sblocca(); return { ok: true, fermato: true }; }
    return { ok: true };
  } };
  const b = banco(t, { operazioni });
  const acc = await accoppiaTelefono(b);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'req', n: 'n-000050', op: 'session.git.fetch', args: {} });
  c.tel.manda({ t: 'req', n: 'n-000050', op: 'session.git.fetch', args: {} });
  c.tel.manda({ t: 'ping', s: 7 });
  assert.equal((await c.tel.ricevi()).t, 'pong', 'il ping non sta in fila dietro il recupero');
  c.tel.manda({ t: 'req', n: 'n-000051', op: 'session.git.fetch-stop', args: {} });
  const stop = await c.tel.ricevi();
  assert.deepEqual([stop.n, stop.data.fermato], ['n-000051', true]);
  const finito = await c.tel.ricevi();
  assert.deepEqual([finito.n, finito.data.fine], ['n-000050', 'fetch']);
  c.tel.manda({ t: 'req', n: 'n-000052', op: 'piccola', args: {} });
  assert.equal((await c.tel.ricevi()).n, 'n-000052', 'lo stesso n ripetuto mentre girava non ha dato una seconda risposta');
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-16 F2: un errore del filo diverso da TOO_LARGE resta un errore, non diventa un rifiuto di quella richiesta', async (t) => {
  const operazioni = { async esegui() { return { valore: 1n }; } };
  const b = banco(t, { operazioni });
  const acc = await accoppiaTelefono(b);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  const c = connessione(TEL, ALPN_LAVORO);
  const fatto = b.servizio.gestisci(c.pc);
  c.tel.manda({ t: 'req', n: 'n-000060', op: 'qualsiasi', args: {} });
  const m = await c.tel.ricevi();
  assert.deepEqual([m.t, m.code], ['error', 'BAD_MESSAGE']);
  await fatto;
  assert.equal(c.stato.chiusaCon, 'DONE');
});

async function collegato(t, operazioni) {
  const b = banco(t, { operazioni });
  const acc = await accoppiaTelefono(b);
  await b.servizio.conferma(b.accoppiamento.inAttesa()[0].id); await acc.c.tel.ricevi(); await acc.fatto;
  return b;
}
const apriConnessione = (b) => { const c = connessione(TEL, ALPN_LAVORO); return { c, fatto: b.servizio.gestisci(c.pc) }; };

test('SRV-17 B3: con cinque voci lunghe appese il ping e il «ferma» passano lo stesso, e la quinta parte quando c\'è posto', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const partite = [];
  const operazioni = { async esegui(op, _a, ctx) {
    if (op === 'session.git.fetch') { partite.push(ctx.n); await appeso; return { ok: true }; }
    return { ok: true, fermato: true };
  } };
  const b = await collegato(t, operazioni);
  const { c, fatto } = apriConnessione(b);
  for (let i = 0; i < 5; i += 1) c.tel.manda({ t: 'req', n: `n-lunga-${i}`, op: 'session.git.fetch', args: {} });
  c.tel.manda({ t: 'ping', s: 1 });
  assert.equal((await c.tel.ricevi()).t, 'pong');
  c.tel.manda({ t: 'req', n: 'n-ferma-1', op: 'session.git.fetch-stop', args: {} });
  assert.equal((await c.tel.ricevi()).n, 'n-ferma-1');
  while (partite.length < 4) await new Promise((r) => { setTimeout(r, 2); });
  await new Promise((r) => { setTimeout(r, 30); });
  assert.equal(partite.length, 4, 'il tetto resta');
  sblocca();
  const arrivate = [];
  for (let i = 0; i < 5; i += 1) arrivate.push((await c.tel.ricevi()).n);
  assert.deepEqual(arrivate.sort(), [0, 1, 2, 3, 4].map((i) => `n-lunga-${i}`));
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-18 B3: una voce normale appesa non ferma il ping né il «ferma», e la fila resta in ordine', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const ordine = [];
  const operazioni = { async esegui(op, _a, ctx) {
    ordine.push(ctx.n);
    if (op === 'lenta') await appeso;
    return { ok: true };
  } };
  const b = await collegato(t, operazioni);
  const { c, fatto } = apriConnessione(b);
  c.tel.manda({ t: 'req', n: 'n-normale-1', op: 'lenta', args: {} });
  c.tel.manda({ t: 'req', n: 'n-normale-2', op: 'dopo', args: {} });
  c.tel.manda({ t: 'ping', s: 2 });
  assert.equal((await c.tel.ricevi()).t, 'pong');
  c.tel.manda({ t: 'req', n: 'n-ferma-2', op: 'session.git.fetch-stop', args: {} });
  assert.equal((await c.tel.ricevi()).n, 'n-ferma-2');
  while (!ordine.includes('n-normale-1')) await new Promise((r) => { setTimeout(r, 2); });
  await new Promise((r) => { setTimeout(r, 30); });
  assert.equal(ordine.includes('n-normale-2'), false, 'la seconda aspetta la prima');
  sblocca();
  assert.equal((await c.tel.ricevi()).n, 'n-normale-1');
  assert.equal((await c.tel.ricevi()).n, 'n-normale-2');
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-19 B3: chi chiude dopo aver mandato tre richieste riceve tre risposte, in ordine', async (t) => {
  const b = await collegato(t, { async esegui() { return { ok: true }; } });
  const { c, fatto } = apriConnessione(b);
  for (const n of ['n-chiude-1', 'n-chiude-2', 'n-chiude-3']) c.tel.manda({ t: 'req', n, op: 'x', args: {} });
  c.tel.finisciScrittura();
  const arrivate = [(await c.tel.ricevi()).n, (await c.tel.ricevi()).n, (await c.tel.ricevi()).n];
  assert.deepEqual(arrivate, ['n-chiude-1', 'n-chiude-2', 'n-chiude-3']);
  await fatto;
});

test('SRV-20 B3: ciò che era in fila non parte dopo la revoca', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const ordine = [];
  const operazioni = { async esegui(op, _a, ctx) { ordine.push(ctx.n); if (op === 'lenta') await appeso; return { ok: true }; } };
  const b = await collegato(t, operazioni);
  const { c, fatto } = apriConnessione(b);
  c.tel.manda({ t: 'req', n: 'n-revoca-1', op: 'lenta', args: {} });
  c.tel.manda({ t: 'req', n: 'n-revoca-2', op: 'scrive', args: {} });
  c.tel.manda({ t: 'ping', s: 3 });
  assert.equal((await c.tel.ricevi()).t, 'pong');
  await b.dispositivi.revoca((await b.dispositivi.ammesso(TEL)).id, 'pc');
  sblocca();
  await fatto;
  assert.deepEqual(ordine, ['n-revoca-1']);
});

test('SRV-21 B9: lo stesso n su una connessione nuova mentre gira non rifà la voce, e la risposta arriva lì', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  let partite = 0;
  const operazioni = { async esegui(op) {
    if (op === 'session.git.push') { partite += 1; await appeso; return { ok: true, fine: 'inviato' }; }
    return { ok: true };
  } };
  const b = await collegato(t, operazioni);
  const prima = apriConnessione(b);
  prima.c.tel.manda({ t: 'req', n: 'n-invio-01', op: 'session.git.push', args: {} });
  prima.c.tel.manda({ t: 'ping', s: 4 });
  await prima.c.tel.ricevi();
  const seconda = apriConnessione(b);
  seconda.c.tel.manda({ t: 'req', n: 'n-invio-01', op: 'session.git.push', args: {} });
  seconda.c.tel.manda({ t: 'ping', s: 5 });
  assert.equal((await seconda.c.tel.ricevi()).t, 'pong', 'la seconda connessione resta viva');
  assert.equal(partite, 1, 'l\'invio è partito una volta');
  sblocca();
  const m = await seconda.c.tel.ricevi();
  assert.deepEqual([m.n, m.data.fine], ['n-invio-01', 'inviato']);
  assert.equal(partite, 1);
  prima.c.tel.finisciScrittura(); seconda.c.tel.finisciScrittura();
  await Promise.all([prima.fatto, seconda.fatto]);
});

test('SRV-22 B9: una lettura che non si ricorda non aspetta nessuno, e una voce finita in errore non blocca lo stesso n', async (t) => {
  const b = await collegato(t, { async esegui(op) { if (op === 'rotta') throw Object.assign(new Error('no'), { code: 'BAD_MESSAGE', stato: 400 }); return { ok: true }; } });
  const { c, fatto } = apriConnessione(b);
  c.tel.manda({ t: 'req', n: 'n-errore-1', op: 'rotta', args: {} });
  const m = await c.tel.ricevi();
  assert.equal(m.code, 'BAD_MESSAGE');
  c.tel.finisciScrittura();
  await fatto;
  const altra = apriConnessione(b);
  altra.c.tel.manda({ t: 'req', n: 'n-errore-1', op: 'rotta', args: {} });
  assert.equal((await altra.c.tel.ricevi()).code, 'BAD_MESSAGE', 'la risposta ricordata');
  altra.c.tel.finisciScrittura();
  await altra.fatto;
});

test('SRV-23 sospetto del Mobile: i messaggi di una connessione non si scrivono mai insieme', async (t) => {
  let dentro = 0; let massimo = 0;
  const b = await collegato(t, { async esegui() { return { ok: true }; } });
  const c = connessione(TEL, ALPN_LAVORO);
  const vera = c.pc.stream.scrivi;
  c.pc.stream.scrivi = async (byte) => { dentro += 1; massimo = Math.max(massimo, dentro); await new Promise((r) => { setTimeout(r, 2); }); await vera(byte); dentro -= 1; };
  const fatto = b.servizio.gestisci(c.pc);
  for (let i = 0; i < 4; i += 1) c.tel.manda({ t: 'req', n: `n-scrive-${i}`, op: 'session.git.fetch', args: {} });
  c.tel.manda({ t: 'ping', s: 6 });
  c.tel.manda({ t: 'req', n: 'n-ferma-3', op: 'session.git.fetch-stop', args: {} });
  for (let i = 0; i < 6; i += 1) await c.tel.ricevi();
  assert.equal(massimo, 1);
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-24 B9: se la voce finisce in un guasto chi aspettava sull\'altra connessione si libera, e lo stesso n riparte', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  let partite = 0;
  const operazioni = { async esegui(op) {
    if (op !== 'session.git.push') return { ok: true };
    partite += 1;
    if (partite === 1) { await appeso; return { valore: 1n }; } // la risposta non si serializza: un guasto, non un rifiuto
    return { ok: true, fine: 'seconda' };
  } };
  const b = await collegato(t, operazioni);
  const prima = apriConnessione(b);
  prima.c.tel.manda({ t: 'req', n: 'n-guasto-1', op: 'session.git.push', args: {} });
  prima.c.tel.manda({ t: 'ping', s: 7 });
  await prima.c.tel.ricevi();
  while (partite < 1) await new Promise((r) => { setImmediate(r); });
  /* il ping non dice che la fila della seconda è arrivata alla voce: lo dice il controllo dell'elenco, che viene subito prima */
  const ammesso = b.dispositivi.ammesso.bind(b.dispositivi);
  let controlli = 0;
  b.dispositivi.ammesso = async (id) => { const r = await ammesso(id); controlli += 1; return r; };
  const seconda = apriConnessione(b);
  seconda.c.tel.manda({ t: 'req', n: 'n-guasto-1', op: 'session.git.push', args: {} });
  while (controlli < 1) await new Promise((r) => { setImmediate(r); });
  await new Promise((r) => { setImmediate(r); });
  assert.equal(partite, 1);
  sblocca();
  assert.equal((await prima.c.tel.ricevi()).code, 'BAD_MESSAGE');
  await new Promise((r) => { setImmediate(r); });
  seconda.c.tel.manda({ t: 'req', n: 'n-guasto-1', op: 'session.git.push', args: {} });
  const m = await seconda.c.tel.ricevi();
  assert.deepEqual([m.n, m.data?.fine], ['n-guasto-1', 'seconda']);
  prima.c.tel.finisciScrittura(); seconda.c.tel.finisciScrittura();
  await Promise.all([prima.fatto, seconda.fatto]);
});

test('SRV-25 B3: la fila ha un tetto: oltre si smette di leggere, e alla fine ognuno ha la sua risposta', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const operazioni = { async esegui(op) { if (op === 'lenta') await appeso; return { ok: true }; } };
  const b = await collegato(t, operazioni);
  const { c, fatto } = apriConnessione(b);
  c.tel.manda({ t: 'req', n: 'n-primo-00', op: 'lenta', args: {} });
  for (let i = 0; i < 200; i += 1) c.tel.manda({ t: 'req', n: `n-fila-${String(i).padStart(4, '0')}`, op: 'x', args: {} });
  await new Promise((r) => { setTimeout(r, 60); });
  assert.ok(c.stato.letture < 80, `letti ${c.stato.letture}`);
  sblocca();
  for (let i = 0; i < 201; i += 1) await c.tel.ricevi();
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-26 B9: la voce che ha aspettato un posto riguarda se lo stesso n è partito altrove', async (t) => {
  const aperti = new Map();
  const conteggi = new Map();
  const porta = (n) => { if (!aperti.has(n)) { let apri; const chiusa = new Promise((r) => { apri = r; }); aperti.set(n, { apri, chiusa }); } return aperti.get(n); };
  const operazioni = { async esegui(op, _a, ctx) {
    if (op !== 'session.git.push') return { ok: true };
    conteggi.set(ctx.n, (conteggi.get(ctx.n) ?? 0) + 1);
    await porta(ctx.n).chiusa;
    return { ok: true };
  } };
  const giro = () => new Promise((r) => { setImmediate(r); });
  const b = await collegato(t, operazioni);
  const prima = apriConnessione(b);
  for (let i = 0; i < 4; i += 1) prima.c.tel.manda({ t: 'req', n: `n-posto-${i}`, op: 'session.git.push', args: {} });
  while (conteggi.size < 4) await giro();
  const ammesso = b.dispositivi.ammesso.bind(b.dispositivi);
  let controlli = 0;
  b.dispositivi.ammesso = async (id) => { const r = await ammesso(id); controlli += 1; return r; };
  prima.c.tel.manda({ t: 'req', n: 'n-posto-x', op: 'session.git.push', args: {} });
  while (controlli < 1) await giro();
  await giro();
  const seconda = apriConnessione(b);
  seconda.c.tel.manda({ t: 'req', n: 'n-posto-x', op: 'session.git.push', args: {} });
  while (!conteggi.has('n-posto-x')) await giro();
  porta('n-posto-0').apri();
  assert.equal((await prima.c.tel.ricevi()).n, 'n-posto-0');
  await new Promise((r) => { setTimeout(r, 30); });
  for (const n of ['n-posto-1', 'n-posto-2', 'n-posto-3', 'n-posto-x']) porta(n).apri();
  const arrivate = [];
  for (let i = 0; i < 4; i += 1) arrivate.push((await prima.c.tel.ricevi()).n);
  assert.deepEqual(arrivate.sort(), ['n-posto-1', 'n-posto-2', 'n-posto-3', 'n-posto-x']);
  assert.equal((await seconda.c.tel.ricevi()).n, 'n-posto-x');
  assert.equal(conteggi.get('n-posto-x'), 1, 'l\'invio è partito una volta');
  prima.c.tel.finisciScrittura(); seconda.c.tel.finisciScrittura();
  await Promise.all([prima.fatto, seconda.fatto]);
});

/* Revisione delle cure 3 del Mobile: `.fetch-stop` e i `.fetch` che non sono ancora partiti */
const operazioniDelRecupero = (appeso, partite) => ({ async esegui(op, args, ctx) {
  if (op === 'lenta') { await appeso; return { ok: true }; }
  if (op === 'session.git.fetch') { partite.push(ctx.n); return { ok: true, sessione: args.sessionId }; }
  return { ok: true, fermato: false };
} });
const finche = async (condizione) => { while (!condizione()) await new Promise((r) => { setImmediate(r); }); };

test('SRV-27 N5: `.fetch-stop` ferma il `.fetch` ancora in fila, che non parte e risponde «fermato»', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const partite = [];
  const b = await collegato(t, operazioniDelRecupero(appeso, partite));
  const { c, fatto } = apriConnessione(b);
  c.tel.manda({ t: 'req', n: 'n-lenta-01', op: 'lenta', args: {} });
  c.tel.manda({ t: 'req', n: 'n-fetch-01', op: 'session.git.fetch', args: { sessionId: 's1' } });
  c.tel.manda({ t: 'req', n: 'n-ferma-01', op: 'session.git.fetch-stop', args: { sessionId: 's1' } });
  const ferma = await c.tel.ricevi();
  assert.deepEqual([ferma.n, ferma.ok, ferma.data.fermato], ['n-ferma-01', true, true]);
  sblocca();
  const arrivate = new Map();
  for (let i = 0; i < 2; i += 1) { const m = await c.tel.ricevi(); arrivate.set(m.n, m); }
  assert.deepEqual(partite, [], 'il recupero non parte');
  const fermo = arrivate.get('n-fetch-01');
  assert.deepEqual([fermo.ok, fermo.code, fermo.stato], [false, 'GIT_ABORTED', 409]);
  c.tel.manda({ t: 'req', n: 'n-fetch-01', op: 'session.git.fetch', args: { sessionId: 's1' } });
  assert.equal((await c.tel.ricevi()).code, 'GIT_ABORTED', 'lo stesso `n` trova la stessa risposta');
  assert.deepEqual(partite, []);
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-28 N5: un `.fetch` che aspetta un posto si ferma lo stesso', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const partite = [];
  const operazioni = { async esegui(op, _a, ctx) {
    if (op === 'session.git.pull') { partite.push(ctx.n); await appeso; return { ok: true }; }
    if (op === 'session.git.fetch') { partite.push(ctx.n); return { ok: true }; }
    return { ok: true, fermato: false };
  } };
  const b = await collegato(t, operazioni);
  const { c, fatto } = apriConnessione(b);
  for (let i = 0; i < 4; i += 1) c.tel.manda({ t: 'req', n: `n-lunga-${i}0`, op: 'session.git.pull', args: {} });
  await finche(() => partite.length === 4);
  c.tel.manda({ t: 'req', n: 'n-fetch-02', op: 'session.git.fetch', args: { sessionId: 's1' } });
  await new Promise((r) => { setTimeout(r, 20); });
  c.tel.manda({ t: 'req', n: 'n-ferma-02', op: 'session.git.fetch-stop', args: { sessionId: 's1' } });
  assert.equal((await c.tel.ricevi()).data.fermato, true);
  sblocca();
  const arrivate = new Map();
  for (let i = 0; i < 5; i += 1) { const m = await c.tel.ricevi(); arrivate.set(m.n, m); }
  assert.equal(arrivate.get('n-fetch-02').code, 'GIT_ABORTED');
  assert.equal(partite.includes('n-fetch-02'), false);
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-29 N5: il `.fetch` in fila si ferma anche da un\'altra connessione dello stesso dispositivo', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const partite = [];
  const b = await collegato(t, operazioniDelRecupero(appeso, partite));
  const prima = apriConnessione(b);
  prima.c.tel.manda({ t: 'req', n: 'n-lenta-03', op: 'lenta', args: {} });
  prima.c.tel.manda({ t: 'req', n: 'n-fetch-03', op: 'session.git.fetch', args: { sessionId: 's1' } });
  prima.c.tel.manda({ t: 'ping', s: 1 });
  await prima.c.tel.ricevi();
  const seconda = apriConnessione(b);
  seconda.c.tel.manda({ t: 'req', n: 'n-ferma-03', op: 'session.git.fetch-stop', args: { sessionId: 's1' } });
  assert.equal((await seconda.c.tel.ricevi()).data.fermato, true);
  sblocca();
  await prima.c.tel.ricevi(); await prima.c.tel.ricevi();
  assert.deepEqual(partite, []);
  prima.c.tel.finisciScrittura(); seconda.c.tel.finisciScrittura();
  await Promise.all([prima.fatto, seconda.fatto]);
});

test('SRV-30 N5, al contrario: un\'altra sessione e il `.fetch` chiesto dopo partono', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  const partite = [];
  const b = await collegato(t, operazioniDelRecupero(appeso, partite));
  const { c, fatto } = apriConnessione(b);
  c.tel.manda({ t: 'req', n: 'n-lenta-04', op: 'lenta', args: {} });
  c.tel.manda({ t: 'req', n: 'n-altra-04', op: 'session.git.fetch', args: { sessionId: 's2' } });
  c.tel.manda({ t: 'req', n: 'n-ferma-04', op: 'session.git.fetch-stop', args: { sessionId: 's1' } });
  assert.equal((await c.tel.ricevi()).data.fermato, false, 'niente da fermare in questa sessione');
  c.tel.manda({ t: 'req', n: 'n-senza-04', op: 'session.git.fetch-stop', args: {} });
  assert.equal((await c.tel.ricevi()).data.fermato, false, 'senza sessione non si ferma niente');
  c.tel.manda({ t: 'req', n: 'n-dopo-004', op: 'session.git.fetch', args: { sessionId: 's1' } });
  sblocca();
  for (let i = 0; i < 3; i += 1) assert.equal((await c.tel.ricevi()).ok, true);
  assert.deepEqual(partite.sort(), ['n-altra-04', 'n-dopo-004']);
  c.tel.finisciScrittura();
  await fatto;
});

test('SRV-31 N6: `.fetch-stop` con lo stesso `n` su due connessioni gira una volta, e la risposta arriva a tutte e due', async (t) => {
  let sblocca; const appeso = new Promise((r) => { sblocca = r; });
  let esecuzioni = 0;
  const operazioni = { async esegui(op) {
    if (op === 'session.git.fetch-stop') { esecuzioni += 1; await appeso; return { ok: true, fermato: true }; }
    return { ok: true };
  } };
  const b = await collegato(t, operazioni);
  const prima = apriConnessione(b);
  const seconda = apriConnessione(b);
  const richiesta = { t: 'req', n: 'n-ferma-05', op: 'session.git.fetch-stop', args: { sessionId: 's1' } };
  prima.c.tel.manda(richiesta);
  await finche(() => esecuzioni === 1);
  seconda.c.tel.manda(richiesta);
  seconda.c.tel.manda({ t: 'ping', s: 2 });
  assert.equal((await seconda.c.tel.ricevi()).t, 'pong');
  assert.equal(esecuzioni, 1);
  sblocca();
  assert.equal((await prima.c.tel.ricevi()).data.fermato, true);
  assert.equal((await seconda.c.tel.ricevi()).data.fermato, true);
  seconda.c.tel.manda(richiesta);
  assert.equal((await seconda.c.tel.ricevi()).data.fermato, true, 'finita, trova la risposta ricordata');
  assert.equal(esecuzioni, 1);
  prima.c.tel.finisciScrittura(); seconda.c.tel.finisciScrittura();
  await Promise.all([prima.fatto, seconda.fatto]);
});
