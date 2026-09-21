import { describe, expect, it } from 'vitest'
import {
    talosResearchContestedCard,
    talosResearchMarkedPassage,
    talosResearchOverreachingCard,
    type TalosResearchOpenClaim,
} from '@/lib/research/researchOpenCards'
import type { TalosResearchChecks } from '@/lib/research/researchVerification'

/**
 * ⛔ SCHEDE-APERTE-01 — il mockup approvato tiene DUE schede aperte sul
 * rapporto: la contesa e quella che eccede la sua fonte. Qui si prova chi
 * viene scelto, e soprattutto QUANDO NON si sceglie nessuno.
 */

const CHECKS: TalosResearchChecks = {
    resolved: 'page',
    quotePresent: true,
    quoteSpan: null,
    claimSupported: 'yes',
    supportReason: '',
    judge: 'qwen3-1.7b',
    judgedAt: '2026-08-20T10:00:00.000Z',
}

function claim(over: Partial<TalosResearchChecks>, testo = 'una affermazione', passage = 'un passaggio'): TalosResearchOpenClaim {
    return { text: testo, passage, checks: { ...CHECKS, ...over } }
}

describe('il passaggio evidenziato', () => {
    it('spezza in tre sul pezzo riconosciuto', () => {
        expect(talosResearchMarkedPassage('abcdefgh', { from: 2, to: 5 }))
            .toEqual({ before: 'ab', quote: 'cde', after: 'fgh' })
    })

    it('senza span il testo resta intero, e niente si evidenzia', () => {
        expect(talosResearchMarkedPassage('abc', null)).toEqual({ before: 'abc', quote: '', after: '' })
        expect(talosResearchMarkedPassage('abc', undefined)).toEqual({ before: 'abc', quote: '', after: '' })
    })

    it('⛔ e AL CONTRARIO: uno span fuori misura non evidenzia il pezzo SBAGLIATO', () => {
        // Lo span viene dalla lettura, il passaggio dal disco: possono
        // disallinearsi. Evidenziare a caso sposta la fiducia su una parola che
        // nessun giudice ha guardato — peggio che non evidenziare.
        for (const span of [{ from: -1, to: 3 }, { from: 2, to: 99 }, { from: 5, to: 2 }, { from: 3, to: 3 }]) {
            expect(talosResearchMarkedPassage('abcdefgh', span)).toEqual({ before: 'abcdefgh', quote: '', after: '' })
        }
    })

    it('un passaggio assente non fa esplodere niente', () => {
        expect(talosResearchMarkedPassage(null, { from: 0, to: 2 })).toEqual({ before: '', quote: '', after: '' })
    })
})

describe('la scheda della contesa', () => {
    const contro = { url: 'https://b.example', title: 'B', passage: 'dice il contrario', span: null }

    it('prende la prima contesa che ha i passaggi contrari', () => {
        const claims = [
            claim({ claimSupported: 'yes' }),
            claim({ claimSupported: 'contested', opposing: [contro] }, 'contesa vera'),
            claim({ claimSupported: 'contested', opposing: [contro] }, 'la seconda'),
        ]
        expect(talosResearchContestedCard(claims)?.claim.text).toBe('contesa vera')
        expect(talosResearchContestedCard(claims)?.index).toBe(1)
    })

    it('⛔ e AL CONTRARIO: una contesa SENZA i contrari non apre niente', () => {
        // Disegnerebbe due colonne di cui una vuota. `opposing` assente vuol
        // dire «una verifica vecchia non li ha guardati», non «non ce ne sono».
        expect(talosResearchContestedCard([claim({ claimSupported: 'contested' })])).toBeNull()
        expect(talosResearchContestedCard([claim({ claimSupported: 'contested', opposing: [] })])).toBeNull()
        expect(talosResearchContestedCard([
            claim({ claimSupported: 'contested', opposing: [{ ...contro, passage: '   ' }] }),
        ])).toBeNull()
    })

    it('un rapporto senza contese non ne inventa una', () => {
        expect(talosResearchContestedCard([claim({ claimSupported: 'yes' }), claim({ claimSupported: 'partial' })])).toBeNull()
        expect(talosResearchContestedCard([])).toBeNull()
        expect(talosResearchContestedCard(null)).toBeNull()
    })
})

describe('la scheda che eccede la fonte', () => {
    it('prende la prima parziale col motivo e il passaggio', () => {
        const claims = [
            claim({ claimSupported: 'yes' }),
            claim({ claimSupported: 'partial', supportReason: 'la fonte non lega la quantizzazione ad alcuna versione' }, 'eccede'),
        ]
        expect(talosResearchOverreachingCard(claims)?.claim.text).toBe('eccede')
        expect(talosResearchOverreachingCard(claims)?.index).toBe(1)
    })

    it('⛔ e AL CONTRARIO: senza il MOTIVO la scheda ripeterebbe la riga dell\'elenco', () => {
        expect(talosResearchOverreachingCard([claim({ claimSupported: 'partial' })])).toBeNull()
        expect(talosResearchOverreachingCard([claim({ claimSupported: 'partial', supportReason: '  ' })])).toBeNull()
    })

    it('⛔ e senza il PASSAGGIO non c\'è niente da mostrare sotto il motivo', () => {
        expect(talosResearchOverreachingCard([
            claim({ claimSupported: 'partial', supportReason: 'eccede' }, 'x', ''),
        ])).toBeNull()
    })

    it('una contesa non finisce nella scheda sbagliata', () => {
        const contesa = claim({ claimSupported: 'contested', supportReason: 'le fonti non concordano' })
        expect(talosResearchOverreachingCard([contesa])).toBeNull()
    })
})
