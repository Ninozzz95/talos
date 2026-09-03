import { describe, expect, it, vi } from 'vitest'
import { createTalosFrameScheduler } from '@/lib/streamingTailScheduler'

describe('streaming tail frame scheduler', () => {
    it('coalesces a burst of reveal notifications into one DOM sync per frame', () => {
        const frames: Array<() => void> = []
        const sync = vi.fn()
        const scheduler = createTalosFrameScheduler((callback) => {
            frames.push(callback)
            return frames.length
        }, (handle) => { frames[handle - 1] = () => {} })

        scheduler.schedule(sync)
        scheduler.schedule(sync)
        scheduler.schedule(sync)
        expect(sync).not.toHaveBeenCalled()

        frames[0]!()
        expect(sync).toHaveBeenCalledTimes(1)
        scheduler.schedule(sync)
        scheduler.schedule(sync)
        frames[1]!()
        expect(sync).toHaveBeenCalledTimes(2)
    })
})
