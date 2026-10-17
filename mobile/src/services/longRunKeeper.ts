import { registerPlugin } from '@capacitor/core'

/**
 * R-1b, the JavaScript half: decides WHEN the keeper is worth starting.
 *
 * Owner 2026-07-26 confirmed the threshold: a foreground service for every
 * message would flash a persistent notification for a two-second reply, which is
 * worse than the problem it solves. So nothing starts until the work is
 * genuinely long — a tool round begins, or plain streaming outlives the delay
 * below.
 *
 * Everything here degrades to a no-op. A device that refuses the service, or a
 * web build that has no such thing, must lose the PROTECTION and not the work:
 * the failure mode is what happens today, an operation that dies if the user
 * leaves the app, and turning that into an exception would make long answers
 * impossible rather than merely fragile.
 */
interface TalosRunServicePlugin {
    start(options: { title: string; text: string }): Promise<{ ok: boolean }>
    update(options: { title: string; text: string }): Promise<{ ok: boolean }>
    stop(): Promise<{ ok: boolean }>
}

const plugin = registerPlugin<TalosRunServicePlugin>('TalosRunService')

/**
 * How long a plain answer may run before it is treated as long work.
 *
 * Most replies finish well inside this, so most messages never see a
 * notification at all. Anything past it is either a slow model or a big answer,
 * and both are exactly the cases the owner lost by switching apps.
 */
export const TALOS_KEEPER_DELAY_MS = 4_000

export interface TalosRunKeeper {
    /** Start now, because the work is already known to be long (a tool round). */
    engage(text: string): void
    /** Update what the notification says. Cheap; safe before `engage`. */
    describe(text: string): void
    /** Always call this, on every path including failure and cancellation. */
    release(): void
}

/**
 * A keeper for ONE operation.
 *
 * `title` names the chat rather than the app, because a notification that says
 * "TALOS" tells the user nothing they did not know, while one that says which
 * conversation is working tells them whether to care.
 */
/**
 * ⛔ KEEPER-01 (13/10/2026): il servizio in primo piano è UNO SOLO e il suo `stop` è incondizionato. Con due custodi vivi
 * insieme (un giro e l'attesa dell'accesso a ChatGPT, o due giri) il primo che rilasciava lo spegneva anche all'altro.
 * Qui stanno i custodi PARTITI: il servizio si ferma solo quando l'ultimo rilascia, e chi resta riprende la notifica.
 */
const vivi: Array<() => { title: string; text: string }> = []

export function createTalosRunKeeper(title: string): TalosRunKeeper {
    const io = () => ({ title, text: description })
    let started = false
    let released = false
    let description = ''
    let timer: ReturnType<typeof setTimeout> | null = null

    function begin(): void {
        if (started || released) return
        started = true
        vivi.push(io)
        void plugin.start({ title, text: description }).catch(() => {
            // The work continues unprotected; see the note at the top.
        })
    }

    // The delayed start: a reply that finishes first never starts anything.
    timer = setTimeout(begin, TALOS_KEEPER_DELAY_MS)

    return {
        engage(text: string) {
            description = text
            if (timer !== null) { clearTimeout(timer); timer = null }
            begin()
        },
        describe(text: string) {
            description = text
            if (!started || released) return
            void plugin.update({ title, text }).catch(() => {})
        },
        release() {
            if (released) return
            released = true
            if (timer !== null) { clearTimeout(timer); timer = null }
            // Stop unconditionally, even if the start never happened or failed:
            // a notification outliving its work is the one thing worse than not
            // having one.
            if (!started) return
            vivi.splice(vivi.indexOf(io), 1)
            const resta = vivi[vivi.length - 1]
            void (resta ? plugin.update(resta()) : plugin.stop()).catch(() => {})
        },
    }
}
