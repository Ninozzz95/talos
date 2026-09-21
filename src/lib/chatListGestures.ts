import type { TalosLocalChatSession } from '@/repositories/chatRepository'

/**
 * F4-#23 / F5.1 — chat-list model helpers: archive flag + manual sort_index
 * in session metadata (row actions live in the tap-and-hold dropdown now).
 */
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

