import assert from 'node:assert/strict';
import test from 'node:test';

import { percentili, riassuntoGpu, verdettoSonda } from '../scripts/lib/statistiche-raf.mjs';

/*
 * ⭐ 04/9 — W0-03: la sonda di rilascio giudica la fluidità «da fermo» sui
 * delta fra frame di requestAnimationFrame. Qui si prova la matematica da
 * sola (percentili + verdetto), a secco: il campionamento vero sta nello
 * scenario `qa-release-probe` della pipeline QA e gira in Chrome vero.
 */
test('percentili — campioni noti: p50 e p95 attesi (rango più vicino, non interpolato)', () => {
  const campioni = [16, 17, 16, 33, 16, 17, 16, 16, 50, 16];
  assert.deepEqual(percentili(campioni, [50, 95]), { p50: 16, p95: 50 });
  // ordine d'ingresso irrilevante
  assert.deepEqual(percentili([...campioni].reverse(), [50, 95]), { p50: 16, p95: 50 });
  // un solo campione: ogni percentile è quel campione
  assert.deepEqual(percentili([21], [50, 95]), { p50: 21, p95: 21 });
});

test('percentili — AL CONTRARIO: senza campioni o con valori non numerici si rifiuta, non torna 0', () => {
  assert.throws(() => percentili([], [50]), /nessun campione/);
  assert.throws(() => percentili([16, NaN], [50]), /non numerico/);
  assert.throws(() => percentili([16], [101]), /percentile/);
});

test('verdettoSonda — p95 sotto il budget passa, sopra fallisce con il motivo che porta i numeri', () => {
  assert.deepEqual(verdettoSonda({ rafP95: 20 }), { ok: true, motivo: 'rafP95 20 ms ≤ budget 50 ms' });
  assert.deepEqual(verdettoSonda({ rafP95: 50 }), { ok: true, motivo: 'rafP95 50 ms ≤ budget 50 ms' });
  const fallito = verdettoSonda({ rafP95: 51 });
  assert.equal(fallito.ok, false);
  assert.match(fallito.motivo, /51 ms > budget 50 ms/);
  // budget esplicito
  assert.equal(verdettoSonda({ rafP95: 30, budgetMs: 20 }).ok, false);
});

test('verdettoSonda — AL CONTRARIO: un p95 mancante o non numerico NON passa (una sonda muta non è una sonda verde)', () => {
  for (const rafP95 of [undefined, null, NaN, 'veloce']) {
    const v = verdettoSonda({ rafP95 });
    assert.equal(v.ok, false, `rafP95=${String(rafP95)} deve fallire`);
    assert.match(v.motivo, /nessuna misura/);
  }
});

// Forme MISURATE il 04/09 con `SystemInfo.getInfo` su Chrome vero (about:blank, profilo temporaneo).
const INFO_GPU_VERA = { gpu: { devices: [{ vendorId: 4098, vendorString: '', deviceString: 'AMD Radeon RX 9070 XT', driverVendor: 'AMD', driverVersion: '32.0.31041.1004' }, {}, {}], featureStatus: { gpu_compositing: 'enabled', rasterization: 'enabled', webgl: 'enabled' } } };
const INFO_DISABLE_GPU = { gpu: { devices: [{ vendorId: 65535, vendorString: 'Google Inc. (Microsoft)', deviceString: 'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11-10.0.26100.8972)', driverVendor: 'SwANGLE', driverVersion: '10.0.26100.8972' }], featureStatus: { gpu_compositing: 'disabled_software', rasterization: 'disabled_software', webgl: 'unavailable_software' } } };

test('riassuntoGpu — GPU vera: accelerata, nome dal deviceString (vendorString è vuoto), driver AMD', () => {
  assert.deepEqual(riassuntoGpu(INFO_GPU_VERA), { dispositivo: 'AMD Radeon RX 9070 XT', driver: 'AMD 32.0.31041.1004', compositing: 'enabled', accelerata: true, dispositivi: 3 });
});

test('riassuntoGpu — AL CONTRARIO: con --disable-gpu il compositing è software e accelerata è false; senza info non inventa', () => {
  const r = riassuntoGpu(INFO_DISABLE_GPU);
  assert.equal(r.accelerata, false);
  assert.equal(r.compositing, 'disabled_software');
  assert.match(r.dispositivo, /Microsoft Basic Render Driver/);
  assert.deepEqual(riassuntoGpu(undefined), { dispositivo: 'sconosciuto', driver: 'sconosciuto', compositing: 'sconosciuto', accelerata: false, dispositivi: 0 });
});
