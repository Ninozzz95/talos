import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    talosMarkNotificationsSeen,
    talosNotifications,
    talosNotify,
    talosOnNotificationAndroid,
    talosOnNotificationToast,
    talosResetNotificationCentre,
    talosSetAppVisible,
} from '@/stores/notificationCentre'

afterEach(() => { talosResetNotificationCentre() })

function evento(patch: Record<string, unknown> = {}) {
    return {
        key: 'transfer:qwen',
        channel: 'transfers' as const,
        weight: 'notable' as const,
        title: 'Qwen3-4B',
        at: 1,
        ...patch,
    }
}

/**
 * C45-RED-19L — la porta sola, e le superfici che si iniettano.
 *
 * Il modo in cui metà delle azioni sono finite senza avviso è che ognuna
 * decideva per conto suo. Queste prove guardano che la decisione sia una, e che
 * il guasto di una superficie non porti giù le altre.
 */
describe('C45-RED-19L notification store', () => {
    it('always records, and toasts only with the app in front', () => {
        const toast = vi.fn()
        talosOnNotificationToast(toast)
        talosSetAppVisible(true)

        talosNotify(evento())

        expect(talosNotifications.entries).toHaveLength(1)
        expect(talosNotifications.unread).toBe(1)
        expect(toast).toHaveBeenCalledTimes(1)
    })

    it('goes to Android instead of a toast when you are away', () => {
        const toast = vi.fn()
        const android = vi.fn()
        talosOnNotificationToast(toast)
        talosOnNotificationAndroid(android)
        talosSetAppVisible(false)

        talosNotify(evento())

        expect(toast).not.toHaveBeenCalled()
        expect(android).toHaveBeenCalledTimes(1)
    })

    /**
     * Il caso della chat: se sei davanti la stai già leggendo, e un toast
     * sarebbe rumore. Fuori è l'unica cosa che te lo dice.
     */
    it('an away event never toasts, in front or not', () => {
        const toast = vi.fn()
        const android = vi.fn()
        talosOnNotificationToast(toast)
        talosOnNotificationAndroid(android)

        talosSetAppVisible(true)
        talosNotify(evento({ key: 'chat:1', channel: 'chat', weight: 'away' }))
        expect(toast).not.toHaveBeenCalled()
        expect(android).not.toHaveBeenCalled()

        talosSetAppVisible(false)
        talosNotify(evento({ key: 'chat:2', channel: 'chat', weight: 'away' }))
        expect(toast).not.toHaveBeenCalled()
        expect(android).toHaveBeenCalledTimes(1)
    })

    /**
     * Una notifica persa in silenzio è peggio di una che non si può postare:
     * se il ponte esplode, il registro e il toast devono restare in piedi.
     */
    it('one surface failing does not take the others down', () => {
        const toast = vi.fn()
        talosOnNotificationToast(toast)
        talosOnNotificationAndroid(() => { throw new Error('ponte rotto') })
        talosSetAppVisible(false)

        expect(() => talosNotify(evento())).not.toThrow()
        expect(talosNotifications.entries).toHaveLength(1)

        talosSetAppVisible(true)
        talosNotify(evento({ key: 'altra' }))
        expect(toast).toHaveBeenCalledTimes(1)
    })

    it('«ho visto» clears the count', () => {
        talosNotify(evento({ key: 'a' }))
        talosNotify(evento({ key: 'b' }))
        expect(talosNotifications.unread).toBe(2)

        talosMarkNotificationsSeen('a')
        expect(talosNotifications.unread).toBe(1)

        talosMarkNotificationsSeen()
        expect(talosNotifications.unread).toBe(0)
    })
})
