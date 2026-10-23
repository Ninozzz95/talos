import type { TalosNotificationEvent } from '@/lib/notifications/notificationCentre'

/**
 * Il piano da approvare chiama MENTRE aspetta, non dopo (N0, 21/10/2026, D-N0-1).
 *
 * In `chatController` la notifica `demanding` partiva dopo l'`await` della decisione: chi non guardava il telefono non
 * veniva mai chiamato, e TALOS restava fermo. E stava sul canale `chat` (DEFAULT) invece di `attention` (HIGH), cioè
 * quello che Android riserva a ciò che aspetta una decisione.
 *
 * L'esito va sulla stessa chiave: il registro aggiorna la riga, e lo store ritira la notifica in tendina perché la voce non
 * chiede più niente.
 */
export interface TalosDecisionePiano {
    admitted: readonly string[]
    cancelled: boolean
}

export async function talosAttendiPianoConAvviso<D extends TalosDecisionePiano>(opzioni: {
    piano: { id: string, steps: readonly unknown[] }
    sessionId: string
    translate: (chiave: string, parametri?: Record<string, string | number>) => string
    /** Apre la domanda (il foglio del piano) e si risolve con la risposta. */
    chiedi: () => Promise<D>
    notify: (evento: TalosNotificationEvent) => void
}): Promise<D> {
    const { piano, sessionId, translate, notify } = opzioni
    const key = `plan:${piano.id}`
    const surface = `chat:${sessionId}`
    // Prima si apre la domanda, poi si chiama: chi tocca la notifica trova il foglio già aperto.
    const attesa = opzioni.chiedi()
    /*
     * Revisione avversaria (4): una domanda che si chiude nell'atto di aprirsi (seconda domanda col foglio già aperto, Stop già
     * premuto) non chiama nessuno. Una promessa già risolta vince la corsa: la sua reazione entra in coda prima di quella del segno.
     */
    const segno = {}
    const giaChiusa = (await Promise.race([attesa, Promise.resolve(segno)])) !== segno
    if (!giaChiusa) notify({
        key,
        channel: 'attention',
        weight: 'demanding',
        title: translate('chat.plan.title', { count: piano.steps.length }),
        body: translate('chat.plan.nothingDoneYet'),
        surface,
        at: Date.now(),
    })
    const decisione = await attesa
    notify({
        key,
        // Revisione avversaria (3): l'esito è una notizia, non una domanda ⇒ sul canale delle risposte, non su quello con suono.
        channel: 'chat',
        weight: 'notable',
        title: translate(decisione.cancelled ? 'chat.plan.cancelledTitle' : 'chat.plan.approvedTitle'),
        body: translate('chat.plan.approvedBody', { count: decisione.admitted.length }),
        surface,
        at: Date.now(),
    })
    return decisione
}
