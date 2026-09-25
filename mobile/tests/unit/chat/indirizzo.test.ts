import { describe, expect, it, vi } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * ⭐ B3 — «Indirizza» (LEDGER-B3-2026-09-24, D-B3-02). Una scelta ESPLICITA su una voce in coda, mai l'Invio.
 *
 *   - con attrezzi («punto-sicuro»): il giro NON si interrompe; al prossimo confine fra attrezzi si chiude pulito e
 *     la voce parte subito dopo, prima delle altre (Codex `turn/steer`, Hermes #12116, LibreChat #14220);
 *   - senza attrezzi («ferma-e-riparti»): si ferma ora, la risposta parziale resta, la voce parte subito dopo
 *     (LibreChat #14220 «interrupt & steer»), e il pulsante lo dice;
 *   - se il giro finisce prima del punto sicuro, la voce diventa un invio normale — mai persa (Hermes #64578).
 * ⛔ Un indirizzo non è uno Stop: le altre voci in coda NON vanno in pausa.
 */

type Deliver = NonNullable<ChatStoreOptions['deliverQueued']>

function createChatStore(complete: ChatCompletion, options: Omit<ChatStoreOptions, 'translate'>) {
    return createLocalizedChatStore(complete, { ...options, translate: talosTestT('en') })
}

function giroApribile() {
    let segnalaAvvio: () => void = () => undefined
    const avviato = new Promise<void>((r) => { segnalaAvvio = r })
    let chiudi: ((testo: string) => void) | null = null
    const complete: ChatCompletion = vi.fn((_turns, stream) => new Promise((resolve, reject) => {
        stream?.onChunk('Risposta a met')
        segnalaAvvio()
        chiudi = (testo) => resolve({ text: testo, finishReason: 'stop' })
        stream?.signal?.addEventListener('abort', () => {
            const errore = new Error('aborted')
            errore.name = 'AbortError'
            reject(errore)
        })
    }))
    return { complete, avviato, chiudi: (testo = 'Fatto.') => chiudi?.(testo) }
}

async function pronto(complete: ChatCompletion, deliverQueued: Deliver) {
    const repository = createMemoryChatRepository()
    const store = createChatStore(complete, { repository, deliverQueued })
    await store.initialize()
    return { store, repository }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('B3 — Indirizza', () => {
    it('STEER-01 senza attrezzi: ferma ora, tiene il parziale, la voce parte subito e le altre restano attive', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store, repository } = await pronto(giro.complete, deliver)
        const invio = store.send('Scrivi un saggio')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('prima in fila')
        await store.enqueue('correggi: più breve')
        const correzione = store.queueOf(sessione).voci[1]
        expect(await store.steerQueued(sessione, correzione.id, 'ferma-e-riparti')).toBe(true)
        await invio
        await tick()
        const messaggi = await repository.listMessages(sessione)
        expect(messaggi.at(-1)).toMatchObject({ role: 'assistant', content: 'Risposta a met', metadata: { interrupted: true } })
        expect(deliver.mock.calls.map(([, v]) => v.testo)).toEqual(['correggi: più breve', 'prima in fila'])
        expect(store.queueOf(sessione).inPausa).toBe(false)
    })

    it('STEER-02 con attrezzi: nessuna interruzione; il punto sicuro si chiede UNA volta, e la voce passa davanti', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver)
        const invio = store.send('Cerca e riassumi')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('prima in fila')
        await store.enqueue('guarda solo il 2026')
        const correzione = store.queueOf(sessione).voci[1]
        expect(await store.steerQueued(sessione, correzione.id, 'punto-sicuro')).toBe(true)
        expect(store.state.sending).toBe(true)
        expect(store.consumeSafePointRequest(sessione)).toBe(true)
        expect(store.consumeSafePointRequest(sessione)).toBe(false)
        giro.chiudi('Chiuso al punto sicuro.')
        await invio
        await tick()
        expect(deliver.mock.calls.map(([, v]) => v.testo)).toEqual(['guarda solo il 2026', 'prima in fila'])
    })

    it('STEER-03 al contrario: il giro finisce prima del punto sicuro ⇒ la voce parte come invio normale, mai persa', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver)
        const invio = store.send('Cerca')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        await store.enqueue('correggi')
        const voce = store.queueOf(sessione).voci[0]
        await store.steerQueued(sessione, voce.id, 'punto-sicuro')
        giro.chiudi()
        await invio
        await tick()
        expect(deliver).toHaveBeenCalledWith(sessione, expect.objectContaining({ testo: 'correggi' }))
        expect(store.consumeSafePointRequest(sessione)).toBe(false)
    })

    it('STEER-04 al contrario: su una chat che non sta rispondendo non si indirizza (lì c’è «Invia ora»)', async () => {
        const giro = giroApribile()
        const deliver = vi.fn<Deliver>(async () => true)
        const { store } = await pronto(giro.complete, deliver)
        const altra = (await store.createSession('Altra')).id
        await store.createSession('Qui') // la chat aperta, dove parte il giro
        const invio = store.send('Lavoro qui')
        await giro.avviato
        await store.enqueue('per l’altra', altra)
        const voce = store.queueOf(altra).voci[0]
        expect(await store.steerQueued(altra, voce.id, 'ferma-e-riparti')).toBe(false)
        expect(store.state.sending).toBe(true)
        expect(store.consumeSafePointRequest(altra)).toBe(false)
        giro.chiudi()
        await invio
    })

    it('STEER-05 al contrario: una voce che non c’è non ferma niente', async () => {
        const giro = giroApribile()
        const { store } = await pronto(giro.complete, vi.fn<Deliver>(async () => true))
        const invio = store.send('Lavoro')
        await giro.avviato
        const sessione = store.activeSession.value!.id
        expect(await store.steerQueued(sessione, 'inesistente', 'ferma-e-riparti')).toBe(false)
        expect(store.state.sending).toBe(true)
        giro.chiudi()
        await invio
    })
})
