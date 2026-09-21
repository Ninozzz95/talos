/**
 * Describe a value's SHAPE without carrying any of its content.
 *
 * Owner 2026-07-30: "dobbiamo fare in modo di prevedere ogni possibile errore e
 * metterlo nel doctor automaticamente". Predicting them is not achievable —
 * a list of known failures ages exactly where it matters, at the one nobody
 * has seen yet. Making each failure describe ITSELF is achievable, and this is
 * the piece that makes it safe.
 *
 * His Doctor export said `4 sends failed` and `issues: []`. The reason each had
 * failed was discarded before it could be recorded, so the report that exists
 * to settle the question could not answer it.
 *
 * The invariant is: keys and types travel, values never do. That is what lets
 * the capture stay on permanently for every user instead of hiding behind a
 * debug switch nobody turns on before they have the problem — and it is why
 * these bounds are here rather than in a comment: a hostile or enormous payload
 * must not be able to turn a diagnostic into a leak or a hang.
 */

const MAX_DEPTH = 4
const MAX_KEYS = 12
const MAX_KEY_LENGTH = 24
const MAX_LENGTH = 400

/**
 * A key can carry content — an error object keyed by the text that failed
 * validation, say. Keys are the one route by which a value can escape through a
 * shape, so they are truncated like everything else.
 */
function safeKey(key: string): string {
    return key.length > MAX_KEY_LENGTH ? `${key.slice(0, MAX_KEY_LENGTH)}…` : key
}

function describe(value: unknown, depth: number, seen: Set<object>): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value !== 'object') return typeof value

    if (seen.has(value as object)) return 'circular'
    if (depth >= MAX_DEPTH) return '…'

    const next = new Set(seen)
    next.add(value as object)

    if (Array.isArray(value)) {
        if (value.length === 0) return '[]'
        // One element stands for the array: a hundred more would say nothing new
        // and would carry a hundred more chances to leak.
        return `[${value.length}×${describe(value[0], depth + 1, next)}]`
    }

    const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
    const shown = entries.slice(0, MAX_KEYS)
    const body = shown
        .map(([key, entry]) => `${safeKey(key)}:${describe(entry, depth + 1, next)}`)
        .join(', ')
    const elided = entries.length > shown.length ? `${body ? ', ' : ''}…` : ''
    return `{${body}${elided}}`
}

/** Bounded, content-free description of any value. */
export function talosDescribeShape(value: unknown): string {
    const described = describe(value, 0, new Set())
    return described.length > MAX_LENGTH
        ? `${described.slice(0, MAX_LENGTH - 1)}…`
        : described
}

export interface TalosSchemaIssue {
    /**
     * Zod types this `PropertyKey[]`, so a symbol can appear. A symbol's
     * description is author-supplied text, so it is reported as its type rather
     * than printed — the same rule as everything else here.
     */
    readonly path: ReadonlyArray<PropertyKey>
    readonly code: string
    /** Present on Zod issues, deliberately NOT used: it can quote the value. */
    readonly message?: string
}

function pathSegment(segment: PropertyKey): string {
    return typeof segment === 'symbol' ? 'symbol' : String(segment)
}

const MAX_ISSUES_LENGTH = 300

/**
 * The other half of the diagnosis: what the schema WANTED, which the validator
 * already knew and the code was throwing away.
 *
 * Only the path and the rule travel. A validator message can quote the value
 * that broke it — "Expected string, received 42" — so it never leaves.
 */
export function talosDescribeSchemaIssues(issues: readonly TalosSchemaIssue[]): string {
    if (issues.length === 0) return 'none'
    const parts: string[] = []
    let length = 0
    for (const issue of issues) {
        const path = issue.path.length > 0
            ? issue.path.map(pathSegment).join('.')
            : '(root)'
        const part = `${safeKey(path)}:${issue.code}`
        if (length + part.length + 2 > MAX_ISSUES_LENGTH - 1) {
            parts.push('…')
            break
        }
        parts.push(part)
        length += part.length + 2
    }
    return parts.join(', ')
}
