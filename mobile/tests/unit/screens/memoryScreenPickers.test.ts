// @vitest-environment jsdom

/**
 * Il selettore del TIPO di una memoria — dov'è finito, e cosa continua a fare.
 *
 * ## ⛔ Perché questo file adesso monta un'altra schermata
 *
 * Perché il modulo si è spostato. Fino al 12/09/2026 `MemoryScreen` teneva
 * titolo, contenuto, tipo e ambito in un modulo che si apriva SOPRA l'elenco —
 * lo stesso difetto già corretto sulle Note il 2026-08-06, dove su un riquadro
 * alto il gesto raro rubava un terzo dello schermo a quello frequente. La
 * sezione 4 del refactor «Talos Calm» lo ha tolto: la creazione è una pagina
 * (`MemoryNewScreen`), che è anche la pagina della MODIFICA.
 *
 * ⛔ L'ambito non si sceglie più a mano, e non è una perdita: `MemoryNewScreen`
 * scrive `scope_type: 'global'` da quando esiste (2026-08-06), perché una
 * memoria scritta a mano vale sempre e legarla a una sessione la farebbe
 * sparire con quella. Il selettore dell'ambito viveva solo nel modulo
 * dell'elenco, cioè in una superficie che non c'è più.
 *
 * Quello che questo file continua a provare è la cosa che vale: la GUARDIA. Il
 * selettore condiviso emette una stringa nuda, il campo è un'unione stretta, e
 * invece di riportare la stringa dentro l'unione con un cast — che lascerebbe
 * passare qualunque valore — la scelta si cerca nella lista da cui è arrivata.
 * Un valore che non c'è deve lasciare il modulo esattamente com'era.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MemoryNewScreen from '@/screens/MemoryNewScreen.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'

const created: Array<Record<string, unknown>> = []

const create = vi.fn(async (memory: Record<string, unknown>) => { created.push(memory) })
const update = vi.fn(async () => undefined)
const list = vi.fn(async () => [])
const replace = vi.fn()

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ memories: { list, create, update } }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
    useRoute: () => ({ name: 'memory-new', params: {} }),
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))

function picker(wrapper: ReturnType<typeof mount>) {
    return wrapper.getComponent<typeof TalosThemedSelect>('[data-testid="talos-memory-kind"]')
}

async function form() {
    const wrapper = mount(MemoryNewScreen)
    await flushPromises()
    return wrapper
}

describe('MemoryNewScreen — il selettore del tipo', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        created.length = 0
    })

    it('offre esattamente i quattro tipi, e parte da dove è sempre partito', async () => {
        const wrapper = await form()

        expect(picker(wrapper).props('items').map((item: { value: string }) => item.value))
            .toEqual(['preference', 'project_fact', 'procedure', 'policy_note'])
        expect(picker(wrapper).props('modelValue')).toBe('preference')
    })

    it('porta la scelta fino DENTRO la memoria salvata, non solo dentro il selettore', async () => {
        const wrapper = await form()

        picker(wrapper).vm.$emit('update:modelValue', 'policy_note')
        await flushPromises()

        await wrapper.get('[data-testid="talos-memory-title"]').setValue('una memoria')
        await wrapper.get('[data-testid="talos-memory-content"]').setValue('il contenuto')
        await wrapper.get('form').trigger('submit')
        await flushPromises()

        // L'esito, non il gestore: cosa è stato davvero chiesto al deposito. Un
        // selettore che mostra l'etichetta giusta e scrive il valore vecchio
        // passerebbe un controllo su `modelValue` e fallirebbe questo.
        expect(created).toHaveLength(1)
        expect(created[0]).toMatchObject({ kind: 'policy_note', scope_type: 'global', scope_id: null })
    })

    /** Il verso contrario: un valore che non è nella lista non deve entrare. */
    it('ignora un valore che non è sulla lista invece di scriverlo nel modulo', async () => {
        const wrapper = await form()

        picker(wrapper).vm.$emit('update:modelValue', 'not_a_kind')
        picker(wrapper).vm.$emit('update:modelValue', '')
        await flushPromises()

        expect(picker(wrapper).props('modelValue')).toBe('preference')

        await wrapper.get('[data-testid="talos-memory-title"]').setValue('una memoria')
        await wrapper.get('[data-testid="talos-memory-content"]').setValue('il contenuto')
        await wrapper.get('form').trigger('submit')
        await flushPromises()

        // E il valore rifiutato non è arrivato nemmeno al deposito.
        expect(created[0]).toMatchObject({ kind: 'preference' })
    })
})
