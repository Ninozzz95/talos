import { describe, expect, it, vi } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * ⭐ B3 — la coda dei messaggi nello store (LEDGER-B3-2026-09-24, fetta F3).
 *
 * Decisioni owner 24/09: la coda è PER CHAT e su disco; mentre l'app è occupata si ACCODA (mai un reindirizzo
 * dall'Invio); lo Stop mette la coda in pausa; la coda di un'altra chat parte appena l'app è libera. Ricerca:
 * Hermes Desktop («pressing Stop… pauses the queue», verificato sulla pagina il 24/09), LibreChat PR #14220
 * (tetto di 10), desktop AVM `coda-messaggi.js`.
 *
 * ⛔ Lo store NON sceglie modello, attrezzi e permessi: consegna la voce al controller con `deliverQueued`, che
 * passa dalla stessa strada di un invio normale.
 */

type Deliver = NonNullable<ChatStoreOptions['deliverQueued']>

function createChatStore(complete: ChatCompletion, options: Omit<ChatStoreOptions, 'translate'>) {
    return createLocalizedChatStore(complete, { ...options, translate: talosTestT('en') })
}

/** Un giro che resta aperto finché la prova non lo chiude, e che rispetta lo Stop. */
function giroApribile() {
    let segnalaAvvio: () => void = () => undefined
    /** Si risolve quando il giro è DAVVERO arrivato al modello: `send` passa prima da diversi await. */
    const avviato = new Promise<void>((r) => { segnalaAvvio = r })
    let chiudi: ((testo: string) => void) | null = null
    let fallisci: ((errore: Error) => void) | null = null
    const complete: ChatCompletion = vi.fn((_turns, stream) => new Promise((resolve, reject) => {
        stream?.onChunk('Sto ')
        segnalaAvvio()
        chiudi = (testo) => resolve({ text: testo, finishReason: 'stop' })
        fallisci = reject
        stream?.signal?.addEventListener('abort', () => {
            const errore = new Error('aborted')
            errore.name = 'AbortError'
            reject(errore)
        })
    }))
    return {
        complete,
        avviato,
        chiudi: (testo = 'Fatto.') => chiudi?.(testo),
        fallisci: (errore = new Error('provider giù')) => fallisci?.(errore),
    }
}

async function pronto(complete: ChatCompletion, deliverQueued: Deliver, extra: Partial<ChatStoreOptions> = {}) {
    const repository = createMemoryChatRepository()
    const store = createChatStore(complete, { repository, deliverQueued, ...extra })
    await store.initialize()
    return { store, repository }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('B3 — la coda nello store', () => {
    it('STORE-CODA-01 accodare mentre la chat risponde mette la voce nella coda di QUELLA chat e su disco', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store, repository } = await pronto(giro.complete, deliver)
        const invio = store.send('primo')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        const esito = await store.enqueue('secondo')
        expect(esito.ok).toBe(true)
        expect(store.queueOf(sessione).voci.map((v) => v.testo)).toEqual(['secondo'])
        const suDisco = await repository.loadComposerQueue(sessione) as { voci: Array<{ testo: string }> }
        expect(suDisco.voci.map((v) => v.testo)).toEqual(['secondo'])
        expect(deliver).not.toHaveBeenCalled()
        giro.chiudi()
        await invio
    })

    it('STORE-CODA-02 a fine giro la prima voce parte da sola, per la sua chat, e lascia la coda', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver)
        const invio = store.send('primo')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('secondo')
        await store.enqueue('terzo')
        giro.chiudi()
        await invio
        await tick()
        // Il doppio `deliver` finisce subito (un invio vero dura un giro): lo store serve la voce dopo, in ordine.
        expect(deliver.mock.calls.map(([id, voce]) => [id, voce.testo])).toEqual([[sessione, 'secondo'], [sessione, 'terzo']])
        expect(store.queueOf(sessione).voci).toEqual([])
    })

    it('STORE-CODA-03 lo Stop mette la coda in pausa: niente parte da solo', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver)
        const invio = store.send('primo')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('secondo')
        store.stopStreaming()
        await invio
        await tick()
        expect(deliver).not.toHaveBeenCalled()
        expect(store.queueOf(sessione).inPausa).toBe(true)
        expect(store.state.turnOutcomes[sessione]).toBe('fermato')
    })

    it('STORE-CODA-04 un errore del fornitore mette in pausa: non si insiste su un giro che fallisce', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver)
        const invio = store.send('primo')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('secondo')
        giro.fallisci()
        await invio
        await tick()
        expect(deliver).not.toHaveBeenCalled()
        expect(store.queueOf(sessione).inPausa).toBe(true)
        expect(store.state.turnOutcomes[sessione]).toBe('errore')
    })

    it('STORE-CODA-05 una coda ritrovata su disco all’avvio (processo ucciso) è in pausa, e non parte', async () => {
        const repository = createMemoryChatRepository()
        const prima = createChatStore(async () => ({ text: 'ok', finishReason: 'stop' }), { repository })
        await prima.initialize()
        const sessione = (await prima.createSession('Chat')).id
        await repository.saveComposerQueue(sessione, { voci: [{ id: 'v1', testo: 'dopo', creataAlle: '2026-09-24T00:00:00.000Z' }], inPausa: false })
        const deliver = vi.fn<Deliver>(async () => true)
        const dopo = createChatStore(async () => ({ text: 'ok', finishReason: 'stop' }), { repository, deliverQueued: deliver })
        await dopo.initialize()
        await tick()
        expect(dopo.queueOf(sessione).voci.map((v) => v.testo)).toEqual(['dopo'])
        expect(dopo.queueOf(sessione).inPausa).toBe(true)
        expect(deliver).not.toHaveBeenCalled()
    })

    it('STORE-CODA-06 con un permesso d’attrezzo in attesa la coda non parte', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver, { permissionPendingFor: () => true })
        const invio = store.send('primo')
        await giro.avviato
        await store.enqueue('secondo')
        giro.chiudi()
        await invio
        await tick()
        expect(deliver).not.toHaveBeenCalled()
    })

    it('STORE-CODA-07 la coda di un’ALTRA chat parte appena l’app è libera', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver)
        const b = (await store.createSession('Chat B')).id
        const a = (await store.createSession('Chat A')).id
        await store.selectSession(a)
        const invio = store.send('lavora')
        await giro.avviato
        const esito = await store.enqueue('per B', b)
        expect(esito.ok).toBe(true)
        giro.chiudi()
        await invio
        await tick()
        expect(deliver).toHaveBeenCalledTimes(1)
        expect(deliver.mock.calls[0][0]).toBe(b)
        expect(deliver.mock.calls[0][1].testo).toBe('per B')
    })

    it('STORE-CODA-08 al contrario: oltre il tetto di 10 voci si rifiuta, e lo si dice', async () => {
        const giro = giroApribile()
        const { store } = await pronto(giro.complete, vi.fn<Deliver>(async () => true))
        const invio = store.send('primo')
        await giro.avviato
        for (let i = 0; i < 10; i += 1) expect((await store.enqueue(`v${i}`)).ok).toBe(true)
        const undicesima = await store.enqueue('una di troppo')
        expect(undicesima).toEqual({ ok: false, rifiuto: 'coda-piena' })
        giro.chiudi()
        await invio
    })

    it('STORE-CODA-09 «Invia ora» a giro fermo consegna QUELLA voce e lascia in pausa le altre', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver)
        const invio = store.send('primo')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('uno')
        await store.enqueue('due')
        store.stopStreaming()
        await invio
        await tick()
        const due = store.queueOf(sessione).voci[1]
        expect(await store.sendQueuedNow(sessione, due.id)).toBe(true)
        expect(deliver).toHaveBeenCalledWith(sessione, expect.objectContaining({ testo: 'due' }))
        expect(store.queueOf(sessione).voci.map((v) => v.testo)).toEqual(['uno'])
        // ⛔ Invia ora manda QUELLA voce: il resto resta in pausa, dopo uno Stop parte solo se lo invii tu.
        expect(store.queueOf(sessione).inPausa).toBe(true)
    })

    it('STORE-CODA-10 al contrario: una consegna rifiutata rimette la voce in testa e mette in pausa (mai persa)', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => false)
        const { store } = await pronto(giro.complete, deliver)
        const invio = store.send('primo')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('secondo')
        giro.chiudi()
        await invio
        await tick()
        expect(deliver).toHaveBeenCalledTimes(1)
        expect(store.queueOf(sessione).voci.map((v) => v.testo)).toEqual(['secondo'])
        expect(store.queueOf(sessione).inPausa).toBe(true)
    })

    it('STORE-CODA-11 togliere e modificare una voce si salva su disco', async () => {
        const giro = giroApribile()
        const { store, repository } = await pronto(giro.complete, vi.fn<Deliver>(async () => true))
        const invio = store.send('primo')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('uno')
        await store.enqueue('due')
        const [uno, due] = store.queueOf(sessione).voci
        expect((await store.editQueued(sessione, uno.id, 'uno bis')).ok).toBe(true)
        await store.removeQueued(sessione, due.id)
        const suDisco = await repository.loadComposerQueue(sessione) as { voci: Array<{ testo: string }> }
        expect(suDisco.voci.map((v) => v.testo)).toEqual(['uno bis'])
        giro.chiudi()
        await invio
    })

    it('STORE-CODA-12 la voce della chat B si scrive in B anche se è aperta la A, e la A resta com’era', async () => {
        const repository = createMemoryChatRepository()
        const store = createChatStore(async () => ({ text: 'Risposta per B', finishReason: 'stop' }), { repository })
        await store.initialize()
        const b = (await store.createSession('Chat B')).id
        const a = (await store.createSession('Chat A')).id
        await store.selectSession(a)
        expect(await store.send('per B', null, {}, [], undefined, null, b)).toBe(true)
        expect(store.activeSession.value?.id).toBe(a)
        expect(store.messages).toEqual([])
        const inB = await repository.listMessages(b)
        expect(inB.map((m) => [m.role, m.content])).toEqual([['user', 'per B'], ['assistant', 'Risposta per B']])
        expect(await repository.listMessages(a)).toEqual([])
        expect(store.state.sendingSessionId).toBeNull()
    })

    it('STORE-CODA-13 al contrario: una chat di destinazione che non esiste non scrive niente e dice di no', async () => {
        const repository = createMemoryChatRepository()
        const store = createChatStore(async () => ({ text: 'x', finishReason: 'stop' }), { repository })
        await store.initialize()
        const a = (await store.createSession('Chat A')).id
        await store.selectSession(a)
        expect(await store.send('per nessuno', null, {}, [], undefined, null, 'sessione-inesistente')).toBe(false)
        expect(await repository.listMessages(a)).toEqual([])
    })

    it('STORE-CODA-14 una voce consegnata a una chat NON aperta aggiorna il suo ultimo messaggio nell’elenco (lo stato non resta vecchio)', async () => {
        const repository = createMemoryChatRepository()
        const store = createChatStore(async () => { throw new Error('provider giù') }, { repository })
        await store.initialize()
        const b = (await store.createSession('Chat B')).id
        const a = (await store.createSession('Chat A')).id
        await store.selectSession(a)
        await store.send('per B', null, {}, [], undefined, null, b)
        const rigaB = store.sessions.find((sessione) => sessione.id === b)
        expect(rigaB?.last_message).toMatchObject({ role: 'system', state: 'failed', interrupted: false })
    })
})

