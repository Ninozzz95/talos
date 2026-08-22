import { describe, expect, it } from 'vitest'
import {
    talosResearchRecheckReport,
    talosResearchRecheckStanding,
    talosResearchSurvival,
} from '@/lib/research/researchRecheck'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'

const KEPT_A = 'La FIAT fu fondata l’11 luglio 1899 a Torino da Giovanni Agnelli e altri investitori del tempo.'
const KEPT_B = 'Il Monte Bianco misura 4805,59 metri secondo la misurazione francese del 2023 fatta in settembre.'

const REPORT: TalosResearchReportRecord = {
    version: 1,
    question: 'q',
    summary: 's',
    judge: 'local:qwen',
    claims: [
        {
            text: 'La FIAT è del 1899.',
            sourceIndex: 1,
            passage: 'La FIAT fu fondata l’11 luglio 1899 a Torino',
            checks: {
                resolved: 'page',
                quotePresent: true,
                quoteSpan: { from: 0, to: 43 },
                claimSupported: 'yes',
                supportReason: '',
                judge: 'local:qwen',
                judgedAt: '2026-08-02T00:00:00.000Z',
            },
        },
        {
            text: 'Il Monte Bianco misura 4805,59 metri.',
            sourceIndex: 2,
            passage: 'Il Monte Bianco misura 4805,59 metri',
            checks: {
                resolved: 'page',
                quotePresent: true,
                quoteSpan: { from: 0, to: 36 },
                claimSupported: 'yes',
                supportReason: '',
                judge: 'local:qwen',
                judgedAt: '2026-08-02T00:00:00.000Z',
            },
        },
    ],
    sources: [
        { url: 'https://a.it', title: 'A', publishedAt: null, obtained: 'page' },
        { url: 'https://b.it', title: 'B', publishedAt: null, obtained: 'page' },
    ],
}

const KEPT = new Map([['https://a.it', KEPT_A], ['https://b.it', KEPT_B]])

describe('how much of what we read is still there', () => {
    it('counts a page that only grew as intact', () => {
        // The question is "is what we relied on still there", not "are these two
        // pages identical". A site that added a paragraph took nothing away, and
        // calling that a change would raise an alarm on every living page.
        expect(talosResearchSurvival(KEPT_A, `${KEPT_A} Nel 1923 iniziò la produzione al Lingotto.`)).toBe(1)
    })

    it('notices when the text was rewritten', () => {
        expect(talosResearchSurvival(KEPT_A, 'Pagina non più disponibile. Consulta l’archivio storico aziendale.'))
            .toBeLessThan(0.5)
    })
})

describe('re-checking a dossier a year later', () => {
    it('separates intact, changed and unreachable', async () => {
        const recheck = await talosResearchRecheckReport({
            at: () => '2027-01-01T00:00:00.000Z',
            read: async (url) => (url === 'https://a.it'
                ? { text: `${KEPT_A} Aggiornato nel 2027.` }
                : null),
        }, REPORT, KEPT)

        expect(recheck.sources[0]!.state).toBe('intact')
        expect(recheck.sources[1]!.state).toBe('unreachable')
        expect(talosResearchRecheckStanding(recheck)).toEqual({
            total: 2, intact: 1, changed: 0, unreachable: 1, passagesLost: 0,
        })
    })

    /**
     * The measurement that decides whether the report still stands.
     *
     * A page can be rewritten from top to bottom; if the sentences we quoted
     * survived, the citations are as good as the day they were made. And a page
     * that merely reads similar while the quoted number changed is the case
     * every link-checker on the market silently passes.
     */
    it('tells a page that changed around the quotation from one that lost it', async () => {
        const recheck = await talosResearchRecheckReport({
            at: () => '2027-01-01T00:00:00.000Z',
            read: async (url) => (url === 'https://a.it'
                // Rewritten, but the quoted sentence survived word for word.
                ? { text: `Storia dell’azienda. La FIAT fu fondata l’11 luglio 1899 a Torino. Altro testo nuovo.` }
                // Same shape, but the number we cited is not the number any more.
                : { text: 'Il Monte Bianco misura 4808,00 metri secondo la misurazione francese del 2023 fatta in settembre.' }),
        }, REPORT, KEPT)

        expect(recheck.sources[0]!.state).toBe('changed')
        expect(recheck.sources[0]!.passagesStanding).toBe(1)
        expect(recheck.sources[0]!.passagesLost).toBe(0)

        expect(recheck.sources[1]!.passagesLost).toBe(1)
        expect(talosResearchRecheckStanding(recheck).passagesLost).toBe(1)
    })

    it('does not count passages as lost on a page it could not read', async () => {
        const recheck = await talosResearchRecheckReport({
            at: () => '2027-01-01T00:00:00.000Z',
            read: async () => { throw new Error('403') },
        }, REPORT, KEPT)

        // "We could not look" and "we looked and they are gone" are different
        // admissions, and the kept text still makes this dossier readable —
        // which is the whole reason it was kept.
        expect(recheck.sources.every((entry) => entry.passagesLost === 0)).toBe(true)
        expect(recheck.sources[0]!.reason).toBe('403')
        expect(talosResearchRecheckStanding(recheck).unreachable).toBe(2)
    })
})
