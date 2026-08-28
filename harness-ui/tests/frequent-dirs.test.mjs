import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cartelleFrequenti } from '../src/frequent-dirs.mjs';

function homeFinta(t, { conDesktop = true, conDownloads = true, conDocuments = true } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'talos-home-finta-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  if (conDesktop) mkdirSync(join(home, 'Desktop'));
  if (conDownloads) mkdirSync(join(home, 'Downloads'));
  if (conDocuments) mkdirSync(join(home, 'Documents'));
  return home;
}

test('⭐⭐⭐ cartelleFrequenti torna Desktop/Download/Documenti quando esistono DAVVERO, coi percorsi VERI', (t) => {
  const home = homeFinta(t);
  const trovate = cartelleFrequenti({ homedirFn: () => home });
  assert.deepEqual(trovate, [
    { etichetta: 'Desktop', percorso: join(home, 'Desktop') },
    { etichetta: 'Download', percorso: join(home, 'Downloads') },
    { etichetta: 'Documenti', percorso: join(home, 'Documents') },
  ]);
});

test('⛔⛔⛔ AL CONTRARIO — una cartella che NON esiste sul disco non compare, mai una scorciatoia verso il nulla', (t) => {
  const home = homeFinta(t, { conDownloads: false });
  const trovate = cartelleFrequenti({ homedirFn: () => home });
  assert.equal(trovate.some((c) => c.etichetta === 'Download'), false);
  assert.equal(trovate.length, 2);
});

test('⛔⛔ AL CONTRARIO — con NESSUNA delle tre presente, torna un array vuoto, mai un errore', (t) => {
  const home = homeFinta(t, { conDesktop: false, conDownloads: false, conDocuments: false });
  const trovate = cartelleFrequenti({ homedirFn: () => home });
  assert.deepEqual(trovate, []);
});

test('⛔ AL CONTRARIO — se homedir() torna un percorso che non esiste per niente, nessun crash', () => {
  const trovate = cartelleFrequenti({ homedirFn: () => 'C:/questo/utente/non/esiste/mai-9137' });
  assert.deepEqual(trovate, []);
});

test('⛔⛔⛔ AL CONTRARIO — un FILE chiamato "Desktop" (non una cartella) non viene proposto come scorciatoia', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'talos-home-file-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  writeFileSync(join(home, 'Desktop'), 'non è una cartella');
  const trovate = cartelleFrequenti({ homedirFn: () => home });
  assert.equal(trovate.some((c) => c.etichetta === 'Desktop'), false);
});
