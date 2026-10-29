/*
 * ⭐ «Ferma tutto» (owner 29/10/2026 sera: «se fermo la chat i sub agenti non si fermano, bisogna mettere un avviso se stoppare solo la
 * chat o anche i sub agenti»; contratto CONTRATTO-FERMA-TUTTE-2026-10-29, OK di CLI e Mobile). La logica sta nel registro:
 *   §0 `fermaTutto(id)` (= `ferma(id, { figlie: 'tutte' })`) ferma la sessione e ogni discendente al lavoro, scrive l'evento durevole
 *      `talos.figlie-fermate { quante, ids, da }`, e NON lascia che i «fermato» delle figlie risveglino il padre (K2 lo farebbe);
 *   §1 la rotta dello Stop accetta `figlie: 'tutte' | 'nessuna'`; assente, il comportamento di sempre;
 *   §2 la porta del modello: `child_control` con `childId: "all"`.
 * Come Hermes, che propaga l'interruzione alle figlie (`agent/interrupt_control.py:257-265`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'
import { attendiScritture } from '../src/session-store.mjs'
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
        fine(index, esito = 'concluso') {
            const run = runs[index]
            run.input.onEvento({ type: esito === 'concluso' ? 'RunFinished' : 'RunError', threadId: `t${index}`, runId: `r${index}`, ...(esito === 'fermato' ? { code: 'fermato' } : {}) })
            run.resolve({ ok: esito === 'concluso', esito: { detto: `risposta ${index}`, comeFinita: esito,
                messaggiFinali: [{ role: 'user', content: 'avvia le figlie' }, { role: 'assistant', content: `risposta ${index}` }] } })
        },
    }
}

async function scena(t) {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-ferma-tutte-'))
    const runtime = runtimeControllabile()
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
        preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia le figlie' } }),
        modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
    t.after(async () => {
        for (let i = 0; i < runtime.runs.length; i += 1) { try { runtime.fine(i, 'fermato') } catch { /* già finito */ } }
        await registry.chiudi?.()
        try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
        rimuoviCartellaDiProva(cartellaStore)
    })
    const { sessionId } = registry.avvia('task')
    const eventi = []
    t.after(registry.iscriviti(sessionId, (e) => eventi.push(e)))
    const figlieFermate = () => eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.figlie-fermate').map((e) => e.value)
    return { registry, runtime, sessionId, figlieFermate }
}
async function dueFiglie(runtime) {
    assert.equal((await runtime.runs[0].input.onDelega('figlia uno', '/tmp/uno')).esito, 'avviato')
    assert.equal((await runtime.runs[0].input.onDelega('figlia due', '/tmp/due')).esito, 'avviato')
    assert.equal(runtime.runs.length, 3, 'premessa: madre e due figlie al lavoro')
}
const aborted = (runtime, i) => runtime.runs[i].input.segnaleStop.aborted
const attesa = (ms) => new Promise((r) => setTimeout(r, ms))

test('FT-01 AL CONTRARIO (oggi): lo Stop senza `figlie` ferma solo la chat, le figlie continuano e nessun evento', async (t) => {
    const { registry, runtime, sessionId, figlieFermate } = await scena(t)
    await dueFiglie(runtime)
    assert.equal(registry.ferma(sessionId), true)
    assert.equal(registry.ferma(sessionId, { figlie: 'nessuna' }), true)
    assert.deepEqual([aborted(runtime, 0), aborted(runtime, 1), aborted(runtime, 2)], [true, false, false])
    assert.deepEqual(figlieFermate(), [])
})

test('FT-02 «Ferma tutto»: la chat e le due figlie si fermano, l\'evento dice quante e quali, da chi', async (t) => {
    const { registry, runtime, sessionId, figlieFermate } = await scena(t)
    await dueFiglie(runtime)
    const ids = (await runtime.runs[0].input.listChildrenFn({})).items.map((c) => c.childId)
    const esito = registry.fermaTutto(sessionId)
    assert.deepEqual({ fermata: esito.fermata, figlieFermate: esito.figlieFermate }, { fermata: true, figlieFermate: 2 })
    assert.deepEqual([...esito.ids].sort(), [...ids].sort())
    assert.deepEqual([aborted(runtime, 0), aborted(runtime, 1), aborted(runtime, 2)], [true, true, true])
    assert.deepEqual(figlieFermate().map((v) => [v.quante, [...v.ids].sort(), v.da]), [[2, [...ids].sort(), 'persona']])
})

test('FT-03 la stessa cosa da `ferma(id, { figlie: \'tutte\' })` (la forma della CLI), con chi ferma passato fino all\'evento', async (t) => {
    const { registry, runtime, sessionId, figlieFermate } = await scena(t)
    await dueFiglie(runtime)
    assert.equal(registry.ferma(sessionId, { figlie: 'tutte', daChi: 'sistema' }), true)
    assert.deepEqual([aborted(runtime, 1), aborted(runtime, 2)], [true, true])
    assert.deepEqual(figlieFermate().map((v) => [v.quante, v.da]), [[2, 'sistema']])
})

/* Il cuore del rischio: oggi (K2) uno Stop della persona lascia che i risultati delle figlie sveglino il padre. Fermando le figlie
   una per una il padre RIPARTE (controllo positivo: la prova vede un risveglio); con «Ferma tutto» no, e i risultati aspettano. */
test('FT-04 AL CONTRARIO: fermate una per una le figlie svegliano la chat con un giro nuovo (la prova vede il risveglio)', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await dueFiglie(runtime)
    const ids = (await runtime.runs[0].input.listChildrenFn({})).items.map((c) => c.childId)
    assert.equal(registry.ferma(sessionId), true)
    for (const id of ids) assert.equal(registry.ferma(id), true)
    runtime.fine(0, 'fermato')
    await registry.attendiAssestamento(sessionId)
    runtime.fine(1, 'fermato')
    runtime.fine(2, 'fermato')
    await t.waitFor(() => assert.equal(runtime.runs.length, 4, 'K2: il padre fermato dalla persona si sveglia coi risultati'))
})

test('FT-05 «Ferma tutto» non sveglia la chat: nessun giro nuovo, i risultati delle figlie restano in coda a vista', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await dueFiglie(runtime)
    assert.equal(registry.fermaTutto(sessionId).figlieFermate, 2)
    runtime.fine(0, 'fermato')
    await registry.attendiAssestamento(sessionId)
    runtime.fine(1, 'fermato')
    runtime.fine(2, 'fermato')
    await t.waitFor(() => assert.equal(registry.statoCoda(sessionId).voci.length, 2, 'i due esiti arrivano in coda'))
    await attesa(150)
    assert.equal(runtime.runs.length, 3, 'nessun giro a pagamento dopo «Ferma tutto»')
})

test('FT-06 con la chat già ferma e una figlia ancora al lavoro: «Ferma tutto» ferma la figlia e non sveglia la chat', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    assert.equal((await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')).esito, 'avviato')
    runtime.fine(0)
    await registry.attendiAssestamento(sessionId)
    const esito = registry.fermaTutto(sessionId)
    assert.deepEqual([esito.fermata, esito.figlieFermate, aborted(runtime, 1)], [true, 1, true])
    runtime.fine(1, 'fermato')
    await t.waitFor(() => assert.equal(registry.statoCoda(sessionId).voci.length, 1))
    await attesa(150)
    assert.equal(runtime.runs.length, 2, 'la chat a riposo non riparte per il «fermato» della figlia')
})

test('FT-07 una figlia già finita non conta e non si tocca; senza figlie al lavoro nessun evento', async (t) => {
    const { registry, runtime, sessionId, figlieFermate } = await scena(t)
    assert.equal((await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')).esito, 'avviato')
    runtime.fine(1)
    await t.waitFor(() => assert.equal(registry.statoCoda(sessionId).voci.length, 1))
    const esito = registry.fermaTutto(sessionId)
    assert.deepEqual([esito.fermata, esito.figlieFermate, esito.ids], [true, 0, []])
    assert.deepEqual(figlieFermate(), [])
    assert.deepEqual(registry.fermaTutto('nessuna'), { fermata: false, figlieFermate: 0, ids: [] })
})

test('FT-08 un nipote al lavoro si ferma con le figlie, e conta', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    assert.equal((await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')).esito, 'avviato')
    assert.equal((await runtime.runs[1].input.onDelega('nipote', '/tmp/due')).esito, 'avviato')
    const esito = registry.fermaTutto(sessionId)
    assert.deepEqual([esito.figlieFermate, aborted(runtime, 1), aborted(runtime, 2)], [2, true, true])
})

test('FT-09 la porta del modello: `child_control` con childId "all" ferma tutte le figlie dirette, il padre continua', async (t) => {
    const { runtime, figlieFermate } = await scena(t)
    await dueFiglie(runtime)
    const esito = await runtime.runs[0].input.stopChildFn({ childId: 'all' })
    assert.deepEqual([esito.childId, esito.stopped, esito.children.length], ['all', 2, 2])
    assert.deepEqual([aborted(runtime, 0), aborted(runtime, 1), aborted(runtime, 2)], [false, true, true])
    assert.deepEqual(figlieFermate().map((v) => [v.quante, v.da]), [[2, 'modello']])
    const dinuovo = await runtime.runs[0].input.stopChildFn({ childId: 'all' })
    assert.deepEqual([dinuovo.stopped, dinuovo.children.length], [0, 0], 'già ferme: niente da fare, nessun evento in più')
    assert.equal(figlieFermate().length, 1)
})

test('FT-10 pausa e ripresa di tutte: "all" mette in pausa le figlie al lavoro e riprende quelle in pausa', async (t) => {
    const { registry, runtime } = await scena(t)
    await dueFiglie(runtime)
    const pausa = await runtime.runs[0].input.pauseChildFn({ childId: 'all' })
    assert.deepEqual([pausa.childId, pausa.paused], ['all', 2])
    runtime.fine(1, 'in-pausa')
    runtime.fine(2, 'in-pausa')
    const ids = (await runtime.runs[0].input.listChildrenFn({})).items.map((c) => c.childId)
    for (const id of ids) await registry.attendiAssestamento(id)
    await t.waitFor(async () => assert.deepEqual((await runtime.runs[0].input.listChildrenFn({})).items.map((c) => c.state), ['paused', 'paused']))
    const ripresa = await runtime.runs[0].input.resumeChildFn({ childId: 'all' })
    assert.deepEqual([ripresa.childId, ripresa.children.length], ['all', 2])
})

test('FT-11 la rotta: `figlie:\'tutte\'` chiama fermaTutto e risponde col numero; assente resta com\'era; un valore storto è 400', async () => {
    const chiamate = []
    const sessionRegistry = {
        ferma: (id, opzioni) => { chiamate.push(['ferma', id, opzioni]); return id === 's-1' },
        fermaTutto: (id, opzioni) => { chiamate.push(['fermaTutto', id, opzioni]); return id === 's-1' ? { fermata: true, figlieFermate: 3, ids: ['a', 'b', 'c'] } : { fermata: false, figlieFermate: 0, ids: [] } },
    }
    const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry })
    const chiamaInterna = creaChiamataInterna({ httpApp, porta: 4999 })
    // creaChiamataInterna risolve { stato, dati } e rifiuta gli errori con `stato`
    const chiama = (opzioni) => chiamaInterna(opzioni).catch((e) => ({ stato: e.stato, dati: null }))
    const tutte = await chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/stop', corpo: { figlie: 'tutte' } })
    assert.equal(tutte.stato, 200)
    assert.deepEqual(tutte.dati, { stopped: true, figlieFermate: 3 })
    const sola = await chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/stop', corpo: { figlie: 'nessuna' } })
    assert.equal(sola.stato, 200)
    assert.deepEqual(sola.dati, { stopped: true })
    const vuota = await chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/stop', corpo: {} })
    assert.equal(vuota.stato, 200)
    assert.deepEqual(chiamate.map(([quale, id]) => [quale, id]), [['fermaTutto', 's-1'], ['ferma', 's-1'], ['ferma', 's-1']])
    for (const corpo of [{ figlie: 'boh' }, { figlie: true }, { altro: 1 }]) {
        const r = await chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/stop', corpo })
        assert.equal(r.stato, 400, JSON.stringify(corpo))
    }
    assert.equal(chiamate.length, 3, 'un corpo rifiutato non ferma niente')
    const assente = await chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s-9/stop', corpo: { figlie: 'tutte' } })
    assert.equal(assente.stato, 404)
})

test('FT-12 un secondo «Ferma tutto» mentre le figlie stanno ancora finendo non le riconta e non riscrive l\'evento (doppio clic)', async (t) => {
    const { registry, runtime, sessionId, figlieFermate } = await scena(t)
    await dueFiglie(runtime)
    assert.equal(registry.fermaTutto(sessionId).figlieFermate, 2)
    const dinuovo = registry.fermaTutto(sessionId)
    assert.deepEqual([dinuovo.fermata, dinuovo.figlieFermate, dinuovo.ids], [true, 0, []])
    assert.equal(figlieFermate().length, 1, 'una sola riga «fermati anche 2 agenti»')
})
