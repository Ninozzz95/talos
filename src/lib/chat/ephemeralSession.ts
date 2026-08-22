/**
 * What makes a chat temporary: its own id.
 *
 * The alternative was a registry — a set of ids somewhere that says which
 * sessions are temporary. That set has to be written before the session is
 * created and it has to survive everywhere the id travels, and the day the two
 * fall out of step a chat the user was told would not be kept is written to
 * disk. There is no version of that failure the user finds out about.
 *
 * So the mark is IN the id. `talosIsEphemeralSessionId` is a pure function of a
 * string: no lookup, no ordering, nothing to keep in sync. Any code that holds
 * an id can answer the question, including code written later by someone who
 * never read this file.
 *
 * The prefix satisfies TALOS_ID_PATTERN (it starts with a letter and uses only
 * permitted characters), so a temporary id is a perfectly ordinary id
 * everywhere else — it is only the router that treats it differently.
 */
export const TALOS_EPHEMERAL_SESSION_PREFIX = 'tmp-'

export function talosIsEphemeralSessionId(sessionId: string): boolean {
    return sessionId.startsWith(TALOS_EPHEMERAL_SESSION_PREFIX)
}

/**
 * Mark an id as temporary. Idempotent, so marking twice cannot produce
 * `tmp-tmp-…` — an id that would still be recognised, but would stop matching
 * the one the caller holds.
 */
export function talosEphemeralSessionId(sessionId: string): string {
    return talosIsEphemeralSessionId(sessionId)
        ? sessionId
        : `${TALOS_EPHEMERAL_SESSION_PREFIX}${sessionId}`
}
