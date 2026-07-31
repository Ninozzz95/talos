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
    start: vi.fn(async () => ({ runner: 'USER_INITIATED_JOB', networkBound: true })),
    stop: vi.fn(async () => undefined),
    status: vi.fn(async () => ({
        active: true,
        modelName: 'Qwen3 4B',
        haveBytes: 1_000,
        totalBytes: 4_000,
    })),
    leftovers: vi.fn(async () => ({ items: [{ path: '/x.gguf.part', bytes: 42 }], totalBytes: 42 })),
    discard: vi.fn(async () => undefined),
    native: true,
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => bridge.native },
    registerPlugin: () => ({
        start: bridge.start,
        stop: bridge.stop,
        status: bridge.status,
        leftovers: bridge.leftovers,
        discard: bridge.discard,
    }),
}))

beforeEach(() => {
    bridge.native = true
    bridge.start.mockReset().mockResolvedValue({ runner: 'USER_INITIATED_JOB', networkBound: true })
    bridge.stop.mockReset().mockResolvedValue(undefined)
    bridge.status.mockReset().mockResolvedValue({
        active: true,
        modelName: 'Qwen3 4B',
        haveBytes: 1_000,
        totalBytes: 4_000,
    })
    bridge.leftovers.mockReset().mockResolvedValue({
        items: [{ path: '/x.gguf.part', bytes: 42 }],
        totalBytes: 42,
    })
    bridge.discard.mockReset().mockResolvedValue(undefined)
})

const REQUEST = {
    repo: 'unsloth/Qwen3-4B-GGUF',
    path: 'Qwen3-4B-Q4_K_M.gguf',
    totalBytes: 2_500_000_000,
    sha256: 'a'.repeat(64),
}

describe('starting a model transfer', () => {
    it('hands the native side everything it needs to reserve and to verify', async () => {
        const { talosStartModelTransfer } = await import('@/services/modelTransfer')

        const result = await talosStartModelTransfer(REQUEST)

        expect(result.ok).toBe(true)
        expect(bridge.start).toHaveBeenCalledWith({
            repo: REQUEST.repo,
            revision: 'main',
            path: REQUEST.path,
            modelName: REQUEST.path,
            totalBytes: REQUEST.totalBytes,
            sha256: REQUEST.sha256,
        })
    })

    /**
     * Below Android 14 the transfer is not tied to the network it started on
     * and can follow the phone onto mobile data. Someone starting four
     * gigabytes on a train has a right to know that before they do it, so the
     * fact travels up rather than staying in the native layer.
     */
    it('reports honestly when the transfer is not pinned to its network', async () => {
        bridge.start.mockResolvedValue({ runner: 'FOREGROUND_SERVICE', networkBound: false })
        const { talosStartModelTransfer } = await import('@/services/modelTransfer')

        const result = await talosStartModelTransfer(REQUEST)

        expect(result).toEqual({
            ok: true,
            started: { runner: 'FOREGROUND_SERVICE', networkBound: false },
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
        const { talosStartModelTransfer } = await import('@/services/modelTransfer')

        expect(await talosStartModelTransfer(REQUEST)).toEqual({ ok: false, reason: 'unsupported' })
        expect(bridge.start).not.toHaveBeenCalled()
    })
})

describe('watching and cleaning up', () => {
    it('reports what is in flight', async () => {
        const { talosModelTransferStatus } = await import('@/services/modelTransfer')

        expect(await talosModelTransferStatus()).toEqual({
            active: true,
            modelName: 'Qwen3 4B',
            haveBytes: 1_000,
            totalBytes: 4_000,
        })
    })

    it('reports nothing in flight rather than throwing when the plugin is unhappy', async () => {
        bridge.status.mockRejectedValue(new Error('boom'))
        const { talosModelTransferStatus } = await import('@/services/modelTransfer')

        expect(await talosModelTransferStatus()).toEqual({
            active: false,
            modelName: null,
            haveBytes: 0,
            totalBytes: 0,
        })
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

    it('stopping is a pause, and never fails loudly', async () => {
        bridge.stop.mockRejectedValue(new Error('nothing running'))
        const { talosStopModelTransfer } = await import('@/services/modelTransfer')

        await expect(talosStopModelTransfer()).resolves.toBeUndefined()
    })
})
