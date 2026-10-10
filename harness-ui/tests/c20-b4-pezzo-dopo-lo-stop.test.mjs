import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

/*
 * Sonda della review C20 (desktop, 10/10/2026): il B4 è davvero equivalente? Un pezzo dello stream con PIÙ eventi arriva, e lo Stop
 * cade nello stesso istante, prima che il parser lo legga. `leggiInGara` mette in gara la lettura e lo Stop: la lettura si è risolta
 * per prima, quindi il pezzo si analizza tutto DOPO lo Stop (talosHarness.mjs ~947, nessun controllo dentro il ciclo degli eventi).
 */
const enc = new TextEncoder()
const dormi = (ms) => new Promise((r) => setTimeout(r, ms))
const ricerca = (index, query) => ({ choices: [{ delta: { tool_calls: [{ index, id: `call_${index}`, function: { name: 'web_search', arguments: JSON.stringify({ query }) } }] } }] })

describe('C20 review — a chunk already arrived when the Stop lands', () => {
  it('no search starts from a chunk parsed after the Stop', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'talos-c20-b4-'))
    t.after(() => rimuoviCartellaDiProva(dir))
    const richieste = []
    const stop = new AbortController()
    let n = 0
    await talosLavora({
      cartella: dir, task: { consegna: 'cerca' }, modello: 'x', chiave: 'y', onDelta: () => {}, segnaleStop: stop.signal,
      strumentiEstesi: ['web_search'], ricercaWeb: { provider: 'tavily', apiKey: 'k' },
      richiediRicercaFn: async (_url, opzioni) => { richieste.push(opzioni.corpo.query); return { stato: 200, corpo: JSON.stringify({ results: [] }) } },
      fetchDiRete: async () => {
        if (n++ > 0) return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'finito' } }] })}\n\ndata: [DONE]\n\n`)); c.close() } }))
        return new Response(new ReadableStream({
          start(c) {
            setTimeout(() => {
              // un pezzo solo con tre eventi: l'inizio della seconda chiamata completa la prima, la terza completa la seconda
              c.enqueue(enc.encode([ricerca(0, 'uno'), ricerca(1, 'due'), ricerca(2, 'tre')].map((p) => `data: ${JSON.stringify(p)}\n\n`).join('')))
              stop.abort() // nello stesso istante: la lettura è già risolta, lo Stop arriva dopo
            }, 30)
          },
        }))
      },
    }).catch(() => {})
    await dormi(150)
    assert.deepEqual(richieste, [], 'nothing starts after the Stop')
  })
})
