import test from 'node:test';
import assert from 'node:assert/strict';
import { indiceDomandaCorrente, misuraFascia, RIGHE_DOMANDA_FERMA } from '../../src/components/domanda-appiccicata.js';

/* 27/10/2026 — la parte pura della domanda ferma in cima (`domanda-appiccicata.js`). Il comportamento nel browser lo provano
   `tests/browser/bolle-domanda.spec.mjs` (BOLLE-01…13). */

test('DOMANDA-01 la corrente è l’ULTIMA domanda la cui testa è sopra la riga', () => {
  const teste = [-3000, -1200, -40, 0, 300, 900];
  assert.equal(indiceDomandaCorrente(teste.length, (i) => teste[i], 2), 3);
  assert.equal(indiceDomandaCorrente(teste.length, (i) => teste[i], -50), 1);
  assert.equal(indiceDomandaCorrente(teste.length, (i) => teste[i], -5000), -1, 'nessuna è arrivata in cima');
  assert.equal(indiceDomandaCorrente(0, () => 0, 2), -1, 'nessuna domanda');
  assert.equal(indiceDomandaCorrente(teste.length, (i) => teste[i], 10_000), 5);
});

test('DOMANDA-02 la ricerca è binaria: O(log n) letture, non una per domanda', () => {
  let letture = 0;
  const n = 1000;
  const i = indiceDomandaCorrente(n, (k) => { letture += 1; return k * 100 - 50_000; }, 2);
  assert.equal(i, 500);
  assert.ok(letture <= Math.ceil(Math.log2(n)) + 1, `letture: ${letture}`);
});

test('DOMANDA-03 la fascia: bolla corta intera, bolla lunga tagliata dopo la quarta riga (niente padding basso)', () => {
  assert.equal(RIGHE_DOMANDA_FERMA, 4);
  const base = { altoTurno: 100, altoCorpo: 144, rigaPx: 27.2, bordoAlto: 1, bordoBasso: 1, paddingAlto: 12, paddingBasso: 12, respiro: 8 };
  const corta = misuraFascia({ ...base, altezzaCorpo: 53.2 });
  assert.deepEqual(corta, { vista: 44 + 54 + 8, corpo: 54, lunga: false });
  const quattro = misuraFascia({ ...base, altezzaCorpo: 12 + 1 + 4 * 27.2 + 12 + 1 });
  assert.equal(quattro.lunga, false, 'esattamente quattro righe non sono «lunghe»: niente sfumatura, niente pulsante');
  const lunga = misuraFascia({ ...base, altezzaCorpo: 500 });
  assert.equal(lunga.lunga, true);
  assert.equal(lunga.corpo, Math.ceil(12 + 1 + 4 * 27.2), 'si ferma subito dopo la quarta riga');
  assert.equal(lunga.vista, 44 + lunga.corpo + 8);
});
