import { describe, expect, it } from 'vitest'
import { createTalosChatLiveEdge } from '@/composables/useTalosChatLiveEdge'

// F5-#28 — owner device report: while the model streams, every printed
// character forced the view back to the bottom; scrolling up was impossible.
// Contract: the user's gesture ALWAYS wins — an active touch blocks
// auto-scroll outright, any upward user scroll detaches the follow (no 120px
// grace race), and rejoining is explicit (pill or reaching the bottom).

function metrics(scrollTop: number, scrollHeight = 2000, clientHeight = 800) {
    return { scrollTop, scrollHeight, clientHeight }
}

describe('createTalosChatLiveEdge', () => {
    it('follows the live edge by default and keeps following at the bottom', () => {
        const edge = createTalosChatLiveEdge()
        expect(edge.canAutoScroll()).toBe(true)
        edge.onScroll(metrics(1200)) // 2000-1200-800 = 0 → at bottom
        expect(edge.followLive.value).toBe(true)
        expect(edge.showPill.value).toBe(false)
    })

    it('an ACTIVE touch blocks auto-scroll immediately — no distance threshold race', () => {
        const edge = createTalosChatLiveEdge()
        edge.touchStart()
        // Finger down, still at the very bottom: the next token must NOT scroll.
        expect(edge.canAutoScroll()).toBe(false)
        edge.touchEnd()
        expect(edge.canAutoScroll()).toBe(true)
    })

    it('ANY upward user scroll detaches the follow, even a few pixels', () => {
        const edge = createTalosChatLiveEdge()
        edge.onScroll(metrics(1200))
        edge.onScroll(metrics(1190)) // 10px up — far below the old 120px grace
        expect(edge.followLive.value).toBe(false)
        expect(edge.canAutoScroll()).toBe(false)
    })

    it('a programmatic auto-scroll does not count as a user gesture', () => {
        const edge = createTalosChatLiveEdge()
        edge.onScroll(metrics(1200))
        edge.markAutoScroll(1300)
        edge.onScroll(metrics(1300, 2100)) // content grew, we followed
        expect(edge.followLive.value).toBe(true)
    })

    it('shows the pill when detached and far from the bottom, hides it at the edge', () => {
        const edge = createTalosChatLiveEdge()
        edge.onScroll(metrics(1200))
        edge.onScroll(metrics(600)) // scrolled well up
        expect(edge.followLive.value).toBe(false)
        expect(edge.showPill.value).toBe(true)
        edge.onScroll(metrics(1200)) // user returns to the bottom
        expect(edge.followLive.value).toBe(true)
        expect(edge.showPill.value).toBe(false)
    })

    it('rejoin() re-attaches explicitly (the pill tap)', () => {
        const edge = createTalosChatLiveEdge()
        edge.onScroll(metrics(1200))
        edge.onScroll(metrics(400))
        expect(edge.canAutoScroll()).toBe(false)
        edge.rejoin()
        expect(edge.followLive.value).toBe(true)
        expect(edge.canAutoScroll()).toBe(true)
    })

    it('while the finger is down an upward drag detaches even before touchEnd', () => {
        const edge = createTalosChatLiveEdge()
        edge.onScroll(metrics(1200))
        edge.touchStart()
        edge.onScroll(metrics(1150))
        edge.touchEnd()
        expect(edge.followLive.value).toBe(false)
    })
})
