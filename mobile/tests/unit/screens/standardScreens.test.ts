import { beforeEach, describe, it, expect, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createTalosRun, setTalosRunStatus } from '@/lib/runs/longRunState'
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
        runs: {
            list: vi.fn().mockResolvedValue([]),
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
        // Honest gating (product review 2026-07-25): the stub no longer implies a backend query.
        expect(w.text()).toContain('Not in this build')
    })

    it('runs renders real persisted runs and an honest repository empty state', async () => {
        const w = mount(RunsScreen)
        await flushPromises()
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Runtime cockpit')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Runtime')
        expect(w.text()).toContain('No runs stored on this device')
        expect(w.text()).not.toContain('Not in this build')

        const persisted = setTalosRunStatus(createTalosRun({
            id: 'run-1',
            kind: 'research',
            sessionId: 'session-1',
            title: 'Market evidence',
            now: '2026-07-27T10:00:00.000Z',
        }), 'running', '2026-07-27T10:01:00.000Z')
        mockState.controller = {
            ...makeContextController(),
            runs: { list: vi.fn().mockResolvedValue([persisted]) },
        }
        const populated = mount(RunsScreen)
        await flushPromises()
        expect(populated.get('[data-testid="talos-run-row"]').text()).toContain('Market evidence')
        expect(populated.get('[data-testid="talos-run-row"]').text()).toContain('running')
        expect(populated.get('[data-testid="talos-run-row"]').text()).toContain('research')
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
