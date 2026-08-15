import { describe, expect, it } from 'vitest'
import {
    archivedChatSessions,
    orderChatSessions,
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

})
