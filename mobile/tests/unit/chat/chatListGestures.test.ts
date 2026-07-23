import { describe, expect, it } from 'vitest'
import {
    archivedChatSessions,
    createSwipeReveal,
    orderChatSessions,
    reorderIds,
    SWIPE_ACTIONS_WIDTH,
} from '@/lib/chatListGestures'

// F4-#23 — swipe-to-reveal actions and hold-to-move ordering on the chat list.

function session(id: string, updatedAt: string, metadata: Record<string, unknown> = {}) {
    return {
        id,
        title: id,
        surface: 'chat',
        mode: 'answer_only',
        persistence_mode: 'persistent',
        active_model_profile_id: null,
        metadata,
        created_at: updatedAt,
        updated_at: updatedAt,
    } as const
}

describe('createSwipeReveal', () => {
    it('follows a horizontal left swipe and snaps open past the threshold', () => {
        const swipe = createSwipeReveal()
        swipe.start(200, 100)
        swipe.move(200 - SWIPE_ACTIONS_WIDTH * 0.75, 104)
        expect(swipe.offset.value).toBeLessThan(0)
        swipe.end()
        expect(swipe.offset.value).toBe(-SWIPE_ACTIONS_WIDTH)
        expect(swipe.open.value).toBe(true)
    })

    it('snaps back closed on a short swipe', () => {
        const swipe = createSwipeReveal()
        swipe.start(200, 100)
        swipe.move(200 - SWIPE_ACTIONS_WIDTH * 0.2, 100)
        swipe.end()
        expect(swipe.offset.value).toBe(0)
        expect(swipe.open.value).toBe(false)
    })

    it('cedes to vertical scrolling when the gesture starts vertical', () => {
        const swipe = createSwipeReveal()
        swipe.start(200, 100)
        swipe.move(196, 140)
        expect(swipe.offset.value).toBe(0)
        swipe.move(120, 160)
        expect(swipe.offset.value).toBe(0)
        swipe.end()
        expect(swipe.open.value).toBe(false)
    })

    it('flags a horizontal gesture exactly once so the trailing click can be swallowed', () => {
        const swipe = createSwipeReveal()
        swipe.start(200, 100)
        swipe.move(200 - SWIPE_ACTIONS_WIDTH, 100)
        swipe.end()
        expect(swipe.consumeGesture()).toBe(true)
        expect(swipe.consumeGesture()).toBe(false)

        swipe.start(50, 50)
        swipe.end()
        expect(swipe.consumeGesture()).toBe(false)
    })

    it('SF-2: a new pointer-down clears a stale gesture flag (touch fires no trailing click)', () => {
        const swipe = createSwipeReveal()
        swipe.start(200, 100)
        swipe.move(200 - SWIPE_ACTIONS_WIDTH, 100)
        swipe.end()
        // Touch never delivered the click, so nothing consumed the flag.
        swipe.start(210, 100)
        expect(swipe.consumeGesture()).toBe(false)
        swipe.end()
    })

    it('closes an open row with a right swipe', () => {
        const swipe = createSwipeReveal()
        swipe.start(200, 100)
        swipe.move(200 - SWIPE_ACTIONS_WIDTH, 100)
        swipe.end()
        expect(swipe.open.value).toBe(true)
        swipe.start(100, 100)
        swipe.move(100 + SWIPE_ACTIONS_WIDTH * 0.6, 100)
        swipe.end()
        expect(swipe.open.value).toBe(false)
        expect(swipe.offset.value).toBe(0)
    })
})

describe('chat list ordering', () => {
    it('splits archived sessions out of the active list', () => {
        const sessions = [
            session('a', '2026-07-23T10:00:00.000Z'),
            session('b', '2026-07-23T09:00:00.000Z', { archived: true }),
            session('c', '2026-07-23T08:00:00.000Z'),
        ]
        expect(orderChatSessions(sessions).map((entry) => entry.id)).toEqual(['a', 'c'])
        expect(archivedChatSessions(sessions).map((entry) => entry.id)).toEqual(['b'])
    })

    it('orders un-indexed sessions first by recency, then indexed ones by sort_index', () => {
        const sessions = [
            session('indexed-late', '2026-07-23T02:00:00.000Z', { sort_index: 1 }),
            session('fresh', '2026-07-23T12:00:00.000Z'),
            session('indexed-first', '2026-07-23T01:00:00.000Z', { sort_index: 0 }),
            session('older-fresh', '2026-07-23T11:00:00.000Z'),
        ]
        expect(orderChatSessions(sessions).map((entry) => entry.id))
            .toEqual(['fresh', 'older-fresh', 'indexed-first', 'indexed-late'])
    })

    it('reorders ids by moving one entry from one position to another', () => {
        expect(reorderIds(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
        expect(reorderIds(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
        expect(reorderIds(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    })
})
