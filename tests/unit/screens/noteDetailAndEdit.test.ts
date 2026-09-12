// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import NoteItemScreen from '@/screens/NoteItemScreen.vue'
import NoteNewScreen from '@/screens/NoteNewScreen.vue'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const nota: TalosLocalNote = {
    id: 'n1',
    title: 'Meno, ma meglio',
    content: '> Una buona interfaccia non ti chiede di capirla.\n\nTogliere un passaggio vale più di aggiungere un effetto.',
    trust_level: 'untrusted',
    content_origin: 'user-direct',
    pinned: false,
    created_at: '2026-09-10T08:00:00.000Z',
    updated_at: '2026-09-10T08:00:00.000Z',
}

let notes: TalosLocalNote[] = []
let route = { name: 'note-item', params: { id: 'n1' } as Record<string, string> }

const update = vi.fn(async (input: { id: string }) => ({ ...nota, ...input }))
const create = vi.fn(async () => nota)
const remove = vi.fn(async () => undefined)
const push = vi.fn()
const replace = vi.fn()

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        notes: { list: vi.fn(async () => notes), create, update, remove },
    }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push, replace, back: vi.fn() }),
    useRoute: () => route,
}))

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key, locale: { value: 'it' } }),
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))

const exportTalosNoteText = vi.fn(async () => 'shared' as const)
vi.mock('@/components/talos/notes/noteExport', () => ({
    exportTalosNoteText: (...args: unknown[]) => exportTalosNoteText(...args as []),
}))

beforeEach(() => {
    vi.clearAllMocks()
    notes = [{ ...nota }]
    route = { name: 'note-item', params: { id: 'n1' } }
})

async function detail() {
    const wrapper = mount(NoteItemScreen)
    await flushPromises()
    return wrapper
}

/**
 * U-12 — l'unico posto dell'app in cui si dice da dove viene il testo di una
 * nota. Prima era su ogni riga e su ogni scheda dell'elenco.
 */
describe('U-12 the note page declares whose content this is', () => {
    it('says «content you provided» in the paper footer', async () => {
        const wrapper = await detail()
        const foot = wrapper.get('[data-testid="talos-note-item-origin"]')
        expect(foot.text()).toBe('notes.userProvided')
        // La frase lunga che lo spiega resta raggiungibile, non buttata.
        expect(foot.attributes('title')).toBe('notes.intro')
    })
})

describe('U-10 the pin on the open note', () => {
    it('sends only `pinned`, and keeps the row the store gives back', async () => {
        const wrapper = await detail()

        await wrapper.get('[data-testid="talos-note-item-pin"]').trigger('click')
        await flushPromises()

        expect(update).toHaveBeenCalledWith({ id: 'n1', pinned: true })
    })
})

describe('U-11 edit and export from the open note', () => {
    it('opens the same form the creation uses, on this note', async () => {
        const wrapper = await detail()

        await wrapper.get('[data-testid="talos-note-item-edit"]').trigger('click')

        expect(push).toHaveBeenCalledWith({ name: 'note-edit', params: { id: 'n1' } })
    })

    it('hands the note to the export, title and body together', async () => {
        const wrapper = await detail()

        await wrapper.get('[data-testid="talos-note-item-export"]').trigger('click')
        await flushPromises()

        expect(exportTalosNoteText).toHaveBeenCalled()
        expect((exportTalosNoteText.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 'n1' })
    })

    /**
     * ⛔ La conferma sta qui accanto, non in una finestra sopra: la nota resta
     * visibile mentre si decide di cancellarla. E mentre si decide, la riga
     * dice UNA cosa sola — «Esporta» sparisce, o sarebbero tre bottoni per una
     * domanda che ne ammette due.
     */
    it('confirms in place before deleting, and hides the export while it asks', async () => {
        const wrapper = await detail()

        await wrapper.get('[data-testid="talos-note-item-delete"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-note-item-export"]').exists()).toBe(false)
        expect(remove).not.toHaveBeenCalled()

        await wrapper.get('[data-testid="talos-note-item-delete-confirm"]').trigger('click')
        await flushPromises()

        expect(remove).toHaveBeenCalledWith('n1')
        expect(replace).toHaveBeenCalledWith({ name: 'notes' })
    })

    it('says the note is gone instead of showing an empty page', async () => {
        notes = []
        const wrapper = await detail()

        expect(wrapper.find('[data-testid="talos-note-item-missing"]').exists()).toBe(true)
    })
})

/**
 * U-11 — lo STESSO modulo, precompilato. Le prove guardano le tre sole cose
 * che cambiano fra i due modi: cosa c'è nei campi, quale metodo del deposito
 * viene chiamato, e dove si torna dopo.
 */
describe('U-11 the form in edit mode', () => {
    async function editor() {
        route = { name: 'note-edit', params: { id: 'n1' } }
        const wrapper = mount(NoteNewScreen)
        await flushPromises()
        return wrapper
    }

    it('arrives already filled with the note it is correcting', async () => {
        const wrapper = await editor()

        expect((wrapper.get('[data-testid="talos-note-title"]').element as HTMLInputElement).value)
            .toBe('Meno, ma meglio')
        expect((wrapper.get('[data-testid="talos-note-content"]').element as HTMLTextAreaElement).value)
            .toContain('Togliere un passaggio')
    })

    it('updates instead of creating, and returns to the note being read', async () => {
        const wrapper = await editor()

        await wrapper.get('[data-testid="talos-note-title"]').setValue('Meno, ma molto meglio')
        await wrapper.get('form').trigger('submit')
        await flushPromises()

        expect(create).not.toHaveBeenCalled()
        expect(update).toHaveBeenCalledWith({
            id: 'n1',
            title: 'Meno, ma molto meglio',
            content: nota.content,
        })
        // Alla NOTA, non all'elenco: è quella che si stava leggendo, ed è lì
        // che si verifica di aver corretto la cosa giusta.
        expect(replace).toHaveBeenCalledWith({ name: 'note-item', params: { id: 'n1' } })
    })

    /** Il verso contrario: la nota non c'è più, e non si apre un modulo vuoto. */
    it('goes back to the listing when the note it should correct is gone', async () => {
        notes = []
        await editor()

        expect(replace).toHaveBeenCalledWith({ name: 'notes' })
    })

    /** E in modo «nuova nota» resta esattamente quello che era: una creazione. */
    it('still creates when the route is the new-note one', async () => {
        route = { name: 'note-new', params: {} }
        const wrapper = mount(NoteNewScreen)
        await flushPromises()

        await wrapper.get('[data-testid="talos-note-title"]').setValue('Una cosa nuova')
        await wrapper.get('[data-testid="talos-note-content"]').setValue('Il corpo.')
        await wrapper.get('form').trigger('submit')
        await flushPromises()

        expect(create).toHaveBeenCalledWith({ title: 'Una cosa nuova', content: 'Il corpo.' })
        expect(update).not.toHaveBeenCalled()
        expect(replace).toHaveBeenCalledWith({ name: 'notes' })
    })
})
