/*
 * Owner 11/10/2026, due decisioni dopo il server di prova della 0.1.26, dove la stessa misura diceva «10,9%» nel Context Manager e
 *   «10,8%» nella scheda Contesto, e la scheda la chiamava «misurato» mentre il Context Manager diceva «stima euristica»:
 *   1. «Troncare in tutti e due» — un numero solo in tutta l'app, con la regola della scheda (le sue parti sommano 100);
 *   2. «“stimato” con la “~”» — «misurato» solo quando il numero viene dal fornitore o dal motore locale.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { misuraDellaPanoramica } from '../../src/components/contesto-scheda.js';
import { percento, righeFinestraSulLimite } from '../../src/components/inspector.js';
import { finestraDiContesto } from '../../src/components/contesto.js';
import { impostaLingua } from '../../src/components/lingua.js';

const limite = { soglia: 174_500, finestra: 262_100, fonte: 'motore' };

test('CONTESTO-UNA-PERCENTUALE: the case seen on the test server reads 10.8 in both places, and a percentage is never rounded up', () => {
  impostaLingua('it');
  assert.equal(misuraDellaPanoramica({ usati: 19_000, limite }).percentualeDelLimite, 10.8, 'Context Manager');
  assert.equal(percento(19_000, limite.soglia), '10,8%', 'Context tab');
  for (const usati of [1, 999, 19_000, 87_249, 174_499, 174_500, 200_000]) {
    const manager = misuraDellaPanoramica({ usati, limite }).percentualeDelLimite;
    assert.equal(`${new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(manager)}%`, percento(usati, limite.soglia), `${usati}`);
  }
  assert.equal(misuraDellaPanoramica({ usati: 174_499, limite }).percentualeDelLimite, 99.9, 'one token short of the limit is not «100%»');
});

test('CONTESTO-STIMATO: the engine\'s heuristic count is called an estimate with «~»; a count from the provider or the local engine stays «measured»', () => {
  try {
    impostaLingua('en');
    const misura = (method) => ({ revision: 3, measuredAt: '2026-10-11T08:00:00.000Z', tokens: { inputTokens: 19_000, windowTokens: 262_100, responseReserve: 87_600, method, exact: method !== 'heuristic' } });
    for (const [method, stimato] of [['heuristic', true], ['provider', false], ['runtime', false]]) {
      const f = finestraDiContesto({ misura: misura(method), revisione: 3 });
      assert.equal(f.perInspector.usage.stimato, stimato, method);
      const righe = righeFinestraSulLimite({ usage: f.perInspector.usage, limite });
      const riga = righe.righe.find((r) => /^In use/.test(r[0]));
      assert.equal(riga[0], stimato ? 'In use (estimate)' : 'In use (measured)', method);
      assert.equal(riga[2] === 'stima', stimato, `${method}: the estimate class draws the «~»`);
      assert.equal(righe.anteprima.startsWith('~'), stimato, `${method}: the collapsed card says it too`);
    }
    // al contrario: l'uso del fornitore che arriva dalla sessione (nessuna misura del motore) resta «misurato»
    const dalFornitore = righeFinestraSulLimite({ usage: { prompt_tokens: 19_000, completion_tokens: 300 }, limite });
    assert.equal(dalFornitore.righe.find((r) => /^In use/.test(r[0]))[0], 'In use (measured)');
    impostaLingua('it');
    assert.equal(righeFinestraSulLimite({ usage: { prompt_tokens: 19_000, stimato: true }, limite }).righe.find((r) => /^In uso/.test(r[0]))[0], 'In uso (stimato)');
  } finally { impostaLingua('it'); }
});
