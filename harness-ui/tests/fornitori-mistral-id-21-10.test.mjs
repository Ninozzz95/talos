/*
 * Revisione F4 (21/10/2026): Mistral accetta solo id di chiamata di 9 caratteri alfanumerici. Come pi e opencode: hash deterministico,
 * id già validi riservati, chiamata ed esito coerenti.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';

const storia = (idA, idB) => [
  { role: 'user', content: 'Leggi.' },
  { role: 'assistant', content: null, tool_calls: [{ id: idA, type: 'function', function: { name: 'leggi', arguments: '{}' } }, { id: idB, type: 'function', function: { name: 'cerca', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: idA, content: 'a' },
  { role: 'tool', tool_call_id: idB, content: 'b' },
];

test('MID-01 verso Mistral ogni id diventa di 9 alfanumerici, chiamata ed esito restano accoppiati, ed è deterministico', () => {
  const entrata = { model: 'mistral-small-latest', messages: storia('call_c741a9e0b2f34d', 'call_ffff0000aaaa') };
  const prima = structuredClone(entrata);
  const a = preparaRichiestaCompatibile('mistral', entrata).corpo.messages;
  const b = preparaRichiestaCompatibile('mistral', structuredClone(prima)).corpo.messages;
  const [c1, c2] = a[1].tool_calls.map((t) => t.id);
  for (const id of [c1, c2]) assert.match(id, /^[A-Za-z0-9]{9}$/u);
  assert.notEqual(c1, c2);
  assert.equal(a[2].tool_call_id, c1);
  assert.equal(a[3].tool_call_id, c2);
  assert.deepEqual(a, b, 'stessa storia ⇒ stessi id');
  assert.deepEqual(entrata, prima, 'il corpo del chiamante non cambia');
});

test('MID-02 un id già valido resta, e nessun id trasformato lo può prendere', () => {
  const valido = 'abc123XYZ';
  const m = preparaRichiestaCompatibile('mistral', { model: 'x', messages: storia(valido, 'call_altro') }).corpo.messages;
  assert.equal(m[1].tool_calls[0].id, valido);
  assert.notEqual(m[1].tool_calls[1].id, valido);
  assert.equal(m[3].tool_call_id, m[1].tool_calls[1].id);
});

test('MID-03 verso contrario: chi non dichiara la forma riceve gli id come sono; il registro respinge una forma sconosciuta', () => {
  const m = preparaRichiestaCompatibile('groq', { model: 'openai/gpt-oss-20b', messages: storia('call_c741a9e0b2f34d', 'call_x') }).corpo.messages;
  assert.equal(m[1].tool_calls[0].id, 'call_c741a9e0b2f34d');
  assert.equal(verificaRegistro(), true);
  const con = (idChiamate) => ({ ...REGISTRO_FORNITORI, mistral: { ...REGISTRO_FORNITORI.mistral, idChiamate } });
  for (const errato of [{ forma: 'uuid', fonte: 'x', data: '2026-10-21' }, { forma: 'alfanumerico-9', data: '2026-10-21' }, null]) {
    assert.throws(() => verificaRegistro(con(errato)), /tool call id shape/u, JSON.stringify(errato));
  }
});

test('MID-04 un id trasformato non prende MAI un id valido già nella storia, nemmeno se l\u2019hash cade proprio lì', () => {
  const h = preparaRichiestaCompatibile('mistral', { model: 'x', messages: storia('call_x', 'call_y') }).corpo.messages[1].tool_calls[0].id;
  const m = preparaRichiestaCompatibile('mistral', { model: 'x', messages: storia(h, 'call_x') }).corpo.messages;
  assert.equal(m[1].tool_calls[0].id, h, 'l\u2019id valido resta');
  assert.notEqual(m[1].tool_calls[1].id, h, 'call_x non può diventare lo stesso id');
  assert.equal(m[3].tool_call_id, m[1].tool_calls[1].id);
});
