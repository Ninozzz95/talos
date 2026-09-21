import { describe, expect, it } from 'vitest'
import { talosResearchParseReport, talosResearchReportDocument } from '@/lib/research/researchReport'
import { talosResearchJudgeOrder } from '@/lib/research/researchVerification'
import type { TalosResearchVerifiedClaim } from '@/lib/research/researchVerification'
import type { TalosResearchSource } from '@/lib/research/researchCollector'

const SOURCES: readonly TalosResearchSource[] = [
    {
        url: 'https://rainews.it/x',
        title: 'Il resoconto',
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
]

function verified(over: Partial<TalosResearchVerifiedClaim['checks']> = {}, text = 'Norris ha vinto.'): TalosResearchVerifiedClaim {
    return {
        claim: { text, sourceIndex: 1, quote: 'Lando Norris ha vinto', quotePresent: 'yes' },
        passage: 'Lando Norris ha vinto',
        checks: {
            resolved: 'page',
            quotePresent: true,
            quoteSpan: { from: 0, to: 21 },
            claimSupported: 'yes',
            supportReason: 'lo dice testualmente',
            judge: 'local:qwen3-3b',
            judgedAt: '2026-08-02T10:00:00.000Z',
            ...over,
        },
    }
}

describe('the report carries its own verification record', () => {
    it('comes back with every verdict attached to the claim it belongs to', () => {
        const document = talosResearchReportDocument({
            question: 'chi ha vinto?',
            summary: 'Ha vinto Norris.',
            judge: 'local:qwen3-3b',
            claims: [verified(), verified({ claimSupported: 'no', supportReason: 'parla di un’altra gara' }, 'Verstappen ha vinto.')],
            sources: SOURCES,
        })

        const back = talosResearchParseReport(document)

        // This is the structural bet of the phase: the check survives as an
        // artefact. A month from now the reader can see what was verified, by
        // whom, and against which words — and R12 can run it again and compare.
        expect(back?.claims[0]!.checks.claimSupported).toBe('yes')
        expect(back?.claims[0]!.checks.judge).toBe('local:qwen3-3b')
        expect(back?.claims[1]!.checks.claimSupported).toBe('no')
        expect(back?.claims[1]!.text).toBe('Verstappen ha vinto.')
        expect(back?.sources[1]!.obtained).toBe('snippet')
    })

    it('reads as a layered document, answer first and sources last', () => {
        const document = talosResearchReportDocument({
            question: 'chi ha vinto?',
            summary: 'Ha vinto Norris.',
            judge: 'local:qwen3-3b',
            claims: [verified()],
            sources: SOURCES,
        })

        expect(document.indexOf('Ha vinto Norris.')).toBeLessThan(document.indexOf('## Le affermazioni'))
        expect(document.indexOf('## Le affermazioni')).toBeLessThan(document.indexOf('## Fonti (2)'))
        // The machine record goes last, so a preview shows prose and not JSON.
        expect(document.indexOf('```talos-research-report')).toBeGreaterThan(document.indexOf('## Fonti (2)'))
    })

    it('says who verified, and says it plainly when nobody did', () => {
        const withJudge = talosResearchReportDocument({
            question: 'q', summary: 's', judge: 'local:qwen3-3b', claims: [verified()], sources: SOURCES,
        })
        const without = talosResearchReportDocument({
            question: 'q',
            summary: 's',
            judge: null,
            claims: [verified({ claimSupported: 'unchecked', supportReason: 'nessun giudice', judge: null, judgedAt: null })],
            sources: SOURCES,
        })

        expect(withJudge).toContain('mai dal modello che ha scritto il rapporto')
        // The absence is stated rather than left blank: a reader who sees no
        // verification line assumes there was one and it passed.
        expect(without).toContain('Verifica non eseguita')
        expect(without).toContain('non verificata')
    })

    it('shows the citation that was not in the source instead of quietly dropping it', () => {
        const document = talosResearchReportDocument({
            question: 'q',
            summary: 's',
            judge: 'local:qwen3-3b',
            claims: [{
                claim: { text: 'Inventata.', sourceIndex: 1, quote: 'mai scritto', quotePresent: 'no' },
                passage: '',
                checks: {
                    resolved: 'page',
                    quotePresent: false,
                    quoteSpan: null,
                    claimSupported: 'unchecked',
                    supportReason: 'il passaggio non è nel testo della fonte',
                    judge: null,
                    judgedAt: null,
                },
            }],
            sources: SOURCES,
        })

        expect(document).toContain('non è nel testo della fonte')
        expect(document).toContain('"mai scritto"')
    })

    /**
     * Found on the tablet, and the reason the judge is recorded once for the
     * run instead of being read off the verdicts.
     */
    it('does not claim there was no judge when every citation simply failed the earlier check', () => {
        const document = talosResearchReportDocument({
            question: 'q',
            summary: 's',
            judge: 'local:qwen3-3b',
            claims: [verified({
                quotePresent: false,
                quoteSpan: null,
                claimSupported: 'unchecked',
                supportReason: 'il passaggio non è nel testo della fonte',
                judge: null,
                judgedAt: null,
            })],
            sources: SOURCES,
        })

        expect(document).toContain('local:qwen3-3b')
        expect(document).not.toContain('Verifica non eseguita')
        expect(talosResearchParseReport(document)?.judge).toBe('local:qwen3-3b')
    })

    it('refuses a report it cannot recover instead of guessing', () => {
        expect(talosResearchParseReport('# solo prosa')).toBeNull()
        expect(talosResearchParseReport('```talos-research-report\n{ rotto')).toBeNull()
        expect(talosResearchParseReport('```talos-research-report\n{"version":9}\n```')).toBeNull()
    })
})

describe('which house is asked to judge, and in what order', () => {
    const PROVIDERS = ['anthropic', 'deepseek', 'local', 'openrouter'] as const

    it('asks the device first, then a different house, and the author’s own last', () => {
        expect(talosResearchJudgeOrder('deepseek', PROVIDERS, 'local')).toEqual([
            'local', 'anthropic', 'openrouter', 'deepseek',
        ])
    })

    it('puts the device first even when the author is on the device', () => {
        // Not a contradiction: the picker still refuses the author's exact
        // model, so this means "another local model if there is one".
        expect(talosResearchJudgeOrder('local', PROVIDERS, 'local')[0]).toBe('local')
    })
})
