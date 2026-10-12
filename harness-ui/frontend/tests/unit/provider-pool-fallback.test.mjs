import assert from 'node:assert/strict';
import test from 'node:test';
import * as card from '../../src/components/provider-card.js';
import * as fonti from '../../src/components/fonti-modelli.js';

test('PH-UI-01 stato umano, scadenza dichiarata e nessuna chiave nel testo', () => {
  const testo = card.statoChiavePool({ impronta: 'a'.repeat(64), stato: 'in-panchina', causa: 'traffico', inPanchinaFino: Date.parse('2026-09-12T12:00:00Z'), chiave: 'finta-da-non-mostrare' });
  assert.match(testo, /In panchina fino a/); assert.match(testo, /Troppo traffico/);
  assert.equal(testo.includes('finta-da-non-mostrare'), false);
  assert.equal(card.statoChiavePool({stato:'disponibile'}), 'Disponibile');
});
/* 11/10/2026 (owner, «inutile»): la scelta delle riserve («se non risponde, continua con…») è tolta dall'interfaccia. */
test('PH-UI-02 la scelta delle riserve non c è più: né il componente né il suo posto nel selettore e nella nuova sessione', async () => {
  assert.equal('creaSceltaFallback' in fonti, false);
  assert.equal('opzioniFallback' in fonti, false);
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.equal(/montaFallbackIn\(|fallbackProviders/u.test(app), false);
});
