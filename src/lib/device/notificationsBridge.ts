/**
 * Il ponte verso le notifiche del telefono.
 *
 * ⛔ Qui non si decide niente: i permessi li decide la grammatica che c'è già,
 * il consenso lo chiede l'esecutore. Questo file traduce e basta.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

export interface TalosNotificationView {
    readonly key: string
    readonly package: string
    readonly postedAt: number
    readonly title: string | null
    readonly text: string | null
    readonly clearable: boolean
    /** ⭐ Se c'è un campo di risposta: senza, proporre una risposta è inutile. */
    readonly canReply: boolean
}

interface PonteNotifiche {
    status(): Promise<{ granted: boolean, connected: boolean }>
    openSettings(): Promise<{ opened: boolean }>
    list(options: { limit: number }): Promise<{
        ok: boolean
        reason?: string
        notifications?: TalosNotificationView[]
    }>
    reply(options: { key: string, text: string }): Promise<{ ok: boolean, reason?: string }>
    dismiss(options: { key: string }): Promise<{ ok: boolean, reason?: string }>
}

export const TalosNotificationsBridge = registerPlugin<PonteNotifiche>('TalosNotifications')

/**
 * I motivi, scritti come ISTRUZIONI per il modello e non come diagnosi.
 *
 * È la stessa lezione dei tool del telefono: un modello che riceve «non
 * collegato» riprova all'infinito; uno che riceve «dillo alla persona e offri la
 * pagina» fa la cosa utile.
 */
const MOTIVO: Record<string, string> = {
    'not-granted': 'The user has not turned on notification access for TALOS yet. Say so and offer to open the system page. Do not retry.',
    'listener-not-connected': 'Notification access is on but Android has not connected the listener yet — usually a few seconds after granting, or after a restart. Tell the user to try again shortly. Do not retry now.',
    'notification-gone': 'That notification is no longer on screen: it was dismissed or replaced. Do not retry; list again if the user still wants it.',
    'no-reply-field': 'That notification has no reply field — the app that posted it did not offer one. Replying is impossible; say so instead of pretending.',
    'reply-target-gone': 'The app that posted the notification is no longer accepting the reply. Tell the user the message was NOT sent.',
    'reply-failed': 'The reply did not go through. Tell the user it was NOT sent.',
    'not-clearable': 'That notification cannot be dismissed: it belongs to something still running, and hiding it would hide that. Say so.',
    'dismiss-failed': 'The notification could not be dismissed. Tell the user.',
    'missing-argument': 'This is a bug in TALOS, not something the user can fix.',
    'not-on-this-platform': 'There is no phone to read notifications from here.',
}

export function talosNotificationReason(reason: string | undefined): string {
    const noto = MOTIVO[reason ?? '']
    if (noto) return noto
    // ⛔ Stessa regola del ripiego privilegiato: un motivo sconosciuto passa col
    // suo nome, perché un elenco è per forza incompleto.
    const quale = reason ? ` The bridge said: "${reason}".` : ''
    return `Notifications did not work.${quale} Tell the user rather than retrying.`
}

export async function talosNotificationsStatus(): Promise<{
    granted: boolean
    connected: boolean
}> {
    if (!Capacitor.isNativePlatform()) return { granted: false, connected: false }
    return TalosNotificationsBridge.status().catch(() => ({ granted: false, connected: false }))
}
