// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import NotesScreen from '@/screens/NotesScreen.vue'

const shell = { notes_view: 'list' as 'grid' | 'list' }
const setShell = vi.fn(async (patch: Partial<typeof shell>) => { Object.assign(shell, patch) })

vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell }, setShell }),
}))

const notes = [
    {
        id: 'n1', title: 'Codice cancello', content: '4471',
        trust_level: 'untrusted' as const,
        created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
    },
    {
        id: 'n2', title: 'Lista spesa', content: 'pane, latte',
        trust_level: 'untrusted' as const,
        created_at: '2026-08-02T10:00:00.000Z', updated_at: '2026-08-02T10:00:00.000Z',
    },
]

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        notes: { list: vi.fn(async () => notes), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    }),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key }),
}))

async function screen() {
    const wrapper = mount(NotesScreen)
    await flushPromises()
    return wrapper
}

/**
 * C45-RED-19H — le note nella grammatica visiva della Libreria.
 *
 * Owner 2026-08-05: «le note sia in lista che in card, delle card come se
 * fossero dei post, quindi col titolo sopra e la descrizione sotto».
 */
describe('C45-RED-19H notes list and card views', () => {
    it('opens in list and switches to cards, remembering the choice', async () => {
        shell.notes_view = 'list'
        const wrapper = await screen()

        expect(wrapper.findAll('[data-testid="talos-note-row"]')).toHaveLength(2)
        expect(wrapper.find('[data-testid="talos-notes-grid"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-notes-view-grid"]').trigger('click')

        // Ricordata, non tenuta in un `ref`: e' il difetto documentato della
        // Libreria, che «non sopravviveva a una riapertura».
        expect(setShell).toHaveBeenCalledWith({ notes_view: 'grid' })
    })

    it('renders one card per note, title above and body below', async () => {
        shell.notes_view = 'grid'
        const wrapper = await screen()

        const grid = wrapper.get('[data-testid="talos-notes-grid"]')
        expect(grid.findAll('[data-talos-note-tile]')).toHaveLength(2)
        const first = wrapper.get('[data-testid="talos-note-tile-n1"]')
        // L'ordine conta: è letteralmente ciò che è stato chiesto.
        expect(first.text().indexOf('Codice cancello'))
            .toBeLessThan(first.text().indexOf('4471'))
    })

    /**
     * Le due assenze sono cose diverse e vanno dette diversamente.
     *
     * Prima lo stato vuoto guardava l'elenco NON filtrato: filtrando via tutto
     * si otteneva una schermata vuota senza una parola, e non si poteva sapere
     * se le note fossero finite o se fosse il filtro a nasconderle.
     */
    it('says that the filter hides everything, instead of showing nothing at all', async () => {
        shell.notes_view = 'list'
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-notes-search"]').setValue('qualcosa che non esiste')

        expect(wrapper.find('[data-testid="talos-notes-no-matches"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-notes-empty"]').exists()).toBe(false)
        expect(wrapper.findAll('[data-testid="talos-note-row"]')).toHaveLength(0)
    })
})
