import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fsVero from 'node:fs';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';

import * as store from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { CARTELLA_AFFITTI } from '../src/session-lease.mjs';
import { aggiungiAllAttesaSync, leggiAttesa } from '../src/session-attesa.mjs';

/*
 * 15/11/2026 — SETTIMO GIRO DELL'AFFITTO (owner 23:55 «settimo giro completo», giudice v1919-v1921). Le prove dei tre revisori del giro 6
 *   (testa c6d6451e5), rese prove del ramo:
 *   · revisore 3 (`C:/T/rev-aff6-3-lavoro/prova-rotto.mjs`, `prova-corta.mjs`, `bench-attesa.mjs`): una riga rimasta a metà nel file di
 *     attesa e poi una riga nuova ⇒ la nuova non si adottava mai (30/30); un BOM in testa ⇒ la prima riga non si leggeva (30/30); una
 *     scrittura corta diceva «scritto» e dopo il riavvio si perdevano quella riga e la successiva (30/30); 50.000 righe in attesa ⇒ avvio
 *     9 s e adozione altri 17 s (due ricerche lineari dentro un ciclo);
 *   · revisore 2 (`C:/T/rev-aff6-2-lavoro/vivo.mjs`, forme mt e misto): le due note erano `RunError` (carta rossa, fine del giro a schermo,
 *     `run.failed` nella CLI), la nota «in attesa» tornava a ogni ricollegamento e la «salvata» arrivava DENTRO un giro e toglieva lo Stop.
 *   Solo cartelle del TEMP (finto, nella coda); mai tolte da qui.
 *   Doc Node v24 (ctx7 `/websites/nodejs_latest-v24_x_api`, 15/11/2026): `fs.writeSync` «Returns: <number> The number of bytes written»;
 *   `TextDecoder` toglie il BOM solo con `ignoreBOM: false`, `readFileSync(…, 'utf8')` lo lascia; `perf_hooks.monitorEventLoopDelay` per
 *   il blocco più lungo del ciclo degli eventi.
 */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const BOM = String.fromCharCode(0xfeff);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const LS_SFUGGITO = `${String.fromCharCode(0x5c)}u2028`;
const NOME_NOTA = 'talos.riga-in-attesa';
const riga = (o) => `${JSON.stringify(o)}\n`;
const rigaAttesa = (id, testo = 'x') => ({ tipo: 'attesa', id, alle: new Date().toISOString(), record: { type: 'CUSTOM', name: 'talos.prova', value: { id, testo } } });
const giornale = (cartella, id) => join(cartella, `${id}.jsonl`);
const fileAttesa = (cartella, id) => join(cartella, `${id}.attesa`);
const righeDiario = (cartella, id) => readFileSync(giornale(cartella, id), 'utf8').split('\n').filter(Boolean).map((t) => { try { return JSON.parse(t); } catch { return { rotta: true }; } });
const massimo = (cartella, id) => Math.max(0, ...righeDiario(cartella, id).map((r) => r._sequenza).filter(Number.isSafeInteger));
const corse = Math.max(1, Number(process.env.TALOS_G7_CORSE) || 1); // il banco le porta a 30; la coda ne fa 1
const nota = (e) => (e?.type === 'CUSTOM' && e.name === NOME_NOTA ? e.value ?? {} : null);

/* Il registro del banco del revisore 3: modello finto, un giro, nessun affitto fra processi. */
function apriRegistro(cartellaStore, { ritentaMs = 20, extra = {} } = {}) {
  return createSessionRegistry({
    cartellaStore, guardaWorkspaceFn: () => () => {}, ritentaCodaAffittataMs: ritentaMs,
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'finto', chiave: 'finta',
    avviaSessioneFn: async (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r-1' });
      input.onEvento({ type: 'TextMessageStart', messageId: 'm-1', role: 'assistant' });
      input.onEvento({ type: 'TextMessageContent', messageId: 'm-1', delta: 'ciao' });
      input.onEvento({ type: 'TextMessageEnd', messageId: 'm-1' });
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r-1', outcome: { type: 'success' }, result: { detto: 'ok' } });
      return { ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } };
    },
    ...extra,
  });
}

async function creaChat(cartellaStore) {
  mkdirSync(cartellaStore, { recursive: true });
  const r = apriRegistro(cartellaStore);
  const cartellaLibera = mkdtempSync(join(tmpdir(), 'g7l-'));
  const { sessionId } = r.avviaLibero({ cartellaLibera, consegna: 'ciao', permessi: 'Full access' });
  await r.attendiAssestamento(sessionId);
  await store.attendiScritture({ cartellaStore, sessionId });
  await r.chiudi({ attesaMassimaMs: 2000 }).catch(() => {});
  return sessionId;
}

/* Due riavvii del TALOS sul file di attesa preparato: la chat si apre? la riga integra entra nel diario, una volta sola? */
async function dueRiavvii(cartella, id) {
  const esiti = [];
  for (let giro = 1; giro <= 2; giro += 1) {
    const r = apriRegistro(cartella);
    let aperta = false;
    try { await r.ripristina(); aperta = Boolean(r.esporta(id)); } catch { aperta = false; }
    for (let i = 0; aperta && i < 150 && r.righeInAttesa(id).length > 0; i += 1) await pausa(20);
    const restano = aperta ? r.righeInAttesa(id).length : null;
    await store.attendiScritture({ cartellaStore: cartella, sessionId: id }).catch(() => {});
    await r.chiudi({ attesaMassimaMs: 2000 }).catch(() => {});
    esiti.push({ aperta, restano });
  }
  return esiti;
}

/* Le forme del revisore 3 (`prova-rotto.mjs`): ognuna mette nel file una riga integra (`intatta`) accanto a un guasto. */
const FORME = {
  troncato: (c) => { const r = riga(rigaAttesa(c.rotta)); writeFileSync(c.file, riga(rigaAttesa(c.intatta)) + r.slice(0, Math.floor(r.length / 2))); },
  'meta-in-mezzo': (c) => { const r = riga(rigaAttesa(c.rotta)); writeFileSync(c.file, `${r.slice(0, Math.floor(r.length / 2))}\n${riga(rigaAttesa(c.intatta))}`); },
  'meta-poi-aggiunta': (c) => { const r = riga(rigaAttesa(c.rotta)); writeFileSync(c.file, r.slice(0, Math.floor(r.length / 2))); c.aggiungi = true; },
  'u2028-crudo': (c) => { writeFileSync(c.file, riga(rigaAttesa(c.intatta, `a${LS}b${PS}c`))); },
  'u2028-sfuggito': (c) => { writeFileSync(c.file, riga(rigaAttesa(c.intatta, `a${LS}b`)).split(LS).join(LS_SFUGGITO)); },
  bom: (c) => { writeFileSync(c.file, BOM + riga(rigaAttesa(c.intatta))); },
  'bom-poi-aggiunta': (c) => { writeFileSync(c.file, BOM + riga(rigaAttesa(c.rotta))); c.aggiungi = true; },
  crlf: (c) => { writeFileSync(c.file, riga(rigaAttesa(c.intatta)).replace('\n', '\r\n')); },
  'riga-vuota-in-mezzo': (c) => { writeFileSync(c.file, `${riga(rigaAttesa(c.rotta))}\n\n${riga(rigaAttesa(c.intatta))}`); },
  spazzatura: (c) => { writeFileSync(c.file, Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28, 0x7b]), Buffer.from(`\n${riga(rigaAttesa(c.intatta))}`)])); },
  'adottata-a-meta': (c) => {
    const max = massimo(c.cartella, c.id);
    appendFileSync(giornale(c.cartella, c.id), riga({ ...rigaAttesa(c.intatta).record, timestamp: Date.now(), _sequenza: max + 1, _attesa: c.intatta }));
    writeFileSync(c.file, riga(rigaAttesa(c.intatta)) + riga({ tipo: 'adottata', id: c.intatta, alle: new Date().toISOString(), sequenza: max + 1 }).slice(0, 20));
  },
};

async function forma(nome) {
  const conti = { corse: 0, aperta: 0, unaVolta: 0, mai: 0, doppie: 0, rottaUnaVolta: 0 };
  for (let k = 0; k < corse; k += 1) {
    const cartella = mkdtempSync(join(tmpdir(), `g7-${nome}-`));
    const id = await creaChat(cartella);
    const c = { cartella, id, file: fileAttesa(cartella, id), intatta: randomUUID(), rotta: randomUUID() };
    FORME[nome](c);
    if (c.aggiungi) aggiungiAllAttesaSync(cartella, id, [rigaAttesa(c.intatta)]); // la funzione del prodotto, come `mettiInAttesa`
    const esiti = await dueRiavvii(cartella, id);
    const d = righeDiario(cartella, id);
    const n = d.filter((x) => x._attesa === c.intatta).length;
    conti.corse += 1;
    if (esiti.every((e) => e.aperta)) conti.aperta += 1;
    if (n === 1) conti.unaVolta += 1; else if (n === 0) conti.mai += 1; else conti.doppie += 1;
    if (d.filter((x) => x._attesa === c.rotta).length === 1) conti.rottaUnaVolta += 1;
  }
  return conti;
}

test('G7-01 [rev-aff6-3 meta-poi-aggiunta] (RED before) a waiting row cut in half, then a new waiting row: the new one is adopted after a restart, once', async (t) => {
  const c = await forma('meta-poi-aggiunta');
  t.diagnostic(`FORMA meta-poi-aggiunta ${JSON.stringify(c)}`);
  assert.deepEqual(c, { corse, aperta: corse, unaVolta: corse, mai: 0, doppie: 0, rottaUnaVolta: 0 });
});

test('G7-02 [rev-aff6-3 bom] (RED before) a waiting file that starts with a BOM (an outside editor): its first row is still read and adopted, once', async (t) => {
  const c = await forma('bom');
  t.diagnostic(`FORMA bom ${JSON.stringify(c)}`);
  assert.deepEqual(c, { corse, aperta: corse, unaVolta: corse, mai: 0, doppie: 0, rottaUnaVolta: 0 });
});

test('G7-03 [rev-aff6-3] the broken forms that were already green stay green: the chat opens and the whole row is adopted once', async (t) => {
  for (const nome of ['troncato', 'meta-in-mezzo', 'u2028-crudo', 'u2028-sfuggito', 'bom-poi-aggiunta', 'crlf', 'spazzatura', 'adottata-a-meta']) {
    const c = await forma(nome);
    t.diagnostic(`FORMA ${nome} ${JSON.stringify(c)}`);
    assert.deepEqual({ ...c, rottaUnaVolta: 0 }, { corse, aperta: corse, unaVolta: corse, mai: 0, doppie: 0, rottaUnaVolta: 0 }, nome);
  }
});

test('G7-03b (P3-06) an empty line in the middle of the waiting file does not stop the reading: both rows around it are adopted, once each', async (t) => {
  const c = await forma('riga-vuota-in-mezzo');
  t.diagnostic(`FORMA riga-vuota-in-mezzo ${JSON.stringify(c)}`);
  assert.deepEqual(c, { corse, aperta: corse, unaVolta: corse, mai: 0, doppie: 0, rottaUnaVolta: corse });
});

/* una scrittura corta: il disco accetta solo una parte dei byte (come a disco pieno) e `writeSync` lo dice col numero che restituisce */
const corta = (quanti = (n) => Math.floor(n / 2)) => ({ writeSync: (fd, testo) => fsVero.writeSync(fd, testo.slice(0, quanti(testo.length))) });

test('G7-04 [rev-aff6-3 corta] (RED before) a short write of the waiting file is an error, never «written»; the next row is read after a restart', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-corta-'));
  const id = await creaChat(cartella);
  const r1 = randomUUID();
  const r2 = randomUUID();
  assert.throws(() => aggiungiAllAttesaSync(cartella, id, [rigaAttesa(r1)], corta()), (e) => e?.code === 'SESSION_WAITING_SHORT_WRITE', 'a short write throws');
  aggiungiAllAttesaSync(cartella, id, [rigaAttesa(r2)]);
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.id), [r2], 'the row after the short one is whole and read');
  await dueRiavvii(cartella, id);
  assert.equal(righeDiario(cartella, id).filter((x) => x._attesa === r2).length, 1, 'and adopted once after a restart');
});

test('G7-04b the newline is checked before every append: a file that ends without one gets it first, a file that ends with one does not', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-acapo-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000004';
  writeFileSync(fileAttesa(cartella, id), '{"tipo":"attesa","id":"me');
  const a = rigaAttesa(randomUUID());
  aggiungiAllAttesaSync(cartella, id, [a]);
  assert.equal(readFileSync(fileAttesa(cartella, id), 'utf8'), `{"tipo":"attesa","id":"me\n${riga(a)}`, 'the new row starts on its own line');
  const prima = readFileSync(fileAttesa(cartella, id), 'utf8');
  const b = rigaAttesa(randomUUID());
  aggiungiAllAttesaSync(cartella, id, [b]);
  assert.equal(readFileSync(fileAttesa(cartella, id), 'utf8'), prima + riga(b), 'no empty line when the file already ends with one');
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((x) => x.id), [a.id, b.id]);
  const nuovo = 'b7b7b7b7-0000-4000-8000-000000000005';
  aggiungiAllAttesaSync(cartella, nuovo, [a]);
  assert.equal(readFileSync(fileAttesa(cartella, nuovo), 'utf8'), riga(a), 'a new file does not start with an empty line');
});

test('G7-04c (L6-08) a short write that lost only the final newline, retried: the same row is in the file twice and is read once', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-doppia-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000006';
  const a = rigaAttesa(randomUUID());
  assert.throws(() => aggiungiAllAttesaSync(cartella, id, [a], corta((n) => n - 1)), (e) => e?.code === 'SESSION_WAITING_SHORT_WRITE');
  aggiungiAllAttesaSync(cartella, id, [a]); // il ritento
  assert.equal(readFileSync(fileAttesa(cartella, id), 'utf8').split('\n').filter(Boolean).length, 2, 'two copies of the same row on the disk');
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((x) => x.id), [a.id], 'read once');
});

test('G7-04d (P3-04) a reading error that is not «no file» is not an empty file: it is thrown, and the registry says it in the log', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-lettura-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000007';
  const guasto = () => { throw Object.assign(new Error('EACCES: permission denied (test)'), { code: 'EACCES' }); };
  assert.throws(() => leggiAttesa(cartella, id, { readFileSync: guasto }), (e) => e?.code === 'EACCES');
  const nessuno = () => { throw Object.assign(new Error('ENOENT (test)'), { code: 'ENOENT' }); };
  assert.deepEqual(leggiAttesa(cartella, id, { readFileSync: nessuno }).attese, [], 'no file is an empty file');
  /* dal registro: un file di attesa che non si legge lascia una riga nel log; la chat si apre */
  const chat = mkdtempSync(join(tmpdir(), 'g7-lettura-chat-'));
  const sid = await creaChat(chat);
  mkdirSync(fileAttesa(chat, sid)); // una cartella al posto del file: la lettura dà EISDIR, non ENOENT
  const log = [];
  const erroreOriginale = console.error; console.error = (...a) => { log.push(a.map(String).join(' ')); }; t.after(() => { console.error = erroreOriginale; });
  const r = apriRegistro(chat);
  t.after(() => r.chiudi({ attesaMassimaMs: 1000 }).catch(() => {}));
  await r.ripristina();
  assert.equal(Boolean(r.esporta(sid)), true, 'the chat opens');
  assert.ok(log.some((l) => /waiting file of .* not read/u.test(l)), `the log says the waiting file was not read: ${JSON.stringify(log).slice(0, 300)}`);
});

/* ---------------------------------------------------------------------------------------------- due TALOS: il registro con l'affitto */
const affittoDellAltro = (cartella, id, pid) => {
  mkdirSync(join(cartella, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(cartella, CARTELLA_AFFITTI, `${id}.json`), JSON.stringify({ istanza: '99999999-9999-4999-8999-999999999999', pid, host: hostname(), avviatoIl: '2026-11-15T00:00:00.000Z', presoIl: '2026-11-15T00:01:00.000Z', etichetta: 'the other TALOS' }));
};
const pidMorto = () => {
  const r = spawnSync(process.execPath, ['--version']);
  try { process.kill(r.pid, 0); return null; } catch (e) { return e.code === 'ESRCH' ? r.pid : null; }
};

/* il registro con l'affitto fra processi; il giro 2 si può tenere aperto (`stato.tieni`) per la forma mt del revisore 2 */
function registroDi(cartella, stato, extra = {}) {
  return createSessionRegistry({
    cartellaStore: cartella, affittoFraProcessi: { etichetta: 'g7' }, guardaWorkspaceFn: () => () => {}, ritentaCodaAffittataMs: 30,
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      if (!stato) return { ok: true, esito: { detto: 'x', comeFinita: 'concluso' } };
      while (!stato.sessionId) await pausa(5);
      stato.giri += 1;
      const g = stato.giri;
      if (g === 1) stato.onEvento = input.onEvento;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${g}` });
      input.onEvento({ type: 'TextMessageStart', messageId: `m${g}`, role: 'assistant' });
      input.onEvento({ type: 'TextMessageContent', messageId: `m${g}`, delta: `g${g}p0 ` });
      await store.attendiScritture({ cartellaStore: cartella, sessionId: stato.sessionId });
      if (stato.tieni[g]) { stato.dentro[g]?.(); await stato.tieni[g]; } // il modello sta ancora scrivendo
      input.onEvento({ type: 'TextMessageContent', messageId: `m${g}`, delta: `g${g}p1 ` });
      input.onEvento({ type: 'TextMessageEnd', messageId: `m${g}` });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${g}`, outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      stato.fine[g]?.();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Fatto.' }] } };
    },
    ...extra,
  });
}

/* giro 1 qui; questo TALOS lascia la chat; l'altro la prende e la tiene; arriva una riga tardiva dalla chiusura del giro 1 */
async function rigaInAttesa(t, { extra = {}, valore = { id: 'tardivo-1' } } = {}) {
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const erroreOriginale = console.error; const log = []; console.error = (...a) => { log.push(a.map(String).join(' ')); }; t.after(() => { console.error = erroreOriginale; });
  const cartella = mkdtempSync(join(tmpdir(), 'g7a-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'g7al-'));
  store.attivaAffittiArchivio(cartella, { etichetta: 'g7', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(cartella));
  const stato = { sessionId: null, onEvento: null, giri: 0, fine: [], tieni: [], dentro: [] };
  const registro = registroDi(cartella, stato, extra);
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const giro1 = new Promise((ok) => { stato.fine[1] = ok; });
  const { sessionId: id } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const flusso = [];
  registro.iscriviti(id, (e) => flusso.push(e), 0);
  stato.sessionId = id;
  await giro1;
  await registro.attendiAssestamento(id);
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  store.affittiDellArchivio(cartella).rilascia(id);
  affittoDellAltro(cartella, id, process.pid); // l'altro TALOS (vivo) tiene la chat
  await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: valore });
  await pausa(10);
  return { cartella, id, registro, stato, flusso, log };
}

test('G7-05 [rev-aff6-3 corta, registry] (RED before) a short write of the waiting row: the line stays in memory, the retry writes it whole, and a restart finds it', async (t) => {
  let prima = true;
  const aggiungi = (c, s, righe) => {
    if (prima && righe[0]?.tipo === 'attesa') { prima = false; return aggiungiAllAttesaSync(c, s, righe, corta()); }
    return aggiungiAllAttesaSync(c, s, righe);
  };
  const { cartella, id, registro } = await rigaInAttesa(t, { extra: { aggiungiAllAttesaFn: aggiungi } });
  assert.equal(registro.righeInAttesa(id).length, 1, 'the line waits in memory');
  for (let i = 0; i < 100 && leggiAttesa(cartella, id).attese.length === 0; i += 1) await pausa(20);
  assert.equal(leggiAttesa(cartella, id).attese.length, 1, 'the retry wrote the whole waiting row');
  await registro.chiudi({ attesaMassimaMs: 1000 });
  const nuovo = registroDi(cartella, null);
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  assert.equal(nuovo.righeInAttesa(id).length, 1, 'after a restart (the other still holds the chat) the line is still waiting');
  affittoDellAltro(cartella, id, pidMorto());
  for (let i = 0; i < 100 && nuovo.righeInAttesa(id).length > 0; i += 1) await pausa(20);
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  assert.equal(righeDiario(cartella, id).filter((r) => r.value?.id === 'tardivo-1').length, 1, 'adopted once when the chat is free');
});

test('G7-06 [rev-aff6-2 note] (RED before) the two notes are informational (not a turn error): one id, «waiting» then «saved» with the disk number, the same id after a reconnection', async (t) => {
  const { cartella, id, registro, flusso } = await rigaInAttesa(t);
  const secondo = [];
  const via = registro.iscriviti(id, (e) => secondo.push(e), 0); // un ricollegamento
  t.after(via);
  const attese = flusso.map(nota).filter((v) => v?.stato === 'in-attesa');
  const atteseDopo = secondo.map(nota).filter((v) => v?.stato === 'in-attesa');
  assert.equal(attese.length, 1, 'one waiting note');
  assert.equal(atteseDopo.length, 1, 'the reconnection gets the same state');
  assert.equal(atteseDopo[0].id, attese[0].id, 'with the same id: the page draws it once');
  assert.equal(attese[0].messageChiave, 'server.sessionPersistence.lateLineWaiting');
  assert.match(attese[0].message, /^A line that arrived late is waiting to be saved: this chat is open in another TALOS window\./u, 'the English sentence (the CLI and older readers fall back to it)');
  assert.equal(flusso.filter((e) => e?.type === 'RunError').length, 0, 'never a turn error');
  affittoDellAltro(cartella, id, pidMorto());
  for (let i = 0; i < 100 && registro.righeInAttesa(id).length > 0; i += 1) await pausa(20);
  await pausa(50);
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  const salvate = flusso.map(nota).filter((v) => v?.stato === 'adottata');
  const sulDisco = righeDiario(cartella, id).find((r) => r.value?.id === 'tardivo-1')?._sequenza;
  assert.equal(salvate.length, 1, 'one saved note');
  assert.equal(salvate[0].id, attese[0].id, 'for the same line');
  assert.equal(salvate[0].sequenza, sulDisco, 'with the number on the disk');
  assert.equal(salvate[0].messageChiave, 'server.sessionPersistence.lateLineAdded');
  assert.match(salvate[0].message, /^The line that was waiting has been saved/u);
  assert.equal(flusso.filter((e) => e?.type === 'RunError').length, 0, 'never a turn error');
  assert.equal(flusso.filter((e) => nota(e) && Number.isSafeInteger(e._sequenza)).length, 0, 'the notes carry no order number');
});

test('G7-07 [rev-aff6-2 mt] (RED before) a turn starts here while the line waits and the line is adopted mid-turn: the saved note comes only after the turn ends, nothing ends the turn early', async (t) => {
  const { cartella, id, registro, stato, flusso } = await rigaInAttesa(t);
  let libera;
  stato.tieni[2] = new Promise((ok) => { libera = ok; });
  const dentro = new Promise((ok) => { stato.dentro[2] = ok; });
  const giro2 = new Promise((ok) => { stato.fine[2] = ok; });
  affittoDellAltro(cartella, id, pidMorto()); // la chat si libera e la persona scrive qui
  assert.equal(registro.resume(id, 'ancora').erroreAvvio, undefined, 'turn 2 starts');
  await dentro;
  for (let i = 0; i < 150 && registro.righeInAttesa(id).length > 0; i += 1) await pausa(20);
  assert.equal(registro.righeInAttesa(id).length, 0, 'the line was adopted while the model is still writing');
  await pausa(80);
  const finoAdesso = flusso.length;
  assert.equal(flusso.filter((e) => nota(e)?.stato === 'adottata').length, 0, 'no saved note in the middle of the turn');
  assert.equal(flusso.filter((e) => e?.type === 'RunError').length, 0, 'nothing ends the turn early (the Stop stays)');
  libera();
  await giro2;
  await registro.attendiAssestamento(id);
  await pausa(50);
  const fine = flusso.findIndex((e, i) => i >= finoAdesso && e?.type === 'RunFinished' && e.runId === 'r2');
  const salvata = flusso.findIndex((e) => nota(e)?.stato === 'adottata');
  assert.ok(fine >= 0, 'turn 2 ended');
  assert.ok(salvata > fine, `the saved note comes after the end of the turn (${salvata} > ${fine})`);
  assert.equal(flusso.filter((e) => nota(e)?.stato === 'adottata').length, 1, 'once');
  assert.equal(righeDiario(cartella, id).filter((r) => r.value?.id === 'tardivo-1').length, 1, 'the line is on the disk once');
});

test('G7-07b [rev-aff6-2 mt] the same with a second page that opens the chat in the middle of the turn: neither page gets the saved note before the turn ends, both get it once after', async (t) => {
  const { cartella, id, registro, stato, flusso } = await rigaInAttesa(t);
  let libera;
  stato.tieni[2] = new Promise((ok) => { libera = ok; });
  const dentro = new Promise((ok) => { stato.dentro[2] = ok; });
  const giro2 = new Promise((ok) => { stato.fine[2] = ok; });
  affittoDellAltro(cartella, id, pidMorto());
  assert.equal(registro.resume(id, 'ancora').erroreAvvio, undefined, 'turn 2 starts');
  await dentro;
  for (let i = 0; i < 150 && registro.righeInAttesa(id).length > 0; i += 1) await pausa(20);
  assert.equal(registro.righeInAttesa(id).length, 0, 'adopted while the model is still writing');
  const seconda = [];
  const via = registro.iscriviti(id, (e) => seconda.push(e), 0); // un'altra pagina apre la chat a metà giro
  t.after(() => via());
  await pausa(80);
  const salvate = (f) => f.filter((e) => nota(e)?.stato === 'adottata').length;
  assert.equal(salvate(flusso), 0, 'the first page: no saved note in the middle of the turn');
  assert.equal(salvate(seconda), 0, 'the second page: no saved note in the middle of the turn');
  libera();
  await giro2;
  await registro.attendiAssestamento(id);
  await pausa(50);
  assert.equal(salvate(flusso), 1, 'the first page gets it once, after the end');
  assert.equal(salvate(seconda), 1, 'the second page gets it once, after the end');
  assert.ok(seconda.findIndex((e) => nota(e)?.stato === 'adottata') > seconda.findIndex((e) => e?.type === 'RunFinished' && e.runId === 'r2'), 'after the end of the turn');
});

/* ------------------------------------------------------------------------------------------- il peso: migliaia di righe in attesa */
/* le ricerche dentro i cicli si contano: ogni chiamata del predicato di `some`/`find`/`findIndex` mentre il registro riparte e adotta */
function contaRicerche() {
  const originali = { some: Array.prototype.some, find: Array.prototype.find, findIndex: Array.prototype.findIndex };
  const conto = { n: 0 };
  for (const [nome, fn] of Object.entries(originali)) {
    Array.prototype[nome] = function contato(predicato, questo) { return fn.call(this, function conta(...a) { conto.n += 1; return predicato.apply(this, a); }, questo); };
  }
  return { conto, smetti: () => { for (const [nome, fn] of Object.entries(originali)) Array.prototype[nome] = fn; } };
}

async function chatConAttese(n) {
  const cartella = mkdtempSync(join(tmpdir(), `g7-peso-${n}-`));
  const id = await creaChat(cartella);
  const alle = new Date().toISOString();
  const righe = [];
  for (let i = 0; i < n; i += 1) righe.push(riga({ tipo: 'attesa', id: randomUUID(), alle, record: { type: 'CUSTOM', name: 'talos.prova', value: { id: `b-${i}`, testo: 'una riga tardiva di prova con un po di testo dentro' } } }));
  writeFileSync(fileAttesa(cartella, id), righe.join(''));
  return { cartella, id };
}

test('G7-08 [rev-aff6-3 peso, conto] (RED before) the restart and the adoption of 6.000 waiting lines look each line up once: the searches grow with the lines, not with their square', async (t) => {
  const n = 6000; // più di un lotto di adozione (2.000)
  const { cartella, id } = await chatConAttese(n);
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const r = apriRegistro(cartella, { ritentaMs: 1 });
  t.after(() => r.chiudi({ attesaMassimaMs: 2000 }).catch(() => {}));
  const c = contaRicerche();
  try {
    await r.ripristina();
    for (let i = 0; i < 1000 && r.righeInAttesa(id).length > 0; i += 1) await pausa(10);
  } finally { c.smetti(); }
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  t.diagnostic(`RICERCHE ${c.conto.n} per ${n} righe`);
  assert.equal(r.righeInAttesa(id).length, 0, 'all adopted');
  const adottate = righeDiario(cartella, id).filter((x) => typeof x._attesa === 'string');
  assert.equal(adottate.length, n, 'each one in the journal, once (more than one batch of adoption)');
  assert.deepEqual(adottate.map((x) => x.value.id), Array.from({ length: n }, (_, i) => `b-${i}`), 'in the order of the waiting file');
  assert.ok(adottate.every((x, i) => i === 0 || x._sequenza === adottate[i - 1]._sequenza + 1), 'with consecutive numbers across the batches');
  assert.ok(c.conto.n < 20 * n, `searches ${c.conto.n} < ${20 * n}`);
});

test('G7-09 [rev-aff6-3 peso, tempo] (RED before) 50.000 waiting lines: the restart and the adoption take seconds, not tens of seconds, and never block the server for long', { timeout: 120_000 }, async (t) => {
  const n = 50_000;
  const { cartella, id } = await chatConAttese(n);
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const r = apriRegistro(cartella, { ritentaMs: 1 });
  t.after(() => r.chiudi({ attesaMassimaMs: 5000 }).catch(() => {}));
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  const t0 = performance.now();
  await r.ripristina();
  const avvio = performance.now() - t0;
  for (let i = 0; i < 6000 && r.righeInAttesa(id).length > 0; i += 1) await pausa(10);
  const tutto = performance.now() - t0;
  h.disable();
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  const blocco = h.max / 1e6;
  t.diagnostic(`PESO avvio ${Math.round(avvio)} ms, adozione compresa ${Math.round(tutto)} ms, blocco piu lungo ${Math.round(blocco)} ms`);
  assert.equal(r.righeInAttesa(id).length, 0, 'all adopted');
  assert.equal(righeDiario(cartella, id).filter((x) => typeof x._attesa === 'string').length, n, 'each one in the journal, once');
  /* tetti larghi per la coda (la CPU di chi prova non è sotto il 50%): la misura stretta (avvio < 1 s, blocco < 200 ms) è del banco */
  assert.ok(avvio < 3000, `restart ${Math.round(avvio)} ms < 3000`);
  assert.ok(tutto < 8000, `restart and adoption ${Math.round(tutto)} ms < 8000`);
  assert.ok(blocco < 1000, `longest block ${Math.round(blocco)} ms < 1000`);
  assert.equal(existsSync(fileAttesa(cartella, id)), true);
});

/* La ricerca lineare dentro un lotto costa al più LOTTO²/2 confronti (~2 milioni, pochi ms): nessun tempo la vede, il conto sì, a ogni scala */
test('G7-09b [rev-aff6-3 peso, conto] 50.000 waiting lines: the restart and every batch of the adoption look each line up once', { timeout: 120_000 }, async (t) => {
  const n = 50_000;
  const { cartella, id } = await chatConAttese(n);
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const r = apriRegistro(cartella, { ritentaMs: 1 });
  t.after(() => r.chiudi({ attesaMassimaMs: 5000 }).catch(() => {}));
  const c = contaRicerche();
  try {
    await r.ripristina();
    for (let i = 0; i < 6000 && r.righeInAttesa(id).length > 0; i += 1) await pausa(10);
  } finally { c.smetti(); }
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  t.diagnostic(`RICERCHE ${c.conto.n} per ${n} righe`);
  assert.equal(r.righeInAttesa(id).length, 0, 'all adopted');
  assert.ok(c.conto.n < 2 * n, `searches ${c.conto.n} < ${2 * n}`);
});

/* ------------------------------------------------------------- i mutanti vivi dei tre revisori del giro 6 (codice già giusto: solo prove) */
test('G7-10 (L6-01, L6-03) the sentences the server sends are the English source of the dictionary, and the Italian is really Italian', async (t) => {
  const { default: server } = await import('../frontend/src/i18n/testi/server.js');
  const { flusso } = await rigaInAttesa(t);
  const attesa = flusso.map(nota).find((v) => v?.stato === 'in-attesa');
  assert.equal(attesa.message, server.en['sessionPersistence.lateLineWaiting'], 'the English the CLI and older readers fall back to is the dictionary source');
  assert.notEqual(server.it['sessionPersistence.lateLineWaiting'], server.en['sessionPersistence.lateLineWaiting'], 'the Italian is not left in English');
  assert.match(server.it['sessionPersistence.lateLineWaiting'], /^Una riga arrivata in ritardo aspetta di essere salvata/u);
  assert.notEqual(server.it['sessionPersistence.lateLineAdded'], server.en['sessionPersistence.lateLineAdded']);
  assert.match(server.it['sessionPersistence.lateLineAdded'], /^La riga che aspettava è stata salvata/u);
});

test('G7-10b (L6-01) the saved note carries the dictionary English too', async (t) => {
  const { default: server } = await import('../frontend/src/i18n/testi/server.js');
  const { cartella, id, registro, flusso } = await rigaInAttesa(t);
  affittoDellAltro(cartella, id, pidMorto());
  for (let i = 0; i < 100 && registro.righeInAttesa(id).length > 0; i += 1) await pausa(20);
  await pausa(50);
  const attesa = flusso.map(nota).find((v) => v?.stato === 'in-attesa');
  const salvata = flusso.map(nota).find((v) => v?.stato === 'adottata');
  assert.equal(attesa.message, server.en['sessionPersistence.lateLineWaiting']);
  assert.equal(salvata.message, server.en['sessionPersistence.lateLineAdded']);
});

test('G7-03c (L6-12) a raw U+2028 inside a waiting row does not split it: the row is read whole (unit)', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-ls-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000008';
  const a = rigaAttesa(randomUUID(), `uno${LS}due${PS}tre`);
  writeFileSync(fileAttesa(cartella, id), riga(a)); // JSON.stringify lascia U+2028 crudo
  const letto = leggiAttesa(cartella, id);
  assert.deepEqual(letto.attese.map((x) => x.id), [a.id]);
  assert.equal(letto.attese[0].record.value.testo, `uno${LS}due${PS}tre`);
});

test('G7-04e (L6-08) the same waiting row twice (a retried write) is one waiting line, with the first time it arrived (unit)', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-due-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000009';
  const a = { ...rigaAttesa(randomUUID()), alle: '2026-11-15T00:00:00.000Z' };
  const b = rigaAttesa(randomUUID());
  writeFileSync(fileAttesa(cartella, id), riga(a) + riga(b) + riga({ ...a, alle: '2026-11-15T00:00:09.000Z' }));
  const letto = leggiAttesa(cartella, id);
  assert.deepEqual(letto.attese.map((x) => x.id), [a.id, b.id], 'one line each, in the order they first arrived');
  assert.equal(letto.attese[0].alle, '2026-11-15T00:00:00.000Z');
});

test('G7-04f (L6-10) a row marked «adopted» in the waiting file is not waiting any more, even if the journal does not have it (unit and restart)', async (t) => {
  const { righeAncoraInAttesa } = await import('../src/session-attesa.mjs');
  const x = rigaAttesa(randomUUID());
  assert.deepEqual(righeAncoraInAttesa({ attese: [x], adottate: new Set([x.id]) }, new Set()), [], 'unit');
  const cartella = mkdtempSync(join(tmpdir(), 'g7-adottata-'));
  const id = await creaChat(cartella);
  writeFileSync(fileAttesa(cartella, id), riga(x) + riga({ tipo: 'adottata', id: x.id, alle: new Date().toISOString(), sequenza: 99 }));
  const r = apriRegistro(cartella, { ritentaMs: 3_600_000 });
  t.after(() => r.chiudi({ attesaMassimaMs: 1000 }).catch(() => {}));
  await r.ripristina();
  assert.equal(r.righeInAttesa(id).length, 0, 'not waiting after a restart');
  let note = 0;
  const via = r.iscriviti(id, (e) => { if (nota(e)) note += 1; }, 0);
  via();
  assert.equal(note, 0, 'and who opens the chat sees no waiting note');
});

/* R6-03 e R6-11: l'adozione del negozio, a mano */
async function chatConUnaRigaInAttesa(prefisso) {
  const cartella = mkdtempSync(join(tmpdir(), prefisso));
  const id = await creaChat(cartella);
  const a = rigaAttesa(randomUUID());
  aggiungiAllAttesaSync(cartella, id, [a]);
  const max = massimo(cartella, id);
  const adotta = () => store.adottaRigheInAttesaSync({ cartellaStore: cartella, sessionId: id, ids: [a.id], prepara: (ids) => ids.map((x, i) => ({ ...a.record, timestamp: 1, _sequenza: max + 2 + i, _attesa: x })) });
  return { cartella, id, a, max, adotta };
}
const adottateNelFile = (cartella, id) => readFileSync(fileAttesa(cartella, id), 'utf8').split('\n').filter((r) => r.includes('"tipo":"adottata"')).length;

test('G7-12 (R6-03) the adoption is refused while a write of the same chat is in flight: SESSION_STORE_BUSY, nothing written', async () => {
  const { cartella, id, max, adotta } = await chatConUnaRigaInAttesa('g7-volo-');
  const volo = store.registraRiga({ cartellaStore: cartella, sessionId: id, record: { type: 'CUSTOM', name: 'talos.in-volo', _sequenza: max + 1 } });
  assert.throws(adotta, (e) => e?.code === 'SESSION_STORE_BUSY');
  await volo;
  assert.equal(righeDiario(cartella, id).filter((r) => typeof r._attesa === 'string').length, 0, 'nothing adopted');
  assert.equal(adottateNelFile(cartella, id), 0, 'no «adopted» row');
});

test('G7-12b (R6-03) after the write in flight lands, the adoption goes after it: the line in flight first, the adopted line next, once each', async () => {
  const { cartella, id, max, adotta } = await chatConUnaRigaInAttesa('g7-volo2-');
  const volo = store.registraRiga({ cartellaStore: cartella, sessionId: id, record: { type: 'CUSTOM', name: 'talos.in-volo', _sequenza: max + 1 } });
  try { adotta(); } catch { /* occupata: si riprova dopo */ }
  await volo.catch(() => {});
  try { adotta(); } catch { /* già fatta */ }
  const d = righeDiario(cartella, id);
  const iVolo = d.findIndex((r) => r.name === 'talos.in-volo');
  const iAdottata = d.findIndex((r) => typeof r._attesa === 'string');
  assert.equal(d.filter((r) => r.name === 'talos.in-volo').length, 1, 'the line in flight is written once');
  assert.equal(d.filter((r) => typeof r._attesa === 'string').length, 1, 'the waiting line is adopted once');
  assert.ok(iVolo >= 0 && iAdottata > iVolo, `in this order (${iVolo}, ${iAdottata})`);
});

test('G7-13 (R6-11) the adoption needs the lease: with another TALOS holding the chat it is refused (SESSION_LEASED)', async (t) => {
  const { cartella, id, adotta } = await chatConUnaRigaInAttesa('g7-senza-affitto-');
  store.attivaAffittiArchivio(cartella, { etichetta: 'g7', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(cartella));
  affittoDellAltro(cartella, id, process.pid);
  assert.throws(adotta, (e) => e?.code === 'SESSION_LEASED');
});

test('G7-13b (R6-11) refused for the lease: the journal and the waiting file stay as they were', async (t) => {
  const { cartella, id, adotta } = await chatConUnaRigaInAttesa('g7-senza-affitto2-');
  store.attivaAffittiArchivio(cartella, { etichetta: 'g7', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(cartella));
  affittoDellAltro(cartella, id, process.pid);
  const diario = readFileSync(giornale(cartella, id), 'utf8');
  const attesa = readFileSync(fileAttesa(cartella, id), 'utf8');
  try { adotta(); } catch { /* rifiutata */ }
  assert.equal(readFileSync(giornale(cartella, id), 'utf8'), diario, 'the journal is unchanged');
  assert.equal(readFileSync(fileAttesa(cartella, id), 'utf8'), attesa, 'no «adopted» row');
});

/* R6-06: un'adozione che trova le righe già adottate altrove le toglie dall'elenco, e il ritento si ferma */
async function giaAdottataAltrove(t) {
  let chiamate = 0;
  const adotta = (argomenti) => {
    chiamate += 1;
    if (chiamate === 1) aggiungiAllAttesaSync(argomenti.cartellaStore, argomenti.sessionId, argomenti.ids.map((x) => ({ tipo: 'adottata', id: x, alle: new Date().toISOString(), sequenza: null })));
    return store.adottaRigheInAttesaSync(argomenti);
  };
  const c = await rigaInAttesa(t, { extra: { adottaRigheInAttesaFn: adotta } });
  affittoDellAltro(c.cartella, c.id, pidMorto());
  for (let i = 0; i < 100 && chiamate === 0; i += 1) await pausa(20);
  await pausa(300); // una decina di ritenti
  return { ...c, chiamate: () => chiamate };
}

test('G7-14 (R6-06) a line another TALOS already adopted is no longer waiting here', async (t) => {
  const { id, registro } = await giaAdottataAltrove(t);
  assert.equal(registro.righeInAttesa(id).length, 0);
  let note = 0;
  const via = registro.iscriviti(id, (e) => { if (nota(e)?.stato === 'in-attesa') note += 1; }, 0);
  via();
  assert.equal(note, 0, 'who opens the chat sees no waiting note for it');
});

test('G7-14b (R6-06) once the line is found adopted elsewhere the retries stop', async (t) => {
  const { chiamate } = await giaAdottataAltrove(t);
  assert.ok(chiamate() <= 2, `the adoption was tried ${chiamate()} times in 300 ms (retry every 30 ms)`);
});

/* R6-07, L6-06, L6-13: la strada «dopo il numero» (la riga era già mostrata col suo numero quando la scrittura è stata rifiutata) */
async function dopoIlNumero(t, { quante }) {
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const erroreOriginale = console.error; console.error = () => {}; t.after(() => { console.error = erroreOriginale; });
  const cartella = mkdtempSync(join(tmpdir(), 'g7dn-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'g7dnl-'));
  store.attivaAffittiArchivio(cartella, { etichetta: 'g7', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(cartella));
  let rifiuti = 0;
  const rifiuta = async (argomenti, ...resto) => {
    if (argomenti?.record?.name === 'talos.tardivo' && rifiuti < quante) {
      rifiuti += 1;
      await pausa(5); // la scrittura in volo: le altre righe già numerate partono prima che l'altro prenda la chat
      affittoDellAltro(cartella, argomenti.sessionId, process.pid); // l'altro ha preso la chat mentre la scrittura era in coda
      throw Object.assign(new Error('leased (injected by the test)'), { code: 'SESSION_LEASED' });
    }
    return store.registraRiga(argomenti, ...resto);
  };
  const stato = { sessionId: null, onEvento: null, giri: 0, fine: [], tieni: [], dentro: [] };
  const registro = registroDi(cartella, stato, { registraRigaFn: rifiuta });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const giro1 = new Promise((ok) => { stato.fine[1] = ok; });
  const { sessionId: id } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const vivo = [];
  registro.iscriviti(id, (e) => vivo.push(e), 0);
  stato.sessionId = id;
  await giro1;
  await registro.attendiAssestamento(id);
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  /* tutte prima del primo rifiuto: ognuna prende il suo numero, poi la scrittura viene rifiutata (la seconda, in fila, non sa ancora dell'altro) */
  await Promise.all(Array.from({ length: quante }, (_, k) => stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: `tardivo-${k + 1}` } })));
  for (let i = 0; i < 100 && (rifiuti < quante || registro.righeInAttesa(id).length < quante); i += 1) await pausa(10);
  const mostrati = vivo.filter((e) => e?.name === 'talos.tardivo').map((e) => e._sequenza);
  const nuovo = [];
  const via = registro.iscriviti(id, (e) => nuovo.push(e), 0); // chi apre la chat mentre la riga aspetta
  via();
  /* l'altro TALOS scrive coi numeri che la riga mostrata aveva preso (il disco non li ha), poi lascia la chat */
  store.affittiDellArchivio(cartella).rilascia(id);
  let n = massimo(cartella, id);
  appendFileSync(giornale(cartella, id), [1, 2].map((k) => riga({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: `altro-${k}` }, _sequenza: ++n })).join(''));
  affittoDellAltro(cartella, id, pidMorto());
  for (let i = 0; i < 150 && registro.righeInAttesa(id).length > 0; i += 1) await pausa(20);
  await pausa(80);
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  /* la pagina che si ricollega dal suo ultimo numero visto (quello del tardivo mostrato) */
  const ricollegata = [];
  const via2 = registro.iscriviti(id, (e) => ricollegata.push(e), Math.max(...mostrati));
  via2();
  return { id, cartella, registro, vivo, nuovo, ricollegata, mostrati, rifiuti };
}
function controllaDopoIlNumero(c, quante) {
  assert.equal(c.rifiuti, quante, 'refused after the number');
  assert.equal(c.mostrati.length, quante, 'shown live with their numbers');
  assert.equal(c.vivo.filter((e) => nota(e)?.stato === 'in-attesa').length, 0, 'L6-13: no waiting note for a line already shown');
  assert.equal(c.nuovo.filter((e) => nota(e)?.stato === 'in-attesa').length, 0, 'L6-06: who opens the chat gets no waiting note for a line already shown');
  assert.equal(c.ricollegata.filter((e) => e?.name === 'talos.nota-altrove').length, 2, 'R6-07: the reconnecting page gets the other TALOS lines that took the shown numbers');
  assert.equal(c.ricollegata.filter((e) => e?.name === 'talos.tardivo').length, 0, 'R6-07: and not the adopted lines again (already seen with their old numbers)');
  assert.equal(righeDiario(c.cartella, c.id).filter((r) => r.name === 'talos.tardivo').length, quante, 'each one on the disk once');
}

test('G7-15 (R6-07, L6-06, L6-13) a line already shown when its write was refused: no waiting note, and a reconnection from its old number misses nothing and doubles nothing', async (t) => {
  controllaDopoIlNumero(await dopoIlNumero(t, { quante: 1 }), 1);
});

test('G7-15b (R6-07, L6-06, L6-13) as G7-15 with two lines', async (t) => {
  controllaDopoIlNumero(await dopoIlNumero(t, { quante: 2 }), 2);
});

/* R6-09: il ritento che scatta mentre la chat si ricarica (la voce manca un attimo) non si perde, anche se la ricarica fallisce */
async function ritentoDuranteLaRicarica(t) {
  let blocca = null;
  let ricariche = 0;
  const elenca = async (argomenti) => {
    if (blocca) { ricariche += 1; await blocca; throw Object.assign(new Error('reload read failed (test)'), { code: 'EIO' }); }
    return store.elencaSessioniPersistite(argomenti);
  };
  const c = await rigaInAttesa(t, { extra: { elencaSessioniPersistiteFn: elenca } });
  let sblocca;
  blocca = new Promise((ok) => { sblocca = ok; });
  /* l'altro ha scritto: la persona apre la chat qui e la chat si ricarica (la voce esce dal registro finché la ricarica dura) */
  appendFileSync(giornale(c.cartella, c.id), riga({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: 'altro-1' }, _sequenza: massimo(c.cartella, c.id) + 1 }));
  const apertura = c.registro.allineaSessione(c.id, { scrivere: false }).catch(() => null);
  await pausa(200); // qualche ritento scatta adesso, con la voce fuori dal registro
  blocca = null;
  sblocca();
  await apertura;
  affittoDellAltro(c.cartella, c.id, pidMorto()); // la chat si libera
  for (let i = 0; i < 100 && c.registro.righeInAttesa(c.id).length > 0; i += 1) await pausa(20);
  await store.attendiScritture({ cartellaStore: c.cartella, sessionId: c.id });
  return { ...c, ricariche };
}

test('G7-16 (R6-09) a retry that fires while the chat reloads is not lost when the reload fails: the line is adopted once the chat is free', async (t) => {
  const c = await ritentoDuranteLaRicarica(t);
  assert.ok(c.ricariche >= 1, 'the reload really ran');
  assert.equal(c.registro.righeInAttesa(c.id).length, 0, 'nothing left waiting');
  assert.equal(righeDiario(c.cartella, c.id).filter((r) => r.value?.id === 'tardivo-1').length, 1, 'adopted once');
});

test('G7-16b (R6-09) the same, and the saved note reaches who listens', async (t) => {
  const c = await ritentoDuranteLaRicarica(t);
  await pausa(50);
  assert.equal(c.flusso.filter((e) => nota(e)?.stato === 'adottata').length, 1, 'one saved note');
});

/* --------------------------------------- seconde prove per i mutanti del settimo giro che una prova sola uccideva (ognuno da almeno due) */
test('G7-03d (P3-06) an empty line in the middle of the waiting file: the reading goes on, the rows before and after it are both read (unit)', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-vuota-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000010';
  const a = rigaAttesa(randomUUID());
  const b = rigaAttesa(randomUUID());
  const c = rigaAttesa(randomUUID());
  writeFileSync(fileAttesa(cartella, id), `${riga(a)}\n${riga(b)}\n\n\n${riga(c)}`);
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((x) => x.id), [a.id, b.id, c.id]);
});

test('G7-04g (P3-04) a waiting file that is busy or forbidden (antivirus, permissions) is thrown as it is, never read as an empty file (unit)', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-occupato-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000011';
  for (const code of ['EBUSY', 'EPERM', 'EMFILE']) {
    const guasto = () => { throw Object.assign(new Error(`${code} (test)`), { code }); };
    assert.throws(() => leggiAttesa(cartella, id, { readFileSync: guasto }), (e) => e?.code === code, code);
  }
});

test('G7-04h (L6-10) two waiting rows, the first marked «adopted» in the file and missing from the journal: after a restart only the second one waits', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-adottata-2-'));
  const id = await creaChat(cartella);
  const x = rigaAttesa(randomUUID());
  const y = rigaAttesa(randomUUID());
  writeFileSync(fileAttesa(cartella, id), riga(x) + riga(y) + riga({ tipo: 'adottata', id: x.id, alle: new Date().toISOString(), sequenza: 99 }));
  const r = apriRegistro(cartella, { ritentaMs: 3_600_000 });
  t.after(() => r.chiudi({ attesaMassimaMs: 1000 }).catch(() => {}));
  await r.ripristina();
  assert.deepEqual(r.righeInAttesa(id).map((a) => a.id ?? a), [y.id], 'only the row that was never adopted');
});

test('G7-04i (X6) the newline check reads the LAST byte: a file that starts with a newline and ends cut still gets the newline before the new row', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-acapo-2-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000012';
  writeFileSync(fileAttesa(cartella, id), '\n{"tipo":"attesa","id":"me');
  const a = rigaAttesa(randomUUID());
  aggiungiAllAttesaSync(cartella, id, [a]);
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((x) => x.id), [a.id], 'the new row is whole and read');
  const sano = 'b7b7b7b7-0000-4000-8000-000000000013';
  const b = rigaAttesa(randomUUID());
  const c = rigaAttesa(randomUUID());
  aggiungiAllAttesaSync(cartella, sano, [b]);
  aggiungiAllAttesaSync(cartella, sano, [c]);
  assert.equal(readFileSync(fileAttesa(cartella, sano), 'utf8'), riga(b) + riga(c), 'a well-formed file gets exactly the bytes of its rows, no empty line');
});

test('G7-05b (X1, X2) a waiting write that fails outright (disk error): the line stays in memory and the next retry writes it into the file while the other TALOS still holds the chat', async (t) => {
  let prima = true;
  const aggiungi = (c, s, righe) => {
    if (prima && righe[0]?.tipo === 'attesa') { prima = false; throw Object.assign(new Error('EIO: i/o error (test)'), { code: 'EIO' }); }
    return aggiungiAllAttesaSync(c, s, righe);
  };
  const { cartella, id, registro, log } = await rigaInAttesa(t, { extra: { aggiungiAllAttesaFn: aggiungi } });
  assert.equal(prima, false, 'premise: the first waiting write failed');
  assert.ok(log.some((l) => /waiting file NOT written/u.test(l)), 'the log says it');
  assert.equal(registro.righeInAttesa(id).length, 1, 'the line waits in memory');
  for (let i = 0; i < 100 && leggiAttesa(cartella, id).attese.length === 0; i += 1) await pausa(20);
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.record?.value?.id), ['tardivo-1'], 'the retry wrote it into the file, once');
});

const TESTO_LUNGO = 'perché è già così — 🙂 città';
test('G7-05c (X8) a waiting row with accents and an emoji is written whole: the bytes are counted as bytes, not as characters (unit)', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g7-byte-'));
  const id = 'b7b7b7b7-0000-4000-8000-000000000014';
  const a = rigaAttesa(randomUUID(), TESTO_LUNGO);
  assert.equal(aggiungiAllAttesaSync(cartella, id, [a]), Buffer.byteLength(riga(a), 'utf8'), 'the bytes written');
  assert.equal(leggiAttesa(cartella, id).attese[0]?.record.value.testo, TESTO_LUNGO);
  assert.throws(() => aggiungiAllAttesaSync(cartella, id, [rigaAttesa(randomUUID(), TESTO_LUNGO)], { writeSync: (fd, testo) => fsVero.writeSync(fd, Buffer.from(testo, 'utf8').subarray(0, testo.length)) }),
    (e) => e?.code === 'SESSION_WAITING_SHORT_WRITE', 'a write that took as many bytes as there are characters is still short');
});

test('G7-05d (X8) a late line with accents and an emoji goes into the waiting file at the first try, with no error in the log', async (t) => {
  const { cartella, id, log } = await rigaInAttesa(t, { valore: { id: 'tardivo-1', testo: TESTO_LUNGO } });
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.record?.value?.testo), [TESTO_LUNGO], 'in the file');
  assert.ok(!log.some((l) => /NOT written/u.test(l)), `no write error: ${JSON.stringify(log).slice(0, 300)}`);
});

/* X7: i lotti si vedono dalle chiamate allo store, non dal tempo (il tempo è del banco) */
async function adozioneContata(t, n) {
  const { cartella, id } = await chatConAttese(n);
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const chiamate = [];
  let ultimoGiro = null;
  const adotta = (argomenti) => {
    chiamate.push({ ids: argomenti.ids.length, ilServerHaRisposto: ultimoGiro === null ? null : ultimoGiro.fatto });
    const giro = { fatto: false };
    ultimoGiro = giro;
    setImmediate(() => { giro.fatto = true; });
    return store.adottaRigheInAttesaSync(argomenti);
  };
  const r = apriRegistro(cartella, { ritentaMs: 1, extra: { adottaRigheInAttesaFn: adotta } });
  t.after(() => r.chiudi({ attesaMassimaMs: 3000 }).catch(() => {}));
  await r.ripristina();
  for (let i = 0; i < 2000 && r.righeInAttesa(id).length > 0; i += 1) await pausa(10);
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  assert.equal(r.righeInAttesa(id).length, 0, 'all adopted');
  assert.equal(righeDiario(cartella, id).filter((x) => typeof x._attesa === 'string').length, n, 'each one in the journal, once');
  return chiamate;
}

test('G7-09c (X7) 4.500 waiting lines are adopted in batches of at most 2.000, never all in one call', { timeout: 60_000 }, async (t) => {
  const chiamate = await adozioneContata(t, 4500);
  t.diagnostic(`LOTTI ${JSON.stringify(chiamate.map((c) => c.ids))}`);
  assert.ok(chiamate.length >= 3, `at least three batches: ${chiamate.length}`);
  assert.ok(chiamate.every((c) => c.ids <= 2000), 'none bigger than 2.000');
});

test('G7-09d (X7) between two batches of the adoption the server answers: the event loop turns before the next batch', { timeout: 60_000 }, async (t) => {
  const chiamate = await adozioneContata(t, 4500);
  assert.ok(chiamate.length >= 2, `more than one batch: ${chiamate.length}`);
  assert.ok(chiamate.slice(1).every((c) => c.ilServerHaRisposto === true), JSON.stringify(chiamate));
});
