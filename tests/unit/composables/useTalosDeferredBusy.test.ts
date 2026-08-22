// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { TALOS_BUSY_DELAY_MS, useTalosDeferredBusy, type TalosDeferredBusy } from '@/composables/useTalosDeferredBusy'

/**
 * `onBeforeUnmount` needs an instance, so the composable is exercised inside a
 * real component rather than called bare.
 */
function host(delay?: number) {
    let api: TalosDeferredBusy
    const wrapper = mount(defineComponent({
        setup() {
            api = useTalosDeferredBusy(delay)
            return () => h('div')
        },
    }))
    return { wrapper, busy: api! }
}

function deferred<T>() {
    let settle!: (value: T) => void
    const promise = new Promise<T>((resolve) => { settle = resolve })
    return { promise, settle }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('an action that may or may not be worth a spinner', () => {
    it('blocks a second tap from the first millisecond', async () => {
        // The caller is a finger on a phone. Two taps on Delete must not send
        // two deletions — and the guard cannot afford to wait for a threshold.
        const { busy } = host()
        const first = deferred<string>()
        let secondRan = false

        const running = busy.run('run-1', () => first.promise)
        expect(busy.pending.value).toBe('run-1')

        const refused = await busy.run('run-1', async () => { secondRan = true; return 'x' })
        expect(refused).toBeNull()
        expect(secondRan).toBe(false)

        first.settle('done')
        expect(await running).toBe('done')
    })

    it('draws nothing for work that finishes quickly', async () => {
        // A spinner that appears and vanishes inside one frame reads as a
        // glitch, not as progress.
        const { busy } = host()
        const quick = deferred<string>()

        const running = busy.run('run-1', () => quick.promise)
        vi.advanceTimersByTime(TALOS_BUSY_DELAY_MS - 1)
        expect(busy.visible.value).toBeNull()

        quick.settle('done')
        await running
        expect(busy.visible.value).toBeNull()
    })

    it('draws the wait once it is a real wait', async () => {
        const { busy } = host()
        const slow = deferred<string>()

        const running = busy.run('run-1', () => slow.promise)
        vi.advanceTimersByTime(TALOS_BUSY_DELAY_MS)
        expect(busy.visible.value).toBe('run-1')

        slow.settle('done')
        await running
        // …and stops the moment it is over, rather than lingering.
        expect(busy.visible.value).toBeNull()
        expect(busy.pending.value).toBeNull()
    })

    it('clears itself when the work fails, so the row is not stuck', async () => {
        const { busy } = host()
        await expect(busy.run('run-1', async () => { throw new Error('rete assente') }))
            .rejects.toThrow('rete assente')

        expect(busy.pending.value).toBeNull()
        expect(busy.visible.value).toBeNull()
        // And a later action is not refused because of the failed one.
        expect(await busy.run('run-1', async () => 'ok')).toBe('ok')
    })

    it('does not wake a screen that has gone', async () => {
        // Reachable by tapping Delete and immediately going back: the timer
        // would fire into a component that no longer exists.
        const { wrapper, busy } = host()
        const slow = deferred<string>()
        const running = busy.run('run-1', () => slow.promise)

        wrapper.unmount()
        vi.advanceTimersByTime(TALOS_BUSY_DELAY_MS * 2)
        expect(busy.visible.value).toBeNull()

        slow.settle('done')
        await running
    })
})
