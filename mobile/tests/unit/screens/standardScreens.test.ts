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
    it('research: Deep Research V3 header + Deep research eyebrow + real empty copy', () => {
        const w = mount(ResearchScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Deep Research V3')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Deep research')
        expect(w.text()).toContain('Queue or select a report to inspect source status, claims, graph evidence, and artifacts.')
    })

    it('runs: Runtime cockpit header + Runtime eyebrow + real empty copy', () => {
        const w = mount(RunsScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Runtime cockpit')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Runtime')
        expect(w.text()).toContain('No execution runs returned by the run API yet.')
    })

    it('context: Library header + Context Vault section chrome + local-first empty state', () => {
        const w = mount(ContextScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Library')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Context Vault')
        expect(w.text()).toContain('Context Vault')
        expect(w.text()).toContain('Documents')
        expect(w.text()).toContain('No files in your Vault')
        expect(w.text()).not.toContain('/api/talos/context-sets')
    })
})
