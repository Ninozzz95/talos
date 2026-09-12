// @vitest-environment jsdom

/**
 * Sezione 4 del refactor «Talos Calm» — la stazione Memoria come il mockup.
 *
 * Quello che questo file prova non è l'aspetto: è che ogni controllo della
 * pagina cambi davvero l'INSIEME mostrato, e che ogni filtro sia provato anche
 * AL VERSO CONTRARIO — una riga che deve comparire, e una che non deve. Un
 * filtro che non toglie mai niente supera un test che guarda solo chi resta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MemoryScreen from '@/screens/MemoryScreen.vue'
import TalosMobileMemoryRow from '@/components/talos/memory/TalosMobileMemoryRow.vue'
import type { TalosLocalMemory } from '@/repositories/chatRepository'

function memoria(patch: Partial<TalosLocalMemory> & { id: string; title: string }): TalosLocalMemory {
    return {
        scope_type: 'global',
        scope_id: null,
        kind: 'preference',
        status: 'active',
        content: '',
        source: null,
        metadata: {},
        trust_level: 'untrusted',
        content_origin: 'user-direct',
        last_used_at: null,
        created_at: '2026-09-01T10:00:00.000Z',
        updated_at: '2026-09-01T10:00:00.000Z',
        ...patch,
    }
}

/**
 * L'elenco arriva già ordinato dal deposito (`ORDER BY updated_at DESC`), e la
 * fixture rispetta quell'ordine: «Più recenti» non riordina niente, si fida —
 * e un test che gli desse righe in ordine sparso lo proverebbe su una realtà
 * che non esiste.
 */
let memories: TalosLocalMemory[] = []

const list = vi.fn(async () => memories)
const setStatus = vi.fn(async (id: string, status: string) => memoria({ id, title: 'x', status: status as never }))
const remove = vi.fn(async () => undefined)
const push = vi.fn()

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ memories: { list, setStatus, remove, create: vi.fn(), update: vi.fn() } }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
    useRoute: () => ({ name: 'memory', params: {} }),
}))

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key, locale: { value: 'it' } }),
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))

const exportTalosMemoryText = vi.fn(async () => 'shared' as const)
vi.mock('@/components/talos/memory/memoryExport', () => ({
    exportTalosMemoryText: (...args: unknown[]) => exportTalosMemoryText(...args as []),
}))

beforeEach(() => {
    vi.clearAllMocks()
    memories = [
        memoria({ id: 'm1', title: 'Risposte dirette', kind: 'preference', content: 'Prima il punto.' }),
        memoria({ id: 'm2', title: 'Un tema solo', kind: 'project_fact', status: 'disabled', content: 'Il progetto usa Calm.' }),
        memoria({ id: 'm3', title: 'Il giro di revisione', kind: 'procedure', content: '1. Prova il percorso.' }),
        // Una PREFERENZA che è anche da rivedere: i due assi si incrociano, ed
        // è il caso che un filtro scritto male perde.
        memoria({ id: 'm4', title: 'Chiamami per nome', kind: 'preference', status: 'quarantined' }),
        // Una proposta del modello a cui nessuno ha dato un tipo: `kind` fuori
        // dai quattro, ma `status` perfettamente normale.
        memoria({ id: 'm5', title: 'Proposta del modello', kind: 'rejected' as never }),
    ]
})

async function screen() {
    const wrapper = mount(MemoryScreen)
    await flushPromises()
    return wrapper
}

function righe(wrapper: ReturnType<typeof mount>): string[] {
    return wrapper.findAllComponents(TalosMobileMemoryRow)
        .map((row) => (row.props('memory') as TalosLocalMemory).id)
}

/**
 * ⛔ TRE STATI, NON DUE.
 *
 * Prima che il deposito abbia risposto la verità è «non lo so ancora»: una
 * pagina che afferma «non ce n'è nessuna» mentre ce ne sono cinque non è un
 * difetto estetico, è una risposta sbagliata a una domanda appena fatta.
 */
describe('lo stato in caricamento non è lo stato vuoto', () => {
    it('non dice né quante sono né che non ce ne sono, finché non lo sa', () => {
        const wrapper = mount(MemoryScreen)

        expect(wrapper.find('[data-testid="talos-memory-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-memory-no-matches"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-memory-count"]').text()).toBe('')
    })

    it('e appena lo sa, lo dice', async () => {
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-memory-count"]').text()).toBe('memory.count')
        expect(righe(wrapper)).toHaveLength(5)
    })

    /** Anche una lista che FALLISCE è una risposta: la pagina non resta muta. */
    it('dopo un errore mostra l’errore E lo stato vuoto, non una pagina bianca', async () => {
        list.mockRejectedValueOnce(new Error('deposito chiuso'))
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-memory-error"]').text()).toBe('deposito chiuso')
        expect(wrapper.find('[data-testid="talos-memory-empty"]').exists()).toBe(true)
    })
})

/** U-18 — i filtri per TIPO, e quello che non è un tipo. */
describe('U-18 la striscia dei filtri', () => {
    it('offre «Tutte», i quattro tipi e «Da rivedere», ognuno col suo conteggio', async () => {
        const wrapper = await screen()
        const conti = Object.fromEntries(
            ['all', 'preference', 'project_fact', 'procedure', 'policy_note', 'review'].map((id) => [
                id,
                wrapper.get(`[data-testid="talos-memory-filter-${id}"]`).find('small').text(),
            ]),
        )

        // I conteggi guardano TUTTE le righe, non quelle già ristrette: servono
        // a decidere se vale la pena cambiare filtro.
        expect(conti).toEqual({
            all: '5',
            preference: '2',
            project_fact: '1',
            procedure: '1',
            policy_note: '0',
            review: '2',
        })
    })

    it('tenendo solo un tipo, tiene QUELLO — e lascia fuori gli altri', async () => {
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-memory-filter-procedure"]').trigger('click')

        expect(righe(wrapper)).toEqual(['m3'])
    })

    /**
     * Il verso contrario: un tipo che non ha righe non deve mostrare la lista
     * intera, e non deve nemmeno mostrare lo stato vuoto «non ce n'è
     * nessuna» — sono due frasi diverse perché sono due situazioni diverse, e
     * solo una delle due si annulla togliendo il filtro.
     */
    it('un tipo senza righe dice che è IL FILTRO a nasconderle, e offre di toglierlo', async () => {
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-memory-filter-policy_note"]').trigger('click')

        expect(righe(wrapper)).toEqual([])
        expect(wrapper.find('[data-testid="talos-memory-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-memory-no-matches"]').exists()).toBe(true)

        await wrapper.get('[data-testid="talos-memory-clear-filters"]').trigger('click')
        expect(righe(wrapper)).toHaveLength(5)
    })

    /**
     * «Da rivedere» guarda lo STATO, e lo guarda da due parti: lo `status`
     * (`quarantined`/`rejected`) e il `kind` `rejected`. Chi ne leggesse una
     * sola perderebbe metà delle righe — e le perderebbe in silenzio.
     */
    it('«Da rivedere» prende sia lo stato sia il tipo, e solo quelli', async () => {
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-memory-filter-review"]').trigger('click')

        expect(righe(wrapper)).toEqual(['m4', 'm5'])
        // Il verso contrario: una riga attiva e una in pausa NON sono da
        // rivedere, e qui non ci devono essere.
        expect(righe(wrapper)).not.toContain('m1')
        expect(righe(wrapper)).not.toContain('m2')
    })

    /** I due assi si incrociano: una preferenza in quarantena è entrambe le cose. */
    it('una riga può stare sotto il suo tipo E sotto «Da rivedere»', async () => {
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-memory-filter-preference"]').trigger('click')
        expect(righe(wrapper)).toEqual(['m1', 'm4'])

        await wrapper.get('[data-testid="talos-memory-filter-review"]').trigger('click')
        expect(righe(wrapper)).toContain('m4')
    })

    it('la ricerca si somma al filtro invece di sostituirlo', async () => {
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-memory-filter-preference"]').trigger('click')
        await wrapper.get('[data-testid="talos-memory-search"]').setValue('Chiamami')

        expect(righe(wrapper)).toEqual(['m4'])
    })
})

/** Il badge dice in che stato è una riga, e sono tre stati. */
describe('il badge di stato', () => {
    it('distingue attiva, in pausa e da rivedere su righe diverse', async () => {
        const wrapper = await screen()

        expect(wrapper.get('[data-testid="talos-memory-state-m1"]').attributes('data-memory-state')).toBe('active')
        expect(wrapper.get('[data-testid="talos-memory-state-m2"]').attributes('data-memory-state')).toBe('paused')
        expect(wrapper.get('[data-testid="talos-memory-state-m4"]').attributes('data-memory-state')).toBe('review')
        // Il tipo `rejected` conta quanto lo stato: guardarne uno solo lascerebbe
        // questa riga travestita da attiva.
        expect(wrapper.get('[data-testid="talos-memory-state-m5"]').attributes('data-memory-state')).toBe('review')
    })
})

describe('ordinamento e densità', () => {
    it('per titolo riordina davvero, e «Più recenti» lascia l’ordine del deposito', async () => {
        const wrapper = await screen()

        expect(righe(wrapper)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])

        await wrapper.get('[data-testid="talos-memory-sort"]').setValue('title')
        expect(righe(wrapper)).toEqual(['m4', 'm3', 'm5', 'm1', 'm2'])

        await wrapper.get('[data-testid="talos-memory-sort"]').setValue('recent')
        expect(righe(wrapper)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    })

    it('per tipo raggruppa, e dentro il gruppo decide il titolo', async () => {
        const wrapper = await screen()

        await wrapper.get('[data-testid="talos-memory-sort"]').setValue('kind')

        // policy_note non c'è; l'ordine alfabetico dei tipi è
        // preference > procedure > project_fact > rejected.
        expect(righe(wrapper)).toEqual(['m4', 'm1', 'm3', 'm2', 'm5'])
    })

    it('passa da lista a schede, e le schede sono le stesse righe', async () => {
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-memory-list"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-memory-grid"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-memory-view-grid"]').trigger('click')

        expect(wrapper.find('[data-testid="talos-memory-grid"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-talos-memory-tile]')).toHaveLength(5)
        expect(wrapper.find('[data-testid="talos-memory-row"]').exists()).toBe(false)
    })
})

/**
 * U-13 — i verbi, dalla porta unica delle azioni.
 *
 * Scheda e riga emettono lo stesso identificativo: se ognuna sapesse cosa fare
 * da sé, prima o poi «Elimina» chiederebbe conferma da una parte e non
 * dall'altra.
 */
describe('U-13 le azioni di una riga', () => {
    function azione(wrapper: ReturnType<typeof mount>, id: string, azione: string) {
        const row = wrapper.findAllComponents(TalosMobileMemoryRow)
            .find((candidate) => (candidate.props('memory') as TalosLocalMemory).id === id)
        row?.vm.$emit('action', azione)
    }

    it('«Modifica» apre lo stesso modulo della creazione, su questa memoria', async () => {
        const wrapper = await screen()

        azione(wrapper, 'm1', 'edit')

        expect(push).toHaveBeenCalledWith({ name: 'memory-edit', params: { id: 'm1' } })
    })

    it('spegne una memoria attiva e riaccende una in pausa', async () => {
        const wrapper = await screen()

        azione(wrapper, 'm1', 'toggle')
        await flushPromises()
        expect(setStatus).toHaveBeenLastCalledWith('m1', 'disabled')

        azione(wrapper, 'm2', 'toggle')
        await flushPromises()
        expect(setStatus).toHaveBeenLastCalledWith('m2', 'active')
    })

    /** Accendere una proposta vuol dire APPROVARLA: è la stessa transizione. */
    it('accendere una riga da rivedere la porta ad «attiva»', async () => {
        const wrapper = await screen()

        azione(wrapper, 'm4', 'toggle')
        await flushPromises()

        expect(setStatus).toHaveBeenLastCalledWith('m4', 'active')
    })

    it('«Esporta testo» manda fuori QUESTA memoria', async () => {
        const wrapper = await screen()

        azione(wrapper, 'm3', 'export')
        await flushPromises()

        expect(exportTalosMemoryText).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm3' }),
            'memory.exportText',
        )
    })

    /**
     * ⛔ Mai senza conferma da un ELENCO: qui la memoria è un titolo e due
     * righe, e decidere di cancellarla è decidere su un testo che non si è
     * riletto.
     */
    it('«Elimina» chiede conferma, e solo il sì cancella', async () => {
        const wrapper = await screen()

        azione(wrapper, 'm3', 'delete')
        await flushPromises()
        expect(remove).not.toHaveBeenCalled()

        // La finestra è TELEPORTATA nel `body` (R1-1: dentro il sottoalbero
        // della schermata non si disegnava sulla WebView dell'owner), quindi si
        // cerca da lì e non dentro il wrapper.
        const conferma = document.querySelector('[data-testid="talos-memory-delete-confirm"]')
        expect(conferma).not.toBeNull()
        ;(conferma as HTMLButtonElement).click()
        await flushPromises()
        expect(remove).toHaveBeenCalledWith('m3')
    })
})

describe('lo stato vuoto vero', () => {
    it('quando non ce n’è nessuna invita a scriverne una, e non parla di filtri', async () => {
        memories = []
        const wrapper = await screen()

        expect(wrapper.find('[data-testid="talos-memory-empty"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-memory-no-matches"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-memory-empty-new"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'memory-new' })
    })
})
