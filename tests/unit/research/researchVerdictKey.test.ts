import { describe, expect, it } from 'vitest'
import { talosResearchVerdictKey } from '@/lib/research/researchCard'
import type { TalosResearchRun, TalosResearchStep } from '@/lib/research/researchRun'

/**
 * L'impronta che fa scadere una lettura. (MB-1)
 *
 * ⛔ Misurato sul Pad il 12/09/2026 (foto RE5/RE6): una ricerca conclusa col suo
 * rapporto restava «Senza conclusione» nella stazione, e tornava «Conclusa» solo
 * riaprendo l'app. Il verdetto era in cache PER ID — e l'id non cambia mai:
 * misurato durante la sintesi, quando il rapporto non c'era, e mai più guardato.
 *
 * Queste prove fissano la sola cosa che rende quella cache onesta: due momenti
 * diversi della stessa corsa devono avere due impronte diverse.
 */

const NIENTE = { tokens: 0, searches: 0, pages: 0 }

const SINTESI: TalosResearchStep = {
    id: 'synthesis',
    branchId: 'synthesis',
    kind: 'synthesise',
    state: 'done',
    attempts: 1,
    startedAt: '2026-09-12T10:30:00.000Z',
    finishedAt: '2026-09-12T10:36:00.000Z',
    spend: NIENTE,
    resultRef: 'vault:rapporto',
    error: null,
}

function corsa(over: Partial<TalosResearchRun> = {}): TalosResearchRun {
    return {
        id: 'run-1',
        sessionId: 'chat-1',
        question: 'quanto costa una pagina?',
        depth: 'quick',
        engine: 'device',
        status: 'synthesising',
        title: null,
        plan: [{ id: 'b1', question: 'prezzi', estimate: NIENTE }],
        steps: [],
        startedAt: '2026-09-12T10:00:00.000Z',
        updatedAt: '2026-09-12T10:30:00.000Z',
        ...over,
    }
}

describe('l’impronta di una lettura', () => {
    it('la stessa corsa, due volte: la stessa impronta', () => {
        expect(talosResearchVerdictKey(corsa())).toBe(talosResearchVerdictKey(corsa()))
    })

    /*
     * ⛔ IL CASO DEL PAD: durante la sintesi non c'è rapporto, a corsa finita sì.
     * Se le due impronte coincidessero, la lettura di prima resterebbe a schermo
     * — ed è esattamente ciò che è successo.
     */
    it('⛔ durante la sintesi e a corsa conclusa: impronte DIVERSE', () => {
        const durante = corsa()
        const dopo = corsa({ status: 'done', steps: [SINTESI], updatedAt: '2026-09-12T10:36:00.000Z' })

        expect(talosResearchVerdictKey(dopo)).not.toBe(talosResearchVerdictKey(durante))
    })

    it('⛔ ognuno dei tre fatti da solo basta a farla scadere', () => {
        const base = talosResearchVerdictKey(corsa())

        expect(talosResearchVerdictKey(corsa({ status: 'done' })), 'stato').not.toBe(base)
        expect(talosResearchVerdictKey(corsa({ updatedAt: '2026-09-12T10:31:00.000Z' })), 'movimento').not.toBe(base)
        expect(talosResearchVerdictKey(corsa({ steps: [SINTESI] })), 'rapporto').not.toBe(base)
    })

    it('due ricerche diverse non si scambiano la lettura', () => {
        expect(talosResearchVerdictKey(corsa({ id: 'run-2' }))).not.toBe(talosResearchVerdictKey(corsa()))
    })

    /*
     * Al contrario: ciò che NON tocca il verdetto non deve farlo rileggere. Un
     * rinomina cambia `updatedAt` e quindi l'impronta — ed è voluto, perché il
     * giornale si è mosso — ma un cambio di sola domanda a parità di tutto il
     * resto non esiste nel modello: la corsa è la stessa.
     */
    it('la sola anteprima del piano non cambia l’impronta', () => {
        const base = talosResearchVerdictKey(corsa())
        const altroPiano = corsa({ plan: [{ id: 'b9', question: 'un’altra linea', estimate: NIENTE }] })

        expect(talosResearchVerdictKey(altroPiano)).toBe(base)
    })
})
