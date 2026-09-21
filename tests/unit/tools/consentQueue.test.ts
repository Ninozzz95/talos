import { describe, expect, it, vi } from 'vitest'
import { createTalosConsentQueue } from '@/lib/tools/consentQueue'

/**
 * Running a round's tool calls together (2026-07-26) created a problem the
 * single-file loop never had: two calls can reach the permission gate at the
 * same moment.
 *
 * The gate answers the second one 'busy' — correct when it was written, because
 * two sheets at once is a question nobody can reason about, but with the calls
 * now concurrent it turns a legitimate ask into a machine refusal the user never
 * saw. Asking has to QUEUE, not be dropped.
 */
describe('one permission question at a time, and none lost', () => {
    it('does not start the second question until the first is answered', async () => {
        const queue = createTalosConsentQueue()
        const open: string[] = []
        let releaseFirst!: (value: boolean) => void

        const first = queue.run(async () => {
            open.push('first')
            return new Promise<boolean>((resolve) => { releaseFirst = resolve })
        })
        const second = queue.run(async () => {
            open.push('second')
            return true
        })

        await Promise.resolve()
        expect(open).toEqual(['first'])

        releaseFirst(true)
        expect(await first).toBe(true)
        expect(await second).toBe(true)
        expect(open).toEqual(['first', 'second'])
    })

    it('a question that throws does not wedge the queue forever', async () => {
        const queue = createTalosConsentQueue()
        const failing = queue.run(async () => { throw new Error('boom') })
        const after = queue.run(async () => true)

        await expect(failing).rejects.toThrow('boom')
        expect(await after).toBe(true)
    })

    it('answers a caller that gave up before its turn, without asking', async () => {
        // A send the user stopped must not put a sheet on screen for a tool
        // whose round has already been abandoned.
        const queue = createTalosConsentQueue()
        const controller = new AbortController()
        let releaseFirst!: (value: boolean) => void
        const asked = vi.fn(async () => true)

        void queue.run(() => new Promise<boolean>((resolve) => { releaseFirst = resolve }))
        const queued = queue.run(asked, controller.signal)

        controller.abort()
        releaseFirst(true)

        expect(await queued).toBe(false)
        expect(asked).not.toHaveBeenCalled()
    })
})
