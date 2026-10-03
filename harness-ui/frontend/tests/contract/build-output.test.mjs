import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildProduction } from '../../scripts/build.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const publicFiles = ['index.html', 'app.js', 'styles.css'];

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function fingerprints(output) {
  const manifest = JSON.parse(await readFile(path.join(output, 'build-manifest.json'), 'utf8'));
  return Promise.all([
    'build-manifest.json',
    ...manifest.files.map((file) => file.path),
  ].map(async (name) => [name, await digest(path.join(output, ...name.split('/')))]));
}

test('PHASE1-BUILD-PARALLEL-01 produce un bundle ESM deterministico fuori da public', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-build-'));
  try {
    const publicBefore = await Promise.all(publicFiles.map((name) => digest(path.join(repoRoot, 'harness-ui/public', name))));
    await buildProduction({ outputDir: output });
    const first = await fingerprints(output);
    await buildProduction({ outputDir: output });
    const second = await fingerprints(output);
    assert.deepEqual(second, first);
    assert.deepEqual(await Promise.all(publicFiles.map((name) => digest(path.join(repoRoot, 'harness-ui/public', name)))), publicBefore);
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/u);
  } finally {
    await rimuoviCartellaDiProvaAttesa(output);
  }
});

/*
 * F5 File reader (26/09/2026) — il server statico serve al massimo `MAX_STATIC_BYTES` per file: oltre, la richiesta
 *   fallisce e la pagina non lo dice (la prova browser l'ha preso sulla resa PowerPoint, 6,7 MB non minificata). Qui si
 *   chiedono al gestore VERO, sulla build vera, gli asset grossi: `app.js` e le rese Office.
 * 03/10/2026: il tetto è passato da 4 a 8 MiB (owner), perché col dizionario it+en `app.js` pesa 4,22 MB. Questa prova l'ha
 *   preso: era rossa con la corsia E della lingua, prima che il tetto si alzasse.
 */
test('F5-BUILD-TETTO: ogni asset grosso della build si serve davvero, sotto il tetto del server statico', async () => {
  const { createStaticHandler } = await import('../../../src/static-files.mjs');
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-build-'));
  try {
    await buildProduction({ outputDir: output });
    const serve = createStaticHandler(output);
    for (const asset of ['/app.js', '/styles.css', '/lettore-foglio.js', '/lettore-ospite-documento.js', '/lettore-ospite-presentazione.js']) {
      const risposta = await serve(asset);
      assert.equal(risposta?.statusCode, 200, `${asset} non si serve`);
      assert.match(risposta.contentType, /^text\/(?:javascript|css)/u, asset);
    }
  } finally {
    await rimuoviCartellaDiProvaAttesa(output);
  }
});

/* Il verso contrario (03/10/2026): il tetto c'è ancora. Un asset di 8 MiB esatti si serve; un byte in più no, e lo dice col
   codice. Il disco è finto (`fsAdapter`): si prova il gestore, non la build. */
test('F5-BUILD-TETTO AL CONTRARIO: oltre 8 MiB il gestore statico rifiuta con PAYLOAD_LIMIT', async () => {
  const { createStaticHandler } = await import('../../../src/static-files.mjs');
  const TETTO = 8 * 1024 * 1024;
  const serviDiTaglia = (n) => createStaticHandler('/finto', { readFile: async () => Buffer.alloc(n) });
  assert.equal((await serviDiTaglia(TETTO)('/app.js'))?.statusCode, 200);
  await assert.rejects(serviDiTaglia(TETTO + 1)('/app.js'), (errore) => errore.code === 'PAYLOAD_LIMIT');
});
