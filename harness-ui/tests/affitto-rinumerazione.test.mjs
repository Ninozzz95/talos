import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { CARTELLA_AFFITTI } from '../src/session-lease.mjs';
import * as store from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⭐ 13/11/2026 — PEZZO 4 della cura dell'affitto compromesso: LA RINUMERAZIONE dei giornali già sporchi (regola approvata dal giudice
 *   v1779, `in-corso/REGOLA-RINUMERAZIONE-AFFITTO-COMPROMESSO-2026-11-12.md`). Fino al primo numero d'ordine GIÀ VISTO niente cambia;
 *   dal primo doppio ogni riga numerata prende il più alto visto fin lì più uno, nell'ordine del disco; le righe senza numero restano.
 *   La fa il ripristino con l'affitto in mano: copia accanto in creazione esclusiva, stessa dimensione e stessa SHA-256, temporaneo con
 *   flush e fsync, rename. Ogni errore ⇒ il giornale di prima, la copia intatta, la chat letta com'è.
 *   Solo giornali FINTI, in cartelle temporanee del profilo finto.
 */

const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-rin-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const giornale = (dir, id) => join(dir, `${id}.jsonl`);
const sha = (percorso) => createHash('sha256').update(readFileSync(percorso)).digest('hex');
const righe = (percorso) => readFileSync(percorso, 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
const numeriSulDisco = (percorso) => righe(percorso).map((r) => r._sequenza).filter((n) => typeof n === 'number');
const copieAccanto = (dir) => readdirSync(dir).filter((f) => f.includes('.prima-della-rinumerazione-'));
const temporanei = (dir) => readdirSync(dir).filter((f) => f.endsWith('.rinumerazione'));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const modulo = () => import('../src/rinumerazione-giornale.mjs').catch((errore) => ({ mancante: errore?.code ?? String(errore) }));

function intestazione(id, dir) {
  return { tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:rin', cartella: dir, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    avviataAlle: '2026-11-13T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true };
}
/* un giornale coi numeri dati, nell'ordine dato; `senzaNumeroDopo` mette una riga SENZA numero dopo quell'indice */
function scriviGiornale(dir, id, numeri, { senzaNumeroDopo = null } = {}) {
  const corpo = [];
  numeri.forEach((n, i) => {
    corpo.push({ type: 'CUSTOM', name: 'talos.nota', value: { i, testo: `riga ${i} (numero vecchio ${n}) è «giusta»` }, _sequenza: n });
    if (i === senzaNumeroDopo) corpo.push({ tipo: 'nota-senza-numero', testo: 'resto qui com ero' });
  });
  writeFileSync(giornale(dir, id), [intestazione(id, dir), ...corpo].map((r) => `${JSON.stringify(r)}\n`).join(''));
  return giornale(dir, id);
}
function registroConAffitto(t, dir, extra = {}) {
  store.attivaAffittiArchivio(dir, { etichetta: 'test', battitoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(dir));
  const registro = createSessionRegistry({ cartellaStore: dir, affittoFraProcessi: { etichetta: 'test' }, avviaSessioneFn: async () => ({ ok: true }),
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', ...extra });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  return registro;
}
const ESEMPI = [
  { nome: 'REV-A14 [1..7,3,4]', prima: [1, 2, 3, 4, 5, 6, 7, 3, 4], dopo: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { nome: 'a whole turn with the old numbers, then the right one [1..5,3..7,8]', prima: [1, 2, 3, 4, 5, 3, 4, 5, 6, 7, 8], dopo: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { nome: 'out of order first, then the duplicates [1,2,4,3,5,3,4]', prima: [1, 2, 4, 3, 5, 3, 4], dopo: [1, 2, 4, 3, 5, 6, 7] },
];

// ───────────────────────────── la regola ─────────────────────────────

test('RIN-01: the three journals of the rule, as numbers only', async () => {
  const m = await modulo();
  assert.equal(typeof m.rinumeraNumeri, 'function', `the renumbering module exists (${m.mancante ?? 'ok'})`);
  for (const { nome, prima, dopo } of ESEMPI) assert.deepEqual(m.rinumeraNumeri(prima), dopo, nome);
  assert.deepEqual(m.rinumeraNumeri([28, 27, 29]), [28, 27, 29], 'out of order without a duplicate stays as it is');
  assert.deepEqual(m.rinumeraNumeri([1, null, 2, 1, undefined, 2]), [1, null, 2, 3, undefined, 4], 'lines without a number are not touched and take no number');
});

test('RIN-02: the three journals of the rule ON THE DISK: renumbered from the first duplicate, the lines without a number byte for byte', async (t) => {
  const m = await modulo();
  assert.equal(typeof m.rinumeraGiornale, 'function', `the renumbering module exists (${m.mancante ?? 'ok'})`);
  for (const { nome, prima, dopo } of ESEMPI) {
    const dir = cartellaTemp(t);
    const percorso = scriviGiornale(dir, 'g', prima, { senzaNumeroDopo: prima.length - 2 });
    const righePrima = readFileSync(percorso, 'utf8').split('\n');
    const esito = await m.rinumeraGiornale(percorso);
    assert.equal(esito.rinumerato, true, `${nome}: ${JSON.stringify(esito)}`);
    assert.deepEqual(numeriSulDisco(percorso), dopo, nome);
    const righeDopo = readFileSync(percorso, 'utf8').split('\n');
    assert.equal(righeDopo.length, righePrima.length, `${nome}: same number of lines`);
    const primoDoppio = prima.findIndex((n, i) => prima.indexOf(n) !== i);
    // header (0) + events; the line without a number sits after event `prima.length - 2`
    for (let i = 0; i <= primoDoppio; i += 1) assert.equal(righeDopo[i], righePrima[i], `${nome}: line ${i} before the first duplicate is byte for byte the same`);
    const senza = righePrima.findIndex((r) => r.includes('nota-senza-numero'));
    assert.equal(righeDopo[senza], righePrima[senza], `${nome}: the line without a number is byte for byte the same`);
    const testiPrima = righe(join(dir, copieAccanto(dir)[0])).map((r) => r.value?.testo ?? r.testo ?? r.tipo);
    assert.deepEqual(righe(percorso).map((r) => r.value?.testo ?? r.testo ?? r.tipo), testiPrima, `${nome}: same lines, same disk order`);
    assert.equal(esito.righeRinumerate, prima.length - primoDoppio, `${nome}: counted`);
  }
});

test('RIN-03: a journal WITHOUT duplicates (28,27,29 out of order included) does not change by one byte, and no copy is made', async (t) => {
  const m = await modulo();
  assert.equal(typeof m.rinumeraGiornale, 'function', `the renumbering module exists (${m.mancante ?? 'ok'})`);
  const dir = cartellaTemp(t);
  const percorso = scriviGiornale(dir, 'sano', [1, 2, 28, 27, 29, 30], { senzaNumeroDopo: 2 });
  appendFileSync(percorso, '\r\n'); // a blank line with CR too
  const prima = readFileSync(percorso);
  const mtime = statSync(percorso).mtimeMs;
  const esito = await m.rinumeraGiornale(percorso);
  assert.equal(esito.rinumerato, false);
  assert.equal(esito.motivo, 'senza-doppi');
  assert.ok(readFileSync(percorso).equals(prima), 'not one byte changed');
  assert.equal(statSync(percorso).mtimeMs, mtime, 'not even rewritten with the same bytes');
  assert.deepEqual(copieAccanto(dir), [], 'no copy');
  assert.deepEqual(temporanei(dir), [], 'no temporary');
});

test('RIN-04: the restore of a journal without duplicates leaves it byte for byte (with the lease in hand)', async (t) => {
  const dir = cartellaTemp(t);
  const id = '41414141-4141-4141-8141-414141414141';
  const percorso = scriviGiornale(dir, id, [1, 2, 28, 27, 29]);
  const prima = readFileSync(percorso);
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  await pausa(50);
  assert.ok(registro.esporta(id), 'restored');
  assert.ok(readFileSync(percorso).equals(prima), 'not one byte changed by the restore');
  assert.deepEqual(copieAccanto(dir), []);
});

// ───────────────────────────── il ripristino ─────────────────────────────

/* 14/11/2026 (terzo giro, «mai riscrivere»): il ripristino non riscrive più il diario. RIN-05, RIN-07, RIN-13 e RIN-14 dicevano la
   rinumerazione sul disco del pezzo 4; ora dicono la regola V: il file byte per byte, nessuna copia accanto, i numeri dati dalla lettura. */
test('RIN-05 (REV-A14, mai riscrivere): the journal the base left after the takeover [1..7,3,4] is NOT rewritten by the restore: byte for byte, nothing beside, the chat reads it as [1..9] in disk order, the same after a second restore', async (t) => {
  const dir = cartellaTemp(t);
  const id = '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a';
  const ev = (type, n, extra) => ({ type, _sequenza: n, ...extra });
  const corpo = [intestazione(id, dir),
    ev('RunStarted', 1, { threadId: id, runId: 'qui-1' }), ev('RunFinished', 2, { threadId: id, runId: 'qui-1', result: { detto: 'Primo giro qui.' } }),
    ev('RunStarted', 3, { threadId: id, runId: 'altrove-2' }), ev('TextMessageStart', 4, { messageId: 'm-altrove', role: 'assistant' }),
    ev('TextMessageContent', 5, { messageId: 'm-altrove', delta: 'Scritto da chi ha preso l affitto' }), ev('TextMessageEnd', 6, { messageId: 'm-altrove' }),
    ev('RunFinished', 7, { threadId: id, runId: 'altrove-2', result: { detto: 'Scritto da chi ha preso l affitto' } }),
    ev('RunStarted', 3, { threadId: id, runId: 'qui-2' }), ev('TextMessageContent', 4, { messageId: 'm-qui', delta: 'dal telefono' })];
  writeFileSync(giornale(dir, id), corpo.map((r) => `${JSON.stringify(r)}\n`).join(''));
  const shaPrima = sha(giornale(dir, id));
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  await pausa(80);
  assert.equal(sha(giornale(dir, id)), shaPrima, 'not one byte changed');
  assert.deepEqual(copieAccanto(dir), [], 'no copy beside');
  assert.deepEqual(temporanei(dir), []);
  const eventi = registro.esporta(id).eventi;
  const ordine = eventi.filter((e) => e.type === 'RunStarted').map((e) => `${e.runId}:${e._sequenza}`);
  assert.deepEqual(ordine, ['qui-1:1', 'altrove-2:3', 'qui-2:8'], 'the chat in memory has the numbers of the reading, in the disk order');
  assert.deepEqual(eventi.filter((e) => Number.isSafeInteger(e._sequenza)).map((e) => e._sequenza), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(eventi.filter((e) => e.name === 'talos.journal-riparato').length, 0, 'nothing was changed, nothing to say');
  const registro2 = createSessionRegistry({ cartellaStore: dir, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro2.chiudi({ attesaMassimaMs: 500 }));
  await registro.chiudi({ attesaMassimaMs: 500 });
  await registro2.ripristina();
  assert.deepEqual(registro2.esporta(id).eventi.filter((e) => e.type === 'RunStarted').map((e) => `${e.runId}:${e._sequenza}`), ordine, 'the same numbers after another start');
  assert.equal(sha(giornale(dir, id)), shaPrima);
});

test('RIN-06: with the lease held by ANOTHER live process the restore does not renumber: the journal stays, the chat reads it as it is (disk order)', async (t) => {
  const dir = cartellaTemp(t);
  const id = '66666666-6666-4666-8666-666666666666';
  const percorso = scriviGiornale(dir, id, [1, 2, 3, 4, 5, 6, 7, 3, 4]);
  const prima = readFileSync(percorso);
  mkdirSync(join(dir, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(dir, CARTELLA_AFFITTI, `${id}.json`), JSON.stringify({ istanza: '99999999-9999-4999-8999-999999999999', pid: process.pid, host: hostname(),
    avviatoIl: '2026-11-08T00:00:00.000Z', presoIl: '2026-11-08T00:01:00.000Z', etichetta: 'the TALOS CLI' }));
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  await pausa(50);
  assert.ok(readFileSync(percorso).equals(prima), 'untouched');
  assert.deepEqual(copieAccanto(dir), []);
  const n = registro.esporta(id).eventi.filter((e) => e.name === 'talos.nota').map((e) => e.value.i);
  assert.deepEqual(n, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'read as it is, the duplicates after');
});

test('RIN-07 (mai riscrivere): the restore never asks for a renumbering any more (the old door is not called): the journal stays, no line in the chat, the duplicates read in disk order with the numbers of the reading', async (t) => {
  const dir = cartellaTemp(t);
  const id = '77777777-7777-4777-8777-777777777777';
  const percorso = scriviGiornale(dir, id, [1, 2, 3, 4, 5, 6, 7, 3, 4]);
  const prima = readFileSync(percorso);
  const chiamate = [];
  const registro = registroConAffitto(t, dir, { rinumeraGiornaleFn: async (args) => { chiamate.push(args.sessionId); return { rinumerato: false, fase: 'rename', errore: 'EPERM: provoked' }; } });
  await registro.ripristina();
  await pausa(50);
  assert.deepEqual(chiamate, [], 'nobody asked for a rewrite');
  assert.ok(readFileSync(percorso).equals(prima));
  assert.deepEqual(copieAccanto(dir), []);
  const eventi = registro.esporta(id).eventi;
  assert.deepEqual(eventi.filter((e) => e.name === 'talos.nota').map((e) => `${e.value.i}:${e._sequenza}`), ['0:1', '1:2', '2:3', '3:4', '4:5', '5:6', '6:7', '7:8', '8:9']);
  assert.equal(eventi.filter((e) => e.name === 'talos.journal-riparato').length, 0, 'no «recovered» line');
});

// ───────────────────────────── la sicurezza della riscrittura ─────────────────────────────

test('RIN-08: the copy beside is EXCLUSIVE: an existing copy with the same name is never overwritten, the journal stays', async (t) => {
  const m = await modulo();
  assert.equal(typeof m.rinumeraGiornale, 'function', `the renumbering module exists (${m.mancante ?? 'ok'})`);
  const dir = cartellaTemp(t);
  const percorso = scriviGiornale(dir, 'g', [1, 2, 3, 2]);
  const prima = readFileSync(percorso);
  const ora = new Date('2026-11-13T16:00:00.000Z');
  const occupata = `${percorso}.prima-della-rinumerazione-2026-11-13T16-00-00-000Z`;
  writeFileSync(occupata, 'una copia di prima, da non toccare');
  const esito = await m.rinumeraGiornale(percorso, { oraFn: () => ora });
  assert.equal(esito.rinumerato, false);
  assert.equal(esito.fase, 'copia');
  assert.match(esito.errore, /EEXIST/);
  assert.equal(readFileSync(occupata, 'utf8'), 'una copia di prima, da non toccare');
  assert.ok(readFileSync(percorso).equals(prima));
  assert.deepEqual(temporanei(dir), []);
});

test('RIN-09: the copy is VERIFIED (same size AND same SHA-256) before anything is written: a copy that differs stops it, the copy is left as it is', async (t) => {
  const m = await modulo();
  assert.equal(typeof m.rinumeraGiornale, 'function', `the renumbering module exists (${m.mancante ?? 'ok'})`);
  for (const [nome, guasta] of [
    ['same size, one byte different', (dst) => { const b = readFileSync(dst); b[b.length - 3] ^= 1; writeFileSync(dst, b); }],
    ['one byte shorter', (dst) => { const b = readFileSync(dst); writeFileSync(dst, b.subarray(0, b.length - 1)); }],
  ]) {
    const dir = cartellaTemp(t);
    const percorso = scriviGiornale(dir, 'g', [1, 2, 3, 2]);
    const prima = readFileSync(percorso);
    let copia = null;
    const esito = await m.rinumeraGiornale(percorso, {
      copyFileFn: async (src, dst, modo) => { const fsp = await import('node:fs/promises'); await fsp.copyFile(src, dst, modo); guasta(dst); copia = readFileSync(dst); },
    });
    assert.equal(esito.rinumerato, false, nome);
    assert.equal(esito.fase, 'verifica', nome);
    assert.ok(readFileSync(percorso).equals(prima), `${nome}: journal untouched`);
    assert.ok(readFileSync(join(dir, copieAccanto(dir)[0])).equals(copia), `${nome}: the copy is not touched`);
    assert.deepEqual(temporanei(dir), [], nome);
  }
});

test('RIN-10 (giudice v1779): the temporary is flushed AND fsynced BEFORE the rename, then closed; the rename puts it in place', async (t) => {
  const m = await modulo();
  assert.equal(typeof m.rinumeraGiornale, 'function', `the renumbering module exists (${m.mancante ?? 'ok'})`);
  const dir = cartellaTemp(t);
  const percorso = scriviGiornale(dir, 'g', [1, 2, 3, 2]);
  const ordine = [];
  const fsp = await import('node:fs/promises');
  const esito = await m.rinumeraGiornale(percorso, {
    scriviFn: async (fh, buf) => { ordine.push('scrivi'); await fh.write(buf); },
    fsyncFn: async (fh) => { ordine.push('fsync'); await fh.sync(); },
    renameFn: async (a, b) => { ordine.push(`rename:${a.endsWith('.rinumerazione') ? 'temporaneo' : a}`); await fsp.rename(a, b); },
  });
  assert.equal(esito.rinumerato, true, JSON.stringify(esito));
  const primoFsync = ordine.indexOf('fsync');
  assert.ok(primoFsync > ordine.lastIndexOf('scrivi'), `fsync after the last write: ${ordine}`);
  assert.ok(ordine.indexOf('rename:temporaneo') > primoFsync, `rename after the fsync: ${ordine}`);
  assert.deepEqual(numeriSulDisco(percorso), [1, 2, 3, 4]);
});

test('RIN-11: every provoked error (write, fsync, rename, the journal changing meanwhile) leaves the journal of before and the copy untouched, and no temporary', async (t) => {
  const m = await modulo();
  assert.equal(typeof m.rinumeraGiornale, 'function', `the renumbering module exists (${m.mancante ?? 'ok'})`);
  const guasto = (codice) => Object.assign(new Error(`${codice}: provoked`), { code: codice });
  const casi = [
    ['scrittura', { scriviFn: async () => { throw guasto('ENOSPC'); } }],
    ['fsync', { fsyncFn: async () => { throw guasto('EIO'); } }],
    ['rename', { renameFn: async () => { throw guasto('EXDEV'); } }],
    ['rename', { renameFn: async () => { throw guasto('EPERM'); } }], // transient: retried, then given up
    ['cambiato', { scriviFn: async (fh, buf, percorso) => { await fh.write(buf); appendFileSync(percorso, '{"type":"CUSTOM","_sequenza":99}\n'); } }],
  ];
  for (const [fase, deps] of casi) {
    const dir = cartellaTemp(t);
    const percorso = scriviGiornale(dir, 'g', [1, 2, 3, 2]);
    const prima = readFileSync(percorso);
    const esito = await m.rinumeraGiornale(percorso, deps);
    assert.equal(esito.rinumerato, false, `${fase}: ${JSON.stringify(esito)}`);
    assert.equal(esito.fase, fase);
    const copie = copieAccanto(dir);
    assert.equal(copie.length, 1, `${fase}: the copy stays`);
    assert.ok(readFileSync(join(dir, copie[0])).equals(prima), `${fase}: the copy is the journal of before`);
    if (fase !== 'cambiato') assert.ok(readFileSync(percorso).equals(prima), `${fase}: the journal of before`);
    else assert.ok(readFileSync(percorso).subarray(0, prima.length).equals(prima) && numeriSulDisco(percorso).at(-1) === 99, 'the other writer line stays, nothing of ours replaced it');
    assert.deepEqual(temporanei(dir), [], `${fase}: no temporary left`);
  }
});

test('RIN-12: the store door renumbers only with the lease in hand and after the queued writes', async (t) => {
  assert.equal(typeof store.rinumeraDoppiDelGiornale, 'function', 'the store has the door');
  const dir = cartellaTemp(t);
  const id = '12121212-1212-4212-8212-121212121212';
  scriviGiornale(dir, id, [1, 2, 3, 2]);
  store.attivaAffittiArchivio(dir, { etichetta: 'test', battitoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(dir));
  mkdirSync(join(dir, CARTELLA_AFFITTI), { recursive: true });
  const fileAffitto = join(dir, CARTELLA_AFFITTI, `${id}.json`);
  writeFileSync(fileAffitto, JSON.stringify({ istanza: '99999999-9999-4999-8999-999999999999', pid: process.pid, host: hostname(), avviatoIl: '2026-11-08T00:00:00.000Z', presoIl: '2026-11-08T00:01:00.000Z', etichetta: 'the TALOS CLI' }));
  const rifiutata = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id });
  assert.equal(rifiutata.rinumerato, false);
  assert.equal(rifiutata.motivo, 'affittata');
  assert.deepEqual(numeriSulDisco(giornale(dir, id)), [1, 2, 3, 2]);
  const fsp = await import('node:fs/promises');
  await fsp.unlink(fileAffitto); // the other process released
  const fatta = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id });
  assert.equal(fatta.rinumerato, true, JSON.stringify(fatta));
  assert.deepEqual(numeriSulDisco(giornale(dir, id)), [1, 2, 3, 4]);
});

// ───────────────────────────── chi ascoltava ─────────────────────────────

test('RIN-13 (mai riscrivere): who reconnects gets exactly the lines above its cursor in the numbers of the reading (the two lines that reused 3 and 4 are 8 and 9)', async (t) => {
  const dir = cartellaTemp(t);
  const id = '13131313-1313-4313-8313-131313131313';
  scriviGiornale(dir, id, [1, 2, 3, 4, 5, 6, 7, 3, 4]);
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  await pausa(50);
  const rigioca = (cursore) => { const visti = []; const smetti = registro.iscriviti(id, (e) => { visti.push(e); }, cursore); smetti(); return visti.filter((e) => e.name === 'talos.nota').map((e) => `${e.value.i}:${e._sequenza}`); };
  assert.deepEqual(rigioca(2), ['2:3', '3:4', '4:5', '5:6', '6:7', '7:8', '8:9'], 'cursor 2: exactly what comes after');
  assert.deepEqual(rigioca(7), ['7:8', '8:9'], 'cursor 7: the two lines it does not have, never one twice');
  assert.deepEqual(rigioca(9), [], 'cursor 9: nothing');
  assert.deepEqual(rigioca(0), ['0:1', '1:2', '2:3', '3:4', '4:5', '5:6', '6:7', '7:8', '8:9'], 'no cursor: everything');
});

test('RIN-14 (mai riscrivere): a window open on a stopped chat while another process appends with the old numbers: the reload does not rewrite, the window receives the other process lines with the numbers of the reading', async (t) => {
  const dir = cartellaTemp(t);
  const id = '14141414-1414-4414-8414-141414141414';
  const percorso = scriviGiornale(dir, id, [1, 2, 3, 4, 5]);
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  const ricevuti = [];
  const smetti = registro.iscriviti(id, (e) => { ricevuti.push(e); }, 5);
  t.after(smetti);
  store.affittiDellArchivio(dir).rilascia(id);
  appendFileSync(percorso, [3, 4].map((n, k) => `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota', value: { i: `altro-${k}` }, _sequenza: n })}\n`).join(''));
  const prima = readFileSync(percorso);
  const allineamento = await registro.allineaSessione(id, { scrivere: false });
  assert.equal(allineamento.ricaricata, true);
  assert.ok(readFileSync(percorso).equals(prima), 'the reload did not rewrite the journal');
  const arrivati = ricevuti.filter((e) => e.name === 'talos.nota').map((e) => `${e.value.i}:${e._sequenza}`);
  assert.deepEqual(arrivati, ['altro-0:6', 'altro-1:7'], 'the window receives the other process lines with the numbers of the reading');
  assert.deepEqual(copieAccanto(dir), []);
});
