// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
/*
 * ⛔ La risposta in volo è un componente ASINCRONO, e questi casi non la
 * riguardano: montandola per davvero il suo grafo continua a caricarsi mentre
 * il caso è già finito, e Vitest lo segnala come rifiuto non gestito —
 * «Cannot load '/src/lib/tools/toolLabels.ts' … after the environment was torn
 * down». Compito #57: tre rejection da qui, con tutti i test verdi.
 *
 * ⛔ Da SOLO questo file era pulito: l'import faceva in tempo a posare. In
 * suite intera no — ed è per questo che un difetto così si vede solo dal
 * conto totale, mai dal file singolo.
 *
 * ⛔ `__esModule: true` è obbligatorio: senza, `defineAsyncComponent` non sa
 * di dover scartare l'involucro e chiede `__isTeleport` al modulo finto.
 */
vi.mock('@/components/chat/TalosMobileStreamingReply.vue', () => ({
    __esModule: true,
    default: { name: 'TalosMobileStreamingReply', render: () => null },
}))

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'

const mockState = vi.hoisted(() => ({
    controller: null as unknown,
    routerPush: vi.fn(),
    browserOpen: vi.fn(),
    browserClose: vi.fn(),
    browserDispose: vi.fn(),
    browserOnEvent: null as null | ((event: Record<string, unknown>) => void),
    settings: {
        state: {
            chat_layout: { message_style: 'sections' },
            shell: {
                immersive_header: false,
                composer_shape: 'classic',
                composer_plus: 'drawer',
                library_context_enabled: true,
                library_context_policy: null,
            },
            motion_v6: { background_enabled: true, mode: 'off' },
            onboarding: { intro_version: 0, intro_outcome: null as string | null, setup_dismissed: false },
            browser: {
                schema_version: 1,
                hmi_mode: 'confirm_sensitive',
                presentation: 'isolated_webview',
                suggest_for_urls: true,
                developer_untrusted_evidence: false,
            },
        },
        setOnboarding: vi.fn(),
    },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockState.routerPush }) }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => mockState.settings }))
vi.mock('@/services/inAppBrowserService', () => ({
    createTalosInAppBrowserService: (options: { onEvent?: (event: Record<string, unknown>) => void }) => {
        mockState.browserOnEvent = options.onEvent ?? null
        return {
            open: mockState.browserOpen,
            close: mockState.browserClose,
            dispose: mockState.browserDispose,
        }
    },
}))

import ChatScreen from '@/screens/ChatScreen.vue'

interface FakeMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; created_at: string; state: string; model_profile_id?: string | null; run_id?: string | null; metadata?: Record<string, unknown> }

let registered: { newSession?: (options?: unknown) => Promise<void> } | null = null
let sessionCounter = 0

function makeController(messages: FakeMessage[] = []) {
    const sessions = reactive<Array<{ id: string; title: string; metadata?: Record<string, unknown> }>>([])
    const drafts = new Map<string, string>()
    const chat = {
        messages: reactive(messages.map((message) => ({
            ...message,
            model_profile_id: message.model_profile_id ?? null,
            run_id: message.run_id ?? null,
            metadata: message.metadata ?? {},
        }))),
        sessions,
        sessionBrowserActivities: reactive([]),
        activeSession: ref<{ id: string; title: string; metadata?: Record<string, unknown> } | null>(null),
        state: reactive({
            sending: false,
            persistenceStatus: 'ready',
            persistenceError: null as string | null,
        }),
        retryPersistence: vi.fn().mockResolvedValue(undefined),
        recordBrowserActivity: vi.fn().mockResolvedValue(undefined),
        loadComposerDraft: vi.fn(async (scope?: string | null) => drafts.get(scope ?? 'new') ?? ''),
        saveComposerDraft: vi.fn(async (value: string, scope?: string | null) => {
            const key = scope ?? 'new'
            if (value) drafts.set(key, value)
            else drafts.delete(key)
        }),
    }
    const promptEnhancement = ref<TalosMobilePromptEnhancementResult | null>(null)
    const clearPromptEnhancement = vi.fn(() => { promptEnhancement.value = null })
    const attachmentItems = reactive<Array<Record<string, unknown>>>([])
    const attachmentError = ref<string | null>(null)
    const attachments = {
        items: attachmentItems,
        selecting: ref(false),
        error: attachmentError,
        hasAuthorized: ref(false),
        blocking: ref(false),
        bindings: ref([]),
        vaultFiles: reactive([]),
        vaultLoading: ref(false),
        vaultError: ref(null),
        initialize: vi.fn().mockResolvedValue(undefined),
        refreshVault: vi.fn().mockResolvedValue(undefined),
        selectFiles: vi.fn().mockResolvedValue(undefined),
        attachExisting: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockImplementation(async (id: string) => {
            const index = attachmentItems.findIndex((item) => item.id === id)
            if (index >= 0) attachmentItems.splice(index, 1)
        }),
        deleteVaultFile: vi.fn().mockResolvedValue(undefined),
        discardAll: vi.fn().mockResolvedValue(undefined),
        clearSent: vi.fn(() => attachmentItems.splice(0, attachmentItems.length)),
        clearError: vi.fn(() => { attachmentError.value = null }),
    }
    const browseMode = ref(false)
    const setBrowseMode = vi.fn(async (enabled: boolean) => {
        browseMode.value = enabled
        if (!chat.activeSession.value) {
            chat.activeSession.value = { id: 'browse-session', title: 'New chat', surface: enabled ? 'browse' : 'chat' }
        } else {
            ;(chat.activeSession.value as Record<string, unknown>).surface = enabled ? 'browse' : 'chat'
        }
    })
    return {
        catalogs: reactive({}),
        /*
         * ⛔ Le attese di autorizzazione fanno parte del CONTRATTO del
         * controller, non di un caso di prova.
         *
         * Questa finzione non le aveva, e la schermata — che dal 2026-08-08 le
         * legge per far diventare la riga dell'attesa una porta — moriva con
         * «Cannot read properties of undefined». Non era un difetto della
         * schermata: era una finzione piu' povera del vero.
         */
        pendingToolAuthorizations: ref([]),
        toolAuthorizationRecoveries: ref([]),
        showToolAuthorization: vi.fn(),
        profiles: ref([]),
        // Il mock parte da «letto»: i test che studiano la finestra di
        // caricamento lo rimettono a `false` esplicitamente.
        segretiLetti: ref(true),
        cataloghiNonLetti: new Set(),
        selectedModelId: ref(null),
        effort: ref('high'),
        thinking: ref(false),
        canSend: ref(false),
        browseMode,
        sendDisabledReason: ref(''),
        enhancingPrompt: ref(false),
        promptEnhancement,
        promptEnhancementError: ref(null),
        attachments,
        chat,
        selectModel: vi.fn(),
        selectEffort: vi.fn(),
        setThinking: vi.fn(),
        setBrowseMode,
        init: vi.fn().mockResolvedValue(undefined),
        /**
         * Owner 2026-07-31: pressing the two mode buttons left one empty chat
         * behind per press. A fake that resolves and does nothing cannot show
         * that — so these MODEL the store: creating swaps the active session
         * and appends it, deleting removes it. The test below then counts what
         * is LEFT, which is the thing the owner actually saw.
         */
        newSession: vi.fn(async (options?: { ephemeral?: boolean }) => {
            const id = `${options?.ephemeral ? 'tmp-' : ''}made-${++sessionCounter}`
            const made = { id, title: 'Nuova chat' }
            chatState.sessions.push(made)
            chatState.activeSession.value = made
        }),
        // R2-7: ChatScreen registers its orchestrator on mount.
        /**
         * Owner 2026-07-31: this fake is why "Rendila temporanea" shipped broken
         * twice.
         *
         * `register` threw the orchestrator away and `newSession` resolved on
         * its own, so every test exercised a path the app does not have. The
         * real lifecycle DELEGATES to whatever the screen registered — and the
         * screen's orchestrator was dropping the options. A fake that skips the
         * middle cannot see a bug that lives in the middle.
         *
         * It delegates now, exactly as the real one does.
         */
        sessionLifecycle: {
            register: vi.fn((next: { newSession?: (options?: unknown) => Promise<void> }) => {
                registered = next
            }),
            unregister: vi.fn(() => { registered = null }),
            newSession: vi.fn((options?: unknown) => (
                registered?.newSession
                    ? registered.newSession(options)
                    : Promise.resolve()
            )),
            selectSession: vi.fn().mockResolvedValue(undefined),
            renameSession: vi.fn().mockResolvedValue(undefined),
            deleteSession: vi.fn().mockResolvedValue(undefined),
        },
        selectSession: vi.fn().mockResolvedValue(undefined),
        renameSession: vi.fn().mockResolvedValue(undefined),
        deleteSession: vi.fn(async (id: string) => {
            const at = chatState.sessions.findIndex((session) => session.id === id)
            if (at >= 0) chatState.sessions.splice(at, 1)
        }),
        resendMessage: vi.fn().mockResolvedValue(undefined),
        retryAssistantMessage: vi.fn().mockResolvedValue(undefined),
        refreshConfiguredProviders: vi.fn().mockResolvedValue(undefined),
        preferenceError: ref(null),
        send: vi.fn().mockResolvedValue(true),
        enhancePrompt: vi.fn().mockResolvedValue(null),
        clearPromptEnhancement,
        __drafts: drafts,
    }
}

beforeEach(() => {
    mockState.routerPush.mockReset()
    mockState.browserOpen.mockReset().mockResolvedValue(undefined)
    mockState.browserClose.mockReset().mockResolvedValue(undefined)
    mockState.browserDispose.mockReset().mockResolvedValue(undefined)
    mockState.browserOnEvent = null
    mockState.settings.state.browser.suggest_for_urls = true
    mockState.settings.state.browser.presentation = 'isolated_webview'
    mockState.settings.state.browser.developer_untrusted_evidence = false
    mockState.settings.state.onboarding = { intro_version: 0, intro_outcome: null, setup_dismissed: false }
    mockState.settings.state.shell = {
        immersive_header: false,
        composer_shape: 'classic',
        composer_plus: 'drawer',
        library_context_enabled: true,
        library_context_policy: null,
    }
    mockState.settings.setOnboarding.mockReset()
    mockState.controller = makeController()
})

afterEach(() => {
    document.body.innerHTML = ''
})

describe('ChatScreen (functional, local-first)', () => {
    it('BR-09 enables Browse and opens a detected URL without leaving the chat route', async () => {
        const controller = makeController()
        mockState.controller = controller
        mockState.browserOpen.mockImplementation(async (url: string) => {
            mockState.browserOnEvent?.({ type: 'opening', url, source: 'native' })
            mockState.browserOnEvent?.({ type: 'loaded', url, source: 'native' })
        })
        const wrapper = mount(ChatScreen)
        const field = wrapper.get('[aria-label="Message TALOS"]')
        await field.setValue('Apri https://example.com/path e dimmi cosa vedi')

        const suggestion = wrapper.get('[data-testid="talos-mobile-browser-url-suggestion"]')
        await wrapper.get('[aria-label="Enable Browse mode"]').trigger('click')
        expect(controller.setBrowseMode).toHaveBeenCalledWith(true)
        expect(mockState.routerPush).not.toHaveBeenCalled()

        await suggestion.get('button').trigger('click')
        await vi.waitFor(() => expect(mockState.browserOpen).toHaveBeenCalledWith(
            'https://example.com/path',
            'isolated_webview',
        ))
        await vi.waitFor(() => expect(controller.chat.recordBrowserActivity).toHaveBeenCalledTimes(2))
        expect(controller.chat.recordBrowserActivity).toHaveBeenCalledWith(
            'browse-session',
            expect.objectContaining({ operation: 'session_start', status: 'succeeded' }),
        )
        expect(controller.chat.recordBrowserActivity).toHaveBeenCalledWith(
            'browse-session',
            expect.objectContaining({ operation: 'navigate', status: 'succeeded' }),
        )
        expect(mockState.routerPush).not.toHaveBeenCalled()
    })

    it('executes slash Browse in the current chat and never opens another page', async () => {
        const controller = makeController()
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        wrapper.getComponent(TalosMobileComposer).vm.$emit('selectSlashCommand', 'open_browse')

        await vi.waitFor(() => expect(controller.setBrowseMode).toHaveBeenCalledWith(true))
        expect(mockState.routerPush).not.toHaveBeenCalled()
        expect(wrapper.get('[aria-label="Disable Browse mode"]').exists()).toBe(true)
    })
    it('WELCOME-SCREEN-01/02 shows one title-only TALOS hero and docks the composer when empty', () => {
        const wrapper = mount(ChatScreen)
        const hero = wrapper.get('[data-testid="talos-empty-brand"]')
        expect(hero.find('.talos-short-logo-mark').exists()).toBe(true)
        expect(hero.find('.talos-orbitron-brand').text()).toBe('TALOS')
        expect(hero.findAll('h1')).toHaveLength(1)
        expect(hero.get('h1').text().trim()).not.toBe('')
        expect(hero.findAll('p')).toHaveLength(0)
        expect(wrapper.find('[data-testid="talos-mobile-composer"]').exists()).toBe(true)
    })

    it('DEBT-MOBILE-007 RED: chat thread allows vertical scroll but not viewport pinch zoom', () => {
        const wrapper = mount(ChatScreen)
        expect(wrapper.get('[data-testid="talos-chat-scroll"]').classes()).toContain('touch-pan-y')
    })

    it('replaces the hero with the message thread once the conversation starts', () => {
        mockState.controller = makeController([
            { id: '1', role: 'user', content: 'benchmark this', created_at: '', state: 'persisted' },
            { id: '2', role: 'assistant', content: 'On it.', created_at: '', state: 'persisted' },
        ])
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-empty-brand"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-mobile-message-list"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('benchmark this')
        expect(wrapper.text()).toContain('On it.')
    })

    it('wires the composer send (Enter) through to the controller with the typed prompt', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const textarea = wrapper.get('[aria-label="Message TALOS"]')
        await textarea.setValue('hello world')
        await textarea.trigger('keydown', { key: 'Enter' })
        await vi.waitFor(() => expect(controller.send).toHaveBeenCalledWith('hello world', null, false))
    })

    it('wires the system picker and attachment tray actions through the shared controller', async () => {
        const controller = makeController()
        controller.attachments.items.push({
            id: 'draft-brief',
            source: 'picker',
            displayName: 'brief.txt',
            mediaType: 'text/plain',
            sizeBytes: 512,
            status: 'authorized',
            vaultFileId: 'vault-brief',
            grantId: 'grant-brief',
            bindingId: 'binding-brief',
            permissions: ['browser.upload', 'model.read'],
            error: null,
        })
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        expect(wrapper.get('[data-testid="talos-mobile-attachment-tray"]').text()).toContain('brief.txt')
        await wrapper.get('[aria-label="Attach a file"]').trigger('click')
        await wrapper.get('[aria-label="Remove brief.txt"]').trigger('click')
        expect(controller.attachments.selectFiles).toHaveBeenCalledOnce()
        expect(controller.attachments.remove).toHaveBeenCalledWith('draft-brief')
    })

    it('uses the compact empty-state presentation only while the attachment tray is expanded', async () => {
        const controller = makeController()
        controller.attachments.items.push({
            id: 'draft-brief',
            source: 'picker',
            displayName: 'brief.txt',
            mediaType: 'text/plain',
            sizeBytes: 512,
            status: 'authorized',
            vaultFileId: 'vault-brief',
            grantId: 'grant-brief',
            bindingId: 'binding-brief',
            permissions: ['browser.upload', 'model.read'],
            error: null,
        })
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const hero = wrapper.get('[data-testid="talos-empty-brand"]')

        expect(hero.attributes('data-composer-expanded')).toBe('true')
        expect(hero.classes()).toContain('justify-start')
        expect(hero.find('h1').exists()).toBe(true)
        expect(hero.find('p').exists()).toBe(false)

        controller.attachments.items.splice(0, controller.attachments.items.length)
        await wrapper.vm.$nextTick()

        expect(hero.attributes('data-composer-expanded')).toBe('false')
        expect(hero.classes()).toContain('justify-center')
        expect(hero.find('p').exists()).toBe(false)
    })

    it('sends an authorized attachment without text and blocks a failed tray item', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        controller.attachments.items.push({
            id: 'draft-ready',
            source: 'vault',
            displayName: 'evidence.pdf',
            mediaType: 'application/pdf',
            sizeBytes: 4096,
            status: 'authorized',
            vaultFileId: 'vault-ready',
            grantId: 'grant-ready',
            bindingId: 'binding-ready',
            permissions: ['browser.upload', 'model.read'],
            error: null,
        })
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        await wrapper.get('[aria-label="Send message"]').trigger('click')
        await vi.waitFor(() => expect(controller.send).toHaveBeenCalledWith('', null, false))

        controller.attachments.items.push({
            ...controller.attachments.items[0],
            id: 'draft-failed',
            displayName: 'spoofed.png',
            status: 'failed',
            error: 'TALOS_ATTACHMENT_SIGNATURE_MISMATCH',
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.get<HTMLButtonElement>('[aria-label="Send message"]').element.disabled).toBe(true)
    })

    it('restores the active session draft after initialization', async () => {
        const controller = makeController()
        controller.chat.activeSession.value = { id: 'chat-draft', title: 'Draft chat' }
        controller.__drafts.set('chat-draft', 'Persisted mobile draft')
        mockState.controller = controller

        const wrapper = mount(ChatScreen)

        await vi.waitFor(() => {
            expect(wrapper.get<HTMLInputElement>('[aria-label="Message TALOS"]').element.value)
                .toBe('Persisted mobile draft')
        })
        expect(controller.chat.loadComposerDraft).toHaveBeenCalledWith('chat-draft')
    })

    it('restores the typed draft when persistence rejects a send', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        controller.send = vi.fn().mockResolvedValue(false)
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const field = wrapper.get('[aria-label="Message TALOS"]')
        await field.setValue('Do not lose this')

        await field.trigger('keydown', { key: 'Enter' })
        await vi.waitFor(() => {
            expect(wrapper.get<HTMLInputElement>('[aria-label="Message TALOS"]').element.value)
                .toBe('Do not lose this')
        })
        expect(controller.send).toHaveBeenCalledWith('Do not lose this', null, false)
    })

    it('P1-CTX-UI-04 keeps a turn override after rejection and consumes it after acceptance', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        controller.chat.activeSession.value = {
            id: 'chat-policy',
            title: 'Policy chat',
            metadata: {},
        }
        controller.chat.sessions.push(controller.chat.activeSession.value)
        controller.send = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true)
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const composer = wrapper.getComponent(TalosMobileComposer)
        const override = {
            mode: 'smart_relevant_v1' as const,
            included_file_ids: ['vault-brief'],
            excluded_file_ids: [],
        }
        composer.vm.$emit('updateLibraryTurnOverride', override)
        await wrapper.vm.$nextTick()
        await wrapper.get('[aria-label="Message TALOS"]').setValue('Use this brief')

        composer.vm.$emit('send')
        await vi.waitFor(() => expect(controller.send).toHaveBeenCalledWith(
            'Use this brief',
            override,
            false,
        ))
        await vi.waitFor(() => expect(composer.props('libraryTurnOverride')).toEqual(override))

        composer.vm.$emit('send')
        await vi.waitFor(() => expect(controller.send).toHaveBeenCalledTimes(2))
        await vi.waitFor(() => expect(composer.props('libraryTurnOverride')).toBeNull())
    })

    it('reuses a message prompt and focuses the composer', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'Reuse this prompt', created_at: '', state: 'persisted' },
        ])
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        wrapper.getComponent(TalosMobileMessageList).vm.$emit('reuse', 'user-1')
        await wrapper.vm.$nextTick()

        const field = wrapper.get<HTMLTextAreaElement>('[aria-label="Message TALOS"]')
        expect(field.element.value).toBe('Reuse this prompt')
        expect(document.activeElement).toBe(field.element)
    })

    it('forwards resend and retry actions to the controller', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'Prompt', created_at: '', state: 'persisted' },
            { id: 'assistant-1', role: 'assistant', content: 'Answer', created_at: '', state: 'persisted' },
        ])
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        wrapper.getComponent(TalosMobileMessageList).vm.$emit('resend', 'user-1')
        wrapper.getComponent(TalosMobileMessageList).vm.$emit('retry', 'assistant-1')
        await wrapper.vm.$nextTick()
        expect(controller.resendMessage).toHaveBeenCalledWith('user-1')
        expect(controller.retryAssistantMessage).toHaveBeenCalledWith('assistant-1')
    })

    it('exposes the orchestrated session actions to the app shell (F1-T3 header/sidebar)', async () => {
        const controller = makeController()
        controller.chat.sessions.push(
            { id: 'chat-2', title: 'Release review' },
            { id: 'chat-1', title: 'Architecture notes' },
        )
        controller.chat.activeSession.value = { id: 'chat-2', title: 'Release review' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })

        const exposed = wrapper.vm as unknown as { selectSession: (id: string) => void }
        exposed.selectSession('chat-1')
        await vi.waitFor(() => expect(controller.selectSession).toHaveBeenCalledWith('chat-1'))
        expect(controller.attachments.discardAll).toHaveBeenCalledTimes(1)
    })

    /**
     * F-14. The notice is the visible half of the promise, and the assertion
     * that the CONVERSATION is still there is the regression guard.
     *
     * The first cut placed the notice between the setup block's `v-if` and the
     * message list's `v-else`, which silently broke the chain: the conversation
     * would have vanished in exactly the chats that show this notice. It
     * typechecks, it is valid HTML, and no existing test covered it.
     */
    it('tells a temporary chat what it is — without eating the conversation', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'un segreto', created_at: '', state: 'persisted' },
        ])
        controller.chat.activeSession.value = { id: 'tmp-abc', title: 'Chat temporanea' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        const notice = wrapper.get('[data-testid="talos-temporary-chat-notice"]')
        // Both halves. The second is the one nobody else writes.
        expect(notice.text()).toContain('Not saved on this phone')
        expect(notice.text()).toContain('provider still receives it')
        expect(wrapper.findComponent(TalosMobileMessageList).exists()).toBe(true)
    })

    /**
     * Owner 2026-07-30 asked whether the composer pill had kept up with the
     * recent work. It had not: F-14 suppressed the Library inside the
     * controller and this computed did not know, so the pill went on
     * advertising "Broad · N sources" while the model was sent none of them.
     *
     * The direction of that lie is the dangerous one — you would believe your
     * documents were in play and trust an answer that never saw them.
     */
    /**
     * Owner 2026-07-30: «il pulsante chat temporanea non sa attivare nessun
     * feedback». A mode you cannot see is a mode you forget you are in — and
     * forgetting THIS one means typing something into a chat you believe is
     * kept, or trusting a kept chat to vanish.
     */
    it('wears the mode before a single word is typed', async () => {
        const controller = makeController()
        controller.chat.activeSession.value = { id: 'tmp-abc', title: 'Temporanea' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-temporary-chat-badge"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-temporary-welcome"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-empty-brand"]').attributes('data-temporary')).toBe('true')
        // And the offer to convert is gone: it is already converted.
        expect(wrapper.find('[data-testid="talos-make-temporary"]').exists()).toBe(false)
    })

    /**
     * Owner 2026-07-30: the offer had no way back. A switch you can only flip
     * one way is a trap — you try the mode to see what it is and cannot undo
     * it. Same rule as its twin: only while the chat is empty, because that is
     * the only moment when leaving costs nothing.
     */
    it('offers the way back out of a temporary chat', async () => {
        const controller = makeController()
        controller.chat.activeSession.value = { id: 'tmp-abc', title: 'Temporanea' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        await wrapper.get('[data-testid="talos-make-permanent"]').trigger('click')

        expect(controller.sessionLifecycle.newSession).toHaveBeenCalledWith(undefined)
    })

    /**
     * Owner 2026-07-30: the offer had no way back. A switch you can only flip
     * one way is a trap — you try the mode to see what it is and cannot undo
     * it. Same rule as its twin: only while the chat is empty, because that is
     * the only moment when leaving costs nothing.
     */
    it('offers the way back out of a temporary chat', async () => {
        const controller = makeController()
        controller.chat.activeSession.value = { id: 'tmp-abc', title: 'Temporanea' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-make-permanent"]').exists()).toBe(true)
    })

    /**
     * Owner 2026-07-31, second word on the same subject. First: «una chat
     * avviata già in modo non temporaneo NON PUÒ essere modificata in chat
     * temporanea… fai sparire anche i relativi tasti» — so I removed the pill
     * entirely. Then, seeing it gone: «la pill modalità incognito sotto la
     * scritta welcome è sparita e non doveva sparire».
     *
     * Both are satisfiable at once, because they are about different things.
     * His rule is about CONVERTING a conversation, and nothing converts any
     * more: the pill opens a NEW incognito chat exactly like the menu entry.
     * And it lives inside the empty state, so the chat it leaves has nothing in
     * it — there is no conversation to convert even in principle.
     *
     * What it does is covered end to end in mobile-incognito-switch.e2e; a
     * mocked lifecycle here could not see the layer that dropped the option
     * twice. This owns the rendering rule: WHEN it is offered.
     */
    it('offers incognito on the welcome of an empty ordinary chat', async () => {
        const controller = makeController()
        controller.chat.activeSession.value = { id: 'chat-1', title: 'Normale' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-make-temporary"]').exists()).toBe(true)
    })

    /** The rule that keeps his first instruction true: nothing converts. */
    it('withdraws the offer once the chat has something in it', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'ciao', created_at: '', state: 'persisted' },
        ])
        controller.chat.activeSession.value = { id: 'chat-1', title: 'Normale' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-make-temporary"]').exists()).toBe(false)
    })

    it('does not advertise the Library in a chat that is not sending it', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'un segreto', created_at: '', state: 'persisted' },
        ])
        controller.chat.activeSession.value = { id: 'tmp-abc', title: 'Chat temporanea' }
        mockState.settings.state.shell.library_context_enabled = true
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        expect(wrapper.getComponent(TalosMobileComposer).props('libraryContextEnabled')).toBe(false)
    })

    it('still advertises it in an ordinary chat, so the guard is not just off', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'ciao', created_at: '', state: 'persisted' },
        ])
        controller.chat.activeSession.value = { id: 'chat-1', title: 'Normale' }
        mockState.settings.state.shell.library_context_enabled = true
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        expect(wrapper.getComponent(TalosMobileComposer).props('libraryContextEnabled')).toBe(true)
    })

    it('says nothing of the sort in an ordinary chat', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'ciao', created_at: '', state: 'persisted' },
        ])
        controller.chat.activeSession.value = { id: 'chat-1', title: 'Normale' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-temporary-chat-notice"]').exists()).toBe(false)
        expect(wrapper.findComponent(TalosMobileMessageList).exists()).toBe(true)
    })

    it('routes new, select, rename, and delete session actions to the controller', async () => {
        const controller = makeController()
        controller.chat.sessions.push({ id: 'chat-1', title: 'Architecture notes' })
        controller.chat.activeSession.value = { id: 'chat-1', title: 'Architecture notes' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })

        const exposed = wrapper.vm as unknown as {
            newSession: () => void
            renameSession: (id: string, title: string) => void
            deleteSession: (id: string) => void
        }
        exposed.newSession()
        await vi.waitFor(() => expect(controller.newSession).toHaveBeenCalledTimes(1))
        expect(controller.attachments.discardAll).toHaveBeenCalledTimes(1)
        await flushPromises() // R2-7: release the runner busy-guard fully

        exposed.renameSession('chat-1', 'Renamed notes')
        await vi.waitFor(() => expect(controller.renameSession).toHaveBeenCalledWith('chat-1', 'Renamed notes'))
        await flushPromises()

        exposed.deleteSession('chat-1')
        await vi.waitFor(() => expect(controller.deleteSession).toHaveBeenCalledWith('chat-1'))
    })

    it('shows an actionable persistence failure and retries without opening Settings', async () => {
        const controller = makeController()
        controller.chat.state.persistenceStatus = 'error'
        controller.chat.state.persistenceError = 'Local chat storage is unavailable. sqlite locked'
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        expect(wrapper.get('[role="alert"]').text()).toContain('sqlite locked')
        await wrapper.get('[data-testid="talos-chat-storage-retry"]').trigger('click')
        expect(controller.chat.retryPersistence).toHaveBeenCalledTimes(1)
    })

    it('keeps Cancel byte-identical and applies Insert and Replace only on explicit choice', async () => {
        const controller = makeController()
        controller.promptEnhancement.value = {
            enhanced_prompt: 'Enhanced execution brief',
            summary: 'Added acceptance checks.',
            applied_principles: ['Acceptance checks'],
            model_profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            enhancement_mode: 'model',
            original_prompt: 'Original bytes  ',
        }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        const field = wrapper.get<HTMLTextAreaElement>('[aria-label="Message TALOS"]')
        const composer = wrapper.getComponent(TalosMobileComposer)
        await field.setValue('Original bytes  ')

        composer.vm.$emit('cancelPromptEnhancement')
        await vi.waitFor(() => expect(controller.clearPromptEnhancement).toHaveBeenCalledTimes(1))
        expect(field.element.value).toBe('Original bytes  ')

        controller.promptEnhancement.value = {
            ...controller.promptEnhancement.value,
            enhanced_prompt: 'Enhanced execution brief',
            summary: 'Added acceptance checks.',
            applied_principles: ['Acceptance checks'],
            model_profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            enhancement_mode: 'model',
            original_prompt: 'Original bytes  ',
        }
        composer.vm.$emit('insertPromptEnhancement')
        await vi.waitFor(() => expect(field.element.value).toBe('Original bytes  \n\nEnhanced execution brief'))
        expect(controller.chat.saveComposerDraft).toHaveBeenLastCalledWith(
            'Original bytes  \n\nEnhanced execution brief',
            'new',
        )

        controller.promptEnhancement.value = {
            enhanced_prompt: 'Replacement brief',
            summary: '',
            applied_principles: [],
            model_profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            enhancement_mode: 'model',
            original_prompt: field.element.value,
        }
        composer.vm.$emit('replacePromptEnhancement')
        await vi.waitFor(() => expect(field.element.value).toBe('Replacement brief'))
        expect(controller.chat.saveComposerDraft).toHaveBeenLastCalledWith('Replacement brief', 'new')
    })

    it('routes model and context slash commands and creates a durable new session', async () => {
        const controller = makeController()
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const composer = wrapper.getComponent(TalosMobileComposer)
        const field = wrapper.get('[aria-label="Message TALOS"]')
        await vi.waitFor(() => expect(controller.chat.loadComposerDraft).toHaveBeenCalledWith('new'))

        await field.setValue('/model')
        composer.vm.$emit('selectSlashCommand', 'open_model_center')
        await vi.waitFor(() => expect(mockState.routerPush).toHaveBeenCalledWith({
            name: 'settings-models',
        }))
        expect(field.element.value).toBe('')
        expect(controller.__drafts.has('new')).toBe(false)

        await field.setValue('/context')
        composer.vm.$emit('selectSlashCommand', 'open_context_vault')
        await vi.waitFor(() => expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'context' }))

        await field.setValue('/new')
        composer.vm.$emit('selectSlashCommand', 'new_session')
        await vi.waitFor(() => expect(controller.newSession).toHaveBeenCalledTimes(1))
        expect(controller.clearPromptEnhancement).toHaveBeenCalled()
    })

    it('clears enhancement state on send and session ownership changes', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        controller.chat.sessions.push({ id: 'chat-1', title: 'Existing chat' })
        controller.chat.activeSession.value = { id: 'chat-1', title: 'Existing chat' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })

        const field = wrapper.get('[aria-label="Message TALOS"]')
        await field.setValue('send me')
        await field.trigger('keydown', { key: 'Enter' })
        await vi.waitFor(() => expect(controller.send).toHaveBeenCalled())

        ;(wrapper.vm as unknown as { newSession: () => void }).newSession()
        await vi.waitFor(() => expect(controller.newSession).toHaveBeenCalled())
        expect(controller.clearPromptEnhancement.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
})

// F2-T6 — first-run setup checklist in the welcome state: REAL progress only
// (key present, model chosen), dismissible with persistence, no fake steps.
describe('welcome setup checklist (F2-T6)', () => {
    it('shows honest not-done steps when nothing is configured', () => {
        const wrapper = mount(ChatScreen)
        const checklist = wrapper.get('[data-testid="talos-setup-checklist"]')
        expect(checklist.text()).toContain('Add a provider key')
        expect(checklist.text()).toContain('Choose your model')
    })

    it('routes setup and composer entry points to their dedicated Model Lab pages', async () => {
        const wrapper = mount(ChatScreen)
        await wrapper.get('[data-testid="talos-setup-step-key"]').trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'settings-models-providers' })

        await wrapper.get('[data-testid="talos-setup-step-model"]').trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'settings-models-catalog' })

        wrapper.getComponent(TalosMobileComposer).vm.$emit('openModelLab')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'settings-models' })
    })

    /**
     * ⛔⛔ Owner 2026-08-09, con la fotografia: chiudendo del tutto l'app e
     * riaprendola compariva «Completa la configurazione — Aggiungi una chiave
     * provider · Scegli il modello» su un'app configurata da settimane. Due
     * centimetri sotto, nella stessa schermata, c'era gia' «Preparazione
     * dell'archivio locale delle chat».
     *
     * RIPRODOTTO sul Pad: compare a t+4s dall'avvio a freddo e sparisce da
     * sola. Non e' un dato sbagliato, e' un dato che non c'e' ANCORA — e «non
     * lo so» veniva trattato come «non ce l'hai».
     */
    it('⛔ TACE finche l archivio non e pronto: «non lo so» non e «non ce l hai»', () => {
        const controller = makeController()
        controller.chat.state.persistenceStatus = 'loading'
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-setup-checklist"]').exists()).toBe(false)
    })

    /**
     * Owner 2026-08-09: «non mi piace la scritta preparazione etc, metti uno
     * spinner al centro con una scritta caricamento chat».
     *
     * ⛔ Il pezzo che vale il test non è il girello: è che lo stesso fatto non
     * venga detto DUE volte. «Preparazione dell'archivio» viveva nella riga che
     * spiega perché il tasto invia è spento, insieme a «aggiungi una chiave» e
     * «scegli un modello» — cose DA FARE. Un'attesa non è una di quelle, e
     * lasciarla lì mentre il girello gira dice la stessa cosa in due posti con
     * due parole diverse.
     */
    it('⛔ l archivio che si apre e un GIRELLO al centro, e non anche una riga sotto', () => {
        const controller = makeController()
        controller.chat.state.persistenceStatus = 'loading'
        controller.sendDisabledReason.value = 'Preparazione dell’archivio locale delle chat'
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        const girello = wrapper.find('[data-testid="talos-chat-loading"]')
        expect(girello.exists()).toBe(true)
        // Il banco gira in inglese: la chiave è la stessa, la lingua no.
        expect(girello.text()).toContain('Loading chats')
        expect(girello.attributes('role')).toBe('status')

        // ⛔ E il doppione sotto il compositore tace.
        expect(wrapper.findComponent({ name: 'TalosMobileComposer' }).props('sendDisabledReason'))
            .toBe('')
    })

    /**
     * ⛔⭐ A CHAT PIENA IL GIRELLO C'È LO STESSO — ed è il difetto che questo
     * test presidia, non una preferenza.
     *
     * Fino al 2026-08-09 questo test asseriva l'OPPOSTO: `exists()` doveva
     * essere `false`. Non perché fosse giusto, ma perché il girello viveva
     * dentro l'introduzione, e l'introduzione si vede solo a chat vuota. Chi
     * apriva una conversazione già piena non aveva nessun segnale al centro
     * mentre l'archivio si apriva: metà delle persone, nessun girello.
     *
     * Una limitazione dell'implementazione era stata scritta come se fosse un
     * requisito, e il test la teneva ferma. Owner: «deve essere un popup overlay
     * non innestato nello sfondo chat» — e un overlay non ha motivo di sparire
     * quando ci sono dei messaggi sotto.
     */
    it('⛔ a chat PIENA il girello c e lo stesso, e la riga sotto tace', () => {
        const controller = makeController([{
            id: 'm1', role: 'user', content: 'ciao', created_at: '2026-08-09T10:00:00.000Z',
        }])
        controller.chat.state.persistenceStatus = 'loading'
        controller.sendDisabledReason.value = 'Preparazione dell’archivio locale delle chat'
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        const girello = wrapper.find('[data-testid="talos-chat-loading"]')
        expect(girello.exists()).toBe(true)
        expect(girello.text()).toContain('Loading chats')
        expect(wrapper.findComponent({ name: 'TalosMobileComposer' }).props('sendDisabledReason'))
            .toBe('')
    })

    /**
     * ⛔ È un OVERLAY, non un paragrafo che scorre coi messaggi.
     *
     * Senza questa prova, il girello potrebbe tornare a essere un `<p>` dentro
     * la lista — che è com'era — e il test qui sopra passerebbe identico: il
     * testid esiste in entrambi i casi. Quello che distingue le due cose è che
     * l'overlay è **fuori** dal contenitore che scorre e copre lo schermo.
     */
    it('⛔ il girello e un overlay a tutto schermo, fratello della radice', () => {
        const controller = makeController([{
            id: 'm1', role: 'user', content: 'ciao', created_at: '2026-08-09T10:00:00.000Z',
        }])
        controller.chat.state.persistenceStatus = 'loading'
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        const girello = wrapper.find('[data-testid="talos-chat-loading"]')
        const classi = girello.attributes('class') ?? ''
        expect(classi).toContain('fixed')
        expect(classi).toContain('inset-0')
        // Figlio DIRETTO della sezione: se qualcuno lo rimettesse dentro la
        // lista dei messaggi o dentro l'introduzione, il genitore non sarebbe
        // piu' la radice.
        expect(girello.element.parentElement?.getAttribute('data-testid')).toBe('mobile-screen')
    })

    it('e riappare appena l archivio e pronto e manca davvero qualcosa', () => {
        const controller = makeController()
        controller.chat.state.persistenceStatus = 'ready'
        controller.segretiLetti.value = true
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-setup-checklist"]').exists()).toBe(true)
    })

    /*
     * ⛔⛔ IL DEPOSITO SICURO HA UN TEMPO SUO — 2026-08-13.
     *
     * MISURATO sul Pad: con QUATTRO chiavi salvate
     * (`openrouter`, `openai`, `anthropic`, `search.tavily`) la schermata
     * diceva «Aggiungi una chiave provider» e bloccava l'invio. Il database
     * delle chat era gia' `ready`, ma i segreti non erano ancora stati letti —
     * e `secrets` nasce con tutti `false`, cioe' con il valore che ACCUSA.
     *
     * Questo test morde su quella finestra: archivio pronto, segreti non
     * ancora letti ⇒ la lista TACE. Col codice di prima era `true`.
     */
    /*
     * ⛔⛔ IL PAD ERA OFFLINE, E TALOS ACCUSAVA LA PERSONA — 2026-08-13.
     *
     * MISURATO: `Wi-Fi is disabled`, i tre elenchi modelli falliti con
     * `Unable to resolve host "api.openai.com"`, e la schermata diceva
     * «Aggiungi una chiave provider» mentre sul disco c'erano QUATTRO chiavi
     * e il modello era scelto. Senza elenchi non ci sono profili, e senza
     * profili `has_secret` e' falso ovunque: la catena e' corretta, la
     * conclusione e' falsa.
     *
     * Questo test morde su quella finestra. Col codice di prima era `true`.
     */
    it('TACE quando nessun elenco modelli e stato letto: offline non e «non hai la chiave»', () => {
        const controller = makeController()
        controller.chat.state.persistenceStatus = 'ready'
        controller.segretiLetti.value = true
        controller.cataloghiNonLetti = new Set(['openai', 'anthropic', 'openrouter'])
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-setup-checklist"]').exists()).toBe(false)
    })

    it('TACE finche il deposito SICURO non e stato letto, anche ad archivio pronto', () => {
        const controller = makeController()
        controller.chat.state.persistenceStatus = 'ready'
        controller.segretiLetti.value = false
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-setup-checklist"]').exists()).toBe(false)
    })

    it('hides when setup is genuinely complete', () => {
        const controller = makeController()
        controller.profiles.value = [{
            id: 'profile-a', provider: 'anthropic', model: 'claude', display_name: 'Claude',
            status: 'healthy', has_secret: true, effort_levels: ['high'], supports_thinking: true,
            show_in_composer: true, capabilities: null, probe_ok: true,
        }] as never
        controller.selectedModelId.value = 'profile-a' as never
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-setup-checklist"]').exists()).toBe(false)
    })

    it('stays hidden once dismissed and persists the dismissal', async () => {
        const wrapper = mount(ChatScreen)
        await wrapper.get('[data-testid="talos-setup-dismiss"]').trigger('click')
        expect(mockState.settings.setOnboarding).toHaveBeenCalledWith({ setup_dismissed: true })

        mockState.settings.state.onboarding = { intro_version: 1, intro_outcome: 'completed', setup_dismissed: true }
        const fresh = mount(ChatScreen)
        expect(fresh.find('[data-testid="talos-setup-checklist"]').exists()).toBe(false)
    })
})

describe('immersive chrome clearance (F2 capture fix)', () => {
    it('adds top padding so messages never slide under the floating pills', () => {
        ;(mockState.settings.state as Record<string, unknown>).shell = { immersive_header: true }
        const wrapper = mount(ChatScreen)
        expect(wrapper.get('[data-testid="talos-chat-scroll"]').classes()).toContain('pt-[calc(3.5rem+env(safe-area-inset-top))]')
    })

    it('keeps the flush top under the classic header', () => {
        ;(mockState.settings.state as Record<string, unknown>).shell = { immersive_header: false }
        const wrapper = mount(ChatScreen)
        expect(wrapper.get('[data-testid="talos-chat-scroll"]').classes()).not.toContain('pt-[calc(3.5rem+env(safe-area-inset-top))]')
    })
})
