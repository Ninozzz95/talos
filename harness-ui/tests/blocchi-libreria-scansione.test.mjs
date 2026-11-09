/*
 * D7, Performance condition before the release (04/11/2026): trovaVocePerBlocco reads the meta.json files of the Library in
 * bounded parallel batches instead of one after the other. It runs inside the model's turn (creaVoceDiBlocco for every
 * artifact_create of a block), on every "Save to Library" click and once per block after a reload.
 * The answer must not change: the most recent linked entry wins, an unreadable meta.json is skipped, a tie keeps the disk order.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { salvaVoce, trovaVocePerBlocco } from '../src/library-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t) {
  const dati = mkdtempSync(join(tmpdir(), 'talos-d7-lotti-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  return dati;
}

const voce = (dati, nome, blocco) => salvaVoce({ cartella: dati, nome, mediaType: 'text/plain', origine: 'generated', testo: nome, blocco });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const eMeta = (percorso) => /meta\.json$/u.test(String(percorso));

test('D7-E-01 — the meta.json files are read in parallel (more than one at a time), with a bound against EMFILE', async (t) => {
  const dati = cartella(t);
  for (let i = 0; i < 60; i += 1) await voce(dati, `v${i}.txt`, i % 10 === 0 ? { sessionId: 's', id: `b${i}` } : undefined);
  let inVolo = 0;
  let massimo = 0;
  const readFileFn = async (percorso, ...resto) => {
    if (!eMeta(percorso)) return readFile(percorso, ...resto);
    inVolo += 1;
    massimo = Math.max(massimo, inVolo);
    try { await pausa(2); return await readFile(percorso, ...resto); } finally { inVolo -= 1; }
  };
  const id = await trovaVocePerBlocco({ cartella: dati, sessionId: 's', idBlocco: 'b30' }, { readFileFn });
  assert.ok(id, 'the linked entry is found');
  assert.ok(massimo > 1, `meta.json read one at a time (max in flight ${massimo})`);
  assert.ok(massimo <= 32, `too many files open together (max in flight ${massimo})`);
});

test('D7-E-02 — same answer whatever order the reads finish in: most recent wins, unreadable skipped, a tie keeps the disk order', async (t) => {
  const dati = cartella(t);
  const legame = { sessionId: 'sess-1', id: 'vendite' };
  for (let i = 0; i < 20; i += 1) await voce(dati, `altra-${i}.txt`);
  const vecchia = await voce(dati, 'a.txt', legame);
  await pausa(15);
  const recente = await voce(dati, 'b.txt', legame);
  await pausa(15);
  const rotta = await voce(dati, 'c.txt', legame);
  for (const lenta of [vecchia, recente]) {
    const readFileFn = async (percorso, ...resto) => {
      if (eMeta(percorso) && String(percorso).includes(rotta)) throw Object.assign(new Error('fake EACCES'), { code: 'EACCES' });
      if (eMeta(percorso) && String(percorso).includes(lenta)) await pausa(30);
      return readFile(percorso, ...resto);
    };
    for (const ordina of [(a) => a, (a) => [...a].reverse()]) {
      const readdirFn = async (...arg) => ordina(await readdir(...arg));
      assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'vendite' }, { readdirFn, readFileFn }), recente,
        `slow ${lenta === vecchia ? 'old' : 'recent'}`);
    }
  }
  /* exact tie of aggiornatoIl: the first in disk order wins, as before, even if its read finishes last */
  const meta = (id) => readFile(join(dati, '.harness-ui-library', id, 'meta.json'), 'utf8').then(JSON.parse);
  const quando = (await meta(recente)).aggiornatoIl;
  const pari = async (percorso, ...resto) => {
    const testo = await readFile(percorso, ...resto);
    if (!eMeta(percorso)) return testo;
    if (String(percorso).includes(rotta)) throw Object.assign(new Error('fake EACCES'), { code: 'EACCES' });
    const m = JSON.parse(testo);
    if (m.blocco) { m.aggiornatoIl = quando; if (String(percorso).includes(vecchia)) await pausa(30); }
    return JSON.stringify(m);
  };
  for (const ordina of [(a) => a, (a) => [...a].reverse()]) {
    const elenco = ordina(await readdir(join(dati, '.harness-ui-library'), { withFileTypes: true }));
    const primo = elenco.find((d) => d.name === vecchia || d.name === recente).name;
    const readdirFn = async () => elenco;
    assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: 'sess-1', idBlocco: 'vendite' }, { readdirFn, readFileFn: pari }), primo);
  }
});

test('D7-C-01 — the questions of one page (one per block, together after a reload) share ONE scan; the next question scans again', async (t) => {
  const { voceDelBlocco, salvaBloccoInLibreria } = await import('../src/blocchi/in-libreria.mjs');
  const dati = cartella(t);
  const tabella = (await readFile(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8')).trimEnd();
  for (let i = 0; i < 30; i += 1) await voce(dati, `altra-${i}.txt`);
  const inA = await salvaBloccoInLibreria({ cartella: dati, testo: tabella, sessionId: 'A' });
  const inB = await salvaBloccoInLibreria({ cartella: dati, testo: tabella, sessionId: 'B' });
  let scansioni = 0;
  const deps = { readdirFn: async (...arg) => { scansioni += 1; return readdir(...arg); }, readFileFn: readFile };
  const domande = [['A', 'vendite'], ['B', 'vendite'], ['C', 'vendite'], ['A', 'altro'], ['  ', 'vendite']];
  const risposte = await Promise.all([...domande, ...domande].map(([s, b]) => voceDelBlocco({ cartella: dati, sessionId: s, idBlocco: b }, deps)));
  assert.equal(scansioni, 1, `one scan for ${risposte.length} questions`);
  assert.deepEqual(risposte.slice(0, 5).map((r) => r?.id ?? null), [inA.id, inB.id, null, null, null]);
  assert.deepEqual(risposte.slice(5), risposte.slice(0, 5));
  assert.equal(risposte[0].totale, 1);
  /* nothing is remembered once the scan is over: a save after it is seen by the next question */
  await salvaBloccoInLibreria({ cartella: dati, testo: tabella, sessionId: 'C' });
  assert.ok((await voceDelBlocco({ cartella: dati, sessionId: 'C', idBlocco: 'vendite' }, deps))?.id);
  assert.equal(scansioni, 2);
  /* invalid ids answer null without scanning at all */
  assert.equal(await voceDelBlocco({ cartella: dati, sessionId: '  ', idBlocco: 'vendite' }, deps), null);
  assert.equal(await voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 7 }, deps), null);
  assert.equal(scansioni, 2, 'no scan for invalid ids');
  /* a scan that fails is not kept: the next question with the SAME fs scans again */
  let rompi = true;
  const fragile = { readdirFn: async (...arg) => {
    if (rompi) { rompi = false; throw Object.assign(new Error('fake EACCES'), { code: 'EACCES' }); }
    return readdir(...arg);
  }, readFileFn: readFile };
  await assert.rejects(voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, fragile), (e) => e.code === 'LIBRARY_READ_FAILED');
  assert.equal((await voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, fragile))?.id, inA.id);
  /* two questions with different fs at the same time do not share a scan: a broken one does not fail the other */
  const rotto = { readdirFn: async () => { throw Object.assign(new Error('fake EACCES'), { code: 'EACCES' }); }, readFileFn: readFile };
  const [r1, r2] = await Promise.allSettled([
    voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, rotto),
    voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, deps),
  ]);
  assert.equal(r1.status, 'rejected');
  assert.equal(r2.value?.id, inA.id, JSON.stringify(r2.reason?.code));
});

test('D7-C-02 — a save never joins a scan that started before it: no second entry for the same block', async (t) => {
  const { voceDelBlocco, salvaBloccoInLibreria, creaVoceDiBlocco } = await import('../src/blocchi/in-libreria.mjs');
  const { elencaVoci } = await import('../src/library-store.mjs');
  const dati = cartella(t);
  const tabella = (await readFile(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8')).trimEnd();
  const altra = await voce(dati, 'altra.txt');
  /* the first read of `altra` waits for a gate: the question's scan stays in flight while the saves run */
  let apri;
  const cancello = new Promise((r) => { apri = r; });
  let chiuso = true;
  const deps = { readdirFn: readdir, readFileFn: async (percorso, ...resto) => {
    if (chiuso && eMeta(percorso) && String(percorso).includes(altra)) { chiuso = false; await cancello; }
    return readFile(percorso, ...resto);
  } };
  const domanda = voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, deps);
  await pausa(10);
  /* the model's artifact_create writes the block while the question's scan is still open */
  const prima = await creaVoceDiBlocco({ cartella: dati, testo: tabella, titolo: 'Vendite', sessionId: 'A' });
  const dopo = salvaBloccoInLibreria({ cartella: dati, testo: tabella.replace('980.5', '981'), sessionId: 'A' }, deps);
  await pausa(30);
  apri();
  const [esito] = await Promise.all([dopo, domanda]);
  assert.equal(esito.id, prima.id, 'the second save found the entry of the first');
  assert.deepEqual([esito.versione, esito.nuova], [2, true]);
  assert.equal((await elencaVoci({ cartella: dati })).length, 2, 'altra + ONE block entry');
});

test('D7-E-03 — the map keeps the old matching rules: ids are trimmed on lookup, and a hand-written link that is not a string never matches', async (t) => {
  const { writeFile } = await import('node:fs/promises');
  const dati = cartella(t);
  const legata = await voce(dati, 'a.txt', { sessionId: 'sess-1', id: 'vendite' });
  assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: '  sess-1 ', idBlocco: ' vendite  ' }), legata);
  /* a meta.json edited by hand: sessionId 7 (a number) must not answer to "7" */
  const amano = await voce(dati, 'b.txt');
  const percorso = join(dati, '.harness-ui-library', amano, 'meta.json');
  const meta = JSON.parse(await readFile(percorso, 'utf8'));
  await writeFile(percorso, JSON.stringify({ ...meta, blocco: { sessionId: 7, id: 'vendite' } }));
  assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: '7', idBlocco: 'vendite' }), null);
  await writeFile(percorso, JSON.stringify({ ...meta, blocco: { sessionId: 'sess-2', id: ['vendite'] } }));
  assert.equal(await trovaVocePerBlocco({ cartella: dati, sessionId: 'sess-2', idBlocco: 'vendite' }), null);
});

test('D7-C-03 — artifact_create never joins a scan that started before it either: after a click save it gets BLOCK_EXISTS, no second entry', async (t) => {
  const { voceDelBlocco, salvaBloccoInLibreria, creaVoceDiBlocco } = await import('../src/blocchi/in-libreria.mjs');
  const { elencaVoci } = await import('../src/library-store.mjs');
  const dati = cartella(t);
  const tabella = (await readFile(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8')).trimEnd();
  const altra = await voce(dati, 'altra.txt');
  let apri;
  const cancello = new Promise((r) => { apri = r; });
  let chiuso = true;
  const deps = { readdirFn: readdir, readFileFn: async (percorso, ...resto) => {
    if (chiuso && eMeta(percorso) && String(percorso).includes(altra)) { chiuso = false; await cancello; }
    return readFile(percorso, ...resto);
  } };
  const domanda = voceDelBlocco({ cartella: dati, sessionId: 'A', idBlocco: 'vendite' }, deps);
  await pausa(10);
  /* the person's click writes the block while the question's scan is still open */
  const clic = await salvaBloccoInLibreria({ cartella: dati, testo: tabella, sessionId: 'A' });
  const modello = creaVoceDiBlocco({ cartella: dati, testo: tabella.replace('980.5', '981'), titolo: 'Vendite', sessionId: 'A' }, deps)
    .then((valore) => ({ status: 'fulfilled', value: valore }), (reason) => ({ status: 'rejected', reason }));
  await pausa(30);
  apri();
  const [esito] = await Promise.all([modello, domanda]);
  assert.equal(esito.status, 'rejected', 'the model must be told the block is already in the Library');
  assert.equal(esito.reason?.code, 'BLOCK_EXISTS');
  assert.equal(esito.reason?.id, clic.id);
  assert.equal((await elencaVoci({ cartella: dati })).length, 2, 'altra + ONE block entry');
});
