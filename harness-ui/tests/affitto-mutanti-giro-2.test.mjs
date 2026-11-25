import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as store from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rinumeraGiornale } from '../src/rinumerazione-giornale.mjs';
import { CARTELLA_AFFITTI, creaAffittiArchivio } from '../src/session-lease.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 13/11/2026 sera — le prove per i mutanti SOPRAVVISSUTI alla revisione affitto 1 di 3 (giudice v1804 punto 6): R01, R03, R05, R07,
 *   R08, R11 e P1-b, ognuno ucciso da almeno due prove (due porte o due scenari). Le definizioni dei mutanti sono del revisore
 *   (`C:/T/rev-aff1-lavoro/mutanti-rev.mjs`); REVAFF-CODA e P1-b sono COPIATE e adattate dalle sue prove (sola lettura). L'aggancio di
 *   P1-b è l'opzione `dopoIlRinfresco` di `creaAffittiArchivio`, solo per le prove: nessun file del prodotto la passa (P1-b-MAI).
 *   Solo giornali FINTI nel profilo finto.
 */
const require = createRequire(import.meta.url);
const fsCjs = require('node:fs');
const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-mut2-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const giornale = (dir, id) => join(dir, `${id}.jsonl`);
const copieAccanto = (dir) => readdirSync(dir).filter((f) => f.includes('.prima-della-rinumerazione-'));
const temporanei = (dir) => readdirSync(dir).filter((f) => f.endsWith('.rinumerazione'));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const intestazione = (id, dir) => ({ tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:mut2', cartella: dir, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
  avviataAlle: '2026-11-13T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true });
const nota = (i, n) => JSON.stringify({ type: 'CUSTOM', name: 'talos.nota', value: { i }, _sequenza: n });
function scrivi(dir, id, numeri, { fine = '\n', coda = '' } = {}) {
  writeFileSync(giornale(dir, id), [JSON.stringify(intestazione(id, dir)), ...numeri.map((n, i) => nota(i, n))].map((r) => `${r}${fine}`).join('') + coda);
  return giornale(dir, id);
}
const numeri = (percorso) => readFileSync(percorso, 'utf8').split('\n').filter((r) => r.trim()).map((r) => JSON.parse(r)._sequenza).filter((n) => typeof n === 'number');
function conAffitto(t, dir) {
  store.attivaAffittiArchivio(dir, { etichetta: 'test', battitoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(dir));
}

/* ---------------------------------------------------------------- R01: una riga illeggibile PRIMA del doppio ferma tutto, anche la copia */
test('R01-a: a line that is not JSON before the first duplicate stops the renumbering before the copy (nothing written beside)', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a01a0000-0000-4000-8000-000000000001';
  const percorso = scrivi(dir, id, [1, 2], { coda: '{rotta\n' + `${nota(9, 3)}\n${nota(10, 2)}\n` });
  const prima = readFileSync(percorso);
  const esito = await rinumeraGiornale(percorso);
  assert.equal(esito.rinumerato, false);
  assert.equal(esito.motivo, 'riga-illeggibile', JSON.stringify(esito));
  assert.deepEqual(copieAccanto(dir), [], 'no copy is made for a journal that cannot be rewritten');
  assert.ok(readFileSync(percorso).equals(prima));
});

test('R01-b: through the store door (lease in hand) the same journal is refused as unreadable, no copy, no temporary, byte for byte the same', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a01b0000-0000-4000-8000-000000000001';
  conAffitto(t, dir);
  const percorso = scrivi(dir, id, [1, 2, 3], { coda: 'non json\n' + `${nota(9, 2)}\n` });
  const prima = readFileSync(percorso);
  const esito = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id, rigaFinale: () => ({ type: 'CUSTOM', name: 'talos.journal-riparato', value: {} }) });
  assert.equal(esito.motivo, 'riga-illeggibile', JSON.stringify(esito));
  assert.deepEqual(copieAccanto(dir), []);
  assert.deepEqual(temporanei(dir), []);
  assert.ok(readFileSync(percorso).equals(prima));
});

/* ---------------------------------------------------------------- R03: le righe CRLF rinumerate tengono il loro \r */
test('R03-a: a journal written with CRLF keeps CRLF on the renumbered lines too (only the number changes)', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a03a0000-0000-4000-8000-000000000001';
  const percorso = scrivi(dir, id, [1, 2, 3, 2, 3], { fine: '\r\n' });
  const esito = await rinumeraGiornale(percorso);
  assert.equal(esito.rinumerato, true, JSON.stringify(esito));
  const testo = readFileSync(percorso, 'utf8');
  const righe = testo.split('\n').filter(Boolean);
  assert.equal(righe.length, 6);
  for (const riga of righe) assert.ok(riga.endsWith('\r'), `CRLF kept: ${JSON.stringify(riga.slice(-12))}`);
  assert.deepEqual(numeri(percorso), [1, 2, 3, 4, 5]);
});

test('R03-b: through the store door, CRLF lines renumbered keep their \\r, and the «recovered» line follows them', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a03b0000-0000-4000-8000-000000000001';
  conAffitto(t, dir);
  const percorso = scrivi(dir, id, [1, 2, 1, 2], { fine: '\r\n' });
  const esito = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id, rigaFinale: () => ({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true } }) });
  assert.equal(esito.rinumerato, true, JSON.stringify(esito));
  const righe = readFileSync(percorso, 'utf8').split('\n').filter(Boolean);
  assert.equal(righe.length, 6);
  assert.deepEqual(righe.slice(0, 5).map((r) => r.endsWith('\r')), [true, true, true, true, true], 'the renumbered lines 3 and 4 too');
  assert.deepEqual(numeri(percorso), [1, 2, 3, 4, 5]);
});

/* ---------------------------------------------------------------- R05: la coda spezzata riparata non si tace dopo la rinumerazione */
async function ripristinaCodaEDoppi(t, dir, id) {
  const int = intestazione(id, dir);
  const ev = (n, i) => ({ type: 'CUSTOM', name: 'talos.nota', value: { i }, _sequenza: n });
  writeFileSync(giornale(dir, id), [int, ev(1, 0), ev(2, 1), ev(1, 2)].map((r) => `${JSON.stringify(r)}\n`).join('') + '{"type":"CUSTOM","_seq');
  store.attivaAffittiArchivio(dir, { etichetta: 'rev', battitoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(dir));
  const registro = createSessionRegistry({ cartellaStore: dir, affittoFraProcessi: { etichetta: 'rev' }, avviaSessioneFn: async () => ({ ok: true }),
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  await store.attendiScritture({ cartellaStore: dir, sessionId: id });
  return registro;
}
/* 14/11/2026 (mai riscrivere): i doppi non si riscrivono più (nessuna copia accanto, nessuna riga di rinumerazione); la coda spezzata
   si ripara e si dice come da settembre (limite dichiarato del terzo giro: quella mezza riga si tronca ancora, solo con l'affitto) */
test('REVAFF-CODA (R05-a, from the reviewer; mai riscrivere): duplicates AND a torn tail: the duplicates are not rewritten, the discarded tail is said (never silent)', async (t) => {
  const dir = cartellaTemp(t);
  const id = '7e7e7e7e-7e7e-4e7e-8e7e-7e7e7e7e7e7e';
  const registro = await ripristinaCodaEDoppi(t, dir, id);
  const note = registro.esporta(id).eventi.filter((e) => e.name === 'talos.journal-riparato').map((e) => e.value);
  t.diagnostic(JSON.stringify(note));
  assert.deepEqual(copieAccanto(dir), [], 'not rewritten: nothing beside');
  assert.equal(note.filter((v) => v.rinumerate > 0).length, 0, 'no renumbering to say');
  assert.ok(note.some((v) => !v.rinumerate && (v.byteScartati > 0 || v.righeScartate > 0)), 'the discarded torn tail is said');
  assert.deepEqual(registro.esporta(id).eventi.filter((e) => e.name === 'talos.nota').map((e) => `${e.value.i}:${e._sequenza}`), ['0:1', '1:2', '2:3'], 'the duplicate reads with the number of the reading');
});

test('R05-b: the same, read on the DISK after a restart: the torn-tail note is a durable line, with what was discarded, completed', async (t) => {
  const dir = cartellaTemp(t);
  const id = '7e7e7e7e-7e7e-4e7e-8e7e-7e7e7e7e7e7f';
  const registro = await ripristinaCodaEDoppi(t, dir, id);
  await registro.chiudi({ attesaMassimaMs: 500 });
  const sulDisco = readFileSync(giornale(dir, id), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r))
    .filter((r) => r.name === 'talos.journal-riparato').map((r) => r.value);
  const coda = sulDisco.filter((v) => !v.rinumerate);
  assert.equal(coda.length, 1, JSON.stringify(sulDisco));
  assert.equal(coda[0].righeScartate, 1, JSON.stringify(coda[0]));
  assert.equal(coda[0].byteScartati, Buffer.byteLength('{"type":"CUSTOM","_seq'), 'the torn bytes, counted');
  assert.match(coda[0].backup ?? '', /\.bak-/, 'with the copy of the torn tail');
  assert.equal(sulDisco.filter((v) => v.rinumerate > 0).length, 0, 'and no renumbering line (mai riscrivere)');
});

/* ---------------------------------------------------------------- R07: una coda incerta non si rinumera */
async function avvelenatoConRigaIntera(t, dir, id, { sincrono = false } = {}) {
  const percorso = scrivi(dir, id, [1, 2, 3]);
  const rotto = Object.assign(new Error('injected EIO after a whole line'), { code: 'EIO' });
  const record = { type: 'CUSTOM', name: 'talos.nota', value: { i: 'doppia' }, _sequenza: 2 };
  if (sincrono) {
    assert.throws(() => store.registraRigaSync({ cartellaStore: dir, sessionId: id, record }, { appendFileSyncFn: (p, d) => { appendFileSync(p, d); throw rotto; } }), { code: 'EIO' });
  } else {
    await assert.rejects(store.registraRiga({ cartellaStore: dir, sessionId: id, record }, { appendFileFn: async (p, d) => { appendFileSync(p, d); throw rotto; } }), { code: 'EIO' });
  }
  assert.deepEqual(numeri(percorso), [1, 2, 3, 2], 'a whole line landed, the write said it failed: the tail is uncertain');
  return percorso;
}
test('R07-a: an uncertain tail (a write that failed after landing) is never renumbered through the store door', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a07a0000-0000-4000-8000-000000000001';
  const percorso = await avvelenatoConRigaIntera(t, dir, id);
  const prima = readFileSync(percorso);
  const esito = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id });
  assert.deepEqual(esito, { rinumerato: false, motivo: 'coda-incerta' });
  assert.deepEqual(copieAccanto(dir), []);
  assert.ok(readFileSync(percorso).equals(prima));
});

test('R07-b: the same after a SYNCHRONOUS write that failed after landing, with the «recovered» line asked: nothing written, no copy, no temporary', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a07b0000-0000-4000-8000-000000000001';
  const percorso = await avvelenatoConRigaIntera(t, dir, id, { sincrono: true });
  const prima = readFileSync(percorso);
  const esito = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id, rigaFinale: () => ({ type: 'CUSTOM', name: 'talos.journal-riparato', value: {} }) });
  assert.equal(esito.motivo, 'coda-incerta', JSON.stringify(esito));
  assert.deepEqual(copieAccanto(dir), []);
  assert.deepEqual(temporanei(dir), []);
  assert.ok(readFileSync(percorso).equals(prima));
});

/* ---------------------------------------------------------------- R08: la porta della rinumerazione sta IN FILA dietro le scritture */
async function rinumeraDietroUnaScrittura(t, dir, id, avviaScrittura) {
  const percorso = scrivi(dir, id, [1, 2, 3]);
  let apri;
  const cancello = new Promise((r) => { apri = r; });
  let rinumeraPartita;
  const partita = new Promise((r) => { rinumeraPartita = r; });
  const scrittura = avviaScrittura(cancello);
  let partitaDopoLaScrittura = null;
  /* alla prima lettura della rinumerazione, la riga in fila è GIÀ nel giornale? */
  const esito = store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id }, {
    createReadStreamFn: (...a) => {
      if (partitaDopoLaScrittura === null) { partitaDopoLaScrittura = readFileSync(percorso, 'utf8').includes('in fila'); rinumeraPartita(); }
      return fsCjs.createReadStream(...a);
    },
  });
  /* in fila, la rinumerazione NON parte finché la scrittura non finisce: si apre il cancello appena parte (fuori fila, subito) o, se
     non parte, dopo un attimo — l'attesa serve solo a provare che NON è partita */
  await Promise.race([partita, pausa(300)]);
  apri();
  await scrittura;
  const r = await esito;
  return { percorso, r, partitaDopoLaScrittura };
}
test('R08-a: the renumbering door waits for a queued write (injected append held open): it starts after it, and renumbers the line it wrote', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a08a0000-0000-4000-8000-000000000001';
  const { percorso, r, partitaDopoLaScrittura } = await rinumeraDietroUnaScrittura(t, dir, id, (cancello) => store.registraRiga({ cartellaStore: dir, sessionId: id,
    record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'in fila' }, _sequenza: 2 } }, { appendFileFn: async (p, d, o) => { await cancello; appendFileSync(p, d, o); } }));
  assert.equal(partitaDopoLaScrittura, true, 'the renumbering read the journal only after the queued write');
  assert.equal(r.rinumerato, true, JSON.stringify(r));
  assert.deepEqual(numeri(percorso), [1, 2, 3, 4], 'the queued duplicate is renumbered with the rest');
});

test('R08-b: the same behind a DEFAULT durable write held at its open: the renumbering starts after it, no number twice on the disk', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a08b0000-0000-4000-8000-000000000001';
  const openVero = fsCjs.promises.open;
  const { percorso, r, partitaDopoLaScrittura } = await rinumeraDietroUnaScrittura(t, dir, id, (cancello) => {
    fsCjs.promises.open = async (p, ...resto) => { if (String(p).endsWith(`${id}.jsonl`)) { fsCjs.promises.open = openVero; await cancello; } return openVero(p, ...resto); };
    t.after(() => { fsCjs.promises.open = openVero; });
    return store.registraRiga({ cartellaStore: dir, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'in fila' }, _sequenza: 3 }, durable: true });
  });
  assert.equal(partitaDopoLaScrittura, true);
  assert.equal(r.rinumerato, true, JSON.stringify(r));
  const n = numeri(percorso);
  assert.equal(new Set(n).size, n.length, `no number twice: ${n}`);
  assert.deepEqual(n, [1, 2, 3, 4]);
});

/* ---------------------------------------------------------------- R11: si adottano SOLO le righe intere scritte altrove */
async function rigaAMetaDentroLaScrittura(t, dir, id, scrivi2) {
  conAffitto(t, dir);
  await store.registraRiga({ cartellaStore: dir, sessionId: id, record: intestazione(id, dir) });
  await store.registraRiga({ cartellaStore: dir, sessionId: id, record: { type: 'X', qui: 1, _sequenza: 1 } });
  const percorso = giornale(dir, id);
  const readSyncVero = fsCjs.readSync;
  /* l'altro processo scrive DOPO il nostro controllo dell'ultimo byte e PRIMA della misura: una riga intera e mezza */
  fsCjs.readSync = (...a) => {
    const n = readSyncVero(...a);
    fsCjs.readSync = readSyncVero; syncBuiltinESMExports();
    appendFileSync(percorso, `${JSON.stringify({ type: 'Y', altro: 1, _sequenza: 2 })}\n{"type":"Y","altro":2,"_seq`);
    return n;
  };
  syncBuiltinESMExports();
  t.after(() => { fsCjs.readSync = readSyncVero; syncBuiltinESMExports(); });
  const record = { type: 'X', qui: 2, _sequenza: 2 };
  const dopoIlRecinto = (ultima) => { record._sequenza = ultima + 1; };
  await scrivi2(record, dopoIlRecinto);
  assert.ok(readFileSync(percorso, 'utf8').endsWith('{"type":"Y","altro":2,"_seq'), 'our line is never glued to the half line of the other process');
  appendFileSync(percorso, 'uenza":3}\n'); // l'altro finisce la sua riga
  const dopo = { type: 'X', qui: 3, _sequenza: 3 };
  await store.registraRiga({ cartellaStore: dir, sessionId: id, record: dopo, dopoIlRecinto: (ultima) => { dopo._sequenza = ultima + 1; } });
  const righe = readFileSync(percorso, 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r)); // ogni riga è JSON
  return righe.filter((r) => typeof r._sequenza === 'number').map((r) => `${r.qui ? `qui-${r.qui}` : `altro-${r.altro}`}:${r._sequenza}`);
}
test('R11-a: a half line of the other process at the end of the tail is not adopted: our write is refused (never glued), the next one goes after the whole line', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a11a0000-0000-4000-8000-000000000001';
  const ordine = await rigaAMetaDentroLaScrittura(t, dir, id, async (record, dopoIlRecinto) => {
    await assert.rejects(store.registraRiga({ cartellaStore: dir, sessionId: id, record, dopoIlRecinto }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  });
  assert.deepEqual(ordine, ['qui-1:1', 'altro-1:2', 'altro-2:3', 'qui-3:4']);
});

test('R11-b: the same through the SYNCHRONOUS writer', async (t) => {
  const dir = cartellaTemp(t);
  const id = 'a11b0000-0000-4000-8000-000000000001';
  const ordine = await rigaAMetaDentroLaScrittura(t, dir, id, async (record, dopoIlRecinto) => {
    assert.throws(() => store.registraRigaSync({ cartellaStore: dir, sessionId: id, record, dopoIlRecinto }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  });
  assert.deepEqual(ordine, ['qui-1:1', 'altro-1:2', 'altro-2:3', 'qui-3:4']);
});

/* ---------------------------------------------------------------- P1-b: il battito rilegge il file DOPO il rinfresco */
const ALTRA = '99999999-9999-4999-8999-999999999999';
function affittiFermi(t, dopoIlRinfresco) {
  const dir = cartellaTemp(t);
  let ora = 1_000_000;
  const a = creaAffittiArchivio({ cartellaStore: dir, percorsoGiornale: (id) => join(dir, `${id}.jsonl`), etichetta: 'test', adesso: () => ora,
    impostaIntervallo: () => ({ unref() {} }), cancellaIntervallo: () => {}, dopoIlRinfresco });
  writeFileSync(join(dir, 's1.jsonl'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  assert.equal(a.prendi('s1').preso, true);
  a.tocca('s1');
  ora += 31_000; // fermo oltre la scadenza
  a.aggiungiInUso(() => true); // in uso: il rilascio non salva il caso
  return { dir, a };
}
test('P1-b (from the reviewer): the lease file is taken right between our refresh and our re-read: the heartbeat declares the lease compromised', (t) => {
  let chiamato = 0;
  let dir = null;
  const fermi = affittiFermi(t, (file) => {
    chiamato += 1;
    mkdirSync(join(dir, CARTELLA_AFFITTI), { recursive: true });
    writeFileSync(file, JSON.stringify({ istanza: ALTRA, pid: process.pid, host: hostname(), avviatoIl: '2026-11-08T00:00:00.000Z', presoIl: '2026-11-08T00:01:00.000Z', etichetta: 'other' }));
    writeFileSync(join(dir, 's1.jsonl'), '{"a":1}\n{"b":2}\n');
  });
  dir = fermi.dir;
  const { a } = fermi;
  a.battito();
  assert.equal(chiamato, 1, 'the hook ran (the stale-refresh branch was taken)');
  assert.equal(a.tiene('s1'), false, 'compromised: no longer held');
  assert.equal(a.daRicaricare('s1'), true, 'the chat must reload');
});

test('P1-b-2: the lease file VANISHES between our refresh and our re-read (moved away): the heartbeat declares the lease compromised too', (t) => {
  let chiamato = 0;
  const { a } = affittiFermi(t, (file) => { chiamato += 1; renameSync(file, `${file}.portato-via`); });
  a.battito();
  assert.equal(chiamato, 1);
  assert.equal(a.tiene('s1'), false, 'not held: the file is no longer ours');
});

test('P1-b-3: the same race on the take path (prendi after a stall): the lease is not confirmed', (t) => {
  let chiamato = 0;
  const { a } = affittiFermi(t, (file) => { chiamato += 1; renameSync(file, `${file}.portato-via`); });
  const esito = a.prendi('s1');
  assert.equal(chiamato, 1);
  assert.equal(esito.nuovo === false && esito.preso === true, false, `never «still ours, nothing new»: ${JSON.stringify(esito)}`);
});

test('P1-b-MAI: the test hook dopoIlRinfresco is never passed by the product (only session-lease.mjs names it)', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const chi = [];
  const visita = (cartella) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const p = join(cartella, voce.name);
      if (voce.isDirectory()) visita(p);
      else if (/\.(mjs|js|cjs)$/.test(voce.name) && readFileSync(p, 'utf8').includes('dopoIlRinfresco')) chi.push(p.slice(src.length).replace(/\\/g, '/'));
    }
  };
  visita(src);
  assert.deepEqual(chi, ['session-lease.mjs']);
});
