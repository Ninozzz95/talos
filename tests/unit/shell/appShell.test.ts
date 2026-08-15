// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'
import { __resetSettingsStoreForTests, useSettingsStore } from '@/stores/settings'
import { __resetPreferencesStoreForTests, usePreferencesStore } from '@/stores/preferences'
import { createDefaultTalosMotionV6Preferences } from '@/motion-v6/defaults'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))
const notificationSpy = vi.hoisted(() => ({ takeLaunchRoute: vi.fn(async () => null) }))
vi.mock('@/services/doneNotification', () => ({
    talosTakeLaunchRoute: notificationSpy.takeLaunchRoute,
    talosOnNotificationRoute: vi.fn(() => () => undefined),
}))
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: vi.fn(async ({ key }: { key: string }) => ({
            value: window.localStorage.getItem(`CapacitorStorage.${key}`),
        })),
        set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
            window.localStorage.setItem(`CapacitorStorage.${key}`, value)
        }),
        remove: vi.fn(async ({ key }: { key: string }) => {
            window.localStorage.removeItem(`CapacitorStorage.${key}`)
        }),
    },
}))

/**
 * L'icona del launcher, spiata.
 *
 * Owner 2026-08-03, con uno screenshot: cambiando il layout della Libreria
 * compariva «Aggiornare l'icona dell'app?». Il difetto non era nell'icona — era
 * che il watcher rigirava a ogni scrittura di preferenza e non filtrava nulla.
 */
const iconSpy = vi.hoisted(() => ({ evaluate: vi.fn() }))
vi.mock('@/services/launcherIcon', () => ({
    useLauncherIconController: () => ({
        state: { pending: null },
        evaluate: iconSpy.evaluate,
        hydrate: async () => undefined,
        confirmNow: async () => undefined,
        later: () => undefined,
        dismiss: () => undefined,
    }),
}))

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
        segretiLetti: ref(true),
        cataloghiNonLetti: new Set(),
        selectedModelId: ref(null),
        effort: ref('high'),
        thinking: ref(false),
        // The tool block: what is running, and any write waiting for an answer.
        toolActivity: ref([] as string[]),
        pendingToolAuthorizations: ref([]),
        toolAuthorizationRecoveries: ref([]),
        toolAuthorizationPromptVisible: ref(false),
        // B2 — il piano: assente vuol dire «nessun piano in attesa», ed è lo
        // stato normale. La scheda ha la precedenza su quella del singolo
        // tool, quindi senza questa riga la finta si comporta come se ce ne
        // fosse sempre uno.
        planRequest: ref(null),
        answerPlan: vi.fn(),
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
        /**
         * The research station follows whatever is already running the moment
         * it mounts, and this stub had nothing for it to follow — so opening a
         * station threw `Cannot read properties of undefined (reading
         * 'registry')` out of an async `onMounted`, where no test could see it.
         * It surfaced only as two unhandled rejections in the suite summary,
         * which turned every unit run red without failing anything.
         */
        research: {
            registry: {
                running: () => [] as string[],
                isRunning: () => false,
                watch: () => () => undefined,
            },
            list: vi.fn().mockResolvedValue([]),
            report: vi.fn().mockResolvedValue(null),
            pause: vi.fn().mockResolvedValue(undefined),
            resume: vi.fn().mockResolvedValue(undefined),
            rename: vi.fn().mockResolvedValue(undefined),
            cancel: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue([]),
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

function makeRouter(initialPath?: string): Router {
    const history = createMemoryHistory()
    if (initialPath) history.push(initialPath)
    return createRouter({
        history,
        routes: TALOS_MOBILE_ROUTES.map((r) => ({ path: r.path, name: r.name, component: r.component })),
    })
}

describe('App shell (header/sidebar + chat base + station sheets)', () => {
    beforeEach(() => {
        // Skip the native lifecycle listener in jsdom via the fail-closed switch.
        window.__TALOS_M1_DISABLE__ = ['lifecycle']
        mockState.controller = makeController()
        notificationSpy.takeLaunchRoute.mockClear()
        __resetSettingsStoreForTests()
        __resetPreferencesStoreForTests()
        // Owner #15 made immersive/drawer the DEFAULT: these journeys exercise
        // the still-supported classic shell, so seed an explicit classic choice.
        window.localStorage.setItem('CapacitorStorage.talos.mobile.settings', JSON.stringify({
            defaults_v3: true,
            presentation_v2: true,
            shell: { immersive_header: false, composer_shape: 'classic' },
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
                composer_shape: 'classic',
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

    /**
     * ⛔⭐⭐ La richiesta ORFANA, vista tre volte in una notte: la chat diceva
     * «una richiesta di autorizzazione è in attesa» e non c'era NIENTE da
     * toccare — nessuna scheda e nessun pulsante «Controlla azioni».
     *
     * Il pulsante era l'ultimo anello di una catena di `v-else-if` che
     * comincia con la scheda di ripresa e passa per il foglio del PIANO. Un
     * piano rimasto aperto — e `planRequest` si azzera solo dai tre pulsanti di
     * quel foglio, quindi un invio interrotto lo lascia lì — vinceva il ramo, e
     * da quel momento nessuna richiesta di permesso aveva più dove mostrarsi.
     *
     * ⇒ Un permesso è il pavimento della sicurezza. La strada per rispondergli
     * non può essere il ramo di scarto di qualcos'altro.
     */
    it('⛔ col PIANO aperto la via verso un permesso in sospeso resta aperta', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.pendingToolAuthorizations.value = [{
            request_id: 'request-pending',
            checkpoint_id: 'checkpoint-pending',
        }]
        controller.toolAuthorizationPromptVisible.value = true
        controller.planRequest.value = {
            id: 'piano-1',
            steps: [],
            risk: 'low',
            state: 'proposed',
            scope: 'turn',
        }
        const router = makeRouter()
        router.push('/')
        await router.isReady()

        const wrapper = mount(App, { global: { plugins: [router] } })
        await flushPromises()

        // Il piano ha la precedenza a schermo: è la domanda di adesso.
        await vi.waitFor(() => {
            expect(document.body.querySelector('[data-testid="talos-plan-sheet"]')).not.toBeNull()
        })
        expect(document.body.querySelector('[data-testid="talos-tool-consent"]')).toBeNull()

        // ⭐ Ma la richiesta di permesso resta RAGGIUNGIBILE. Il pulsante non è
        // teletrasportato in `body` come le schede: sta nell'albero della shell.
        const riapri = wrapper.find('[data-testid="talos-tool-authorization-reopen"]')
        expect(riapri.exists()).toBe(true)
        await riapri.trigger('click')
        await flushPromises()
        expect(controller.showToolAuthorization).toHaveBeenCalled()
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
            shell: { immersive_header: false, composer_shape: 'compact' },
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

    it('F2-RED-20 reaches Model Lab only through the Settings hierarchy', async () => {
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
            )).toBeNull()
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
        await vi.waitFor(() => {
            expect(wrapper.find('[data-testid="settings-model-lab-link"]').exists()).toBe(true)
        })
        await wrapper.get('[data-testid="settings-model-lab-link"]').trigger('click')
        await vi.waitFor(() => {
            expect(router.currentRoute.value.name).toBe('settings-models')
            expect(router.currentRoute.value.query.tab).toBeUndefined()
        })
        wrapper.unmount()
    })

    it('F2-RED-12 keeps an explicit Model Lab child deep link over the remembered hub on boot', async () => {
        window.localStorage.setItem(
            'CapacitorStorage.talos.mobile.preferences',
            JSON.stringify({ schema_version: 1, presentation: 'drawer', last_route: 'settings-models' }),
        )
        // Match a browser cold boot whose history already carries the deep
        // link before Vue Router is installed by main.ts.
        const router = makeRouter('/settings/models/providers')

        const wrapper = mount(App, { global: { plugins: [router] } })
        await flushPromises()
        // This boundary runs immediately after remembered-route restoration,
        // so reaching it proves the bootstrap decision has completed.
        await vi.waitFor(() => expect(notificationSpy.takeLaunchRoute).toHaveBeenCalledOnce())

        await vi.waitFor(() => {
            expect(usePreferencesStore().state.last_route).toBe('settings-models')
            expect(router.currentRoute.value.name).toBe('settings-models-providers')
            expect(wrapper.find('[data-testid="settings-models-providers-screen"]').exists()).toBe(true)
        })
        wrapper.unmount()
    })

    it('C45-RED-09B gives Model Lab child routes a tokenized directional transition boundary', async () => {
        const router = makeRouter('/settings/models')
        const wrapper = mount(App, { global: { plugins: [router] } })
        await flushPromises()
        await vi.waitFor(() => {
            expect(wrapper.find('[data-testid="talos-model-lab-route-view"]').exists()).toBe(true)
        })

        await router.push('/settings/models/local')
        await vi.waitFor(() => {
            const view = wrapper.get('[data-testid="talos-model-lab-route-view"]')
            expect(router.currentRoute.value.name).toBe('settings-models-local')
            expect(view.attributes('data-transition-direction')).toBe('forward')
            expect(view.attributes('data-motion-duration')).toBe('--talos-motion-duration-tab-change')
            expect(view.classes()).toContain('motion-reduce:transform-none')
        })

        await router.push('/settings/models')
        await vi.waitFor(() => {
            expect(wrapper.get('[data-testid="talos-model-lab-route-view"]')
                .attributes('data-transition-direction')).toBe('back')
        })
        expect(wrapper.findAll('[data-testid="talos-model-lab-route-view"]')).toHaveLength(1)
        wrapper.unmount()
    })

    // Owner 2026-07-24: New Chat now lives inside the header 3-dot options menu
    // (shared with the immersive chrome), not as a standalone button.
    /** The open menu's New chat entry, without pressing it. */
    async function openNewChatItem(wrapper: ReturnType<typeof mount>): Promise<HTMLElement> {
        // The entries disable themselves while a session action is in flight
        // (owner 2026-07-31: a swallowed press is indistinguishable from a
        // broken button), so a REFUSED press leaves the menu open — and
        // pressing the ⋮ again would close it rather than open it.
        const opener = wrapper.get('[aria-haspopup="menu"]')
        if (opener.attributes('aria-expanded') !== 'true') {
            await opener.trigger('click')
            await flushPromises()
        }
        return [...document.body.querySelectorAll('[role="menuitem"]')]
            .find((el) => el.textContent?.trim() === 'New chat') as HTMLElement
    }

    async function newChatFromOptions(wrapper: ReturnType<typeof mount>): Promise<void> {
        (await openNewChatItem(wrapper)).click()
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

        /**
         * Two presses in the SAME tick, before Vue can render anything as
         * disabled. That is the defect the guard exists for — R2-SF-M2, a tap
         * landing between the first press and the re-render — and it is the
         * only way to reach the guard now that the entry also disables itself.
         *
         * An adversarial review 2026-07-31 caught the previous version of this
         * test proving nothing: it awaited between the presses, so the DOM
         * refused the second one and the guard was never asked. Remove the
         * `if (shellActionBusy.value) return` and this fails; remove only the
         * `disabled` and it still passes.
         */
        const item = await openNewChatItem(wrapper)
        item.click()
        item.click()
        await flushPromises()
        expect(controller.newSession).toHaveBeenCalledTimes(1)

        release()
        await flushPromises()
        await newChatFromOptions(wrapper)   // busy released → allowed again
        expect(controller.newSession).toHaveBeenCalledTimes(2)
        wrapper.unmount()
    })
})

describe('il dialogo dell icona non c entra con le altre preferenze', () => {
    it('non chiede di riavviare quando cambia il layout della Libreria', async () => {
        iconSpy.evaluate.mockClear()
        mockState.controller = makeController()
        const wrapper = mount(App, { global: { plugins: [makeRouter()] } })
        await flushPromises()

        // La valutazione all avvio e legittima: e quella che scopre se l icona
        // applicata corrisponde al tema. Da qui in poi non deve piu succedere
        // se non cambia il tema o l interruttore.
        iconSpy.evaluate.mockClear()

        const settings = useSettingsStore()
        await settings.setShell({ library_view: 'grid' })
        await flushPromises()

        /**
         * Il difetto che l'owner ha fotografato. `setShell` rimpiazza l'intero
         * oggetto `state.shell`, quindi la dipendenza si invalida anche per una
         * chiave che il watcher non guarda; e il getter restituiva un array
         * NUOVO a ogni giro, che Vue considera sempre cambiato. Rimettere il
         * getter singolo e questo test torna rosso.
         */
        expect(iconSpy.evaluate).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('lo chiede ancora quando cambia davvero l interruttore dell icona', async () => {
        iconSpy.evaluate.mockClear()
        mockState.controller = makeController()
        const wrapper = mount(App, { global: { plugins: [makeRouter()] } })
        await flushPromises()
        iconSpy.evaluate.mockClear()

        const settings = useSettingsStore()
        await settings.setShell({ launcher_icon_follows_theme: true })
        await flushPromises()

        // Il filtro non deve essere diventato un tappo: la cosa che il watcher
        // esiste per notare deve ancora passare.
        expect(iconSpy.evaluate).toHaveBeenCalled()
        wrapper.unmount()
    })
})
