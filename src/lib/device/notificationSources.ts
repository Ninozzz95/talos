/**
 * Le sorgenti vere delle notifiche, sul dispositivo.
 *
 * ⛔ Sottile per scelta: qui non c'è nessuna regola. Le regole — quando si può
 * leggere, cosa si dice se non si può, quale potere serve — stanno in
 * `notificationTools.ts`, dove le legge anche chi non conosce Capacitor.
 */
import { Capacitor } from '@capacitor/core'
import {
    TalosNotificationsBridge,
    talosNotificationReason,
    talosNotificationsStatus,
} from '@/lib/device/notificationsBridge'
import type { TalosNotificationSources } from '@/lib/tools/notificationTools'

export function createTalosNotificationSources(): TalosNotificationSources | null {
    /*
     * ⛔ `null` fuori dal telefono, e il toolset lo rispetta: uno strumento
     * offerto al modello e poi sempre in errore è peggio di uno assente. Il
     * modello lo proverebbe, riferirebbe un fallimento, e la persona penserebbe
     * che TALOS è rotto invece che «qui non c'è un telefono».
     */
    if (!Capacitor.isNativePlatform()) return null

    return {
        status: talosNotificationsStatus,
        async list(limit) {
            return TalosNotificationsBridge.list({ limit })
                .catch(() => ({ ok: false, reason: 'listener-not-connected' }))
        },
        async reply(key, text) {
            return TalosNotificationsBridge.reply({ key, text })
                .catch(() => ({ ok: false, reason: 'reply-failed' }))
        },
        async dismiss(key) {
            return TalosNotificationsBridge.dismiss({ key })
                .catch(() => ({ ok: false, reason: 'dismiss-failed' }))
        },
        reasonOf: talosNotificationReason,
    }
}
