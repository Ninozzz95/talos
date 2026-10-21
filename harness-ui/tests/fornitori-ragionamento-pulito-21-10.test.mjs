/*
 * Revisione Z-2 (21/10/2026), condizione 2 della CLI: dalla pulizia del motore del contesto al traduttore. Il ragionamento vecchio
 * TOLTO dalla pulizia esce verso DeepSeek e Kimi col riempimento " " (rimandaRagionamento); verso Z.AI, che lo rilegge
 * («complete, unmodified»), non parte mai un ragionamento accorciato; un messaggio recente tiene il ragionamento intero.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CLEARING_STEP, KEEP_RECENT_TOOL_OUTPUTS, clearOldToolOutputs } from '../../context-engine/src/tool-output-clearing.mjs';
import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';

const PENSIERO = 'penso '.repeat(120);

function storia(n) {
  const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi i file e dimmi cosa non va' }];
  for (let i = 0; i < n; i++) {
    const id = `call${String(i).padStart(5, '0')}`;
    messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `src/f${i}.mjs` }) } }], reasoning_content: `${PENSIERO}${i}` });
    messaggi.push({ role: 'tool', content: `riga dell'uscita ${i}\n`.repeat(200), tool_call_id: id });
  }
  return messaggi;
}

const assistenti = (messaggi) => messaggi.filter((m) => m.role === 'assistant');

test('RP-01 DeepSeek e Kimi: il ragionamento tolto dalla pulizia esce come " "; il recente resta intero', () => {
  const { messages, cleared } = clearOldToolOutputs(storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS + 2));
  assert.ok(cleared > 0, 'la pulizia è scattata');
  for (const [id, model] of [['deepseek', 'deepseek-v4-pro'], ['kimi', 'kimi-k2.6']]) {
    const inviati = assistenti(preparaRichiestaCompatibile(id, { model, messages, reasoning: { effort: 'high' } }).corpo.messages);
    assert.equal(inviati[0].reasoning_content, ' ', `${id}: il vecchio tolto ⇒ riempimento`);
    assert.equal(inviati.at(-1).reasoning_content, `${PENSIERO}${inviati.length - 1}`, `${id}: il recente intero`);
    assert.ok(inviati.every((m) => !String(m.reasoning_content).endsWith('…')), `${id}: nessun ragionamento accorciato`);
  }
});

test('RP-02 Z.AI col ragionamento tenuto: ogni ragionamento che parte è intero oppure assente, mai accorciato', () => {
  const { messages } = clearOldToolOutputs(storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS + 2));
  const { corpo } = preparaRichiestaCompatibile('zai', { model: 'glm-5.3-flash', messages, reasoning: { effort: 'high' } });
  assert.deepEqual(corpo.thinking, { type: 'enabled', clear_thinking: false });
  for (const [i, m] of assistenti(corpo.messages).entries()) {
    if (Object.hasOwn(m, 'reasoning_content')) assert.equal(m.reasoning_content, `${PENSIERO}${i}`, `messaggio ${i}`);
  }
  assert.ok(assistenti(corpo.messages).some((m) => !Object.hasOwn(m, 'reasoning_content')), 'i vecchi sono assenti');
});

test('RP-03 verso contrario: sotto la soglia della pulizia nessun ragionamento si tocca', () => {
  const corta = storia(KEEP_RECENT_TOOL_OUTPUTS);
  const { messages, cleared } = clearOldToolOutputs(corta);
  assert.equal(cleared, 0);
  for (const [i, m] of assistenti(messages).entries()) assert.equal(m.reasoning_content, `${PENSIERO}${i}`);
});
