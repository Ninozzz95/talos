import type { TalosPlan } from '@/lib/tools/plan'

/**
 * Il piano approvato, per conversazione.
 *
 * ## Perché una mappa in memoria e non una tabella
 *
 * Stessa scelta di `chainStore`, e per la stessa ragione: la domanda a cui
 * serve rispondere è «in QUESTA conversazione, adesso», e una conversazione
 * ricomincia quando l'app riparte. Un piano approvato ieri che sopravvive a un
 * riavvio sarebbe un consenso che l'utente non ricorda di aver dato — e un
 * consenso che nessuno ricorda non è un consenso.
 *
 * ⛔ Il costo dichiarato: **dopo un riavvio il piano riparte da zero**, quindi
 * chi aveva aperto la porta «per conversazione» se la ritrova chiusa. È il
 * verso giusto in cui sbagliare.
 */

const piani = new Map<string, TalosPlan>()

const FUORI_SESSIONE = ' senza-sessione'

function chiave(sessionId: string | null): string {
    return sessionId ?? FUORI_SESSIONE
}

export function talosPlanFor(sessionId: string | null): TalosPlan | null {
    return piani.get(chiave(sessionId)) ?? null
}

export function talosSetPlan(sessionId: string | null, piano: TalosPlan | null): void {
    if (piano) piani.set(chiave(sessionId), piano)
    else piani.delete(chiave(sessionId))
}

/**
 * Chiude il piano alla fine del turno, se valeva solo per quello.
 *
 * Il predefinito è `turn`, quindi questa è la strada normale: un piano vive
 * quanto il messaggio che l'ha generato. Chi ha aperto la porta
 * «per conversazione» lo tiene, e sarà la contaminazione a farlo decadere.
 */
export function talosEndTurnPlan(sessionId: string | null): void {
    const piano = talosPlanFor(sessionId)
    if (piano && piano.scope === 'turn') talosSetPlan(sessionId, null)
}

/** Solo per i test: la mappa è un modulo, e un test non deve ereditare l'altro. */
export function talosResetPlans(): void {
    piani.clear()
}
