import { describe, expect, it } from 'vitest'
import {
    talosResearchParseRecheckBlock,
    talosResearchRecheckBlock,
    talosResearchRecheckStoria,
    type TalosResearchRecheckTappa,
} from '@/lib/research/researchRecheckHistory'
import type { TalosResearchRecheck } from '@/lib/research/researchRecheck'

/**
 * ⛔ TENUTA-NEL-TEMPO-01 — la storia dei ricontrolli si RILEGGE, non si
 * ricostruisce dall'italiano stampato nel documento.
 */

function fonte(over: Partial<TalosResearchRecheck['sources'][number]>) {
    return {
        url: 'https://a.example',
        title: 'A',
        state: 'intact' as const,
        survived: 1,
        reason: null,
        passagesStanding: 2,
        passagesLost: 0,
        ...over,
    }
}

function tappa(over: Partial<TalosResearchRecheckTappa>): TalosResearchRecheckTappa {
    return {
        at: '2026-08-19T10:00:00.000Z',
        total: 2,
        intact: 2,
        changed: 0,
        unreachable: 0,
        passagesStanding: 4,
        passagesLost: 0,
        tenuta: 1,
        ...over,
    }
}

describe('il blocco che rende rileggibile un ricontrollo', () => {
    it('va e torna identico', () => {
        const recheck: TalosResearchRecheck = {
            at: '2026-09-03T08:00:00.000Z',
            sources: [fonte({}), fonte({ url: 'https://b.example', state: 'changed', survived: 0.6, passagesStanding: 1, passagesLost: 1 })],
        }
        const documento = ['# Ricontrollo — domanda', '', 'prosa per una persona', '', talosResearchRecheckBlock('run-7', recheck)].join('\n')

        const letto = talosResearchParseRecheckBlock(documento)
        expect(letto?.runId).toBe('run-7')
        expect(letto?.at).toBe('2026-09-03T08:00:00.000Z')
        expect(letto?.passagesStanding).toBe(3)
        expect(letto?.passagesLost).toBe(1)
        // ⛔ La tenuta si conta sui PASSAGGI, non sulle pagine: 3 su 4 reggono,
        //   anche se una delle due pagine risulta «cambiata».
        expect(letto?.tenuta).toBeCloseTo(0.75, 5)
    })

    it('⛔ e AL CONTRARIO: un documento SENZA blocco torna null, non uno zero', () => {
        // Uno zero finirebbe nella storia come un crollo, e sarebbe un crollo
        // inventato dal nostro formato.
        expect(talosResearchParseRecheckBlock('# Ricontrollo\n\nsolo prosa')).toBeNull()
        expect(talosResearchParseRecheckBlock('')).toBeNull()
        expect(talosResearchParseRecheckBlock(null)).toBeNull()
    })

    it('⛔ e un blocco ROTTO è un blocco che non c\'è', () => {
        expect(talosResearchParseRecheckBlock('```talos-research-recheck\n{non json\n```')).toBeNull()
        expect(talosResearchParseRecheckBlock('```talos-research-recheck\n{"at":"2026-01-01"}\n```')).toBeNull()
        expect(talosResearchParseRecheckBlock('```talos-research-recheck\n{"runId":"r"}\n```')).toBeNull()
    })

    it('niente passaggi da controllare = tenuta ignota, non tenuta zero', () => {
        const vuoto: TalosResearchRecheck = {
            at: '2026-09-03T08:00:00.000Z',
            sources: [fonte({ passagesStanding: 0, passagesLost: 0 })],
        }
        expect(talosResearchParseRecheckBlock(talosResearchRecheckBlock('r', vuoto))?.tenuta).toBeNull()
    })
})

describe('la storia, tappa per tappa', () => {
    it('mette in ordine di tempo e misura il salto', () => {
        const storia = talosResearchRecheckStoria([
            tappa({ at: '2026-09-03T08:00:00.000Z', tenuta: 0.86 }),
            tappa({ at: '2026-08-19T10:00:00.000Z', tenuta: 1 }),
        ])

        expect(storia.map((passo) => passo.at)).toEqual([
            '2026-08-19T10:00:00.000Z',
            '2026-09-03T08:00:00.000Z',
        ])
        expect(storia[0]!.primo).toBe(true)
        expect(storia[0]!.delta).toBeNull()
        expect(storia[1]!.delta).toBeCloseTo(-0.14, 5)
    })

    it('⛔ da «non misurata» a 0,86 NON è un guadagno dell\'86%', () => {
        const storia = talosResearchRecheckStoria([
            tappa({ at: '2026-08-19T10:00:00.000Z', tenuta: null }),
            tappa({ at: '2026-09-03T08:00:00.000Z', tenuta: 0.86 }),
        ])
        expect(storia[1]!.delta).toBeNull()
    })

    it('lo stesso istante due volte è lo stesso ricontrollo, non due', () => {
        const storia = talosResearchRecheckStoria([tappa({}), tappa({}), tappa({ at: '2026-09-03T08:00:00.000Z' })])
        expect(storia).toHaveLength(2)
    })

    it('una data illeggibile non entra in una linea del tempo', () => {
        expect(talosResearchRecheckStoria([tappa({ at: 'ieri' })])).toHaveLength(0)
        expect(talosResearchRecheckStoria([])).toHaveLength(0)
    })
})
