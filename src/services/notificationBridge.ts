import { Capacitor, registerPlugin } from '@capacitor/core'
import type { TalosNotificationEvent } from '@/lib/notifications/notificationCentre'

/**
 * Il ponte fra il registro dentro l'app e le notifiche di sistema.
 *
 * ## Perché sta qui e non nello store
 *
 * Perché lo store non deve importare né i toast né questo: sarebbe il modo di
 * far entrare mezzo mondo nel grafo d'avvio, e in questo progetto è già costato
 * il tetto una volta. Lo store espone un innesto, e chi possiede la superficie
 * lo collega — questo file è chi possiede la superficie di sistema.
 *
 * ## Sul web non fa niente, e lo dice
 *
 * Non c'è un sistema di notifiche da chiamare, e inventarne uno con l'API del
 * browser sarebbe una terza grammatica per la stessa cosa. Il registro dentro
 * l'app continua a funzionare: è l'unica delle tre superfici che non ha bisogno
 * di un sistema operativo sotto.
 */

interface TalosNotificationCentrePlugin {
    post(options: {
        channel: string
        key: string
        title: string
        body?: string
        /** Dove atterrare toccandola. Vuoto = apre e basta. */
        route?: string
    }): Promise<void>
    cancel(options: { key: string }): Promise<void>
    permitted(): Promise<{ permitted: boolean }>
}

const plugin = registerPlugin<TalosNotificationCentrePlugin>('TalosNotificationCentre')

/**
 * Dove atterra il tocco, per canale.
 *
 * Scritto qui e non nell'evento perché è una proprietà del TIPO di notizia, non
 * della singola: ogni download apre il centro download, ogni risposta apre la
 * chat. Metterlo su ogni evento vorrebbe dire ricordarselo ogni volta, e
 * dimenticarlo una volta sola basta a produrre la notifica che ti lascia in un
 * posto da cui devi navigare via — attenzione spesa senza restituire niente.
 */
const ROTTE: Record<string, string> = {
    transfers: '/settings/models/local',
    chat: '/',
    jobs: '/research',
    attention: '/',
}

/** Se il sistema ci lascia notificare: da Android 13 è un permesso vero. */
export async function talosNotificationsPermitted(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    try {
        return (await plugin.permitted()).permitted
    } catch {
        return false
    }
}

/**
 * Posta un evento come notifica di sistema.
 *
 * Non solleva mai: chi chiama è il registro, e un ponte che esplode fermerebbe
 * anche la voce nel registro e il toast — cioè si perderebbero tre superfici per
 * il guasto di una. Il guasto si ingoia QUI, dove è di casa.
 */
export async function talosPostSystemNotification(event: TalosNotificationEvent): Promise<void> {
    if (!Capacitor.isNativePlatform()) return
    try {
        await plugin.post({
            channel: event.channel,
            key: event.key,
            title: event.title,
            body: event.body ?? '',
            route: ROTTE[event.channel] ?? '',
        })
    } catch {
        // Il registro dentro l'app ha già la voce: la notizia non è persa,
        // è solo rimasta dentro.
    }
}

/** Toglie la notifica quando la cosa non è più vera. */
export async function talosCancelSystemNotification(key: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return
    try {
        await plugin.cancel({ key })
    } catch { /* niente da togliere è l'esito che si voleva */ }
}
