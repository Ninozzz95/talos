import { describe, expect, it } from 'vitest'
import {
    TALOS_NOTIFICATION_FEED_LIMIT,
    talosAppendNotification,
    talosMarkNotificationsRead,
    talosRouteNotification,
    talosUnreadCount,
    type TalosNotificationEntry,
    type TalosNotificationEvent,
} from '@/lib/notifications/notificationCentre'

function evento(patch: Partial<TalosNotificationEvent> = {}): TalosNotificationEvent {
    return {
        key: 'transfer:qwen',
        channel: 'transfers',
        weight: 'notable',
        title: 'Qwen3-4B',
        at: 1,
        ...patch,
    }
}

/**
 * C45-RED-19K — il centro notifiche: un evento, tre superfici.
 *
 * Owner 2026-08-06: «ogni funzione, tool, download, installazione deve avere
 * notifica toast E Android».
 *
 * La ricerca però è netta sull'altro lato: i toast vanno tenuti rari abbastanza
 * da significare qualcosa. Le due cose non sono in contraddizione se si smette
 * di trattare le tre superfici come una sola — ed è esattamente ciò che queste
 * prove fissano.
 */
describe('C45-RED-19K notification routing', () => {
    /** La promessa: nessuna azione resta senza traccia. */
    it('always writes to the feed, whatever the weight or the context', () => {
        for (const weight of ['log', 'away', 'notable', 'demanding'] as const) {
            for (const appVisible of [true, false]) {
                expect(talosRouteNotification(evento({ weight }), { appVisible }).feed).toBe(true)
            }
        }
    })

    it('shows a toast only when the app is in front AND the event interrupts', () => {
        expect(talosRouteNotification(evento(), { appVisible: true }).toast).toBe(true)
        // In background nessuno lo vedrebbe.
        expect(talosRouteNotification(evento(), { appVisible: false }).toast).toBe(false)
        // Un evento da solo registro non interrompe nemmeno in primo piano: è
        // ciò che tiene i toast rari abbastanza da contare.
        expect(talosRouteNotification(evento({ weight: 'log' }), { appVisible: true }).toast).toBe(false)
    })

    it('posts to Android when you are away, not when it just happened under your eyes', () => {
        expect(talosRouteNotification(evento(), { appVisible: false }).android).toBe(true)
        expect(talosRouteNotification(evento(), { appVisible: true }).android).toBe(false)
    })

    /**
     * Qualcosa che aspetta una decisione si vede comunque: se resta solo nel
     * registro, il lavoro si ferma e nessuno sa perché.
     */
    it('a demanding event reaches Android even with the app in front', () => {
        const rotta = talosRouteNotification(evento({ weight: 'demanding' }), { appVisible: true })
        expect(rotta).toMatchObject({ feed: true, toast: true, android: true })
    })

    /**
     * Il buco trovato dal caso reale: la risposta di una chat.
     *
     * Se sei davanti la stai già leggendo, e un toast che annuncia una risposta
     * mentre la risposta ti scorre sotto gli occhi è rumore puro. Se hai chiuso
     * l'app, è l'unica cosa che ti fa sapere che è finita.
     */
    it('an away event never toasts, and only leaves the app when you are gone', () => {
        expect(talosRouteNotification(evento({ weight: 'away' }), { appVisible: true }))
            .toMatchObject({ feed: true, toast: false, android: false })
        expect(talosRouteNotification(evento({ weight: 'away' }), { appVisible: false }))
            .toMatchObject({ feed: true, toast: false, android: true })
    })

    it('a log-only event stays in the feed alone', () => {
        expect(talosRouteNotification(evento({ weight: 'log' }), { appVisible: false }))
            .toMatchObject({ feed: true, toast: false, android: false })
    })
})

describe('C45-RED-19K notification feed', () => {
    it('puts the newest first', () => {
        const feed = talosAppendNotification(
            talosAppendNotification([], evento({ key: 'a', title: 'Prima' })),
            evento({ key: 'b', title: 'Seconda' }),
        )
        expect(feed.map((voce) => voce.title)).toEqual(['Seconda', 'Prima'])
    })

    /**
     * Il caso che rende il registro leggibile: un download riferisce dieci
     * volte, e resta UNA riga. Accodandole, la voce che conta finisce fuori
     * schermo proprio quando c'è qualcosa da leggere.
     */
    it('collapses repeats of the same thing instead of stacking them', () => {
        let feed: TalosNotificationEntry[] = []
        for (let giro = 0; giro < 10; giro += 1) {
            feed = talosAppendNotification(feed, evento({ at: giro, body: `${giro * 10}%` }))
        }
        expect(feed).toHaveLength(1)
        expect(feed[0]).toMatchObject({ repeats: 10, body: '90%' })
    })

    /** Aggiornata vuol dire cambiata: risale in cima e torna non letta. */
    it('an updated entry comes back to the top and unread', () => {
        let feed = talosAppendNotification([], evento({ key: 'vecchia' }))
        feed = talosMarkNotificationsRead(feed)
        feed = talosAppendNotification(feed, evento({ key: 'altra', title: 'Altra' }))
        expect(feed[0].key).toBe('altra')

        feed = talosAppendNotification(feed, evento({ key: 'vecchia', body: 'finito' }))
        expect(feed[0]).toMatchObject({ key: 'vecchia', read: false })
    })

    it('forgets the oldest instead of growing without end', () => {
        let feed: TalosNotificationEntry[] = []
        for (let giro = 0; giro < TALOS_NOTIFICATION_FEED_LIMIT + 25; giro += 1) {
            feed = talosAppendNotification(feed, evento({ key: `k${giro}`, at: giro }))
        }
        expect(feed).toHaveLength(TALOS_NOTIFICATION_FEED_LIMIT)
        expect(feed[0].key).toBe(`k${TALOS_NOTIFICATION_FEED_LIMIT + 24}`)
    })

    it('counts what still wants attention, and lets you clear it', () => {
        let feed = talosAppendNotification(talosAppendNotification([], evento({ key: 'a' })), evento({ key: 'b' }))
        expect(talosUnreadCount(feed)).toBe(2)

        feed = talosMarkNotificationsRead(feed, 'a')
        expect(talosUnreadCount(feed)).toBe(1)

        feed = talosMarkNotificationsRead(feed)
        expect(talosUnreadCount(feed)).toBe(0)
    })
})
