/*
 * C5 (owner 10/10/2026, brief §6, il suo esempio alla lettera: «list_subagents non deve necessariamente restituire tutti gli
 *   agenti») — `list_children` coi filtri, l'ordine, il cursore e i due formati. Registro vero, runtime finto (come K3).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry, esitoFigliaPerModello } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { ATTREZZI_ESTESI_OPENAI, PARAMETRI_ELENCO } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function runtimeControllabile() {
    const runs = []
    return {
        runs,
        avviaSessioneFn(input) {
            let resolve
            const promise = new Promise((r) => { resolve = r })
            const index = runs.length
            runs.push({ input, resolve })
            input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` })
            return promise
        },
        fine(index, comeFinita = 'concluso') {
            const run = runs[index]
            run.input.onEvento({ type: 'RunFinished', threadId: `t${index}`, runId: `r${index}` })
            // come il kernel: un giro che non conclude torna ok:false col suo esito
            run.resolve({ ok: comeFinita === 'concluso', esito: { detto: `risposta ${index}`, comeFinita,
                messaggiFinali: [{ role: 'user', content: 'avvia' }, { role: 'assistant', content: `risposta ${index}` }] } })
        },
    }
}
async function scena(t, quante) {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c5-figli-'))
    const runtime = runtimeControllabile()
    let ora = Date.parse('2026-10-10T10:00:00Z')
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
        preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
        modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, clock: () => new Date(ora) })
    t.after(async () => {
        await registry.chiudi?.()
        try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
        rimuoviCartellaDiProva(cartellaStore)
    })
    registry.avvia('task')
    for (let i = 0; i < quante; i += 1) {
        ora += 1000 // ognuna parte un secondo dopo: l'ordine «started» è quello di creazione
        await runtime.runs[0].input.onDelega(`figlia ${i}`, `/tmp/f${i}`)
    }
    return { registry, runtime, elenca: (a = {}) => runtime.runs[0].input.listChildrenFn(a), avanza: (ms) => { ora += ms } }
}

test('C5-FIGLI-01: the schema carries the §6 filters and the common paging parameters', () => {
    const s = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'list_children').function.parameters
    assert.deepEqual(Object.keys(s.properties).sort(), ['cursor', 'limit', 'response_format', 'sort', 'status', 'workflow'])
    assert.deepEqual(s.properties.status.enum, ['running', 'finished', 'stopped', 'paused', 'not finished', 'interrupted', 'needs_attention'])
    for (const k of Object.keys(PARAMETRI_ELENCO)) assert.deepEqual(s.properties[k], PARAMETRI_ELENCO[k], `${k} is the shared one, not a copy`)
})

test('C5-FIGLI-02: status filters; finished and running are told apart', async (t) => {
    const { runtime, elenca } = await scena(t, 3)
    runtime.fine(2) // la figlia 1 (run 2) finisce
    await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual((await elenca({ status: 'finished' })).items.map((c) => c.task), ['figlia 1'])
    assert.deepEqual((await elenca({ status: 'running' })).items.map((c) => c.task), ['figlia 0', 'figlia 2'])
    // al contrario: senza filtro ci sono tutte, e uno stato che nessuno ha dà un elenco vuoto, non un errore
    assert.equal((await elenca()).items.length, 3)
    assert.deepEqual((await elenca({ status: 'interrupted' })).items, [])
})

test('C5-FIGLI-03: needs_attention is a child waiting for a permission (the real approval door)', async (t) => {
    const { runtime, elenca } = await scena(t, 2)
    void runtime.runs[2].input.chiediApprovazioneFn({ tipo: 'shell', comando: 'rm -rf build', toolCallId: 'call_x' }) // la figlia 1 chiede
    await new Promise((r) => setTimeout(r, 20))
    const attente = (await elenca({ status: 'needs_attention' })).items
    assert.deepEqual(attente.map((c) => [c.task, c.needsAttention]), [['figlia 1', true]])
    // al contrario: l'altra non porta il segno, e l'elenco intero lo mostra solo su quella
    assert.deepEqual((await elenca()).items.map((c) => Boolean(c.needsAttention)), [false, true])
})

test('C5-FIGLI-04: limit + cursor walk all children once; the note says how to narrow or continue', async (t) => {
    const { elenca } = await scena(t, 5)
    const prima = await elenca({ limit: 2 })
    assert.equal(prima.items.length, 2)
    assert.equal(prima.has_more, true)
    assert.equal(prima.testo.split('\n').at(-1), `3 more. Narrow with status=running or status=needs_attention, or continue with cursor=${prima.next_cursor}`)
    const seconda = await elenca({ limit: 2, cursor: prima.next_cursor })
    const terza = await elenca({ limit: 2, cursor: seconda.next_cursor })
    assert.deepEqual([...prima.items, ...seconda.items, ...terza.items].map((c) => c.task), ['figlia 0', 'figlia 1', 'figlia 2', 'figlia 3', 'figlia 4'])
    assert.equal(terza.has_more, false)
    assert.equal(terza.next_cursor, null)
    // al contrario: lo stesso cursore con un altro filtro si rifiuta e lo dice
    const rifiuto = await elenca({ limit: 2, cursor: prima.next_cursor, status: 'running' })
    assert.deepEqual(rifiuto.items, [])
    assert.match(rifiuto.testo, /filters changed/)
})

test('C5-FIGLI-05: sort=recent puts the latest activity first', async (t) => {
    const { runtime, elenca, avanza } = await scena(t, 3)
    avanza(60_000)
    runtime.runs[1].input.onEvento({ type: 'TextMessageContent', messageId: 'm', delta: 'lavoro' }) // la figlia 0 si muove ora
    await new Promise((r) => setTimeout(r, 20))
    const recenti = (await elenca({ sort: 'recent' })).items.map((c) => c.task)
    assert.equal(recenti[0], 'figlia 0', `the most recently active first: ${recenti.join(', ')}`)
    // al contrario: l'ordine predefinito resta quello di partenza
    assert.deepEqual((await elenca()).items.map((c) => c.task), ['figlia 0', 'figlia 1', 'figlia 2'])
})

test('C5-FIGLI-06: concise keeps the handle (childId) and leaves out the rest; detailed adds model and start time', async (t) => {
    const { elenca } = await scena(t, 1)
    const breve = (await elenca()).items[0]
    assert.equal(typeof breve.childId, 'string', 'stop/pause/resume/ask need it: concise keeps it')
    assert.equal('startedAt' in breve, false)
    assert.equal('model' in breve, false)
    const lungo = (await elenca({ response_format: 'detailed' })).items[0]
    assert.equal(typeof lungo.startedAt, 'string')
    assert.equal('model' in lungo, true)
})

test('C5-FIGLI-10: the outcome of a child that did not finish is said in English, never with the kernel\'s internal word', async (t) => {
    const { runtime, elenca } = await scena(t, 2)
    for (const i of [1, 2]) runtime.fine(i, 'giri-esauriti')
    await new Promise((r) => setTimeout(r, 20))
    // una delega che non conclude: l'orchestratore scrive «fallito» (esitoDelegaDaRisultato), e al modello arriva «failed»
    const lungo = await elenca({ response_format: 'detailed' })
    assert.deepEqual(lungo.items.map((c) => [c.state, c.outcome]), [['not finished', 'failed'], ['not finished', 'failed']])
    assert.match(lungo.testo, /outcome failed/)
    assert.doesNotMatch(lungo.testo, /fallito|giri-esauriti/)
    // la tabella: gli esiti del kernel in inglese, e una parola mai vista non passa grezza
    assert.deepEqual(['fallito', 'giri-esauriti', 'ripetizione', 'tetto-uscita', 'premesse-negate', 'uno-mai-visto', null].map(esitoFigliaPerModello), [
        'failed', 'ran out of turns', 'stopped for repeating the same call', 'hit the output limit',
        'refused: the task rested on a false premise', 'ended without finishing', 'ended without finishing'])
    // al contrario: «concise» non lo porta, e una figlia finita bene non ha un outcome
    assert.equal((await elenca()).items.some((c) => 'outcome' in c), false)
})

test('C5-FIGLI-07: an unknown workflow run filters everything out without breaking', async (t) => {
    const { elenca } = await scena(t, 2)
    const vuoto = await elenca({ workflow: 'run-che-non-esiste' })
    assert.deepEqual(vuoto.items, [])
    assert.equal(vuoto.testo, 'No children match workflow=run-che-non-esiste.')
})

/* Il kernel dà al modello il TESTO (owner 10/10, «Testo a righe»); un ospite vecchio che dà ancora l'oggetto (la CLI fino al
   riallineamento) si stampa come prima, in JSON. Si legge ciò che arriva DAVVERO al fornitore nella seconda chiamata. */
test('C5-FIGLI-08: the kernel sends the host text to the model; an old host object still prints as JSON', async () => {
    const { talosLavora } = await import('../src/kernel/talosHarness.mjs')
    const enc = new TextEncoder()
    const sse = (pezzi) => new Response(new ReadableStream({ start(c) { for (const p of pezzi) c.enqueue(enc.encode(`data: ${JSON.stringify(p)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close() } }))
    for (const [nome, risposta, atteso] of [
        ['text host', { items: [], testo: 'Children: showing 0 of 0.' }, 'Children: showing 0 of 0.'],
        ['old host', { children: [{ childId: 'c1' }] }, JSON.stringify({ children: [{ childId: 'c1' }] })],
    ]) {
        const dir = mkdtempSync(join(tmpdir(), 'talos-c5-k-'))
        let n = 0
        let inviati = null
        await talosLavora({
            cartella: dir, task: { consegna: 'elenca le figlie' }, modello: 'x', chiave: 'y', onDelta: () => {},
            strumentiEstesi: ['list_children'], listChildrenFn: async () => risposta,
            fetchDiRete: async (_url, opzioni) => {
                n += 1
                if (n === 1) return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'list_children', arguments: '{}' } }] } }] }])
                inviati = JSON.parse(opzioni.body).messages
                return sse([{ choices: [{ delta: { content: 'fatto' } }] }])
            },
        }).catch(() => {})
        rimuoviCartellaDiProva(dir) // BC09 classe A: il kernel scrive e chiude dentro la chiamata, niente resta aperto
        const tool = (inviati ?? []).find((m) => m.role === 'tool')
        assert.equal(tool?.content, atteso, nome)
    }
})

/* Review C5 (bugfixer, 10/10/2026): «completed», «failed», «Running», «needs-attention» davano «No children match status=…» —
   un elenco svuotato in silenzio, che il modello legge come un fatto. Le parole del §6 dell'owner valgono, e uno sconosciuto si dice. */
test('C5-FIGLI-09: the §6 words and case/dashes work as status; an unknown status is ignored with a note, never an empty list', async (t) => {
    const { runtime, elenca } = await scena(t, 2)
    runtime.fine(2)
    await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual((await elenca({ status: 'completed' })).items.map((c) => c.task), ['figlia 1'], 'completed = finished')
    assert.deepEqual((await elenca({ status: 'Running' })).items.map((c) => c.task), ['figlia 0'])
    void runtime.runs[1].input.chiediApprovazioneFn({ tipo: 'shell', comando: 'ls', toolCallId: 'x' })
    await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual((await elenca({ status: 'needs-attention' })).items.map((c) => c.task), ['figlia 0'])
    const ignoto = await elenca({ status: 'sleeping' })
    assert.equal(ignoto.items.length, 2, 'not filtered: an unknown value is not an empty list')
    assert.match(ignoto.testo, /status "sleeping" is unknown and was ignored\. Valid: running, finished, stopped, paused, not finished, interrupted, needs_attention\./)
})
