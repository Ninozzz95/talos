import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { nomiArtefatti, preparaRelease } from '../scripts/release-assets.mjs';

test('R04-VERSIONE — nomi R-02 e rifiuto tag/versione o repository malformati', async () => {
  assert.deepEqual(nomiArtefatti('0.1.0'), { exe: 'TALOS-Setup-0.1.0.exe', zip: 'TALOS-0.1.0-win.zip', sha: 'SHA256SUMS.txt', note: 'NOTE-RELEASE.md' });
  assert.throws(() => nomiArtefatti('../x'), /Versione/);
  await assert.rejects(preparaRelease({ versione: '0.1.0', tag: 'desktop-v0.2.0', repository: 'owner/progetto' }), /tag/);
  await assert.rejects(preparaRelease({ versione: '0.1.0', tag: 'desktop-v0.1.0', repository: 'x\ncomando' }), /Repository/);
});

test('R04-SHA — hash reali, note italiane e nessun artefatto decorativo', async t => {
  const distDir = await mkdtemp(join(tmpdir(), 'talos-r04-assets-'));
  t.after(() => rm(distDir, { recursive: true, force: true }));
  const exe = Buffer.from('installer di fixture, non distribuibile');
  const zip = Buffer.from('zip di fixture, non distribuibile');
  const sha = b => createHash('sha256').update(b).digest('hex');
  await writeFile(join(distDir, 'TALOS-Setup-0.1.0.exe'), exe);
  const args = { distDir, versione: '0.1.0', tag: 'desktop-v0.1.0', repository: 'owner/progetto', smoke: { completato: true, installerSha256: sha(exe) } };
  await assert.rejects(preparaRelease(args), /ENOENT/); // R04-ASSET-MANCANTE
  await writeFile(join(distDir, 'TALOS-0.1.0-win.zip'), zip);
  await assert.rejects(preparaRelease({ ...args, smoke: { completato: false } }), /Smoke/);
  await assert.rejects(preparaRelease({ ...args, smoke: { completato: true, installerSha256: '0'.repeat(64) } }), /installer/);
  const risultato = await preparaRelease(args);
  assert.equal(risultato.artefatti.length, 2);
  assert.equal(await readFile(join(distDir, 'SHA256SUMS.txt'), 'utf8'), `${sha(exe)}  TALOS-Setup-0.1.0.exe\n${sha(zip)}  TALOS-0.1.0-win.zip\n`);
  const note = await readFile(join(distDir, 'NOTE-RELEASE.md'), 'utf8');
  for (const testo of ['Windows 10 1809', 'x64', 'SmartScreen', 'Ulteriori informazioni', 'Esegui comunque', 'GGUF', 'telemetria', 'aggiornamenti automatici', sha(exe), sha(zip), 'Get-FileHash', 'gh attestation verify', '--repo owner/progetto']) assert.ok(note.includes(testo), testo);
});
