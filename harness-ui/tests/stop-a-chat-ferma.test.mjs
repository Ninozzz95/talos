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

/*
 * Owner 29/10/2026 sera, «Stop anche a chat ferma» (bozzetto approvato; contratto con la CLI lo stesso giorno). Trovato dal vivo sul 4174: la
 * chat avvia due agenti, risponde e il suo giro FINISCE; gli agenti lavorano ancora. Due campi additivi del registro:
 *   - `talos.figlie-fermate` porta `chatFerma: true` quando la chat non aveva un giro (la riga è «Fermati N agenti», senza «anche»);
 *   - ogni riga di `elenca()` porta `discendentiAlLavoro: N` (tutto l'albero, lo stesso filtro di `fermaTutto`), assente se 0.
 */
const riga = (registry, id) => registry.elenca().find((r) => r.sessionId === id)

test('SAF-01 la chat ha risposto, due agenti lavorano: «Ferma tutto» ferma solo loro e l\'evento dice chatFerma', async (t) => {
    const { registry, runtime, sessionId, figlieFermate } = await scena(t)
    await dueFiglie(runtime)
    runtime.fine(0) // la madre risponde «li ho avviati» e il suo giro finisce
    await attesa(30)
    assert.equal(riga(registry, sessionId).conclusa, true, 'premessa: la chat è ferma')
    const esito = registry.fermaTutto(sessionId)
    assert.equal(esito.figlieFermate, 2)
    assert.deepEqual(figlieFermate().map((v) => [v.quante, v.chatFerma]), [[2, true]])
})

test('SAF-02 AL CONTRARIO: con la chat al lavoro l\'evento NON porta chatFerma (riga di sempre, «Fermati anche N agenti»)', async (t) => {
    const { registry, runtime, sessionId, figlieFermate } = await scena(t)
    await dueFiglie(runtime)
    const esito = registry.fermaTutto(sessionId)
    assert.equal(esito.fermata, true)
    assert.equal(Object.hasOwn(figlieFermate()[0], 'chatFerma'), false)
})

test('SAF-03 elenca: la madre ferma con due figlie al lavoro dice discendentiAlLavoro 2; le figlie no; a figlie finite il campo sparisce', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await dueFiglie(runtime)
    runtime.fine(0)
    await attesa(30)
    assert.equal(riga(registry, sessionId).discendentiAlLavoro, 2)
    const figlie = registry.elenca().filter((r) => r.padreId === sessionId)
    assert.equal(figlie.length, 2)
    for (const f of figlie) assert.equal(Object.hasOwn(f, 'discendentiAlLavoro'), false, 'una figlia senza nipoti non porta il campo')
    runtime.fine(1); runtime.fine(2)
    await attesa(30)
    assert.equal(Object.hasOwn(riga(registry, sessionId), 'discendentiAlLavoro'), false, 'AL CONTRARIO: finite le figlie, il campo sparisce')
})

test('SAF-04 elenca conta tutto l\'albero: una nipote al lavoro sotto una figlia ferma conta per la madre e per la figlia', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    assert.equal((await runtime.runs[0].input.onDelega('figlia', '/tmp/f')).esito, 'avviato')
    assert.equal((await runtime.runs[1].input.onDelega('nipote', '/tmp/n')).esito, 'avviato')
    assert.equal(runtime.runs.length, 3, 'premessa: madre, figlia, nipote')
    runtime.fine(1) // la figlia risponde, la nipote lavora
    runtime.fine(0)
    await attesa(30)
    const figliaId = registry.elenca().find((r) => r.padreId === sessionId).sessionId
    assert.equal(riga(registry, sessionId).discendentiAlLavoro, 1)
    assert.equal(riga(registry, figliaId).discendentiAlLavoro, 1)
})
