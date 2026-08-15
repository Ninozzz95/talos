/**
 * F5.1 — in-app device issue log: a tiny ring buffer every guarded failure
 * path reports into, surfaced in the Doctor station. This is the evidence
 * channel for device-only hangs no test harness can see.
 */
export interface TalosDeviceIssue {
    at: string
    tag: string
    detail: string
    /**
     * How many times this exact failure repeated in a row; 1 for a single one.
     *
     * A failure inside a retry loop used to fill all fifty slots with copies of
     * itself and evict everything before it — including the entry that
     * explained how the loop began. Counting the repeat keeps both.
     */
    count: number
}

const RING_SIZE = 50
/**
 * Sized for a real diagnosis rather than a one-line note.
 *
 * At 300 the shape of what arrived AND what the schema wanted both land cut in
 * half, and the half that goes missing is the one that would have said why.
 * Fifty entries at this size is tens of kilobytes in a report the owner pastes
 * back — which is exactly what the report is for.
 */
const MAX_DETAIL = 1000
const issues: TalosDeviceIssue[] = []

export function talosLogDeviceIssue(tag: string, detail: string): void {
    const trimmed = detail.slice(0, MAX_DETAIL)
    const newest = issues[issues.length - 1]
    if (newest && newest.tag === tag && newest.detail === trimmed) {
        newest.count += 1
        newest.at = new Date().toISOString()
        return
    }
    issues.push({ at: new Date().toISOString(), tag, detail: trimmed, count: 1 })
    if (issues.length > RING_SIZE) issues.splice(0, issues.length - RING_SIZE)
}

export function talosDeviceIssues(): readonly TalosDeviceIssue[] {
    return [...issues].reverse()
}

/** Tests need a clean ring. Nothing in the app may reach for this. */
export function __resetTalosDeviceLogForTests(): void {
    issues.length = 0
}

/** Fence for promises that may NEVER settle on device (native bridge). */
export function talosWithTimeout<T>(promise: Promise<T>, ms: number, tag: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            talosLogDeviceIssue(tag, `timed out after ${ms}ms`)
            reject(new Error(`${tag}_TIMEOUT`))
        }, ms)
        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (error) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))) },
        )
    })
}
