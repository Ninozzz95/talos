/*
 * Owner 21/10/2026, «Opzione nel registro, spenta»: Qwen fa una chiamata d'attrezzo per giro se non si chiede `parallel_tool_calls`
 * (Alibaba, di serie false). L'opzione sta nel registro, spenta: oggi il corpo non cambia; accesa (dopo il banco) parte con gli attrezzi.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { conChiamateParallele, preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';

const attrezzi = [{ type: 'function', function: { name: 'leggi', parameters: { type: 'object', properties: {} } } }];

test('QPC-01 di serie spenta: il corpo verso Qwen non porta parallel_tool_calls, nemmeno con gli attrezzi', () => {
  assert.equal(REGISTRO_FORNITORI.qwen.richiestaCompatibile.chiamateParallele.attiva, false);
  const { corpo } = preparaRichiestaCompatibile('qwen', { model: 'qwen3.8-flash', messages: [], tools: attrezzi, stream: true });
  assert.equal(Object.hasOwn(corpo, 'parallel_tool_calls'), false);
});

test('QPC-02 accesa: parte solo con gli attrezzi, e la scelta del chiamante resta sua', () => {
  const acceso = { chiamateParallele: { attiva: true } };
  assert.equal(conChiamateParallele(acceso, { tools: attrezzi }).parallel_tool_calls, true);
  assert.equal(Object.hasOwn(conChiamateParallele(acceso, { tools: [] }), 'parallel_tool_calls'), false, 'senza attrezzi niente');
  assert.equal(Object.hasOwn(conChiamateParallele(acceso, {}), 'parallel_tool_calls'), false);
  assert.equal(conChiamateParallele(acceso, { tools: attrezzi, parallel_tool_calls: false }).parallel_tool_calls, false);
  const corpo = { tools: attrezzi };
  conChiamateParallele(acceso, corpo);
  assert.equal(Object.hasOwn(corpo, 'parallel_tool_calls'), false, 'il corpo del chiamante non cambia');
});

test('QPC-03 il registro respinge una dichiarazione malformata', () => {
  assert.equal(verificaRegistro(), true);
  const con = (chiamateParallele) => ({ ...REGISTRO_FORNITORI, qwen: { ...REGISTRO_FORNITORI.qwen,
    richiestaCompatibile: { ...REGISTRO_FORNITORI.qwen.richiestaCompatibile, chiamateParallele } } });
  for (const errato of [null, { attiva: 'no', fonte: 'https://x', data: '2026-10-21' }, { attiva: false, data: '2026-10-21' }, { attiva: false, fonte: 'https://x', data: 'oggi' }]) {
    assert.throws(() => verificaRegistro(con(errato)), /compatibility profile/u, JSON.stringify(errato));
  }
});
