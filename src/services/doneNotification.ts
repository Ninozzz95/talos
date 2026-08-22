import { registerPlugin } from '@capacitor/core'

/**
 * "It finished" — the JavaScript end.
 *
 * A research takes minutes. The person starts it, locks the phone, and today
 * nothing whatsoever tells them it is over: they have to come back and look,
 * which means in practice they sit and watch it, which means the background
 * work we built is worth nothing. The visual research of 2026-08-03 (§2.8)
 * found Gemini and OpenAI both notify, and that tapping it must open the page
 * of THAT job rather than a generic chat.
 *
 * Everything here degrades to a no-op. On the web build, and on a device that
 * refuses the permission, the work must still run — losing the announcement is
 * a cost, losing the research would be a bug.
 */
interface TalosDonePlugin {
    notifyDone(options: { id?: number, title: string, text: string, route?: string }): Promise<void>
    /** The route the app was OPENED with, once. Null on every later call. */
    takeRoute(): Promise<{ route: string | null }>
    addListener(event: 'route', handler: (payload: { route: string }) => void): Promise<{ remove(): Promise<void> }>
}

const plugin = registerPlugin<TalosDonePlugin>('TalosDone')

/** Matches `TalosDoneNotification` — one id per kind, so they do not replace each other. */
export const TALOS_DONE_RESEARCH_ID = 4801
export const TALOS_DONE_TRANSFER_ID = 4802

export interface TalosDoneNotice {
    readonly id: number
    readonly title: string
    readonly text: string
    readonly route: string
}

export async function talosNotifyDone(notice: TalosDoneNotice): Promise<void> {
    try {
        await plugin.notifyDone(notice)
    } catch {
        // No plugin, no permission, no notification. The work is unaffected.
    }
}

export async function talosTakeLaunchRoute(): Promise<string | null> {
    try {
        return (await plugin.takeRoute()).route
    } catch {
        return null
    }
}

/** Tapped while the app was already running. Returns an unsubscribe. */
export function talosOnNotificationRoute(handler: (route: string) => void): () => void {
    let stop: (() => void) | null = null
    let dropped = false
    void plugin.addListener('route', ({ route }) => handler(route))
        .then((handle) => {
            if (dropped) { void handle.remove(); return }
            stop = () => { void handle.remove() }
        })
        .catch(() => undefined)
    return () => {
        dropped = true
        stop?.()
    }
}
