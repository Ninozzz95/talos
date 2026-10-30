/*
 * ⭐ L1 1.1 — le prove della revisione avversaria del blocco 2 (26/10/2026), portate nel ramo: erano rosse sulle cure del blocco 1
 *   (`8d2169219`) e verdi prima. RV-S1/RV-S2: la sonda condivisa dei system guarda lo Stop di OGNI richiesta e non quello della
 *   prima; RV-C1: un corpo d'errore che resta aperto non tiene ferma la richiesta. Scritte dal revisore, rese relative qui.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { creaFetchMultiProvider } = await import('../src/runtime-owner-adapter.mjs')
const S = (content) => ({ role: 'system', content })
const U = (content) => ({ role: 'user', content })
const RICHIESTA = [S('base'), S('progetto'), U('ciao'), { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c1', content: 'ok' }, S('dove sei')]

/* Un motore che PERDE i system in silenzio (gpt-oss): accetta tutto, e la sonda (lenta: 300 ms) mostra il prompt senza i system a metà. */
function motorePerde({ ritardoSondaMs = 300 } = {}) {
  const completamenti = []
  return {
    completamenti,
    dipendenze: {
      leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true,
      chiamaLocale: async (percorso, opzioni) => {
        completamenti.push(JSON.parse(opzioni.body).messages)
        return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] })
      },
      applicaTemplateLocale: (opzioni) => new Promise((ok, ko) => {
        const corpo = JSON.parse(opzioni.body)
        const t = setTimeout(() => ok(Response.json({ prompt: corpo.messages.filter((m, i) => m.role !== 'system' || i === 0).map((m) => m.content).join('\n') })), ritardoSondaMs)
        opzioni.signal?.addEventListener('abort', () => { clearTimeout(t); ko(Object.assign(new Error('aborted'), { name: 'AbortError' })) }, { once: true })
      }),
    },
  }
}
const chiedi = (f, modello, signal) => f('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify({ model: `local:${modello}`, messages: RICHIESTA }), ...(signal ? { signal } : {}),
})

test('RV-S1 lo Stop di una SECONDA richiesta arriva subito anche mentre la sonda condivisa è di un\'altra', async () => {
  const m = motorePerde({ ritardoSondaMs: 3000 })
  const f = creaFetchMultiProvider(fetch, { dipendenze: m.dipendenze })
  const a = chiedi(f, 'perde-stop-b') // il padre: nessuno Stop
  const ctrlB = new AbortController()
  const t0 = Date.now()
  const b = chiedi(f, 'perde-stop-b', ctrlB.signal).then(() => 'risolta', (e) => `rifiutata (${e?.name})`)
  setTimeout(() => ctrlB.abort(), 50)
  const esitoB = await b
  const ms = Date.now() - t0
  await a
  assert.ok(ms < 1000, `la richiesta fermata ha aspettato ${ms} ms la sonda dell'altra (esito: ${esitoB})`)
})

test('RV-S2 lo Stop della PRIMA richiesta non fa partire NON piegata la seconda (gpt-oss: i system a metà sparirebbero in silenzio)', async () => {
  const m = motorePerde({ ritardoSondaMs: 300 })
  const f = creaFetchMultiProvider(fetch, { dipendenze: m.dipendenze })
  const ctrlA = new AbortController()
  const a = chiedi(f, 'perde-stop-a', ctrlA.signal).catch(() => null)
  const b = chiedi(f, 'perde-stop-a')
  setTimeout(() => ctrlA.abort(), 50)
  await a
  assert.equal((await b).status, 200)
  const spedito = m.completamenti.at(-1)
  assert.equal(spedito.filter((x) => x.role === 'system').length, 1, `la seconda è partita con ${spedito.filter((x) => x.role === 'system').length} system: il template ne tiene solo il primo`)
})

test('RV-C1 un corpo d\'errore che resta aperto non blocca chi lo legge (prima: 2.000 byte subito)', async () => {
  let tirati = 0
  const dipendenze = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true,
    chiamaLocale: async () => new Response(new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(`{"error":{"code":500,"message":"CUDA error: out of memory ${'x'.repeat(3000)}`)); },
      pull() { tirati += 1; return new Promise(() => {}) }, // e poi niente: né altri byte né la fine
    }), { status: 500 }),
  }
  const f = creaFetchMultiProvider(fetch, { dipendenze, inattivitaGenerazioneMs: 60_000 })
  const r = await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer x' },
    body: JSON.stringify({ model: 'local:clone-aperto', messages: [{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }] }) })
  assert.equal(r.status, 500)
  const esito = await Promise.race([r.text().then((t) => `letto ${t.length}`), new Promise((ok) => setTimeout(() => ok('APPESO dopo 2 s'), 2000))])
  assert.match(esito, /^letto/u, esito)
})
