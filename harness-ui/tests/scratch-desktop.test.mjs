/*
 * Le prove di `scratch.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { after } from 'node:test';
import test from 'node:test';

import { diagnosi } from '../src/doctor.mjs';
import {
  avviaPuliziaScratch, cartellaScratch, cartellaScratchAttesa, ETA_MINIMA_SCRATCH_MS, FILE_TIMBRO, INTERVALLO_PULIZIA_MS,
  radiceScratch, ripulisciScratch, statoScratch,
} from '../src/scratch.mjs';
import { desktopProfile } from '../desktop/profile.mjs';
import { cartellaProfiloPredefinita } from '../src/browser-sessione-viva.mjs';
import { creaAvvioFiglio, risolviPercorsi } from '../desktop/runtime.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * Corsia SCRATCH, 24/09/2026 — la radice unica dei temporanei di TALOS (`src/scratch.mjs`).
 * Decisione dell'owner (23/09 notte): `%LOCALAPPDATA%\TALOS\cache\scratch`, oppure `<dati>\cache\scratch` se
 * la cartella dati è spostata con TALOS_DESKTOP_DATA_DIR; pulizia all'avvio di ciò che è fermo da 24 ore (età
 * del SOTTOALBERO, Hermes `hermes_constants.py:1044-1049`), timbro orario fra processi, Doctor che mostra.
 * ⛔ Tutto gira in una radice privata: questo file punta TALOS_SCRATCH_DIR a una cartella di prova, così il
 *   Doctor e ogni `cartellaScratch()` senza radice esplicita non toccano mai la radice vera della persona.
 */
const ORA = 60 * 60 * 1000;
const radiceDelFile = cartellaDiProva('talos-scratch-prova-');
const scratchPrima = process.env.TALOS_SCRATCH_DIR;
process.env.TALOS_SCRATCH_DIR = join(radiceDelFile, 'radice-del-file');
after(() => { if (scratchPrima === undefined) delete process.env.TALOS_SCRATCH_DIR; else process.env.TALOS_SCRATCH_DIR = scratchPrima; });

/** Imposta l'mtime (e atime) a `quando` ms. */
function data(percorso, quando) { utimesSync(percorso, quando / 1000, quando / 1000); }






test('SCRATCH-06 — la radice segue TALOS_DESKTOP_DATA_DIR, e guscio desktop e server calcolano la STESSA radice', () => {
  const appData = 'C:\\Users\\P\\AppData\\Roaming';
  const localAppData = 'C:\\Users\\P\\AppData\\Local';
  const percorsi = risolviPercorsi({ appPath: resolve('app') });
  const casi = [
    { env: {}, attesa: join(localAppData, 'TALOS', 'cache', 'scratch') },
    { env: { TALOS_DESKTOP_DATA_DIR: 'D:\\Dati\\TALOS' }, attesa: join('D:\\Dati\\TALOS', 'cache', 'scratch') },
    { env: { TALOS_SCRATCH_DIR: 'E:\\Temporanei' }, attesa: resolve('E:\\Temporanei') },
  ];
  for (const { env, attesa } of casi) {
    const profilo = desktopProfile({ appData, localAppData, env, platform: 'win32' });
    assert.equal(profilo.scratchDir, attesa, `guscio, env ${JSON.stringify(env)}`);
    assert.equal(radiceScratch({ ...env, LOCALAPPDATA: localAppData }, { platform: 'win32' }), attesa, `server avviato a mano, env ${JSON.stringify(env)}`);
    // ⛔ il figlio riceve SEMPRE TALOS_DESKTOP_DATA_DIR (anche in Roaming): senza TALOS_SCRATCH_DIR finirebbe in Roaming
    const avvio = creaAvvioFiglio({ execPath: resolve('Electron.exe'), percorsi, port: 49152, token: 'a'.repeat(64), dataDir: profilo.dataDir, scratchDir: profilo.scratchDir, env: {} });
    assert.equal(avvio.options.env.TALOS_DESKTOP_DATA_DIR, profilo.dataDir);
    assert.equal(radiceScratch(avvio.options.env, { platform: 'win32' }), attesa, `figlio del guscio, env ${JSON.stringify(env)}`);
  }
  const produzione = desktopProfile({ appData, localAppData, platform: 'win32' });
  assert.ok(!produzione.scratchDir.startsWith(appData), 'mai in Roaming quando i dati non sono spostati');
  const preview = desktopProfile({ appData, localAppData, metadata: { talosProfile: 'preview' }, platform: 'win32' });
  assert.equal(preview.scratchDir, join(localAppData, 'TALOS Preview', 'cache', 'scratch'), 'la preview non condivide la radice stabile');
  assert.throws(() => desktopProfile({ appData, localAppData, env: { TALOS_SCRATCH_DIR: 'relativa' }, platform: 'win32' }), /assoluta/);
});




