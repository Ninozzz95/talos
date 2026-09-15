import { describe, expect, it, vi } from 'vitest'
import { createTalosSourceCardQueue } from '@/lib/search/sourceCardQueue'

/**
 * Slice 6: running captures over MANY urls.
 *
 * The save path and the retroactive backfill are the same job with different
 * numbers — capture these urls, politely, without blocking anyone — so they are
 * one runner rather than two loops that drift. What differs is only the budget
 * and whether there is a signal to stop it.
 *
 * The backfill is the demanding caller: it is handed every link the user ever
 * saved, on a phone, while a screen is rendering. Every rule tested here exists
 * because of that caller.
 */
function ports(overrides: Record<string, unknown> = {}) {
    return {
        settled: vi.fn(async () => false),
        capture: vi.fn(async () => ({ url: 'x' })),
        log: vi.fn(),
        ...overrides,
    }
}

describe('createTalosSourceCardQueue', () => {
    it('captures every url that has no card yet', async () => {
        const seams = ports()
        const queue = createTalosSourceCardQueue(seams as never)

        const report = await queue.run(['https://a.example', 'https://b.example'])

        expect(seams.capture).toHaveBeenCalledTimes(2)
        // The urls, not a count: the caller that shows these cards re-reads
        // exactly what was attempted and nothing else.
        expect(report.attempted).toEqual(['https://a.example', 'https://b.example'])
    })

    /**
     * The reason the backfill is cheap on the second open: a link whose card is
     * already on disk costs one existence check and nothing else — no fetch, and
     * no bite out of the budget, so the budget always buys real work.
     */
    it('never captures a url that is already settled, and does not spend budget on it', async () => {
        const seams = ports({
            settled: vi.fn(async (url: string) => url !== 'https://new.example'),
        })
        const queue = createTalosSourceCardQueue(seams as never)

        const report = await queue.run(
            ['https://old1.example', 'https://old2.example', 'https://new.example'],
            { budget: 1 },
        )

        expect(seams.capture).toHaveBeenCalledExactlyOnceWith('https://new.example')
        expect(report).toMatchObject({ attempted: ['https://new.example'], settled: 2, deferred: 0 })
    })

    it('treats the same url twice as one capture', async () => {
        const seams = ports()
        const queue = createTalosSourceCardQueue(seams as never)

        await queue.run(['https://a.example', 'https://a.example', 'https://a.example'])

        expect(seams.capture).toHaveBeenCalledOnce()
    })

    /**
     * Ten links would otherwise be twenty simultaneous requests from a phone:
     * rude to the sites and pointless for the user, who is looking at a list.
     */
    it('runs at most two captures at a time', async () => {
        let inFlight = 0
        let peak = 0
        const seams = ports({
            capture: vi.fn(async () => {
                inFlight += 1
                peak = Math.max(peak, inFlight)
                await Promise.resolve()
                inFlight -= 1
                return null
            }),
        })
        const queue = createTalosSourceCardQueue(seams as never)

        await queue.run(Array.from({ length: 8 }, (_, index) => `https://${index}.example`))

        expect(seams.capture).toHaveBeenCalledTimes(8)
        expect(peak).toBe(2)
    })

    /**
     * A library with three hundred saved links must not fetch three hundred
     * pages because someone opened a screen. The rest is not lost — it is the
     * next pass's work, and the report says so instead of the pass pretending
     * it finished.
     */
    it('stops when the budget is spent and reports what it left', async () => {
        const seams = ports()
        const queue = createTalosSourceCardQueue(seams as never)

        const report = await queue.run(
            Array.from({ length: 10 }, (_, index) => `https://${index}.example`),
            { budget: 3 },
        )

        expect(seams.capture).toHaveBeenCalledTimes(3)
        expect(report.attempted).toHaveLength(3)
        expect(report).toMatchObject({ deferred: 7, cancelled: false })
    })

    it('stops as soon as it is cancelled, and says that is why', async () => {
        const controller = new AbortController()
        const seams = ports({
            capture: vi.fn(async (url: string) => {
                if (url === 'https://1.example') controller.abort()
                return null
            }),
        })
        const queue = createTalosSourceCardQueue(seams as never)

        const report = await queue.run(
            Array.from({ length: 10 }, (_, index) => `https://${index}.example`),
            { signal: controller.signal },
        )

        // Two are in flight when the abort lands, so the pass stops at the pair
        // it had already started rather than at an exact count.
        expect(seams.capture.mock.calls.length).toBeLessThan(10)
        expect(report.cancelled).toBe(true)
    })

    it('does not start at all when it is handed an already-aborted signal', async () => {
        const seams = ports()
        const queue = createTalosSourceCardQueue(seams as never)

        const report = await queue.run(['https://a.example'], { signal: AbortSignal.abort() })

        expect(seams.settled).not.toHaveBeenCalled()
        expect(seams.capture).not.toHaveBeenCalled()
        expect(report.cancelled).toBe(true)
    })

    /**
     * The device log is readable from the Doctor export, and which pages a user
     * saved is not device-log material. The report names urls because it stays
     * in memory; the line that gets written down counts them.
     */
    it('writes down how many, never which', async () => {
        const seams = ports()
        await createTalosSourceCardQueue(seams as never).run(
            ['https://private.example/secret-page', 'https://b.example'],
            { budget: 1 },
        )

        expect(seams.log).toHaveBeenCalledOnce()
        expect(String(seams.log.mock.calls[0]?.[1])).not.toContain('private.example')
    })

    /**
     * Best-effort all the way down. One dead site cannot end the pass for the
     * links behind it, and a store that cannot answer must not stop the work
     * either — capture checks for itself and never throws.
     */
    it('keeps going when one capture throws', async () => {
        const seams = ports({
            capture: vi.fn(async (url: string) => {
                if (url === 'https://bad.example') throw new Error('TALOS_WEB_URL_BLOCKED')
                return null
            }),
        })
        const queue = createTalosSourceCardQueue(seams as never)

        const report = await queue.run(['https://bad.example', 'https://good.example'])

        expect(seams.capture).toHaveBeenCalledTimes(2)
        expect(report.attempted).toHaveLength(2)
    })

    it('attempts a url whose settled check could not be answered', async () => {
        const seams = ports({
            settled: vi.fn(async () => { throw new Error('TALOS_ATTACHMENT_UNAVAILABLE') }),
        })
        const queue = createTalosSourceCardQueue(seams as never)

        await queue.run(['https://a.example'])

        expect(seams.capture).toHaveBeenCalledOnce()
    })

    it('records what it left behind, and stays quiet when it left nothing', async () => {
        const noisy = ports()
        await createTalosSourceCardQueue(noisy as never).run(
            Array.from({ length: 5 }, (_, index) => `https://${index}.example`),
            { budget: 2 },
        )
        expect(noisy.log).toHaveBeenCalledWith(
            'TALOS_SOURCE_CARD_BACKFILL',
            expect.stringContaining('deferred=3'),
        )

        const quiet = ports()
        await createTalosSourceCardQueue(quiet as never).run(['https://a.example'])
        expect(quiet.log).not.toHaveBeenCalled()
    })
})
