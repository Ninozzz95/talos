import { buildChatCompletion } from '@/lib/chat/chatCompletion'
import { talosCorsaDelloSchermo } from '@/lib/agent/corsaDelloSchermo'
import { TalosSchermoBridge } from '@/lib/device/ponteSchermo'
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
    return await TalosSchermoBridge.disponibile()
        .then((r) => r.aperto)
        .catch(() => false)
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
        parla: input.parla,
    })
}
