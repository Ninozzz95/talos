// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
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
        chat: {
            sessions,
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

    it('starts a new chat from the floating FAB (full page)', async () => {
        // Owner 2026-07-24: on the full page the New action is the bottom-right
        // FAB (the inline top button is embedded/tablet-panel only).
        const wrapper = mountScreen()
        expect(wrapper.find('[data-testid="talos-chats-new"]').exists()).toBe(false)
        await wrapper.get('[data-testid="talos-new-chat-fab"]').trigger('click')
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
