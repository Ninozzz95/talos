import { buildChatCompletion } from '@/lib/chat/chatCompletion'
import { talosCorsaDelloSchermo } from '@/lib/agent/corsaDelloSchermo'
import { TalosSchermoBridge } from '@/lib/device/ponteSchermo'
import { talosTracciaFuori } from '@/lib/device/traccia'
import { TalosDeviceBridge } from '@/lib/device/devicePlugin'
import type { TalosCorsaDelPilota } from '@/lib/agent/pilotaDelloSchermo'
import type { CompletionContext } from '@/lib/chat/chatCompletion'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'

/**
 * ⭐ Tutto il pilota, dietro un import PIGRO.
 *
 * ## ⛔ Il numero che ha deciso questo file
 *
 * Scritta dentro `chatController.ts`, la stessa logica ha portato il grafo
 * d'avvio a **600.880 byte** contro un tetto di 600.000; spostando solo il
 * montaggio è scesa a **600.403**, ancora sopra. Cioè: il pilota — che serve a
 * una persona su cento, e solo dopo un consenso esplicito — si faceva pagare
 * all'apertura dell'app da tutti gli altri.
 *
 * Adesso nel controller restano due righe che rimandano qui. È la stessa
 * disciplina già applicata alla dettatura e alla lettura a voce: una funzione
 * che non usi non deve costarti l'avvio.
 */
export async function talosOcchioAperto(): Promise<boolean> {
    /*
     * ⛔ «NON LO SO» USCIVA DA QUI COME «È SPENTO».
     *
     * Il `catch` c'è perché il chiamante vuole un booleano — ma un ponte che
     * lancia e un permesso spento sono due fatti diversi, e da fuori si vedeva
     * solo il secondo: TALOS diceva alla persona «il permesso è disattivato»,
     * che è un'affermazione, non un'incertezza. Il ripiego resta prudente (non
     * si guida lo schermo se non si è sicuri di vederlo), ma smette di essere
     * muto: se questa riga compare in `logcat`, la causa NON è il permesso.
     */
    /*
     * ⛔ E SI TRACCIA ANCHE IL «NO», non solo l'eccezione — 2026-08-13.
     *
     * La prima versione di questa sonda parlava solo quando il ponte lanciava.
     * MISURATO stamattina: il ponte NON lanciava, rispondeva `false` — e la
     * sonda taceva, cioè taceva proprio nel caso che stavamo inseguendo.
     * Una sonda che parla solo nel caso raro lascia il caso frequente muto.
     */
    return await TalosSchermoBridge.disponibile()
        .then((r) => {
            talosTracciaFuori(`occhioAperto: aperto=${String(r.aperto)}`)
            return r.aperto
        })
        .catch((errore: unknown) => {
            talosTracciaFuori(`occhioAperto: ponte-in-errore ${String(errore)}`)
            return false
        })
}

export interface TalosAvvioCorsa {
    obiettivo: string
    /** Il profilo e il modello scelti ADESSO nel compositore. */
    profilo: CompletionContext['profile']
    modello: CompletionContext['providerModel']
    effort: CompletionContext['effort']
    thinking: CompletionContext['thinking']
    chiave(provider: string): Promise<string | null>
    punto(provider: string): Promise<string | null>
    trasporto: TalosMobileHttpTransport
    apriApp(nomePacchetto: string): Promise<{ done: boolean, reason?: string }>
    parla(frase: string): void
}

/**
 * Risolve chiave e indirizzo ADESSO, non all'avvio.
 *
 * ⛔ Congelarli quando si costruisce il toolset vorrebbe dire che cambiare
 * modello nel compositore non cambia chi guida — e chi ha appena scelto un
 * altro modello si vedrebbe pilotare il telefono dal precedente.
 */
export async function talosAvviaCorsa(input: TalosAvvioCorsa): Promise<TalosCorsaDelPilota> {
    const [apiKey, endpoint] = input.profilo
        ? await Promise.all([
            input.chiave(input.profilo.provider),
            input.punto(input.profilo.provider),
        ])
        : [null, null]
    return await talosCorsaDelloSchermo({
        obiettivo: input.obiettivo,
        completa: buildChatCompletion(
            () => ({
                profile: input.profilo,
                providerModel: input.modello,
                apiKey,
                endpoint,
                effort: input.effort,
                thinking: input.thinking,
            }),
            input.trasporto,
        ),
        apriApp: input.apriApp,
        /*
         * ⛔ L'elenco lo prende QUI e non lo riceve dal controller: passarglielo
         * costava 346 byte nel grafo d'avvio (600.346 su 600.000), cioe' il
         * pilota tornava a farsi pagare da chi non lo usa. Questo file e' gia'
         * pigro: chiedere il PackageManager da qui non costa niente a nessuno.
         */
        elencoApp: async () => await TalosDeviceBridge.listApps()
            .then((r) => r.output ?? '')
            .catch(() => ''),
        parla: input.parla,
    })
}
