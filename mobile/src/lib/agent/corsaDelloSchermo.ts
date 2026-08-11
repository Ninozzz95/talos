import { TalosSchermoBridge, talosArmaIlFreno } from '@/lib/device/ponteSchermo'
import { creaManoDelloSchermo } from '@/lib/device/manoDelloSchermo'
import { creaChiediDelPilota } from '@/lib/agent/chiediAlPilota'
import {
    talosFraseDiFine,
    talosGuidaLoSchermo,
    type TalosCorsaDelPilota,
} from '@/lib/agent/pilotaDelloSchermo'
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
    /** L'elenco «Nome<TAB>pacchetto», per non far indovinare un id al modello. */
    elencoApp(): Promise<string>
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
        elencoApp: montaggio.elencoApp,
        aspetta: (ms) => new Promise((ok) => { setTimeout(ok, ms) }),
    })
    const corsa = await talosGuidaLoSchermo({
        guarda: () => TalosSchermoBridge.guarda().catch(() => null),
        agisci: esegui,
        chiedi: creaChiediDelPilota({
            obiettivo: montaggio.obiettivo,
            completa: montaggio.completa,
        }),
        racconta: montaggio.parla,
        adesso: () => Date.now(),
    })
    /*
     * ⛔⛔ LA FRASE PER LA PERSONA ESISTEVA E NON LA DICEVA NESSUNO.
     *
     * `talosFraseDiFine` era scritta, provata dai test, esportata due volte — e
     * cercandone i chiamanti non ne aveva **uno**. Quando il pilota si fermava,
     * l'unica voce che restava era il modello, che ripete a modo suo il
     * racconto tecnico in inglese: è così che l'owner si è ritrovato
     * «schermoCambiato» scritto in chat il 2026-08-11.
     *
     * ⛔ Si dice SOLO quando la corsa NON è finita bene. A fine riuscita la
     * risposta del modello racconta già cosa ha ottenuto, e aggiungerci «Fatto.»
     * a voce vorrebbe dire dirlo due volte — che è il difetto opposto e si
     * sente uguale.
     *
     * ⛔ E si dice qui, non dentro il ciclo: il ciclo non conosce la voce, la
     * riceve. Metterla lì legherebbe i tetti — che si provano senza telefono —
     * a un motore vocale.
     */
    if (corsa.fine.motivo !== 'fine') montaggio.parla(talosFraseDiFine(corsa.fine))
    return corsa
}
