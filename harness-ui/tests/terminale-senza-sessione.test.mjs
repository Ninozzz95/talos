/*
 * ⛔ 16/10/2026 — le prove del REGISTRO delle schede senza sessione dalla revisione del bugfixer (TERM-REV-02/03). Stanno qui e non in
 *   `terminale-senza-sessione-desktop.test.mjs` perché usano solo `src/terminal-registry.mjs`: l'albero della CLI non ha il frontend del
 *   desktop, e un file che lo importa non gira là (R3 della seconda revisione della CLI 0.6.8).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { creaRegistroSchedeTerminale } from '../src/terminal-registry.mjs';

test('TERM-REV-03 — GET /api/v1/terminals non elenca MAI una scheda di una sessione', () => {
  const registro = creaRegistroSchedeTerminale({ cartellaDiSessione: (id) => (id === 's1' ? 'C:/progetto-della-sessione' : null), cartellaStandalone: 'C:/progetto' });
  registro.crea({ sessionId: 's1' });
  registro.crea({ sessionId: 's1' });
  assert.deepEqual(registro.elencaStandalone().items, [], 'senza standalone l\'elenco è vuoto, anche con due schede di s1 vive');
  const { terminalId } = registro.creaStandalone();
  assert.deepEqual(registro.elencaStandalone().items.map((v) => [v.terminalId, v.sessionId, v.cartella]), [[terminalId, null, 'C:/progetto']]);
});

test('TERM-REV-02 — dopo 24 ore senza aggancio e con la shell chiusa il registro dimentica la scheda senza sessione: il client la ricrea (TERM-REV-01)', () => {
  let adesso = Date.parse('2026-10-16T10:00:00Z');
  const registro = creaRegistroSchedeTerminale({ cartellaDiSessione: () => null, cartellaStandalone: 'C:/progetto', clock: () => new Date(adesso), statoPtyFn: () => ({ viva: false }) });
  const { terminalId } = registro.creaStandalone();
  adesso += 25 * 60 * 60 * 1000;
  assert.deepEqual(registro.dimenticaLeVecchie().tolte.map((v) => v.origine), ['standalone']);
  assert.equal(registro.risolviPerConnessione(terminalId), null);
  assert.deepEqual(registro.elencaStandalone().items, []);
});
