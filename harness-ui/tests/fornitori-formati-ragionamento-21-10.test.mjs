/*
 * P1 della ricognizione dei parametri dei fornitori, passata 2 (21/10/2026): together, deepinfra e novita ricevevano lo sforzo
 * nell'involucro di OpenRouter (`reasoning:{effort}`), che nessuno dei tre documenta. Documentazione letta il 21/10/2026.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';
import { livelliRagionamentoDiretti } from '../src/model-destination.mjs';

const prepara = (id, extra) => preparaRichiestaCompatibile(id, { model: 'modello-x', messages: [], ...extra });

test('FMT-01 together: reasoning.enabled + reasoning_effort fra low/medium/high, mai `reasoning.effort`', () => {
  assert.deepEqual(prepara('together', { reasoning: { effort: 'medium' } }).corpo, { model: 'modello-x', messages: [], reasoning: { enabled: true }, reasoning_effort: 'medium' });
  const max = prepara('together', { reasoning: { effort: 'max' } });
  assert.equal(max.corpo.reasoning_effort, 'high', 'il più vicino senza superare il costo scelto');
  assert.equal(max.note.length, 1, JSON.stringify(max.note));
  assert.deepEqual(prepara('together', { reasoning: { effort: 'none' } }).corpo, { model: 'modello-x', messages: [], reasoning: { enabled: false } });
  assert.deepEqual(prepara('together', {}).corpo, { model: 'modello-x', messages: [] }, 'nessuna scelta ⇒ niente di inventato');
  // revisione F7: spento con un livello accanto ⇒ nessun livello sul filo
  assert.deepEqual(prepara('together', { reasoning: { enabled: false, effort: 'high' } }).corpo, { model: 'modello-x', messages: [], reasoning: { enabled: false } });
});

test('FMT-02 deepinfra: reasoning_effort a radice, «none» per spegnere', () => {
  assert.deepEqual(prepara('deepinfra', { reasoning: { effort: 'high' } }).corpo, { model: 'modello-x', messages: [], reasoning_effort: 'high' });
  assert.deepEqual(prepara('deepinfra', { reasoning: { enabled: false } }).corpo, { model: 'modello-x', messages: [], reasoning_effort: 'none' });
  assert.deepEqual(prepara('deepinfra', { reasoning_effort: 'none' }).corpo, { model: 'modello-x', messages: [], reasoning_effort: 'none' });
  assert.deepEqual(prepara('deepinfra', {}).corpo, { model: 'modello-x', messages: [] });
});

test('FMT-03 novita: enable_thinking acceso/spento e separate_reasoning sempre; lo sforzo non documentato si dice', () => {
  const acceso = prepara('novita', { reasoning: { effort: 'high' } });
  assert.deepEqual(acceso.corpo, { model: 'modello-x', messages: [], enable_thinking: true, separate_reasoning: true });
  assert.equal(acceso.note.length, 1);
  assert.deepEqual(prepara('novita', { reasoning: { effort: 'none' } }).corpo, { model: 'modello-x', messages: [], enable_thinking: false, separate_reasoning: true });
  assert.deepEqual(prepara('novita', {}).corpo, { model: 'modello-x', messages: [], separate_reasoning: true }, 'il ragionamento sempre fuori da content');
});

test('FMT-04 verso contrario: il corpo del chiamante non cambia, e chi non dichiara un formato riceve il corpo com\'era', () => {
  const entrata = { model: 'modello-x', messages: [{ role: 'user', content: 'ciao' }], reasoning: { effort: 'high' } };
  const prima = structuredClone(entrata);
  prepara('together', entrata); prepara('deepinfra', entrata); prepara('novita', entrata);
  assert.deepEqual(entrata, prima);
  assert.deepEqual(prepara('ollama-cloud', { reasoning: { effort: 'high' } }).corpo, { model: 'modello-x', messages: [], reasoning: { effort: 'high' } });
});

test('FMT-05 la UI non impone i livelli del filo a ogni modello (revisione U1); «spento» si legge nelle tre forme (U2); formato sconosciuto respinto', async () => {
  const mappa = livelliRagionamentoDiretti();
  for (const id of ['together', 'deepinfra', 'novita']) assert.equal(mappa[id]?.['*'], undefined, `${id}: la pillola resta al catalogo`);
  assert.ok(Array.isArray(mappa.zai?.['*']), 'verso contrario: Z.AI dichiara i livelli per tutti i modelli');
  const { preparaRichiestaCompatibile: p } = await import('../src/openai-compatible-runtime.mjs');
  assert.equal(p('together', { model: 'x', messages: [], reasoning: { effort: 'none' } }).corpo.reasoning.enabled, false);
  assert.equal(verificaRegistro(), true);
  const con = (formato) => ({ ...REGISTRO_FORNITORI, together: { ...REGISTRO_FORNITORI.together, ragionamento: { ...REGISTRO_FORNITORI.together.ragionamento, formato } } });
  for (const errato of ['openrouter', '', 'Thinking']) assert.throws(() => verificaRegistro(con(errato)), /reasoning format/u, String(errato));
});
