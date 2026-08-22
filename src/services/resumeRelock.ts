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
    /**
     * True when the DEVICE took the app away — screen off or keyguard engaged —
     * rather than the user switching to another app.
     *
     * Owner 2026-07-29: locking the phone has to lock TALOS, immediately. The
     * grace window below exists so that glancing at a notification does not
     * cost a PIN, and that is worth keeping; but locking the screen is the user
     * securing the device, and it deserves no window at all.
     *
     * Optional, and absent on web: without it the grace window is the only
     * behaviour, exactly as before.
     */
    isDeviceLocked?(): Promise<boolean> | boolean
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
    /**
     * Which background episode we are in. The device-lock probe is async, so a
     * screen locked and unlocked quickly can have it answer "locked" AFTER the
     * app is back in the user's hands — a PIN pad for a lock that is already
     * over. The token makes a late answer belong to an episode that has ended,
     * and an episode that has ended cannot lock anything.
     */
    let episode = 0

    const registration = App.addListener('appStateChange', (state: { isActive: boolean }) => {
        if (disposed) return
        if (!state.isActive) {
            // Debt S2 note: this fires at onStop, i.e. AFTER the task snapshot
            // is taken — a JS-side curtain here would be theatre. The snapshot
            // is closed by FLAG_SECURE (see services/privacyScreen.ts).
            hiddenAt = now()
            // Owner 2026-07-29: if the DEVICE was locked, lock now — do not wait
            // for a resume and do not wait out the grace window. The old path
            // left TALOS unlocked in memory with the chats still on screen
            // behind the keyguard, so whoever opened the phone within the window
            // walked straight into them. Locking here means the PIN screen is
            // already painted underneath, and the content never reappears even
            // for a frame.
            //
            // A failed probe deliberately does NOT lock: making it fail-closed
            // would turn every glance at a notification into a PIN prompt on any
            // device where the check is unavailable. The grace window below
            // remains the safety net, and the failure is logged.
            const token = ++episode
            const stillHidden = () => !disposed && token === episode && hiddenAt !== null
            void Promise.resolve()
                .then(() => options.isDeviceLocked?.() ?? false)
                .then((deviceLocked) => {
                    if (!deviceLocked || !stillHidden()) return undefined
                    return Promise.resolve(options.isEnabled()).then((enabled) => {
                        if (!enabled || !stillHidden()) return
                        // Consume the stay so the resume path cannot lock twice.
                        hiddenAt = null
                        options.onRelock()
                    })
                })
                .catch((error) => {
                    talosLogDeviceIssue('TALOS_SCREEN_LOCK_RELOCK', String(error))
                })
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
