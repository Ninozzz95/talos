import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProduction } from '../../scripts/build.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔ 08/10/2026 — una build non svuota la cartella sotto chi legge (`scripts/build.mjs`, «LA CARTELLA NON SI SVUOTA MAI»).
 *   Nella suite browser intera dieci spec ricostruiscono `dist` mentre gli altri worker la leggono: 11-48 ENOENT su
 *   `build-manifest.json` per corsa. Qui un lettore rilegge di continuo il manifesto e ogni file che elenca MENTRE una
 *   seconda build gira sulla stessa cartella: con la cartella svuotata prima di costruire (il codice di prima) trova i buchi.
 */
test('BUILD-ATOMICA-01 — durante una build il manifesto e i file che elenca ci sono sempre', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-atomica-'));
  try {
    await buildProduction({ outputDir: output });
    /* Revisione del bugfixer (08/10): con gli stessi nomi di file, un manifesto pubblicato PER PRIMO non si vedeva (i file
       vecchi c'erano già). Si toglie un file e la sua riga dal manifesto: per la seconda build è un file NUOVO, e un
       manifesto che lo elencasse prima di averlo pubblicato darebbe un ENOENT al lettore. */
    const percorsoManifesto = path.join(output, 'build-manifest.json');
    const vecchio = JSON.parse(await readFile(percorsoManifesto, 'utf8'));
    const nuovo = vecchio.files.find((f) => f.path === 'lettore-foglio.js');
    assert.ok(nuovo, 'premessa: la build produce lettore-foglio.js');
    await rm(path.join(output, 'lettore-foglio.js'));
    await writeFile(percorsoManifesto, JSON.stringify({ ...vecchio, files: vecchio.files.filter((f) => f !== nuovo) }), 'utf8');
    let fine = false;
    const buchi = [];
    let letture = 0;
    const lettore = (async () => {
      while (!fine) {
        try {
          const manifesto = JSON.parse(await readFile(path.join(output, 'build-manifest.json'), 'utf8'));
          for (const f of manifesto.files) await readFile(path.join(output, ...f.path.split('/')));
          letture += 1;
        } catch (errore) {
          buchi.push(errore.code || errore.name);
        }
        await new Promise((fatto) => setImmediate(fatto));
      }
    })();
    await buildProduction({ outputDir: output });
    fine = true;
    await lettore;
    assert.ok(letture > 0, 'premessa: il lettore ha letto almeno una volta durante la build');
    assert.deepEqual(buchi, [], `il lettore ha trovato ${buchi.length} buchi`);
  } finally {
    await rimuoviCartellaDiProvaAttesa(output);
  }
});

test('BUILD-ATOMICA-02 — niente cartella d\'appoggio rimasta, e un file che la build non produce più se ne va', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-atomica-'));
  try {
    await buildProduction({ outputDir: output });
    await writeFile(path.join(output, 'vecchio-di-una-build-prima.js'), 'x', 'utf8');
    await buildProduction({ outputDir: output });
    const nomi = await readdir(output);
    assert.equal(nomi.some((n) => n.startsWith('.costruzione-')), false, `appoggio rimasto: ${nomi.join(', ')}`);
    assert.equal(nomi.includes('vecchio-di-una-build-prima.js'), false);
    const manifesto = JSON.parse(await readFile(path.join(output, 'build-manifest.json'), 'utf8'));
    assert.equal(manifesto.files.some((f) => f.path.startsWith('.costruzione-')), false, 'il manifesto non elenca l\'appoggio');
    assert.ok(manifesto.files.some((f) => f.path === 'app.js'));
  } finally {
    await rimuoviCartellaDiProvaAttesa(output);
  }
});

/*
 * Revisione del bugfixer (08/10, GIALLO): una build UCCISA a metà lasciava il suo appoggio per sempre, e la consegna del 4174
 * lo copierebbe in `public/`. La build dopo toglie gli appoggi orfani (processo morto, o più vecchi di dieci minuti) e lascia
 * quello di una build sorella viva.
 */
test('BUILD-ATOMICA-03 — gli appoggi di build morte se ne vanno, quello di una build viva resta', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-atomica-'));
  try {
    const morto = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    const pidMorto = Number(morto.stdout);
    assert.ok(pidMorto > 0, 'premessa: un pid di un processo già finito');
    const orfano = path.join(output, `.costruzione-${pidMorto}-aaaaaaaa`);
    const vivo = path.join(output, `.costruzione-${process.ppid}-bbbbbbbb`);
    const vecchioVivo = path.join(output, `.costruzione-${process.ppid}-cccccccc`);
    for (const d of [orfano, vivo, vecchioVivo]) { await mkdir(d); await writeFile(path.join(d, 'app.js'), 'vecchio', 'utf8'); }
    const ventiMinutiFa = new Date(Date.now() - 20 * 60 * 1000);
    await utimes(vecchioVivo, ventiMinutiFa, ventiMinutiFa);
    await buildProduction({ outputDir: output });
    const nomi = await readdir(output);
    assert.equal(nomi.includes(path.basename(orfano)), false, 'l\'appoggio di un processo morto se ne va');
    assert.equal(nomi.includes(path.basename(vecchioVivo)), false, 'più vecchio di dieci minuti: se ne va anche col pid vivo');
    assert.equal(nomi.includes(path.basename(vivo)), true, 'l\'appoggio di una build sorella viva resta');
  } finally {
    await rimuoviCartellaDiProvaAttesa(output);
  }
});
