/*
 * 24/09/2026 — F2-bis, corsia A (negozio): il journal si legge A STREAM, riga per riga, mai come una stringa
 * intera. Misura che lo impone (banco `tests/bench/sessione-lunga-journal.mjs`, F2 §2.7): `leggiRegistro`
 * faceva `readFile(percorso, 'utf8')` e V8 rifiuta una stringa oltre 2^29-24 caratteri (~512 MiB) — il replay
 * moriva a ~218 turni col formato di oggi («Invalid string length»), e `fs.readFile` ha il suo muro a 2 GiB
 * (`ERR_FS_FILE_TOO_LARGE`: «consider using fs.createReadStream() to read the file in chunks», doc Node v24
 * `errors`, letta il 24/09/2026 via ctx7 `/websites/nodejs_latest-v24_x_api`).
 *
 * Qui: `leggiRegistroAStream({cartellaStore, sessionId, perRiga})` (la porta per la corsia B), i tipi di record
 * nuovi del formato a delta (`messaggi-delta`, `checkpoint`) che il negozio conserva come dati OPACHI, e la
 * riparazione della coda spezzata che resta a stream (scansione della sola coda, copia del prefisso a stream).
 * Tutti RED sulla base `2eb77accb` (misurato prima della cura: RAPPORTO-F2BIS-A-NEGOZIO.md §2).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, createReadStream, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as sessionStore from '../src/session-store.mjs';
import { leggiRegistro, registraRiga, registraRigaConfermata } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartellaTemporanea(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-store-stream-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const backupDi = (cartellaStore, sessionId) => readdirSync(cartellaStore).filter((n) => n.startsWith(`${sessionId}.jsonl.bak-`));
const rigaDi = (record) => `${JSON.stringify(record)}\n`;

/** Un journal nel formato a delta: intestazione, un delta, un checkpoint «grosso», un altro delta. */
function journalDelta(cartellaStore, sessionId, { byteCheckpoint = 200 * 1024 } = {}) {
  const messaggi = (turno) => [
    { role: 'user', content: `Turno ${turno}` },
    { role: 'assistant', content: `Risposta ${turno}`, tool_calls: [{ id: `call_${turno}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: `call_${turno}`, content: 'x'.repeat(64) },
    { role: 'assistant', content: `Fatto ${turno}.` },
  ];
  const storia = [...messaggi(1), ...messaggi(2)];
  storia[2].content = 'c'.repeat(byteCheckpoint); // il checkpoint pesa più di un blocco di lettura (64 KiB)
  const record = [
    { tipo: 'intestazione', schema: 1, sessionId, taskId: 't', cartella: 'C:/p', task: 'prova', avviataAlle: '2026-09-24T06:00:00.000Z', modello: 'finto', permessi: 'chiedi' },
    { type: 'RunStarted', threadId: sessionId, runId: 'run-1', _sequenza: 1 },
    { tipo: 'messaggi-delta', versioneGiro: 1, da: 0, messaggi: messaggi(1) },
    { tipo: 'messaggi-delta', versioneGiro: 2, da: 4, messaggi: messaggi(2) },
    { tipo: 'checkpoint', versioneGiro: 2, storia, recordCompattazione: null },
    { tipo: 'messaggi-delta', versioneGiro: 3, da: 8, messaggi: messaggi(3) },
  ];
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(percorso, record.map(rigaDi).join(''));
  return { percorso, record };
}

// ───────────────────────────── 1. la porta a stream ─────────────────────────────

test('CTX-STORE-STREAM-API-ORDERS-RECORDS — leggiRegistroAStream chiama perRiga per ogni record, in ordine, con indice e byte della riga', async (t) => {
  assert.equal(typeof sessionStore.leggiRegistroAStream, 'function', 'leggiRegistroAStream deve essere esportata');
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-ordine';
  const { record } = journalDelta(cartellaStore, sessionId);
  const visti = [];
  const esito = await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: (r, meta) => { visti.push({ r, meta }); } });
  assert.deepEqual(visti.map((v) => v.r), record, 'i record arrivano identici e nell ordine del file');
  assert.deepEqual(visti.map((v) => v.meta.indice), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(visti.map((v) => v.meta.byte), record.map((r) => Buffer.byteLength(JSON.stringify(r))), 'byte della riga senza il fine riga');
  assert.equal(esito.record, 6);
  assert.equal(esito.riparazione, null, 'un file sano non porta una riparazione');
  assert.equal(esito.interrotta, false);
  assert.equal(await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId: 'mai-nata', perRiga: () => {} }), null, 'ENOENT ⇒ null, come leggiRegistro');
});

test('CTX-STORE-STREAM-NEVER-WHOLE-FILE — la lettura passa dallo stream a blocchi (seam createReadStreamFn), non da readFile: più blocchi per un file più grande di uno', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-blocchi';
  journalDelta(cartellaStore, sessionId, { byteCheckpoint: 300 * 1024 });
  let blocchi = 0;
  let readFileUsato = false;
  const deps = {
    readFileFn: async () => { readFileUsato = true; throw new Error('readFile non deve essere usato'); },
    createReadStreamFn: (percorso, opzioni) => {
      const s = createReadStream(percorso, { ...opzioni, highWaterMark: 64 * 1024 });
      s.on('data', () => { blocchi += 1; });
      return s;
    },
  };
  const esito = await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: () => {} }, deps);
  assert.equal(esito.record, 6);
  assert.equal(readFileUsato, false);
  assert.ok(blocchi >= 5, `un journal da ~300 KiB letto a blocchi di 64 KiB deve passare in almeno 5 blocchi, ne ha usati ${blocchi}`);
  // E leggiRegistro (contratto invariato: l'array) passa dalla stessa strada.
  blocchi = 0;
  const letto = await leggiRegistro({ cartellaStore, sessionId }, deps);
  assert.equal(letto.length, 6);
  assert.equal(readFileUsato, false);
  assert.ok(blocchi >= 5, `leggiRegistro deve leggere a blocchi: ${blocchi}`);
});

test('CTX-STORE-STREAM-OPAQUE-DELTA-AND-CHECKPOINT — messaggi-delta e checkpoint scritti dai writer del negozio tornano identici, e il file non è stato toccato', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-opachi';
  const delta = { tipo: 'messaggi-delta', versioneGiro: 7, da: 24, messaggi: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'salve' }] };
  const checkpoint = { tipo: 'checkpoint', versioneGiro: 7, storia: [{ role: 'system', content: 'regole' }, { role: 'user', content: 'ciao' }], recordCompattazione: { schema: 'talos.compattazione.v1', coveredThrough: 1, at: '2026-09-24T06:00:00.000Z' } };
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'intestazione', sessionId } });
  await registraRiga({ cartellaStore, sessionId, record: delta });
  await registraRigaConfermata({ cartellaStore, sessionId, record: checkpoint });
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  const atteso = rigaDi({ tipo: 'intestazione', sessionId }) + rigaDi(delta) + rigaDi(checkpoint);
  assert.equal(readFileSync(percorso, 'utf8'), atteso, 'una riga per record, nessuna trasformazione');
  const visti = [];
  await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: (r) => { visti.push(r); } });
  assert.deepEqual(visti.slice(1), [delta, checkpoint]);
  assert.deepEqual((await leggiRegistro({ cartellaStore, sessionId })).slice(1), [delta, checkpoint]);
  assert.equal(readFileSync(percorso, 'utf8'), atteso, 'leggere non scrive');
  assert.deepEqual(backupDi(cartellaStore, sessionId), []);
});

test('CTX-STORE-STREAM-STOPS-WHEN-PERRIGA-RETURNS-FALSE — perRiga può fermare la lettura: il resto del file non si legge e lo stream si chiude', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-stop';
  journalDelta(cartellaStore, sessionId);
  let chiuso = false;
  const visti = [];
  const esito = await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: (r) => { visti.push(r.tipo ?? r.type); return r.tipo !== 'intestazione'; } }, {
    createReadStreamFn: (percorso, opzioni) => { const s = createReadStream(percorso, opzioni); s.on('close', () => { chiuso = true; }); return s; },
  });
  assert.deepEqual(visti, ['intestazione']);
  assert.equal(esito.interrotta, true);
  assert.equal(esito.record, 1);
  assert.equal(chiuso, true, 'lo stream del file deve essere chiuso quando la lettura si ferma');
  // Il file resta appendibile: la fermata non lascia il percorso in uno stato incerto.
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'dopo' } });
});

test('CTX-STORE-STREAM-PERRIGA-THROWS — un errore di perRiga arriva al chiamante così com è, senza avvelenare il percorso né lasciare backup', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-lancia';
  const { percorso } = journalDelta(cartellaStore, sessionId);
  const prima = sha256(readFileSync(percorso));
  const mio = new Error('il consumatore ha rifiutato il record');
  await assert.rejects(() => sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: (r) => { if (r.tipo === 'checkpoint') throw mio; } }), (e) => e === mio);
  assert.equal(sha256(readFileSync(percorso)), prima);
  assert.deepEqual(backupDi(cartellaStore, sessionId), []);
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'dopo' } });
});

test('CTX-STORE-STREAM-WAITS-INFLIGHT-WRITE — la lettura a stream si mette in fila dietro un append della stessa sessione', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-in-fila';
  let libera;
  const attesa = new Promise((resolve) => { libera = resolve; });
  const writer = registraRiga({ cartellaStore, sessionId, record: { tipo: 'prima' } }, {
    appendFileFn: async (path, data) => { await attesa; appendFileSync(path, data); },
  });
  let iniziata = false;
  const lettura = sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: () => {} }, {
    createReadStreamFn: (p, o) => { iniziata = true; return createReadStream(p, o); },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(iniziata, false, 'la lettura deve aspettare il writer della stessa sessione');
  libera();
  await writer;
  assert.equal((await lettura).record, 1);
});

// ───────────────────────────── 2. la coda spezzata, a stream ─────────────────────────────

test('JOURNAL-TORN-TAIL-AFTER-CHECKPOINT-REPAIRED — un delta spezzato dopo un checkpoint: i record fino al checkpoint arrivano, la coda si ripara con .bak, gli append riprendono', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-coda-spezzata';
  const { percorso, record } = journalDelta(cartellaStore, sessionId);
  const sano = readFileSync(percorso);
  const spezzata = '{"tipo":"messaggi-delta","versioneGiro":4,"da":12,"messaggi":[{"role":"user","content":"tronc';
  appendFileSync(percorso, spezzata);
  const originale = readFileSync(percorso);
  const visti = [];
  const esito = await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: (r) => { visti.push(r); } });
  assert.deepEqual(visti, record, 'tutti i record interi, niente della coda');
  assert.equal(esito.riparazione?.riparato, true);
  assert.equal(esito.riparazione.righeScartate, 1);
  assert.equal(esito.riparazione.byteScartati, Buffer.byteLength(spezzata));
  assert.equal(esito.riparazione.byteConservati, sano.length);
  assert.ok(esito.riparazione.backup, 'il record dice dov è la copia');
  assert.equal(sha256(readFileSync(esito.riparazione.backup)), sha256(originale), 'il .bak sono i byte originali');
  assert.equal(readFileSync(percorso).equals(sano), true, 'il journal è il prefisso sano, byte per byte');
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'messaggi-delta', versioneGiro: 4, da: 12, messaggi: [] } });
  assert.equal((await leggiRegistro({ cartellaStore, sessionId })).length, record.length + 1);
});

test('CTX-STORE-STREAM-VALID-TAIL-WITHOUT-NEWLINE-COMPLETES — l ultimo record intero senza fine riga arriva a perRiga E il file viene completato con \\n', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-senza-newline';
  const { percorso, record } = journalDelta(cartellaStore, sessionId);
  const ultimo = { tipo: 'messaggi-delta', versioneGiro: 4, da: 12, messaggi: [] };
  appendFileSync(percorso, JSON.stringify(ultimo));
  const visti = [];
  const esito = await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: (r) => { visti.push(r); } });
  assert.deepEqual(visti, [...record, ultimo]);
  assert.equal(esito.riparazione?.completata, true);
  assert.equal(esito.riparazione.righeScartate, 0);
  assert.deepEqual(backupDi(cartellaStore, sessionId), []);
  assert.ok(readFileSync(percorso, 'utf8').endsWith('\n'));
});

test('CTX-STORE-REPAIR-READS-ONLY-THE-TAIL — la riparazione non legge il file intero: niente readFile, il prefisso sano si copia a stream con end = byteConservati - 1', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'riparazione-a-stream';
  const { percorso } = journalDelta(cartellaStore, sessionId, { byteCheckpoint: 3 * 1024 * 1024 });
  const sano = readFileSync(percorso);
  appendFileSync(percorso, '{"tipo":"messaggi-delta","versioneGiro":9,"da":');
  let readFileUsato = false;
  const letture = [];
  const esito = await sessionStore.riparaCodaSpezzata({ cartellaStore, sessionId }, {
    readFileFn: async () => { readFileUsato = true; throw new Error('readFile non deve essere usato'); },
    createReadStreamFn: (p, opzioni) => { letture.push(opzioni); return createReadStream(p, opzioni); },
  });
  assert.equal(esito.riparato, true);
  assert.equal(readFileUsato, false, 'la riparazione non deve materializzare il file intero');
  assert.equal(esito.byteConservati, sano.length);
  assert.deepEqual(letture.map((o) => o?.end), [sano.length - 1], 'il prefisso sano si copia a stream, fino all ultimo byte conservato');
  assert.equal(readFileSync(percorso).equals(sano), true);
  assert.equal(sha256(readFileSync(esito.backup)).length, 64);
});

test('CTX-STORE-REPAIR-BIG-BROKEN-TERMINATED-LINE — ultima riga rotta, terminata e PIÙ LUNGA di un blocco di lettura: si scarta lei sola, il checkpoint prima resta intero', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'coda-terminata-grossa';
  // La riga rotta (~100 KiB, terminata da `\n`) supera il blocco di 64 KiB della scansione all'indietro: l'ultimo
  // blocco contiene UN solo `\n` (il suo). Una scansione che si fermasse al primo `\n` visto prenderebbe l'inizio
  // del blocco per l'inizio della riga e troncherebbe il file DENTRO la riga rotta, lasciandola rotta.
  const { percorso, record } = journalDelta(cartellaStore, sessionId);
  const sano = readFileSync(percorso);
  const rotta = `{"tipo":"messaggi-delta","versioneGiro":4,"da":12,"messaggi":[{"role":"tool","content":"${'x'.repeat(100 * 1024)}\n`;
  writeFileSync(percorso, Buffer.concat([sano, Buffer.from(rotta)]));
  const visti = [];
  const esito = await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: (r) => { visti.push(r); } });
  assert.deepEqual(visti, record);
  assert.equal(esito.riparazione?.riparato, true);
  assert.equal(esito.riparazione.righeScartate, 1);
  assert.equal(esito.riparazione.byteScartati, Buffer.byteLength(rotta));
  assert.equal(esito.riparazione.byteConservati, sano.length);
  assert.equal(readFileSync(percorso).equals(sano), true, 'il journal riparato è esattamente il prefisso sano, checkpoint compreso');
  assert.equal(sha256(readFileSync(esito.riparazione.backup)), sha256(Buffer.concat([sano, Buffer.from(rotta)])));
});

test('⛔ AL CONTRARIO — CTX-STORE-STREAM-CORRUPT-MID-FILE: una riga rotta NON ultima ferma la lettura con SESSION_STORE_CORRUPT, senza .bak e senza toccare i byte', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-corrotto';
  const percorso = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(percorso, `${rigaDi({ tipo: 'intestazione' })}{"tipo":"messaggi-delta","versioneGiro":1,"da":0,"messaggi":[\n${rigaDi({ tipo: 'checkpoint', versioneGiro: 1, storia: [] })}`);
  const prima = sha256(readFileSync(percorso));
  const visti = [];
  await assert.rejects(
    () => sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: (r) => { visti.push(r.tipo); } }),
    (e) => e?.code === 'SESSION_STORE_CORRUPT',
  );
  assert.deepEqual(visti, ['intestazione'], 'i record prima della riga rotta arrivano, quelli dopo no');
  assert.equal(sha256(readFileSync(percorso)), prima);
  assert.deepEqual(backupDi(cartellaStore, sessionId), []);
  await assert.rejects(() => leggiRegistro({ cartellaStore, sessionId }), (e) => e?.code === 'SESSION_STORE_CORRUPT');
});

test('⛔ AL CONTRARIO — CTX-STORE-STREAM-HEALTHY-UNTOUCHED: un journal sano nel formato a delta resta byte per byte uguale dopo la lettura, nessuna riparazione', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-sano';
  const { percorso, record } = journalDelta(cartellaStore, sessionId);
  const prima = sha256(readFileSync(percorso));
  const esito = await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: () => {} });
  assert.equal(esito.record, record.length);
  assert.equal(esito.riparazione, null);
  assert.equal(sha256(readFileSync(percorso)), prima);
  assert.deepEqual(readdirSync(cartellaStore), [`${sessionId}.jsonl`], 'nessun .bak, nessun temporaneo');
  const esplicita = await sessionStore.riparaCodaSpezzata({ cartellaStore, sessionId });
  assert.equal(esplicita.riparato, false);
  assert.equal(esplicita.motivo, 'sano');
  assert.equal(sha256(readFileSync(percorso)), prima);
});

test('CTX-STORE-STREAM-EMPTY-FILE — un journal vuoto (0 byte) è zero record, non un errore né una riparazione', async (t) => {
  const cartellaStore = cartellaTemporanea(t);
  const sessionId = 'stream-vuoto';
  writeFileSync(join(cartellaStore, `${sessionId}.jsonl`), '');
  const esito = await sessionStore.leggiRegistroAStream({ cartellaStore, sessionId, perRiga: () => { throw new Error('mai chiamata'); } });
  assert.deepEqual(esito, { record: 0, byte: 0, riparazione: null, interrotta: false });
  assert.deepEqual(await leggiRegistro({ cartellaStore, sessionId }), []);
});
