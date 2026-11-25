import test from 'node:test';
import assert from 'node:assert/strict';

import { processiDagliEventi } from '../../src/components/inspector.js';
import { nuovaSpesa, registraSpesa } from '../../src/components/spesa-riassunti.js';

/*
 * 13/11/2026 — cura dell'affitto compromesso, pezzo 4 (i lettori della pagina): un giornale scritto da due processi dopo un affitto
 *   compromesso ha numeri d'ordine DOPPI con contenuto diverso. Prima ogni lettore scartava il secondo evento con lo stesso numero,
 *   come se fosse un rigioco: un comando, una spesa, sparivano. La stessa riga rigiocata resta scartata.
 */

test('COMP-4-P1: the Processes card shows two DIFFERENT commands that carry the same order number; the same one replayed stays one row', () => {
  const comando = (id, n, testo) => [
    { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', _sequenza: n },
    { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando: testo }), _sequenza: n + 1 },
    { type: 'ToolCallEnd', toolCallId: id, _sequenza: n + 2 },
  ];
  const eventi = [...comando('c-qui', 3, 'npm test'), ...comando('c-altrove', 3, 'git status')];
  const righe = processiDagliEventi(eventi, { adesso: 0 });
  assert.equal(righe.length, 2, `both commands: ${JSON.stringify(righe.map((r) => r.toolCallId))}`);
  const rigiocato = processiDagliEventi([...comando('c-qui', 3, 'npm test'), ...comando('c-qui', 3, 'npm test')], { adesso: 0 });
  assert.equal(rigiocato.length, 1);
});

test('COMP-4-P2: the spend counts two DIFFERENT service rows with the same order number; the same row replayed once', () => {
  const spesa = nuovaSpesa();
  const riga = (prompt) => ({ scopo: 'riassunto', at: `a${prompt}`, usage: { prompt_tokens: prompt, completion_tokens: 1 } });
  assert.equal(registraSpesa(spesa, riga(10), 3), true);
  assert.equal(registraSpesa(spesa, riga(20), 3), true, 'another row under the same number');
  assert.equal(registraSpesa(spesa, riga(20), 3), false, 'the same row replayed');
});
