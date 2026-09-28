import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copiaAssistenza, fileProduzione, verificaImpronta, inventario } from '../scripts/prepara-pacchetto.mjs';

test('R02-INTEGRITA — impronta alterata blocca il pacchetto', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r02-hash-'));
  const file = join(dir, 'asset.zip'); writeFileSync(file, 'abc');
  await verificaImpronta(file, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(verificaImpronta(file, '0'.repeat(64)), /SHA256/);
});

test('R02-SELEZIONE — niente prove, mappe, modelli, segreti o junction nei sorgenti', async () => {
  for (const file of ['kernel/talosHarness.mjs', 'node/migrations/001-context.sql', 'assets/index.js', 'talos/brand/logo-short.svg', 'scratch.mjs', 'src/scratch.mjs']) assert.equal(fileProduzione(file), true, file);
  for (const file of ['kernel/talosHarness.test.mjs', 'a.spec.mjs', 'tests/a.mjs', '.env', 'a.gguf', 'scratch/a.mjs', 'scratchpad/b.mjs', 'src/.env', 'bundle.js.map']) assert.equal(fileProduzione(file), false, file);
  const dir = mkdtempSync(join(tmpdir(), 'talos-r02-link-'));
  mkdirSync(join(dir, 'esterno')); mkdirSync(join(dir, 'radice'));
  symlinkSync(join(dir, 'esterno'), join(dir, 'radice', 'link'), 'junction');
  await assert.rejects(inventario(join(dir, 'radice')), /collegamento/i);
});

test('R02-MANIFEST — nomi ordinati, byte e impronte per ogni file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r02-manifest-'));
  writeFileSync(join(dir, 'z.txt'), 'abc'); writeFileSync(join(dir, 'a.txt'), 'x');
  const files = await inventario(dir);
  assert.deepEqual(files.map(f => f.path), ['a.txt', 'z.txt']);
  assert.equal(files[1].bytes, 3);
  assert.equal(files[1].sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('R02-ASSISTENZA — corpus copiato, impronta inventariata e mapping runtime esatto', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r02-assistenza-'));
  const sorgente = join(dir, 'sorgente');
  const destinazione = join(dir, 'staging', 'docs', 'assistenza');
  const contenuto = '# Accesso pieno\n\nLa sessione puo usare ogni strumento consentito.\n';
  mkdirSync(join(sorgente, 'sezioni'), { recursive: true });
  writeFileSync(join(sorgente, 'permessi-di-sessione.md'), contenuto);
  writeFileSync(join(sorgente, 'sezioni', 'indice.md'), '# Indice\n');

  await copiaAssistenza({ sorgente, destinazione });

  assert.equal(readFileSync(join(destinazione, 'permessi-di-sessione.md'), 'utf8'), contenuto);
  const files = await inventario(join(dir, 'staging'));
  const noto = files.find(file => file.path === 'docs/assistenza/permessi-di-sessione.md');
  assert.deepEqual(noto, {
    path: 'docs/assistenza/permessi-di-sessione.md',
    bytes: Buffer.byteLength(contenuto),
    sha256: createHash('sha256').update(contenuto).digest('hex'),
  });

  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    packageJson.build.extraResources.filter(resource => resource.to === 'docs'),
    [{ from: '.staging/docs', to: 'docs' }],
  );
});

test('R02-COMPLETEZZA — ogni file di produzione tracciato in src entra nel pacchetto', async () => {
  /* 28/09/2026: `src/scratch.mjs` restava fuori perché il suo NOME cadeva in una regola pensata per le cartelle, e il server
     installato non partiva. Una selezione per esclusione va provata al contrario: tutto ciò che il repository traccia come
     sorgente di produzione deve passare, e ciò che resta fuori deve essere una prova o un file dichiarato. */
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const radice = fileURLToPath(new URL('../../..', import.meta.url));
  const tracciati = execFileSync('git', ['-C', radice, 'ls-files', '-z', '--', 'harness-ui/src', 'context-engine/src'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  assert.ok(tracciati.length > 100, `premessa: la lista dei sorgenti non è vuota (${tracciati.length})`);
  const fuori = tracciati
    .map((p) => p.replace(/^harness-ui\/src\/|^context-engine\/src\//u, ''))
    .filter((p) => !fileProduzione(p))
    .filter((p) => !/\.(test|spec)\.[^.]+$/iu.test(p) && !/(^|\/)(tests?|__tests__|fixtures)\//iu.test(p));
  assert.deepEqual(fuori, [], `file di produzione esclusi dal pacchetto: ${fuori.join(', ')}`);
});
