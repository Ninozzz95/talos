// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

// F3-T3 (owner #12, "Claude pattern"): a dedicated chat-list PAGE — search,
// tap-to-open, New chat on top. F5.1 (owner directive): row actions live in a
// TAP-AND-HOLD dropdown (Open / Rename / Archive / Delete).
const mockState = vi.hoisted(() => ({
    controller: null as unknown,
    routerPush: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockState.routerPush }) }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import ChatsScreen from '@/screens/ChatsScreen.vue'
import { __resetToastsForTests, useTalosMobileToasts } from '@/stores/toasts'

function makeController() {
    const sessions = reactive([
        { id: 's1', title: 'Pancake recipe', updated_at: '2026-07-23T08:00:00.000Z', metadata: {} as Record<string, unknown> },
        { id: 's2', title: 'Streaming design', updated_at: '2026-07-23T09:00:00.000Z', metadata: {} as Record<string, unknown> },
    ])
    return {
        searchMessages: vi.fn().mockResolvedValue([]),
        // B3 / F4-B: le fonti dello stato di ogni riga, con la stessa forma del controller vero.
        pendingToolAuthorizations: ref<Array<{ session_id: string }>>([]),
        toolAuthorizationRecoveries: ref<Array<{ session_id: string }>>([]),
        chat: {
            sessions,
            state: reactive({
                sending: false,
                sendingSessionId: null as string | null,
                queues: {} as Record<string, { voci: unknown[], inPausa: boolean }>,
            }),
            messages: reactive([] as Array<{ role: string, state: string, metadata: Record<string, unknown> }>),
            /**
             * The history the screen shows, DERIVED here exactly as the store
             * derives it — a fake that returns its own fixed list could not see
             * a screen reading the wrong one.
             */
            get history() {
                return sessions.filter((session) => (session as { has_messages?: boolean }).has_messages !== false)
            },
            activeSession: ref<{ id: string } | null>({ id: 's2' }),
            setSessionArchived: vi.fn().mockImplementation(async (id: string, archived: boolean) => {
                const session = sessions.find((candidate) => candidate.id === id)
                if (session) session.metadata = { ...session.metadata, archived }
            }),
            setSessionOrder: vi.fn().mockResolvedValue(undefined),
        },
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
        // The delete confirmation names what the chat would take from the
        // Library (owner 2026-07-26); nothing here produced files.
        planSessionCleanup: vi.fn(() => ({ documents: [], sources: [] })),
        deleteSessionMedia: vi.fn().mockResolvedValue([]),
        // A3-84: le fonti dei filtri del foglio (allegati, documenti generati, nomi dei modelli).
        listSessionIdsWithAttachments: vi.fn().mockResolvedValue([] as string[]),
        attachments: reactive({
            vaultFiles: [] as Array<{ id: string, metadata: Record<string, unknown> }>,
            vaultError: ref<string | null>(null),
            refreshVault: vi.fn().mockResolvedValue(undefined),
        }),
        profiles: ref([] as Array<{ id: string, display_name: string, provider?: string }>),
    }
}

beforeEach(() => {
    __resetToastsForTests()
    mockState.routerPush.mockReset()
    mockState.controller = makeController()
    document.body.innerHTML = ''
})

function mountScreen() {
    return mount(ChatsScreen, { attachTo: document.body })
}

function pointer(element: Element, type: string, x = 100, y = 100): void {
    // vue-test-utils cannot set clientX on synthesized events — dispatch a
    // real MouseEvent (jsdom accepts pointer types through it).
    element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }))
}

async function holdRow(wrapper: ReturnType<typeof mountScreen>, selector: string, index = 0): Promise<void> {
    vi.useFakeTimers()
    try {
        const row = wrapper.findAll(selector)[index].element
        pointer(row, 'pointerdown')
        await vi.advanceTimersByTimeAsync(600)
        pointer(row, 'pointerup')
    } finally {
        vi.useRealTimers()
    }
    await flushPromises()
}

/**
 * Il menu ora sta sotto il ⋮, che e' visibile: si apre toccandolo, non
 * scoprendolo con un gesto.
 */
async function openRowMenu(
    wrapper: ReturnType<typeof mountScreen>,
    selector = '[data-testid="talos-chats-row"]',
    index = 0,
): Promise<void> {
    const riga = wrapper.findAll(selector)[index]
    const trigger = riga.find('[data-testid^="talos-chats-menu-"]')
    if (!trigger.exists()) throw new Error('nessun ⋮ sulla riga')
    await trigger.trigger('click')
    await flushPromises()
}

function menuItem(label: string): HTMLButtonElement {
    const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((button) => button.textContent?.trim() === label)
    if (!item) throw new Error(`menu item ${label} not found`)
    return item
}

describe('ChatsScreen (F3-T3)', () => {
    it('B12 finds message-only matches, shows excerpts and preserves order and Archived', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.chat.sessions.push({ id: 'archived', title: 'Old trip', updated_at: '2026-07-22T08:00:00.000Z', metadata: { archived: true } })
        controller.searchMessages.mockResolvedValue([
            { sessionId: 's1', messageId: 'm1', excerpt: 'Il treno per Catania.' },
            { sessionId: 'archived', messageId: 'm3', excerpt: 'Una sera a Catania.' },
            { sessionId: 's2', messageId: 'm2', excerpt: 'Partiamo da Catania.' },
        ])
        const wrapper = mountScreen()
        await wrapper.get('[data-testid="talos-chats-search"]').setValue('Catania')
        await flushPromises()
        const rows = wrapper.findAll('[data-testid="talos-chats-row"]')
        expect(rows.map((row) => row.text())).toEqual([
            expect.stringContaining('Streaming design'), expect.stringContaining('Pancake recipe'),
        ])
        expect(rows[0].get('[data-testid="talos-chat-search-excerpt"]').text()).toBe('Partiamo da Catania.')
        await wrapper.get('[data-testid="talos-chats-archived-toggle"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-chats-archived-row"]').text()).toContain('Una sera a Catania.')
        await rows[0].get('[data-testid="talos-chats-open"]').trigger('click')
        expect(controller.selectSession).toHaveBeenCalledWith('s2')
        await wrapper.get('[data-testid="talos-chats-search"]').setValue('')
        expect(wrapper.find('[data-testid="talos-chat-search-excerpt"]').exists()).toBe(false)
        wrapper.unmount()
    })
    it('B12 ignores late results from the previous query and explains a failed read', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        let finish!: (hits: unknown[]) => void
        controller.searchMessages.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
        const wrapper = mountScreen()
        const field = wrapper.get('[data-testid="talos-chats-search"]')
        await field.setValue('old')
        await field.setValue('absent')
        await flushPromises()
        finish([{ sessionId: 's1', messageId: 'm1', excerpt: 'old' }])
        await flushPromises()
        expect(wrapper.findAll('[data-testid="talos-chats-row"]')).toHaveLength(0)
        controller.searchMessages.mockRejectedValueOnce(new Error('SQLITE_INTERNAL_DETAILS'))
        await field.setValue('failed')
        await flushPromises()
        expect(wrapper.get('[role="alert"]').text()).toContain('Messages could not be searched')
        expect(wrapper.text()).not.toContain('SQLITE_INTERNAL_DETAILS')
        wrapper.unmount()
    })
    it('lists every session with the active one marked, most recent first', () => {
        const wrapper = mountScreen()
        const rows = wrapper.findAll('[data-testid="talos-chats-row"]')
        expect(rows).toHaveLength(2)
        expect(rows[0].text()).toContain('Streaming design')
        expect(wrapper.get('[data-testid="talos-chats-row"][data-active="true"]').text()).toContain('Streaming design')
    })

    it('filters locally through the search field', async () => {
        const wrapper = mountScreen()
        await wrapper.get('[data-testid="talos-chats-search"]').setValue('pancake')
        expect(wrapper.findAll('[data-testid="talos-chats-row"]')).toHaveLength(1)
        expect(wrapper.text()).toContain('Pancake recipe')
    })

    it('opens a chat on tap and returns to the chat route', async () => {
        const wrapper = mountScreen()
        await wrapper.findAll('[data-testid="talos-chats-open"]')[1].trigger('click')
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.selectSession).toHaveBeenCalledWith('s1')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'chat' })
    })

    it('starts a new chat from the «+» next to the title (full page, phone)', async () => {
        // Owner 2026-07-24 had put a floating FAB here; owner 2026-09-25 (A3-84, «come le stazioni») moved New to
        // the station place: next to the title on the phone, in the toolbar on the tablet. One New, never two.
        const wrapper = mountScreen()
        expect(wrapper.find('[data-testid="talos-new-chat-fab"]').exists()).toBe(false)
        expect(wrapper.findAll('[data-testid="talos-chats-new"]')).toHaveLength(1)
        expect(wrapper.get('header [data-testid="talos-chats-new"]').attributes('aria-label')).toBe('New chat')
        await wrapper.get('[data-testid="talos-chats-new"]').trigger('click')
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.newSession).toHaveBeenCalledOnce()
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'chat' })
    })

    it('keeps the inline New button in embedded (tablet panel) mode', () => {
        const wrapper = mount(ChatsScreen, { props: { embedded: true }, attachTo: document.body })
        expect(wrapper.find('[data-testid="talos-chats-new"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-new-chat-fab"]').exists()).toBe(false)
        wrapper.unmount()
    })
})

// F6 — tablet split view embeds this screen as the persistent left panel:
// selection must NOT navigate (the chat is already on the right) but must
// announce itself so the shell can dismiss an open station sheet.
describe('ChatsScreen embedded panel mode (F6)', () => {
    it('opens a chat without routing and emits activated', async () => {
        const wrapper = mount(ChatsScreen, { props: { embedded: true }, attachTo: document.body })
        await wrapper.findAll('[data-testid="talos-chats-open"]')[1].trigger('click')
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.selectSession).toHaveBeenCalledWith('s1')
        expect(mockState.routerPush).not.toHaveBeenCalled()
        expect(wrapper.emitted('activated')).toHaveLength(1)
        wrapper.unmount()
    })

    it('starts a new chat without routing and emits activated', async () => {
        const wrapper = mount(ChatsScreen, { props: { embedded: true }, attachTo: document.body })
        await wrapper.get('[data-testid="talos-chats-new"]').trigger('click')
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.newSession).toHaveBeenCalledOnce()
        expect(mockState.routerPush).not.toHaveBeenCalled()
        expect(wrapper.emitted('activated')).toHaveLength(1)
        wrapper.unmount()
    })

    it('SF6-F1: the embedded root must not carry min-h-full (it clips the panel list)', () => {
        const embedded = mount(ChatsScreen, { props: { embedded: true }, attachTo: document.body })
        expect(embedded.get('[data-testid="talos-chats-screen"]').classes()).not.toContain('min-h-full')
        embedded.unmount()
        const page = mount(ChatsScreen, { attachTo: document.body })
        expect(page.get('[data-testid="talos-chats-screen"]').classes()).toContain('min-h-full')
        page.unmount()
    })

    it('SF6-F2 non e piu un problema: il ⋮ sta DENTRO la riga, anche nel pannello', async () => {
        /**
         * Il difetto originale era un menu posizionato a mano che sul tablet si
         * spalmava su tutta la vista divisa. Ora il menu appartiene al ⋮ della
         * riga e si ancora da se': non c'e' piu' un calcolo che possa sbagliare.
         */
        const wrapper = mount(ChatsScreen, { props: { embedded: true }, attachTo: document.body })
        const riga = wrapper.findAll('[data-testid="talos-chats-row"]')[0]
        expect(riga.find('[data-testid^="talos-chats-menu-"]').exists()).toBe(true)
        wrapper.unmount()
    })
})

describe('il gesto e il ⋮ — allineati alla Ricerca (2026-08-04)', () => {
    it('G02/G03 (mockup 12/09): il tieni-premuto (430 ms) e il tasto destro aprono il menu della riga; «Seleziona» accende la selezione; il dito che scorre no', async () => {
        const wrapper = mountScreen()
        // Dito che scorre: niente, era uno scorrimento della lista.
        vi.useFakeTimers()
        try {
            const row = wrapper.findAll('[data-testid="talos-chats-row"]')[0].element
            pointer(row, 'pointerdown', 100, 100)
            pointer(row, 'pointermove', 100, 140)
            await vi.advanceTimersByTimeAsync(700)
        } finally {
            vi.useRealTimers()
        }
        expect(wrapper.find('[data-testid="talos-chats-selection-bar"]').exists()).toBe(false)
        expect(document.querySelector('[role="menuitem"]')).toBeNull()

        await holdRow(wrapper, '[data-testid="talos-chats-row"]')
        // Il menu della riga, non la selezione.
        expect(wrapper.find('[data-testid="talos-chats-selection-bar"]').exists()).toBe(false)
        const voci = [...document.querySelectorAll('[role="menuitem"]')].map((v) => v.textContent?.trim())
        expect(voci).toContain('Archive')
        expect(voci).toContain('Select')
        // «Seleziona» dal menu: la riga tenuta parte gia' spuntata.
        menuItem('Select').click()
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-chats-selection-bar"]').text()).toContain('1')
        wrapper.unmount()

        // Tasto destro: stesso menu, subito.
        const w2 = mountScreen()
        const riga = w2.findAll('[data-testid="talos-chats-row"]')[0].element
        riga.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
        await flushPromises()
        expect([...document.querySelectorAll('[role="menuitem"]')].map((v) => v.textContent?.trim())).toContain('Archive')
        w2.unmount()
    })

    it('il ⋮ e visibile senza scoprirlo, e porta le stesse azioni', async () => {
        const wrapper = mountScreen()
        await openRowMenu(wrapper)
        const voci = [...document.querySelectorAll('[role="menuitem"]')].map((v) => v.textContent?.trim())
        expect(voci).toContain('Archive')
        expect(voci).toContain('Delete')
        wrapper.unmount()
    })

    it('archives from the menu and unarchives from the archived section menu', async () => {
        const wrapper = mountScreen()
        await openRowMenu(wrapper, '[data-testid="talos-chats-row"]', 1) // Pancake recipe
        menuItem('Archive').click()
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.chat.setSessionArchived).toHaveBeenCalledWith('s1', true)
        expect(wrapper.findAll('[data-testid="talos-chats-row"]')).toHaveLength(1)

        await wrapper.get('[data-testid="talos-chats-archived-toggle"]').trigger('click')
        await openRowMenu(wrapper, '[data-testid="talos-chats-archived-row"]')
        menuItem('Unarchive').click()
        await flushPromises()
        expect(controller.chat.setSessionArchived).toHaveBeenCalledWith('s1', false)
        expect(wrapper.findAll('[data-testid="talos-chats-row"]')).toHaveLength(2)
        wrapper.unmount()
    })

    it('undoes archiving while the toast is visible and expires the action after eight seconds', async () => {
        vi.useFakeTimers()
        const wrapper = mountScreen()
        try {
            const controller = mockState.controller as ReturnType<typeof makeController>
            const toasts = useTalosMobileToasts()
            await openRowMenu(wrapper, '[data-testid="talos-chats-row"]', 1)
            menuItem('Archive').click()
            await flushPromises()
            const toast = toasts.items.value[0]!
            expect(toast.message).toBe('Chat archived')
            expect(toast.action?.label).toBe('Undo')
            toasts.act(toast.id)
            await flushPromises()
            expect(controller.chat.setSessionArchived).toHaveBeenLastCalledWith('s1', false)
            expect(wrapper.findAll('[data-testid="talos-chats-row"]')).toHaveLength(2)
            expect(toasts.items.value).toHaveLength(0)
            await openRowMenu(wrapper, '[data-testid="talos-chats-row"]', 1)
            menuItem('Archive').click()
            await flushPromises()
            const expired = toasts.items.value[0]!.id
            await vi.advanceTimersByTimeAsync(7999)
            expect(toasts.items.value).toHaveLength(1)
            await vi.advanceTimersByTimeAsync(1)
            expect(toasts.items.value).toHaveLength(0)
            controller.chat.setSessionArchived.mockClear()
            toasts.act(expired)
            expect(controller.chat.setSessionArchived).not.toHaveBeenCalled()
        } finally {
            wrapper.unmount()
            __resetToastsForTests()
            vi.useRealTimers()
        }
    })

    it('renames through the menu and keeps the dialog open on failure', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.renameSession.mockRejectedValueOnce(new Error('TALOS_CHAT_RENAME_UNVERIFIED'))
        const wrapper = mountScreen()
        await openRowMenu(wrapper, '[data-testid="talos-chats-row"]', 1)
        menuItem('Rename').click()
        await flushPromises()
        const input = document.body.querySelector<HTMLInputElement>('[aria-label="Chat name"]')
        expect(input).not.toBeNull()
        input!.value = 'Crêpes'
        input!.dispatchEvent(new Event('input'))
        await flushPromises()
        const save = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Save'))
        save!.click()
        await flushPromises()
        expect(controller.renameSession).toHaveBeenCalledWith('s1', 'Crêpes')
        expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('TALOS_CHAT_RENAME_UNVERIFIED')
        wrapper.unmount()
    })

    it('deletes through the menu behind the confirm dialog', async () => {
        const wrapper = mountScreen()
        await openRowMenu(wrapper, '[data-testid="talos-chats-row"]', 1)
        menuItem('Delete').click()
        await flushPromises()
        const dialog = document.body.querySelector('[role="dialog"]')
        expect(dialog?.textContent).toContain('Delete chat?')
        const confirm = [...dialog!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Delete')
        confirm!.click()
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.deleteSession).toHaveBeenCalledWith('s1')
        wrapper.unmount()
    })
})

/**
 * ⭐ B3 / F4-B (parità desktop A1-01) — ogni riga dice lo STATO della chat.
 *
 * L'etichetta prende il posto dell'ora quando c'è qualcosa da dire (come la lista
 * gemella `HarnessScreen.vue:315-346`); «conclusa» e «vuota» tacciono e la riga
 * resta quella di prima. Le chiavi `chats.status.*` si fondono qui nel plugin
 * vero: i cataloghi li scrive chi li possiede in questo giro.
 */
describe('ChatsScreen — lo stato di ogni chat (B3 / F4-B)', () => {
    type Composer = { mergeLocaleMessage(locale: string, messages: object): void, locale: { value: string } }
    let lingua = 'en'
    beforeEach(async () => {
        const { createTalosI18n } = await import('@/i18n')
        const global = (await createTalosI18n()).global as unknown as Composer
        global.mergeLocaleMessage('it', { chats: { status: {
            waiting: 'aspetta te', running: 'in corso', queued: 'in coda', failed: 'fallita', interrupted: 'interrotta',
            rowLabel: '{title}, {status}',
        } } })
        lingua = global.locale.value
        global.locale.value = 'it'
    })
    afterEach(async () => {
        const { createTalosI18n } = await import('@/i18n')
        ;((await createTalosI18n()).global as unknown as Composer).locale.value = lingua
    })

    function righe(wrapper: ReturnType<typeof mountScreen>) {
        return Object.fromEntries(wrapper.findAll('[data-testid="talos-chats-row"]').map((riga) => [
            riga.get('[data-testid="talos-chats-open"]').text().includes('Pancake') ? 's1' : 's2',
            riga,
        ]))
    }

    // A3-84 seconda parte (owner 25/09 10:20, «stato + ora insieme»): lo stato non prende più il posto dell'ora.
    it('CHATS-STATO-01 la chat che sta rispondendo dice «in corso» accanto all\'ora; l\'altra ha solo l\'ora', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.chat.state.sending = true
        controller.chat.state.sendingSessionId = 's1'
        const wrapper = mountScreen()
        await flushPromises()
        const { s1, s2 } = righe(wrapper)
        expect(s1!.get('[data-testid="talos-chat-status"]').text()).toBe('in corso')
        expect(s1!.find('[data-testid="talos-chats-row-time"]').exists()).toBe(true)
        expect(s2!.find('[data-testid="talos-chat-status"]').exists()).toBe(false)
        expect(s2!.find('[data-testid="talos-chats-row-time"]').exists()).toBe(true)

        // Il giro finisce: l'etichetta se ne va e torna l'ora, senza ricaricare.
        controller.chat.state.sending = false
        controller.chat.state.sendingSessionId = null
        await flushPromises()
        expect(righe(wrapper).s1!.find('[data-testid="talos-chat-status"]').exists()).toBe(false)
        expect(righe(wrapper).s1!.find('[data-testid="talos-chats-row-time"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('CHATS-STATO-02 una chat con voci in coda dice «in coda»', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.chat.state.queues = { s2: { voci: [{ id: 'q1' }], inPausa: false } }
        const wrapper = mountScreen()
        await flushPromises()
        expect(righe(wrapper).s2!.get('[data-testid="talos-chat-status"]').text()).toBe('in coda')
        expect(righe(wrapper).s1!.find('[data-testid="talos-chat-status"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('CHATS-STATO-03 un permesso in attesa dice «aspetta te», col tono d\'attenzione e nel nome della riga', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.pendingToolAuthorizations.value = [{ session_id: 's1' }]
        // Anche se la stessa chat sta rispondendo: la domanda aperta viene prima.
        controller.chat.state.sending = true
        controller.chat.state.sendingSessionId = 's1'
        const wrapper = mountScreen()
        await flushPromises()
        const { s1 } = righe(wrapper)
        const etichetta = s1!.get('[data-testid="talos-chat-status"]')
        expect(etichetta.text()).toBe('aspetta te')
        expect(etichetta.attributes('data-tone')).toBe('attenzione')
        expect(s1!.get('[data-testid="talos-chats-open"]').attributes('aria-label')).toBe('Pancake recipe, aspetta te')
        wrapper.unmount()
    })

    it('CHATS-STATO-04 dal disco: fallita e interrotta; conclusa tace e la riga non cambia nome', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        Object.assign(controller.chat.sessions[0]!, { last_message: { role: 'system', state: 'failed', interrupted: false, model_profile_id: null } })
        Object.assign(controller.chat.sessions[1]!, { last_message: { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: null } })
        const wrapper = mountScreen()
        await flushPromises()
        const { s1, s2 } = righe(wrapper)
        expect(s1!.get('[data-testid="talos-chat-status"]').text()).toBe('fallita')
        expect(s1!.get('[data-testid="talos-chat-status"]').attributes('data-tone')).toBe('pericolo')
        expect(s2!.find('[data-testid="talos-chat-status"]').exists()).toBe(false)
        expect(s2!.get('[data-testid="talos-chats-open"]').attributes('aria-label')).toBeUndefined()
        wrapper.unmount()

        Object.assign(controller.chat.sessions[1]!, { last_message: { role: 'assistant', state: 'persisted', interrupted: true, model_profile_id: null } })
        const dopo = mountScreen()
        await flushPromises()
        expect(righe(dopo).s2!.get('[data-testid="talos-chat-status"]').text()).toBe('interrotta')
        dopo.unmount()
    })

    it('CHATS-STATO-05 durante una ricerca lo stato resta accanto all\'estratto: «aspetta te» non si nasconde', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.pendingToolAuthorizations.value = [{ session_id: 's2' }]
        controller.searchMessages.mockResolvedValue([{ sessionId: 's2', messageId: 'm2', excerpt: 'Partiamo da Catania.' }])
        const wrapper = mountScreen()
        await wrapper.get('[data-testid="talos-chats-search"]').setValue('Catania')
        await flushPromises()
        const { s2 } = righe(wrapper)
        expect(s2!.get('[data-testid="talos-chat-status"]').text()).toBe('aspetta te')
        expect(s2!.get('[data-testid="talos-chat-search-excerpt"]').text()).toBe('Partiamo da Catania.')
        wrapper.unmount()
    })
})

/*
 * ⭐ A3-84 (owner 24/09 sera; decisioni 25/09, `.claude/ricerche/2026-09-25-elenco-chat-grammatica-stazioni-10x4.md`)
 * — l'elenco delle chat con la grammatica delle stazioni: titolo e sottotitolo, schede di stato coi conteggi, foglio
 * Opzioni con Ordina, Periodo, Contenuto, Modello e «Azzera», stati vuoti distinti.
 */
describe('ChatsScreen — la grammatica delle stazioni (A3-84)', () => {
    type Controller = ReturnType<typeof makeController>
    const ORA = Date.now()
    const fa = (giorni: number) => new Date(ORA - giorni * 24 * 60 * 60 * 1000).toISOString()

    function conSessioni(): Controller {
        const controller = mockState.controller as Controller
        controller.chat.sessions.splice(0, controller.chat.sessions.length,
            { id: 'a', title: 'Albero', created_at: fa(40), updated_at: fa(0), metadata: {}, last_message: { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: 'glm', created_at: fa(0) } } as never,
            { id: 'b', title: 'banana', created_at: fa(2), updated_at: fa(10), metadata: {}, last_message: { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: 'kimi', created_at: fa(10) } } as never,
            { id: 'c', title: 'Ciliegia', created_at: fa(1), updated_at: fa(45), metadata: {}, last_message: { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: 'glm', created_at: fa(45) } } as never,
        )
        controller.chat.state.queues = { b: { voci: [{}], inPausa: true } }
        controller.profiles.value = [{ id: 'glm', display_name: 'GLM 5.3 Flash', provider: 'openrouter' }, { id: 'kimi', display_name: 'Moonshot: Kimi K2', provider: 'openrouter' }]
        return controller
    }

    const titoli = (wrapper: ReturnType<typeof mountScreen>) =>
        wrapper.findAll('[data-testid="talos-chats-row"] [data-testid="talos-chats-open"]').map((riga) => riga.findAll('span.truncate')[0]!.text())

    async function apriOpzioni(wrapper: ReturnType<typeof mountScreen>) {
        await wrapper.get('[data-testid="talos-chats-options"]').trigger('click')
        await flushPromises()
    }
    const voce = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement

    it('ELENCO-UI-01 titolo e sottotitolo come le stazioni; il suggerimento di prima non si ripete', () => {
        const wrapper = mountScreen()
        expect(wrapper.get('h1').text()).toBe('Chats')
        expect(wrapper.get('[data-testid="talos-chats-subtitle"]').text()).toBe('Your conversations, most recent first. Press and hold a chat for actions.')
        expect(wrapper.text()).not.toContain('Hold a chat for actions.')
        wrapper.unmount()
    })

    it('ELENCO-UI-02 le schede di stato coi conteggi; una scheda mostra solo le sue chat', async () => {
        conSessioni()
        const wrapper = mountScreen()
        await flushPromises()
        const schede = wrapper.findAll('[data-testid^="talos-chats-filter-"]')
        expect(schede.map((scheda) => `${scheda.get('span').text()} ${scheda.get('small').text()}`)).toEqual(['All 3', 'In progress 0', 'Queued 0', 'Paused 1', 'Finished 2'])
        expect(wrapper.get('[data-testid="talos-chats-filter-tutte"]').attributes('aria-checked')).toBe('true')
        await wrapper.get('[data-testid="talos-chats-filter-in-pausa"]').trigger('click')
        expect(titoli(wrapper)).toEqual(['banana'])
        expect(wrapper.get('[data-testid="talos-chats-count"]').text()).toBe('1 chat')
        wrapper.unmount()
    })

    it('ELENCO-UI-03 il foglio: Periodo filtra, il pulsante dice quanti filtri sono accesi, «Reset» li spegne', async () => {
        conSessioni()
        const wrapper = mountScreen()
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-chats-options"]').attributes('aria-label')).toBe('Chat list options')
        await apriOpzioni(wrapper)
        for (const gruppo of ['periodo', 'contenuto', 'modello']) expect(voce(`talos-chats-group-${gruppo}`)).not.toBeNull()
        voce('talos-chats-periodo-7g').click()
        await flushPromises()
        expect(titoli(wrapper)).toEqual(['Albero'])
        // I conteggi delle schede contano il foglio (owner 25/09): negli ultimi 7 giorni c'è solo Albero.
        expect(wrapper.get('[data-testid="talos-chats-filter-tutte"]').text()).toContain('1')
        expect(wrapper.get('[data-testid="talos-chats-options-active"]').text()).toBe('1')
        expect(wrapper.get('[data-testid="talos-chats-options"]').attributes('aria-label')).toBe('Chat list options, 1 filter on')
        voce('talos-chats-options-reset').click()
        await flushPromises()
        expect(titoli(wrapper)).toHaveLength(3)
        expect(wrapper.find('[data-testid="talos-chats-options-active"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('ELENCO-UI-04 Modello: i nomi veri dei modelli delle ultime risposte; Contenuto chiede al repository le chat con allegati', async () => {
        const controller = conSessioni()
        controller.listSessionIdsWithAttachments.mockResolvedValue(['c'])
        const wrapper = mountScreen()
        await flushPromises()
        await apriOpzioni(wrapper)
        const modelli = [...(voce('talos-chats-group-modello').querySelectorAll('[role="radio"]'))].map((radio) => radio.textContent?.trim())
        expect(modelli).toEqual(['All models', 'GLM 5.3 Flash', 'Kimi K2'])
        voce('talos-chats-modello-glm').click()
        await flushPromises()
        expect(titoli(wrapper)).toEqual(['Albero', 'Ciliegia'])
        voce('talos-chats-contenuto-allegati').click()
        await flushPromises()
        expect(controller.listSessionIdsWithAttachments).toHaveBeenCalled()
        expect(titoli(wrapper)).toEqual(['Ciliegia'])
        wrapper.unmount()
    })

    it('ELENCO-UI-05 Ordina per titolo: A–Z e niente fasce; per creazione le fasce seguono la data di creazione', async () => {
        conSessioni()
        const wrapper = mountScreen()
        await flushPromises()
        await apriOpzioni(wrapper)
        voce('talos-chats-sort-titolo').click()
        await flushPromises()
        expect(titoli(wrapper)).toEqual(['Albero', 'banana', 'Ciliegia'])
        expect(wrapper.findAll('[data-testid="talos-chats-fascia"]')).toHaveLength(0)
        voce('talos-chats-sort-creazione').click()
        await flushPromises()
        expect(titoli(wrapper)).toEqual(['Ciliegia', 'banana', 'Albero'])
        expect(wrapper.findAll('[data-testid="talos-chats-fascia"]').length).toBeGreaterThan(0)
        wrapper.unmount()
    })

    it('ELENCO-UI-06 due assenze diverse: nessuna chat, o i filtri le nascondono — e solo la seconda si azzera', async () => {
        conSessioni()
        const wrapper = mountScreen()
        await flushPromises()
        await wrapper.get('[data-testid="talos-chats-filter-in-corso"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-chats-no-matches"]').text()).toContain('No chat matches these filters')
        await wrapper.get('[data-testid="talos-chats-clear-filters"]').trigger('click')
        expect(titoli(wrapper)).toHaveLength(3)
        expect(wrapper.get('[data-testid="talos-chats-filter-tutte"]').attributes('aria-checked')).toBe('true')
        wrapper.unmount()
    })

    it('ELENCO-UI-07 nel pannello del tablet: niente titolo, ma ricerca, Opzioni, Nuova e le schede', () => {
        const wrapper = mount(ChatsScreen, { props: { embedded: true }, attachTo: document.body })
        expect(wrapper.find('h1').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-chats-search"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-chats-options"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-testid="talos-chats-new"]')).toHaveLength(1)
        expect(wrapper.find('[data-testid="talos-chats-filters"]').exists()).toBe(true)
        wrapper.unmount()
    })

    /*
     * ⛔ ELENCO-REG-01 (Pad, 25/09/2026 10:08): «Con documenti generati» diceva 0 chat mentre la chat su Genova aveva
     * salvato un documento. Il vault del controller si legge solo quando serve (galleria, Contesto, caricamenti): appena
     * aperta l'app è vuoto, e il filtro mentiva. Sceglierlo ora RILEGGE la Libreria, e se la lettura fallisce lo dice.
     */
    it('ELENCO-REG-01 «Con documenti generati» rilegge la Libreria prima di filtrare, e dice se non ci riesce', async () => {
        const controller = conSessioni()
        controller.attachments.refreshVault.mockImplementation(async () => {
            controller.attachments.vaultFiles.splice(0, controller.attachments.vaultFiles.length,
                { id: 'doc', metadata: { origin: 'generated', origin_session_id: 'b' } })
        })
        const wrapper = mountScreen()
        await flushPromises()
        await apriOpzioni(wrapper)
        voce('talos-chats-contenuto-generati').click()
        await flushPromises()
        // Una lettura all'apertura (le icone della riga, A3-84 seconda parte) e una nuova quando scegli il filtro.
        expect(controller.attachments.refreshVault).toHaveBeenCalledTimes(2)
        expect(titoli(wrapper)).toEqual(['banana'])
        controller.attachments.vaultError = 'SQLITE_BUSY' as never
        voce('talos-chats-contenuto-tutte').click()
        await flushPromises()
        voce('talos-chats-contenuto-generati').click()
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-chats-content-failed"]').text()).toContain('could not be read')
        wrapper.unmount()
    })

    /*
     * A3-84 seconda parte (owner 25/09 10:20): sotto il titolo stato E ora insieme, il modello dell'ultima risposta
     * (logo del fornitore + nome corto), le icone di allegati e documenti generati, e «nuova risposta».
     */
    it('ELENCO-RIGA-01 l\'ora resta anche quando lo stato parla; modello col nome corto; icone di allegati e documenti', async () => {
        const controller = conSessioni()
        controller.listSessionIdsWithAttachments.mockResolvedValue(['b'])
        controller.attachments.refreshVault.mockImplementation(async () => {
            controller.attachments.vaultFiles.splice(0, controller.attachments.vaultFiles.length,
                { id: 'doc', metadata: { origin: 'generated', origin_session_id: 'b' } })
        })
        const wrapper = mountScreen()
        await flushPromises()
        const riga = wrapper.findAll('[data-testid="talos-chats-row"]').find((r) => r.text().includes('banana'))!
        expect(riga.get('[data-testid="talos-chat-status"]').text()).toBe('paused')
        expect(riga.find('[data-testid="talos-chats-row-time"]').exists()).toBe(true)
        expect(riga.get('[data-testid="talos-chats-row-model"]').text()).toBe('Kimi K2')
        expect(riga.find('[data-testid="talos-chats-row-model"] [aria-hidden="true"] .talos-mobile-provider-icon').exists()).toBe(true)
        expect(riga.get('[data-testid="talos-chats-row-attachments"]').attributes('aria-label')).toBe('Has attachments')
        expect(riga.get('[data-testid="talos-chats-row-generated"]').attributes('aria-label')).toBe('Has generated documents')
        const altra = wrapper.findAll('[data-testid="talos-chats-row"]').find((r) => r.text().includes('Albero'))!
        expect(altra.find('[data-testid="talos-chats-row-attachments"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('ELENCO-RIGA-02 «nuova risposta» sulla chat che ha risposto dopo l\'ultima apertura, e nel nome della riga', async () => {
        const { __talosNovitaPerLeProve, talosCaricaNovita } = await import('@/stores/chatNovita')
        __talosNovitaPerLeProve({ leggi: async () => JSON.stringify({ base: fa(30), viste: { a: fa(-1) } }), scrivi: async () => undefined })
        await talosCaricaNovita()
        conSessioni()
        const wrapper = mountScreen()
        await flushPromises()
        const nuove = wrapper.findAll('[data-testid="talos-chat-new"]')
        // «banana» (10 giorni fa, mai aperta dopo) è nuova; «Albero» l'hai vista dopo la sua risposta; «Ciliegia»
        // (45 giorni fa) sta prima della base.
        expect(nuove).toHaveLength(1)
        const banana = wrapper.findAll('[data-testid="talos-chats-row"]').find((r) => r.text().includes('banana'))!
        expect(banana.find('[data-testid="talos-chat-new"]').text()).toBe('new reply')
        expect(banana.get('[data-testid="talos-chats-open"]').attributes('aria-label')).toBe('banana, paused, new reply')
        wrapper.unmount()
        __talosNovitaPerLeProve(null)
    })

    it('ELENCO-UI-08 le archiviate seguono gli stessi filtri', async () => {
        const controller = conSessioni()
        controller.chat.sessions.push({ id: 'z', title: 'Zucca', created_at: fa(3), updated_at: fa(3), metadata: { archived: true }, last_message: { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: 'kimi' } } as never)
        const wrapper = mountScreen()
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-chats-archived-toggle"]').text()).toContain('1')
        await apriOpzioni(wrapper)
        voce('talos-chats-modello-glm').click()
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-chats-archived-toggle"]').exists()).toBe(false)
        wrapper.unmount()
    })
})
