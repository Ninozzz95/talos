/*
 * P1 della ricognizione dei parametri (21/10/2026): verso Mistral `reasoning_effort` parte solo ai modelli che la pagina «Reasoning»
 * elenca (docs.mistral.ai/capabilities/reasoning); gli altri rifiutano il campo (422 «Extra inputs are not permitted»). Livelli come pi.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';

const m = (model, reasoning) => preparaRichiestaCompatibile('mistral', { model, messages: [{ role: 'user', content: 'x' }], reasoning });

test('MSF-01 i modelli elencati ricevono lo sforzo fra i loro livelli; «none» spegne', () => {
  assert.equal(m('mistral-small-latest', { effort: 'high' }).corpo.reasoning_effort, 'high');
  assert.equal(m('mistral-medium-3-5', { effort: 'none' }).corpo.reasoning_effort, 'none');
  // «none» non è un livello della scala (spegne): medium non scende a spento, sale al minimo che ragiona, come pi (`clamps … to high`)
  assert.equal(m('mistral-large-4-0', { effort: 'medium' }).corpo.reasoning_effort, 'high');
  assert.equal(m('mistral-large-4-0', { effort: 'medium' }).note.length, 1);
  assert.equal(m('zai-glm-5-3', { effort: 'max' }).corpo.reasoning_effort, 'max');
  // revisione W21/W22 e i due id di models.dev aggiunti dopo la revisione
  for (const model of ['mistral-small-2603', 'mistral-medium-latest', 'mistral-medium-2604', 'mistral-large-4']) {
    assert.equal(m(model, { effort: 'high' }).corpo.reasoning_effort, 'high', model);
  }
});

test('MSF-02 un modello non elencato (Codestral, Devstral, Magistral) non riceve il campo, e lo si dice', () => {
  for (const model of ['codestral-latest', 'devstral-medium-latest', 'magistral-medium-latest']) {
    const { corpo, note } = m(model, { effort: 'high' });
    assert.equal(Object.hasOwn(corpo, 'reasoning_effort'), false, model);
    assert.equal(Object.hasOwn(corpo, 'reasoning'), false, model);
    assert.equal(note.length, 1, model);
  }
  const radice = preparaRichiestaCompatibile('mistral', { model: 'codestral-latest', messages: [], reasoning_effort: 'high' });
  assert.equal(Object.hasOwn(radice.corpo, 'reasoning_effort'), false, 'anche a radice');
});

test('MSF-03 verso contrario: senza ragionamento chiesto nessuna nota; un altro profilo a sforzo conserva il campo per un modello ignoto', () => {
  assert.deepEqual(m('codestral-latest').note, []);
  const altri = Object.entries(REGISTRO_FORNITORI).filter(([id, r]) => id !== 'mistral' && r.richiestaCompatibile?.ragionamento === 'effort');
  for (const [id] of altri) {
    const { corpo } = preparaRichiestaCompatibile(id, { model: 'modello-futuro-x', messages: [], reasoning_effort: 'high' });
    assert.equal(corpo.reasoning_effort, 'high', id);
  }
});

test('MSF-04 il registro respinge la dichiarazione fuori posto', () => {
  assert.equal(verificaRegistro(), true);
  const con = (soloModelliElencati, ragionamento = 'effort') => ({ ...REGISTRO_FORNITORI, mistral: { ...REGISTRO_FORNITORI.mistral,
    richiestaCompatibile: { ...REGISTRO_FORNITORI.mistral.richiestaCompatibile, soloModelliElencati, ragionamento } } });
  assert.throws(() => verificaRegistro(con(false)), /compatibility profile/u);
  assert.throws(() => verificaRegistro(con('sì')), /compatibility profile/u);
});
