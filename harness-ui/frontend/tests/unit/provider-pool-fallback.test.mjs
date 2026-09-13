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
test('PH-UI-02 solo modelli con chiave e attrezzi dichiarati', () => {
  const rows = [{ id:'deepseek', label:'DeepSeek', keyConfigured:true, modelliDiRiserva:[{id:'deepseek-chat',nome:'DeepSeek Chat',toolCalling:true},{id:'ignoto',nome:'Ignoto'}] }, { id:'zai',keyConfigured:false,modelliDiRiserva:[{id:'glm',toolCalling:true}] }];
  assert.deepEqual(fonti.opzioniFallback(rows, {usaAttrezzi:true}).map(x=>x.model), ['deepseek-chat']);
  assert.equal(fonti.opzioniFallback(rows, {usaAttrezzi:false}).length, 2);
});
