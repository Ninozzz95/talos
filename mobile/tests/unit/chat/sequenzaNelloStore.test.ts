import { describe, expect, it, vi } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosChatSendIdentity } from '@/lib/chat/sendSnapshot'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * N13 — lo store registra i confini dei giri di attrezzi mentre la risposta arriva, e salva nel messaggio la sequenza ordinata
 * (ragionamento, attrezzi, testo) perché le righe restino al loro posto anche dopo il reload (decisione owner del 09/10).
 */
async function storeCon(complete: ChatCompletion) {
    const store = createLocalizedChatStore(complete, { repository: createMemoryChatRepository(), translate: talosTestT('en') })
    await store.initialize()
    return store
}

const ricerca = [{ name: 'web_search', detail: 'meteo Messina' }]
const lettura = [{ name: 'web_read', detail: 'ilmeteo.it' }]

describe('la sequenza del turno nello store (N13)', () => {
    it('SEQ-STORE-01 — ragionamento → attrezzi → testo → attrezzi → testo: salvata in quest\'ordine', async () => {
        const store = await storeCon(async (_turns, stream) => {
            stream?.onReasoning?.('Cerco il meteo.')
            stream?.onToolRound?.(ricerca)
            stream?.onChunk('Leggo la pagina. ')
            stream?.onToolRound?.(lettura)
            stream?.onReasoning?.('La pagina dice pioggia.')
            stream?.onChunk('Domani piove.')
            return { text: 'Leggo la pagina. Domani piove.', finishReason: 'stop' }
        })
        await store.send('che tempo fa domani a Messina?')
        const risposta = store.messages.filter((message) => message.role === 'assistant').at(-1)!
        expect(risposta.content).toBe('Leggo la pagina. Domani piove.')
        expect(risposta.metadata.talos_sequenza).toEqual([
            { tipo: 'ragionamento', testo: 'Cerco il meteo.' },
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'testo', testo: 'Leggo la pagina. ' },
            { tipo: 'attrezzi', attrezzi: lettura },
            { tipo: 'ragionamento', testo: 'La pagina dice pioggia.' },
            { tipo: 'testo', testo: 'Domani piove.' },
        ])
        // Il ragionamento di sempre resta, per l'esportazione e per le chat che non leggono la sequenza.
        expect(risposta.metadata.reasoning).toBe('Cerco il meteo.La pagina dice pioggia.')
    })

    it('SEQ-STORE-02 — senza attrezzi niente sequenza: il messaggio resta come oggi', async () => {
        const store = await storeCon(async (_turns, stream) => {
            stream?.onReasoning?.('Penso.')
            stream?.onChunk('Ciao!')
            return { text: 'Ciao!', finishReason: 'stop' }
        })
        await store.send('ciao')
        const risposta = store.messages.filter((message) => message.role === 'assistant').at(-1)!
        expect(risposta.metadata.talos_sequenza).toBeUndefined()
    })

    it('SEQ-STORE-03 — mentre scrive i confini sono nello stato, e si azzerano a fine turno', async () => {
        let continua: () => void = () => {}
        const store = await storeCon((_turns, stream) => new Promise((resolve) => {
            stream?.onReasoning?.('Cerco.')
            stream?.onChunk('Guardo. ')
            stream?.onToolRound?.(ricerca)
            continua = () => resolve({ text: 'Guardo. ', finishReason: 'stop' })
        }))
        const invio = store.send('cerca')
        await vi.waitFor(() => expect(store.state.streamingConfini).toEqual([
            { testo: 'Guardo. '.length, ragionamento: 'Cerco.'.length, attrezzi: ricerca },
        ]))
        continua()
        await invio
        expect(store.state.streamingConfini).toBeNull()
    })

    it('SEQ-STORE-04 — una risposta fermata con lo Stop salva anche la sua sequenza', async () => {
        const store = await storeCon((_turns, stream) => new Promise((_resolve, reject) => {
            stream?.onChunk('Guardo. ')
            stream?.onToolRound?.(ricerca)
            stream?.signal?.addEventListener('abort', () => {
                const errore = new Error('aborted')
                errore.name = 'AbortError'
                reject(errore)
            })
        }))
        const invio = store.send('cerca')
        await vi.waitFor(() => expect(store.state.streamingConfini).not.toBeNull())
        store.stopStreaming()
        await invio
        const risposta = store.messages.filter((message) => message.role === 'assistant').at(-1)!
        expect(risposta.metadata.interrupted).toBe(true)
        expect(risposta.metadata.talos_sequenza).toEqual([
            { tipo: 'testo', testo: 'Guardo. ' },
            { tipo: 'attrezzi', attrezzi: ricerca },
        ])
    })

    it('SEQ-STORE-05 — anche la ripresa dopo un permesso (continueFromCheckpoint) salva la sequenza', async () => {
        const repository = createMemoryChatRepository()
        const store = createLocalizedChatStore(async (_turns, stream) => {
            stream?.onReasoning?.('Il permesso c’è.')
            stream?.onToolRound?.(ricerca)
            stream?.onChunk('Fatto.')
            return { text: 'Fatto.', finishReason: 'stop' }
        }, { repository, translate: talosTestT('en') })
        await store.initialize()
        const owner = await store.createSession('Owner', 'anthropic:captured')
        await expect(store.continueFromCheckpoint({
            identity: createTalosChatSendIdentity({
                sendId: 'send-owner',
                sessionId: owner.id,
                sessionTitle: owner.title,
                surface: owner.surface,
                modelProfileId: 'anthropic:captured',
                acceptedAt: '2026-10-11T20:00:00.000Z',
            }),
            runtime: {},
            checkpoint_id: 'checkpoint-1',
            checkpoint: { phase: 'before_model' },
        })).resolves.toBe(true)
        const risposta = (await repository.listMessages(owner.id)).filter((message) => message.role === 'assistant').at(-1)!
        expect(risposta.metadata.talos_sequenza).toEqual([
            { tipo: 'ragionamento', testo: 'Il permesso c’è.' },
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'testo', testo: 'Fatto.' },
        ])
    })
})
