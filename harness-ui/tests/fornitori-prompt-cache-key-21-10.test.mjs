/*
 * P1 della ricognizione dei parametri dei fornitori (21/10/2026): `prompt_cache_key` verso chi lo dichiara (Kimi, Fireworks, Cerebras,
 * Mistral), stabile fra i giri della stessa conversazione, diversa fra due conversazioni; una chiave del chiamante resta sua.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';

const giro = (prima, dopo = []) => [{ role: 'system', content: 'Sei TALOS.' }, { role: 'user', content: prima }, ...dopo];

test('PCK-01 stessa conversazione ⇒ stessa chiave anche dopo altri giri; conversazione diversa ⇒ chiave diversa', () => {
  for (const [id, model] of [['kimi', 'kimi-k2.6'], ['fireworks', 'accounts/fireworks/models/x'], ['cerebras', 'gpt-oss-120b'], ['mistral', 'mistral-small-latest'], ['xai', 'grok-4.3']]) {
    const g1 = preparaRichiestaCompatibile(id, { model, messages: giro('Scrivi un test.') }).corpo.prompt_cache_key;
    const g5 = preparaRichiestaCompatibile(id, { model, messages: giro('Scrivi un test.', [{ role: 'assistant', content: 'ok' }, { role: 'user', content: 'e poi?' }]) }).corpo.prompt_cache_key;
    const altra = preparaRichiestaCompatibile(id, { model, messages: giro('Correggi il bug.') }).corpo.prompt_cache_key;
    assert.match(g1, /^talos-[0-9a-f]{58}$/u, id);
    assert.equal(g1, g5, `${id}: stabile nella conversazione`);
    assert.notEqual(g1, altra, `${id}: diversa fra conversazioni`);
  }
});

test('PCK-02 una chiave messa dal chiamante resta sua', () => {
  assert.equal(preparaRichiestaCompatibile('kimi', { model: 'kimi-k2.6', messages: giro('x'), prompt_cache_key: 'sessione-42' }).corpo.prompt_cache_key, 'sessione-42');
});

test('PCK-03 verso contrario: chi non lo dichiara non lo riceve', () => {
  for (const [id, model] of [['groq', 'openai/gpt-oss-20b'], ['zai', 'glm-5.3-flash'], ['openrouter', 'z-ai/glm-5.3-flash'], ['azure', 'mio-deployment']]) {
    assert.equal(Object.hasOwn(preparaRichiestaCompatibile(id, { model, messages: giro('x') }).corpo, 'prompt_cache_key'), false, id);
  }
});

test('PCK-04 revisione W9: gli attrezzi fanno parte del prefisso ⇒ attrezzi diversi, chiave diversa; stessi attrezzi, stessa chiave', () => {
  const attrezzo = (name) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } });
  const k = (tools) => preparaRichiestaCompatibile('kimi', { model: 'kimi-k2.6', messages: giro('x'), tools }).corpo.prompt_cache_key;
  assert.equal(k([attrezzo('read')]), k([attrezzo('read')]));
  assert.notEqual(k([attrezzo('read')]), k([attrezzo('read'), attrezzo('write')]));
});

test('PCK-05 OpenRouter: session_id a radice, stabile nella conversazione, diverso fra due; quello del chiamante resta suo', async () => {
  const { REGISTRO_FORNITORI, verificaRegistro } = await import('../src/provider-registry.mjs');
  const s = (corpo) => preparaRichiestaCompatibile('openrouter', { model: 'z-ai/glm-5.3-flash', ...corpo }).corpo;
  const g1 = s({ messages: giro('Scrivi un test.') });
  assert.match(g1.session_id, /^talos-[0-9a-f]{58}$/u);
  assert.equal(Object.hasOwn(g1, 'prompt_cache_key'), false, 'OpenRouter non dichiara prompt_cache_key');
  assert.equal(s({ messages: giro('Scrivi un test.', [{ role: 'assistant', content: 'ok' }, { role: 'user', content: 'e poi?' }]) }).session_id, g1.session_id);
  assert.notEqual(s({ messages: giro('Correggi il bug.') }).session_id, g1.session_id);
  assert.equal(s({ messages: giro('x'), session_id: 'mia-sessione' }).session_id, 'mia-sessione');
  assert.equal(Object.hasOwn(preparaRichiestaCompatibile('kimi', { model: 'kimi-k2.6', messages: giro('x') }).corpo, 'session_id'), false, 'chi non lo dichiara non lo riceve');
  assert.equal(verificaRegistro(), true);
  const con = (instradamento) => ({ ...REGISTRO_FORNITORI, openrouter: { ...REGISTRO_FORNITORI.openrouter, instradamento } });
  for (const errato of [null, { campo: 'x-session-id', fonte: 'https://x', data: '2026-10-21' }, { campo: 'session_id', data: '2026-10-21' }]) {
    assert.throws(() => verificaRegistro(con(errato)), /routing key/u, JSON.stringify(errato));
  }
});
