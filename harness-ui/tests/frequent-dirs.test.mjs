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

/*
 * ⭐⭐⭐ 30/8 — owner dal vivo: "come mai non ho le cartelle più usate?"
 * La cronologia reale (sessionRegistry.cartellePiuUsate()) ora ha
 * PRIORITÀ sulle tre cartelle Windows standard sopra — questi test
 * provano quella priorità, non solo il ripiego già coperto sopra.
 */

test('⭐⭐⭐ con cronologia reale disponibile, quella vince — Desktop/Download/Documenti NON compaiono insieme', (t) => {
  const home = homeFinta(t); // le tre standard esistono DAVVERO, ma non devono comparire
  const progetto = mkdtempSync(join(tmpdir(), 'talos-progetto-usato-'));
  t.after(() => rmSync(progetto, { recursive: true, force: true }));
  const registry = { cartellePiuUsate: () => [{ percorso: progetto, conteggio: 4, ultimaVolta: '2026-08-30T10:00:00.000Z' }] };
  const trovate = cartelleFrequenti({ homedirFn: () => home, sessionRegistry: registry });
  assert.deepEqual(trovate, [{ etichetta: progetto.split(/[/\\]/).pop(), percorso: progetto }]);
});

test('⛔⛔⛔ AL CONTRARIO — una cartella nella cronologia ma sparita dal disco (copia usa-e-getta ripulita) non compare, e senza altre voci reali si cade sul ripiego Windows', (t) => {
  const home = homeFinta(t);
  const spariata = join(tmpdir(), 'talos-cartella-mai-esistita-o-cancellata-8214');
  const registry = { cartellePiuUsate: () => [{ percorso: spariata, conteggio: 2, ultimaVolta: '2026-08-30T09:00:00.000Z' }] };
  const trovate = cartelleFrequenti({ homedirFn: () => home, sessionRegistry: registry });
  assert.equal(trovate.some((c) => c.percorso === spariata), false);
  // ⭐ nessuna voce reale è sopravvissuta al controllo sul disco: onesto tornare al ripiego, non un elenco vuoto quando le tre standard esistono davvero.
  assert.deepEqual(trovate, [
    { etichetta: 'Desktop', percorso: join(home, 'Desktop') },
    { etichetta: 'Download', percorso: join(home, 'Downloads') },
    { etichetta: 'Documenti', percorso: join(home, 'Documents') },
  ]);
});

test('⛔⛔ AL CONTRARIO — sessionRegistry presente ma SENZA cronologia (avvio a freddo) cade sul ripiego Windows, mai un elenco vuoto se quelle esistono', (t) => {
  const home = homeFinta(t);
  const registry = { cartellePiuUsate: () => [] };
  const trovate = cartelleFrequenti({ homedirFn: () => home, sessionRegistry: registry });
  assert.equal(trovate.length, 3);
  assert.equal(trovate.every((c) => ['Desktop', 'Download', 'Documenti'].includes(c.etichetta)), true);
});

test('⛔ AL CONTRARIO — cartellePiuUsate() rispetta il tetto massimoRisultati (6): una decima voce reale non viene nemmeno controllata sul disco', (t) => {
  const home = homeFinta(t, { conDesktop: false, conDownloads: false, conDocuments: false });
  const cartelle = [];
  for (let i = 0; i < 10; i += 1) {
    const c = mkdtempSync(join(tmpdir(), `talos-molte-cartelle-${i}-`));
    t.after(() => rmSync(c, { recursive: true, force: true }));
    cartelle.push({ percorso: c, conteggio: 10 - i, ultimaVolta: '2026-08-30T00:00:00.000Z' });
  }
  const registry = { cartellePiuUsate: () => cartelle };
  const trovate = cartelleFrequenti({ homedirFn: () => home, sessionRegistry: registry });
  assert.equal(trovate.length, 6);
  assert.deepEqual(trovate.map((c) => c.percorso), cartelle.slice(0, 6).map((c) => c.percorso));
});
