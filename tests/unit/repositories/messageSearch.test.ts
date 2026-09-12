import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'
import { createLazyChatRepository } from '@/repositories/lazyChatRepository'
import { createTalosEphemeralRoutingRepository } from '@/repositories/ephemeralRoutingRepository'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import { createSqlJsConnection } from './sqlJsConnection'

const at = '2026-09-12T10:00:00.000Z'
const samples = [
    ['plain', 'Domani PARTIAMO per Catania.'],
    ['percent', 'Sconto 20% sul libro.'],
    ['underscore', 'Il nome è foto_estate.'],
    ['slash', 'Cartella C:\\note.'],
    ['unicode', 'È già CAFFÈ: cafe\u0301, ＴＡＬＯＳ e ﬁore.'],
    ['spaces', 'Prima\n\tdopo  ancora.'],
    ['emoji', 'Una ☕️ e 東京.'],
] as const
const cases = [
    ['partiamo', ['plain']], ['CATANIA', ['plain']], ['%','percent'], ['_', 'underscore'],
    ['\\', 'slash'], ['caffè', 'unicode'], ['CAFÉ', 'unicode'], ['talos', 'unicode'], ['fiore', 'unicode'],
    ['prima dopo ancora', 'spaces'], ['☕', 'emoji'], ['東京', 'emoji'],
    ['assente', []], ['', []], [' \n ', []], ["%' OR 1=1 --", []],
] as const

describe.each(['memory', 'sqlite'] as const)('searchMessages: same contract on %s', (engine) => {
    let repository: TalosChatRepository
    let close: () => void
    beforeEach(async () => {
        close = () => {}
        if (engine === 'memory') repository = createMemoryChatRepository()
        else {
            const connection = await createSqlJsConnection()
            for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) {
                for (const statement of upgrade.statements) await connection.execute(statement)
            }
            repository = createSqliteChatRepository({ platform: 'web', connect: async () => connection,
                persist: async () => {}, close: async () => {} })
            close = () => connection.close()
        }
        await repository.initialize()
        for (const id of ['one', 'two']) await repository.createSession({ id, title: id, active_model_profile_id: null, created_at: at })
        for (const [id, content] of samples) await repository.appendMessage({ id, session_id: 'one', content,
            role: 'assistant', state: 'persisted', created_at: at })
    })
    afterEach(() => close())

    it.each(cases)('finds literal normalized text: %j', async (term, expected) => {
        const ids = typeof expected === 'string' ? [expected] : [...expected]
        const hits = await repository.searchMessages(term, { limit: 16 })
        expect(hits.map((hit) => hit.messageId)).toEqual(ids)
        for (const hit of hits) expect(hit).toEqual({ sessionId: 'one', messageId: hit.messageId,
            excerpt: samples.find(([id]) => id === hit.messageId)![1] })
    })
    it('keeps the match in an original-text excerpt far beyond the start', async () => {
        await repository.appendMessage({ id: 'long', session_id: 'two', role: 'user', state: 'persisted', created_at: at,
            content: `${'Introduzione ﬁne.  '.repeat(300)}Un raro CAFFÈ finale.${' Coda.'.repeat(60)}` })
        const [hit] = await repository.searchMessages('raro caffè')
        expect(hit?.sessionId).toBe('two')
        expect(hit?.excerpt).toContain('Un raro CAFFÈ finale.')
        expect(hit?.excerpt.startsWith('…')).toBe(true)
        expect(hit?.excerpt.endsWith('…')).toBe(true)
        expect(hit!.excerpt.length).toBeLessThan(210)
    })
    it('orders all matching messages before limiting, leaves sessions unchanged, and removes deleted hits', async () => {
        await repository.appendMessage({ id: 'newer', session_id: 'two', role: 'user', state: 'persisted',
            content: 'PARTIAMO domani.', created_at: '2026-09-12T11:00:00.000Z' })
        const sessions = await repository.listSessions()
        const active = await repository.getActiveSessionId()
        expect((await repository.searchMessages('partiamo')).map((hit) => hit.messageId)).toEqual(['newer', 'plain'])
        expect((await repository.searchMessages('partiamo', { limit: 1 })).map((hit) => hit.messageId)).toEqual(['newer'])
        expect(await repository.searchMessages('partiamo', { limit: 0 })).toEqual([])
        expect(await repository.listSessions()).toEqual(sessions)
        expect(await repository.getActiveSessionId()).toBe(active)
        await repository.deleteSession('two')
        expect((await repository.searchMessages('partiamo')).map((hit) => hit.messageId)).toEqual(['plain'])
    })
    it.each([-1, 1.5, NaN, Infinity])('rejects an invalid limit %s', async (limit) => {
        await expect(repository.searchMessages('partiamo', { limit })).rejects.toThrow('TALOS_SEARCH_LIMIT_INVALID')
    })
    it('continues past a page of Unicode candidates and never exposes tool/system payloads', async () => {
        for (let index = 0; index < 130; index++) await repository.appendMessage({ id: `candidate-${index}`, session_id: 'two',
            role: 'user', state: 'persisted', content: 'Già letto.', created_at: '2026-09-12T12:00:00.000Z' })
        for (const role of ['system', 'tool'] as const) await repository.appendMessage({ id: role, session_id: 'two', role,
            state: 'persisted', content: 'PARTIAMO istruzione interna.', created_at: at })
        expect((await repository.searchMessages('partiamo', { limit: 1 })).map((hit) => hit.messageId)).toEqual(['plain'])
    })
})

it('forwards the search and its limit through the lazy repository, only to durable history', async () => {
    const durable = createMemoryChatRepository()
    const ephemeral = createMemoryChatRepository()
    const durableSearch = vi.spyOn(durable, 'searchMessages')
    const ephemeralSearch = vi.spyOn(ephemeral, 'searchMessages')
    const routed = createTalosEphemeralRoutingRepository({ durable, ephemeral, isEphemeral: (id) => id === 'temporary' })
    const lazy = createLazyChatRepository(async () => routed)
    for (const id of ['saved', 'temporary']) {
        await lazy.createSession({ id, title: id, active_model_profile_id: null, created_at: at })
        await lazy.appendMessage({ id: `${id}-message`, session_id: id, role: 'user', state: 'persisted', created_at: at, content: 'Segreto.' })
    }
    expect(await lazy.searchMessages('segreto', { limit: 1 })).toEqual([
        { sessionId: 'saved', messageId: 'saved-message', excerpt: 'Segreto.' },
    ])
    expect(durableSearch).toHaveBeenCalledWith('segreto', { limit: 1 })
    expect(ephemeralSearch).not.toHaveBeenCalled()
})
