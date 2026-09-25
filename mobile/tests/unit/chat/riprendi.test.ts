import { describe, expect, it, vi } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
    type ChatTurn,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * ⭐ B3 «Riprendi» (D-B3-03, owner 24/09): su una chat interrotta rifà la risposta all'ULTIMO messaggio della persona.
 * Il parziale resta visibile (marcato interrotto) ma NON va al modello; nessun messaggio della persona aggiunto.
 * Il desktop rifiuta la ripresa senza messaggio delle sessioni interrotte (`session-registry.mjs:5066-5071`) perché lo
 * storico può avere una chiamata a metà: qui il parziale salvato non porta chiamate (`chat.ts`, `interrupted: true`),
 * quindi escluderlo basta — e lo prova RESUME-01.
 */
function createChatStore(complete: ChatCompletion, options: Omit<ChatStoreOptions, 'translate'>) {
    return createLocalizedChatStore(complete, { ...options, translate: talosTestT('en') })
}

function abortibile(): ChatCompletion {
    return vi.fn((_turns, stream) => new Promise((_resolve, reject) => {
        stream?.onChunk('Mezza risp')
        stream?.signal?.addEventListener('abort', () => {
            const errore = new Error('aborted')
            errore.name = 'AbortError'
            reject(errore)
        })
    })) as unknown as ChatCompletion
}

describe('B3 — Riprendi', () => {
    it('RESUME-01 dopo uno Stop: rifà la risposta, il parziale non va al modello, nessun messaggio nuovo della persona', async () => {
        const repository = createMemoryChatRepository()
        const ricevuti: ChatTurn[][] = []
        let prima = true
        const complete: ChatCompletion = vi.fn(async (turns, stream) => {
            if (prima) {
                prima = false
                return (abortibile() as unknown as (t: ChatTurn[], s: typeof stream) => Promise<never>)(turns, stream)
            }
            ricevuti.push(turns)
            return { text: 'Risposta completa.', finishReason: 'stop' }
        }) as unknown as ChatCompletion
        const store = createChatStore(complete, { repository })
        await store.initialize()
        const invio = store.send('Spiegami la fotosintesi')
        await vi.waitFor(() => expect(store.state.streamingText).toBe('Mezza risp'))
        store.stopStreaming()
        await invio
        const sessione = store.activeSession.value!.id
        expect(await store.resumeTurn()).toBe(true)
        expect(ricevuti).toHaveLength(1)
        expect(ricevuti[0].map((t) => [t.role, t.content])).toEqual([['user', 'Spiegami la fotosintesi']])
        const messaggi = await repository.listMessages(sessione)
        expect(messaggi.map((m) => [m.role, m.content, Boolean(m.metadata?.interrupted)])).toEqual([
            ['user', 'Spiegami la fotosintesi', false],
            ['assistant', 'Mezza risp', true],
            ['assistant', 'Risposta completa.', false],
        ])
    })

    it('RESUME-02 dopo un errore del fornitore: riprende allo stesso modo', async () => {
        const repository = createMemoryChatRepository()
        const complete = vi.fn()
            .mockRejectedValueOnce(new Error('provider giù'))
            .mockResolvedValueOnce({ text: 'Ora va.', finishReason: 'stop' })
        const store = createChatStore(complete as unknown as ChatCompletion, { repository })
        await store.initialize()
        await store.send('Ciao')
        const sessione = store.activeSession.value!.id
        expect(await store.resumeTurn()).toBe(true)
        const messaggi = await repository.listMessages(sessione)
        expect(messaggi.filter((m) => m.role !== 'system').map((m) => [m.role, m.content]))
            .toEqual([['user', 'Ciao'], ['assistant', 'Ora va.']])
        expect((complete.mock.calls[1]![0] as ChatTurn[]).map((t) => t.role)).toEqual(['user'])
    })

    it('RESUME-03 al contrario: una risposta già completa non si «riprende» (lì c’è Riprova)', async () => {
        const complete = vi.fn(async () => ({ text: 'Completa.', finishReason: 'stop' }))
        const store = createChatStore(complete as unknown as ChatCompletion, { repository: createMemoryChatRepository() })
        await store.initialize()
        await store.send('Ciao')
        expect(await store.resumeTurn()).toBe(false)
        expect(complete).toHaveBeenCalledTimes(1)
    })

    it('RESUME-04 al contrario: mentre l’app risponde non si riprende niente', async () => {
        const complete = abortibile()
        const store = createChatStore(complete, { repository: createMemoryChatRepository() })
        await store.initialize()
        const invio = store.send('Ciao')
        await vi.waitFor(() => expect(store.state.streamingText).toBe('Mezza risp'))
        expect(await store.resumeTurn()).toBe(false)
        store.stopStreaming()
        await invio
    })

    it('RESUME-05 al contrario: una chat vuota non ha niente da riprendere', async () => {
        const complete = vi.fn(async () => ({ text: 'x', finishReason: 'stop' }))
        const store = createChatStore(complete as unknown as ChatCompletion, { repository: createMemoryChatRepository() })
        await store.initialize()
        await store.createSession('Vuota')
        expect(await store.resumeTurn()).toBe(false)
        expect(complete).not.toHaveBeenCalled()
    })
})
