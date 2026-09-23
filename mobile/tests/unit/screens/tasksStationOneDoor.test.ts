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
 *
 * ## ⛔ Aggiornato il 12/09/2026, e perché
 *
 * La porta unica **non è più un FAB**: è il pulsante primario del titolo, come
 * nel mockup «Talos Calm Finale» e come nelle Note (owner, sezione 3 del
 * refactor UI). Un cerchio che galleggia sopra l'ultima riga la copre, e su un
 * elenco lungo copre proprio quella che si stava per toccare. **Il test non è
 * stato indebolito**: continua a pretendere che di porte ce ne sia UNA, che il
 * modulo in linea non torni, e che la porta porti alla pagina — è cambiato solo
 * il selettore di dove quella porta si trova.
 *
 * La seconda prova è cambiata per la stessa ragione: la pianificazione non è
 * più una pastiglia «prossima esecuzione» accanto al titolo ma la riga in fondo
 * alla scheda, che nel mockup dice «Lun · 09:00» oppure «Senza pianificazione».
 * ⇒ La domanda resta identica — *una pianificazione salvata si VEDE?* — e la
 * risposta è più forte di prima, perché adesso si legge anche il caso negativo.
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
    paused: false,
    created_at: '2026-08-06T06:00:00.000Z',
    updated_at: '2026-08-06T06:00:00.000Z',
}

const attivitàSemplice = { ...attivitàPianificata, id: 't2', title: 'Comprare il pane', schedule_json: null, instruction: null }

beforeEach(() => {
    push.mockClear()
    mockState.controller = {
        tasks: {
            list: vi.fn(async () => [attivitàPianificata, attivitàSemplice]),
            create: vi.fn(), setStatus: vi.fn(), update: vi.fn(), remove: vi.fn(),
        },
    }
})

describe('la stazione Attività', () => {
    it('crea da UN posto solo, che porta alla pagina', async () => {
        const TasksScreen = (await import('@/screens/TasksScreen.vue')).default
        const wrapper = mount(TasksScreen)
        await flushPromises()

        // Il modulo in linea non c'è più: se tornasse, tornerebbe anche la
        // seconda porta che sa fare meno.
        expect(wrapper.find('form').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-task-save"]').exists()).toBe(false)
        // E nemmeno il FAB: una porta sola vuol dire una.
        expect(wrapper.find('[data-testid="talos-tasks-new-fab"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-tasks-new"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'task-new' })
    })

    /**
     * Una pianificazione salvata e invisibile è peggio di una non salvata: chi
     * l'ha scritta non ha modo di sapere se ha funzionato se non aspettando
     * l'ora, cioè scoprendolo nel modo più lento possibile.
     */
    it('dice quali attività si ripetono, e dice anche quali no', async () => {
        const TasksScreen = (await import('@/screens/TasksScreen.vue')).default
        const wrapper = mount(TasksScreen)
        await flushPromises()

        const righe = wrapper.findAll('[data-testid="talos-task-row"]')
        expect(righe).toHaveLength(2)
        // ⛔ Si legge ogni riga a partire dal SUO titolo, non dalla posizione:
        // l'ordine di serie è per priorità, e queste due sono pari — l'ordine
        // fra loro è un dettaglio dell'ordinamento, non la cosa in prova.
        const per = (titolo: string) => righe
            .find((riga) => riga.text().includes(titolo))!
            .get('[data-testid="talos-task-schedule"]').text()
        /*
         * Si controlla l'ORA, non la parola: questo file non sostituisce l'i18n
         * — legge le traduzioni vere — e un'asserzione sul testo italiano
         * diventerebbe rossa il giorno in cui la suite gira in inglese. `07:30`
         * è invece il dato che la persona ha scritto, e o compare o non compare.
         *
         * ⛔ Il verso contrario conta quanto il dritto: una riga che scrivesse
         * un orario su tutte passerebbe la prima metà di questa prova.
         */
        expect(per('Notizie del mattino')).toContain('07:30')
        expect(per('Comprare il pane')).not.toContain('07:30')
        expect(per('Comprare il pane').trim().length).toBeGreaterThan(0)
    })

    /**
     * ⛔ La pastiglia di stato distingue le due, e non è solo un colore: porta
     * la parola. Un'attività pianificata NON si legge «Da fare», perché se
     * partirà da sola quello è ciò che una persona deve sapere per prima.
     */
    it('la pastiglia dice «pianificata» solo a chi lo è', async () => {
        const TasksScreen = (await import('@/screens/TasksScreen.vue')).default
        const wrapper = mount(TasksScreen)
        await flushPromises()

        const stati = Object.fromEntries(wrapper.findAll('[data-testid="talos-task-row"]')
            .map((riga) => [
                riga.get('h2').text(),
                riga.get('[data-testid="talos-task-state"]').attributes('data-state'),
            ]))
        expect(stati).toEqual({
            'Notizie del mattino': 'scheduled',
            'Comprare il pane': 'todo',
        })
    })
})
