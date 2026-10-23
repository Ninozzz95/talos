import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La barra di download che resta a «0% · 0 B» per sempre.
 *
 * ## Il difetto, MISURATO sul Pad il 22/10/2026 (APK di prova ai.talos.dev)
 *
 * Impostazioni → Modelli → Locali → ggml-org/gemma-3-1b-it-GGUF, «Scarica
 * Q4_K_M · 769 MB»: la pagina dice «Sto scaricando · Q4_K_M 0% 0 B / 769 MB» e
 * non si muove più. Il nativo intanto ha FINITO (sha256 giusto sul disco) e
 * `status()` risponde `{ items: [], completed: [{ id, modelName }], phase:
 * 'idle', active: false }`. Con Qwen3-1.7B Q4_0, dopo 20 s il nativo dice
 * `running, 411383533 di 1056782912` e la pagina ancora «0 B / 1008 MB».
 *
 * ## La causa
 *
 * L'orologio che va a leggere lo stato nativo lo accendeva SOLO chi guarda: il
 * pulsante del Centro download nella cornice. Sul tablet, dentro la stazione
 * Impostazioni, quella cornice non c'è (owner 14/09: campanella e download
 * «solo dalla chat»), e `talosBeginModelTransfer` faceva una sola lettura,
 * subito dopo l'avvio — quella da 0 byte — e poi più niente.
 *
 * Il nativo qui sotto ha la forma VERA di `TalosModelTransferPlugin.status()`
 * (`statusItem` + `copyStatus` + `completed`), passata dal ponte vero
 * `services/modelTransfer.ts`: se il difetto fosse nel riconoscere la forma,
 * questo test lo vedrebbe lo stesso.
 */

const nativo = vi.hoisted(() => ({
    risposta: null as unknown,
    ack: vi.fn(async (_: { ids: string[] }) => undefined),
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: () => true,
    },
    registerPlugin: () => ({
        start: vi.fn(async () => ({
            id: '3830d18b-qwen', phase: 'queued',
            runner: 'USER_INITIATED_JOB', networkBound: true,
        })),
        resume: vi.fn(async () => ({
            id: '3830d18b-qwen', phase: 'queued',
            runner: 'USER_INITIATED_JOB', networkBound: true,
        })),
        status: vi.fn(async () => structuredClone(nativo.risposta)),
        acknowledgeCompleted: nativo.ack,
    }),
}))

const annunci: string[] = []
vi.mock('@/lib/models/localCatalogueSignal', () => ({
    talosAnnounceLocalCatalogueChange: (reason: string) => { annunci.push(reason) },
}))
vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))

const ID = '3830d18b-qwen'
const TOTALE = 1_056_782_912

/** Una riga come la scrive `statusItem()` in TalosModelTransferPlugin.java. */
function rigaNativa(phase: string, haveBytes: number) {
    return {
        id: ID, jobId: 100_101, createdAtMs: 1_761_100_000_000,
        phase, active: phase !== 'paused' && phase !== 'waiting' && phase !== 'failed',
        repo: 'unsloth/Qwen3-1.7B-GGUF', revision: 'main',
        paths: ['Qwen3-1.7B-Q4_0.gguf'], path: 'Qwen3-1.7B-Q4_0.gguf', parts: 1,
        modelName: 'Qwen3-1.7B-GGUF Q4_0',
        runner: 'USER_INITIATED_JOB', networkBound: true, failure: null, resumable: true,
        haveBytes, totalBytes: TOTALE,
    }
}

/** La risposta intera: `items`, la proiezione della prima riga in cima, `completed`. */
function inCorsa(phase: string, haveBytes: number) {
    const riga = rigaNativa(phase, haveBytes)
    return { ...riga, items: [riga], completed: [] }
}

function finito() {
    return {
        items: [],
        completed: [{ id: ID, modelName: 'Qwen3-1.7B-GGUF Q4_0' }],
        phase: 'idle', active: false, haveBytes: 0, totalBytes: 0,
        networkBound: true, resumable: false,
    }
}

beforeEach(() => {
    vi.useFakeTimers()
    annunci.length = 0
    nativo.ack.mockClear()
    // Subito dopo l'avvio il nativo ha accettato il lavoro e non ha ancora un byte.
    nativo.risposta = inCorsa('queued', 0)
})

afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
})

describe('il download avviato dove il Centro download non è montato (tablet, Impostazioni)', () => {
    it('la barra segue i byte del nativo anche senza nessun osservatore', async () => {
        const store = await import('@/stores/modelTransfers')

        // Nessun `talosRetainModelTransferObserver`: è proprio il caso del Pad.
        const avvio = await store.talosBeginModelTransfer({
            repo: 'unsloth/Qwen3-1.7B-GGUF',
            revision: 'main',
            files: [{ path: 'Qwen3-1.7B-Q4_0.gguf', bytes: TOTALE, sha256: 'a'.repeat(64) }],
            modelName: 'Qwen3-1.7B-GGUF Q4_0',
        })
        expect(avvio).toEqual({ ok: true })
        expect(store.talosModelTransfers.items[0]?.haveBytes).toBe(0)
        // La forma nativa È riconosciuta: `jobId` lo porta solo la riga letta
        // dal nativo (quella ottimistica ha `null`). Il difetto non è il parsing.
        expect(store.talosModelTransfers.items[0]?.jobId).toBe(100_101)
        expect(store.talosModelTransfers.readFailure).toBeNull()

        // 20 s dopo, come misurato: il nativo è a 411 MB.
        nativo.risposta = inCorsa('running', 411_383_533)
        await vi.advanceTimersByTimeAsync(20_000)

        expect(store.talosModelTransfers.items).toHaveLength(1)
        expect(store.talosModelTransfers.items[0]?.haveBytes).toBe(411_383_533)
        expect(store.talosModelTransfers.items[0]?.totalBytes).toBe(TOTALE)
    })

    it('e a download finito la riga sparisce, l\'arrivo si annuncia e si accusa ricevuta', async () => {
        const store = await import('@/stores/modelTransfers')

        await store.talosBeginModelTransfer({
            repo: 'unsloth/Qwen3-1.7B-GGUF',
            revision: 'main',
            files: [{ path: 'Qwen3-1.7B-Q4_0.gguf', bytes: TOTALE, sha256: 'a'.repeat(64) }],
            modelName: 'Qwen3-1.7B-GGUF Q4_0',
        })

        nativo.risposta = inCorsa('running', 700_000_000)
        await vi.advanceTimersByTimeAsync(2_100)
        nativo.risposta = finito()
        await vi.advanceTimersByTimeAsync(2_100)

        expect(store.talosModelTransfers.items).toHaveLength(0)
        expect(annunci).toContain('transfer-finished')
        expect(nativo.ack).toHaveBeenCalledWith({ ids: [ID] })
    })

    it('anche la ripresa da «in pausa» riaccende l’orologio', async () => {
        const store = await import('@/stores/modelTransfers')

        // Il download era in pausa: nessun orologio, nessun osservatore.
        nativo.risposta = inCorsa('paused', 100_000_000)
        await store.talosRefreshModelTransfer()
        expect(store.talosModelTransfers.items[0]?.phase).toBe('paused')

        nativo.risposta = inCorsa('queued', 100_000_000)
        expect(await store.talosResumeManagedModelTransfer(ID)).toEqual({ ok: true })

        nativo.risposta = inCorsa('running', 500_000_000)
        await vi.advanceTimersByTimeAsync(3_100)
        expect(store.talosModelTransfers.items[0]?.haveBytes).toBe(500_000_000)
    })
})
