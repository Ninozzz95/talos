/*
 * 22/10/2026 — U+2028 e U+2029 nel giornale delle sessioni. `JSON.stringify` li lascia crudi dentro le stringhe, e il lettore usava
 * `readline`, che li prende per fine riga: una risposta del modello che li conteneva spezzava la sua riga e al riavvio la sessione era
 * SESSION_STORE_CORRUPT. Trovato da CTX-LEGACY-COMPACT-NONJSON-MESSAGE riscritta per il /compact (S2-A), misurato sul codice della 0.1.35.
 * Store VERO, cartelle temporanee proprie, nessuna porta.
 */
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import test from 'node:test';

import {
  attendiScritture, leggiRegistro, leggiRegistroAStream, registraIntestazioneSync, registraRiga, registraRigaConfermata, registraRigaSync, rigaDelGiornale,
} from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SEPARATORI = 'riga\u2028paragrafo\u2029fine';
const ID = '00000000-0000-4000-8000-0000000000aa';

function giornale(t) {
  const cartellaStore = cartellaDiProva('talos-giornale-u2028-');
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  registraIntestazioneSync({ cartellaStore, sessionId: ID, record: { tipo: 'intestazione', titolo: `titolo ${SEPARATORI}` } });
  return { cartellaStore, file: join(cartellaStore, `${ID}.jsonl`) };
}

test('GIORNALE-U2028-01 — le quattro vie di scrittura sfuggono U+2028/U+2029: una riga fisica per record, e la rilettura dà il testo identico', async (t) => {
  const { cartellaStore, file } = giornale(t);
  registraRigaSync({ cartellaStore, sessionId: ID, record: { tipo: 'sync', testo: SEPARATORI } });
  await registraRiga({ cartellaStore, sessionId: ID, record: { tipo: 'asincrona', testo: SEPARATORI } });
  await registraRigaConfermata({ cartellaStore, sessionId: ID, record: { tipo: 'confermata', testo: SEPARATORI } });
  const grezzo = readFileSync(file, 'utf8');
  assert.equal(/[\u2028\u2029]/u.test(grezzo), false, 'nessun separatore crudo sul disco');
  assert.equal(grezzo.split('\n').filter(Boolean).length, 4, 'quattro record, quattro righe');
  const righe = await leggiRegistro({ cartellaStore, sessionId: ID });
  assert.deepEqual(righe.map((r) => r.tipo), ['intestazione', 'sync', 'asincrona', 'confermata']);
  for (const r of righe.slice(1)) assert.equal(r.testo, SEPARATORI);
  assert.equal(righe[0].titolo, `titolo ${SEPARATORI}`);
  assert.equal(rigaDelGiornale({ a: '\u2028' }), '{"a":"\\u2028"}\n');
  assert.deepEqual(JSON.parse(rigaDelGiornale({ a: SEPARATORI })), { a: SEPARATORI }, 'JSON valido, identico alla rilettura');
});

test('GIORNALE-U2028-02 — un giornale scritto dalla versione di PRIMA (separatori crudi) torna leggibile, e i byte per riga sono quelli veri', async (t) => {
  const { cartellaStore, file } = giornale(t);
  const vecchia = `${JSON.stringify({ tipo: 'messaggi-finali', testo: SEPARATORI })}\n`;
  appendFileSync(file, vecchia, 'utf8');
  appendFileSync(file, `${JSON.stringify({ tipo: 'dopo' })}\n`, 'utf8');
  assert.equal(/\u2028/u.test(readFileSync(file, 'utf8')), true, 'premessa: il separatore è crudo, come lo scriveva la 0.1.35');
  const viste = [];
  await leggiRegistroAStream({ cartellaStore, sessionId: ID, perRiga: (record, { byte }) => { viste.push({ tipo: record.tipo, byte }); } });
  assert.deepEqual(viste.map((v) => v.tipo), ['intestazione', 'messaggi-finali', 'dopo']);
  assert.equal(viste[1].byte, Buffer.byteLength(vecchia, 'utf8') - 1, 'i byte della riga intera, senza il fine riga');
  assert.equal((await leggiRegistro({ cartellaStore, sessionId: ID }))[1].testo, SEPARATORI);
});

test('GIORNALE-U2028-03 — AL CONTRARIO: una riga davvero rotta nel MEZZO resta «corrotta»; CRLF è una riga; l\'ultima senza fine riga arriva', async (t) => {
  const { cartellaStore, file } = giornale(t);
  appendFileSync(file, `${JSON.stringify({ tipo: 'crlf' })}\r\n`, 'utf8');
  appendFileSync(file, `${JSON.stringify({ tipo: 'ultima' })}`, 'utf8');
  const righe = await leggiRegistro({ cartellaStore, sessionId: ID });
  assert.deepEqual(righe.map((r) => r.tipo), ['intestazione', 'crlf', 'ultima']);
  /* `JSON.parse` tollererebbe il `\r` finale: lo si vede solo dai byte, che senza `\r` sono quelli del JSON (come con readline) */
  const byte = {};
  await leggiRegistroAStream({ cartellaStore, sessionId: ID, perRiga: (record, info) => { byte[record.tipo] = info.byte; } });
  assert.equal(byte.crlf, Buffer.byteLength(JSON.stringify({ tipo: 'crlf' }), 'utf8'));
  assert.equal(byte.ultima, Buffer.byteLength(JSON.stringify({ tipo: 'ultima' }), 'utf8'));

  const rotto = giornale(t);
  appendFileSync(rotto.file, '{"tipo":"spezzata", "testo": "\n', 'utf8');
  appendFileSync(rotto.file, `${JSON.stringify({ tipo: 'dopo' })}\n`, 'utf8');
  await assert.rejects(leggiRegistro({ cartellaStore: rotto.cartellaStore, sessionId: ID }), (e) => e.code === 'SESSION_STORE_CORRUPT');
});

test('GIORNALE-RIGA-LUNGA-01 — revisione avversaria: una riga lunga che arriva in tanti pezzi si legge in tempo lineare (prima: quadratico)', async () => {
  /* 32 MB in pezzi da 4 KB: col lettore di prima (`resto += pezzo` e la ricerca di `\n` da capo) erano ~8.000 ricerche su una stringa che
     cresce fino a 32 MB; ora si cerca solo nel pezzo nuovo. Con 8 MB il quadratico restava sotto la soglia (la ricerca di V8 è veloce) e il
     mutante sopravviveva. Lo stream si inietta: il file sul disco serve solo per la dimensione. */
  const testo = 'x'.repeat(32 * 1024 * 1024);
  const riga = `${JSON.stringify({ tipo: 'checkpoint', testo })}\n`;
  const pezzi = [];
  for (let i = 0; i < riga.length; i += 4096) pezzi.push(riga.slice(i, i + 4096));
  const cartellaStore = cartellaDiProva('talos-riga-lunga-');
  try {
    registraIntestazioneSync({ cartellaStore, sessionId: ID, record: { tipo: 'intestazione' } });
    appendFileSync(join(cartellaStore, `${ID}.jsonl`), riga, 'utf8'); // la dimensione vera, per `end` e per l'ultimo byte
    const intestazione = `${JSON.stringify({ tipo: 'intestazione' })}\n`;
    const createReadStreamFn = () => Readable.from([intestazione, ...pezzi]);
    const inizio = performance.now();
    const viste = [];
    await leggiRegistroAStream({ cartellaStore, sessionId: ID, perRiga: (record) => { viste.push(record.tipo); } }, { createReadStreamFn });
    const ms = performance.now() - inizio;
    assert.deepEqual(viste, ['intestazione', 'checkpoint']);
    assert.ok(ms < 3_000, `32 MB in ${pezzi.length} pezzi letti in ${Math.round(ms)} ms`);
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});
