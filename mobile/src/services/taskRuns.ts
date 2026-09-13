import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Le attività che si eseguono da sole, all'ora giusta, con l'app chiusa.
 *
 * ## Perché il lavoro vero non è qui
 *
 * È in Java. Quando arriva l'ora, la WebView **non esiste**: il sistema sveglia
 * il processo dell'app, non la sua interfaccia. Chiedere qualcosa a questo
 * codice significherebbe aspettare che qualcuno apra TALOS — cioè non essere
 * automatici, che è esattamente il limite di «Pianificare» di ChatGPT, il quale
 * *va in letargo* se non interagisci con l'app.
 *
 * Quindi il modello lo apre il lato nativo, con lo stesso motore della chat, e
 * questo modulo è solo la porta: dice **quando**, **con quale modello** e **con
 * quale istruzione**, e poi si toglie di mezzo.
 *
 * ## ⛔ La regola che non si può aggirare
 *
 * Con il **blocco dell'app acceso** un'attività NON si programma. Il database è
 * cifrato con una chiave avvolta dal PIN, senza recupero — decisione dell'owner
 * — e un lavoro che parte alle sette del mattino non ha modo di chiederlo.
 *
 * Si potrebbe tenere una copia dell'istruzione fuori dal database, leggibile
 * senza PIN. Sarebbe comodo e smentirebbe la promessa: chi accende il blocco sta
 * dicendo «senza il mio PIN non si legge niente», e «niente» comprende anche
 * ciò che serve al lavoro automatico.
 *
 * Quindi: blocco acceso → l'attività resta nel database e gira al primo sblocco,
 * e **l'interfaccia lo dice quando la si crea**, non la mattina in cui non è
 * arrivata.
 */

export interface TalosTaskRunPlugin {
    schedule(options: {
        id: string
        modelPath: string
        instruction: string
        title?: string
        nextRunAtMillis: number
        onlyIfChanged?: boolean
    }): Promise<{ scheduled: boolean, inMillis: number }>
    cancel(options: { id: string }): Promise<void>
    clearAll(): Promise<void>
    scheduled(): Promise<{
        tasks: Array<{
            id: string
            nextRunAtMillis: number
            title: string
            onlyIfChanged: boolean
            hasResult: boolean
        }>
    }>
}

const plugin = registerPlugin<TalosTaskRunPlugin>('TalosTaskRun')

export function talosAutonomousTasksAreSupported(): boolean {
    return Capacitor.isPluginAvailable('TalosTaskRun')
}

export type TalosTaskScheduleOutcome =
    /** Programmata: girerà anche se l'app è chiusa. */
    | { ok: true, inMillis: number }
    /**
     * ⛔ Non programmabile perché il blocco dell'app è acceso. Non è un guasto:
     * è la conseguenza dichiarata di proteggere tutto col PIN, e chi legge deve
     * poterla distinguere da un errore.
     */
    | { ok: false, reason: 'locked' }
    /**
     * U-17 — l'attivita' e' IN PAUSA: la ricorrenza c'e', e non deve partire.
     *
     * ⛔ Non e' `refused` e non e' `unsupported`: e' una decisione della
     * persona, l'unica delle tre che si annulla da sola quando lei preme
     * «Riprendi». Metterla insieme a un guasto vorrebbe dire che l'interfaccia
     * non puo' distinguere «l'ho fermata io» da «non ha funzionato», ed e'
     * esattamente la distinzione per cui esiste la pausa.
     */
    | { ok: false, reason: 'paused' }
    | { ok: false, reason: 'unsupported' | 'refused' }

/**
 * Programma un'attività perché giri da sola.
 *
 * `appLockEnabled` arriva da chi chiama e non viene letto qui: questo modulo
 * non deve avere una seconda opinione sullo stato del blocco. Una sola risposta
 * alla stessa domanda.
 */
export async function talosScheduleAutonomousTask(
    task: {
        id: string
        modelPath: string
        instruction: string
        title?: string
        nextRunAtMillis: number
        onlyIfChanged?: boolean
        /** U-17 — la ricorrenza e' scritta, ma per ora non deve partire. */
        paused?: boolean
    },
    appLockEnabled: boolean,
    bridge: TalosTaskRunPlugin = plugin,
): Promise<TalosTaskScheduleOutcome> {
    if (!talosAutonomousTasksAreSupported()) return { ok: false, reason: 'unsupported' }
    if (appLockEnabled) return { ok: false, reason: 'locked' }
    /*
     * ⛔ IN PAUSA NON BASTA NON PROGRAMMARE: BISOGNA DISDIRE.
     *
     * Il lavoro che dorme e' gia' registrato nel sistema — `setPersisted(true)`,
     * quindi sopravvive anche a un riavvio del telefono — e uscire di qui senza
     * fare niente lo lascerebbe partire lo stesso, alla sua ora, con la persona
     * convinta di averlo fermato. Una pausa che non ferma e' peggio di nessuna
     * pausa.
     *
     * E si disdice perche' `JobScheduler` non ha una pausa: il suo lato pubblico
     * e' programmare, accodare, disdire e chiedere cosa c'e' in attesa, e
     * «cancel() cancella il lavoro indicato; se sta girando viene fermato
     * subito» (developer.android.com/reference/android/app/job/JobScheduler,
     * letto il 12/09/2026). Fermare e riprendere si scrive quindi come
     * disdire e riprogrammare, e il posto dove quella coppia vive e' questo —
     * non il lato nativo, che non sa perche' un lavoro non c'e' piu'.
     *
     * `await` e non un `void`: chi chiama deve poter sapere che quando questa
     * funzione risponde, la disdetta e' stata chiesta davvero.
     */
    if (task.paused === true) {
        await talosCancelAutonomousTask(task.id, bridge)
        return { ok: false, reason: 'paused' }
    }
    try {
        const esito = await bridge.schedule(task)
        return esito.scheduled
            ? { ok: true, inMillis: esito.inMillis }
            : { ok: false, reason: 'refused' }
    } catch {
        return { ok: false, reason: 'refused' }
    }
}

export async function talosCancelAutonomousTask(
    id: string,
    bridge: TalosTaskRunPlugin = plugin,
): Promise<void> {
    if (!talosAutonomousTasksAreSupported()) return
    await bridge.cancel({ id }).catch(() => {})
}

/**
 * ⛔ Il blocco è stato ACCESO: via tutto ciò che il sistema poteva aprire da
 * solo.
 *
 * Non è pulizia opzionale. Da questo momento la promessa è che senza il PIN non
 * si legga nulla, e una copia sopravvissuta all'accensione del blocco la
 * contraddirebbe — in silenzio, che è il modo peggiore.
 */
export async function talosForgetAutonomousTasks(
    bridge: TalosTaskRunPlugin = plugin,
): Promise<void> {
    if (!talosAutonomousTasksAreSupported()) return
    await bridge.clearAll().catch(() => {})
}

export async function talosScheduledAutonomousTasks(
    bridge: TalosTaskRunPlugin = plugin,
): Promise<Awaited<ReturnType<TalosTaskRunPlugin['scheduled']>>['tasks']> {
    if (!talosAutonomousTasksAreSupported()) return []
    try {
        return (await bridge.scheduled()).tasks
    } catch {
        return []
    }
}
