/*
 * Riga del bugfixer (10/10/2026, dalla review C06 della sessione desktop) — due `user` di fila non arrivano al fornitore: i template
 *   jinja di alcuni modelli locali (`llama-server --jinja`: Mistral, Gemma) alzano «Conversation roles must alternate». La storia li
 *   tiene separati (ognuno con la sua origine); il CORPO della richiesta li unisce, come Hermes (`agent_runtime_helpers.py:1228-1244`).
 * ⛔ Solo verso un motore LOCALE (`runtime-owner-adapter.mjs`): nel corpo del kernel cambiava la forma di ogni richiesta cloud e
 *   rompeva nove prove della compattazione (il riassunto fuso con la consegna). RUOLI-05 e RUOLI-06 lo tengono così.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { conUtentiUniti } from '../src/kernel/utenti-uniti.mjs'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

test('RUOLI-01: two text users become one, separated by a blank line; the first keeps its fields', () => {
    const uniti = conUtentiUniti([
        { role: 'system', content: 's' },
        { role: 'assistant', content: 'avviato' },
        { role: 'user', content: 'The background command `npm run dev` was stopped by the user (SIGTERM).', talosOrigin: 'background-notice' },
        { role: 'user', content: 'e adesso?' },
    ])
    assert.equal(uniti.length, 3)
    assert.deepEqual(uniti[2], { role: 'user', content: 'The background command `npm run dev` was stopped by the user (SIGTERM).\n\ne adesso?', talosOrigin: 'background-notice' })
})

test('RUOLI-02: lists are concatenated, and text next to a list becomes a text block (the image is never lost)', () => {
    const immagine = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }
    const [, , misto] = conUtentiUniti([
        { role: 'system', content: 's' }, { role: 'assistant', content: 'a' },
        { role: 'user', content: 'nota' },
        { role: 'user', content: [{ type: 'text', text: 'guarda' }, immagine] },
    ])
    assert.deepEqual(misto.content, [{ type: 'text', text: 'nota' }, { type: 'text', text: 'guarda' }, immagine])
})

test('RUOLI-03 AL CONTRARIO: a user after an assistant, and tool results, are left as they are; the input is not mutated', () => {
    const storia = [
        { role: 'system', content: 's' }, { role: 'user', content: 'u1' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: 'r' }, { role: 'user', content: 'u2' },
    ]
    const copia = structuredClone(storia)
    assert.deepEqual(conUtentiUniti(storia), storia)
    assert.deepEqual(storia, copia)
})

const DUE_UTENTI = [
    { role: 'system', content: 's' },
    { role: 'user', content: 'avvia il server' }, { role: 'assistant', content: 'avviato in sottofondo' },
    { role: 'user', content: 'The background command `npm run dev` was stopped by the user (SIGTERM).' },
    { role: 'user', content: 'e adesso?' },
]
const ruoliDi = (corpo) => corpo.messages.map((m) => m.role)
const dueDiFila = (ruoli) => ruoli.some((r, i) => i > 0 && r === 'user' && ruoli[i - 1] === 'user')

/** Il trasporto VERO dell'adattatore; finti solo il ponte del supervisore e la rete, che registrano il corpo ricevuto. */
function trasporto() {
    const ricevuti = []
    const rete = async (url, opzioni) => {
        ricevuti.push({ url: String(url), corpo: JSON.parse(opzioni.body) })
        return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    }
    const dipendenze = {
        leggiChiave: (fonte) => ({ deepseek: 'k-deepseek', openrouter: 'k-or' })[fonte] ?? null,
        leggiRuntime: (fonte) => ({ deepseek: { endpoint: 'https://api.deepseek.com' }, ollama: { endpoint: 'http://127.0.0.1:11434' }, openrouter: { endpoint: 'https://openrouter.ai/api/v1' } })[fonte] ?? {},
        localePronto: () => true,
        chiamaLocale: async (percorso, opzioni) => rete(`supervisore:${percorso}`, opzioni),
    }
    return { ricevuti, fetchDiRete: creaFetchMultiProvider(rete, { dipendenze }) }
}
const spedisci = (fetchDiRete, model) => fetchDiRete('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: DUE_UTENTI, stream: false }),
})

test('RUOLI-04 MOTORE LOCALE: llama-server (local:) and Ollama receive no two users in a row, in order, joined by a blank line', async () => {
    const { ricevuti, fetchDiRete } = trasporto()
    await spedisci(fetchDiRete, 'local:gemma-3-4b')
    await spedisci(fetchDiRete, 'ollama:mistral')
    assert.equal(ricevuti.length, 2)
    assert.equal(ricevuti[0].url, 'supervisore:/v1/chat/completions', 'premise: local: goes through the supervisor bridge')
    assert.match(ricevuti[1].url, /^http:\/\/127\.0\.0\.1:11434\//, 'premise: ollama: goes to its own address')
    for (const { corpo } of ricevuti) {
        assert.deepEqual(ruoliDi(corpo), ['system', 'user', 'assistant', 'user'])
        assert.equal(corpo.messages.at(-1).content, 'The background command `npm run dev` was stopped by the user (SIGTERM).\n\ne adesso?')
    }
})

test('RUOLI-05 AL CONTRARIO, IL CLOUD: OpenRouter and a direct cloud provider receive the body as the kernel built it', async () => {
    const { ricevuti, fetchDiRete } = trasporto()
    await spedisci(fetchDiRete, 'deepseek/deepseek-v4-flash')
    await spedisci(fetchDiRete, 'deepseek:deepseek-v4-flash')
    assert.equal(ricevuti.length, 2)
    assert.equal(ricevuti[1].url.startsWith('https://api.deepseek.com'), true, 'premise: deepseek: goes to the provider itself')
    for (const { corpo } of ricevuti) assert.deepEqual(ruoliDi(corpo), ['system', 'user', 'assistant', 'user', 'user'])
})

test('RUOLI-06 IL KERNEL NON TOCCA IL CORPO: two users stay two in what talosLavora sends (the cloud wire shape is unchanged)', async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-ruoli-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const corpi = []
    await talosLavora({
        cartella, task: { consegna: 'e adesso?' }, modello: 'f', chiave: 'k', giriMassimi: 2,
        messaggiIniziali: DUE_UTENTI.slice(1),
        fetchDiRete: async (_url, init) => {
            corpi.push(JSON.parse(init.body))
            return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
    })
    assert.equal(dueDiFila(ruoliDi(corpi[0])), true)
    assert.equal(corpi[0].messages.filter((m) => m.role === 'user' && m.content === 'e adesso?').length, 1, 'the person message travels on its own')
})
