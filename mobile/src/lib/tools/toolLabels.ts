/**
 * What a running tool is called, in the user's words.
 *
 * Owner testing 2026-07-26 caught this the first time the web tools ran: the
 * chat showed four identical rows reading `web_read...`, the wire name, four
 * times over. Two failures in one — the label map only knew the original six
 * tools so the new ones fell through to the protocol name, and the activity
 * carried no detail, so there was no way to tell which page was being read.
 *
 * Both are fixed here, and a test asserts every tool the toolset can produce has
 * an entry — the guard has to fail when a tool is ADDED without a label, not
 * when someone remembers to look.
 */
export const TALOS_TOOL_LABELS: Record<string, string> = {
    library_search: 'Searching your Library',
    library_read: 'Reading a document',
    notes_list: 'Looking at your notes',
    tasks_list: 'Looking at your tasks',
    memory_search: 'Checking what it remembers',
    time_now: 'Checking the time',
    web_search: 'Searching the web',
    web_read: 'Reading a web page',
    document_create: 'Making a document',
}

export interface TalosToolActivity {
    name: string
    /** Which page, which query — the part that makes four rows distinguishable. */
    detail: string | null
}

/**
 * The line shown to the user. An unknown tool falls back to its own name rather
 * than to nothing: a mystery row is worse than a technical one.
 */
export function talosToolActivityLabel(activity: TalosToolActivity): string {
    const label = TALOS_TOOL_LABELS[activity.name] ?? activity.name
    return activity.detail ? `${label}: ${activity.detail}` : label
}

/**
 * A short, human detail pulled from the call's arguments.
 *
 * Deliberately narrow: a hostname or a query, never the whole argument object.
 * This ends up on screen while the model is working, and a wall of JSON there is
 * noise — and could leak more of a document's content than the row intends.
 */
export function talosToolActivityDetail(name: string, argumentsJson: string): string | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(argumentsJson || '{}')
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    const input = parsed as Record<string, unknown>

    if (name === 'web_read' || name === 'library_read') {
        const value = input.url ?? input.id
        if (typeof value !== 'string' || value === '') return null
        try {
            // The site is what a person recognises; the full url is noise.
            return new URL(value).hostname.replace(/^www\./, '')
        } catch {
            return value.slice(0, 40)
        }
    }
    const query = input.query
    if (typeof query === 'string' && query.trim() !== '') {
        return query.length > 48 ? `${query.slice(0, 48)}…` : query
    }
    return null
}
