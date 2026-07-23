/**
 * F5.1 — in-app device issue log: a tiny ring buffer every guarded failure
 * path reports into, surfaced in the Doctor station. This is the evidence
 * channel for device-only hangs no test harness can see.
 */
export interface TalosDeviceIssue {
    at: string
    tag: string
    detail: string
}

const RING_SIZE = 50
const issues: TalosDeviceIssue[] = []

export function talosLogDeviceIssue(tag: string, detail: string): void {
    issues.push({ at: new Date().toISOString(), tag, detail: detail.slice(0, 300) })
    if (issues.length > RING_SIZE) issues.splice(0, issues.length - RING_SIZE)
}

export function talosDeviceIssues(): readonly TalosDeviceIssue[] {
    return [...issues].reverse()
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
