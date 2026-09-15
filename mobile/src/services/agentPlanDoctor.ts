import type { TalosEngineDiagnosticRow } from '@/lib/models/engineDiagnostics'

/**
 * Quello che il Doctor deve poter dire del piano e della catena.
 *
 * ## Perché esiste, e da quando
 *
 * Owner 2026-08-07, direttiva permanente: «man mano che implementi ogni cosa
 * d'ora in avanti aggancia ogni cosa al Doctor e ai sistemi di debug interni».
 *
 * La ragione pratica è che le regole del macroblocco A e B sono **invisibili
 * quando funzionano**. La trifecta che non si chiude, un piano che non compare
 * perché sotto soglia, una postcondizione che ha promosso un errore: sono tutte
 * cose che si notano solo quando sbagliano, e a quel punto non c'è modo di
 * sapere perché. Il Doctor è dove si guarda **mentre** funziona.
 *
 * ## Perché un modulo a parte e caricato a richiesta
 *
 * Stessa scelta di `localEngineDoctor`: il Doctor è una schermata rara, e la
 * catena vive in un modulo che il grafo d'avvio non deve conoscere.
 */

export interface TalosAgentPlanDoctorInput {
    sessionId: string | null
    /** Fin dove vale un'approvazione, dalle preferenze. */
    scope: 'turn' | 'conversation'
}

export async function talosAgentPlanDoctorRows(
    input: TalosAgentPlanDoctorInput,
): Promise<TalosEngineDiagnosticRow[]> {
    const [{ talosChainFor }, { talosPlanFor }, { TALOS_TOOL_SECURITY }] = await Promise.all([
        import('@/lib/tools/chainStore'),
        import('@/lib/tools/planStore'),
        import('@/lib/tools/securityCatalog'),
    ])

    const catena = talosChainFor(input.sessionId)
    const piano = talosPlanFor(input.sessionId)
    const tutti = Object.values(TALOS_TOOL_SECURITY)

    /*
     * ⛔ Le due bandiere della catena, dette per quello che significano.
     *
     * «Dati privati visti» e «contenuto non fidato entrato» non sono etichette
     * tecniche: sono i due terzi della trifecta, e chi guarda questa schermata
     * sta cercando di capire perché una conferma è arrivata — o perché non è
     * arrivata. Dirlo con un booleano non risponderebbe a nessuna delle due.
     */
    const righe: TalosEngineDiagnosticRow[] = [
        {
            id: 'agent-chain-private',
            labelKey: 'doctor.agent.privateSeen',
            value: catena.privateDataSeen ? 'doctor.agent.yes' : 'doctor.agent.no',
            ok: true,
        },
        {
            id: 'agent-chain-untrusted',
            labelKey: 'doctor.agent.untrustedSeen',
            value: catena.untrustedSeen ? 'doctor.agent.yes' : 'doctor.agent.no',
            // NON è un guasto: è uno stato. Ma è quello che spiega perché da
            // qui in avanti ogni tool che trasmette chiederà conferma.
            ok: !catena.untrustedSeen,
        },
        {
            id: 'agent-plan-scope',
            labelKey: 'doctor.agent.planScope',
            value: input.scope === 'conversation'
                ? 'doctor.agent.scopeConversation'
                : 'doctor.agent.scopeTurn',
            ok: true,
        },
        {
            id: 'agent-plan-current',
            labelKey: 'doctor.agent.planCurrent',
            value: piano
                ? `${piano.state} · ${piano.steps.length} · ${piano.risk}`
                : 'doctor.agent.planNone',
            ok: true,
        },
        /*
         * Il conto che ha fatto nascere A8, tenuto sotto gli occhi.
         *
         * Era 15 su 38 il giorno in cui la difesa scattava dopo ogni lettura.
         * Se un giorno risale, questa riga lo dice prima che qualcuno se ne
         * accorga dal fatto che le conferme sono tornate a essere rumore.
         */
        {
            id: 'agent-taint-static',
            labelKey: 'doctor.agent.staticTainters',
            value: `${tutti.filter((riga) => riga.readsUntrustedContent).length}/${tutti.length}`,
            ok: true,
        },
        {
            id: 'agent-transmitters',
            labelKey: 'doctor.agent.transmitters',
            value: `${tutti.filter((riga) => riga.canTransmit).length}/${tutti.length}`,
            ok: true,
        },
    ]
    return righe
}
