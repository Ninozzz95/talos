/*
 * COD-248 del telefono, decisione 43 dell'owner: dove `talos-chat-upload.exe` non esiste l'ospite salva con `salvaAllegatoSenzaAiutante`.
 * Forma: Downloads/TALOS/mobile/in-corso/FORMA-COD-248-SALVATAGGIO-ALLEGATI-2026-11-03.md, coi ritocchi di Performance e CLI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { MAX_CHAT_FILE_BYTES, MAX_DEVICE_FILE_BYTES, saveChatFile } from '../src/chat-file-upload.mjs';
import { salvaAllegatoSenzaAiutante } from '../src/allegato-senza-aiutante.mjs';
import { allegatiDellOspite } from '../src/allegati-dell-ospite.mjs';
import { creaArchivioAllegati } from '../src/allegati-dati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function radice(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-senza-aiutante-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}
const voci = (cartella) => (existsSync(join(cartella, 'allegati')) ? readdirSync(join(cartella, 'allegati')) : []);

test('SALVA-01 il file finisce in allegati/<nome> coi byte giusti, e la ricevuta è quella di saveChatFile', async (t) => {
  const rootDir = radice(t);
  const ricevuta = await salvaAllegatoSenzaAiutante({ rootDir, name: 'fattura.pdf', source: Readable.from([Buffer.from('ab'), Buffer.from('cd')]) });
  assert.deepEqual(ricevuta, { tipo: 'file', nome: 'fattura.pdf', percorso: 'allegati/fattura.pdf', bytes: 4 });
  assert.equal(readFileSync(join(rootDir, 'allegati', 'fattura.pdf'), 'utf8'), 'abcd');
  assert.deepEqual(voci(rootDir), ['fattura.pdf']);
});

test('SALVA-02 un nome che esce dalla cartella si rifiuta, e `source` si consuma lo stesso', async (t) => {
  const rootDir = radice(t);
  let letti = 0;
  const source = (async function* () { letti += 1; yield Buffer.from('x'); letti += 1; })();
  await assert.rejects(salvaAllegatoSenzaAiutante({ rootDir, name: '../fuori.txt', source }), (e) => e.code === 'QUERY_INVALID');
  assert.equal(letti, 2);
  assert.deepEqual(voci(rootDir), []);
});

test('SALVA-03 oltre il tetto niente file finale né parziale, e il corpo si legge fino in fondo', async (t) => {
  const rootDir = radice(t);
  let letti = 0;
  const source = (async function* () { for (let i = 0; i < 4; i += 1) { letti += 1; yield Buffer.alloc(4); } })();
  await assert.rejects(salvaAllegatoSenzaAiutante({ rootDir, name: 'a.bin', source, tetto: 10 }), (e) => e.code === 'PAYLOAD_LIMIT');
  assert.equal(letti, 4);
  assert.deepEqual(voci(rootDir), []);
});

test('SALVA-03 bis esattamente al tetto passa, un byte oltre no', async (t) => {
  const piena = radice(t);
  assert.equal((await salvaAllegatoSenzaAiutante({ rootDir: piena, name: 'a.bin', source: Readable.from([Buffer.alloc(10)]), tetto: 10 })).bytes, 10);
  await assert.rejects(salvaAllegatoSenzaAiutante({ rootDir: radice(t), name: 'a.bin', source: Readable.from([Buffer.alloc(11)]), tetto: 10 }), (e) => e.code === 'PAYLOAD_LIMIT');
});

test('SALVA-03 ter il tetto predefinito è quello di saveChatFile, mai una copia', () => {
  const sorgente = readFileSync(new URL('../src/allegato-senza-aiutante.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /MAX_CHAT_FILE_BYTES/u);
  assert.doesNotMatch(sorgente, /25 \* 1024/u);
  assert.equal(MAX_CHAT_FILE_BYTES, 100 * 1024 * 1024);
  assert.equal(MAX_DEVICE_FILE_BYTES, 25 * 1024 * 1024); // decision 298: phone transfers keep 25 MiB
});

test('SALVA-04 la scelta è dell\'ospite: il telefono ha la sua funzione, il PC nessuna opzione e quindi saveChatFile', (t) => {
  assert.deepEqual(allegatiDellOspite({}), {});
  assert.deepEqual(allegatiDellOspite({ TALOS_LOCALE_OSPITE_DIR: '   ' }), {});
  const telefono = allegatiDellOspite({ TALOS_LOCALE_OSPITE_DIR: '/data/ospite' });
  assert.equal(telefono.salva, salvaAllegatoSenzaAiutante);
  assert.ok(telefono.tetti.byteTotali > 0);
  assert.notEqual(telefono.salva, saveChatFile);
  const sorgente = readFileSync(new URL('../src/allegato-senza-aiutante.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(sorgente, /LOCALE_OSPITE|android|telefono\b/iu, 'ritocco 1 della CLI: il modulo non sa nulla del telefono');
  t.diagnostic('il modulo serve anche alla CLI su Mac e Linux');
});

test('SALVA-05 uno stream che si rompe a metà: nessun file, nessun parziale, l\'errore risale', async (t) => {
  const rootDir = radice(t);
  const guasto = Object.assign(new Error('dispositivo caduto'), { code: 'ECONNRESET' });
  const source = (async function* () { yield Buffer.from('abc'); throw guasto; })();
  await assert.rejects(salvaAllegatoSenzaAiutante({ rootDir, name: 'a.bin', source }), (e) => e === guasto);
  assert.deepEqual(voci(rootDir), []);
});

test('SALVA-05 bis un corpo interrotto senza errore non diventa un file a metà', async (t) => {
  const rootDir = radice(t);
  const source = (async function* () { yield Buffer.from('abc'); })();
  source.complete = false;
  await assert.rejects(salvaAllegatoSenzaAiutante({ rootDir, name: 'a.bin', source }), (e) => e.code === 'UPLOAD_ABORTED');
  assert.deepEqual(voci(rootDir), []);
});

test('SALVA-05 ter un pezzo che non è fatto di byte si rifiuta, e il resto si consuma', async (t) => {
  const rootDir = radice(t);
  let letti = 0;
  const source = (async function* () { letti += 1; yield 'testo'; letti += 1; yield Buffer.from('a'); letti += 1; })();
  await assert.rejects(salvaAllegatoSenzaAiutante({ rootDir, name: 'a.bin', source }), (e) => e.code === 'QUERY_INVALID');
  assert.equal(letti, 3);
  assert.deepEqual(voci(rootDir), []);
});

test('SALVA-06 condizione di Performance: 50 MB a pezzi, mai il file intero in memoria', async (t) => {
  const rootDir = radice(t);
  const pezzo = Buffer.alloc(1024 * 1024, 7);
  const prima = process.memoryUsage();
  let picco = 0;
  const source = (async function* () {
    for (let i = 0; i < 50; i += 1) {
      const ora = process.memoryUsage();
      picco = Math.max(picco, (ora.heapUsed + ora.external + ora.arrayBuffers) - (prima.heapUsed + prima.external + prima.arrayBuffers));
      yield pezzo;
    }
  })();
  const ricevuta = await salvaAllegatoSenzaAiutante({ rootDir, name: 'grande.bin', source, tetto: 60 * 1024 * 1024 });
  assert.equal(ricevuta.bytes, 50 * 1024 * 1024);
  assert.ok(picco < 16 * 1024 * 1024, `crescita ${Math.round(picco / 1024 / 1024)} MB`);
});

test('SALVA-07 un file già al posto del nome finale non si sovrascrive', async (t) => {
  const rootDir = radice(t);
  mkdirSync(join(rootDir, 'allegati'));
  writeFileSync(join(rootDir, 'allegati', 'a.txt'), 'vecchio');
  await assert.rejects(salvaAllegatoSenzaAiutante({ rootDir, name: 'a.txt', source: Readable.from([Buffer.from('nuovo')]) }), (e) => e.code === 'FILE_EXISTS');
  assert.equal(readFileSync(join(rootDir, 'allegati', 'a.txt'), 'utf8'), 'vecchio');
  assert.deepEqual(voci(rootDir), ['a.txt']);
});

test('SALVA-08 con l\'archivio: riferimento opaco e `voce.json`, la strada intera dell\'ospite', async (t) => {
  const cartella = radice(t);
  const archivio = creaArchivioAllegati({ cartella, salva: salvaAllegatoSenzaAiutante });
  const ricevuta = await archivio.salva({ nome: 'note.txt', source: Readable.from([Buffer.from('ciao')]), previsti: 4 });
  assert.match(ricevuta.allegatoId, /^[0-9a-f]{24}$/u);
  assert.equal(ricevuta.percorso, `attachments/${ricevuta.allegatoId}/note.txt`);
  assert.equal(readFileSync(archivio.percorsoDi(ricevuta.allegatoId), 'utf8'), 'ciao');
});
