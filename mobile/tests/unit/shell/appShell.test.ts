import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { asyncRouteComponent, TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'
import { __resetSettingsStoreForTests } from '@/stores/settings'

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
        // R2-7: the shell/screens now flow through the lifecycle facade; the
        // mock delegates to the same spies so existing assertions still hold.
        get sessionLifecycle() {
            const self = this as unknown as Record<string, (...args: unknown[]) => Promise<void>>
            return {
                register: () => undefined,
                unregister: () => undefined,
                newSession: () => self.newSession(),
                selectSession: (id: unknown) => self.selectSession(id),
                renameSession: (id: unknown, title: unknown) => self.renameSession(id, title),
                deleteSession: (id: unknown) => self.deleteSession(id),
            }
        },
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

describe('App shell (header/sidebar + chat base + station sheets)', () => {
    beforeEach(() => {
        // Skip the native lifecycle listener in jsdom via the fail-closed switch.
        window.__TALOS_M1_DISABLE__ = ['lifecycle']
        mockState.controller = makeController()
        __resetSettingsStoreForTests()
        // Owner #15 made immersive/drawer the DEFAULT: these journeys exercise
        // the still-supported classic shell, so seed an explicit classic choice.
        window.localStorage.setItem('CapacitorStorage.talos.mobile.settings', JSON.stringify({
            defaults_v3: true,
            presentation_v2: true,
            shell: { immersive_header: false, composer_drawer: false },
            onboarding: { intro_version: 1, intro_outcome: 'completed', setup_dismissed: true },
        }))
    })
    afterEach(() => {
        window.__TALOS_M1_DISABLE__ = undefined
        window.localStorage.clear()
    })

    it('renders the header and the persistent chat base at /, with no sheet open', async () => {
        const router = makeRouter()
        router.push('/')
        await router.isReady()
        const w = mount(App, { global: { plugins: [router] } })
        await flushPromises()

        expect(w.find('[data-testid="talos-mobile-header"]').exists()).toBe(true)
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
        // F3-T0: the tool sheet is an async chunk — resolving needs a real
        // macrotask, so poll with waitFor instead of microtask flushes.
        await vi.waitFor(() => expect(w.find('[data-testid="talos-mobile-tool-sheet"]').exists()).toBe(true))
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
        await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('chat'))
    })

    // R2-SF-M2: the shell lost its busy guard when actions moved to the
    // lifecycle facade — a rapid double-tap created TWO empty sessions.
    it('a rapid double-tap on New Chat creates only ONE session (busy guard)', async () => {
        const controller = makeController()
        let release: () => void = () => {}
        controller.newSession = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
        mockState.controller = controller
        const wrapper = mount(App, { global: { plugins: [makeRouter()] } })
        await flushPromises()

        const button = wrapper.get('[aria-label="New Chat"]')
        await button.trigger('click')
        await button.trigger('click')
        await flushPromises()
        expect(controller.newSession).toHaveBeenCalledTimes(1)
        // The button reflects the busy state while the action is in flight.
        expect(wrapper.get('[aria-label="New Chat"]').attributes('disabled')).toBeDefined()

        release()
        await flushPromises()
        expect(wrapper.get('[aria-label="New Chat"]').attributes('disabled')).toBeUndefined()
    })
})
