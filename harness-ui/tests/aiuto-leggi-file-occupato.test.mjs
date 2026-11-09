/*
 * La prova di `aiuto/leggi-file-occupato.mjs` (CI #91, 09/11/2026: GS-06/08/09 rosso con EBUSY su Windows). Il contratto:
 *   · EBUSY che passa ⇒ il contenuto vero; · EBUSY che resta oltre il tetto ⇒ FALLISCE con EBUSY (mai un file saltato, mai vuoto);
 *   · ogni altro codice ⇒ subito, senza aspettare.
 * Le prime tre con la lettura iniettata (deterministiche); le ultime due sul disco vero di Windows, dove un handle esclusivo
 * (`UV_FS_O_EXLOCK` di libuv) dà la stessa violazione di condivisione che dava il figlio della shell.
 */
import assert from 'node:assert/strict';
import { closeSync, constants, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ATTESE_FILE_OCCUPATO_MS, leggiFileOccupato } from './aiuto/leggi-file-occupato.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const errore = (code) => Object.assign(new Error(`${code}: finto`), { code });
/** Una lettura che lancia gli errori dati, uno per chiamata, poi restituisce il contenuto. */
function letturaChe(...errori) {
  const chiamate = [];
  return { chiamate, leggi: (p) => { chiamate.push(p); const e = errori.shift(); if (e) throw e; return Buffer.from('PATH=x'); } };
}

test('LFO-1 — EBUSY che passa: si aspetta e si legge il contenuto vero', async () => {
  const l = letturaChe(errore('EBUSY'), errore('EBUSY'));
  const b = await leggiFileOccupato('/finto/a.txt', { leggi: l.leggi, attese: [1, 1, 1] });
  assert.equal(b.toString(), 'PATH=x');
  assert.equal(l.chiamate.length, 3);
});

test('LFO-2, VERSO CHE DEVE FALLIRE — EBUSY oltre il tetto: l’errore arriva, il file non si salta', async () => {
  const l = letturaChe(...Array.from({ length: 20 }, () => errore('EBUSY')));
  await assert.rejects(() => leggiFileOccupato('/finto/a.txt', { leggi: l.leggi, attese: [1, 1, 1] }), { code: 'EBUSY' });
  assert.equal(l.chiamate.length, 4, 'tre attese ⇒ quattro letture, poi basta');
  assert.deepEqual(ATTESE_FILE_OCCUPATO_MS, [100, 200, 400, 800, 1600], 'il tetto di serie: ~3,1 s, come `retryHeld` di Hermes');
});

test('LFO-3 — ogni altro codice esce subito, senza attese', async () => {
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'EISDIR']) {
    const l = letturaChe(errore(code));
    await assert.rejects(() => leggiFileOccupato('/finto/a.txt', { leggi: l.leggi, attese: [1, 1, 1] }), { code });
    assert.equal(l.chiamate.length, 1, `${code}: una lettura sola`);
  }
});

const SOLO_WINDOWS = process.platform === 'win32' ? false : 'la violazione di condivisione (EBUSY su un file aperto da altri) è di Windows';
const EXLOCK = constants.UV_FS_O_EXLOCK ?? 0x10000000; // libuv `UV_FS_O_EXLOCK` su Windows; Node 24 non lo espone in `fs.constants`

function fileTenuto(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-lfo-'));
  const file = join(cartella, 'ambiente.txt');
  writeFileSync(file, 'PATH=C:\\finto\r\n');
  const fd = openSync(file, constants.O_RDWR | EXLOCK);
  let chiuso = false;
  const chiudi = () => { if (!chiuso) { chiuso = true; closeSync(fd); } };
  t.after(() => { chiudi(); rimuoviCartellaDiProva(cartella); }); // prima si lascia il file, poi si toglie la cartella
  return { file, chiudi };
}

test('LFO-4 (disco vero) — tenuto in esclusiva: `readFileSync` dà EBUSY (la premessa), l’aiuto aspetta e legge', { skip: SOLO_WINDOWS }, async (t) => {
  const { file, chiudi } = fileTenuto(t);
  assert.throws(() => readFileSync(file), { code: 'EBUSY' }, 'la premessa: senza attesa la lettura fallisce come sulla CI');
  setTimeout(chiudi, 250);
  assert.match((await leggiFileOccupato(file)).toString('utf8'), /^PATH=/u);
});

test('LFO-5 (disco vero), VERSO CHE DEVE FALLIRE — tenuto oltre il tetto: EBUSY, non un contenuto vuoto', { skip: SOLO_WINDOWS }, async (t) => {
  const { file } = fileTenuto(t);
  await assert.rejects(() => leggiFileOccupato(file, { attese: [20, 20] }), { code: 'EBUSY' });
});
