/**
 * Running source card captures over many urls.
 *
 * Saving a search and back-filling the whole Library are the same job with
 * different numbers — capture these urls, politely, without blocking anyone —
 * so they are one runner rather than two loops that drift apart. What differs is
 * only the budget and whether there is a signal to stop it.
 *
 * The backfill is the demanding caller, and every rule here exists for it: it is
 * handed every link the user ever saved, on a phone, while a screen is
 * rendering. It must therefore be cheap when there is nothing to do, bounded
 * when there is too much, and instantly abandonable when the user leaves.
 */

export interface TalosSourceCardQueuePorts {
    /** No work needed: there is a card, or a recent failed try. */
    settled(url: string): Promise<boolean>
    capture(url: string): Promise<unknown>
    log(tag: string, detail: string): void
}

export interface TalosSourceCardQueueOptions {
    /** How many captures this pass may attempt. Default: as many as it is given. */
    budget?: number
    signal?: AbortSignal
}

export interface TalosSourceCardQueueReport {
    /**
     * The urls a capture was started for — the list, not a count, because the
     * caller that shows these cards has to re-read exactly these from disk and
     * nothing else. Re-reading the whole Library instead would put the cost the
     * budget exists to bound straight back in.
     */
    attempted: readonly string[]
    /** Urls that needed nothing, which is the common case after the first pass. */
    settled: number
    /** Real work left for the next pass, by budget or by cancellation. */
    deferred: number
    cancelled: boolean
}

export interface TalosSourceCardQueue {
    run(
        urls: readonly string[],
        options?: TalosSourceCardQueueOptions,
    ): Promise<TalosSourceCardQueueReport>
}

/**
 * Two at a time. Ten links would otherwise be twenty simultaneous requests from
 * a phone: rude to the sites, and pointless for the user, who is looking at a
 * list that is already on screen.
 */
const MAX_CONCURRENT = 2

const LOG_TAG = 'TALOS_SOURCE_CARD_BACKFILL'

export function createTalosSourceCardQueue(ports: TalosSourceCardQueuePorts): TalosSourceCardQueue {
    return {
        async run(urls, options = {}) {
            // The same page found by two searches is one card, so it is one
            // attempt however many times it appears in the list.
            const queued = [...new Set(urls)]
            const budget = options.budget ?? queued.length
            const signal = options.signal

            const attempted: string[] = []
            let settled = 0
            let next = 0
            let cancelled = signal?.aborted === true

            async function isSettled(url: string): Promise<boolean> {
                try {
                    return await ports.settled(url)
                } catch {
                    // An unanswerable store must not look like a finished one.
                    // Capture checks for itself and never throws, so the worst
                    // case is one wasted call rather than a lost card.
                    return false
                }
            }

            async function worker(): Promise<void> {
                for (;;) {
                    if (signal?.aborted) {
                        cancelled = true
                        return
                    }
                    if (next >= queued.length) return
                    const url = queued[next++]!

                    if (await isSettled(url)) {
                        settled += 1
                        continue
                    }
                    // Checked and spent with no await in between, so two workers
                    // cannot both read the last unit of budget as available.
                    if (attempted.length >= budget) return
                    attempted.push(url)

                    try {
                        await ports.capture(url)
                    } catch {
                        // Best-effort all the way down: one dead site cannot end
                        // the pass for the links behind it.
                    }
                }
            }

            await Promise.all(
                Array.from({ length: Math.min(MAX_CONCURRENT, queued.length) }, () => worker()),
            )

            const deferred = queued.length - attempted.length - settled
            if (deferred > 0 || cancelled) {
                // What a pass LEFT is the only part worth a line. A pass that
                // finished everything says nothing, so the Doctor shows the
                // Library falling behind rather than the Library working.
                // Counts only: which pages a user saved is not device-log
                // material, and this report is readable from the Doctor export.
                ports.log(
                    LOG_TAG,
                    `attempted=${attempted.length} settled=${settled} deferred=${deferred} cancelled=${cancelled}`,
                )
            }
            return { attempted, settled, deferred, cancelled }
        },
    }
}
