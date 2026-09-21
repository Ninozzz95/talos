import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    start: vi.fn(async () => ({
        ok: true as const,
        started: {
            id: 'transfer-new', phase: 'queued' as const,
            runner: 'USER_INITIATED_JOB' as const, networkBound: true,
        },
    })),
    pause: vi.fn(async () => ({ ok: true as const })),
    resume: vi.fn(async () => ({
        ok: true as const,
        started: {
            id: 'transfer-a', phase: 'queued' as const,
            runner: 'USER_INITIATED_JOB' as const, networkBound: true,
        },
    })),
    cancel: vi.fn(async () => ({ ok: true as const })),
    /** «Questi arrivi li ho raccontati»: il nativo può dimenticarli. */
    acknowledge: vi.fn(async () => undefined),
    status: vi.fn(async () => ({
        phase: 'running' as const,
        active: true,
        repo: 'unsloth/Qwen3-4B-GGUF',
        revision: 'pinned',
        paths: ['Qwen3-4B-Q4_K_M.gguf'],
        modelName: 'Qwen3 4B',
        haveBytes: 1_000,
        totalBytes: 4_000,
        runner: 'USER_INITIATED_JOB' as const,
        networkBound: true,
        failure: null,
        resumable: true,
        readFailure: null,
        items: [
            {
                id: 'transfer-a', jobId: 100_101, createdAtMs: 1,
                phase: 'running' as const, active: true,
                repo: 'unsloth/Qwen3-4B-GGUF', revision: 'pinned',
                paths: ['Qwen3-4B-Q4_K_M.gguf'], modelName: 'Qwen3 4B',
                haveBytes: 1_000, totalBytes: 4_000,
                runner: 'USER_INITIATED_JOB' as const, networkBound: true,
                failure: null, resumable: true,
            },
            {
                id: 'transfer-b', jobId: 100_102, createdAtMs: 2,
                phase: 'paused' as const, active: false,
                repo: 'LiquidAI/LFM2-350M-GGUF', revision: 'pinned-b',
                paths: ['LFM2-350M-Q4_K_M.gguf'], modelName: 'LFM2 350M',
                haveBytes: 2_000, totalBytes: 8_000,
                runner: 'USER_INITIATED_JOB' as const, networkBound: true,
                failure: null, resumable: true,
            },
        ],
    })),
}))

vi.mock('@/services/modelTransfer', () => ({
    talosAcknowledgeArrivals: bridge.acknowledge,
    talosStartModelTransfer: bridge.start,
    talosPauseModelTransfer: bridge.pause,
    talosResumeModelTransfer: bridge.resume,
    talosCancelModelTransfer: bridge.cancel,
    talosModelTransferStatus: bridge.status,
}))

beforeEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    bridge.start.mockClear()
    bridge.pause.mockClear()
    bridge.resume.mockClear()
    bridge.cancel.mockClear()
    bridge.status.mockReset().mockResolvedValue({
        phase: 'running', active: true,
        repo: 'unsloth/Qwen3-4B-GGUF', revision: 'pinned',
        paths: ['Qwen3-4B-Q4_K_M.gguf'], modelName: 'Qwen3 4B',
        haveBytes: 1_000, totalBytes: 4_000,
        runner: 'USER_INITIATED_JOB', networkBound: true,
        failure: null, resumable: true, readFailure: null,
        items: [
            {
                id: 'transfer-a', jobId: 100_101, createdAtMs: 1,
                phase: 'running', active: true,
                repo: 'unsloth/Qwen3-4B-GGUF', revision: 'pinned',
                paths: ['Qwen3-4B-Q4_K_M.gguf'], modelName: 'Qwen3 4B',
                haveBytes: 1_000, totalBytes: 4_000,
                runner: 'USER_INITIATED_JOB', networkBound: true,
                failure: null, resumable: true,
            },
            {
                id: 'transfer-b', jobId: 100_102, createdAtMs: 2,
                phase: 'paused', active: false,
                repo: 'LiquidAI/LFM2-350M-GGUF', revision: 'pinned-b',
                paths: ['LFM2-350M-Q4_K_M.gguf'], modelName: 'LFM2 350M',
                haveBytes: 2_000, totalBytes: 8_000,
                runner: 'USER_INITIATED_JOB', networkBound: true,
                failure: null, resumable: true,
            },
        ],
    })
})

describe('the one model-transfer observer', () => {
    it('uses one timer for two consumers and releases it only after the last', async () => {
        vi.useFakeTimers()
        const timers = vi.spyOn(globalThis, 'setInterval')
        const cleared = vi.spyOn(globalThis, 'clearInterval')
        const store = await import('@/stores/modelTransfers')

        const releaseA = store.talosRetainModelTransferObserver()
        const releaseB = store.talosRetainModelTransferObserver()

        expect(timers).toHaveBeenCalledTimes(1)
        releaseA()
        expect(cleared).not.toHaveBeenCalled()
        releaseB()
        expect(cleared).toHaveBeenCalledTimes(1)
    })

    it('keeps the last known snapshot when a later read fails', async () => {
        const store = await import('@/stores/modelTransfers')
        await store.talosRefreshModelTransfer()
        bridge.status.mockResolvedValue({
            ...(await bridge.status.mock.results[0]!.value),
            readFailure: 'bridge-offline',
        })

        await store.talosRefreshModelTransfer()

        expect(store.talosModelTransfers.phase).toBe('running')
        expect(store.talosModelTransfers.haveBytes).toBe(1_000)
        expect(store.talosModelTransfers.items).toHaveLength(2)
        expect(store.talosModelTransfers.readFailure).toBe('bridge-offline')
    })

    it('keeps both native records instead of projecting the second away', async () => {
        const store = await import('@/stores/modelTransfers')

        await store.talosRefreshModelTransfer()

        expect(store.talosModelTransfers.items.map((item) => item.id))
            .toEqual(['transfer-a', 'transfer-b'])
        expect(store.talosModelTransfers.active).toBe(true)
        expect(store.talosModelTransfers.paused).toBe(false)
    })
})

describe('managed transfer actions', () => {
    it('starts once and refreshes from native authority', async () => {
        const store = await import('@/stores/modelTransfers')
        const request = {
            repo: 'unsloth/Qwen3-4B-GGUF', revision: 'pinned',
            files: [{ path: 'Qwen3-4B-Q4_K_M.gguf', bytes: 4_000, sha256: null }],
            modelName: 'Qwen3 4B',
        }

        expect(await store.talosBeginModelTransfer(request)).toEqual({ ok: true })
        expect(bridge.start).toHaveBeenCalledWith(request)
        expect(bridge.status).toHaveBeenCalled()
    })

    it('delegates pause, resume and cancel without retaining a second request', async () => {
        const store = await import('@/stores/modelTransfers')

        expect(await store.talosPauseManagedModelTransfer('transfer-a')).toEqual({ ok: true })
        expect(await store.talosResumeManagedModelTransfer('transfer-b')).toEqual({ ok: true })
        expect(await store.talosCancelManagedModelTransfer('transfer-b')).toEqual({ ok: true })
        expect(bridge.pause).toHaveBeenCalledWith('transfer-a')
        expect(bridge.resume).toHaveBeenCalledWith('transfer-b')
        expect(bridge.cancel).toHaveBeenCalledWith('transfer-b')
        expect(bridge.start).not.toHaveBeenCalled()
    })
})

/**
 * Un download finito è un modello in più SUL DISCO, e chi mostra i modelli deve
 * saperlo senza che glielo si chieda.
 *
 * ## La storia, perché vale più della regola
 *
 * L'owner l'ha segnalato **tre volte**. Le prime due correzioni hanno allungato
 * la vita dell'osservatore — il poller vive finché c'è chi guarda OPPURE un
 * trasferimento in corso — e hanno lasciato intatta la cosa sbagliata: la fine
 * veniva **dedotta** dalla sparizione di una riga fra due istantanee.
 *
 * MISURATO sul Pad il 2026-08-06: un modello da 214 MB è arrivato in meno di
 * dodici secondi, la schermata «questo dispositivo» era aperta e visibile per
 * tutto il tempo, e ha continuato a dire «3 modelli» mentre sul disco ce n'erano
 * quattro.
 *
 * ⛔ Per questo la prova qui sotto **non fa mai comparire il trasferimento**:
 * lo status dichiara direttamente un arrivo, come fa il nativo, e la
 * conversazione fra le due istantanee non esiste. Una prova che prima mostrasse
 * la riga in corsa passerebbe anche con la vecchia deduzione, e non morderebbe.
 */
describe('un download finito lo dice chi lo ha fatto, non chi guardava', () => {
    /** Uno stato senza niente in corsa: solo cio' che e' gia' arrivato. */
    function statoConArrivi(completed: Array<{ id: string, modelName: string }>): unknown {
        return {
            items: [], phase: 'idle', active: false, repo: null, revision: null,
            paths: [], modelName: null, haveBytes: 0, totalBytes: 0, runner: null,
            networkBound: true, failure: null, resumable: false, readFailure: null,
            completed,
        }
    }

    it('annuncia il cambio di catalogo anche se il trasferimento non è mai comparso', async () => {
        const store = await import('@/stores/modelTransfers')
        const signal = await import('@/lib/models/localCatalogueSignal')

        const heard: string[] = []
        const release = signal.talosOnLocalCatalogueChange((reason) => { heard.push(reason) })

        // Nessun elemento in corsa, e un arrivo dichiarato: è esattamente ciò
        // che il nativo consegna quando il download è finito mentre nessuno
        // stava guardando.
        bridge.status.mockResolvedValue(
            statoConArrivi([{ id: 'transfer-a', modelName: 'Qwen3 4B' }]) as never)
        await store.talosRefreshModelTransfer()
        release()

        expect(heard).toContain('transfer-finished')
    })

    /**
     * ⛔ Consegnato una volta sola dal nativo, raccontato una volta sola qui.
     * Un download annunciato due volte fa perdere fiducia nel conteggio.
     */
    it('non racconta due volte lo stesso arrivo', async () => {
        const store = await import('@/stores/modelTransfers')
        const signal = await import('@/lib/models/localCatalogueSignal')

        const heard: string[] = []
        const release = signal.talosOnLocalCatalogueChange((reason) => { heard.push(reason) })

        bridge.status.mockResolvedValue(
            statoConArrivi([{ id: 'transfer-a', modelName: 'Qwen3 4B' }]) as never)
        await store.talosRefreshModelTransfer()
        // Il giro successivo: avvisato, il nativo non li ripropone.
        expect(bridge.acknowledge).toHaveBeenCalledWith(['transfer-a'])
        bridge.status.mockResolvedValue(statoConArrivi([]) as never)
        await store.talosRefreshModelTransfer()
        release()

        expect(heard.filter((r) => r === 'transfer-finished')).toHaveLength(1)
    })

    /**
     * Un lato nativo più vecchio di questo JavaScript non ha il campo: un APK
     * aggiornato a metà è un caso reale, e un poller che gira ogni secondo non
     * deve lanciare eccezioni per un campo che non c'è.
     */
    it('non si rompe se il lato nativo non sa ancora dichiarare gli arrivi', async () => {
        const store = await import('@/stores/modelTransfers')
        const { completed: _ignorato, ...senzaCampo } =
            statoConArrivi([]) as Record<string, unknown>
        bridge.status.mockResolvedValue(senzaCampo as never)
        await expect(store.talosRefreshModelTransfer()).resolves.toBeUndefined()
    })
})
