import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The bridge between the download centre and the only thing that can actually
 * move four gigabytes.
 *
 * Every path here is about not lying to the screen. A web build has no such
 * plugin, a phone can refuse to start the transfer, and Android below 14 cannot
 * pin it to the network it began on — and each of those has to arrive as a fact
 * the interface can state, never as a rejected promise or a button that fails
 * when pressed.
 */
const bridge = vi.hoisted(() => ({
    start: vi.fn(async () => ({
        id: 'transfer-a', phase: 'queued',
        runner: 'USER_INITIATED_JOB', networkBound: true,
    })),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => ({
        id: 'transfer-a', phase: 'queued',
        runner: 'USER_INITIATED_JOB', networkBound: true,
    })),
    cancel: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    status: vi.fn(async () => ({
        active: true,
        phase: 'running',
        repo: 'unsloth/Qwen3-4B-GGUF',
        revision: 'pinned',
        paths: ['Qwen3-4B-Q4_K_M.gguf'],
        modelName: 'Qwen3 4B',
        haveBytes: 1_000,
        totalBytes: 4_000,
        runner: 'USER_INITIATED_JOB',
        networkBound: true,
        failure: null,
        resumable: true,
    })),
    leftovers: vi.fn(async () => ({ items: [{ path: '/x.gguf.part', bytes: 42 }], totalBytes: 42 })),
    discard: vi.fn(async () => undefined),
    native: true,
    available: true,
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => bridge.native,
        isPluginAvailable: () => bridge.available,
    },
    registerPlugin: () => ({
        start: bridge.start,
        pause: bridge.pause,
        resume: bridge.resume,
        cancel: bridge.cancel,
        stop: bridge.stop,
        status: bridge.status,
        leftovers: bridge.leftovers,
        discard: bridge.discard,
    }),
}))

beforeEach(() => {
    vi.resetModules()
    bridge.native = true
    bridge.available = true
    bridge.start.mockReset().mockResolvedValue({
        id: 'transfer-a', phase: 'queued',
        runner: 'USER_INITIATED_JOB', networkBound: true,
    })
    bridge.pause.mockReset().mockResolvedValue(undefined)
    bridge.resume.mockReset().mockResolvedValue({
        id: 'transfer-a', phase: 'queued',
        runner: 'USER_INITIATED_JOB', networkBound: true,
    })
    bridge.cancel.mockReset().mockResolvedValue(undefined)
    bridge.stop.mockReset().mockResolvedValue(undefined)
    bridge.status.mockReset().mockResolvedValue({
        active: true,
        phase: 'running',
        repo: 'unsloth/Qwen3-4B-GGUF',
        revision: 'pinned',
        paths: ['Qwen3-4B-Q4_K_M.gguf'],
        modelName: 'Qwen3 4B',
        haveBytes: 1_000,
        totalBytes: 4_000,
        runner: 'USER_INITIATED_JOB',
        networkBound: true,
        failure: null,
        resumable: true,
    })
    bridge.leftovers.mockReset().mockResolvedValue({
        items: [{ path: '/x.gguf.part', bytes: 42 }],
        totalBytes: 42,
    })
    bridge.discard.mockReset().mockResolvedValue(undefined)
})

const REQUEST = {
    repo: 'unsloth/Qwen3-4B-GGUF',
    // A SET, because a large GGUF is published in pieces and any subset of them
    // is not a smaller model. Passing only the first with the set total is what
    // made the job download one shard and then delete it.
    files: [{ path: 'Qwen3-4B-Q4_K_M.gguf', bytes: 2_500_000_000, sha256: 'a'.repeat(64) }],
}

describe('starting a model transfer', () => {
    it('hands the native side everything it needs to reserve and to verify', async () => {
        const { talosStartModelTransfer } = await import('@/services/modelTransfer')

        const result = await talosStartModelTransfer(REQUEST)

        expect(result.ok).toBe(true)
        expect(bridge.start).toHaveBeenCalledWith({
            repo: REQUEST.repo,
            revision: 'main',
            files: [{ path: 'Qwen3-4B-Q4_K_M.gguf', bytes: 2_500_000_000, sha256: 'a'.repeat(64) }],
            modelName: 'Qwen3-4B-Q4_K_M.gguf',
        })
    })

    /**
     * Below Android 14 the transfer is not tied to the network it started on
     * and can follow the phone onto mobile data. Someone starting four
     * gigabytes on a train has a right to know that before they do it, so the
     * fact travels up rather than staying in the native layer.
     */
    it('reports honestly when the transfer is not pinned to its network', async () => {
        bridge.start.mockResolvedValue({
            id: 'transfer-a', phase: 'queued',
            runner: 'FOREGROUND_SERVICE', networkBound: false,
        })
        const { talosStartModelTransfer } = await import('@/services/modelTransfer')

        const result = await talosStartModelTransfer(REQUEST)

        expect(result).toEqual({
            ok: true,
            started: {
                id: 'transfer-a', phase: 'queued',
                runner: 'FOREGROUND_SERVICE', networkBound: false,
            },
        })
    })

    /** A refusal is an answer the screen can show, never an exception it must catch. */
    it('turns a refusal into a reason', async () => {
        bridge.start.mockRejectedValue(new Error('A download is already running'))
        const { talosStartModelTransfer } = await import('@/services/modelTransfer')

        expect(await talosStartModelTransfer(REQUEST)).toEqual({
            ok: false,
            reason: 'A download is already running',
        })
    })

    it('says plainly that a browser cannot do this', async () => {
        bridge.native = false
        bridge.available = false
        const { talosStartModelTransfer } = await import('@/services/modelTransfer')

        expect(await talosStartModelTransfer(REQUEST)).toEqual({ ok: false, reason: 'unsupported' })
        expect(bridge.start).not.toHaveBeenCalled()
    })

    it('fails closed when a native container did not register the transfer plugin', async () => {
        bridge.native = true
        bridge.available = false
        const { talosStartModelTransfer } = await import('@/services/modelTransfer')

        expect(await talosStartModelTransfer(REQUEST)).toEqual({ ok: false, reason: 'unsupported' })
        expect(bridge.start).not.toHaveBeenCalled()
    })
})

describe('watching and cleaning up', () => {
    it('reports what is in flight', async () => {
        const { talosModelTransferStatus } = await import('@/services/modelTransfer')

        expect(await talosModelTransferStatus()).toEqual({
            // Nessun arrivo da raccontare: questo status descrive un download
            // ancora in corso. La lista e' vuota, non assente — chi legge non
            // deve distinguere «niente» da «campo che non c'e'».
            completed: [],
            active: true,
            phase: 'running',
            repo: 'unsloth/Qwen3-4B-GGUF',
            revision: 'pinned',
            paths: ['Qwen3-4B-Q4_K_M.gguf'],
            modelName: 'Qwen3 4B',
            haveBytes: 1_000,
            totalBytes: 4_000,
            runner: 'USER_INITIATED_JOB',
            networkBound: true,
            failure: null,
            resumable: true,
            readFailure: null,
            items: [{
                id: 'legacy', jobId: null, createdAtMs: null,
                active: true, phase: 'running',
                repo: 'unsloth/Qwen3-4B-GGUF', revision: 'pinned',
                paths: ['Qwen3-4B-Q4_K_M.gguf'], modelName: 'Qwen3 4B',
                haveBytes: 1_000, totalBytes: 4_000,
                runner: 'USER_INITIATED_JOB', networkBound: true,
                failure: null, resumable: true,
            }],
        })
    })

    it('normalizes two native records without collapsing their identities', async () => {
        bridge.status.mockResolvedValue({
            items: [
                {
                    id: 'transfer-a', jobId: 100_101, createdAtMs: 1,
                    active: true, phase: 'running', repo: 'owner/a', revision: 'pin-a',
                    paths: ['a.gguf'], modelName: 'Model A', haveBytes: 25, totalBytes: 100,
                    runner: 'USER_INITIATED_JOB', networkBound: true,
                    failure: null, resumable: true,
                },
                {
                    id: 'transfer-b', jobId: 100_102, createdAtMs: 2,
                    active: false, phase: 'paused', repo: 'owner/b', revision: 'pin-b',
                    paths: ['b.gguf'], modelName: 'Model B', haveBytes: 50, totalBytes: 200,
                    runner: 'USER_INITIATED_JOB', networkBound: true,
                    failure: null, resumable: true,
                },
            ],
        } as never)
        const { talosModelTransferStatus } = await import('@/services/modelTransfer')

        const status = await talosModelTransferStatus()

        expect(status.items.map((item) => item.id)).toEqual(['transfer-a', 'transfer-b'])
        expect(status.items[0]).toMatchObject({ phase: 'running', haveBytes: 25 })
        expect(status.items[1]).toMatchObject({ phase: 'paused', haveBytes: 50 })
        expect(status.modelName).toBe('Model A')
    })

    it('preserves the last known transfer and names a bridge read failure', async () => {
        const { talosModelTransferStatus } = await import('@/services/modelTransfer')
        const known = await talosModelTransferStatus()
        bridge.status.mockRejectedValue(new Error('boom'))

        expect(await talosModelTransferStatus()).toEqual({ ...known, readFailure: 'boom' })
    })

    /**
     * Space is claimed before the first byte, so an attempt abandoned after ten
     * seconds still holds the whole file. Without this the user watches free
     * space vanish with nothing to point at.
     */
    it('names what abandoned attempts are costing', async () => {
        const { talosModelTransferLeftovers } = await import('@/services/modelTransfer')

        expect(await talosModelTransferLeftovers()).toEqual({
            items: [{ path: '/x.gguf.part', bytes: 42 }],
            totalBytes: 42,
        })
    })

    it('says a discard failed instead of pretending the space came back', async () => {
        bridge.discard.mockRejectedValue(new Error('that is not a download of ours'))
        const { talosDiscardModelTransfer } = await import('@/services/modelTransfer')

        expect(await talosDiscardModelTransfer('/somewhere/else')).toBe(false)
    })

    it('exposes typed pause, resume and cancel while keeping stop as a pause alias', async () => {
        const {
            talosPauseModelTransfer,
            talosResumeModelTransfer,
            talosCancelModelTransfer,
            talosStopModelTransfer,
        } = await import('@/services/modelTransfer')

        expect(await talosPauseModelTransfer('transfer-a')).toEqual({ ok: true })
        expect(await talosResumeModelTransfer('transfer-b')).toEqual({
            ok: true,
            started: {
                id: 'transfer-a', phase: 'queued',
                runner: 'USER_INITIATED_JOB', networkBound: true,
            },
        })
        expect(await talosCancelModelTransfer('transfer-b')).toEqual({ ok: true })
        await expect(talosStopModelTransfer()).resolves.toBeUndefined()
        expect(bridge.pause).toHaveBeenCalledTimes(2)
        expect(bridge.pause).toHaveBeenNthCalledWith(1, { id: 'transfer-a' })
        expect(bridge.resume).toHaveBeenCalledWith({ id: 'transfer-b' })
        expect(bridge.cancel).toHaveBeenCalledWith({ id: 'transfer-b' })
        expect(bridge.stop).not.toHaveBeenCalled()
    })

    it('returns an actionable pause refusal without throwing', async () => {
        bridge.pause.mockRejectedValue(new Error('nothing running'))
        const { talosPauseModelTransfer } = await import('@/services/modelTransfer')

        expect(await talosPauseModelTransfer()).toEqual({ ok: false, reason: 'nothing running' })
    })
})
