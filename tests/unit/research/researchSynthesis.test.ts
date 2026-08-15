import { describe, expect, it } from 'vitest'
import {
    talosResearchParseSynthesis,
    talosResearchReportStanding,
    talosResearchSynthesisPrompt,
} from '@/lib/research/researchSynthesis'
import type { TalosResearchCollection, TalosResearchSource } from '@/lib/research/researchCollector'

function source(overrides: Partial<TalosResearchSource> = {}): TalosResearchSource {
    return {
        url: 'https://a.example',
        title: 'Il pezzo',
        publishedAt: '2026-07-01',
        text: 'Il prezzo di listino è sceso a 499 euro a luglio.',
        obtained: 'page',
        ...overrides,
    }
}

function collection(sources: TalosResearchSource[]): TalosResearchCollection {
    return {
        branchId: 'b1',
        query: 'quanto costa',
        sources,
        unreachable: [],
        spend: { searches: 1, pages: sources.length, tokens: 10 },
    }
}

describe('turning what was gathered into a report that can be checked', () => {
    it('numbers the sources and tells the model the quotation will be verified', () => {
        const { prompt, sources } = talosResearchSynthesisPrompt('quanto costa', [collection([source()])])

        expect(prompt).toContain('[1] Il pezzo')
        // Told because it is true, and because a model that knows the quotation
        // is checked stops inventing quotations.
        expect(prompt).toContain('meccanicamente')
        expect(sources).toHaveLength(1)
    })

    it('warns the model when a source is only a search-engine extract', () => {
        const { prompt } = talosResearchSynthesisPrompt('quanto costa', [
            collection([source({ obtained: 'snippet' })]),
        ])

        expect(prompt).toContain('solo estratto dal motore di ricerca')
    })

    /**
     * THE check this module exists for.
     *
     * The measured failure of the field is not too few citations, it is
     * citations that cannot be verified: 0.94 for looking grounded against 0.61
     * for actually being supported. We kept the page text, so the worst
     * category — the quotation that was never there — costs a substring
     * comparison and no model at all.
     */
    it('catches the quotation that was never on the page', () => {
        const sources = [source()]

        const report = talosResearchParseSynthesis([
            'SINTESI: costa meno di prima.',
            'Il prezzo è sceso a 499 euro | 1 | "sceso a 499 euro a luglio"',
            'Le vendite sono raddoppiate | 1 | "le vendite sono raddoppiate"',
        ].join('\n'), sources)

        expect(report.claims[0]!.quotePresent).toBe('yes')
        expect(report.claims[1]!.quotePresent).toBe('no')
        // Kept, not dropped: a report that quietly removes its weakest claims
        // tells the reader it had none.
        expect(report.claims).toHaveLength(2)
    })

    it('does not let curly quotes or stray spacing fail an honest citation', () => {
        const report = talosResearchParseSynthesis(
            'Il prezzo è sceso | 1 | "sceso   a 499 euro"',
            [source({ text: 'Il prezzo di listino è sceso\na 499 euro a luglio.' })],
        )

        // The page and the model disagree about whitespace, never about meaning.
        expect(report.claims[0]!.quotePresent).toBe('yes')
    })

    it('calls a citation of a source nobody handed out unchecked, not passed', () => {
        const report = talosResearchParseSynthesis('Qualcosa | 7 | "qualunque cosa"', [source()])

        expect(report.claims[0]!.quotePresent).toBe('unchecked')
        // And it counts against the standing: not checked is not survived.
        expect(talosResearchReportStanding(report)).toEqual({ total: 1, supported: 0, unsupported: 1 })
    })

    it('ignores a line it cannot read instead of guessing what was meant', () => {
        const report = talosResearchParseSynthesis([
            'SINTESI: eccola.',
            'una riga senza fonte né passaggio',
            'Affermazione buona | 1 | "sceso a 499 euro"',
        ].join('\n'), [source()])

        // A parser that rescues a malformed citation is a parser that invents
        // attributions, which is the failure this file is aimed at.
        expect(report.claims).toHaveLength(1)
        expect(report.summary).toBe('eccola.')
    })

    it('reports how much of it held up, per claim rather than as one number', () => {
        const report = talosResearchParseSynthesis([
            'Vera | 1 | "sceso a 499 euro"',
            'Inventata | 1 | "mai scritto"',
            'Anche vera | 1 | "a luglio"',
        ].join('\n'), [source()])

        expect(talosResearchReportStanding(report)).toEqual({ total: 3, supported: 2, unsupported: 1 })
    })
})

describe('the template handed back instead of an answer', () => {
    /**
     * A real run on the tablet: the model returned six lines that each began
     * with the word AFFERMAZIONE, and the report filed six claims whose text
     * was the name of the field. Dropping them leaves nothing, which makes the
     * step fail — the honest outcome, because nothing was claimed.
     */
    it('is not read as a claim', () => {
        const report = talosResearchParseSynthesis([
            'SINTESI: il monte è alto 4808 metri.',
            'AFFERMAZIONE | 1 | "alto 4808 metri"',
            '<l’affermazione> | 1 | "alto 4808 metri"',
            'Il monte è alto 4808 metri | 1 | "alto 4808 metri"',
        ].join('\n'), [{
            url: 'https://x.it',
            title: 'x',
            publishedAt: null,
            text: 'Il monte è alto 4808 metri sul livello del mare.',
            obtained: 'page',
        }])

        expect(report.claims).toHaveLength(1)
        expect(report.claims[0]!.text).toBe('Il monte è alto 4808 metri')
    })
})
