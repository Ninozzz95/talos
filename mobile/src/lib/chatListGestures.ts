import { ref, type Ref } from 'vue'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'

/**
 * F4-#23 — chat-list gestures. `createSwipeReveal` is the pure state machine
 * behind swipe-to-reveal row actions: it follows a horizontal left swipe,
 * snaps open/closed at half the action-tray width, and cedes to vertical
 * scrolling as soon as the gesture starts vertical. The ordering helpers keep
 * the list model (archive flag + manual sort_index in session metadata) in
 * one place shared by UI and tests.
 */
export const SWIPE_ACTIONS_WIDTH = 144

const DIRECTION_LOCK_DISTANCE = 12

type SwipeAxis = 'undecided' | 'horizontal' | 'vertical'

export interface TalosSwipeReveal {
    offset: Ref<number>
    open: Ref<boolean>
    swiping: Ref<boolean>
    start(x: number, y: number): void
    move(x: number, y: number): void
    end(): void
    close(): void
    /** True exactly once after a horizontal gesture — swallow the trailing click. */
    consumeGesture(): boolean
}

export function createSwipeReveal(): TalosSwipeReveal {
    const offset = ref(0)
    const open = ref(false)
    const swiping = ref(false)
    let originX = 0
    let originY = 0
    let axis: SwipeAxis = 'undecided'
    let gestured = false

    function start(x: number, y: number): void {
        originX = x
        originY = y
        axis = 'undecided'
        // Touch input fires NO trailing click after a pan — a stale flag from
        // the previous gesture must never eat the next genuine tap (SF-2).
        gestured = false
        swiping.value = true
    }

    function move(x: number, y: number): void {
        if (!swiping.value) return
        const deltaX = x - originX
        const deltaY = y - originY
        if (axis === 'undecided') {
            if (Math.abs(deltaX) < DIRECTION_LOCK_DISTANCE && Math.abs(deltaY) < DIRECTION_LOCK_DISTANCE) return
            axis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'horizontal' : 'vertical'
        }
        if (axis === 'vertical') return
        const base = open.value ? -SWIPE_ACTIONS_WIDTH : 0
        offset.value = Math.min(0, Math.max(-SWIPE_ACTIONS_WIDTH, base + deltaX))
    }

    function end(): void {
        if (!swiping.value) return
        swiping.value = false
        if (axis !== 'horizontal') {
            offset.value = open.value ? -SWIPE_ACTIONS_WIDTH : 0
            return
        }
        gestured = true
        open.value = offset.value <= -SWIPE_ACTIONS_WIDTH / 2
        offset.value = open.value ? -SWIPE_ACTIONS_WIDTH : 0
    }

    function close(): void {
        swiping.value = false
        open.value = false
        offset.value = 0
    }

    function consumeGesture(): boolean {
        const value = gestured
        gestured = false
        return value
    }

    return { offset, open, swiping, start, move, end, close, consumeGesture }
}

function sortIndexOf(session: TalosLocalChatSession): number | null {
    const value = session.metadata.sort_index
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function isArchivedChatSession(session: TalosLocalChatSession): boolean {
    return session.metadata.archived === true
}

/** Active list: un-indexed sessions first (fresh on top), then manual order. */
export function orderChatSessions(sessions: readonly TalosLocalChatSession[]): TalosLocalChatSession[] {
    const active = sessions.filter((session) => !isArchivedChatSession(session))
    const unindexed = active
        .filter((session) => sortIndexOf(session) === null)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    const indexed = active
        .filter((session) => sortIndexOf(session) !== null)
        .sort((left, right) => (sortIndexOf(left) ?? 0) - (sortIndexOf(right) ?? 0))
    return [...unindexed, ...indexed]
}

export function archivedChatSessions(sessions: readonly TalosLocalChatSession[]): TalosLocalChatSession[] {
    return sessions
        .filter(isArchivedChatSession)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

/** Move one id from index `from` to index `to`, leaving the rest stable. */
export function reorderIds(ids: readonly string[], from: number, to: number): string[] {
    if (from === to || from < 0 || from >= ids.length || to < 0 || to >= ids.length) return [...ids]
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
}
