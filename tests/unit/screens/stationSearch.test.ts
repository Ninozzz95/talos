// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * L'impalcatura che l'owner ha approvato dagli screenshot di Claude:
 * ogni pagina d'elenco ha titolo · **campo di ricerca** · lista · FAB.
 *
 * Memoria, Note e Attività avevano tutto tranne la ricerca — e una lista che
 * cresce senza un modo per restringerla si scorre finché non ci si arrende.
 */
const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {} }), useRouter: () => ({ push: vi.fn() }) }))

function controller() {
    return {
        memories: {
            list: vi.fn(async () => [
                { id: 'm1', title: 'Risposte brevi', content: 'Preferisco risposte brevi.', kind: 'preference', status: 'active', scope_type: 'global' },
                { id: 'm2', title: 'Fuso orario', content: 'Vivo a Catania.', kind: 'project_fact', status: 'active', scope_type: 'global' },
            ]),
            create: vi.fn(), setStatus: vi.fn(), remove: vi.fn(), upsertDisplayName: vi.fn(),
        },
        notes: { list: vi.fn(async () => []), create: vi.fn(), remove: vi.fn() },
        tasks: { list: vi.fn(async () => []), create: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
        chat: { activeSession: { value: null } },
    }
}

beforeEach(() => { mockState.controller = controller() })

describe('le stazioni-elenco hanno un modo per restringersi', () => {
    it('MemoryScreen filtra su quello che la persona ha scritto', async () => {
        const MemoryScreen = (await import('@/screens/MemoryScreen.vue')).default
        const wrapper = mount(MemoryScreen)
        await flushPromises()
        expect(wrapper.findAll('[data-testid="talos-memory-row"]')).toHaveLength(2)

        await wrapper.get('[data-testid="talos-memory-search"]').setValue('Catania')
        expect(wrapper.findAll('[data-testid="talos-memory-row"]')).toHaveLength(1)
    })

    it('il campo resta visibile anche quando il filtro non trova niente', async () => {
        /**
         * È con la lista vuota che si cancella il filtro: un campo che sparisce
         * insieme ai risultati chiude la persona fuori dalla propria ricerca.
         * (È anche il motivo per cui sta FUORI da ogni catena `v-if`.)
         */
        const MemoryScreen = (await import('@/screens/MemoryScreen.vue')).default
        const wrapper = mount(MemoryScreen)
        await flushPromises()
        await wrapper.get('[data-testid="talos-memory-search"]').setValue('zzz-nessuna-corrispondenza')

        expect(wrapper.findAll('[data-testid="talos-memory-row"]')).toHaveLength(0)
        expect(wrapper.find('[data-testid="talos-memory-search"]').exists()).toBe(true)
    })

    it('Note e Attività hanno lo stesso campo, con lo stesso nome', async () => {
        // Stessa impalcatura ovunque: chi l'ha imparata in una stazione non la
        // reimpara nell'altra.
        const NotesScreen = (await import('@/screens/NotesScreen.vue')).default
        const TasksScreen = (await import('@/screens/TasksScreen.vue')).default
        expect(mount(NotesScreen).find('[data-testid="talos-notes-search"]').exists()).toBe(true)
        expect(mount(TasksScreen).find('[data-testid="talos-tasks-search"]').exists()).toBe(true)
    })
})
