// @vitest-environment jsdom

/**
 * COD-G1-STATO — i tre moduli «nuovo / modifica» quando la rotta cambia SOTTO
 * la stessa istanza.
 *
 * Visto sul Pad il 14/10/2026: `/notes/<id>/edit` e poi `/notes/new` — vue-router
 * riusa la stessa istanza di `NoteNewScreen` (il componente abbinato è lo
 * stesso), `onMounted` non riparte, e «Nuova nota» mostrava titolo e testo della
 * nota corretta un istante prima, col tasto «Salva nota» acceso: salvare avrebbe
 * creato un doppione. Lo stesso per memorie e attività.
 *
 * Qui il router è VERO (cronologia in memoria): l'istanza montata una volta
 * resta quella, e si cambia soltanto la rotta — esattamente come nell'app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'
import NoteNewScreen from '@/screens/NoteNewScreen.vue'
import MemoryNewScreen from '@/screens/MemoryNewScreen.vue'
import TaskNewScreen from '@/screens/TaskNewScreen.vue'

const note = [
    { id: 'n1', title: 'Nota uno', content: 'Corpo uno' },
    { id: 'n2', title: 'Nota due', content: 'Corpo due' },
]
const memorie = [
    { id: 'm1', title: 'Memoria uno', content: 'Contenuto uno', kind: 'rejected' },
    { id: 'm2', title: 'Memoria due', content: 'Contenuto due', kind: 'project_fact' },
]
const attivita = [
    {
        id: 't1',
        title: 'Attività uno',
        description: 'Descrizione uno',
        instruction: 'Istruzione uno',
        schedule_json: JSON.stringify({ kind: 'daily', at: '07:30' }),
    },
    { id: 't2', title: 'Attività due', description: 'Descrizione due', instruction: null, schedule_json: null },
]

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        notes: { list: async () => note, create: vi.fn(), update: vi.fn() },
        memories: { list: async () => memorie, create: vi.fn(), update: vi.fn() },
        tasks: { list: async () => attivita, create: vi.fn(), update: vi.fn() },
    }),
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))

let aperti: VueWrapper[] = []

afterEach(() => {
    for (const w of aperti) w.unmount()
    aperti = []
    document.body.innerHTML = ''
})

beforeEach(() => {
    aperti = []
})

function router(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: TALOS_MOBILE_ROUTES.map((r) => ({
            path: r.path, name: r.name, component: { template: '<div />' },
        })),
    })
}

/** Monta il modulo UNA volta, sulla rotta di partenza: poi cambia solo la rotta. */
async function monta(componente: unknown, partenza: string) {
    const r = router()
    await r.push(partenza)
    await r.isReady()
    const wrapper = mount(componente as never, { global: { plugins: [r] } })
    aperti.push(wrapper)
    await flushPromises()
    return { r, wrapper }
}

function valore(wrapper: VueWrapper, testid: string): string {
    return (wrapper.get(`[data-testid="${testid}"]`).element as HTMLInputElement).value
}

function salvaSpento(wrapper: VueWrapper, testid: string): boolean {
    return wrapper.get(`[data-testid="${testid}"]`).attributes('disabled') !== undefined
}

describe('COD-G1-STATO-01 il modulo della nota segue la rotta', () => {
    it('da «modifica» a «nuova»: modulo vuoto e salvataggio spento', async () => {
        const { r, wrapper } = await monta(NoteNewScreen, '/notes/n1/edit')
        expect(valore(wrapper, 'talos-note-title')).toBe('Nota uno')

        await r.push('/notes/new')
        await flushPromises()

        expect(valore(wrapper, 'talos-note-title')).toBe('')
        expect(valore(wrapper, 'talos-note-content')).toBe('')
        expect(salvaSpento(wrapper, 'talos-note-save')).toBe(true)
    })

    it('da «modifica A» a «modifica B»: carica B', async () => {
        const { r, wrapper } = await monta(NoteNewScreen, '/notes/n1/edit')

        await r.push('/notes/n2/edit')
        await flushPromises()

        expect(valore(wrapper, 'talos-note-title')).toBe('Nota due')
        expect(valore(wrapper, 'talos-note-content')).toBe('Corpo due')
    })

    it('da «nuova» a «modifica»: carica la nota giusta', async () => {
        const { r, wrapper } = await monta(NoteNewScreen, '/notes/new')
        await wrapper.get('[data-testid="talos-note-title"]').setValue('Bozza a metà')

        await r.push('/notes/n2/edit')
        await flushPromises()

        expect(valore(wrapper, 'talos-note-title')).toBe('Nota due')
        expect(valore(wrapper, 'talos-note-content')).toBe('Corpo due')
    })
})

describe('COD-G1-STATO-02 il modulo della memoria segue la rotta', () => {
    it('da «modifica» a «nuova»: modulo vuoto, tipo di serie, salvataggio spento', async () => {
        const { r, wrapper } = await monta(MemoryNewScreen, '/memory/m1/edit')
        expect(valore(wrapper, 'talos-memory-title')).toBe('Memoria uno')
        // La m1 ha un tipo fuori dai quattro: l'avviso c'è.
        expect(wrapper.find('[data-testid="talos-memory-kind-missing"]').exists()).toBe(true)

        await r.push('/memory/new')
        await flushPromises()

        expect(valore(wrapper, 'talos-memory-title')).toBe('')
        expect(valore(wrapper, 'talos-memory-content')).toBe('')
        expect(wrapper.find('[data-testid="talos-memory-kind-missing"]').exists()).toBe(false)
        expect(wrapper.findComponent({ name: 'TalosThemedSelect' }).props('modelValue')).toBe('preference')
        expect(salvaSpento(wrapper, 'talos-memory-save')).toBe(true)
    })

    it('da «modifica A» a «modifica B»: carica B, tipo compreso', async () => {
        const { r, wrapper } = await monta(MemoryNewScreen, '/memory/m1/edit')

        await r.push('/memory/m2/edit')
        await flushPromises()

        expect(valore(wrapper, 'talos-memory-title')).toBe('Memoria due')
        expect(valore(wrapper, 'talos-memory-content')).toBe('Contenuto due')
        expect(wrapper.findComponent({ name: 'TalosThemedSelect' }).props('modelValue')).toBe('project_fact')
        expect(wrapper.find('[data-testid="talos-memory-kind-missing"]').exists()).toBe(false)
    })

    it('da «nuova» a «modifica»: carica la memoria giusta', async () => {
        const { r, wrapper } = await monta(MemoryNewScreen, '/memory/new')

        await r.push('/memory/m2/edit')
        await flushPromises()

        expect(valore(wrapper, 'talos-memory-title')).toBe('Memoria due')
    })
})

describe('COD-G1-STATO-03 il modulo dell\'attività segue la rotta', () => {
    it('da «modifica» a «nuova»: modulo vuoto, pianificazione spenta, salvataggio spento', async () => {
        const { r, wrapper } = await monta(TaskNewScreen, '/tasks/t1/edit')
        expect(valore(wrapper, 'talos-task-title')).toBe('Attività uno')
        expect(wrapper.find('[data-testid="talos-task-instruction"]').exists()).toBe(true)

        await r.push('/tasks/new')
        await flushPromises()

        expect(valore(wrapper, 'talos-task-title')).toBe('')
        expect(valore(wrapper, 'talos-task-description')).toBe('')
        expect(wrapper.find('[data-testid="talos-task-instruction"]').exists()).toBe(false)
        expect(salvaSpento(wrapper, 'talos-task-save')).toBe(true)
    })

    it('da «modifica A» a «modifica B»: carica B, senza la pianificazione di A', async () => {
        const { r, wrapper } = await monta(TaskNewScreen, '/tasks/t1/edit')

        await r.push('/tasks/t2/edit')
        await flushPromises()

        expect(valore(wrapper, 'talos-task-title')).toBe('Attività due')
        expect(valore(wrapper, 'talos-task-description')).toBe('Descrizione due')
        expect(wrapper.find('[data-testid="talos-task-instruction"]').exists()).toBe(false)
    })

    it('da «nuova» a «modifica»: carica l\'attività giusta', async () => {
        const { r, wrapper } = await monta(TaskNewScreen, '/tasks/new')

        await r.push('/tasks/t1/edit')
        await flushPromises()

        expect(valore(wrapper, 'talos-task-title')).toBe('Attività uno')
        expect(valore(wrapper, 'talos-task-instruction')).toBe('Istruzione uno')
    })
})
