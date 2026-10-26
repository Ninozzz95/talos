import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { copiaHelperDegliAllegati } from '../scripts/prepara-pacchetto.mjs';
import { saveChatFile } from '../../src/chat-file-upload.mjs';

/*
 * 25/10/2026 — prova dal vivo dal Pad sull'app 0.1.37 INSTALLATA: «Impossibile aggiungere il file». Il pacchetto copiava
 * `talos-chat-upload.exe` senza il suo `.sha256`, e `saveChatFile` esegue l'helper solo se l'impronta combacia col lock accanto.
 * Qui: il passo del pacchetto porta il lock (e si ferma se manca o non combacia), e un helper messo come nel pacchetto salva davvero.
 */
const HELPER = fileURLToPath(new URL('../../native/talos-chat-upload.exe', import.meta.url));
const senzaHelper = !existsSync(HELPER);
const sha = (b) => createHash('sha256').update(b).digest('hex');

function banco(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-helper-allegati-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const origine = join(dir, 'native');
  mkdirSync(origine);
  copyFileSync(HELPER, join(origine, 'talos-chat-upload.exe'));
  return { dir, origine, destinazione: join(dir, 'pacchetto', 'native'), impronta: sha(readFileSync(HELPER)) };
}

test('PKG-HELPER-01 il pacchetto porta il lock accanto all\'helper, e si ferma se manca o non combacia', { skip: senzaHelper }, async (t) => {
  const b = banco(t);
  await assert.rejects(copiaHelperDegliAllegati(b.origine, b.destinazione), /sha256 manca/u, 'senza lock: fermo');
  writeFileSync(join(b.origine, 'talos-chat-upload.exe.sha256'), `${'0'.repeat(64)}  talos-chat-upload.exe\n`);
  await assert.rejects(copiaHelperDegliAllegati(b.origine, b.destinazione), /SHA256 non corrispondente/u, 'lock sbagliato: fermo');
  writeFileSync(join(b.origine, 'talos-chat-upload.exe.sha256'), `${b.impronta}  talos-chat-upload.exe\n`);
  assert.equal(await copiaHelperDegliAllegati(b.origine, b.destinazione), b.impronta);
  assert.equal(readFileSync(join(b.destinazione, 'talos-chat-upload.exe.sha256'), 'utf8').split(/\s+/u)[0], b.impronta);
  assert.equal(sha(readFileSync(join(b.destinazione, 'talos-chat-upload.exe'))), b.impronta);
});

test('PKG-HELPER-02 un helper messo come nel pacchetto salva l\'allegato; senza il lock accanto fallisce onesto, senza lanciare niente', { skip: senzaHelper }, async (t) => {
  const b = banco(t);
  writeFileSync(join(b.origine, 'talos-chat-upload.exe.sha256'), `${b.impronta}  talos-chat-upload.exe\n`);
  await copiaHelperDegliAllegati(b.origine, b.destinazione);
  const progetto = join(b.dir, 'progetto');
  mkdirSync(progetto);
  const esito = await saveChatFile({ rootDir: progetto, name: 'ordini.csv', source: Readable.from([Buffer.from('a,b\n1,2\n')]), helperPath: join(b.destinazione, 'talos-chat-upload.exe') });
  assert.equal(readFileSync(join(progetto, esito.percorso), 'utf8'), 'a,b\n1,2\n');
  /* il verso contrario: il pacchetto di prima, senza il lock */
  rmSync(join(b.destinazione, 'talos-chat-upload.exe.sha256'));
  await assert.rejects(
    saveChatFile({ rootDir: progetto, name: 'altro.csv', source: Readable.from([Buffer.from('x')]), helperPath: join(b.destinazione, 'talos-chat-upload.exe') }),
    (e) => e.code === 'FILE_WRITE_FAILED',
  );
  assert.equal(existsSync(join(progetto, 'allegati', 'altro.csv')), false);
});
