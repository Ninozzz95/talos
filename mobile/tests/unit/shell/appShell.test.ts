import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { asyncRouteComponent, TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import App from '@/App.vue'

function makeController() {
    const attachmentItems = reactive<Array<Record<string, unknown>>>([])
    const attachmentError = ref<string | null>(null)
    return {
        catalogs: reactive({}),
        profiles: ref([]),
        selectedModelId: ref(null),
        effort: ref('high'),
        thinking: ref(false),
        canSend: ref(false),
        sendDisabledReason: ref('Add a provider API key in Settings'),
        preferenceError: ref(null),
        enhancingPrompt: ref(false),
        promptEnhancement: ref(null),
        promptEnhancementError: ref(null),
        attachments: {
            items: attachmentItems,
            vaultFiles: reactive([]),
            selecting: ref(false),
            error: attachmentError,
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
            clearSent: vi.fn(() => attachmentItems.splice(0, attachmentItems.length)),
            clearError: vi.fn(() => { attachmentError.value = null }),
        },
        chat: {
            messages: reactive([]),
            sessionBrowserActivities: reactive([]),
            sessions: reactive([]),
            activeSession: ref(null),
            state: reactive({ sending: false, persistenceStatus: 'ready', persistenceError: null }),
            retryPersistence: vi.fn().mockResolvedValue(undefined),
            loadComposerDraft: vi.fn().mockResolvedValue(''),
            saveComposerDraft: vi.fn().mockResolvedValue(undefined),
        },
        selectModel: vi.fn(),
        selectEffort: vi.fn(),
        setThinking: vi.fn(),
        enhancePrompt: vi.fn().mockResolvedValue(undefined),
        clearPromptEnhancement: vi.fn(),
        refreshConfiguredProviders: vi.fn().mockResolvedValue(undefined),
        init: vi.fn().mockResolvedValue(undefined),
        newSession: vi.fn().mockResolvedValue(undefined),
        selectSession: vi.fn().mockResolvedValue(undefined),
        renameSession: vi.fn().mockResolvedValue(undefined),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        resendMessage: vi.fn().mockResolvedValue(undefined),
        retryAssistantMessage: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(true),
    }
}

function makeRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: TALOS_MOBILE_ROUTES.map((r) => ({ path: r.path, name: r.name, component: asyncRouteComponent(r) })),
    })
}

describe('App shell (rail + chat base + station sheets)', () => {
    beforeEach(() => {
        // Skip the native lifecycle listener in jsdom via the fail-closed switch.
        window.__TALOS_M1_DISABLE__ = ['lifecycle']
        mockState.controller = makeController()
    })
    afterEach(() => {
        window.__TALOS_M1_DISABLE__ = undefined
    })

    it('renders the rail and the persistent chat base at /, with no sheet open', async () => {
        const router = makeRouter()
        router.push('/')
        await router.isReady()
        const w = mount(App, { global: { plugins: [router] } })
        await flushPromises()

        expect(w.find('[data-testid="talos-mobile-rail"]').exists()).toBe(true)
        expect(w.text()).toContain('What claim should we benchmark?') // chat base welcome
        expect(w.find('[data-testid="talos-mobile-tool-sheet"]').exists()).toBe(false)
        // bottom-nav is gone
        expect(w.find('[data-testid="ui-fallback"]').exists()).toBe(false)
    })

    it('opens a station in a tool-sheet over the persistent chat base, and closes back to chat', async () => {
        const router = makeRouter()
        router.push('/')
        await router.isReady()
        const w = mount(App, { global: { plugins: [router] } })
        await flushPromises()

        await router.push('/research')
        await flushPromises()

        const sheet = w.find('[data-testid="talos-mobile-tool-sheet"]')
        expect(sheet.exists()).toBe(true)
        expect(w.text()).toContain('Deep Research V3')
        // chat base still mounted behind the sheet
        expect(w.text()).toContain('What claim should we benchmark?')

        await w.get('[aria-label="Back to chat"]').trigger('click')
        await flushPromises()
        expect(w.find('[data-testid="talos-mobile-tool-sheet"]').exists()).toBe(false)
        expect(router.currentRoute.value.name).toBe('chat')
    })

    it('creates a durable session from the global New Chat rail command', async () => {
        const router = makeRouter()
        router.push('/research')
        await router.isReady()
        const wrapper = mount(App, { global: { plugins: [router] } })
        await flushPromises()

        await wrapper.get('[aria-label="New Chat"]').trigger('click')
        await flushPromises()

        expect((mockState.controller as ReturnType<typeof makeController>).newSession).toHaveBeenCalledTimes(1)
        expect(router.currentRoute.value.name).toBe('chat')
    })
})
