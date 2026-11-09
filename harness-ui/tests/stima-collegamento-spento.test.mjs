/*
 * Performance e Mobile, 31/10/2026: a collegamento spento (`TALOS_PIANO_SENZA_COLLEGAMENTO=1`, il Codice col piano del telefono) ogni passo rimanda su HTTP tutto il cifrato,
 * e la soglia più alta non è misurata lì: il motore conta il blocco firmato come prima. Col collegamento vale il suo peso.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { createDesktopContextRuntime } from '../src/context-runtime.mjs';
import { parseContextSettings } from '../../context-engine/src/contracts.mjs';

const now = '2026-10-31T00:00:00.000Z';
const blocco = { version: 1, provider: 'chatgpt', model: 'gpt-6-luna', content: [{ type: 'reasoning', text: '', providerMetadata: { openai: { reasoningEncryptedContent: 'c'.repeat(4000) } } }] };

function storia(n) {
  const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi i file e dimmi cosa non va' }];
  for (let i = 0; i < n; i++) {
    messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `src/f${i}.mjs` }) } }], talos_provider_state: blocco });
    messaggi.push({ role: 'tool', content: `uscita ${i} `.padEnd(600, 'x'), tool_call_id: `c${i}` });
  }
  return messaggi;
}

async function quantiConteggi(t, valore) {
  const salvata = process.env.TALOS_PIANO_SENZA_COLLEGAMENTO;
  if (valore === undefined) delete process.env.TALOS_PIANO_SENZA_COLLEGAMENTO; else process.env.TALOS_PIANO_SENZA_COLLEGAMENTO = valore;
  const directory = await mkdtemp(join(tmpdir(), 'stima-collegamento-'));
  let conteggi = 0;
  const profilo = { provider: 'chatgpt', model: 'gpt-6-luna', windowTokens: 100_000, responseReserve: 2048, singleSlot: true };
  const runtime = await createDesktopContextRuntime({ sessionDirectory: directory, enabledSessionIds: ['chat'],
    readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'chatgpt:gpt-6-luna', conclusa: true } : null),
    resolveModelProfile: async () => profilo,
    tokenCounter: { countPreparedContext: async ({ messages, model }) => {
      conteggi += 1;
      const chiari = JSON.stringify(messages.map(({ talos_provider_state, ...resto }) => resto)).length;
      return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(chiari / 3.5), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex'), provider: model.provider, model: model.model };
    } },
    callModel: async () => { throw new Error('Unexpected inference'); } });
  t.after(async () => {
    await runtime.close(); await rimuoviCartellaDiProvaAttesa(directory);
    if (salvata === undefined) delete process.env.TALOS_PIANO_SENZA_COLLEGAMENTO; else process.env.TALOS_PIANO_SENZA_COLLEGAMENTO = salvata;
  });
  const messaggi = storia(50);
  await runtime.store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await runtime.engine.appendOriginal({ sessionId: 'chat', record: { id: `r${i}`, message, createdAt: now } });
  conteggi = 0;
  await runtime.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: profilo });
  if (valore === undefined) delete process.env.TALOS_PIANO_SENZA_COLLEGAMENTO;
  return conteggi;
}

test('STIMA-COLLEGAMENTO: col collegamento il blocco pesa poco e la strada delle puliture resta chiusa', async (t) => {
  assert.equal(await quantiConteggi(t, undefined), 1);
});

test('STIMA-COLLEGAMENTO-SPENTO: a collegamento spento il blocco conta come testo, come prima', async (t) => {
  assert.ok(await quantiConteggi(t, '1') > 1);
});
