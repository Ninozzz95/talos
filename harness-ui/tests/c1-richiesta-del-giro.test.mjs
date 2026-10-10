/*
 * C1 (owner 10/10/2026): la ripartizione dell'ultima richiesta spedita, per la scheda Contesto (`src/richiesta-del-giro.mjs`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ripartizioneDellaRichiesta, copiaDellaRichiesta, MARCATORE_ISTRUZIONI, MARCATORE_MEMORIA } from '../src/richiesta-del-giro.mjs';

const perId = (r) => Object.fromEntries(r.categorie.map((c) => [c.id, c.tokens]));
const lungo = (parola, n) => `${parola} `.repeat(n);

test('C1-RICH-01: system, project rules, memory, tools, MCP and conversation are counted apart, each by its own marker', () => {
  const r = ripartizioneDellaRichiesta({
    messages: [
      { role: 'system', content: lungo('sistema', 100) },
      { role: 'system', content: `${MARCATORE_ISTRUZIONI}, and they apply to you.\n${lungo('regola', 50)}` },
      { role: 'system', content: `${MARCATORE_MEMORIA}: 1 of 1.\n- preferenza: risposte brevi` },
      { role: 'user', content: 'ciao' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.md"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: lungo('riga', 30) },
    ],
    tools: [
      { type: 'function', function: { name: 'leggi', description: lungo('legge', 20), parameters: {} } },
      { type: 'function', function: { name: 'mcp__meteo__previsioni', description: 'previsioni', parameters: {} } },
    ],
  });
  const c = perId(r);
  assert.deepEqual(r.categorie.map((x) => x.id), ['system', 'rules', 'memory', 'tools', 'mcp', 'conversation']);
  assert.ok(c.system > c.rules && c.rules > c.memory && c.memory > 0);
  assert.ok(c.tools > c.mcp && c.mcp > 0, 'MCP tools by their mcp__ prefix');
  assert.ok(c.conversation > 0);
  assert.equal(r.stimata, true);
  assert.equal(r.messaggi, 6); assert.equal(r.attrezzi, 2);
});

test('C1-RICH-02: a marker in the MIDDLE of a system message splits it at that point', () => {
  const testa = lungo('sistema', 40);
  const r = ripartizioneDellaRichiesta({ messages: [{ role: 'system', content: `${testa}\n${MARCATORE_ISTRUZIONI}\n${lungo('regola', 40)}` }] });
  const c = perId(r);
  assert.ok(c.system > 0 && c.rules > 0);
  assert.ok(Math.abs(c.system - c.rules) < c.system / 2, 'the two halves are comparable, not all counted on one side');
});

test('C1-RICH-03: the other way round — an empty request shows the conversation at 0 and hides absent categories', () => {
  const r = ripartizioneDellaRichiesta({ messages: [], tools: [] });
  assert.deepEqual(r.categorie, [{ id: 'conversation', tokens: 0 }]);
});

test('C1-RICH-04: the copy kept in memory drops images (type kept), and shares nothing with the body that was sent', () => {
  const corpo = { model: 'm', messages: [{ role: 'user', content: [{ type: 'text', text: 'guarda' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }], tools: [{ type: 'function', function: { name: 'leggi' } }] };
  const copia = copiaDellaRichiesta(corpo);
  assert.deepEqual(copia.messages[0].content, [{ type: 'text', text: 'guarda' }, { type: 'image_url', omitted: true }]);
  assert.ok(!JSON.stringify(copia).includes('base64'));
  copia.tools[0].function.name = 'cambiato';
  assert.equal(corpo.tools[0].function.name, 'leggi', 'a deep copy');
  assert.equal(copia.model, 'm');
});
