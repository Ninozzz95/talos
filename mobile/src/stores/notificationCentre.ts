import { reactive, readonly } from 'vue'
import {
    talosAppendNotification,
    talosMarkNotificationsRead,
    talosRouteNotification,
    talosUnreadCount,
    type TalosNotificationEntry,
    type TalosNotificationEvent,
} from '@/lib/notifications/notificationCentre'

/**
 * Il registro vivo, e l'unica porta da cui si annuncia qualcosa.
 *
 * ## Perché una porta sola
 *
 * Owner 2026-08-06: «ogni funzione, tool, download, installazione deve avere
 * notifica toast E Android». Il modo in cui oggi metà delle azioni sono finite
 * senza avviso è che ognuna decideva per conto suo: i trasferimenti spingevano
 * un toast, la ricerca postava una notifica di sistema, e tutto il resto non
 * faceva niente. Tre comportamenti diversi per la stessa domanda.
 *
 * Adesso chi fa qualcosa chiama `talosNotify` e basta. Dove finisce lo decide
 * `talosRouteNotification`, che è una funzione pura e provata: qui non si
 * ridecide niente, si esegue.
 *
 * ## Perché lo store non importa né i toast né il ponte nativo
 *
 * Perché sarebbe il modo di far entrare mezzo mondo nel grafo d'avvio, e in
 * questo progetto è già successo: importare i trasferimenti dentro `App.vue` per
 * gli avvisi ha sfondato il tetto d'avvio di 1.379 byte. Le due superfici si
 * **iniettano**: chi le possiede le collega, e chi non le carica non le paga.
 */

interface Stato {
    entries: TalosNotificationEntry[]
    unread: number
    /**
     * La superficie che si sta guardando adesso: `chat:42`, `job:8f2a`,
     * `settings:providers`.
     *
     * Owner 2026-08-06: «sono su una funzione → non devo ricevere notifiche per
     * quella funzione». Senza questo dato la regola può sapere soltanto «l'app
     * è davanti», e con quello **non è possibile** distinguere la chat che stai
     * scrivendo da quella accanto.
     */
    surface: string | null
    /**
     * Falso quando l'app non è davanti. Lo aggiorna chi osserva il ciclo di vita
     * nativo; il valore iniziale è `true` perché all'avvio l'app è davanti per
     * definizione — nessuno legge un registro che non sta guardando.
     */
    appVisible: boolean
}

const state = reactive<Stato>({ entries: [], unread: 0, surface: null, appVisible: true })

export const talosNotifications = readonly(state)

type Sink = (event: TalosNotificationEvent) => void

let toastSink: Sink | null = null
let androidSink: Sink | null = null

/** Collega il toast dentro l'app. Passare `null` lo stacca (prove, smontaggio). */
export function talosOnNotificationToast(sink: Sink | null): void {
    toastSink = sink
}

/** Collega la notifica di sistema. Assente = build senza ponte nativo, e va bene. */
export function talosOnNotificationAndroid(sink: Sink | null): void {
    androidSink = sink
}

/** Lo dice chi osserva il ciclo di vita: cambia DOVE va un evento, non se. */
export function talosSetAppVisible(visible: boolean): void {
    state.appVisible = visible
}

/**
 * Dichiara che cosa si sta guardando. Lo dice la schermata, quando si monta, e
 * lo ritira quando se ne va.
 *
 * `null` significa «nessuna superficie in particolare», e allora vale la regola
 * generale: è il caso giusto per un elenco o per la pagina iniziale, dove non si
 * sta seguendo nessuna cosa specifica.
 */
export function talosSetActiveSurface(surface: string | null): void {
    state.surface = surface
}

/**
 * Annuncia qualcosa. È l'unica porta.
 *
 * Un guasto di una superficie non ferma le altre: se il ponte nativo rifiuta, il
 * registro e il toast devono comunque esserci — una notifica persa in silenzio è
 * peggio di una notifica che non si può postare, perché nessuno se ne accorge.
 */
export function talosNotify(event: TalosNotificationEvent): void {
    const routing = talosRouteNotification(event, {
        appVisible: state.appVisible,
        surface: state.surface,
    })

    state.entries = talosAppendNotification(state.entries, event)
    state.unread = talosUnreadCount(state.entries)

    if (routing.toast && toastSink) {
        try { toastSink(event) } catch { /* la superficie possiede il suo guasto */ }
    }
    if (routing.android && androidSink) {
        try { androidSink(event) } catch { /* idem */ }
    }
}

/** «Ho visto»: senza chiave vale per tutto, ed è il gesto che azzera il numero. */
export function talosMarkNotificationsSeen(key?: string): void {
    state.entries = talosMarkNotificationsRead(state.entries, key)
    state.unread = talosUnreadCount(state.entries)
}

/** Solo per le prove: riporta il registro e gli innesti a zero. */
export function talosResetNotificationCentre(): void {
    state.entries = []
    state.unread = 0
    state.appVisible = true
    state.surface = null
    toastSink = null
    androidSink = null
}
