/*
 * ⭐ P18 pacchetto 2 — la verifica del desktop su `syncOriginals` incrementale (26/09/2026 notte).
 *
 * `p18-sync-originals-incrementale.test.mjs` (della CLI) prova che la cache evita la rilettura e che una revisione cambiata
 * la invalida. Non prova che la cache contenga ANCHE i messaggi appena archiviati: se contenesse solo quelli vecchi, un
 * messaggio già archiviato e poi cambiato non verrebbe più scoperto come divergenza (misurato rompendo la cura: la prova
 * della CLI resta verde). Qui: due sincronizzazioni, la seconda dalla cache; poi si cambia un messaggio archiviato dalla
 * seconda e la terza — ancora dalla cache — deve dire `CTX_HISTORY_DIVERGED`, senza aver toccato l'archivio.
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

describe('P18 sul desktop — syncOriginals incrementale', () => {
  it('un messaggio archiviato dalla sincronizzazione precedente e poi cambiato è una divergenza, anche passando dalla cache', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'p18-sync-desktop-'))
    const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') })
    t.after(async () => { try { await store.close?.() } catch { /* già chiuso */ } rimuoviCartellaDiProva(dir) })
    let letture = 0
    const contato = { ...store, readOriginals: (...a) => { letture += 1; return store.readOriginals(...a) } }
    const a = servizio(contato)
    const storia = [m('system', 'regole'), m('user', 'uno')]
    await a.syncOriginals({ sessionId: 's1', messages: storia })
    storia.push(m('assistant', 'fatto'), m('user', 'due'))
    await a.syncOriginals({ sessionId: 's1', messages: storia })
    const letturePrima = letture
    const cambiata = [...storia.slice(0, 2), m('assistant', 'fatto, ma riscritto'), storia[3], m('assistant', 'tre')]
    await assert.rejects(() => a.syncOriginals({ sessionId: 's1', messages: cambiata }), (e) => e?.code === 'CTX_HISTORY_DIVERGED')
    assert.equal(letture, letturePrima, 'la divergenza si è scoperta dalla cache, senza rileggere l’archivio')
    const originali = await store.readOriginals({ sessionId: 's1', afterSequence: 0, limit: 1000 })
    assert.deepEqual(originali.map((r) => r.message), storia, 'l’archivio non ha preso niente della storia cambiata')
  })
})
