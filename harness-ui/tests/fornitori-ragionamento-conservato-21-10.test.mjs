/*
 * Owner, 21/10/2026: il ragionamento dei giri passati si tiene. Z.AI «Tenerlo, come pi e opencode» (`thinking.clear_thinking: false`,
 * docs.z.ai/guides/capabilities/thinking-mode: spento di serie sull'indirizzo standard); Qwen «la stessa scelta» (`preserve_thinking: true`,
 * alibabacloud.com/help/en/model-studio/deep-thinking del 19/10/2026: solo sui modelli elencati). Una scelta del chiamante resta sua.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';

const messaggi = [{ role: 'user', content: 'ciao' }];

test('RC-01 Z.AI col pensiero acceso tiene il ragionamento passato; spento o scelto dal chiamante, nessuna aggiunta', () => {
  assert.deepEqual(preparaRichiestaCompatibile('zai', { model: 'glm-5.3-flash', messages: messaggi, reasoning: { effort: 'high' } }).corpo.thinking,
    { type: 'enabled', clear_thinking: false });
  assert.deepEqual(preparaRichiestaCompatibile('zai', { model: 'glm-5.2', messages: messaggi, reasoning: { effort: 'none' } }).corpo.thinking,
    { type: 'disabled' }, 'spento: niente da conservare');
  assert.deepEqual(preparaRichiestaCompatibile('zai', { model: 'glm-5.2', messages: messaggi, thinking: { type: 'enabled', clear_thinking: true } }).corpo.thinking,
    { type: 'enabled', clear_thinking: true }, 'la scelta del chiamante resta sua');
});

test('RC-02 verso contrario: un altro fornitore col formato `thinking` (DeepSeek) non riceve clear_thinking', () => {
  const { corpo } = preparaRichiestaCompatibile('deepseek', { model: 'deepseek-v4-flash', messages: messaggi, reasoning: { effort: 'high' } });
  assert.equal(Object.hasOwn(corpo.thinking ?? {}, 'clear_thinking'), false);
});

test('RC-03 Qwen: preserve_thinking solo sui modelli elencati e col pensiero acceso; la scelta del chiamante resta sua', () => {
  const q = (model, extra = {}) => preparaRichiestaCompatibile('qwen', { model, messages: messaggi, stream: true, ...extra }).corpo;
  assert.equal(q('qwen3.8-flash', { reasoning: { enabled: true } }).preserve_thinking, true);
  assert.equal(q('qwen3.8-flash').preserve_thinking, true, 'acceso di serie su qwen3.8-flash');
  assert.equal(Object.hasOwn(q('qwen3.8-flash', { reasoning: { enabled: false } }), 'preserve_thinking'), false, 'spento: niente');
  assert.equal(Object.hasOwn(q('qwen3-32b', { reasoning: { enabled: true } }), 'preserve_thinking'), false, 'modello non elencato da Alibaba');
  assert.equal(Object.hasOwn(q('qwen-flash', { reasoning: { enabled: true } }), 'preserve_thinking'), false, 'modello non elencato da Alibaba');
  assert.equal(q('qwen3.8-flash', { reasoning: { enabled: true }, preserve_thinking: false }).preserve_thinking, false);
});

test('RC-04 il registro respinge una dichiarazione malformata', () => {
  assert.equal(verificaRegistro(), true);
  const zai = (conservaRagionamento) => ({ ...REGISTRO_FORNITORI, zai: { ...REGISTRO_FORNITORI.zai, ragionamento: { ...REGISTRO_FORNITORI.zai.ragionamento, conservaRagionamento } } });
  for (const errato of [null, { forma: 'preserve_thinking', fonte: 'https://x', data: '2026-10-21' }, { forma: 'clear_thinking', data: '2026-10-21' }, { forma: 'clear_thinking', fonte: 'https://x', data: 'oggi' }]) {
    assert.throws(() => verificaRegistro(zai(errato)), /past reasoning/u, JSON.stringify(errato));
  }
  const qwen = (conservaRagionamento) => ({ ...REGISTRO_FORNITORI, qwen: { ...REGISTRO_FORNITORI.qwen,
    richiestaCompatibile: { ...REGISTRO_FORNITORI.qwen.richiestaCompatibile, conservaRagionamento } } });
  for (const errato of [{ forma: 'clear_thinking', modelli: ['qwen3.8-flash'], fonte: 'https://x', data: '2026-10-21' },
    { forma: 'preserve_thinking', modelli: ['qwen-inventato'], fonte: 'https://x', data: '2026-10-21' },
    { forma: 'preserve_thinking', fonte: 'https://x', data: '2026-10-21' }]) {
    assert.throws(() => verificaRegistro(qwen(errato)), /compatibility profile/u, JSON.stringify(errato));
  }
});

test('RC-05 revisione Z-1: «Automatico» (nessuna preferenza) sui GLM-5.x accesi di serie tiene il ragionamento; GLM-4.6 resta com\'era', () => {
  for (const model of ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'glm-5', 'zai:GLM-5.2']) {
    assert.deepEqual(preparaRichiestaCompatibile('zai', { model, messages: messaggi }).corpo.thinking, { type: 'enabled', clear_thinking: false }, model);
  }
  assert.equal(Object.hasOwn(preparaRichiestaCompatibile('zai', { model: 'glm-4.6', messages: messaggi }).corpo, 'thinking'), false, 'non nell\'elenco di serie');
  assert.equal(Object.hasOwn(preparaRichiestaCompatibile('zai', { model: 'glm-9-futuro', messages: messaggi }).corpo, 'thinking'), false, 'modello ignoto');
  assert.throws(() => verificaRegistro({ ...REGISTRO_FORNITORI, zai: { ...REGISTRO_FORNITORI.zai, ragionamento: { ...REGISTRO_FORNITORI.zai.ragionamento,
    conservaRagionamento: { ...REGISTRO_FORNITORI.zai.ragionamento.conservaRagionamento, diSerie: ['glm-inventato'] } } } }), /past reasoning/u);
});
