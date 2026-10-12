/**
 * 11/10/2026 — trovato DAL VIVO col piano dell'owner: il primo giro con un modello del piano ChatGPT moriva con
 * «Provider not recognized» (PROVIDER_INVALID) prima di spedire niente. Stack (server vero, porta effimera):
 *   getRuntime (provider-credential-store.mjs) ← resolveProfile (server.mjs) ← countPreparedContext ← context-engine.
 * Il contatore dei token chiedeva indirizzo e chiave al negozio anche per un fornitore che non ha una chiave (l'accesso col piano).
 * Le prove dell'instradamento partivano sotto il motore del contesto: per questo erano verdi.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs'
import { createContextTokenCounter, credenzialeDelContatore } from '../src/context-token-counters.mjs'

const MODELLO = { provider: 'chatgpt', model: 'gpt-5.6-luna', windowTokens: 200_000, responseReserve: 8_000 }
const store = () => createProviderCredentialStore({ env: { OPENAI_API_KEY: 'sk-CHIAVE-API' } })

test('CTX-PIANO-01 — un fornitore senza chiave nel registro (il piano ChatGPT) non interroga il negozio: nessun indirizzo, nessuna chiave', () => {
  const s = store()
  assert.deepEqual(credenzialeDelContatore('chatgpt', { leggiRuntime: (p) => s.getRuntime(p), leggiChiave: (p) => s.getKey(p), baseLocale: 'http://locale.invalid/v1' }), {})
})

test('CTX-PIANO-02 AL CONTRARIO — OpenAI con chiave porta indirizzo e chiave; il locale porta il suo indirizzo; un nome sconosciuto lancia ancora', () => {
  const s = store()
  const porte = { leggiRuntime: (p) => s.getRuntime(p), leggiChiave: (p) => s.getKey(p), baseLocale: 'http://locale.invalid/v1' }
  assert.deepEqual(credenzialeDelContatore('openai', porte), { baseURL: 'https://api.openai.com/v1', apiKey: 'sk-CHIAVE-API' })
  assert.deepEqual(credenzialeDelContatore('local', porte), { baseURL: 'http://locale.invalid/v1' })
  assert.throws(() => credenzialeDelContatore('non-esiste', porte), { code: 'PROVIDER_INVALID' })
})

test('CTX-PIANO-03 — col profilo vero il contatore misura un modello del piano con la stima, senza nessuna chiamata di rete e senza la chiave API', async () => {
  const s = store(); const chiamate = []
  const contatore = createContextTokenCounter({
    fetchFn: async (...a) => { chiamate.push(a); throw new Error('nessuna rete') },
    resolveProfile: async (model) => credenzialeDelContatore(model.provider, { leggiRuntime: (p) => s.getRuntime(p), leggiChiave: (p) => s.getKey(p), baseLocale: 'http://locale.invalid/v1' }),
  })
  const misura = await contatore.countPreparedContext({ messages: [{ role: 'user', content: 'ciao' }], tools: [], model: MODELLO })
  assert.equal(misura.method, 'heuristic')
  assert.equal(misura.provider, 'chatgpt')
  assert.ok(misura.inputTokens > 0)
  assert.deepEqual(chiamate, [])
})
