export type TalosFrameRequest = (callback: () => void) => number
export type TalosFrameCancel = (handle: number) => void

/**
 * Coalesce DOM work triggered by a burst of reactive updates.
 *
 * A streaming reply can update its revealed text several times before the
 * browser paints. Keeping only the latest task means the tail is walked once
 * on the next frame, instead of once per notification. The scheduler is small
 * and clock-injectable so the contract is testable without a real browser.
 */
export function createTalosFrameScheduler(
    requestFrame: TalosFrameRequest,
    cancelFrame: TalosFrameCancel,
): {
    schedule(task: () => void): void
    cancel(): void
} {
    let handle: number | null = null
    let pending: (() => void) | null = null

    const cancel = (): void => {
        if (handle !== null) cancelFrame(handle)
        handle = null
        pending = null
    }

    return {
        schedule(task) {
            pending = task
            if (handle !== null) return
            handle = requestFrame(() => {
                handle = null
                const next = pending
                pending = null
                next?.()
            })
        },
        cancel,
    }
}
