import { TalosSchermoBridge, talosArmaIlFreno } from '@/lib/device/ponteSchermo'
import { creaManoDelloSchermo } from '@/lib/device/manoDelloSchermo'
import { creaChiediDelPilota } from '@/lib/agent/chiediAlPilota'
import { talosGuidaLoSchermo, type TalosCorsaDelPilota } from '@/lib/agent/pilotaDelloSchermo'
import type { ChatCompletion } from '@/stores/chat'

/**
 * ⭐ Una corsa intera, montata: freno, occhio, mano, modello, voce.
 *
 * ## ⛔ Perché sta in un file suo e non nel controller
 *
 * MISURATO: scritta dentro `chatController.ts` questa funzione ha portato il
 * grafo d'avvio a **600.880 byte** contro un tetto di 600.000 — cioè il
 * pilota, che serve a una persona su cento e solo dopo un consenso esplicito,
 * si faceva pagare da TUTTI all'apertura dell'app.
 *
 * Il controller ora tiene solo la cucitura: chi guida, con quale modello, e con
 * quale voce. Il montaggio è qui, in un modulo che si carica quando la corsa
 * comincia — e chi non guida mai non lo carica mai.
 */
export interface TalosMontaggioCorsa {
    obiettivo: string
    /** Il modello che decide i passi: quello della chat, risolto adesso. */
    completa: ChatCompletion
    /** Aprire un'app: la stessa strada di `device_open_app`. */
    apriApp(nomePacchetto: string): Promise<{ done: boolean, reason?: string }>
    /** ⭐ La voce. Owner: sempre, quando guida. */
    parla(frase: string): void
}

export async function talosCorsaDelloSchermo(
    montaggio: TalosMontaggioCorsa,
): Promise<TalosCorsaDelPilota> {
    /*
     * ⛔ Il freno PRIMA di tutto, e non si controlla qui se è riuscito: il
     * ciclo lo rilegge a ogni sguardo e si rifiuta di partire se non è armato.
     * Un secondo controllo qui sarebbe un secondo posto da tenere allineato.
     */
    await talosArmaIlFreno()
    const esegui = creaManoDelloSchermo({
        apriApp: montaggio.apriApp,
        aspetta: (ms) => new Promise((ok) => { setTimeout(ok, ms) }),
    })
    return await talosGuidaLoSchermo({
        guarda: () => TalosSchermoBridge.guarda().catch(() => null),
        agisci: esegui,
        chiedi: creaChiediDelPilota({
            obiettivo: montaggio.obiettivo,
            completa: montaggio.completa,
        }),
        racconta: montaggio.parla,
        adesso: () => Date.now(),
    })
}
