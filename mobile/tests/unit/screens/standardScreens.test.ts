// @vitest-environment jsdom

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'
import ResearchScreen from '@/screens/ResearchScreen.vue'
import RunsScreen from '@/screens/RunsScreen.vue'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import ContextScreen from '@/screens/ContextScreen.vue'

function makeContextController() {
    return {
        init: vi.fn().mockResolvedValue(undefined),
        // R-1: the station now drives real runs, so the double has to answer
        // the two questions it asks on mount.
        research: {
            list: vi.fn().mockResolvedValue([]),
            unfinished: vi.fn().mockResolvedValue([]),
            start: vi.fn().mockResolvedValue(undefined),
            resume: vi.fn().mockResolvedValue(undefined),
        },
        attachments: {
            items: reactive([]),
            vaultFiles: reactive([]),
            selecting: ref(false),
            error: ref(null),
            vaultLoading: ref(false),
            vaultError: ref(null),
            hasAuthorized: ref(false),
            blocking: ref(false),
            bindings: ref([]),
            initialize: vi.fn().mockResolvedValue(undefined),
            refreshVault: vi.fn().mockResolvedValue(undefined),
            selectFiles: vi.fn().mockResolvedValue(undefined),
            attachExisting: vi.fn().mockResolvedValue(true),
            remove: vi.fn().mockResolvedValue(undefined),
            deleteVaultFile: vi.fn().mockResolvedValue(undefined),
            discardAll: vi.fn().mockResolvedValue(undefined),
            clearSent: vi.fn(),
            clearError: vi.fn(),
        },
    }
}

beforeEach(() => {
    mockState.controller = makeContextController()
})

describe('standard tab screens (verbatim desktop parity, step-1 empty states)', () => {
    /**
     * R-1 landed here on 2026-08-02: the station stopped being a stub, so the
     * assertion that it says "Not in this build" stopped being true. The header
     * parity stays — that was never about the stub — and what replaces the stub
     * copy is the thing the phase is FOR: a rehearsal run you can start.
     */
    /**
     * R-2, 2026-08-02: you cannot start a run you have not seen.
     *
     * The station no longer offers a start button next to the question. A plan
     * is proposed first, it can be edited, and only then can anything be spent
     * — which is the phase in one sentence. Gemini shows a plan; nobody shows
     * what it will cost, and that is the line this asserts on.
     */
    it('research: proposes a plan first, and states the work before anything is spent', async () => {
        const w = mount(ResearchScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Deep Research V3')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Deep research')

        // Nothing to start yet: there is no plan, so there is no button.
        expect(w.find('[data-testid="talos-research-start"]').exists()).toBe(false)

        await w.get('[data-testid="talos-research-question"]').setValue('quale tablet conviene')
        await w.get('[data-testid="talos-research-propose"]').trigger('click')

        expect(w.find('[data-testid="talos-research-plan"]').exists()).toBe(true)
        expect(w.get('[data-testid="talos-research-totals"]').text()).toContain('pages')
        // The money is refused, not invented: no provider price is wired yet.
        expect(w.get('[data-testid="talos-research-cost"]').text()).toContain('cannot be worked out')
        expect(w.get<HTMLButtonElement>('[data-testid="talos-research-start"]').element.disabled).toBe(false)
    })

    it('runs: Runtime cockpit header + Runtime eyebrow + real empty copy', () => {
        const w = mount(RunsScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Runtime cockpit')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Runtime')
        expect(w.text()).toContain('Not in this build')
    })

    it('context: Library header + Context Vault section chrome + local-first empty state', () => {
        const w = mount(ContextScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Library')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Context Vault')
        expect(w.text()).toContain('Context Vault')
        expect(w.text()).toContain('No files yet')
        expect(w.text()).not.toContain('/api/talos/context-sets')
    })
})
