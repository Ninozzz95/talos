import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 25/10/2026 (revisione del blocco 0.1.38, riserva 2): dove la ricostruzione dell'helper degli allegati non può esserci — il
 * pacchetto installato non porta `scripts/` — `saveChatFile` non deve lanciare niente: prima rilanciava `process.execPath`, che
 * nell'app apriva una seconda istanza di TALOS. La prova gira in un processo a parte su una copia di `src/` messa come nel pacchetto
 * (src + native, niente scripts), con l'exe e SENZA il lock; e al contrario, col lock, salva.
 */
const QUI = fileURLToPath(new URL('..', import.meta.url));
const HELPER = join(QUI, 'native', 'talos-chat-upload.exe');
const senzaHelper = !existsSync(HELPER);

const SONDA = `
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const [radice, cartella] = process.argv.slice(2);
const { saveChatFile } = await import(pathToFileURL(join(radice, 'src', 'chat-file-upload.mjs')).href);
const inizio = Date.now();
try {
  const esito = await saveChatFile({ rootDir: cartella, name: 'prova.txt', source: Readable.from([Buffer.from('ok')]) });
  console.log(JSON.stringify({ ok: true, percorso: esito.percorso, ms: Date.now() - inizio }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: e.code, message: e.message, ms: Date.now() - inizio }));
}
`;

function pacchetto(t, { conLock }) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-helper-senza-build-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const radice = join(dir, 'harness-ui');
  cpSync(join(QUI, 'src'), join(radice, 'src'), { recursive: true });
  cpSync(join(QUI, 'package.json'), join(radice, 'package.json'));
  mkdirSync(join(radice, 'native'));
  cpSync(HELPER, join(radice, 'native', 'talos-chat-upload.exe'));
  if (conLock) cpSync(`${HELPER}.sha256`, join(radice, 'native', 'talos-chat-upload.exe.sha256'));
  const progetto = join(dir, 'progetto');
  mkdirSync(progetto);
  const sonda = join(dir, 'sonda.mjs');
  writeFileSync(sonda, SONDA);
  return { radice, progetto, sonda };
}

const esegui = ({ radice, progetto, sonda }) => {
  const r = spawnSync(process.execPath, [sonda, radice, progetto], { encoding: 'utf8', timeout: 60_000 });
  return JSON.parse(r.stdout.trim().split('\n').at(-1));
};

test('HELPER-SENZA-BUILD-01 come nel pacchetto (niente scripts/) e senza lock: fallimento onesto, subito, niente lanciato', { skip: senzaHelper || !existsSync(`${HELPER}.sha256`) }, (t) => {
  const p = pacchetto(t, { conLock: false });
  const esito = esegui(p);
  assert.equal(esito.ok, false);
  assert.equal(esito.code, 'FILE_WRITE_FAILED');
  assert.match(esito.message, /cannot be rebuilt here/u, 'la protezione nuova, non la ricostruzione fallita');
  assert.ok(esito.ms < 5_000, `troppo lento per non aver lanciato niente: ${esito.ms} ms`);
  assert.equal(existsSync(join(p.progetto, 'allegati')) && readdirSync(join(p.progetto, 'allegati')).length > 0, false);
});

test('HELPER-SENZA-BUILD-02 al contrario: lo stesso pacchetto col lock salva', { skip: senzaHelper || !existsSync(`${HELPER}.sha256`) }, (t) => {
  const p = pacchetto(t, { conLock: true });
  const esito = esegui(p);
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.equal(esito.percorso, 'allegati/prova.txt');
});
