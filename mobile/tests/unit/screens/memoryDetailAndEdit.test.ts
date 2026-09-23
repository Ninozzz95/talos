// @vitest-environment jsdom

/**
 * La memoria APERTA, e il modulo che la corregge (sezione 4, U-13 e U-19).
 *
 * Le due schermate stanno nello stesso file perché sono una catena: si apre, si
 * tocca «Modifica», si salva, si torna. Provarle separate lascerebbe fuori
 * l'unica cosa che può rompersi in mezzo — dove si torna dopo aver salvato.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MemoryItemScreen from '@/screens/MemoryItemScreen.vue'
import MemoryNewScreen from '@/screens/MemoryNewScreen.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import type { TalosLocalMemory } from '@/repositories/chatRepository'

const base: TalosLocalMemory = {
    id: 'm1',
    scope_type: 'global',
    scope_id: null,
    kind: 'preference',
    status: 'active',
    title: 'Prima il punto essenziale',
    content: 'Preferisco una risposta diretta, seguita dai dettagli quando servono.',
    source: 'talos_mobile_station',
    metadata: {},
    trust_level: 'untrusted',
    content_origin: 'user-direct',
    last_used_at: null,
    created_at: '2026-09-10T08:00:00.000Z',
    updated_at: '2026-09-10T08:00:00.000Z',
}

let memories: TalosLocalMemory[] = []
let route: { name: string; params: Record<string, string> } = { name: 'memory-item', params: { id: 'm1' } }

const list = vi.fn(async () => memories)
const setStatus = vi.fn(async (id: string, status: string) => ({ ...base, id, status: status as never }))
const update = vi.fn(async (input: { id: string }) => ({ ...base, ...input }))
const create = vi.fn(async () => base)
const remove = vi.fn(async () => undefined)
const push = vi.fn()
const replace = vi.fn()
const back = vi.fn()

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ memories: { list, setStatus, update, create, remove } }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push, replace, back }),
    useRoute: () => route,
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
    memories = [{ ...base }]
    route = { name: 'memory-item', params: { id: 'm1' } }
})

async function detail() {
    const wrapper = mount(MemoryItemScreen)
    await flushPromises()
    return wrapper
}

async function editor() {
    const wrapper = mount(MemoryNewScreen)
    await flushPromises()
    return wrapper
}

describe('la pagina della memoria dice i tre fatti che non si leggono', () => {
    it('mostra tipo, testo intero, ambito e stato', async () => {
        const wrapper = await detail()

        expect(wrapper.get('[data-testid="talos-memory-item-quote"]').text()).toBe(base.content)
        expect(wrapper.get('[data-testid="talos-memory-item-state"]').attributes('data-memory-state')).toBe('active')
        expect(wrapper.text()).toContain('memory.preference')
        expect(wrapper.text()).toContain('memory.global')
        // Il piede dice a cosa serve QUESTO tipo di memoria.
        expect(wrapper.text()).toContain('memory.hintPreference')
    })

    /**
     * U-12 — l'unico posto dell'app in cui si dice da dove viene il testo. E lo
     * dice leggendo `content_origin`, non recitando una formula.
     */
    it('dichiara la provenienza, e cambia frase quando il testo NON viene dall’utente', async () => {
        const wrapper = await detail()
        const riga = wrapper.get('[data-testid="talos-memory-item-origin"]')
        expect(riga.text()).toBe('memory.originUser')
        // La frase lunga che lo spiega resta raggiungibile, non buttata.
        expect(riga.attributes('title')).toBe('memory.explanation')

        memories = [{ ...base, content_origin: 'external' }]
        const esterna = await detail()
        expect(esterna.get('[data-testid="talos-memory-item-origin"]').text()).toBe('memory.originExternal')
    })

    it('se la memoria non c’è più lo dice, invece di mostrare una pagina vuota', async () => {
        memories = []
        const wrapper = await detail()

        expect(wrapper.find('[data-testid="talos-memory-item-missing"]').exists()).toBe(true)
    })
})

/**
 * ⛔ WAI-ARIA APG, «Switch Pattern» (12/09/2026): l'etichetta di un
 * interruttore NON cambia con lo stato — lo stato lo porta `aria-checked`.
 */
describe('U-13 l’interruttore della memoria aperta', () => {
    it('tiene lo stesso nome acceso e spento, e lo stato lo porta il controllo', async () => {
        const acceso = await detail()
        const nome = acceso.findComponent(TalosThemedSwitch).props('ariaLabel')
        expect(acceso.findComponent(TalosThemedSwitch).props('modelValue')).toBe(true)

        memories = [{ ...base, status: 'disabled' }]
        const spento = await detail()
        expect(spento.findComponent(TalosThemedSwitch).props('modelValue')).toBe(false)
        expect(spento.findComponent(TalosThemedSwitch).props('ariaLabel')).toBe(nome)
    })

    it('spegne una memoria attiva, e riscrive la riga con quella TORNATA dal deposito', async () => {
        const wrapper = await detail()

        wrapper.findComponent(TalosThemedSwitch).vm.$emit('update:modelValue', false)
        await flushPromises()

        expect(setStatus).toHaveBeenCalledWith('m1', 'disabled')
        expect(wrapper.findComponent(TalosThemedSwitch).props('modelValue')).toBe(false)
        expect(wrapper.get('[data-testid="talos-memory-item-state"]').attributes('data-memory-state')).toBe('paused')
    })

    /**
     * Il verso contrario, ed è quello che conta: se la scrittura FALLISCE
     * l'interruttore deve restare dov'era. Un controllo che si capovolge
     * comunque avrebbe dichiarato una cosa che non è avvenuta.
     */
    it('se il deposito rifiuta, l’interruttore non si muove e l’errore lo dice', async () => {
        setStatus.mockRejectedValueOnce(new Error('deposito chiuso'))
        const wrapper = await detail()

        wrapper.findComponent(TalosThemedSwitch).vm.$emit('update:modelValue', false)
        await flushPromises()

        expect(wrapper.findComponent(TalosThemedSwitch).props('modelValue')).toBe(true)
        expect(wrapper.get('[data-testid="talos-memory-item-error"]').text()).toBe('deposito chiuso')
    })

    /** Accendere una proposta del modello vuol dire APPROVARLA. */
    it('accendere una riga da rivedere la porta ad «attiva»', async () => {
        memories = [{ ...base, status: 'quarantined' }]
        const wrapper = await detail()

        expect(wrapper.get('[data-testid="talos-memory-item-state"]').attributes('data-memory-state')).toBe('review')
        wrapper.findComponent(TalosThemedSwitch).vm.$emit('update:modelValue', true)
        await flushPromises()

        expect(setStatus).toHaveBeenCalledWith('m1', 'active')
    })
})

describe('U-13 esportare ed eliminare dalla memoria aperta', () => {
    it('manda fuori QUESTA memoria', async () => {
        const wrapper = await detail()

        await wrapper.get('[data-testid="talos-memory-item-export"]').trigger('click')
        await flushPromises()

        expect(exportTalosMemoryText).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm1' }),
            'memory.exportText',
        )
    })

    /**
     * Qui la conferma è IN LINEA e non una finestra: la memoria resta visibile
     * mentre si decide di cancellarla, perché qui c'è tutta.
     */
    it('chiede conferma accanto al testo, e solo il sì cancella', async () => {
        const wrapper = await detail()

        await wrapper.get('[data-testid="talos-memory-item-delete"]').trigger('click')
        expect(remove).not.toHaveBeenCalled()

        await wrapper.get('[data-testid="talos-memory-item-delete-confirm"]').trigger('click')
        await flushPromises()

        expect(remove).toHaveBeenCalledWith('m1')
        // `replace` e non `push`: la memoria non c'è più, e lasciarla nella
        // cronologia vuol dire che Indietro riporta a una pagina impossibile.
        expect(replace).toHaveBeenCalledWith({ name: 'memory' })
    })

    it('«Modifica» apre lo stesso modulo della creazione, su questa memoria', async () => {
        const wrapper = await detail()

        await wrapper.get('[data-testid="talos-memory-item-edit"]').trigger('click')

        expect(push).toHaveBeenCalledWith({ name: 'memory-edit', params: { id: 'm1' } })
    })
})

/** U-19 — lo stesso modulo, due modi, e il modo lo decide la ROTTA. */
describe('U-19 il modulo in modalità modifica', () => {
    beforeEach(() => {
        route = { name: 'memory-edit', params: { id: 'm1' } }
    })

    it('arriva precompilato con titolo, contenuto e tipo di quella memoria', async () => {
        memories = [{ ...base, kind: 'procedure' }]
        const wrapper = await editor()

        expect(wrapper.get('form').attributes('data-editing')).toBe('true')
        expect((wrapper.get('[data-testid="talos-memory-title"]').element as HTMLInputElement).value)
            .toBe(base.title)
        expect((wrapper.get('[data-testid="talos-memory-content"]').element as HTMLTextAreaElement).value)
            .toBe(base.content)
        expect(wrapper.getComponent<typeof TalosThemedSelect>('[data-testid="talos-memory-kind"]').props('modelValue'))
            .toBe('procedure')
    })

    it('salva con `update` e torna alla MEMORIA, senza creare una seconda riga', async () => {
        const wrapper = await editor()

        await wrapper.get('[data-testid="talos-memory-title"]').setValue('Prima il punto')
        await wrapper.get('form').trigger('submit')
        await flushPromises()

        expect(create).not.toHaveBeenCalled()
        expect(update).toHaveBeenCalledWith({
            id: 'm1',
            title: 'Prima il punto',
            content: base.content,
            kind: 'preference',
        })
        expect(replace).toHaveBeenCalledWith({ name: 'memory-item', params: { id: 'm1' } })
    })

    /**
     * Il verso contrario: la stessa schermata, senza la rotta di modifica, deve
     * CREARE — e non deve chiamare `update` con un id vuoto.
     */
    it('sulla rotta di creazione crea, e non corregge niente', async () => {
        route = { name: 'memory-new', params: {} }
        const wrapper = await editor()

        await wrapper.get('[data-testid="talos-memory-title"]').setValue('Una cosa nuova')
        await wrapper.get('[data-testid="talos-memory-content"]').setValue('Il corpo della cosa.')
        await wrapper.get('form').trigger('submit')
        await flushPromises()

        expect(update).not.toHaveBeenCalled()
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Una cosa nuova',
            scope_type: 'global',
        }))
        expect(replace).toHaveBeenCalledWith({ name: 'memory' })
    })

    it('se la memoria non esiste torna all’elenco invece di aprire un modulo vuoto', async () => {
        memories = []
        await editor()

        expect(replace).toHaveBeenCalledWith({ name: 'memory' })
    })

    /**
     * ⛔ Una riga proposta dal modello non ha uno dei quattro tipi: il selettore
     * deve cadere su qualcosa, e deve DIRLO. Salvare in silenzio cambierebbe la
     * natura della riga a chi era entrato per correggere una parola.
     */
    it('avvisa quando il tipo non c’era, invece di sceglierne uno di nascosto', async () => {
        memories = [{ ...base, kind: 'rejected' as never }]
        const wrapper = await editor()

        expect(wrapper.find('[data-testid="talos-memory-kind-missing"]').exists()).toBe(true)

        // E l'avviso sparisce appena si sceglie davvero.
        wrapper.getComponent<typeof TalosThemedSelect>('[data-testid="talos-memory-kind"]')
            .vm.$emit('update:modelValue', 'policy_note')
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-memory-kind-missing"]').exists()).toBe(false)
    })
})
