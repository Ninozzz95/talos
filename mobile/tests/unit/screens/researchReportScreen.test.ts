// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { TalosResearchRun, TalosResearchStep } from '@/lib/research/researchRun'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import ResearchScreen from '@/screens/ResearchScreen.vue'

const NOTHING = { searches: 0, pages: 0, tokens: 0 }

function step(over: Partial<TalosResearchStep>): TalosResearchStep {
    return {
        id: 'b1:search',
        branchId: 'b1',
        kind: 'search',
        state: 'done',
        attempts: 1,
        startedAt: '2026-08-02T10:00:00.000Z',
        finishedAt: '2026-08-02T10:01:00.000Z',
        spend: NOTHING,
        resultRef: null,
        error: null,
        ...over,
    }
}

const RUN: TalosResearchRun = {
    id: 'run-1',
    sessionId: 'chat-1',
    question: 'chi ha vinto?',
    depth: 'quick',
    engine: 'device',
    status: 'done',
    plan: [
        { id: 'b1', question: 'risultato', estimate: { searches: 1, pages: 3, minutes: 1, tokens: 100 } },
        { id: 'b2', question: 'ordine d’arrivo', estimate: { searches: 1, pages: 3, minutes: 1, tokens: 100 } },
    ],
    steps: [
        step({ id: 'b1:search', branchId: 'b1' }),
        step({ id: 'b2:search', branchId: 'b2' }),
        step({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', resultRef: 'file-report' }),
    ],
    startedAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-08-02T10:05:00.000Z',
}

const REPORT: TalosResearchReportRecord = {
    version: 1,
    question: 'chi ha vinto?',
    summary: 'Ha vinto Norris.',
    judge: 'local:qwen3-3b',
    claims: [
        {
            text: 'Norris ha vinto il Gran Premio.',
            sourceIndex: 1,
            passage: 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026',
            checks: {
                resolved: 'page',
                quotePresent: true,
                quoteSpan: { from: 0, to: 52 },
                claimSupported: 'yes',
                supportReason: 'lo dice testualmente',
                judge: 'local:qwen3-3b',
                judgedAt: '2026-08-02T10:04:00.000Z',
            },
        },
        {
            text: 'Antonelli è arrivato secondo.',
            sourceIndex: 2,
            passage: '',
            checks: {
                resolved: 'snippet',
                quotePresent: false,
                quoteSpan: null,
                claimSupported: 'unchecked',
                supportReason: 'il passaggio non è nel testo della fonte',
                judge: null,
                judgedAt: null,
            },
        },
    ],
    sources: [
        { url: 'https://rainews.it/x', title: 'Il resoconto', publishedAt: '2026-07-26', obtained: 'page' },
        { url: 'https://oasport.it/y', title: 'Ordine d’arrivo', publishedAt: null, obtained: 'snippet' },
    ],
}

function controllerWith(report: TalosResearchReportRecord | null) {
    return {
        research: {
            list: vi.fn().mockResolvedValue([RUN]),
            unfinished: vi.fn().mockResolvedValue([]),
            start: vi.fn(),
            resume: vi.fn(),
            report: vi.fn().mockResolvedValue(report),
        },
    }
}

async function settle(wrapper: { vm: { $nextTick: () => Promise<void> } }): Promise<void> {
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    await Promise.resolve()
    await wrapper.vm.$nextTick()
}

describe('the report a person can actually check', () => {
    beforeEach(() => { mockState.controller = controllerWith(REPORT) })

    /**
     * The counter that used to say "3 of 2".
     *
     * The synthesis counts among the finished steps but was missing from the
     * total, so the moment the report was written the station announced more
     * work done than existed. A progress line that can exceed its own total is
     * a progress line nobody can read.
     */
    it('counts the report as one of the steps it obviously is', async () => {
        const wrapper = mount(ResearchScreen)
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-progress"]').text()).toContain('3/3')
    })

    it('opens in layers: the answer first, the evidence only when asked', async () => {
        const wrapper = mount(ResearchScreen)
        await settle(wrapper)

        // Nothing of the report is on screen until it is opened.
        expect(wrapper.text()).not.toContain('Ha vinto Norris.')

        await wrapper.get('[data-testid="talos-research-open-report"]').trigger('click')
        await settle(wrapper)

        expect(wrapper.text()).toContain('Ha vinto Norris.')
        // The claims are listed, but their passages are not: that is the layer.
        expect(wrapper.findAll('[data-testid="talos-research-claim"]')).toHaveLength(2)
        expect(wrapper.find('[data-testid="talos-research-passage"]').exists()).toBe(false)

        await wrapper.findAll('[data-testid="talos-research-claim"]')[0]!.get('button').trigger('click')
        await settle(wrapper)

        // The exact words from the page — the thing a product that stores only
        // links cannot show at any price.
        expect(wrapper.get('[data-testid="talos-research-passage"]').text())
            .toContain('Lando Norris ha vinto il Gran Premio d’Ungheria 2026')
    })

    it('shows the standing and names the judge, which is never the author', async () => {
        const wrapper = mount(ResearchScreen)
        await settle(wrapper)
        await wrapper.get('[data-testid="talos-research-open-report"]').trigger('click')
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-standing"]').text()).toContain('1 of 2 supported')
        expect(wrapper.get('[data-testid="talos-research-standing"]').text()).toContain('1 unverified')
        expect(wrapper.get('[data-testid="talos-research-judge"]').text()).toBe('local:qwen3-3b')
        expect(wrapper.text()).toContain('never the one that wrote the report')
    })

    /**
     * The tablet showed `local:&#x2F;storage&#x2F;emulated&#x2F;…`.
     *
     * vue-i18n escapes what it interpolates, so a name holding a path is
     * mangled the moment it goes inside a phrase. The name is rendered beside
     * the sentence instead — the second time this project has paid for the same
     * lesson, hence a test rather than a comment.
     */
    it('shows a judge whose name contains slashes exactly as it is', async () => {
        mockState.controller = controllerWith({ ...REPORT, judge: 'local:/storage/emulated/0/qwen.gguf' })
        const wrapper = mount(ResearchScreen)
        await settle(wrapper)
        await wrapper.get('[data-testid="talos-research-open-report"]').trigger('click')
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-judge"]').text()).toBe('local:/storage/emulated/0/qwen.gguf')
        expect(wrapper.html()).not.toContain('&amp;#x2F;')
    })

    it('does not hide the claim whose quotation was never in the source', async () => {
        const wrapper = mount(ResearchScreen)
        await settle(wrapper)
        await wrapper.get('[data-testid="talos-research-open-report"]').trigger('click')
        await settle(wrapper)

        // Still listed, and marked. A report that drops its weakest claim tells
        // the reader it never had one.
        expect(wrapper.text()).toContain('Antonelli è arrivato secondo.')

        await wrapper.findAll('[data-testid="talos-research-claim"]')[1]!.get('button').trigger('click')
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-passage"]').text())
            .toContain('not in the source text')
    })

    /**
     * The tablet caught this one: the panel read the judge off the verdicts, so
     * a run whose citations all failed the mechanical check announced that no
     * independent judge had been available — while one was standing right
     * there. Nothing needed judging; that is a different sentence.
     */
    it('does not report "no judge" for a run that had one and nothing to use it on', async () => {
        mockState.controller = controllerWith({
            ...REPORT,
            claims: REPORT.claims.map((claim) => ({
                ...claim,
                checks: { ...claim.checks, claimSupported: 'unchecked' as const, judge: null, judgedAt: null },
            })),
        })
        const wrapper = mount(ResearchScreen)
        await settle(wrapper)
        await wrapper.get('[data-testid="talos-research-open-report"]').trigger('click')
        await settle(wrapper)

        expect(wrapper.text()).toContain('local:qwen3-3b')
        expect(wrapper.text()).not.toContain('there was no independent judge')
    })

    it('says so when the report cannot be read back', async () => {
        mockState.controller = controllerWith(null)
        const wrapper = mount(ResearchScreen)
        await settle(wrapper)
        await wrapper.get('[data-testid="talos-research-open-report"]').trigger('click')
        await settle(wrapper)

        expect(wrapper.get('[data-testid="talos-research-report"]').text()).toContain('cannot be read back')
    })
})
