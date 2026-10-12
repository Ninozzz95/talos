/*
 * 11/10/2026 (owner, «leviamola sta funzione, inutile») — LE RISERVE («se non risponde, continua con…») SONO TOLTE.
 *   Ambito scelto dall'owner: interfaccia + server, kernel intatto. Il campo `fallbackProviders` RESTA nel formato della sessione e
 *   nell'API (la CLI e i client vecchi lo mandano, i file vecchi lo hanno: misurato su `AVM-cli-kmerge`, due prove scrivono
 *   `fallbackProviders: []`), ma il registro lo tiene SEMPRE vuoto: il giro non riceve mai una riserva, quindi non cambia mai
 *   fornitore da sé. Tre porte: l'avvio, il cambio di impostazioni, la ripresa di una sessione salvata quando le riserve c'erano.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSessionRegistry, SCHEMA_SESSIONE } from '../src/session-registry.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const RISERVE = [{ provider: 'deepseek', model: 'deepseek-chat' }, { provider: 'zai', model: 'glm-4.7-flash' }]

function registroDiProva(t, cartellaStore = mkdtempSync(join(tmpdir(), 'talos-riserve-'))) {
    const avviati = []
    const registro = createSessionRegistry({
        cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
        preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
        avviaSessioneFn: async (input) => {
            avviati.push(input)
            input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${avviati.length}` })
            input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${avviati.length}` })
            return { comeFinita: 'concluso' }
        },
    })
    t.after(async () => {
        await registro.chiudi?.()
        await new Promise((r) => setTimeout(r, 50))
        rimuoviCartellaDiProva(cartellaStore)
    })
    return { registro, avviati, cartellaStore }
}
const voce = (registro, id) => registro.elenca().find((s) => s.sessionId === id)

test('RISERVE-01 AVVIO: fallbacks asked at the start are accepted and dropped — the run gets none, the list shows none', async (t) => {
    const { registro, avviati } = registroDiProva(t)
    const esito = registro.avvia('task', { fallbackProviders: structuredClone(RISERVE) })
    assert.equal(esito.erroreAvvio, undefined, 'a client that still sends them is not refused')
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(avviati.length, 1)
    assert.deepEqual(avviati[0].fallbackProviders, [], 'the run never receives a fallback')
    assert.deepEqual(voce(registro, esito.sessionId).fallbackProviders, [], 'the field stays in the format, empty')
})

test('RISERVE-02 CAMBIO: fallbacks sent with the settings are accepted and dropped; the next turn gets none', async (t) => {
    const { registro, avviati } = registroDiProva(t)
    const { sessionId } = registro.avvia('task', {})
    await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { fallbackProviders: structuredClone(RISERVE) }), { ok: true })
    assert.deepEqual(voce(registro, sessionId).fallbackProviders, [])
    assert.equal(registro.resume(sessionId, 'continua').erroreAvvio, undefined)
    await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual(avviati.at(-1).fallbackProviders, [])
})

test('RISERVE-03 DATO VECCHIO: a session saved when fallbacks existed opens, lists none and resumes with none', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-riserve-vecchie-'))
    const righe = [
        { tipo: 'intestazione', schema: SCHEMA_SESSIONE, sessionId: 'sess-riserve', taskId: 'libero:x', cartella: cartellaStore, task: { consegna: 'vecchia', consegnaCorta: 'vecchia' },
            avviataAlle: '2026-10-01T10:00:00.000Z', modello: 'm', permessi: 'Workspace write', modalitaOperativa: 'normale', fallbackProviders: RISERVE },
        { tipo: 'impostazioni-sessione', modello: 'm', modelloPlanner: null, reasoning: null, permessi: 'Workspace write', modalitaOperativa: 'normale', permessiPerAttrezzo: null, modelId: 'm', fallbackProviders: RISERVE },
        { type: 'RunStarted', threadId: 't1', runId: 'r1', _sequenza: 1 },
        { type: 'RunFinished', threadId: 't1', runId: 'r1', _sequenza: 2 },
    ].map((r) => JSON.stringify(r)).join('\n') + '\n'
    writeFileSync(join(cartellaStore, 'sess-riserve.jsonl'), righe)
    const { registro, avviati } = registroDiProva(t, cartellaStore)
    await registro.ripristina()
    assert.ok(voce(registro, 'sess-riserve'), 'the old session is still there')
    assert.deepEqual(voce(registro, 'sess-riserve').fallbackProviders, [], 'saved fallbacks are ignored')
    assert.equal(registro.resume('sess-riserve', 'continua').erroreAvvio, undefined)
    await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual(avviati.at(-1).fallbackProviders, [])
})

/* Review dell'11/10/2026: la porta HTTP validava ancora le riserve, quindi poteva RIFIUTARE una richiesta per un campo che poi il
   registro butta via (un fornitore sconosciuto, una forma storta). Un campo tolto non decide più niente: passa e si scarta. */
test('RISERVE-04 HTTP: a request carrying fallbacks is never refused for them — well formed, unknown provider or malformed', async (t) => {
    const { createServer } = await import('node:http')
    const { createHttpApp } = await import('../src/http-app.mjs')
    const { registro } = registroDiProva(t)
    const { sessionId } = registro.avvia('task', {})
    await new Promise((r) => setTimeout(r, 20))
    const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }))
    await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
    t.after(() => new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()) }))
    const url = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${encodeURIComponent(sessionId)}/settings`
    for (const riserve of [RISERVE, [{ provider: 'fornitore-che-non-esiste', model: 'x' }], 'non una lista', [{ provider: 7 }], null]) {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fallbackProviders: riserve, permessi: 'Read only' }) })
        assert.equal(r.status, 200, `${JSON.stringify(riserve)} → ${JSON.stringify(await r.json())}`)
        assert.deepEqual(voce(registro, sessionId).fallbackProviders, [])
    }
    assert.equal(voce(registro, sessionId).permessi, 'Read only', 'the rest of the request is still applied')
})
