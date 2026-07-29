import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { talosLogDeviceIssue } from '@/lib/talosDeviceLog'

/**
 * R1-3 — resume re-lock. The F2 app lock armed only at cold start, but
 * Android keeps the app resident for days: handing the tablet to someone
 * opened TALOS straight into the chats. This listener re-arms the lock when
 * the app returns from a background stay longer than the grace window.
 * Fail-safe: an enablement check that throws means "do not lock" (the flag
 * path is fail-open by design — a dangling flag must never brick the app),
 * but every failure is ring-logged for the Doctor.
 */
export interface TalosResumeRelockOptions {
    /** Minimum background stay before a relock (default 5min, see below). */
    graceMs?: number
    /** The lock applies only when the flag AND a real PIN record exist. */
    isEnabled(): Promise<boolean> | boolean
    onRelock(): void
    /** Test seam. */
    now?(): number
}

export interface TalosResumeRelockController {
    dispose(): Promise<void>
}

// Web-research correction (ledger R1-R3 §ricerca 2): Android fraud-prevention
// guidance suggests ~15min with 1/5/15 presets; 30s frictioned every app
// switch. 5min default; user presets in Settings = backlog ticket.
const DEFAULT_GRACE_MS = 5 * 60_000

export function registerTalosResumeRelock(options: TalosResumeRelockOptions): TalosResumeRelockController {
    const graceMs = options.graceMs ?? DEFAULT_GRACE_MS
    const now = options.now ?? Date.now
    let hiddenAt: number | null = null
    let handle: PluginListenerHandle | null = null
    let disposed = false

    const registration = App.addListener('appStateChange', (state: { isActive: boolean }) => {
        if (disposed) return
        if (!state.isActive) {
            // Debt S2 note: this fires at onStop, i.e. AFTER the task snapshot
            // is taken — a JS-side curtain here would be theatre. The snapshot
            // is closed by FLAG_SECURE (see services/privacyScreen.ts).
            hiddenAt = now()
            return
        }
        // Resume: relock only after a REAL background stay beyond the grace
        // window — a cold-start active signal (hiddenAt null) stays inert.
        const stay = hiddenAt === null ? null : now() - hiddenAt
        hiddenAt = null
        if (stay === null || stay < graceMs) return
        void Promise.resolve()
            .then(() => options.isEnabled())
            .then((enabled) => {
                if (enabled && !disposed) options.onRelock()
            })
            .catch((error) => {
                talosLogDeviceIssue('TALOS_RESUME_RELOCK', String(error))
            })
    })

    registration.then(
        (registered) => { handle = registered },
        (error) => { talosLogDeviceIssue('TALOS_RESUME_RELOCK_REGISTER', String(error)) },
    )

    return {
        async dispose() {
            disposed = true
            try {
                const registered = handle ?? (await registration)
                await registered.remove()
            } catch {
                // Registration never produced a handle; nothing to remove.
            }
        },
    }
}
