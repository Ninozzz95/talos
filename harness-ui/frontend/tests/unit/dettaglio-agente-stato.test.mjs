import assert from 'node:assert/strict';
import test from 'node:test';

import { statoAgente } from '../../src/components/dettaglio-agente.js';

/*
 * ⛔ TACCUINO (09/10/2026, bugfixer) — UNA FIGLIA FERMATA DALLA PERSONA NON È «NON RIUSCITO». La riga vera di `GET …/children`
 *   di una figlia fermata con `POST …/stop` (misurata sulla 4176): `conclusa:true`, `interrotta:false`, `esitoDelega:'fallito'`,
 *   `ultimoEsito:'errore'`, `motivoChiusura:'fermata'`. Il dettaglio dell'agente diceva «Non riuscito» in rosso, l'elenco degli
 *   agenti «Interrotta»: stesso agente, due parole. La regola dell'elenco e del diagramma (inspector.js:1471, grafo-agenti.js:14)
 *   guarda anche `motivoChiusura`.
 */
const FERMATA = { conclusa: true, interrotta: false, esitoDelega: 'fallito', ultimoEsito: 'errore', motivoChiusura: 'fermata' };

test('TACCUINO-AGENTE-FERMATO — la riga vera di una figlia fermata è «Interrotto», non «Non riuscito»', () => {
  const s = statoAgente(FERMATA);
  assert.equal(s.tono, 'warning');
  assert.notEqual(s.tono, 'danger');
});

test('TACCUINO-AGENTE-FERMATO — al contrario: una figlia fallita davvero resta «Non riuscito», una conclusa resta conclusa', () => {
  assert.equal(statoAgente({ ...FERMATA, motivoChiusura: 'errore' }).tono, 'danger');
  assert.equal(statoAgente({ conclusa: true, interrotta: false, esitoDelega: 'concluso' }).tono, 'success');
  assert.equal(statoAgente({ conclusa: false }).tono, 'accent');
});

/* C3 tappa 4 (owner 09/10): la riga vera di una figlia in pausa chiude con un RunError «in-pausa» — `ultimoEsito:'errore'` — ma
   non è un fallimento: «In pausa», e riprende dal menu della delega. */
test('C3-AGENTE-PAUSA — a paused child is «Paused», never «Failed», even though its turn ended on a RunError', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  impostaLingua('en');
  const pausa = statoAgente({ conclusa: true, interrotta: false, esitoDelega: 'in-pausa', ultimoEsito: 'errore', motivoChiusura: 'in-pausa' });
  assert.deepEqual(pausa, { testo: 'Paused', tono: 'warning' });
  assert.equal(statoAgente({ conclusa: true, interrotta: false, esitoDelega: 'fallito', ultimoEsito: 'errore', motivoChiusura: 'errore' }).tono, 'danger', 'a real failure stays one');
  impostaLingua('it');
});
