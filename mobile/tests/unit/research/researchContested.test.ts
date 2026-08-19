import { describe, expect, it } from 'vitest'
import {
    talosResearchContestedVerdict,
    talosResearchVerifiedStanding,
} from '@/lib/research/researchVerification'
import { talosResearchSupportLabel } from '@/lib/research/researchReport'

/**
 * ⛔⛔ CONTESA-01 — «contesa» non è «parziale», e confonderle mente.
 *
 * ## La distinzione, e perché non è una sfumatura
 *
 * - **parziale**: la fonte dice una parte di quello che l'affermazione afferma.
 *   Una fonte, un verdetto a metà.
 * - **contesa**: una fonte dice di sì e un'altra dice di no. Due fonti, due
 *   verdetti opposti, e nessuna metà da nessuna parte.
 *
 * Registrarle come la stessa cosa lusinga il rapporto **proprio dove è più
 * fragile**: una contesa segnalata come «parziale» si legge come «quasi
 * sostenuta», mentre vuol dire che il mondo non è d'accordo.
 *
 * ## Cosa dice la ricerca (2026-08-20)
 *
 * I conflitti sono di **tre tipi** distinti — conflitto nelle prove, conflitto
 * fra fonti sulle prove, conflitto dentro la stessa fonte — e la pratica
 * concorde è: **si mostrano entrambe le versioni**, con il perché differiscono
 * (metodo, portata, data, disciplina). Non si media, e non si sceglie in
 * silenzio la più comoda.
 *
 * ⇒ Il contratto porta le fonti contrarie col loro passaggio, così la scheda
 * può metterle a fianco invece di riassumerle in una parola sola.
 */

const SPAN = { from: 0, to: 4 }

function checks(over: Partial<{
    claimSupported: 'yes' | 'partial' | 'no' | 'unchecked' | 'contested'
    opposing: readonly { url: string, title: string, passage: string, span: typeof SPAN | null }[]
}> = {}) {
    return {
        resolved: 'page' as const,
        quotePresent: true,
        quoteSpan: SPAN,
        claimSupported: 'yes' as const,
        supportReason: '',
        judge: 'giudice',
        judgedAt: '2026-08-20T00:00:00.000Z',
        opposing: [],
        ...over,
    }
}

const CONTRARIA = {
    url: 'https://contraria.example/a',
    title: 'Dice il contrario',
    passage: 'La fonte contraria dice che no.',
    span: SPAN,
}

describe('CONTESA-01 il verdetto quando le fonti non concordano', () => {
    it('⛔ una fonte a favore e una contraria fanno CONTESA, non «sostenuta»', () => {
        expect(talosResearchContestedVerdict('yes', [CONTRARIA])).toBe('contested')
    })

    it('⛔ e nemmeno «parziale»: sono due cose diverse', () => {
        expect(talosResearchContestedVerdict('partial', [CONTRARIA])).toBe('contested')
    })

    it('senza fonti contrarie il verdetto resta quello del giudice', () => {
        expect(talosResearchContestedVerdict('yes', [])).toBe('yes')
        expect(talosResearchContestedVerdict('partial', [])).toBe('partial')
        expect(talosResearchContestedVerdict('no', [])).toBe('no')
    })

    it('⛔ e al contrario: se il giudice ha già detto NO, una contraria CONFERMA', () => {
        // Contesa vuol dire disaccordo. Una fonte che dice «no» accanto a un
        // verdetto «no» non è un disaccordo: è la stessa cosa detta due volte.
        expect(talosResearchContestedVerdict('no', [CONTRARIA])).toBe('no')
    })

    it('⛔ una NON verificata non diventa contesa: nessuno ha giudicato', () => {
        expect(talosResearchContestedVerdict('unchecked', [CONTRARIA])).toBe('unchecked')
    })
})

describe('CONTESA-01 il conto e la parola', () => {
    it('le contese si contano a parte, non dentro le parziali', () => {
        const standing = talosResearchVerifiedStanding([
            { claim: {} as never, passage: 'a', checks: checks({ claimSupported: 'yes' }) },
            { claim: {} as never, passage: 'b', checks: checks({ claimSupported: 'partial' }) },
            { claim: {} as never, passage: 'c', checks: checks({ claimSupported: 'contested', opposing: [CONTRARIA] }) },
            { claim: {} as never, passage: 'd', checks: checks({ claimSupported: 'contested', opposing: [CONTRARIA] }) },
        ] as never)

        expect(standing.total).toBe(4)
        expect(standing.supported).toBe(1)
        expect(standing.partial).toBe(1)
        expect(standing.contested).toBe(2)
    })

    it('⛔ una contesa NON viene contata fra le sostenute', () => {
        const standing = talosResearchVerifiedStanding([
            { claim: {} as never, passage: 'c', checks: checks({ claimSupported: 'contested', opposing: [CONTRARIA] }) },
        ] as never)

        expect(standing.supported).toBe(0)
        expect(standing.unsupported).toBe(0)
        expect(standing.contested).toBe(1)
    })

    it('la parola lo dice, e dice anche PERCHÉ', () => {
        const parola = talosResearchSupportLabel(
            checks({ claimSupported: 'contested', opposing: [CONTRARIA] }) as never,
        )
        expect(parola).toMatch(/contesa/i)
        expect(parola).toMatch(/non concordano|contrari/i)
    })

    it('le altre parole non cambiano', () => {
        expect(talosResearchSupportLabel(checks({ claimSupported: 'yes' }) as never))
            .toBe('sostenuta dalla fonte')
        expect(talosResearchSupportLabel(checks({ claimSupported: 'partial' }) as never))
            .toBe('sostenuta solo in parte')
        expect(talosResearchSupportLabel(checks({ claimSupported: 'no' }) as never))
            .toBe('NON sostenuta dalla fonte')
    })
})
