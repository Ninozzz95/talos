import { describe, expect, it } from 'vitest'
import { talosResearchDossierDocument, talosResearchParseDossier } from '@/lib/research/researchDossier'
import type { TalosResearchCollection } from '@/lib/research/researchCollector'

const COLLECTION: TalosResearchCollection = {
    branchId: 'b1',
    query: 'chi vinse il gran premio — fatti e numeri',
    sources: [
        {
            url: 'https://rainews.it/x',
            title: 'Norris vince davanti a Verstappen',
            publishedAt: '2026-07-26',
            text: 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026.',
            obtained: 'page',
        },
        {
            url: 'https://oasport.it/y',
            title: 'Ordine d’arrivo',
            publishedAt: null,
            text: 'Antonelli terzo.',
            obtained: 'snippet',
        },
    ],
    unreachable: [{ url: 'https://dead.example', reason: '403' }],
    spend: { searches: 1, pages: 1, tokens: 20 },
}

describe('a dossier that a person and a process both read', () => {
    it('comes back exactly as it went in', async () => {
        const back = talosResearchParseDossier(talosResearchDossierDocument(COLLECTION))

        // The passages must survive byte for byte: the citation check compares
        // against them, so anything lost here becomes a claim marked
        // unsupported for a reason that has nothing to do with the claim.
        expect(back?.sources).toEqual(COLLECTION.sources)
        expect(back?.unreachable).toEqual(COLLECTION.unreachable)
        expect(back?.query).toBe(COLLECTION.query)
    })

    it('still reads as a document, with the machine part out of the way', () => {
        const document = talosResearchDossierDocument(COLLECTION)

        expect(document.startsWith('# chi vinse')).toBe(true)
        expect(document).toContain('Lando Norris ha vinto')
        expect(document).toContain('(solo estratto dal motore di ricerca)')
        // Last, so a preview or a search snippet shows prose and not JSON.
        expect(document.indexOf('```talos-research-json')).toBeGreaterThan(document.indexOf('Antonelli terzo.'))
    })

    /**
     * THE refusal. A synthesis is about to check its citations against these
     * passages; a half-recovered dossier would verify claims against text that
     * is not what was read, which is worse than having no dossier at all.
     */
    it('refuses a document it cannot recover instead of guessing', () => {
        expect(talosResearchParseDossier('# solo prosa, nessun blocco')).toBeNull()
        expect(talosResearchParseDossier('```talos-research-json\n{ rotto')).toBeNull()
        expect(talosResearchParseDossier('```talos-research-json\n{"version":9}\n```')).toBeNull()
    })

    it('does not carry the spend, which the journal already counts', () => {
        const back = talosResearchParseDossier(talosResearchDossierDocument(COLLECTION))

        // A second copy of a number that is added up is a number that
        // eventually gets added twice.
        expect(back?.spend).toEqual({ searches: 0, pages: 0, tokens: 0 })
    })
})
