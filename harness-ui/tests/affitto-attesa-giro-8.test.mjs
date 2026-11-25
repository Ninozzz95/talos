import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import * as store from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { CARTELLA_AFFITTI } from '../src/session-lease.mjs';
import { aggiungiAllAttesaSync, leggiAttesa } from '../src/session-attesa.mjs';
import testiServer from '../frontend/src/i18n/testi/server.js';

/*
 * 21/11/2026 — OTTAVO GIRO DEL SALVATAGGIO DELLE CHAT (candidata PC 0.2.5; i tre punti aperti del giro 7, revisori 1, 2 e 3 del 15/11).
 *   · Difetto 1 (revisore 1, ROSSO): la riga di attesa non scritta (disco pieno), l'altro TALOS lascia la chat, la persona la elimina prima
 *     del ritento ⇒ il ritento ricreava `<id>.attesa` col testo della chat eliminata, per sempre senza diario (60 su 60). E la nota diceva
 *     «It is kept on this computer» anche quando il disco non l'aveva presa; una chiusura normale entro il ritento la perdeva in silenzio.
 *   · Difetto 2 (revisore 3, GIALLO): ogni lotto dell'adozione rileggeva e rianalizzava TUTTO il file di attesa (`leggiAttesa`), e
 *     `tutte.filter` girava su tutta la lista: lavoro quadratico, blocco del server 257-949 ms a 50.000 righe.
 *   · Difetto 3, parte del server (revisore 2, GIALLO): la nota «salvata» diceva «ora è in fondo a questa chat» mentre la riga, un testo
 *     tardivo del giro prima, si disegna nel SUO messaggio più in alto (mt, falsa 28 su 30).
 *   Solo cartelle del TEMP finto; il disco pieno è SIMULATO (`aggiungiAllAttesaFn` lancia ENOSPC), mai riempito davvero.
 */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const riga = (o) => `${JSON.stringify(o)}\n`;
const giornale = (cartella, id) => join(cartella, `${id}.jsonl`);
const fileAttesa = (cartella, id) => join(cartella, `${id}.attesa`);
const righeDiario = (cartella, id) => readFileSync(giornale(cartella, id), 'utf8').split('\n').filter(Boolean).map((t) => { try { return JSON.parse(t); } catch { return { rotta: true }; } });
const NOME_NOTA = 'talos.riga-in-attesa';
const nota = (e) => (e?.type === 'CUSTOM' && e.name === NOME_NOTA ? e.value ?? {} : null);
const pieno = () => Object.assign(new Error('ENOSPC: no space left on device, write (test)'), { code: 'ENOSPC' });

const affittoDellAltro = (cartella, id, pid) => {
  mkdirSync(join(cartella, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(cartella, CARTELLA_AFFITTI, `${id}.json`), JSON.stringify({ istanza: '99999999-9999-4999-8999-999999999999', pid, host: hostname(), avviatoIl: '2026-11-21T00:00:00.000Z', presoIl: '2026-11-21T00:01:00.000Z', etichetta: 'the other TALOS' }));
};
const pidMorto = () => {
  const r = spawnSync(process.execPath, ['--version']);
  try { process.kill(r.pid, 0); return null; } catch (e) { return e.code === 'ESRCH' ? r.pid : null; }
};

function registroDi(cartella, stato, extra = {}) {
  return createSessionRegistry({
    cartellaStore: cartella, affittoFraProcessi: { etichetta: 'g8' }, guardaWorkspaceFn: () => () => {}, ritentaCodaAffittataMs: 30,
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
      input.onEvento({ type: 'TextMessageEnd', messageId: `m${g}` });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${g}`, outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      stato.fine[g]?.();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Fatto.' }] } };
    },
    ...extra,
  });
}

/* giro 1 qui; questo TALOS lascia la chat; l'altro (vivo) la prende; arriva una riga tardiva del giro 1 */
async function rigaInAttesa(t, { extra = {}, valore = { id: 'tardivo-1' } } = {}) {
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const erroreOriginale = console.error; const log = []; console.error = (...a) => { log.push(a.map(String).join(' ')); }; t.after(() => { console.error = erroreOriginale; });
  const cartella = mkdtempSync(join(tmpdir(), 'g8a-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'g8al-'));
  store.attivaAffittiArchivio(cartella, { etichetta: 'g8', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(cartella));
  const stato = { sessionId: null, onEvento: null, giri: 0, fine: [] };
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
  affittoDellAltro(cartella, id, process.pid);
  await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: valore });
  await pausa(10);
  return { cartella, id, registro, stato, flusso, log };
}
/* il disco «pieno» per il file di attesa finché `disco.pieno` è vero (solo le righe «attesa»: è la riga tardiva che non entra) */
function discoSpiato() {
  const disco = { pieno: true, rifiutate: 0, scritte: 0 };
  disco.aggiungi = (c, s, righe) => {
    if (disco.pieno && righe[0]?.tipo === 'attesa') { disco.rifiutate += 1; throw pieno(); }
    disco.scritte += 1;
    return aggiungiAllAttesaSync(c, s, righe);
  };
  return disco;
}

/* ------------------------------------------------------------------------------------------------ difetto 1: disco pieno */
test('G8-01 [rev-aff7-1 orfano] (RED before) the waiting line the disk refused, the other TALOS lets the chat go, the person DELETES it: no waiting file is ever recreated with the deleted text', async (t) => {
  const disco = discoSpiato();
  const { cartella, id, registro } = await rigaInAttesa(t, { extra: { aggiungiAllAttesaFn: disco.aggiungi, ritentaCodaAffittataMs: 250 } });
  assert.ok(disco.rifiutate >= 1, 'premise: the disk refused the waiting row');
  assert.equal(existsSync(fileAttesa(cartella, id)), false, 'premise: no waiting file yet');
  affittoDellAltro(cartella, id, pidMorto()); // l'altro TALOS se ne va
  const eliminata = await registro.elimina(id);
  assert.equal(eliminata?.ok, true, `the person deleted the chat: ${JSON.stringify(eliminata)}`);
  disco.pieno = false; // il disco si libera
  await pausa(800); // tre ritenti
  assert.equal(existsSync(fileAttesa(cartella, id)), false, 'no waiting file for a deleted chat');
  assert.equal(existsSync(giornale(cartella, id)), false, 'the journal is gone too');
  assert.deepEqual(registro.righeInAttesa(id), [], 'nothing waits for a deleted chat');
});

test('G8-01e the retry that comes WHILE the deletion is still on the disk does not write the waiting file of the chat being deleted', async (t) => {
  const disco = discoSpiato();
  let apri; const cancello = new Promise((ok) => { apri = ok; });
  let dentro = false;
  const eliminaLenta = async (args) => { dentro = true; await cancello; return store.eliminaSessionePersistita(args); };
  const { cartella, id, registro } = await rigaInAttesa(t, { extra: { aggiungiAllAttesaFn: disco.aggiungi, ritentaCodaAffittataMs: 30, eliminaSessionePersistitaFn: eliminaLenta } });
  assert.ok(disco.rifiutate >= 1, 'premise: the disk refused the waiting row');
  affittoDellAltro(cartella, id, pidMorto());
  const eliminata = registro.elimina(id);
  for (let i = 0; i < 100 && !dentro; i += 1) await pausa(5);
  assert.ok(dentro, 'premise: the deletion is on the disk');
  disco.pieno = false; // il disco si libera mentre la cancellazione è in corso: i ritenti vengono adesso
  const scritteDentro = disco.scritte;
  await pausa(300);
  assert.equal(disco.scritte, scritteDentro, 'no waiting row written for the chat being deleted');
  apri();
  assert.equal((await eliminata)?.ok, true);
  await pausa(200);
  assert.equal(existsSync(fileAttesa(cartella, id)), false, 'no waiting file for a deleted chat');
});

test('G8-01b (RED before) the disk refuses the waiting row: the note SAYS it is not on the disk yet (EN and IT); once the retry writes it, the same note says it is kept on this computer', async (t) => {
  const disco = discoSpiato();
  const { cartella, id, flusso } = await rigaInAttesa(t, { extra: { aggiungiAllAttesaFn: disco.aggiungi } });
  const prima = flusso.map(nota).filter(Boolean);
  assert.equal(prima.length, 1, 'one note');
  assert.equal(prima[0].stato, 'in-attesa');
  assert.equal(prima[0].messageChiave, 'server.sessionPersistence.lateLineWaitingNotOnDisk', `the note says the disk did not take it: ${JSON.stringify(prima[0])}`);
  assert.equal(prima[0].message, testiServer.en['sessionPersistence.lateLineWaitingNotOnDisk'], 'the English of the dictionary');
  assert.doesNotMatch(prima[0].message, /kept on this computer/u, 'never «kept on this computer» while it is not');
  assert.match(testiServer.it['sessionPersistence.lateLineWaitingNotOnDisk'] ?? '', /disco/u, 'the Italian says it too');
  disco.pieno = false;
  for (let i = 0; i < 100 && leggiAttesa(cartella, id).attese.length === 0; i += 1) await pausa(20);
  assert.equal(leggiAttesa(cartella, id).attese.length, 1, 'the retry wrote it');
  for (let i = 0; i < 50 && flusso.map(nota).filter(Boolean).length < 2; i += 1) await pausa(10);
  const dopo = flusso.map(nota).filter(Boolean);
  assert.equal(dopo.length, 2, 'one more note, for the same line');
  assert.equal(dopo[1].id, prima[0].id, 'the same id: the page changes the same note');
  assert.equal(dopo[1].stato, 'in-attesa');
  assert.equal(dopo[1].messageChiave, 'server.sessionPersistence.lateLineWaiting', 'now it is kept on this computer');
});

test('G8-01c (RED before) a normal close right after the disk refused the waiting row: the close tries once more and the line is on the disk after the restart', async (t) => {
  const disco = discoSpiato();
  const { cartella, id, registro } = await rigaInAttesa(t, { extra: { aggiungiAllAttesaFn: disco.aggiungi, ritentaCodaAffittataMs: 60_000 } });
  assert.ok(disco.rifiutate >= 1, 'premise: the disk refused the waiting row');
  disco.pieno = false; // il disco si libera prima della chiusura, ma il ritento non è ancora venuto
  await registro.chiudi({ attesaMassimaMs: 1000 });
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.record?.value?.id), ['tardivo-1'], 'the close wrote the waiting row');
  const nuovo = registroDi(cartella, null);
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  affittoDellAltro(cartella, id, pidMorto());
  for (let i = 0; i < 100 && nuovo.righeInAttesa(id).length > 0; i += 1) await pausa(20);
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  assert.equal(righeDiario(cartella, id).filter((r) => r.value?.id === 'tardivo-1').length, 1, 'adopted once after the restart');
});

test('G8-01d a close while the disk still refuses: the log says the line is lost, never «kept»', async (t) => {
  const disco = discoSpiato();
  const { registro, log } = await rigaInAttesa(t, { extra: { aggiungiAllAttesaFn: disco.aggiungi, ritentaCodaAffittataMs: 60_000 } });
  await registro.chiudi({ attesaMassimaMs: 1000 });
  assert.ok(log.some((l) => /waiting line .* LOST at close/u.test(l)), `the log says it: ${JSON.stringify(log).slice(0, 400)}`);
});

/* ------------------------------------------------------------------------------------------- difetto 2: il conto a 20.000 righe */
function apriRegistro(cartellaStore) {
  return createSessionRegistry({
    cartellaStore, guardaWorkspaceFn: () => () => {}, ritentaCodaAffittataMs: 1,
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'finto', chiave: 'finta',
    avviaSessioneFn: async (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r-1' });
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r-1', outcome: { type: 'success' }, result: { detto: 'ok' } });
      return { ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } };
    },
  });
}
async function chatConAttese(n) {
  const cartella = mkdtempSync(join(tmpdir(), `g8-peso-${n}-`));
  const r = apriRegistro(cartella);
  const { sessionId: id } = r.avviaLibero({ cartellaLibera: mkdtempSync(join(tmpdir(), 'g8l-')), consegna: 'ciao', permessi: 'Full access' });
  await r.attendiAssestamento(id);
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  await r.chiudi({ attesaMassimaMs: 2000 }).catch(() => {});
  const alle = new Date().toISOString();
  const righe = [];
  for (let i = 0; i < n; i += 1) righe.push(riga({ tipo: 'attesa', id: randomUUID(), alle, record: { type: 'CUSTOM', name: 'talos.prova', value: { id: `b-${i}`, testo: 'una riga tardiva di prova con un po di testo dentro' } } }));
  writeFileSync(fileAttesa(cartella, id), righe.join(''));
  return { cartella, id };
}
/* si contano le analisi JSON e i predicati di `filter` mentre il registro riparte e adotta tutto */
async function contaAdozione(t, n) {
  const { cartella, id } = await chatConAttese(n);
  const avvisoOriginale = console.warn; console.warn = () => {}; t.after(() => { console.warn = avvisoOriginale; });
  const r = apriRegistro(cartella);
  t.after(() => r.chiudi({ attesaMassimaMs: 5000 }).catch(() => {}));
  const parse = JSON.parse;
  const filtra = Array.prototype.filter;
  const conto = { parse: 0, filter: 0 };
  JSON.parse = function contato(...a) { conto.parse += 1; return parse.apply(this, a); };
  Array.prototype.filter = function contato(predicato, questo) { return filtra.call(this, function conta(...a) { conto.filter += 1; return predicato.apply(this, a); }, questo); };
  try {
    await r.ripristina();
    for (let i = 0; i < 6000 && r.righeInAttesa(id).length > 0; i += 1) await pausa(5);
  } finally { JSON.parse = parse; Array.prototype.filter = filtra; }
  await store.attendiScritture({ cartellaStore: cartella, sessionId: id });
  assert.equal(r.righeInAttesa(id).length, 0, 'all adopted');
  assert.equal(righeDiario(cartella, id).filter((x) => typeof x._attesa === 'string').length, n, 'each one in the journal, once');
  return conto;
}

/* una sola corsa per scala (10.000 e 20.000): il conto assoluto a 20.000 (G8-02) e la crescita (G8-02b) vengono dalle stesse misure,
   così la coda non adotta 50.000 righe in più accanto alle altre prove (DUE-PROCESSI-01 di affitto-archivio ne soffriva) */
let misure = null;
const misura = async (t) => { misure ??= { a: await contaAdozione(t, 10_000), b: await contaAdozione(t, 20_000) }; return misure; };

test('G8-02 [rev-aff7-3 conto] (RED before) 20.000 waiting lines: the restart and the whole adoption parse each waiting row a bounded number of times, not once per batch', { timeout: 180_000 }, async (t) => {
  const n = 20_000;
  const conto = (await misura(t)).b;
  t.diagnostic(`CONTO ${n}: JSON.parse ${conto.parse}, predicati di filter ${conto.filter}`);
  assert.ok(conto.parse < 3 * n, `JSON.parse ${conto.parse} < ${3 * n} (before: about 1,5·N²/2000 = ${1.5 * n * n / 2000})`);
  assert.ok(conto.filter < 8 * n, `filter predicates ${conto.filter} < ${8 * n} (before: about 10,5·N)`);
});

test('G8-02b the count grows with the lines, not with their square: 10.000 → 20.000 lines at most ×2,5', { timeout: 180_000 }, async (t) => {
  const { a, b } = await misura(t);
  t.diagnostic(`CONTO 10.000 parse ${a.parse} filter ${a.filter} · 20.000 parse ${b.parse} filter ${b.filter}`);
  assert.ok(b.parse / a.parse < 2.5, `parse ×${(b.parse / a.parse).toFixed(2)} < 2,5`);
  assert.ok(b.filter / a.filter < 2.5, `filter ×${(b.filter / a.filter).toFixed(2)} < 2,5`);
});

/* la lettura incrementale (unità): un file riscritto da fuori si rilegge da capo; una riga in fondo senza a capo si legge ma non si ricorda */
const rigaA = (id) => riga({ tipo: 'attesa', id, alle: '2026-11-21T00:00:00.000Z', record: { type: 'CUSTOM', name: 'talos.prova', value: { id } } });
test('G8-02c a waiting file rewritten from outside under the same name (bigger): the next read sees the new rows, not the old ones plus a piece', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g8-risc-'));
  const id = randomUUID();
  writeFileSync(fileAttesa(cartella, id), rigaA('vecchia-1') + rigaA('vecchia-2'));
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.id), ['vecchia-1', 'vecchia-2']);
  writeFileSync(fileAttesa(cartella, id), rigaA('nuova-1') + rigaA('nuova-2') + rigaA('nuova-3'));
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.id), ['nuova-1', 'nuova-2', 'nuova-3']);
});
test('G8-02d the last row without its newline is read, and read once more after the newline and the next rows arrive', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g8-coda-'));
  const id = randomUUID();
  writeFileSync(fileAttesa(cartella, id), rigaA('r-1') + rigaA('r-2').trimEnd());
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.id), ['r-1', 'r-2'], 'the row without newline counts');
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.id), ['r-1', 'r-2'], 'twice, the same');
  aggiungiAllAttesaSync(cartella, id, [{ tipo: 'attesa', id: 'r-3', alle: '2026-11-21T00:00:01.000Z', record: { type: 'CUSTOM', name: 'talos.prova', value: { id: 'r-3' } } }, { tipo: 'adottata', id: 'r-1', alle: '2026-11-21T00:00:02.000Z', sequenza: 9 }]);
  const letto = leggiAttesa(cartella, id);
  assert.deepEqual(letto.attese.map((a) => a.id), ['r-1', 'r-2', 'r-3'], 'the newline added before the append closes r-2; r-3 after it');
  assert.deepEqual([...letto.adottate], ['r-1']);
});
test('G8-02e a half row at the end, then a whole row: the half stays a broken row, the whole one is read (incremental, two reads)', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g8-meta-'));
  const id = randomUUID();
  const meta = rigaA('rotta');
  writeFileSync(fileAttesa(cartella, id), rigaA('a-1') + meta.slice(0, Math.floor(meta.length / 2)));
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.id), ['a-1']);
  aggiungiAllAttesaSync(cartella, id, [{ tipo: 'attesa', id: 'a-2', alle: '2026-11-21T00:00:01.000Z', record: { type: 'CUSTOM', name: 'talos.prova', value: { id: 'a-2' } } }]);
  assert.deepEqual(leggiAttesa(cartella, id).attese.map((a) => a.id), ['a-1', 'a-2']);
});

test('G8-02f the rare pruning drops only the adopted rows: 1.500 waiting, 1.100 adopted ⇒ exactly the other 400 still wait, read after read', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g8-pota-'));
  const id = randomUUID();
  let testo = '';
  for (let i = 0; i < 1500; i += 1) testo += rigaA(`p-${i}`);
  for (let i = 0; i < 1100; i += 1) testo += riga({ tipo: 'adottata', id: `p-${i}`, alle: '2026-11-21T00:00:02.000Z', sequenza: i });
  writeFileSync(fileAttesa(cartella, id), testo);
  const attese = () => { const l = leggiAttesa(cartella, id); return l.attese.filter((a) => !l.adottate.has(a.id)).map((a) => a.id); };
  const atteso = Array.from({ length: 400 }, (_, k) => `p-${1100 + k}`);
  assert.deepEqual(attese(), atteso, 'first read (the pruning runs: 1.100 ≥ 1.024)');
  assert.deepEqual(attese(), atteso, 'second read, from memory');
  aggiungiAllAttesaSync(cartella, id, [{ tipo: 'adottata', id: 'p-1100', alle: '2026-11-21T00:00:03.000Z', sequenza: 2000 }]);
  assert.deepEqual(attese(), atteso.slice(1), 'one more adopted');
});
test('G8-02g a row without its newline at the end does not make the next read start over: the second read parses at most that row again', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'g8-noacapo-'));
  const id = randomUUID();
  let testo = '';
  for (let i = 0; i < 500; i += 1) testo += rigaA(`q-${i}`);
  writeFileSync(fileAttesa(cartella, id), testo + rigaA('q-coda').trimEnd());
  assert.equal(leggiAttesa(cartella, id).attese.length, 501);
  const parse = JSON.parse;
  let conto = 0;
  JSON.parse = function contato(...a) { conto += 1; return parse.apply(this, a); };
  let seconda;
  try { seconda = leggiAttesa(cartella, id); } finally { JSON.parse = parse; }
  assert.equal(seconda.attese.length, 501);
  assert.ok(conto <= 1, `second read parsed ${conto} rows (before the fix of the tail, a full reread: 501)`);
});

/* ----------------------------------------------------------------------------------- difetto 3, server: la «salvata» non mente */
test('G8-03 [rev-aff7-2 mt] (RED before) the saved note never says WHERE the line is (it is drawn in its own message, not always at the end): EN and IT', () => {
  assert.ok(testiServer.en['sessionPersistence.lateLineAdded'], 'the key is in the dictionary');
  for (const [lingua, frase] of [['en', testiServer.en['sessionPersistence.lateLineAdded']], ['it', testiServer.it['sessionPersistence.lateLineAdded']]]) {
    assert.doesNotMatch(frase, /\bend\b|in fondo|at the bottom/iu, `${lingua}: no place promised: ${frase}`);
  }
});

test('G8-03b (RED before) 30 adoptions of a late line: the saved note the server sends is the dictionary English, and none says «at the end»', async (t) => {
  let false_ = 0;
  for (let k = 0; k < 30; k += 1) {
    const { cartella, id, flusso } = await rigaInAttesa(t, { valore: { id: `tardivo-${k}` } });
    affittoDellAltro(cartella, id, pidMorto());
    for (let i = 0; i < 100 && !flusso.some((e) => nota(e)?.stato === 'adottata'); i += 1) await pausa(10);
    const salvata = flusso.map(nota).find((v) => v?.stato === 'adottata');
    assert.ok(salvata, `run ${k}: the saved note came`);
    assert.equal(salvata.message, testiServer.en['sessionPersistence.lateLineAdded'], 'the dictionary English');
    if (/\bend\b/iu.test(salvata.message)) false_ += 1;
  }
  assert.equal(false_, 0, `saved notes that promise «at the end»: ${false_} of 30`);
});
