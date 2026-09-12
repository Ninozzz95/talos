// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import NotesScreen from '@/screens/NotesScreen.vue'
import TalosMobileNoteRow from '@/components/talos/notes/TalosMobileNoteRow.vue'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const shell = { notes_view: 'list' as 'grid' | 'list' }
const setShell = vi.fn(async (patch: Partial<typeof shell>) => { Object.assign(shell, patch) })

vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell }, setShell }),
}))

function nota(patch: Partial<TalosLocalNote> & { id: string; title: string }): TalosLocalNote {
    return {
        content: '',
        trust_level: 'untrusted',
        content_origin: 'user-direct',
        pinned: false,
        created_at: '2026-08-01T10:00:00.000Z',
        updated_at: '2026-08-01T10:00:00.000Z',
        ...patch,
    }
}

/**
 * L'elenco arriva già ordinato dal deposito — in evidenza prima, poi per data —
 * perché è lì che l'ordinamento vive (`ORDER BY pinned DESC, updated_at DESC`).
 * La fixture rispetta quell'ordine, o la schermata verrebbe provata su una
 * realtà che non esiste.
 */
let notes: TalosLocalNote[] = []

const update = vi.fn(async () => notes[0]!)
const remove = vi.fn(async () => undefined)
const push = vi.fn()

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        notes: { list: vi.fn(async () => notes), create: vi.fn(), update, remove },
    }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
    useRoute: () => ({ name: 'notes', params: {} }),
}))

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key, locale: { value: 'it' } }),
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))

async function screen() {
    const wrapper = mount(NotesScreen)
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    vi.clearAllMocks()
    shell.notes_view = 'list'
    notes = [
        nota({ id: 'n1', title: 'Codice cancello', content: '4471' }),
        nota({
            id: 'n2',
            title: 'Lista spesa',
            content: 'pane, latte',
            updated_at: '2026-08-02T10:00:00.000Z',
        }),
    ]
})

/**
 * C45-RED-19H — le note nella grammatica visiva della Libreria.
 *
 * Owner 2026-08-05: «le note sia in lista che in card, delle card come se
 * fossero dei post, quindi col titolo sopra e la descrizione sotto».
 */
describe('C45-RED-19H notes list and card views', () => {
    it('opens in list and switches to cards, remembering the choice', async () => {
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
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-notes-search"]').setValue('qualcosa che non esiste')

        expect(wrapper.find('[data-testid="talos-notes-no-matches"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-notes-empty"]').exists()).toBe(false)
        expect(wrapper.findAll('[data-testid="talos-note-row"]')).toHaveLength(0)
        // L'assenza che si può annullare porta la sua via d'uscita.
        expect(wrapper.find('[data-testid="talos-notes-clear-filters"]').exists()).toBe(true)
    })

    /** Il verso contrario: nessuna nota affatto è l'ALTRA assenza. */
    it('says that there are no notes at all when there are none', async () => {
        notes = []
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-notes-empty"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-notes-no-matches"]').exists()).toBe(false)
        // Qui non c'è niente da azzerare: l'invito è a scrivere la prima.
        expect(wrapper.find('[data-testid="talos-notes-clear-filters"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-notes-empty-new"]').exists()).toBe(true)
    })
})

/**
 * U-12 (owner 11/09/2026) — l'etichetta «non attendibile» sparisce dall'elenco.
 *
 * Non è un dettaglio grafico: era scritta su OGNI riga e su OGNI scheda. Resta
 * una volta sola, nella nota aperta, come «Contenuto fornito dall'utente».
 * ⛔ La disciplina del dato non cambia — `trust_level` resta `untrusted`.
 */
describe('U-12 the untrusted label leaves the listing', () => {
    it('never writes the untrusted label on a row or a card', async () => {
        const wrapper = await screen()
        // La PAROLA, non una chiave: la guardia deve reggere anche se domani
        // qualcuno reintroduce l'etichetta con un altro nome.
        expect(wrapper.text().toLowerCase()).not.toContain('untrusted')

        shell.notes_view = 'grid'
        const cards = await screen()
        expect(cards.text().toLowerCase()).not.toContain('untrusted')
    })

    it('keeps the note untrusted in the data even so', async () => {
        const wrapper = await screen()
        const row = wrapper.findComponent(TalosMobileNoteRow)
        expect(row.props('note').trust_level).toBe('untrusted')
    })
})

/**
 * U-10 (owner 11/09/2026) — «In evidenza»: il pin, il filtro, il conteggio.
 */
describe('U-10 pinning a note', () => {
    it('turns the pin on through the facade, without touching title or body', async () => {
        shell.notes_view = 'grid'
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-note-pin-n1"]').trigger('click')
        await flushPromises()

        // Solo `pinned`: mandare anche titolo e corpo vorrebbe dire che una
        // puntina riscrive la nota, e il deposito sposterebbe `updated_at`.
        expect(update).toHaveBeenCalledWith({ id: 'n1', pinned: true })
    })

    it('turns it off again from a note that already carries it', async () => {
        notes = [nota({ id: 'n1', title: 'In cima', pinned: true })]
        shell.notes_view = 'grid'
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-note-pin-n1"]').trigger('click')
        await flushPromises()

        expect(update).toHaveBeenCalledWith({ id: 'n1', pinned: false })
    })

    it('shows only the highlighted ones, and counts them over every note', async () => {
        notes = [
            nota({ id: 'n1', title: 'In cima', pinned: true }),
            nota({ id: 'n2', title: 'Normale' }),
        ]
        const wrapper = await screen()

        // Il conteggio guarda TUTTE le note, non quelle già ristrette: un
        // «In evidenza 0» calcolato dentro una ricerca direbbe il falso.
        expect(wrapper.get('[data-testid="talos-notes-filter-pinned"]').text()).toContain('1')

        await wrapper.get('[data-testid="talos-notes-filter-pinned"]').trigger('click')

        const rows = wrapper.findAll('[data-testid="talos-note-row"]')
        expect(rows).toHaveLength(1)
        expect(rows[0]!.text()).toContain('In cima')
    })

    /** Il verso contrario: il filtro senza nemmeno un pin non mente. */
    it('says nothing matches when no note is highlighted at all', async () => {
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-notes-filter-pinned"]').text()).toContain('0')
        await wrapper.get('[data-testid="talos-notes-filter-pinned"]').trigger('click')

        expect(wrapper.find('[data-testid="talos-notes-no-matches"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-testid="talos-note-row"]')).toHaveLength(0)
    })
})

describe('the checklist filter and the sort', () => {
    it('keeps only the notes that carry ticks', async () => {
        notes = [
            nota({ id: 'n1', title: 'Prima di pubblicare', content: '- [x] Rileggere\n- [ ] Provare' }),
            nota({ id: 'n2', title: 'Un pensiero', content: '> Meno, ma meglio' }),
        ]
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-notes-filter-checklist"]').trigger('click')

        const rows = wrapper.findAll('[data-testid="talos-note-row"]')
        expect(rows).toHaveLength(1)
        expect(rows[0]!.text()).toContain('Prima di pubblicare')
    })

    it('sorts by title while leaving the highlighted ones on top', async () => {
        notes = [
            nota({ id: 'n0', title: 'Zeta in evidenza', pinned: true }),
            nota({ id: 'n1', title: 'Beta' }),
            nota({ id: 'n2', title: 'Alfa' }),
        ]
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-notes-sort"]').setValue('title')

        const titles = wrapper.findAll('[data-testid="talos-note-row"]').map((row) => row.text())
        // Il pin è una decisione, e un ordinamento non revoca una decisione.
        expect(titles[0]).toContain('Zeta in evidenza')
        expect(titles[1]).toContain('Alfa')
        expect(titles[2]).toContain('Beta')
    })
})

/**
 * U-11 — le azioni del menu arrivano tutte alla stessa porta della schermata,
 * qualunque densità le abbia emesse.
 */
describe('U-11 the row actions reach one dispatcher', () => {
    it('opens the editor on the note that asked for it', async () => {
        const wrapper = await screen()

        wrapper.findComponent(TalosMobileNoteRow).vm.$emit('action', 'edit')
        await flushPromises()

        expect(push).toHaveBeenCalledWith({ name: 'note-edit', params: { id: 'n1' } })
    })

    /**
     * ⛔ Dall'ELENCO non si elimina senza conferma: qui la nota è un titolo e
     * due righe, e decidere di cancellarla sarebbe decidere su un testo che
     * non si è riletto.
     */
    it('asks before deleting from the listing, and only deletes on the second yes', async () => {
        const wrapper = await screen()

        wrapper.findComponent(TalosMobileNoteRow).vm.$emit('action', 'delete')
        await flushPromises()
        expect(remove).not.toHaveBeenCalled()

        const confirm = document.querySelector('[data-testid="talos-notes-delete-confirm"]')
        expect(confirm).not.toBeNull()
        ;(confirm as HTMLButtonElement).click()
        await flushPromises()

        expect(remove).toHaveBeenCalledWith('n1')
    })
})
