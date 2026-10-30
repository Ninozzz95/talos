/*
 * Revisione avversaria del blocco 14 (28/10/2026), la parte della cache dei prompt (rapporto `REVISIONE-BLOCCO-14-2026-10-28.md`, prove del
 * revisore `zz-riv14.test.mjs`). Ogni prova è ROSSA sulla candidata 66b5d1d2f e verde con la cura. RIV14-5 è portata su un modello Claude:
 * col modello `x` del revisore, dopo la cura RIV14-2, nessun punto va sui messaggi e la prova passerebbe da sola, senza proteggere RIV13-1.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, motivoDellaCacheRicominciata, improntaDellaRichiesta, puntiSuiMessaggiOnorati } from '../src/kernel/talosHarness.mjs'
import { toNativeMessages } from '../src/native-provider-adapter.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'
/* RIV14-2 — S2: i punti che scorrono sugli ultimi messaggi trasformano a ogni richiesta un messaggio in pezzi e, alla richiesta dopo, di
   nuovo in stringa. Per i modelli che non onorano i punti sui messaggi (cache implicita: DeepSeek, Gemini, GPT, Grok su OpenRouter) il
   prefisso in byte fra due richieste dello stesso giro si rompe proprio sull'ultimo scambio — il criterio di BC-48 C-bis. */
test('RIV14-2 — un modello che non onora i punti sui messaggi: ogni richiesta del giro è un prefisso in byte della successiva', async () => {
  const corpi = []
  const cartella = mkdtempSync(join(tmpdir(), 'talos-riv14-'))
  let n = 0
  try {
    await talosLavora({
      cartella, task: { consegna: 'elenca cinque volte' }, modello: 'deepseek/deepseek-v4', chiave: 'k', _giriMassimiInterno: 8,
      messaggiIniziali: [{ role: 'system', content: 'Istruzioni. '.repeat(1_500) }, { role: 'user', content: 'elenca tre volte' }],
      fetchDiRete: async (_u, init) => {
        corpi.push(JSON.parse(init.body).messages)
        n += 1
        const msg = n < 5 ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }
          : { role: 'assistant', content: 'fatto' }
        return Response.json({ choices: [{ message: msg, finish_reason: n < 5 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 9_000, completion_tokens: 3 } })
      },
    })
  } finally { rimuoviCartellaDiProva(cartella) }
  assert.ok(corpi.length >= 5, 'premessa: cinque richieste nello stesso giro')
  for (let i = 1; i < corpi.length; i += 1) {
    const prima = corpi[i - 1], dopo = corpi[i]
    const j = prima.findIndex((m, k) => JSON.stringify(m) !== JSON.stringify(dopo[k]))
    assert.equal(j, -1, `richiesta ${i}→${i + 1}: diverge al messaggio ${j} (${prima[j]?.role}, ${Array.isArray(prima[j]?.content) ? 'pezzi' : 'stringa'} → ${Array.isArray(dopo[j]?.content) ? 'pezzi' : 'stringa'})`)
  }
})

/* RIV14-3 — S3: sulla strada nativa di Anthropic (la sola che onora davvero i punti, insieme a OpenRouter) i punti sui messaggi si perdono:
   solo i due sul sistema arrivano all'SDK. L'SDK li legge da `providerOptions.anthropic.cacheControl` del messaggio (ultima parte). */
test('RIV14-3 — Anthropic diretto: il punto su una domanda e su un risultato d\'attrezzo arriva all\'SDK', () => {
  const cc = { type: 'ephemeral', ttl: '1h' }
  const messaggi = [
    { role: 'user', content: [{ type: 'text', text: 'leggi', cache_control: cc }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: [{ type: 'text', text: 'contenuto', cache_control: cc }] },
  ]
  const nativi = toNativeMessages(messaggi, { provider: 'anthropic', model: 'claude-x' })
  const ha = (m) => Boolean(m.providerOptions?.anthropic?.cacheControl || m.content?.at?.(-1)?.providerOptions?.anthropic?.cacheControl)
  assert.ok(ha(nativi[0]), 'la domanda marcata')
  assert.ok(ha(nativi[2]), 'il risultato marcato')
})

/* RIV14-4 — S3: la «pausa» si misura con la durata del marcatore MANDATO (1 ora), anche quando il fornitore non lo onora (GLM: tolto
   dall'adattatore; cache implicita di pochi minuti). Dieci minuti di pausa sullo stesso prefisso diventano «sconosciuto» — il motivo che
   il banco conta come rottura che nessuno ha causato. */
test('RIV14-4 — GLM, stessa impronta, dieci minuti di pausa: «pausa», non «sconosciuto»', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-riv14-'))
  let esito
  try {
    esito = await talosLavora({
      cartella, task: { consegna: 'ciao' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k', _giriMassimiInterno: 2,
      messaggiIniziali: [{ role: 'system', content: 'Istruzioni. '.repeat(1_500) }, { role: 'user', content: 'ciao' }],
      fetchDiRete: async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 9_000, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 8_000 } } }),
    })
  } finally { rimuoviCartellaDiProva(cartella) }
  const prima = esito.statoCache // ciò che il nucleo salva per il giro dopo (persona davanti ⇒ marcatore da un'ora, che GLM non riceve)
  const stessa = improntaDellaRichiesta({ modello: prima.modello, messaggi: [], attrezzi: [] })
  assert.equal(motivoDellaCacheRicominciata(prima, { ...stessa, attrezzi: prima.attrezzi, nomiAttrezzi: prima.nomiAttrezzi, sistema: prima.sistema, messaggi: prima.messaggi },
    { tokenDaCache: 0, ora: prima.at + 10 * 60_000 }), 'pausa')
})

/* RIV14-5 — S4 (copertura): RIV13-1 guarda solo il PRIMO marcatore. Se le note in coda tornano portatrici (mutante M2) la prova resta
   verde. Qui: nessun marcatore su un `system` dopo l'ultimo messaggio non di sistema. */
test('RIV14-5 — nessun marcatore sulle note in coda alla richiesta (su un modello che i punti sui messaggi li riceve)', async () => {
  const corpi = []
  const cartella = mkdtempSync(join(tmpdir(), 'talos-riv14-'))
  try {
    await talosLavora({
      cartella, task: { consegna: 'سلام، فایل‌ها را بشمار' }, modello: 'anthropic/claude-haiku-5', chiave: 'y', _giriMassimiInterno: 2, linguaDelMessaggio: 'fa',
      messaggiIniziali: [{ role: 'system', content: 'Istruzioni lunghe. '.repeat(1_000) }, { role: 'user', content: 'سلام، فایل‌ها را بشمار' }],
      fetchDiRete: async (_u, init) => { corpi.push(JSON.parse(init.body).messages); return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) },
    })
  } finally { rimuoviCartellaDiProva(cartella) }
  const r = corpi[0]
  const ultimoNonSistema = r.findLastIndex((m) => m.role !== 'system')
  assert.ok(ultimoNonSistema < r.length - 1, 'premessa: c\'è una nota in coda')
  assert.ok(r.slice(0, ultimoNonSistema + 1).some((m) => m.role !== 'system' && Array.isArray(m.content) && m.content.some((p) => p?.cache_control)), 'premessa: i punti sui messaggi partono (modello Claude)')
  const marcatiInCoda = r.slice(ultimoNonSistema + 1).filter((m) => Array.isArray(m.content) && m.content.some((p) => p?.cache_control))
  assert.equal(marcatiInCoda.length, 0)
})

test('RIV14-6 — chi onora i punti sui messaggi: Claude (anche su Anthropic diretto), Kimi, Qwen; non GLM, DeepSeek, Gemini, GPT, Grok', () => {
  for (const m of ['anthropic/claude-haiku-5', 'claude-opus-5-5', 'moonshotai/kimi-k3', 'qwen/qwen3.7-flash']) assert.equal(puntiSuiMessaggiOnorati(m), true, m)
  for (const m of ['z-ai/glm-5.3-flash', 'deepseek/deepseek-v4', 'google/gemini-3-flash', 'openai/gpt-6', 'x-ai/grok-5', '', null]) assert.equal(puntiSuiMessaggiOnorati(m), false, String(m))
})
