import { describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosSqliteRuntime } from '@/persistence/sqliteTypes'
import { createSqlJsConnection } from './sqlJsConnection'

/**
 * ⭐ B3-REC (owner 24/09/2026, «sì, devono restare separate») — tutto ciò che una chat ha scritto dentro una sessione
 * passa in una sessione NUOVA, in una sola transazione. Serve a riportare nella Chat le conversazioni finite per sbaglio
 * dentro una sessione del Codice (difetto 4 del ledger B3): la sessione di partenza resta dov'è, vuota di messaggi.
 */

async function sqlite(): Promise<TalosChatRepository> {
    const connection = await createSqlJsConnection()
    for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) {
        for (const statement of upgrade.statements) await connection.execute(statement)
    }
    const runtime: TalosSqliteRuntime = {
        platform: 'web',
        connect: async () => connection,
        persist: async () => undefined,
        close: async () => undefined,
    }
    const repository = createSqliteChatRepository(runtime)
    await repository.initialize()
    return repository
}

async function memoria(): Promise<TalosChatRepository> {
    const repository = createMemoryChatRepository()
    await repository.initialize()
    return repository
}

const IMPLEMENTAZIONI: ReadonlyArray<readonly [string, () => Promise<TalosChatRepository>]> = [
    ['sqlite', sqlite],
    ['memoria', memoria],
]

const CODICE = 'codice-1'
const NUOVA = {
    id: 'recuperata-1',
    title: 'Ciao dalla chat',
    active_model_profile_id: 'glm-5.3-flash',
    created_at: '2026-09-24T10:00:01.000Z',
    updated_at: '2026-09-24T10:00:02.000Z',
    metadata: { recuperata_dal_codice: CODICE },
}

/** La scena del difetto: una sessione del Codice con dentro una chat nativa (messaggi, attrezzi, bozza, coda). */
async function sessioneDelCodiceConUnaChat(repository: TalosChatRepository): Promise<void> {
    await repository.createSession({
        id: CODICE, title: 'Rifattorizza il parser', active_model_profile_id: null,
        created_at: '2026-09-24T09:00:00.000Z', metadata: { codice: true },
    })
    await repository.appendMessage({
        id: 'm-1', session_id: CODICE, role: 'user', content: 'Ciao dalla chat', state: 'persisted',
        created_at: '2026-09-24T10:00:01.000Z',
    })
    await repository.appendMessage({
        id: 'm-2', session_id: CODICE, role: 'assistant', content: 'Ciao!', state: 'persisted',
        model_profile_id: 'glm-5.3-flash', created_at: '2026-09-24T10:00:02.000Z',
    })
    await repository.appendToolActivity({
        id: 'a-1', session_id: CODICE, message_id: 'm-2', operation: 'web.search', status: 'succeeded',
        payload: {}, evidence: {}, created_at: '2026-09-24T10:00:02.000Z',
    })
    await repository.saveComposerDraft(CODICE, 'una bozza della chat')
    await repository.saveComposerQueue(CODICE, { voci: [{ id: 'q-1', testo: 'poi questo', creataAlle: 1 }], inPausa: true })
    await repository.upsertResearchRun({
        id: 'r-1', session_id: CODICE, question: 'Una ricerca', depth: 'quick', engine: 'device', status: 'done',
        started_at: '2026-09-24T10:00:03.000Z', updated_at: '2026-09-24T10:00:03.000Z',
    })
}

describe.each(IMPLEMENTAZIONI)('moveMessagesToNewSession (%s)', (_nome, crea) => {
    it('SPOSTA-01 i messaggi passano nella sessione nuova, nello stesso ordine; la sessione di partenza resta, vuota', async () => {
        const repository = await crea()
        await sessioneDelCodiceConUnaChat(repository)

        const nuova = await repository.moveMessagesToNewSession(CODICE, NUOVA)

        expect(nuova).toMatchObject({ id: NUOVA.id, title: NUOVA.title, active_model_profile_id: 'glm-5.3-flash',
            created_at: NUOVA.created_at, updated_at: NUOVA.updated_at, metadata: { recuperata_dal_codice: CODICE } })
        const spostati = await repository.listMessages(NUOVA.id)
        expect(spostati.map((m) => [m.id, m.session_id, m.ordinal])).toEqual([
            ['m-1', NUOVA.id, 0], ['m-2', NUOVA.id, 1],
        ])
        expect(await repository.listMessages(CODICE)).toEqual([])
        const sessioni = await repository.listSessions()
        const codice = sessioni.find((s) => s.id === CODICE)
        expect(codice?.metadata).toEqual({ codice: true })
        expect(codice?.title).toBe('Rifattorizza il parser')
        expect(codice?.has_messages).toBe(false)
        expect(sessioni.find((s) => s.id === NUOVA.id)?.has_messages).toBe(true)
    })

    it('SPOSTA-02 con i messaggi viaggia tutto ciò che la chat ha scritto: attrezzi, bozza, coda, ricerche', async () => {
        const repository = await crea()
        await sessioneDelCodiceConUnaChat(repository)

        await repository.moveMessagesToNewSession(CODICE, NUOVA)

        expect((await repository.listSessionToolActivities(NUOVA.id)).map((a) => a.id)).toEqual(['a-1'])
        expect(await repository.listSessionToolActivities(CODICE)).toEqual([])
        expect(await repository.loadComposerDraft(NUOVA.id)).toBe('una bozza della chat')
        expect(await repository.loadComposerDraft(CODICE)).toBe('')
        expect(await repository.loadComposerQueue(NUOVA.id)).toEqual({
            voci: [{ id: 'q-1', testo: 'poi questo', creataAlle: 1 }], inPausa: true,
        })
        expect(await repository.loadComposerQueue(CODICE)).toBeNull()
        expect((await repository.listResearchRuns()).find((r) => r.id === 'r-1')?.session_id).toBe(NUOVA.id)
    })

    it('SPOSTA-03 il puntatore della chat attiva segue i messaggi se era sulla sessione di partenza', async () => {
        const repository = await crea()
        await sessioneDelCodiceConUnaChat(repository)
        expect(await repository.getActiveSessionId()).toBe(CODICE)

        await repository.moveMessagesToNewSession(CODICE, NUOVA)

        expect(await repository.getActiveSessionId()).toBe(NUOVA.id)
    })

    it('SPOSTA-04 il puntatore su un’altra chat resta dov’è', async () => {
        const repository = await crea()
        await sessioneDelCodiceConUnaChat(repository)
        await repository.createSession({
            id: 'altra', title: 'Un’altra chat', active_model_profile_id: null, created_at: '2026-09-24T11:00:00.000Z',
        })

        await repository.moveMessagesToNewSession(CODICE, NUOVA)

        expect(await repository.getActiveSessionId()).toBe('altra')
    })

    it('SPOSTA-05 niente da spostare ⇒ nessuna sessione nuova (rieseguirlo non crea chat vuote)', async () => {
        const repository = await crea()
        await sessioneDelCodiceConUnaChat(repository)
        await repository.moveMessagesToNewSession(CODICE, NUOVA)
        const prima = (await repository.listSessions()).map((s) => s.id).sort()

        const seconda = await repository.moveMessagesToNewSession(CODICE, { ...NUOVA, id: 'recuperata-2' })

        expect(seconda).toBeNull()
        expect((await repository.listSessions()).map((s) => s.id).sort()).toEqual(prima)
    })

    it('SPOSTA-06 una sessione di partenza che non esiste è un errore, e non crea niente', async () => {
        const repository = await crea()
        await expect(repository.moveMessagesToNewSession('manca', NUOVA)).rejects.toThrow('TALOS_CHAT_SESSION_NOT_FOUND')
        expect(await repository.listSessions()).toEqual([])
    })

    it('SPOSTA-07 un id già usato per la sessione nuova è un errore, e i messaggi restano dov’erano', async () => {
        const repository = await crea()
        await sessioneDelCodiceConUnaChat(repository)
        await repository.createSession({
            id: NUOVA.id, title: 'Occupata', active_model_profile_id: null, created_at: '2026-09-24T11:00:00.000Z',
        })

        await expect(repository.moveMessagesToNewSession(CODICE, NUOVA)).rejects.toThrow()

        expect((await repository.listMessages(CODICE)).map((m) => m.id)).toEqual(['m-1', 'm-2'])
        expect(await repository.listMessages(NUOVA.id)).toEqual([])
    })
})
