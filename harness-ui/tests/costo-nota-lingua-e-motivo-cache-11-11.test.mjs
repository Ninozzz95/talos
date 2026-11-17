/*
 * Costo delle conversazioni lunghe, cure piccole (owner 11/11/2026 07:47-07:52, «Piccole subito, la grande dopo»):
 *   S9 / P043 — la nota sulla lingua del messaggio viaggia SOLO nella prima richiesta dell'invio che arriva al modello (oggi: in tutte).
 *   S2 piccola — dopo un riassunto la testa e la storia cambiano INSIEME: l'avviso della cache dice «compattazione», non «istruzioni».
 * Modello FINTO (`fetchDiRete` della prova), zero rete, zero dollari. Misure di partenza: rapporto del lettore S1/S2 dell'11/11.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { talosLavora, INIZIO_NOTA_LINGUA_DEL_MESSAGGIO, INIZIO_RIGA_LINGUA, improntaDellaRichiesta, motivoDellaCacheRicominciata } from '../src/kernel/talosHarness.mjs'
import { createContextEngine } from '../../context-engine/src/engine.mjs'
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs'
import { parseContextSettings } from '../../context-engine/src/contracts.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const testo = (m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join(''))
const notaDi = (m) => m.role === 'system' && testo(m).startsWith(INIZIO_NOTA_LINGUA_DEL_MESSAGGIO)
const chiamaElenca = (k) => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'elenca', arguments: '{}' } }] })

/** Un invio: le prime `attrezzi` richieste chiamano `elenca`, l'ultima chiude. Restituisce le richieste partite e l'esito. */
async function invio({ linguaDelMessaggio, attrezzi = 6, messaggiIniziali, consegna = 'Guarda i file della cartella e dimmi cosa c\'è.', extra = {} }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-costo-s9-'))
  writeFileSync(join(cartella, 'a.txt'), 'prova')
  const richieste = []
  let k = 0
  try {
    const esito = await talosLavora({
      cartella, task: { consegna }, modello: 'finto/modello', chiave: 'finta', _giriMassimiInterno: attrezzi + 4,
      ...(linguaDelMessaggio ? { linguaDelMessaggio } : {}), ...(messaggiIniziali ? { messaggiIniziali } : {}), ...extra,
      fetchDiRete: async (url, init) => {
        if (!init?.body) throw new Error(`rete vietata: ${url}`)
        const corpo = JSON.parse(init.body)
        richieste.push({ messaggi: corpo.messages, attrezzi: corpo.tools ?? [] })
        k += 1
        const usage = { prompt_tokens: 1000 + k, completion_tokens: 5, prompt_tokens_details: { cached_tokens: k > 1 ? 900 : 0 } }
        if (k <= attrezzi) return Response.json({ choices: [{ message: chiamaElenca(k), finish_reason: 'tool_calls' }], usage })
        return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage })
      },
    })
    return { richieste, esito }
  } finally { rimuoviCartellaDiProva(cartella) }
}

test('COSTO-S9-01 — un invio di 7 richieste: la nota sulla lingua SOLO nella prima (oggi 7 su 7), in coda, mai nella storia; la cache non cambia', async () => {
  const { richieste, esito } = await invio({ linguaDelMessaggio: 'it' })
  assert.equal(richieste.length, 7, 'premessa: 7 richieste nello stesso invio')
  assert.deepEqual(richieste.map((r) => r.messaggi.filter(notaDi).length), [1, 0, 0, 0, 0, 0, 0])
  assert.equal(testo(richieste[0].messaggi.at(-1)), "The person's last message is in Italian: reply in Italian.", 'nella prima, in coda')
  assert.equal((esito?.messaggiFinali ?? []).filter(notaDi).length, 0, 'mai salvata nella storia')
  /* la cache come oggi: fra due richieste nessun motivo per ricominciare (la nota è in coda, fuori dall'impronta) */
  for (let i = 1; i < richieste.length; i++) {
    const a = improntaDellaRichiesta({ modello: 'finto/modello', messaggi: richieste[i - 1].messaggi, attrezzi: richieste[i - 1].attrezzi })
    const b = improntaDellaRichiesta({ modello: 'finto/modello', messaggi: richieste[i].messaggi, attrezzi: richieste[i].attrezzi })
    assert.equal(motivoDellaCacheRicominciata({ ...a, tokenDaCache: 900, at: Date.now(), durataMs: 300_000 }, b, { tokenDaCache: 900 }), null, `richiesta ${i + 1}`)
  }
})

test('COSTO-S9-02 — al contrario: un invio NUOVO con un\'altra lingua porta di nuovo la sua nota, nella sua prima richiesta', async () => {
  const primo = await invio({ linguaDelMessaggio: 'it', attrezzi: 2 })
  const storia = [...primo.richieste.at(-1).messaggi.filter((m) => !notaDi(m)), { role: 'assistant', content: 'Fatto.' }, { role: 'user', content: 'Now list them again, in English please.' }]
  const secondo = await invio({ linguaDelMessaggio: 'en', attrezzi: 2, messaggiIniziali: storia, consegna: 'Now list them again, in English please.' })
  assert.deepEqual(secondo.richieste.map((r) => r.messaggi.filter(notaDi).length), [1, 0, 0])
  assert.equal(testo(secondo.richieste[0].messaggi.at(-1)), "The person's last message is in English: reply in English.")
  /* e senza lingua nota nessuna nota, come oggi */
  const senza = await invio({ attrezzi: 1 })
  assert.equal(senza.richieste.flatMap((r) => r.messaggi).filter(notaDi).length, 0)
})

test('COSTO-S9-03 — il primo passo dell\'invio non chiama il modello (la chiamata della persona): la nota va nella prima richiesta che PARTE', async () => {
  const avviate = []
  const { richieste } = await invio({
    linguaDelMessaggio: 'it', attrezzi: 1,
    extra: {
      chiamataIniziale: { nome: 'research_start', argomenti: { question: 'domanda della persona', depth: 'quick' } },
      onRicercaAvvia: async (a) => { avviate.push(a); return { ricercaId: `r${avviate.length}`, stato: 'avviata' } },
      chiediApprovazioneFn: async () => true,
    },
  })
  assert.equal(avviate.length, 1, 'premessa: il primo passo è la chiamata della persona, senza richiesta al modello')
  assert.ok(richieste.length >= 2, 'premessa: poi il modello lavora')
  assert.deepEqual(richieste.map((r) => r.messaggi.filter(notaDi).length), [1, ...Array(richieste.length - 1).fill(0)])
})

/* Desktop 11/11 (forma verde del giudice v1424), prova 1: l'interruttore vale per UN messaggio della persona */
test('COSTO-S9-04 — due messaggi di fila, italiano poi inglese: ognuno la sua nota una volta sola, alla prima richiesta; la seconda dice la lingua nuova', async () => {
  const primo = await invio({ linguaDelMessaggio: 'it', attrezzi: 3 })
  assert.deepEqual(primo.richieste.map((r) => r.messaggi.filter(notaDi).map(testo)),
    [["The person's last message is in Italian: reply in Italian."], [], [], []])
  const storia = [...primo.richieste.at(-1).messaggi.filter((m) => !notaDi(m)), { role: 'assistant', content: 'Fatto.' }, { role: 'user', content: 'And now in English: list them again.' }]
  const secondo = await invio({ linguaDelMessaggio: 'en', attrezzi: 3, messaggiIniziali: storia, consegna: 'And now in English: list them again.' })
  assert.deepEqual(secondo.richieste.map((r) => r.messaggi.filter(notaDi).map(testo)),
    [["The person's last message is in English: reply in English."], [], [], []])
})

/* Prova 2, prima metà: la riga della lingua in TESTA resta in ogni richiesta del giro (è lei che tiene la lingua nei giri lunghi di attrezzi) */
test('COSTO-S9-05 — la riga «Always reply in …» della testa è in OGNI richiesta dell\'invio, anche in quelle senza la nota', async () => {
  const { richieste } = await invio({ linguaDelMessaggio: 'it', extra: { linguaInterfaccia: 'it' } })
  assert.equal(richieste.length, 7)
  for (const [i, r] of richieste.entries()) {
    const fineTesta = r.messaggi.findIndex((m) => m.role !== 'system')
    assert.ok(fineTesta > 0, `richiesta ${i + 1}: premessa, c'è una testa`)
    assert.ok(r.messaggi.slice(0, fineTesta).some((m) => testo(m).includes(INIZIO_RIGA_LINGUA)), `richiesta ${i + 1}: la riga della lingua nella testa`)
  }
})

/* Prova 2, seconda metà: la prima chiamata si rompe a metà flusso senza effetti e il nucleo la ritenta (BUG-16): la nota non era consegnata */
const enc = new TextEncoder()
const flusso = (fotogrammi, errore = null) => {
  let passo = 0
  return new Response(new ReadableStream({
    pull(c) {
      if (passo < fotogrammi.length) { c.enqueue(enc.encode(`data: ${JSON.stringify(fotogrammi[passo])}\n\n`)); passo += 1; return }
      if (errore) c.error(errore)
      else { c.enqueue(enc.encode('data: [DONE]\n\n')); c.close() }
    },
  }))
}
test('COSTO-S9-06 — la prima chiamata fallisce e si ritenta: la nota riparte col reinvio (non era stata consegnata), poi più', async () => {
  const corpi = []
  const traffico = () => Object.assign(new Error('Troppo traffico presso il fornitore.'), { code: 'PROVIDER_REQUEST_ERROR', classe: 'traffico', transitorio: true })
  const cartella = mkdtempSync(join(tmpdir(), 'talos-costo-s9-rit-'))
  writeFileSync(join(cartella, 'a.txt'), 'prova')
  try {
    const risposte = [
      () => flusso([{ choices: [{ delta: { reasoning: 'Sto pensando' } }] }], traffico()),
      () => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'elenca', arguments: '{}' } }] } }] }, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }]),
      () => flusso([{ choices: [{ delta: { content: 'Fatto.' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }]),
    ]
    await talosLavora({
      cartella, task: { consegna: 'Guarda i file, per favore.' }, modello: 'x', chiave: 'y', linguaDelMessaggio: 'it', onDelta: () => {}, attesaRitentaMassimaMs: 1,
      fetchDiRete: async (_u, init) => { corpi.push(JSON.parse(init.body).messages); return risposte[corpi.length - 1]() },
    })
  } finally { rimuoviCartellaDiProva(cartella) }
  assert.equal(corpi.length, 3, 'premessa: la rotta, il reinvio, la richiesta dopo l\'attrezzo')
  assert.deepEqual(corpi.map((m) => m.filter(notaDi).length), [1, 1, 0])
})

/* ── S2 piccola ── */
const attrezzo = (name) => ({ type: 'function', function: { name, parameters: { type: 'object' } } })
const base = [{ role: 'system', content: 'You are a coding agent.' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }]
const imp = (messaggi) => improntaDellaRichiesta({ modello: 'm', messaggi, attrezzi: [attrezzo('leggi')] })
const conCache = (i) => ({ ...i, tokenDaCache: 100, at: 1_000, durataMs: 300_000 })
/* ultimo giro: il riassunto in una delle sue forme vere (qui quella del motore del contesto, `context-engine/src/summary.mjs:212-214`) */
const RIASSUNTO_DEL_MOTORE = '{"kind":"talos-context-memory","summary":{"text":"## Summary"},"protectedFacts":[]}'

test('COSTO-S2-01 — testa e storia cambiate INSIEME (un riassunto che porta in testa un system di metà storia): «compattazione», non «sistema»', () => {
  const prima = conCache(imp([...base, { role: 'system', content: '[La persona ha fermato il giro qui.]' }, { role: 'user', content: 'avanti' }]))
  const dopo = imp([base[0], { role: 'system', content: '[La persona ha fermato il giro qui.]' }, { role: 'user', content: RIASSUNTO_DEL_MOTORE }, { role: 'user', content: 'avanti' }])
  assert.equal(motivoDellaCacheRicominciata(prima, dopo, { tokenDaCache: 0 }), 'compattazione')
})

test('COSTO-S2-02 — al contrario: un vero cambio delle istruzioni SENZA riassunto dice ancora «sistema» (le istruzioni)', () => {
  const prima = conCache(imp(base))
  assert.equal(motivoDellaCacheRicominciata(prima, imp([{ role: 'system', content: 'Other.' }, ...base.slice(1)])), 'sistema')
  assert.equal(motivoDellaCacheRicominciata(prima, imp([{ role: 'system', content: 'Other.' }, ...base.slice(1), { role: 'user', content: 'ancora' }])), 'sistema', 'la storia che cresce non è un riassunto')
  assert.equal(motivoDellaCacheRicominciata(prima, imp([base[0], { role: 'user', content: '## Summary' }])), 'compattazione', 'il riassunto da solo, come oggi')
  assert.equal(motivoDellaCacheRicominciata(prima, imp(base)), null, 'niente cambiato, niente da dire')
})

test('COSTO-S2-03 — sul motore del contesto vero: la compattazione che copre un system salvato a metà storia dà «compattazione» (oggi «sistema»)', async () => {
  const now = '2026-11-11T00:00:00.000Z'
  const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
  const profilo = { provider: 'local', model: 'finto', windowTokens: 65536, responseReserve: 4096, local: true }
  const dir = await mkdtemp(join(tmpdir(), 'talos-costo-s2-'))
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') })
  try {
    await store.initSession({ sessionId: 'chat', settings: parseContextSettings({ auto: false }) })
    const model = {
      resolveModel: async ({ sessionModel }) => sessionModel,
      summarize: async (req) => {
        const corpo = JSON.parse(req.messages.at(-1).content)
        const id = corpo.sourceIds?.[0] ?? 'u0'
        const text = JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Progetto: dati del progetto.', goal: 'Continuare', decisions: ['dati del progetto'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: id, quote: 'dati del progetto' }] })
        return { text, finishReason: 'stop', usage: { prompt_tokens: 10, completion_tokens: 10 } }
      },
    }
    const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model } } }
    const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, guadagnoMinimoChiesto: 0 })
    let n = 0
    const aggiungi = async (role, content) => { n += 1; await engine.appendOriginal({ sessionId: 'chat', record: { id: `${role[0]}${n}`, message: { role, content }, createdAt: now } }) }
    await engine.appendOriginal({ sessionId: 'chat', record: { id: 'u0', message: { role: 'system', content: 'Sei TALOS. dati del progetto.' }, createdAt: now } })
    const scambi = async (q) => { for (let i = 0; i < q; i++) { await aggiungi('user', `richiesta ${n}: dati del progetto ${'parola '.repeat(250)}`); await aggiungi('assistant', `risposta ${n}: dati del progetto ${'risposta '.repeat(250)}`) } }
    await scambi(30)
    await aggiungi('system', '[La persona ha fermato il giro qui.] nota salvata nella storia')
    await scambi(3)
    const prepara = async () => (await engine.prepareForRequest({ sessionId: 'chat', sessionModel: profilo })).messages
    const prima = await prepara()
    const job = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'c1', sessionModel: profilo })
    const fine = await engine.waitForCompaction({ sessionId: 'chat', jobId: job.id })
    assert.equal(fine.state, 'committed', 'premessa: il riassunto è applicato')
    const dopo = await prepara()
    const testaDi = (l) => l.findIndex((m) => m.role !== 'system')
    assert.equal(testaDi(prima), 1, 'premessa: prima un solo system in testa')
    assert.equal(testaDi(dopo), 2, 'premessa: dopo il riassunto il system di metà storia è salito in testa (engine.mjs, fuori da questa cura)')
    const motivo = motivoDellaCacheRicominciata({ ...improntaDellaRichiesta({ modello: 'finto', messaggi: prima, attrezzi: [] }), tokenDaCache: 100, at: Date.now(), durataMs: 300_000 },
      improntaDellaRichiesta({ modello: 'finto', messaggi: dopo, attrezzi: [] }), { tokenDaCache: 0 })
    assert.equal(motivo, 'compattazione')
  } finally { await store.close(); rimuoviCartellaDiProva(dir) }
})
