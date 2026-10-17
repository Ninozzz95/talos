/*
 * 13/10/2026 (bugfixer, lotto 3, parte A) — revisione avversaria di `5e897ac3a`, la parte del server: `bersaglioCorrente`
 * (`src/attivita-figlia.mjs`). Le prove `[REGGE]` dicono che cosa ho provato a rompere; la `[DIFETTO]` è consegnata rossa alla
 * sessione desktop (il file è suo).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaAccumulatoreAttivita } from '../src/attivita-figlia.mjs';

const start = (id, nome = 'scrivi') => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: nome });
const args = (id, delta) => ({ type: 'ToolCallArgs', toolCallId: id, delta });
const fine = (id) => ({ type: 'ToolCallResult', toolCallId: id, content: 'ok' });
const corrente = (eventi) => { const a = creaAccumulatoreAttivita(); for (const e of eventi) a.aggiungi(e); const s = a.riassunto(); return [s.attrezzoCorrente, s.bersaglioCorrente]; };

test('ATTIVITA-REVISIONE-01 [REGGE] — il bersaglio in volo: a metà non c’è, intero c’è, a chiamata finita sparisce; NUL, non-oggetto e attrezzo senza percorso danno null', () => {
  assert.deepEqual(corrente([start('a'), args('a', '{"percorso":"src/a.')]), ['scrivi', null]);
  assert.deepEqual(corrente([start('a'), args('a', '{"percorso":"src/a.js"}')]), ['scrivi', 'src/a.js']);
  assert.deepEqual(corrente([start('a'), args('a', '{"percorso":"src/a.js"}'), fine('a')]), [null, null]);
  assert.deepEqual(corrente([start('a'), args('a', JSON.stringify({ percorso: 'a\u0000b' }))]), ['scrivi', null]);
  assert.deepEqual(corrente([start('a'), args('a', '"ciao"')]), ['scrivi', null]);
  assert.deepEqual(corrente([start('a', 'shell'), args('a', '{"comando":"npm test"}')]), ['shell', null]);
  assert.deepEqual(corrente([start('a'), args('a', '{"percorso":"a.js"}'), { type: 'RunFinished' }, { type: 'RunStarted' }]), [null, null], 'un giro chiuso senza esito non lascia un bersaglio');
  /* niente oltre il percorso: il resto degli argomenti non esce */
  const a = creaAccumulatoreAttivita();
  for (const e of [start('x'), args('x', JSON.stringify({ percorso: 'a.js', contenuto: 'SEGRETO-NEL-CONTENUTO' }))]) a.aggiungi(e);
  assert.equal(JSON.stringify(a.riassunto()).includes('SEGRETO-NEL-CONTENUTO'), false);
});

test('ATTIVITA-REVISIONE-02 [DIFETTO] — due attrezzi in volo insieme (letture in parallelo): quando finisce il SECONDO, il primo è ancora «in corso» col suo file', () => {
  /* il kernel fa partire più letture insieme. Oggi: avvio A, avvio B, esito B ⇒ `attrezzoCorrente: null`, e la scheda dice
     «fra un'operazione e l'altra» mentre A lavora ancora. La regola scritta in testa al file è «l'ultimo ToolCallStart che non
     ha ancora il suo ToolCallResult»: dopo l'esito di B quello è A. */
  const eventi = [start('a', 'leggi'), args('a', '{"percorso":"a.js"}'), start('b', 'leggi'), args('b', '{"percorso":"b.js"}'), fine('b')];
  assert.deepEqual(corrente(eventi), ['leggi', 'a.js']);
  // AL CONTRARIO: finite tutte e due, niente in corso
  assert.deepEqual(corrente([...eventi, fine('a')]), [null, null]);
});
