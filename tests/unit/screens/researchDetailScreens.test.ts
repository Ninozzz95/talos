// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosResearchRun } from '@/lib/research/researchRun'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

const routeState = vi.hoisted(() => ({ params: { id: 'run-1', index: '0' } as Record<string, string> }))
const routerCalls = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => routeState, useRouter: () => routerCalls }))

import ResearchClaimScreen from '@/screens/ResearchClaimScreen.vue'
import ResearchSourceScreen from '@/screens/ResearchSourceScreen.vue'

/**
 * The two pages you reach by tapping a row in a report — the ones that hold the
 * evidence itself, and the only place the L3 claims of 2026-08-03 are actually
 * cashed: the passage that was kept, and how deeply the page behind it was read.
 */
const RUN: TalosResearchRun = {
    id: 'run-1',
    sessionId: 'chat-1',
    question: 'chi ha vinto?',
    depth: 'quick',
    engine: 'device',
    status: 'done',
    plan: [{ id: 'b1', question: 'risultato', estimate: { searches: 1, pages: 3, minutes: 1, tokens: 100 } }],
    steps: [{
        id: 'synthesis',
        branchId: 'synthesis',
        kind: 'synthesise',
        state: 'done',
        attempts: 1,
        startedAt: '2026-08-02T10:00:00.000Z',
        finishedAt: '2026-08-02T10:01:00.000Z',
        spend: { searches: 0, pages: 0, tokens: 0 },
        resultRef: 'file-report',
        error: null,
    }],
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
    ],
    sources: [
        // Index 0 — read whole, and nobody cites it.
        { url: 'https://rainews.it/x', title: 'Il resoconto', publishedAt: '2026-07-26', obtained: 'page' },
        // Index 1 — a snippet, and the single claim rests on it.
        { url: 'https://oasport.it/y', title: 'Ordine d’arrivo', publishedAt: null, obtained: 'snippet' },
    ],
}

function controllerWith(report: TalosResearchReportRecord | null, runs: readonly TalosResearchRun[] = [RUN]) {
    return {
        catalogs: {},
        research: {
            registry: {
                watch: vi.fn(() => () => {}),
                isRunning: vi.fn(() => false),
                running: vi.fn(() => []),
                latest: vi.fn(() => null),
                open: vi.fn(() => () => {}),
                close: vi.fn(),
            },
            list: vi.fn().mockResolvedValue(runs),
            unfinished: vi.fn().mockResolvedValue([]),
            start: vi.fn(),
            resume: vi.fn(),
            report: vi.fn().mockResolvedValue(report),
            recheck: vi.fn(),
            followUp: vi.fn(),
            exportReport: vi.fn(),
        },
    }
}

async function open(screen: unknown, params: Record<string, string>) {
    routeState.params = params
    const wrapper = mount(screen as never)
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    routerCalls.push.mockClear()
    mockState.controller = controllerWith(REPORT)
})

describe('the claim page', () => {
    it('shows the passage that was kept, not a link to go and look for it', async () => {
        // This is the whole L3 argument: the words the source actually contained
        // are stored at verification time, so the evidence survives the page.
        const wrapper = await open(ResearchClaimScreen, { id: 'run-1', index: '0' })

        expect(wrapper.text()).toContain('Norris ha vinto il Gran Premio.')
        const passage = wrapper.get('[data-testid="talos-research-passage"]')
        expect(passage.text()).toContain('Lando Norris ha vinto il Gran Premio d’Ungheria 2026')
    })

    it('names the verdict in the reader’s language, never the record’s Italian', async () => {
        // `talosResearchSupportLabel` writes the exported Markdown and is Italian
        // by definition. A screen that reused it would be Italian in an English
        // app, so the screens translate `checks.claimSupported` themselves.
        const wrapper = await open(ResearchClaimScreen, { id: 'run-1', index: '0' })
        // The suite runs in English, which is exactly what makes this bite: the
        // record's own label for this verdict is the Italian word "sostenuta".
        const verdict = wrapper.get('[data-testid="talos-research-verdict"]')
        expect(verdict.text()).toBe('supported')
    })

    it('leads to the source it rests on', async () => {
        const wrapper = await open(ResearchClaimScreen, { id: 'run-1', index: '0' })
        await wrapper.get('[data-testid="talos-research-claim-source"]').trigger('click')

        expect(routerCalls.push).toHaveBeenCalledWith({
            name: 'research-source',
            params: { id: 'run-1', index: '1' },
        })
    })

    it('says so plainly when the index points at nothing', async () => {
        // Reachable by URL, so reachable while wrong: a report re-run with fewer
        // claims leaves every deeper link out of range.
        const wrapper = await open(ResearchClaimScreen, { id: 'run-1', index: '9' })
        expect(wrapper.find('[data-testid="talos-research-claim-missing"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-research-passage"]').exists()).toBe(false)
    })
})

describe('the source page', () => {
    it('states reading depth in words — the fact no competitor exposes', async () => {
        const read = await open(ResearchSourceScreen, { id: 'run-1', index: '0' })
        expect(read.get('[data-testid="talos-research-depth"]').text()).toContain('page read')

        const skimmed = await open(ResearchSourceScreen, { id: 'run-1', index: '1' })
        expect(skimmed.get('[data-testid="talos-research-depth"]').text())
            .toContain('search-engine snippet only')
    })

    it('lists the claims that lean on it, and leads to each', async () => {
        const wrapper = await open(ResearchSourceScreen, { id: 'run-1', index: '1' })
        const claims = wrapper.findAll('[data-testid="talos-research-source-claim"]')
        expect(claims).toHaveLength(1)
        // Counted in words when there is one of it. The device showed the other
        // half of this bug as "1 linee di indagine non sono riuscite".
        expect(wrapper.text()).toContain('One claim rests on this source')
        expect(wrapper.text()).not.toContain('1 claims')

        await claims[0]!.trigger('click')
        expect(routerCalls.push).toHaveBeenCalledWith({
            name: 'research-claim',
            params: { id: 'run-1', index: '0' },
        })
    })

    it('says a source nobody cited was fetched and unused, instead of ending blank', async () => {
        // Seen on the device 2026-08-03: source 0 has no dependants, the section
        // was hidden by `v-if`, and the page stopped mid-air — indistinguishable
        // from one that had failed to finish loading.
        const wrapper = await open(ResearchSourceScreen, { id: 'run-1', index: '0' })
        expect(wrapper.findAll('[data-testid="talos-research-source-claim"]')).toHaveLength(0)
        expect(wrapper.get('[data-testid="talos-research-source-unused"]').text())
            .toBe('No claim in this report rests on this source.')
    })

    it('does not claim the source is unused when it is the page that is missing', async () => {
        // A deleted run has no sources at all; answering "nobody cites it" there
        // would be a statement about evidence that was never loaded.
        mockState.controller = controllerWith(null, [])
        const wrapper = await open(ResearchSourceScreen, { id: 'run-1', index: '0' })

        expect(wrapper.find('[data-testid="talos-research-source-missing"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-research-source-unused"]').exists()).toBe(false)
    })
})
