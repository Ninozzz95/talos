import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Il modello scaricato deve comparire nel composer SENZA premere «aggiorna».
 *
 * ## Il difetto, riferito dall'owner il 2026-08-06
 *
 * «I modelli locali non vengono caricati subito nel composer appena dopo essere
 * scaricati e installati: per farlo bisogna premere il pulsante refresh nel
 * composer.»
 *
 * Il segnale del catalogo esisteva già dal 2026-08-05 ed era giusto. Quello che
 * mancava è che **nessuno lo emetteva**: la transizione «finito» si scopre
 * confrontando due istantanee, e il confronto lo faceva un poller contato per
 * osservatori — vivo solo finché una delle superfici che mostrano i
 * trasferimenti era montata.
 *
 * Chi fa la cosa più naturale del mondo — avvia il download e torna in chat ad
 * aspettare — smontava l'ultima superficie, e con lei il poller. Il download
 * finiva nel nativo e la notizia non veniva mai scoperta.
 *
 * Questo test riproduce ESATTAMENTE quello scenario: si osserva, parte un
 * trasferimento, si smette di osservare, e il trasferimento finisce.
 */

const stato = vi.hoisted(() => ({ items: [] as unknown[] }))

vi.mock('@/services/modelTransfer', () => ({
    // La forma vera dello stato: `phase`, `active` e `paths` in cima, perché
    // lo store li legge tutti e un mock a metà romperebbe per il motivo
    // sbagliato.
    talosModelTransferStatus: vi.fn(async () => ({
        items: stato.items,
        phase: stato.items.length ? 'running' : 'idle',
        active: stato.items.length > 0,
        paths: [],
        haveBytes: 0,
        totalBytes: 0,
        supported: true,
    })),
    talosStartModelTransfer: vi.fn(async () => ({ ok: true })),
    talosCancelModelTransfer: vi.fn(async () => ({ ok: true })),
    talosPauseModelTransfer: vi.fn(async () => ({ ok: true })),
    talosResumeModelTransfer: vi.fn(async () => ({ ok: true })),
}))

const annunci: string[] = []
vi.mock('@/lib/models/localCatalogueSignal', () => ({
    talosAnnounceLocalCatalogueChange: (reason: string) => { annunci.push(reason) },
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))
vi.mock('@/stores/toasts', () => ({
    useTalosMobileToasts: () => ({ push: vi.fn(), dismiss: vi.fn(), state: { items: [] } }),
    pushToast: vi.fn(),
}))

/** La forma vera di `TalosTransferItem`: è `active` a dire se sta lavorando. */
function riga(id: string, phase: string, active: boolean, have: number) {
    return {
        id, jobId: 1, createdAtMs: 0, phase, active,
        repo: 'Solaren/Qwen', revision: 'main', paths: ['m.gguf'], modelName: 'Qwen',
        haveBytes: have, totalBytes: 10, runner: 'DEFERRED_JOB',
        networkBound: false, failure: null, resumable: true,
    }
}
const inCorso = (id: string) => riga(id, 'running', true, 1)
/**
 * ARRIVATA IN FONDO ma ancora in lista: è lo stato che precede la sparizione, e
 * l'unico da cui la sparizione si può leggere come «finito». Sparire senza
 * essere arrivati in fondo significa annullato o perso, e in quel caso si tace.
 */
const inFondo = (id: string) => riga(id, 'verifying', true, 10)

beforeEach(() => {
    vi.useFakeTimers()
    annunci.length = 0
    stato.items = []
})

afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
})

describe('il download che finisce mentre nessuno guarda', () => {
    it('viene scoperto lo stesso, e il catalogo lo viene a sapere', async () => {
        const store = await import('@/stores/modelTransfers')

        // 1. La schermata dei modelli è aperta e c'è un download in corso.
        stato.items = [inCorso('t1')]
        const rilascia = store.talosRetainModelTransferObserver()
        await vi.advanceTimersByTimeAsync(1_100)

        // 2. Si torna in chat ad aspettare: l'ULTIMA superficie si smonta.
        rilascia()

        // 3. Il download arriva in fondo e poi sparisce dalla lista, nel
        //    nativo, mentre nessuno guarda.
        stato.items = [inFondo('t1')]
        await vi.advanceTimersByTimeAsync(1_100)
        stato.items = []
        await vi.advanceTimersByTimeAsync(2_500)

        // 4. La notizia deve esserci comunque.
        expect(annunci).toContain('transfer-finished')
    })

    /**
     * E l'orologio non resta acceso per sempre: un `setInterval` al secondo che
     * gira in eterno è una batteria che si consuma per guardare una lista
     * vuota. Dopo l'ultimo trasferimento, e senza nessuno che guarda, si ferma.
     */
    it('l\'orologio si spegne quando non resta niente da scoprire', async () => {
        const store = await import('@/stores/modelTransfers')
        const servizio = await import('@/services/modelTransfer')

        stato.items = [inCorso('t1')]
        store.talosRetainModelTransferObserver()()
        await vi.advanceTimersByTimeAsync(1_100)

        stato.items = [inFondo('t1')]
        await vi.advanceTimersByTimeAsync(1_100)
        stato.items = []
        await vi.advanceTimersByTimeAsync(1_100)

        const dopoLaFine = vi.mocked(servizio.talosModelTransferStatus).mock.calls.length
        await vi.advanceTimersByTimeAsync(5_000)
        expect(vi.mocked(servizio.talosModelTransferStatus).mock.calls.length).toBe(dopoLaFine)
    })

    /**
     * Il caso che deve continuare a funzionare come prima: guardando la
     * schermata, senza nessun trasferimento, l'orologio gira lo stesso — è
     * quello che tiene fresca la lista mentre qualcuno la sta guardando.
     */
    it('con qualcuno che guarda continua a controllare anche senza trasferimenti', async () => {
        const store = await import('@/stores/modelTransfers')
        const servizio = await import('@/services/modelTransfer')

        stato.items = []
        store.talosRetainModelTransferObserver()
        const prima = vi.mocked(servizio.talosModelTransferStatus).mock.calls.length
        await vi.advanceTimersByTimeAsync(3_100)
        expect(vi.mocked(servizio.talosModelTransferStatus).mock.calls.length).toBeGreaterThan(prima)
    })
})
