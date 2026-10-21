/*
 * Revisione del lotto della sera (21/10/2026), mutante O1b sopravvissuto: un `session_id` messo da chi chiama resta suo anche quando la
 * sessione ha la sua chiave (`runtime-owner-adapter.mjs`, `corpo.session_id === undefined`). Stesso banco di ORS-01.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

const URL_OR = 'https://openrouter.ai/api/v1/chat/completions';
const attrezzo = (name) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } });
const messaggi = [{ role: 'system', content: 'Sei TALOS.' }, { role: 'user', content: 'Scrivi un test.' }];
const rispostaChat = () => Response.json({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 1 } });

async function inviato({ checkpointSessionId, tools, sessionIdDelChiamante = undefined }) {
  let corpo = null;
  // il desktop vero ha lo store dei fornitori: senza, OpenRouter parte diretto e salta il traduttore (`runtime-owner-adapter.mjs:1338`)
  const custodia = new Map();
  const providerStore = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'sk-or-finta' },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  const adapter = createOwnerRuntimeAdapter({ modulePath: 'C:/fixture/runtime.mjs', providerStore,
    destinazioneModelloDeps: { leggiChiave: (p) => { try { return providerStore.getKey(p); } catch { return null; } }, leggiRuntime: (p) => { try { return providerStore.getRuntime(p); } catch { return {}; } } },
    importFn: async () => ({ talosLavora: (input) => input.fetchDiRete(URL_OR, { method: 'POST', body: JSON.stringify({ model: 'z-ai/glm-5.3-flash', messages: messaggi, tools, ...(sessionIdDelChiamante !== undefined ? { session_id: sessionIdDelChiamante } : {}) }) }) }) });
  await adapter.talosLavora({ contextHooks: {}, ...(checkpointSessionId ? { checkpointSessionId } : {}),
    fetchDiRete: async (_url, init) => { corpo = JSON.parse(init.body); return rispostaChat(); } });
  return corpo;
}

test('ORS-03 un session_id del chiamante resta suo, anche con la chiave della sessione; senza, parte quella della sessione', async () => {
  const suo = await inviato({ checkpointSessionId: 'sessione-123', tools: [attrezzo('leggi')], sessionIdDelChiamante: 'mia-sessione' });
  assert.equal(suo.session_id, 'mia-sessione');
  const della = await inviato({ checkpointSessionId: 'sessione-123', tools: [attrezzo('leggi')] });
  assert.match(della.session_id, /^talos-s-[0-9a-f]{56}$/u);
});
