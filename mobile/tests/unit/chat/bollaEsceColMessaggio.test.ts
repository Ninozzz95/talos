import { describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosSorgenteStreamingDellaChat } from '@/lib/chat/sorgenteStreaming'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * ⛔ 0.1.48, il testo doppio (owner 11/11 «Prima si cura il difetto»; CI della #22: B3-E2E-01 rossa 6 su 6 con
 * «getByText('First answer.') resolved to 2 elements», il `<p>` del messaggio finito e quello dentro la bolla).
 *
 * Il messaggio finito entra nella lista in `appendDurable`; la bolla che lo scriveva usciva solo in `finishSend`, dopo altri
 * `await` (l'esito della coda, la compattazione). Vue ridisegna una volta per ogni passo sincrono: se la bolla esce nello
 * stesso passo in cui il messaggio entra, i due non stanno MAI nello stesso disegno. Questa prova guarda proprio quel passo
 * (`flush: 'sync'`, cioè l'istante dell'inserimento) e chiede che la sorgente della bolla sia già spenta.
 */
function storeCon(complete: ChatCompletion, extra: Record<string, unknown> = {}) {
    return createLocalizedChatStore(complete, {
        repository: createMemoryChatRepository(),
        translate: talosTestT('en'),
        ...extra,
    })
}

type Istantanea = { contenuto: string, bollaAccesa: boolean, testoVivo: string | null, sending: boolean }

/** Cosa vede la bolla nell'istante esatto in cui un messaggio dell'assistente entra nella lista. */
function guardaIlPasso(store: ReturnType<typeof storeCon>): Istantanea[] {
    const sorgente = talosSorgenteStreamingDellaChat({ chat: store, toolActivity: ref([]) })
    const visti: Istantanea[] = []
    watch(() => store.messages.length, () => {
        const ultimo = store.messages.at(-1)
        if (ultimo?.role !== 'assistant') return
        visti.push({
            contenuto: ultimo.content,
            bollaAccesa: sorgente.sending.value,
            testoVivo: sorgente.testo.value || null,
            sending: store.state.sending,
        })
    }, { flush: 'sync' })
    return visti
}

describe('0.1.48 la bolla esce nello stesso passo in cui entra il messaggio finito', () => {
    it('risposta normale: nel passo dell\'inserimento la bolla è già spenta, il giro resta in corso', async () => {
        const store = storeCon(async (_turns, stream) => {
            stream?.onChunk('First ')
            stream?.onChunk('answer.')
            return { text: 'First answer.', finishReason: 'stop' }
        })
        await store.initialize()
        const visti = guardaIlPasso(store)
        await store.send('First question.')
        expect(visti).toEqual([{ contenuto: 'First answer.', bollaAccesa: false, testoVivo: null, sending: true }])
        expect(store.state.sending).toBe(false)
    })

    it('Stop a metà: il parziale salvato e la bolla non convivono nemmeno lui', async () => {
        const store = storeCon((_turns, stream) => new Promise((_resolve, reject) => {
            stream?.onChunk('Partial ans')
            stream?.signal?.addEventListener('abort', () => {
                const errore = new Error('aborted')
                errore.name = 'AbortError'
                reject(errore)
            })
        }))
        await store.initialize()
        const visti = guardaIlPasso(store)
        const invio = store.send('hi')
        await vi.waitFor(() => expect(store.state.streamingText).toBe('Partial ans'))
        store.stopStreaming()
        await invio
        expect(visti).toEqual([{ contenuto: 'Partial ans', bollaAccesa: false, testoVivo: null, sending: true }])
    })

    it('con un messaggio in coda (B3-E2E-01): il primo finito non resta anche nella bolla mentre parte il secondo', async () => {
        const risposte = ['First answer.', 'Second answer.']
        let chiudiIlPrimo: () => void = () => undefined
        const primoAperto = new Promise<void>((r) => { chiudiIlPrimo = r })
        let chiamate = 0
        const store = storeCon(async (_turns, stream) => {
            const indice = chiamate++
            stream?.onChunk(risposte[indice]!)
            if (indice === 0) await primoAperto
            return { text: risposte[indice]!, finishReason: 'stop' }
        }, {
            deliverQueued: async (sessionId: string, voce: { testo: string }) => store.send(voce.testo, null, {}, [], undefined, null, sessionId),
        })
        await store.initialize()
        const visti = guardaIlPasso(store)
        const primo = store.send('First question.')
        await vi.waitFor(() => expect(store.state.streamingText).toBe('First answer.'))
        expect((await store.enqueue('Queued follow-up.')).ok).toBe(true)
        chiudiIlPrimo()
        await primo
        await vi.waitFor(() => expect(visti).toHaveLength(2))
        await vi.waitFor(() => expect(store.state.sending).toBe(false))
        expect(visti.map((v) => [v.contenuto, v.bollaAccesa, v.testoVivo])).toEqual([
            ['First answer.', false, null],
            ['Second answer.', false, null],
        ])
    })

    it('il giro dopo riparte pulito: la domanda nuova compare subito, non alla fine del suo giro', async () => {
        // Le righe trattenute del giro finito non devono restare in mano allo store: altrimenti la domanda del giro dopo
        // verrebbe trattenuta anche lei e comparirebbe solo a risposta finita.
        let chiudiIlSecondo: () => void = () => undefined
        const secondoAperto = new Promise<void>((r) => { chiudiIlSecondo = r })
        let chiamate = 0
        const store = storeCon(async (_turns, stream) => {
            const indice = chiamate++
            const testo = indice === 0 ? 'First answer.' : 'Second answer.'
            stream?.onChunk(testo)
            if (indice === 1) await secondoAperto
            return { text: testo, finishReason: 'stop' }
        })
        await store.initialize()
        await store.send('First question.')
        const secondo = store.send('Second question.')
        await vi.waitFor(() => expect(store.state.streamingText).toBe('Second answer.'))
        expect(store.messages.map((m) => [m.role, m.content])).toEqual([
            ['user', 'First question.'],
            ['assistant', 'First answer.'],
            ['user', 'Second question.'],
        ])
        chiudiIlSecondo()
        await secondo
        expect(store.messages.filter((m) => m.content === 'Second answer.')).toHaveLength(1)
    })

    it('al contrario: mentre il testo scorre, prima del messaggio finito, la bolla è accesa', async () => {
        let chiudi: () => void = () => undefined
        const aperto = new Promise<void>((r) => { chiudi = r })
        const store = storeCon(async (_turns, stream) => {
            stream?.onChunk('Live text')
            await aperto
            return { text: 'Live text', finishReason: 'stop' }
        })
        await store.initialize()
        const sorgente = talosSorgenteStreamingDellaChat({ chat: store, toolActivity: ref([]) })
        const invio = store.send('hi')
        await vi.waitFor(() => expect(sorgente.testo.value).toBe('Live text'))
        expect(sorgente.sending.value).toBe(true)
        expect(store.messages.filter((m) => m.role === 'assistant')).toHaveLength(0)
        chiudi()
        await invio
    })

    it('continuazione dopo «Consenti»: la risposta entra una volta e la bolla è spenta alla fine del passo', async () => {
        // Revisore 0148, R7 (mutante V3): se il `finally` di `runContinuation` spegnesse la bolla senza `lasciaLaBolla`,
        // le righe trattenute del giro non entrerebbero mai nella lista e la risposta dopo «Consenti» non comparirebbe.
        let chiamate = 0
        const store = storeCon(async (_turns, stream) => {
            const testo = chiamate++ === 0 ? 'First answer.' : 'After allow.'
            stream?.onChunk(testo)
            return { text: testo, finishReason: 'stop' }
        })
        await store.initialize()
        await store.send('First question.')
        const chat = store.activeSession.value!.id
        const sorgente = talosSorgenteStreamingDellaChat({ chat: store, toolActivity: ref([]) })
        const ok = await store.continueFromCheckpoint({
            identity: { sendId: 's1', sessionId: chat, sessionTitle: 't', surface: 'chat', modelProfileId: null, acceptedAt: new Date().toISOString() } as never,
            runtime: undefined,
            checkpoint_id: 'c1',
            checkpoint: { x: 1 },
        })
        expect(ok).toBe(true)
        expect(store.messages.filter((m) => m.content === 'After allow.')).toHaveLength(1)
        expect(sorgente.sending.value).toBe(false)
    })

    it('esci e rientri nella chat mentre la compattazione dopo la risposta lavora: alla fine la risposta c\'è una volta', async () => {
        // Revisore 0148, R1 (mutante V1): `selectSession` rilegge dal disco la risposta già salvata mentre il giro la tiene
        // ancora; senza il controllo dei doppioni `lasciaLaBolla` la rimetterebbe nella lista una seconda volta.
        // Il doppio a schermo DURANTE la compattazione è vecchio (c'era già prima della 0.1.48) e qui non si controlla.
        let apriLaFinestra: () => void = () => undefined
        const finestra = new Promise<void>((r) => { apriLaFinestra = r })
        let trattieni = false
        const repository = createMemoryChatRepository()
        let chiamate = 0
        const store = storeCon(async (_turns, stream) => {
            const testo = `answer-${++chiamate}`
            stream?.onChunk(testo)
            return { text: testo, finishReason: 'stop' }
        }, {
            repository,
            riassumiConversazione: async () => ({ ok: false, motivo: 'errore' }) as never,
            finestraPerCompattazione: async () => { if (trattieni) await finestra; return null },
        })
        await store.initialize()
        await store.send('q1')
        const a = store.activeSession.value!.id
        const b = (await store.createSession('B')).id
        await store.selectSession(a)
        const sorgente = talosSorgenteStreamingDellaChat({ chat: store, toolActivity: ref([]) })
        trattieni = true
        const invio = store.send('q2')
        await vi.waitFor(() => expect(store.state.streamingText).toBe('answer-2'))
        // la risposta è sul disco, la bolla ancora accesa: la compattazione dopo la risposta aspetta
        await vi.waitFor(async () => expect((await repository.listMessages(a)).some((m) => m.content === 'answer-2')).toBe(true))
        await store.selectSession(b)
        await store.selectSession(a)
        apriLaFinestra()
        await invio
        expect(store.messages.filter((m) => m.content === 'answer-2')).toHaveLength(1)
        expect(sorgente.sending.value).toBe(false)
    })
})
