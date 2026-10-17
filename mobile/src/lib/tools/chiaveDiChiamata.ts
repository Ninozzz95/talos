import type { TalosToolCall } from '@/stores/chat'

/**
 * La chiave di una chiamata d'attrezzo: nome + argomenti in forma canonica (chiavi ordinate). La usa la rete
 * anti-ripetizione del ciclo (`agentLoop.ts`, documentata lì) e il conteggio degli strumenti partiti nell'avviso della
 * risposta vuota (`talosStrumentiPartiti`), così «doppione non rieseguito» e «strumento da non contare» non divergono
 * (N13-STR-01, Pad 11/10/2026).
 *
 * ⛔ Modulo a sé, e piccolo, apposta: `rispostaVuota.ts` sta nel grafo d'avvio e `agentLoop.ts` deve restare caricato
 * a richiesta (cancello `TALOS_AGENT_LOOP_NOT_LAZY` della build, scattato il 12/10 quando la chiave stava dentro il ciclo).
 */
export function chiaveDiChiamata(call: Pick<TalosToolCall, 'name'> & { arguments?: unknown }): string {
    const canonico = (valore: unknown): unknown => {
        if (Array.isArray(valore)) return valore.map(canonico)
        if (valore && typeof valore === 'object') {
            return Object.fromEntries(
                Object.entries(valore as Record<string, unknown>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([chiave, dentro]) => [chiave, canonico(dentro)]),
            )
        }
        return valore
    }
    try {
        /*
         * ⛔ Gli argomenti arrivano come STRINGA JSON dal provider. Confrontare
         * le stringhe cosi' come sono farebbe passare per diverse due chiamate
         * identiche scritte con una spaziatura diversa — e i modelli locali,
         * che rigenerano la chiamata da capo ogni volta, la spaziatura la
         * cambiano. Si analizza e si rende in forma canonica; se non e' JSON,
         * la stringa grezza e' comunque meglio di niente.
         */
        const grezzi: unknown = typeof call.arguments === 'string'
            ? JSON.parse(call.arguments)
            : call.arguments
        return `${call.name}\u0000${JSON.stringify(canonico(grezzi))}`
    } catch {
        if (typeof call.arguments === 'string') {
            return `${call.name}\u0000${call.arguments.trim()}`
        }
        // Argomenti non serializzabili: meglio lasciar passare che bloccare per
        // un motivo che non c'entra.
        return `${call.name}\u0000${String(Math.random())}`
    }
}
