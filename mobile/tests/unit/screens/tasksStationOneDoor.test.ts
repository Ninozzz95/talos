// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * Una porta sola per creare un'attività, e va dove ci sono tutti i campi.
 *
 * Visto sul OnePlus Pad 3 il 2026-08-06: la stazione Attività aveva ANCORA il
 * modulo sempre aperto sopra l'elenco, che occupava un terzo dello schermo — e
 * sapeva creare MENO della pagina, perché non conosceva la pianificazione.
 *
 * Due porte per la stessa cosa, con poteri diversi, è il difetto peggiore di
 * tutti: chi passava dalla porta piccola non poteva far ripetere niente, e non
 * aveva modo di sapere perché. Questo test tiene ferma la porta unica —
 * ricomparirebbe verde solo se qualcuno rimettesse il modulo in linea.
 */
const push = vi.fn()
const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {} }), useRouter: () => ({ push }) }))

const attivitàPianificata = {
    id: 't1',
    title: 'Notizie del mattino',
    description: null,
    run_id: null,
    priority: 'normal',
    status: 'todo',
    schedule_json: JSON.stringify({ kind: 'daily', at: '07:30' }),
    instruction: 'Riassumi le notizie',
    last_run_at: null,
    created_at: '2026-08-06T06:00:00.000Z',
    updated_at: '2026-08-06T06:00:00.000Z',
}

const attivitàSemplice = { ...attivitàPianificata, id: 't2', title: 'Comprare il pane', schedule_json: null, instruction: null }

beforeEach(() => {
    push.mockClear()
    mockState.controller = {
        tasks: {
            list: vi.fn(async () => [attivitàPianificata, attivitàSemplice]),
            create: vi.fn(), setStatus: vi.fn(), remove: vi.fn(),
        },
    }
})

describe('la stazione Attività', () => {
    it('crea da UN posto solo: il FAB, che porta alla pagina', async () => {
        const TasksScreen = (await import('@/screens/TasksScreen.vue')).default
        const wrapper = mount(TasksScreen)
        await flushPromises()

        // Il modulo in linea non c'è più: se tornasse, tornerebbe anche la
        // seconda porta che sa fare meno.
        expect(wrapper.find('form').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-task-save"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-tasks-new-fab"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'task-new' })
    })

    /**
     * Una pianificazione salvata e invisibile è peggio di una non salvata: chi
     * l'ha scritta non ha modo di sapere se ha funzionato se non aspettando
     * l'ora, cioè scoprendolo nel modo più lento possibile.
     */
    it('dice quali attività si ripetono, e non lo dice delle altre', async () => {
        const TasksScreen = (await import('@/screens/TasksScreen.vue')).default
        const wrapper = mount(TasksScreen)
        await flushPromises()

        const righe = wrapper.findAll('[data-testid="talos-task-row"]')
        expect(righe).toHaveLength(2)
        expect(righe[0].find('[data-testid="talos-task-next-run"]').exists()).toBe(true)
        // E una pillola vuota su tutte le altre sarebbe rumore, su una lista
        // che di solito è di promemoria.
        expect(righe[1].find('[data-testid="talos-task-next-run"]').exists()).toBe(false)
    })
})
