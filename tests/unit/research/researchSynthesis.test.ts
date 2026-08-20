import { describe, expect, it } from 'vitest'
import {
    talosResearchDistinctSources,
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


/**
 * ⛔⛔ DOPPIONI-01 — la stessa pagina, contata una volta per linea d’indagine.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20: il rapporto diceva «10 fonti» e l’elenco
 * portava wikipedia.org due volte, ultralytics.com due volte, ibm.com due
 * volte, huggingface.co due volte. Sei pagine contate dieci — e la misura
 * dell’indipendenza, che esiste per non gonfiare i numeri, era la prima
 * gonfiata.
 */
describe('la stessa pagina non si conta due volte', () => {
    const pagina = (url: string, text: string, title = 'T') => ({
        url, title, publishedAt: null, text, obtained: 'page' as const,
    })
    const linea = (...sources: ReturnType<typeof pagina>[]) => ({
        query: 'q', sources, characters: 0, truncated: false,
    } as never)

    it('due linee che trovano la stessa pagina la portano UNA volta', () => {
        const uscita = talosResearchDistinctSources([
            linea(pagina('https://a.example/x', 'testo'), pagina('https://b.example/y', 'altro')),
            linea(pagina('https://a.example/x', 'testo')),
        ])
        expect(uscita.map((f) => f.url)).toEqual(['https://a.example/x', 'https://b.example/y'])
    })

    it('⛔ e si tiene la copia col TESTO PIÙ LUNGO, non la prima', () => {
        // Due rami possono aver letto la stessa pagina con fortuna diversa,
        // e la copia più povera toglierebbe passaggi che l’altra aveva.
        const uscita = talosResearchDistinctSources([
            linea(pagina('https://a.example/x', 'corto')),
            linea(pagina('https://a.example/x', 'un testo molto piu lungo e completo')),
        ])
        expect(uscita).toHaveLength(1)
        expect(uscita[0]!.text).toBe('un testo molto piu lungo e completo')
    })

    it('il frammento e la barra finale non fanno due pagine', () => {
        const uscita = talosResearchDistinctSources([
            linea(
                pagina('https://a.example/x', 't'),
                pagina('https://a.example/x/', 't'),
                pagina('https://a.example/x#dove', 't'),
            ),
        ])
        expect(uscita).toHaveLength(1)
    })

    it('⛔ e AL CONTRARIO: la QUERY resta, perché distingue due articoli', () => {
        // Su moltissimi siti ?id=12 e ?id=13 sono due pagine diverse:
        // toglierla fonderebbe fonti che non c’entrano niente.
        const uscita = talosResearchDistinctSources([
            linea(pagina('https://a.example/p?id=12', 't'), pagina('https://a.example/p?id=13', 't')),
        ])
        expect(uscita).toHaveLength(2)
    })

    it('un indirizzo illeggibile resta sé stesso', () => {
        const uscita = talosResearchDistinctSources([
            linea(pagina('non-un-indirizzo', 't'), pagina('nemmeno-questo', 't')),
        ])
        expect(uscita).toHaveLength(2)
    })

    it('e la numerazione che vede il modello non salta', () => {
        // Il catalogo numera da 1 in avanti sulla lista deduplicata: un [6]
        // che punta alla stessa pagina di [1] è il modo esatto in cui due
        // affermazioni «da fonti diverse» vengono dalla stessa.
        const { prompt } = talosResearchSynthesisPrompt('q', [
            linea(pagina('https://a.example/x', 'testo', 'Uno')),
            linea(pagina('https://a.example/x', 'testo', 'Uno')),
        ] as never)
        expect(prompt).toContain('[1] Uno')
        expect(prompt).not.toContain('[2]')
    })
})
