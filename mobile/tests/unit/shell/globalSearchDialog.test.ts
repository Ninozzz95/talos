// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createStationFacades } from '@/stores/stationFacades'
import { useTalosLocalization } from '@/i18n'
import { handleTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import TalosGlobalSearchDialog from '@/components/shell/TalosGlobalSearchDialog.vue'
import TalosMobileSidebar from '@/components/shell/TalosMobileSidebar.vue'

const state = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => state.controller }))

const at = '2026-09-12T10:00:00.000Z'
let repository: ReturnType<typeof createMemoryChatRepository>
let router: ReturnType<typeof createRouter>
const mounted: Array<{ unmount(): void }> = []
function controller() { return state.controller as ReturnType<typeof makeController> }
function makeController(sessions: Awaited<ReturnType<typeof repository.listSessions>>) {
    return {
        chat: { history: reactive(sessions) },
        ...createStationFacades({ repository, activeSessionId: () => null }),
        searchMessages: vi.fn((term: string) => repository.searchMessages(term)),
        listSearchFiles: vi.fn(() => repository.listVaultFileSummaries()),
        sessionLifecycle: { selectSession: vi.fn(async (id: string) => repository.selectSession(id)) },
    }
}
beforeEach(async () => {
    await useTalosLocalization().setMode('it')
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion'),
        media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
    repository = createMemoryChatRepository()
    await repository.initialize()
    for (const [id, title, metadata] of [
        ['chat', 'Viaggio in Sicilia', {}], ['archived', 'Viaggio passato', { archived: true }],
        ['code', 'Codice segreto', { codice: true }],
    ] as const) {
        await repository.createSession({ id, title, metadata, active_model_profile_id: null, created_at: at })
        await repository.appendMessage({ id: `${id}-message`, session_id: id, role: 'user', state: 'persisted',
            content: id === 'chat' ? `${'Testo precedente. '.repeat(100)}Il biglietto è per Catania.` : 'Ricordo di viaggio.', created_at: at })
    }
    await repository.createNote({ id: 'note', title: 'Valigia', content: 'Portare la giacca.', created_at: at })
    await repository.createTask({ id: 'task', title: 'Prenotazione', description: 'Confermare il traghetto.',
        priority: 'normal', run_id: null, created_at: at })
    await repository.createMemory({ id: 'memory', title: 'Abitudini', content: 'Preferisco il finestrino.', kind: 'preference',
        scope_type: 'global', scope_id: null, source: null, metadata: {}, created_at: at })
    await repository.createVaultFile({ id: 'file', display_name: 'Itinerario.pdf', media_type: 'application/pdf', size_bytes: 10,
        private_uri: 'private://file', status: 'available', trust: 'untrusted', sha256: null, extracted_text: null,
        failure_code: null, created_at: at })
    state.controller = makeController(await repository.listSessions())
    router = createRouter({ history: createMemoryHistory(), routes: [
        { path: '/', name: 'chat', component: { template: '<div />' } },
        { path: '/chats', name: 'chats', component: { template: '<div />' } },
        ...['note', 'task', 'memory'].map((name) => ({ path: `/${name}/:id`, name: `${name}-item`, component: { template: '<div />' } })),
        ...['context', 'settings', 'settings-models', 'settings-privilege'].map((name) => ({ path: `/${name}`, name, component: { template: '<div />' } })),
    ] })
    await router.push('/')
    await router.isReady()
})
afterEach(async () => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    vi.unstubAllGlobals()
    await useTalosLocalization().setMode('en')
    document.body.innerHTML = ''
})
async function dialog() {
    const wrapper = mount(TalosGlobalSearchDialog, { attachTo: document.body, global: { plugins: [router] } })
    mounted.push(wrapper)
    await flushPromises()
    return wrapper
}
function field() { return new DOMWrapper(document.querySelector<HTMLInputElement>('[role="combobox"]')!) }
function options() { return [...document.querySelectorAll<HTMLElement>('[role="option"]')] }
async function search(value: string) {
    await field().setValue(value)
    await flushPromises()
}

describe('B06 — Cerca in Talos', () => {
    it.each([false, true])('opens the real async dialog from the sidebar (fixed=%s), closes the native layer and restores focus', async (fixed) => {
        const Host = defineComponent({ setup() {
            const open = ref(true)
            return () => h(TalosMobileSidebar, { fixed, open: open.value, 'onUpdate:open': (value: boolean) => { open.value = value },
                sessions: controller().chat.history, activeSessionId: 'chat', busy: false, creatingSession: false })
        } })
        const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [router] } })
        mounted.push(wrapper)
        const trigger = new DOMWrapper(document.querySelector<HTMLButtonElement>('.nav-search')!)
        ;(trigger.element as HTMLElement).focus()
        await trigger.trigger('click')
        await vi.waitFor(() => expect(document.querySelector('[role="combobox"]')).not.toBeNull())
        await flushPromises()
        expect(document.querySelector('[data-testid="talos-global-search"]')?.getAttribute('aria-label')).toBe('Cerca in Talos')
        expect(document.activeElement).toBe(field().element)
        if (!fixed) expect(document.querySelector('dialog[data-testid="talos-mobile-sidebar"]')?.hasAttribute('open')).toBe(false)
        expect(router.currentRoute.value.name).toBe('chat')
        await field().trigger('keydown', { key: 'Escape' })
        await vi.waitFor(() => expect(document.querySelector('[role="combobox"]')).toBeNull())
        expect(document.activeElement).toBe(trigger.element)
        if (!fixed) expect(document.querySelector('dialog[data-testid="talos-mobile-sidebar"]')?.hasAttribute('open')).toBe(true)
    })

    it.each([
        ['Catania', 'chat:chat', 'chat', undefined],
        ['giacca', 'note:note', 'note-item', 'note'],
        ['traghetto', 'task:task', 'task-item', 'task'],
        ['finestrino', 'memory:memory', 'memory-item', 'memory'],
        ['itinerario', 'file:file', 'context', undefined],
        ['dettatura', 'setting:voice', 'settings', undefined],
        ['Modelli', 'setting:models', 'settings-models', undefined],
        ['Controllo del telefono', 'setting:phone', 'settings-privilege', undefined],
    ])('finds %s and opens its actual destination', async (query, id, route, entityId) => {
        const wrapper = await dialog()
        await search(query!)
        const option = options().find((option) => option.dataset.resultId === id)
        expect(option).toBeDefined()
        await new DOMWrapper(option!).trigger('mousedown')
        expect(document.activeElement).toBe(field().element)
        option!.click()
        await flushPromises()
        expect(router.currentRoute.value.name).toBe(route)
        if (entityId) expect(router.currentRoute.value.params.id).toBe(entityId)
        if (id === 'setting:voice') expect(router.currentRoute.value.query.tab).toBe('voice')
        if (id === 'chat:chat') expect(controller().sessionLifecycle.selectSession).toHaveBeenCalledWith('chat')
        expect(wrapper.emitted('close')).toEqual([[true]])
    })
    it('keeps DOM focus in the combobox, moves the active descendant and opens with Enter', async () => {
        const wrapper = await dialog()
        await search('viaggio')
        expect(options()).toHaveLength(2)
        const input = field()
        expect(input.attributes('aria-controls')).toBe(document.querySelector('[role="listbox"]')?.id)
        expect(input.attributes('aria-activedescendant')).toBe(options()[0]!.id)
        await input.trigger('keydown', { key: 'ArrowDown' })
        expect(input.attributes('aria-activedescendant')).toBe(options()[1]!.id)
        expect(options()[1]!.getAttribute('aria-selected')).toBe('true')
        await input.trigger('keydown', { key: 'ArrowDown' })
        expect(input.attributes('aria-activedescendant')).toBe(options()[1]!.id)
        await input.trigger('keydown', { key: 'ArrowUp' })
        expect(input.attributes('aria-activedescendant')).toBe(options()[0]!.id)
        expect(document.activeElement).toBe(input.element)
        await input.trigger('keydown', { key: 'Enter', isComposing: true })
        expect(controller().sessionLifecycle.selectSession).not.toHaveBeenCalled()
        await input.trigger('keydown', { key: 'Enter' })
        await flushPromises()
        expect(controller().sessionLifecycle.selectSession).toHaveBeenCalledWith('archived')
        expect(wrapper.emitted('close')).toEqual([[true]])
    })
    it('shows the mockup empty state, no stale active descendant, and no hidden destinations', async () => {
        const wrapper = await dialog()
        await search('inesistente')
        expect(options()).toHaveLength(0)
        expect(field().attributes('aria-activedescendant')).toBeUndefined()
        expect(field().attributes('aria-expanded')).toBe('false')
        const sheet = document.querySelector('[data-testid="talos-global-search"]')!
        expect(sheet.textContent).toContain('Nessun risultato')
        expect(sheet.textContent).toContain('Prova una parola della chat o il nome di un’impostazione.')
        await field().trigger('keydown', { key: 'ArrowDown' })
        await field().trigger('keydown', { key: 'Enter' })
        expect(wrapper.emitted('close')).toBeUndefined()
        for (const term of ['Codice segreto', 'skill', 'progetti', 'Integrazioni']) {
            await search(term)
            expect(options()).toHaveLength(0)
        }
    })
    it('ranks mixed results by the Library score before applying the limit of 16', async () => {
        for (let index = 0; index < 20; index++) await repository.createNote({ id: `extra-${index}`, title: `Appunto ${index}`,
            content: 'viaggio', created_at: at })
        await dialog()
        await search('viaggio')
        expect(options()).toHaveLength(16)
        // The archived chat matches both title and body, then the title-only chat.
        expect(options()[0]!.dataset.resultId).toBe('chat:archived')
        expect(options()[1]!.dataset.resultId).toBe('chat:chat')
        expect(options().slice(2).every((option) => option.dataset.resultId?.startsWith('note:'))).toBe(true)
    })
    it('ignores late message hits, surfaces read/open errors in ordinary language, and handles Back', async () => {
        let finish!: (hits: unknown[]) => void
        controller().searchMessages.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }) as never)
        const wrapper = await dialog()
        await search('vecchia')
        await search('assente')
        finish([{ sessionId: 'chat', messageId: 'late', excerpt: 'assente' }])
        await flushPromises()
        expect(options()).toHaveLength(0)
        controller().searchMessages.mockRejectedValueOnce(new Error('SQLITE_INTERNAL_DETAILS'))
        await search('errore')
        expect(document.querySelector('[role="alert"]')?.textContent).toContain('Non è stato possibile cercare')
        expect(document.body.textContent).not.toContain('SQLITE_INTERNAL_DETAILS')
        await search('Catania')
        controller().sessionLifecycle.selectSession.mockRejectedValueOnce(new Error('INTERNAL_OPEN'))
        await field().trigger('keydown', { key: 'Enter' })
        await flushPromises()
        expect(document.querySelector('[role="alert"]')?.textContent).toContain('Non è stato possibile aprire')
        expect(wrapper.emitted('close')).toBeUndefined()
        expect(handleTalosOverlayBack()).toBe(true)
        await vi.waitFor(() => expect(wrapper.emitted('close')).toEqual([[]]))
    })
})
