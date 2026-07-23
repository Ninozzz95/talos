import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTalosMobileToasts, __resetToastsForTests } from '@/stores/toasts'

// F3-T4 — calm toast infrastructure: push/dismiss, optional action, auto-expire.
beforeEach(() => {
    __resetToastsForTests()
    vi.useRealTimers()
})

describe('useTalosMobileToasts (F3-T4)', () => {
    it('pushes a toast and dismisses it by id', () => {
        const toasts = useTalosMobileToasts()
        const id = toasts.push({ message: 'Saved.' })
        expect(toasts.items.value).toHaveLength(1)
        toasts.dismiss(id)
        expect(toasts.items.value).toHaveLength(0)
    })

    it('runs the action then dismisses', () => {
        const toasts = useTalosMobileToasts()
        const action = vi.fn()
        const id = toasts.push({ message: 'Tone suggestion', action: { label: 'Switch', run: action } })
        toasts.act(id)
        expect(action).toHaveBeenCalledOnce()
        expect(toasts.items.value).toHaveLength(0)
    })

    it('auto-expires after the given duration', () => {
        vi.useFakeTimers()
        const toasts = useTalosMobileToasts()
        toasts.push({ message: 'Ephemeral', durationMs: 4000 })
        expect(toasts.items.value).toHaveLength(1)
        vi.advanceTimersByTime(4100)
        expect(toasts.items.value).toHaveLength(0)
    })

    it('a toast without duration stays until dismissed', () => {
        vi.useFakeTimers()
        const toasts = useTalosMobileToasts()
        toasts.push({ message: 'Sticky' })
        vi.advanceTimersByTime(60000)
        expect(toasts.items.value).toHaveLength(1)
    })
})
