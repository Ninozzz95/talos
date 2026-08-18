import type { TalosPremessaEsito } from '@/lib/tools/registry'
import { talosPacchettoPerNome } from '@/lib/device/manoDelloSchermo'

/**
 * ⭐⭐⭐ «QUESTA APP C'È?» — chiesta PRIMA della scheda di consenso.
 *
 * ## ⛔⛔ La trappola, e su Android 11+ è la regola non l'eccezione
 *
 * Da Android 11 il sistema **filtra** ciò che un'app può vedere delle altre.
 * `queryIntentActivities` non torna l'elenco delle app installate: torna
 * l'elenco delle app **che noi abbiamo dichiarato di poter vedere**. Quindi
 * «non l'ho trovata» copre due fatti diversissimi:
 *
 * ```
 * non è installata               →  assente
 * è installata, ma invisibile    →  ignoto
 * ```
 *
 * ⇒ Confonderli fa dire «Telegram non è installato» a chi ha Telegram sul
 * telefono — e lo fa con l'aria di aver controllato. È la stessa bugia del
 * contatto, un piano più in là.
 *
 * ## Perché qui la copertura è COMPLETA lo stesso
 *
 * `AndroidManifest.xml` dichiara `<intent>` con `MAIN` + `LAUNCHER`: l'insieme
 * visibile è **esattamente** l'insieme delle app che hanno un'icona, cioè
 * esattamente quelle che «apri un'app» può aprire. Per questa domanda il filtro
 * di Android non toglie niente.
 *
 * ⛔ E il limite, dichiarato: un'app **senza** activity di lancio — un servizio,
 * un plugin — resta invisibile, e su quella la risposta giusta è `ignoto`. Chi
 * un giorno chiedesse «c'è il servizio X?» invece di «apri X» deve tornare qui,
 * non fidarsi di questa funzione.
 */

/**
 * ⛔ L'elenco arriva da FUORI, non lo si chiede qui dentro: la premessa deve
 * poter girare nei test senza un telefono, e la stessa lista la usa già chi
 * apre l'app. Chiederla due volte darebbe due risposte a due istanti diversi.
 */
export async function talosPremessaApp(
    nome: string | undefined,
    elencoDelleApp: () => Promise<string>,
): Promise<TalosPremessaEsito> {
    // Nessuna app nominata: non c'è nessuna premessa da controllare.
    if (!nome?.trim()) return { stato: 'presente' }

    let elenco: string
    try {
        elenco = await elencoDelleApp()
    }
    catch {
        return {
            stato: 'ignoto',
            perche: 'the list of installed apps could not be read',
            fatto: { famiglia: 'app-installed', nome },
        }
    }

    /*
     * ⛔⛔ UN ELENCO VUOTO È «IGNOTO», NON «ASSENTE» — ed è il caso che la
     * ricerca su Android 11 segnala per primo: senza le dichiarazioni nel
     * manifesto `queryIntentActivities` torna **zero risultati**, non un
     * errore. Un elenco vuoto è un ponte che non ha parlato, non un telefono
     * senza app: nessun telefono ha zero app con un'icona.
     */
    if (!elenco.trim()) {
        return {
            stato: 'ignoto',
            perche: 'the list of installed apps came back empty, which means it could not be read',
            fatto: { famiglia: 'app-installed', nome },
        }
    }

    const pacchetto = talosPacchettoPerNome(elenco, nome)
    if (pacchetto) return { stato: 'presente', fatto: { famiglia: 'app-installed', nome, ambito: pacchetto } }

    return {
        stato: 'assente',
        perche: `"${nome}" is not among the apps installed on this device`,
        /*
         * ⛔ `completa` e non per fiducia: il manifesto dichiara MAIN+LAUNCHER,
         * quindi l'insieme visibile È l'insieme delle app apribili. Se un giorno
         * quella dichiarazione cambia, questa riga diventa falsa — ed è per
         * questo che il motivo sta scritto qui e non in un documento.
         */
        copertura: 'completa',
        fatto: { famiglia: 'app-installed', nome },
    }
}
