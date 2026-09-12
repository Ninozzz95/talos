import { describe, expect, it } from 'vitest'
import {
    talosResearchSourcesGathered,
    talosResearchSourcesGatheredFor,
    talosResearchStepProduced,
    type TalosResearchRun,
    type TalosResearchStep,
} from '@/lib/research/researchRun'
import { talosResearchCardOf } from '@/lib/research/researchCard'

/**
 * «Fonti raccolte» contro «Fonti ancora da raccogliere» — una domanda, una risposta.
 *
 * ⛔ Misurato sul Pad il 12/09/2026 (foto RC12): la scheda del dossier diceva
 * «Fonti ancora da raccogliere» e la pagina del rapporto, sulle stesse identiche
 * linee, «Fonti raccolte». Due letture dello stesso giornale: la scheda
 * guardava l'ELENCO DEL RAPPORTO — che su una corsa fermata sulla sintesi non
 * esiste — e ne deduceva che nessuno avesse mai cercato.
 *
 * Queste prove fissano la risposta vera e, soprattutto, il VERSO CONTRARIO: una
 * corsa senza un solo passo di ricerca che abbia prodotto deve continuare a
 * dire «ancora da raccogliere», altrimenti la cura ha solo spostato la bugia.
 */

const NIENTE = { tokens: 0, searches: 0, pages: 0 }

function passo(over: Partial<TalosResearchStep> = {}): TalosResearchStep {
    return {
        id: 'b1:search',
        branchId: 'b1',
        kind: 'search',
        state: 'done',
        attempts: 1,
        startedAt: '2026-09-12T08:00:00.000Z',
        finishedAt: '2026-09-12T08:01:00.000Z',
        spend: NIENTE,
        resultRef: 'file-b1',
        error: null,
        ...over,
    }
}

function corsa(steps: readonly TalosResearchStep[], over: Partial<TalosResearchRun> = {}): TalosResearchRun {
    return {
        id: 'run-1',
        sessionId: 'chat-1',
        question: 'quanto costa una pagina?',
        depth: 'quick',
        engine: 'device',
        status: 'failed',
        title: null,
        plan: [
            { id: 'b1', question: 'prezzi per pagina', estimate: NIENTE },
            { id: 'b2', question: 'prezzi per parola', estimate: NIENTE },
        ],
        steps: [...steps],
        startedAt: '2026-09-12T08:00:00.000Z',
        updatedAt: '2026-09-12T08:10:00.000Z',
        ...over,
    }
}

describe('un passo che ha PRODOTTO, non uno che ha solo finito', () => {
    it('concluso e con il suo file: ha prodotto', () => {
        expect(talosResearchStepProduced(passo())).toBe(true)
    })

    /*
     * ⛔ Il verso contrario, e non è un caso di scuola: `done` dice che il passo
     * si è fermato senza errore, `resultRef` dice che ha lasciato qualcosa. Un
     * passo concluso a mani vuote fa promettere a una schermata un file che non
     * c'è.
     */
    it('⛔ concluso e a mani vuote: NON ha prodotto', () => {
        expect(talosResearchStepProduced(passo({ resultRef: null }))).toBe(false)
        expect(talosResearchStepProduced(passo({ resultRef: '   ' }))).toBe(false)
    })

    it('⛔ non concluso: non ha prodotto, qualunque cosa abbia in mano', () => {
        for (const state of ['pending', 'running', 'failed', 'interrupted'] as const) {
            expect(talosResearchStepProduced(passo({ state })), state).toBe(false)
        }
    })
})

describe('se le fonti di una corsa sono state raccolte', () => {
    it('una linea conclusa col suo file basta a dire di sì', () => {
        const run = corsa([
            passo({ id: 'b1:search', branchId: 'b1' }),
            passo({ id: 'b2:search', branchId: 'b2', state: 'pending', resultRef: null }),
        ])

        expect(talosResearchSourcesGathered(run)).toBe(true)
    })

    /*
     * ⛔ IL CASO DEL PAD: raccolta finita su tutte le linee, sintesi caduta.
     * Nessun rapporto, e quindi nessun elenco di fonti da mostrare — ma le
     * fonti ci sono, sono state pagate e sono sul disco.
     */
    it('⛔ raccolta finita e sintesi caduta: le fonti CI SONO', () => {
        const run = corsa([
            passo({ id: 'b1:search', branchId: 'b1' }),
            passo({ id: 'b2:search', branchId: 'b2' }),
            passo({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', state: 'failed', resultRef: null, error: 'HTTP 401' }),
        ])

        expect(talosResearchSourcesGathered(run)).toBe(true)
    })

    /* ⛔ AL CONTRARIO: nessun passo di ricerca concluso, nessuna fonte. */
    it('⛔ nessuna ricerca conclusa: le fonti sono ancora da raccogliere', () => {
        const run = corsa([
            passo({ id: 'b1:search', branchId: 'b1', state: 'running', resultRef: null }),
            passo({ id: 'b2:search', branchId: 'b2', state: 'failed', resultRef: null, error: 'nessuna sorgente' }),
        ])

        expect(talosResearchSourcesGathered(run)).toBe(false)
    })

    /*
     * ⛔ E una ricerca conclusa a mani vuote non conta: è il caso che rifarebbe
     * la bugia nell'altro verso — «raccolte» senza niente da mostrare.
     */
    it('⛔ ricerca conclusa senza file: ancora da raccogliere', () => {
        expect(talosResearchSourcesGathered(corsa([passo({ resultRef: null })]))).toBe(false)
    })

    /* La sintesi non raccoglie: un rapporto scritto non è una fonte trovata. */
    it('⛔ solo la sintesi ha prodotto: non è una raccolta', () => {
        const run = corsa([
            passo({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', resultRef: 'file-report' }),
        ])

        expect(talosResearchSourcesGathered(run)).toBe(false)
    })
})

describe('la stessa domanda, su UNA linea di ricerca', () => {
    const run = corsa([
        passo({ id: 'b1:search', branchId: 'b1', resultRef: 'file-b1' }),
        passo({ id: 'b2:search', branchId: 'b2', resultRef: null }),
    ])

    it('la linea che ha prodotto dice di sì, quella a mani vuote no', () => {
        expect(talosResearchSourcesGatheredFor(run, 'b1')).toBe(true)
        expect(talosResearchSourcesGatheredFor(run, 'b2')).toBe(false)
    })

    it('⛔ una linea che non ha nemmeno un passo non inventa una risposta', () => {
        expect(talosResearchSourcesGatheredFor(run, 'b3')).toBe(false)
    })
})

describe('la scheda porta la risposta con sé', () => {
    it('la scheda di una corsa che ha raccolto lo dice, anche senza rapporto', () => {
        const run = corsa([passo({ id: 'b1:search', branchId: 'b1' })])
        const scheda = talosResearchCardOf(run, { isRunning: false })

        expect(scheda.report).toBeNull()
        expect(scheda.sourcesGathered).toBe(true)
    })

    it('⛔ e quella di una corsa che non ha ancora cercato dice di no', () => {
        const run = corsa([passo({ state: 'pending', resultRef: null })])

        expect(talosResearchCardOf(run, { isRunning: false }).sourcesGathered).toBe(false)
    })
})
