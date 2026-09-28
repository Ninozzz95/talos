/*
 * ⭐ P18 (26/09/2026, patch approvata dall'owner via la lane CLI) — `syncOriginals` non rilegge l'archivio a ogni capture.
 * Le impronte gia' verificate restano in memoria finche' la revisione dell'archivio e' quella che le ha prodotte.
 * Qui: la seconda sincronizzazione non legge gli originali; una scrittura di un ALTRO servizio (revisione cambiata) fa
 * rileggere; una storia divergente si scopre come prima.
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createContextEngine } from '../../context-engine/src/engine.mjs'
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs'
import { createDesktopContextService } from '../src/context-desktop-service.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function servizio(store) {
    const profilo = { provider: 'ollama', model: 'fake', windowTokens: 65_536, responseReserve: 4_096 }
    const engine = createContextEngine({ store, model: { resolveModel: () => profilo, summarize: async () => { throw new Error('nessun riassunto') } }, tokenCounter: { countPreparedContext: async () => ({ inputTokens: 10, method: 'heuristic' }) } })
    return createDesktopContextService({ engine, store, readSession: async () => ({ sessionId: 's1' }), isSessionEnabled: async () => true, resolveSessionModel: async () => profilo })
}
const m = (role, content) => ({ role, content })

describe('P18 — syncOriginals incrementale', () => {
    it('non rilegge un archivio che nessuno ha cambiato, rilegge dopo una scrittura altrui, e scopre una divergenza', async (t) => {
        const dir = mkdtempSync(join(tmpdir(), 'p18-sync-'))
        const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') })
        t.after(async () => { try { await store.close?.() } catch { /* gia' chiuso */ } rimuoviCartellaDiProva(dir) })
        let letture = 0
        /* lo store e' congelato: un involucro con gli stessi metodi, e `readOriginals` che conta */
        const contato = { ...store, readOriginals: (...a) => { letture += 1; return store.readOriginals(...a) } }
        const a = servizio(contato)
        const storia = [m('system', 'regole'), m('user', 'uno')]
        await a.syncOriginals({ sessionId: 's1', messages: storia })
        const dopoLaPrima = letture
        storia.push(m('assistant', 'fatto'), m('user', 'due'))
        await a.syncOriginals({ sessionId: 's1', messages: storia })
        assert.equal(letture, dopoLaPrima, 'la seconda sincronizzazione non rilegge gli originali')

        /* un altro servizio sullo stesso archivio aggiunge un messaggio: la revisione cambia */
        const b = servizio(store)
        const storiaB = [...storia, m('assistant', 'da un altro processo')]
        await b.syncOriginals({ sessionId: 's1', messages: storiaB })
        await a.syncOriginals({ sessionId: 's1', messages: storiaB })
        assert.ok(letture > dopoLaPrima, 'revisione cambiata: si rilegge')

        /* una storia che non e' piu' un prolungamento dell'archivio si rifiuta come prima */
        const divergente = [...storiaB.slice(0, 2), m('assistant', 'riscritto'), ...storiaB.slice(3)]
        await assert.rejects(() => a.syncOriginals({ sessionId: 's1', messages: divergente }), (e) => e?.code === 'CTX_HISTORY_DIVERGED')
        const originali = await store.readOriginals({ sessionId: 's1', afterSequence: 0, limit: 1000 })
        assert.deepEqual(originali.map((r) => r.message), storiaB, 'l\'archivio e\' la storia, messaggio per messaggio')
    })
})
