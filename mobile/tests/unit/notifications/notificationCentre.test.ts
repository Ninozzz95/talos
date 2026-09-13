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

/**
 * ⛔ La regola dell'owner, 2026-08-06: «sono su una funzione → NON devo
 * ricevere notifiche per quella funzione. Sono fuori dalla funzione → devo
 * riceverle. Sono fuori dall'app → devo riceverle in app e su Android».
 *
 * Il caso che l'ha fatta nascere lo ha visto lui sul dispositivo: scrivendo in
 * una chat compariva la notifica della risposta *di quella stessa chat*.
 * Annunciare una cosa che qualcuno ha davanti agli occhi è il modo più rapido
 * di insegnargli a ignorare anche gli avvisi che contano.
 */
describe('un evento non interrompe chi sta già guardando la cosa di cui parla', () => {
    const risposta = (surface: string) => ({
        key: 'chat:risposta', channel: 'chat' as const, weight: 'notable' as const,
        title: 'Risposta pronta', surface, at: 0,
    })

    it('sulla STESSA chat: solo il registro, niente toast e niente Android', () => {
        const esito = talosRouteNotification(risposta('chat:42'), {
            appVisible: true, attention: 'attended', surface: 'chat:42',
        })
        expect(esito).toEqual({ feed: true, toast: false, android: false })
    })

    /**
     * Uguaglianza ESATTA, non «siamo entrambi nelle chat»: due conversazioni
     * diverse sono due cose diverse, e la risposta arrivata nell'altra non la
     * si sta vedendo.
     */
    it("su un'ALTRA chat: il toast arriva", () => {
        const esito = talosRouteNotification(risposta('chat:42'), {
            appVisible: true, attention: 'attended', surface: 'chat:7',
        })
        expect(esito.toast).toBe(true)
        expect(esito.android).toBe(false)
    })

    it("in un'altra parte dell'app: il toast arriva lo stesso", () => {
        const esito = talosRouteNotification(risposta('chat:42'), {
            appVisible: true, attention: 'attended', surface: 'settings:providers',
        })
        expect(esito.toast).toBe(true)
    })

    it("fuori dall'app: esce su Android", () => {
        const esito = talosRouteNotification(risposta('chat:42'), {
            appVisible: false, attention: 'hidden', surface: 'chat:42',
        })
        expect(esito.toast).toBe(false)
        expect(esito.android).toBe(true)
    })

    /**
     * Il terzo stato, quello che «app in primo piano sì/no» non sa dire: la
     * finestra si vede ma non ha l'attenzione — schermo diviso, pannello di
     * sistema aperto, app sotto il blocco schermo. Nessuno sta leggendo, quindi
     * l'unico modo di raggiungere quella persona è uscire dall'app.
     */
    it('visibile ma non atteso vale come assenza per la notifica di sistema', () => {
        const esito = talosRouteNotification(risposta('chat:42'), {
            appVisible: true, attention: 'visible', surface: 'chat:42',
        })
        expect(esito.toast).toBe(false)
        expect(esito.android).toBe(true)
    })

    /**
     * Nemmeno un evento «demanding» sfonda, se stai guardando proprio quello:
     * un guasto della ricerca che stai guardando lo vedi nella pagina.
     */
    it('nemmeno un evento esigente interrompe chi lo sta già guardando', () => {
        const esito = talosRouteNotification({
            key: 'k', channel: 'attention', weight: 'demanding',
            title: 'Guasto', surface: 'job:8f2a', at: 0,
        }, { appVisible: true, attention: 'attended', surface: 'job:8f2a' })
        expect(esito).toEqual({ feed: true, toast: false, android: false })
    })

    /** Un evento senza superficie vale la regola generale, come prima. */
    it('un evento che non appartiene a nessuna superficie si comporta come prima', () => {
        const esito = talosRouteNotification({
            key: 'k', channel: 'jobs', weight: 'notable', title: 'x', at: 0,
        }, { appVisible: true, attention: 'attended', surface: 'chat:42' })
        expect(esito.toast).toBe(true)
    })

    /**
     * Il registro NON cambia mai. Cambia chi viene interrotto, non cosa viene
     * ricordato — ed è la sola parte di questa regola che non ha eccezioni.
     */
    it('il registro riceve tutto, in ogni caso', () => {
        for (const contesto of [
            { appVisible: true, attention: 'attended' as const, surface: 'chat:42' },
            { appVisible: false, attention: 'hidden' as const, surface: null },
            { appVisible: true, attention: 'visible' as const, surface: 'chat:42' },
        ]) {
            expect(talosRouteNotification(risposta('chat:42'), contesto).feed).toBe(true)
        }
    })
})


/**
 * ⛔ Il campanello non suona per quello che hai appena fatto tu.
 *
 * Owner 2026-09-11 dal Pad: tre note create a mano, e il campanello diceva
 * «3». Il peso `log` non bastava — non interrompeva, ma la riga restava «non
 * letta» e il numero conta proprio quelle.
 *
 * La ricerca separa le due cose: un *activity feed* è la traccia, una
 * *notification* è il richiamo, e le proprie azioni non generano mai
 * notifiche (GetStream, *Notification Feeds*, letto 12/09/2026).
 *
 * Si prova nei DUE versi: la nota della persona non alza il numero, quella
 * dell'attrezzo del modello sì. Un verso solo lascerebbe passare sia il
 * campanello che suona sempre sia quello che non suona mai.
 */
describe("l'origine di un evento decide se il campanello suona", () => {
    const nota = (origin?: 'person' | 'model'): TalosNotificationEvent => ({
        key: 'note:created:Spesa',
        channel: 'jobs',
        weight: 'log',
        title: 'Nuova nota',
        body: 'Spesa',
        at: 10,
        ...(origin ? { origin } : {}),
    })

    it('la nota scritta dalla persona nasce già letta: traccia sì, numero no', () => {
        const feed = talosAppendNotification([], nota('person'))
        expect(feed).toHaveLength(1)
        expect(feed[0].read).toBe(true)
        expect(talosUnreadCount(feed)).toBe(0)
    })

    it('tre note a mano lasciano il campanello a zero', () => {
        let feed: TalosNotificationEntry[] = []
        for (const titolo of ['Spesa', 'Medico', 'Regali']) {
            feed = talosAppendNotification(feed, { ...nota('person'), key: `note:created:${titolo}`, body: titolo })
        }
        expect(feed).toHaveLength(3)
        expect(talosUnreadCount(feed)).toBe(0)
    })

    it('AL CONTRARIO: la nota creata dall’attrezzo del modello resta da leggere', () => {
        for (const evento of [nota('model'), nota()]) {
            const feed = talosAppendNotification([], evento)
            expect(feed[0].read).toBe(false)
            expect(talosUnreadCount(feed)).toBe(1)
        }
    })

    it('nessuna delle due superfici che interrompono viene toccata dalla persona', () => {
        const esito = talosRouteNotification(nota('person'), { appVisible: false, surface: null })
        expect(esito.feed).toBe(true)
        expect(esito.toast).toBe(false)
        expect(esito.android).toBe(false)
    })

    it('AL CONTRARIO: un evento del modello che pesa resta capace di uscire', () => {
        const esito = talosRouteNotification(
            { ...nota('model'), weight: 'notable' },
            { appVisible: false, surface: null },
        )
        expect(esito.android).toBe(true)
    })
})
