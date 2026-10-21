/*
 * Revisione O1 (21/10/2026): verso OpenRouter `session_id` è l'impronta dell'id della SESSIONE (come Hermes), non l'impronta del prefisso,
 * che cambia quando cambiano gli attrezzi o dopo un riassunto. Senza sessione resta l'impronta del traduttore (PCK-05).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

const URL_OR = 'https://openrouter.ai/api/v1/chat/completions';
const attrezzo = (name) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } });
const messaggi = [{ role: 'system', content: 'Sei TALOS.' }, { role: 'user', content: 'Scrivi un test.' }];
const rispostaChat = () => Response.json({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 1 } });

async function inviato({ checkpointSessionId, tools }) {
  let corpo = null;
  // il desktop vero ha lo store dei fornitori: senza, OpenRouter parte diretto e salta il traduttore (`runtime-owner-adapter.mjs:1338`)
  const custodia = new Map();
  const providerStore = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'sk-or-finta' },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  const adapter = createOwnerRuntimeAdapter({ modulePath: 'C:/fixture/runtime.mjs', providerStore,
    destinazioneModelloDeps: { leggiChiave: (p) => { try { return providerStore.getKey(p); } catch { return null; } }, leggiRuntime: (p) => { try { return providerStore.getRuntime(p); } catch { return {}; } } },
    importFn: async () => ({ talosLavora: (input) => input.fetchDiRete(URL_OR, { method: 'POST', body: JSON.stringify({ model: 'z-ai/glm-5.3-flash', messages: messaggi, tools }) }) }) });
  await adapter.talosLavora({ contextHooks: {}, ...(checkpointSessionId ? { checkpointSessionId } : {}),
    fetchDiRete: async (_url, init) => { corpo = JSON.parse(init.body); return rispostaChat(); } });
  return corpo;
}

test('ORS-01 con la sessione: session_id dall\'id della sessione, stabile anche se cambiano gli attrezzi; mai l\'id in chiaro', async () => {
  const a = await inviato({ checkpointSessionId: 'sessione-123', tools: [attrezzo('leggi')] });
  const b = await inviato({ checkpointSessionId: 'sessione-123', tools: [attrezzo('leggi'), attrezzo('mcp_nuovo')] });
  assert.match(a.session_id, /^talos-s-[0-9a-f]{56}$/u);
  assert.equal(a.session_id, b.session_id, 'un attrezzo in più non cambia la chiave');
  assert.equal(a.session_id.includes('sessione-123'), false, 'l\'id della sessione non esce in chiaro');
  assert.notEqual((await inviato({ checkpointSessionId: 'sessione-456', tools: [attrezzo('leggi')] })).session_id, a.session_id);
});

test('ORS-02 verso contrario: senza sessione resta l\'impronta del prefisso del traduttore', async () => {
  const c = await inviato({ tools: [attrezzo('leggi')] });
  assert.match(c.session_id, /^talos-[0-9a-f]{58}$/u);
});
