/**
 * ⭐ GESTITA-01 (owner 25/09/2026, «riga compatta») — l'esito di una richiesta di permesso, per la riga
 * «Permesso concesso/negato: <strumento>» al posto della bolla «La richiesta di autorizzazione è stata gestita.».
 *
 * L'esito c'è già sul disco: il checkpoint si salva come attività `tool.authorization` con lo STESSO id, e le sue
 * richieste portano la decisione (`toolAuthorizationCheckpoint.ts`, `decide` → `persistCheckpoint`). Qui si legge e basta.
 * ⛔ Nessun esito finché una richiesta aspetta, e nessuno per dati storti: meglio la riga generica che un esito inventato.
 */
import type { TalosLocalToolActivity } from '@/repositories/chatRepository'

export interface TalosEsitoStrumento {
    readonly tool: string
    readonly concesso: boolean
}

const SI = new Set(['allow_once', 'allow_turn', 'always_allow'])

export function talosEsitoAutorizzazione(
    attivita: readonly TalosLocalToolActivity[],
    checkpointId: string,
): TalosEsitoStrumento[] | null {
    const voce = attivita.find((candidata) => candidata.id === checkpointId && candidata.operation === 'tool.authorization')
    const richieste = (voce?.payload?.checkpoint as { requests?: unknown } | undefined)?.requests
    if (!Array.isArray(richieste) || richieste.length === 0) return null
    const esiti: TalosEsitoStrumento[] = []
    for (const richiesta of richieste) {
        const { tool, decision } = (richiesta ?? {}) as { tool?: unknown, decision?: unknown }
        if (typeof tool !== 'string' || typeof decision !== 'string') return null
        if (decision === 'pending') return null
        if (!SI.has(decision) && decision !== 'deny') return null
        esiti.push({ tool, concesso: SI.has(decision) })
    }
    return esiti
}
