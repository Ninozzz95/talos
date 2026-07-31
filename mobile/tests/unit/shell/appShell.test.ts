// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'
import { __resetSettingsStoreForTests } from '@/stores/settings'
import { createDefaultTalosMotionV6Preferences } from '@/motion-v6/defaults'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import App from '@/App.vue'

function makeController() {
    const attachmentItems = reactive<Array<Record<string, unknown>>>([])
    const attachmentError = ref<string | null>(null)
    const emptyCatalog = () => reactive({
        status: 'idle',
        models: [] as Array<Record<string, unknown>>,
        error: null,
        updatedAt: null,
        configured: false,
    })
    return {
        catalogs: reactive({
            openai: emptyCatalog(),
            deepseek: emptyCatalog(),
            anthropic: emptyCatalog(),
            gemini: emptyCatalog(),
            openrouter: emptyCatalog(),
            ollama: emptyCatalog(),
        }),
        secrets: reactive({}),
        endpoints: reactive({}),
        modelLabPreferences: ref({
            schema_version: 1,
            manual_models: [],
            model_overrides: {},
            provider_runtime: {},
            probe_results: {},
        }),
        profiles: ref([]),
        selectedModelId: ref(null),
        effort: ref('high'),
        thinking: ref(false),
        // The tool block: what is running, and any write waiting for an answer.
        toolActivity: ref([] as string[]),
        pendingToolAuthorizations: ref([]),
        toolAuthorizationRecoveries: ref([]),
        toolAuthorizationPromptVisible: ref(false),
        decideToolAuthorization: vi.fn().mockResolvedValue(true),
        dismissToolAuthorization: vi.fn(),
        showToolAuthorization: vi.fn(),
        hideToolAuthorizations: vi.fn(),
        retryToolAuthorization: vi.fn().mockResolvedValue(true),
        cancelToolAuthorization: vi.fn().mockResolvedValue(true),
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
            previewUrl: vi.fn().mockResolvedValue(null),
            previewBytes: vi.fn().mockResolvedValue(new Uint8Array()),
            hydrateText: vi.fn().mockResolvedValue(null),
            setVaultFileShared: vi.fn().mockResolvedValue(undefined),
            discardAll: vi.fn().mockResolvedValue(undefined),
            clearSent: vi.fn(() => attachmentItems.splice(0, attachmentItems.length)),
            clearError: vi.fn(() => { attachmentError.value = null }),
        },
        chat: {
            messages: reactive([]),
            sessionBrowserActivities: reactive([]),
            sessions: reactive([] as Array<Record<string, unknown>>),
            /** Derived like the store's, so the shell cannot read a stale copy. */
            get history() {
                return (this.sessions as Array<{ has_messages?: boolean }>)
                    .filter((session) => session.has_messages !== false)
            },
            activeSession: ref(null),
            state: reactive({ sending: false, persistenceStatus: 'ready', persistenceError: null }),
            retryPersistence: vi.fn().mockResolvedValue(undefined),
            loadComposerDraft: vi.fn().mockResolvedValue(''),
            saveComposerDraft: vi.fn().mockResolvedValue(undefined),
            setSessionLibraryContextPolicy: vi.fn().mockResolvedValue(undefined),
        },
        selectModel: vi.fn(),
        saveKey: vi.fn().mockResolvedValue(undefined),
        removeKey: vi.fn().mockResolvedValue(undefined),
        saveEndpoint: vi.fn().mockResolvedValue(undefined),
        removeEndpoint: vi.fn().mockResolvedValue(undefined),
        setProviderTimeout: vi.fn().mockResolvedValue(undefined),
        refreshProvider: vi.fn().mockResolvedValue(undefined),
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
        listChatMediaFileIds: vi.fn().mockResolvedValue([]),
        planSessionCleanup: vi.fn(() => ({ documents: [], sources: [] })),
        resendMessage: vi.fn().mockResolvedValue(undefined),
        retryAssistantMessage: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(true),
    }
}

function makeRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: TALOS_MOBILE_ROUTES.map((r) => ({ path: r.path, name: r.name, component: r.component })),
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
            onboarding: { intro_version: 2, intro_outcome: 'completed', setup_dismissed: true },
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
        expect(w.find('[data-testid="talos-empty-brand"] h1').text().trim()).not.toBe('')
        expect(w.find('[data-testid="talos-mobile-composer"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-mobile-tool-sheet"]').exists()).toBe(false)
        // bottom-nav is gone
        expect(w.find('[data-testid="ui-fallback"]').exists()).toBe(false)
    })

    it('P1-CTX-UI-03 binds the active chat policy to its media panel', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        const sessionPolicy = {
            schema_version: 1,
            revision: 3,
            enabled: true,
            mode: 'ask_before_use_v1',
            included_file_ids: [],
            excluded_file_ids: [],
            updated_at: '2026-07-29T12:00:00.000Z',
        }
        const session = {
            id: 's1',
            title: 'Policy owner',
            metadata: { library_context_policy: sessionPolicy },
            active_model_profile_id: null,
        }
        controller.chat.sessions.push(session)
        controller.chat.activeSession.value = session as never
        window.localStorage.setItem('CapacitorStorage.talos.mobile.settings', JSON.stringify({
            defaults_v3: true,
            presentation_v2: true,
            shell: {
                immersive_header: false,
                composer_drawer: false,
                library_context_enabled: true,
                library_context_policy: {
                    schema_version: 1,
                    revision: 2,
                    enabled: true,
                    mode: 'smart_relevant_v1',
                    included_file_ids: [],
                    excluded_file_ids: [],
                    updated_at: '2026-07-29T11:00:00.000Z',
                },
            },
            onboarding: { intro_version: 2, intro_outcome: 'completed', setup_dismissed: true },
        }))
        const router = makeRouter()
        router.push('/')
        await router.isReady()
        const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
        await flushPromises()

        await wrapper.get('[data-testid="talos-mobile-header-title"]').trigger('click')
        await vi.waitFor(() => {
            expect(document.body.querySelector('[data-testid="talos-chat-media-context-policy"]'))
                .not.toBeNull()
        })
        const policy = document.body.querySelector(
            '[data-testid="talos-chat-media-context-policy"]',
        ) as HTMLElement
        expect(policy.dataset.mode).toBe('ask_before_use_v1')
        expect(policy.dataset.source).toBe('chat')
        wrapper.unmount()
    })

    it('TOOL-AUTH-25 renders explicit uncertain-work recovery above normal consent', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.toolAuthorizationRecoveries.value = [{
            checkpoint_id: 'checkpoint-recovery',
            session_id: 'session-recovery',
            session_title: 'Q2 recovery',
            model_profile_id: 'anthropic:claude-live',
            tools: [{ tool: 'document_create', actions: ['write'] }],
            created_at: '2026-07-29T12:00:00.000Z',
            updated_at: '2026-07-29T12:00:00.000Z',
        }]
        controller.pendingToolAuthorizations.value = [{
            request_id: 'request-pending',
            checkpoint_id: 'checkpoint-pending',
        }]
        controller.toolAuthorizationPromptVisible.value = true
        const router = makeRouter()
        router.push('/')
        await router.isReady()

        const wrapper = mount(App, { global: { plugins: [router] } })
        await flushPromises()

        expect(controller.toolAuthorizationRecoveries.value).toHaveLength(1)
        await vi.waitFor(() => {
            expect(document.body.querySelector('[data-testid="talos-tool-recovery"]'))
                .not.toBeNull()
        })
        expect(document.body.querySelector('[data-testid="talos-tool-consent"]'))
            .toBeNull()

        const cancel = document.body.querySelector<HTMLButtonElement>(
            '[data-testid="talos-tool-recovery-cancel"]',
        )
        expect(cancel).not.toBeNull()
        cancel!.click()
        await flushPromises()
        expect(controller.cancelToolAuthorization).toHaveBeenCalledWith('checkpoint-recovery')
        wrapper.unmount()
    })

    it('MOTION-PRODUCT-02 projects persisted per-category interaction preferences into the shell', async () => {
        const motion = createDefaultTalosMotionV6Preferences()
        motion.interface.categories.navigation = false
        motion.interface.categories.composer = true
        motion.interface.duration_scale = 150
        window.localStorage.setItem('CapacitorStorage.talos.mobile.settings', JSON.stringify({
            defaults_v3: true,
            presentation_v2: true,
            shell: { immersive_header: false, composer_drawer: true, immersive_composer: true },
            motion_v6: motion,
            onboarding: { intro_version: 2, intro_outcome: 'completed', setup_dismissed: true },
        }))

        const router = makeRouter()
        router.push('/')
        await router.isReady()
        const wrapper = mount(App, { global: { plugins: [router] } })
        await flushPromises()
        const shell = wrapper.get<HTMLElement>('[data-talos-route]')

        expect(shell.element.style.getPropertyValue('--talos-motion-duration-tab-change')).toBe('0ms')
        expect(shell.element.style.getPropertyValue('--talos-motion-duration-composer-expand'))
            .toMatch(/^[1-9]\d*ms$/)
        expect(shell.element.style.getPropertyValue('--talos-motion-duration-composer-collapse'))
            .toMatch(/^[1-9]\d*ms$/)
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
        expect(w.find('[data-testid="talos-empty-brand"] h1').text().trim()).not.toBe('')
        expect(w.find('[data-testid="talos-mobile-composer"]').exists()).toBe(true)

        await w.get('[aria-label="Back to chat"]').trigger('click')
        await flushPromises()
        expect(w.find('[data-testid="talos-mobile-tool-sheet"]').exists()).toBe(false)
        expect(router.currentRoute.value.name).toBe('chat')
    })

    it('sidebar Model Lab deep-links to the real Models panel while Settings stays generic', async () => {
        const router = makeRouter()
        router.push('/')
        await router.isReady()
        const wrapper = mount(App, {
            global: { plugins: [router] },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.get('[aria-label="Open menu"]').trigger('click')
        await vi.waitFor(() => {
            expect(document.body.querySelector(
                '[data-testid="talos-mobile-sidebar"] [aria-label="Open Model Lab"]',
            )).not.toBeNull()
        })
        ;(document.body.querySelector(
            '[data-testid="talos-mobile-sidebar"] [aria-label="Open Model Lab"]',
        ) as HTMLButtonElement).click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.name).toBe('settings')
            expect(router.currentRoute.value.query.tab).toBe('models')
        })

        await router.push('/')
        await wrapper.get('[aria-label="Open menu"]').trigger('click')
        await vi.waitFor(() => {
            expect(document.body.querySelector(
                '[data-testid="talos-mobile-sidebar"] [aria-label="Open Settings"]',
            )).not.toBeNull()
        })
        ;(document.body.querySelector(
            '[data-testid="talos-mobile-sidebar"] [aria-label="Open Settings"]',
        ) as HTMLButtonElement).click()
        await vi.waitFor(() => {
            expect(router.currentRoute.value.name).toBe('settings')
            expect(router.currentRoute.value.query.tab).toBeUndefined()
        })
        wrapper.unmount()
    })

    // Owner 2026-07-24: New Chat now lives inside the header 3-dot options menu
    // (shared with the immersive chrome), not as a standalone button.
    async function newChatFromOptions(wrapper: ReturnType<typeof mount>): Promise<void> {
        await wrapper.get('[aria-label="Chat options"]').trigger('click')
        await flushPromises()
        const item = [...document.body.querySelectorAll('[role="menuitem"]')]
            .find((el) => el.textContent?.trim() === 'New chat') as HTMLElement
        item.click()
        await flushPromises()
    }

    it('creates a durable session from the header 3-dot New chat', async () => {
        const router = makeRouter()
        router.push('/research')
        await router.isReady()
        const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
        await flushPromises()

        await newChatFromOptions(wrapper)

        expect((mockState.controller as ReturnType<typeof makeController>).newSession).toHaveBeenCalledTimes(1)
        await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('chat'))
        wrapper.unmount()
    })

    // R2-SF-M2: the shell busy guard refuses a second session action while the
    // first is still in flight (a rapid re-tap once created TWO empty sessions).
    it('the shell busy guard refuses a second New chat while the first is in flight', async () => {
        const controller = makeController()
        let release: () => void = () => {}
        controller.newSession = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
        mockState.controller = controller
        const wrapper = mount(App, { global: { plugins: [makeRouter()] }, attachTo: document.body })
        await flushPromises()

        await newChatFromOptions(wrapper)   // starts the (deferred) action → busy
        await newChatFromOptions(wrapper)   // guard must refuse this one
        expect(controller.newSession).toHaveBeenCalledTimes(1)

        release()
        await flushPromises()
        await newChatFromOptions(wrapper)   // busy released → allowed again
        expect(controller.newSession).toHaveBeenCalledTimes(2)
        wrapper.unmount()
    })
})
