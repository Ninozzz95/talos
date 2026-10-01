/*
 * F001b, decisione owner 01/10/2026 «Ricerca che continua» — il cablaggio: la lista delle ricerche è DELLA SESSIONE (la stessa
 * per i suoi giri, un'altra per un'altra sessione), arriva al kernel da agent-service, e le ricerche vive si fermano con lo
 * Stop del giro, con l'eliminazione della sessione e con lo spegnimento del server.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function registroDiProva(t, { cartellaStore = null } = {}) {
    return import('../src/session-registry.mjs').then(({ createSessionRegistry }) => {
        const runs = []
        const avviaSessioneFn = (input) => {
            let risolvi
            const promessa = new Promise((r) => { risolvi = r })
            const i = runs.length
            runs.push({ input, risolvi })
            input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` })
            return promessa
        }
        const fine = (i) => { runs[i].input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` }); runs[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'lavora' }, { role: 'assistant', content: 'ok' }] } }) }
        const registro = createSessionRegistry({ avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, ...(cartellaStore ? { cartellaStore } : {}),
            preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }) })
        t.after(() => registro.chiudi?.())
        return { registro, runs, fine }
    })
}

test('CAB-01: la lista delle ricerche è della SESSIONE: la stessa al giro ripreso, un altra per un altra sessione', async (t) => {
    const { registro, runs, fine } = await registroDiProva(t)
    const { sessionId } = registro.avvia('task')
    fine(0)
    await registro.attendiAssestamento(sessionId)
    assert.equal(registro.resume(sessionId, 'continua').sessionId, sessionId)
    assert.equal(typeof runs[0].input.ricercheInCorso?.fermaTutte, 'function')
    assert.equal(runs[1].input.ricercheInCorso, runs[0].input.ricercheInCorso)
    fine(1)
    await registro.attendiAssestamento(sessionId)
    const altra = registro.avvia('task')
    assert.notEqual(runs[2].input.ricercheInCorso, runs[0].input.ricercheInCorso)
    fine(2)
    await registro.attendiAssestamento(altra.sessionId)
})

test('CAB-02: agent-service porta la lista al kernel com è', async () => {
    let visto
    const ricercheInCorso = { fermaTutte() {} }
    await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, ricercheInCorso,
        talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto' } } })
    assert.equal(visto.ricercheInCorso, ricercheInCorso)
})

test('CAB-03: lo Stop del giro ferma le ricerche vive della sessione', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'talos-cab03-'))
    t.after(() => rimuoviCartellaDiProva(dir))
    const fermate = []
    const ricercheInCorso = { fermaTutte: (motivo) => fermate.push(motivo) }
    const stop = new AbortController()
    await talosLavora({ cartella: dir, task: { consegna: 'cerca' }, modello: 'f', chiave: 'k', segnaleStop: stop.signal, ricercheInCorso,
        fetchDiRete: async () => { stop.abort(); return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } }) } })
    assert.deepEqual(fermate, ['fermata'])
})

test('CAB-04: eliminare la sessione e spegnere il registro fermano le ricerche vive', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-cab04-'))
    t.after(() => rimuoviCartellaDiProva(cartellaStore))
    const { registro, runs, fine } = await registroDiProva(t, { cartellaStore })
    const { sessionId } = registro.avvia('task')
    const lista = runs[0].input.ricercheInCorso
    const fermate = []
    lista.fermaTutte = (motivo) => fermate.push(motivo)
    fine(0)
    await registro.attendiAssestamento(sessionId)
    await registro.elimina(sessionId)
    assert.deepEqual(fermate, ['fermata'], 'eliminazione')
    const altra = registro.avvia('task')
    const seconda = runs[1].input.ricercheInCorso
    const allaChiusura = []
    seconda.fermaTutte = (motivo) => allaChiusura.push(motivo)
    fine(1)
    await registro.attendiAssestamento(altra.sessionId)
    await registro.chiudi()
    assert.deepEqual(allaChiusura, ['fermata'], 'spegnimento')
})
