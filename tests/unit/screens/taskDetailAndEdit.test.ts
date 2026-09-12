// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosLocalTask } from '@/repositories/chatRepository'

/**
 * La pagina di un'attività, e il modulo che la corregge.
 *
 * ## Le due cose che qui erano IMPOSSIBILI, e ora si fanno
 *
 * 1. **correggere.** Non c'era una rotta, non c'era un pulsante, e cambiare un
 *    refuso nel titolo costava cancellare e rifare — cioè cambiare identità
 *    all'attività e perdere con lei lo storico, la pianificazione e il legame
 *    con l'esecuzione che l'aveva generata. `update` esisteva dall'inizio;
 *    mancava la porta.
 * 2. **spuntare i punti.** Decisione dell'owner (12/09/2026): nelle note le
 *    caselle sono un segno, in un'attività sono azioni — e spuntare l'ultimo
 *    completa l'attività, perché altrimenti chi ha finito dovrebbe dirlo due
 *    volte.
 *
 * ⛔ Ogni verbo, anche al contrario: spuntare e despuntare, fermare e
 * riprendere, salvare e annullare.
 */

const OGNI_GIORNO = JSON.stringify({ kind: 'daily', at: '07:30', onlyIfChanged: true })

function attivita(patch: Partial<TalosLocalTask> = {}): TalosLocalTask {
    return {
        id: 't1',
        title: 'Rivedere la presentazione',
        description: 'Apri le sei slide.\n- [x] struttura\n- [ ] titoli',
        run_id: null,
        priority: 'high',
        status: 'todo',
        content_origin: 'user-direct',
        schedule_json: null,
        instruction: null,
        last_run_at: null,
        paused: false,
        created_at: '2026-09-01T08:00:00.000Z',
        updated_at: '2026-09-01T08:00:00.000Z',
        ...patch,
    }
}

let corrente: TalosLocalTask = attivita()
let rotta = { name: 'task-item', params: { id: 't1' } as Record<string, string> }

const list = vi.fn(async () => [corrente])
const setStatus = vi.fn(async (_id: string, status: TalosLocalTask['status']) => {
    corrente = { ...corrente, status }
    return corrente
})
const update = vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    corrente = { ...corrente, ...patch } as TalosLocalTask
    return corrente
})
const remove = vi.fn(async () => undefined)
const create = vi.fn(async () => corrente)
const push = vi.fn()
const replace = vi.fn()
const back = vi.fn()

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ tasks: { list, create, setStatus, update, remove } }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push, replace, back }),
    useRoute: () => rotta,
}))

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key, locale: { value: 'it' } }),
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))

const esporta = vi.fn(async () => 'copied' as const)
vi.mock('@/components/talos/tasks/taskExport', () => ({
    exportTalosTaskText: (...args: unknown[]) => esporta(...(args as [])),
}))

async function pagina() {
    const TaskItemScreen = (await import('@/screens/TaskItemScreen.vue')).default
    const wrapper = mount(TaskItemScreen)
    await flushPromises()
    return wrapper
}

async function modulo() {
    const TaskNewScreen = (await import('@/screens/TaskNewScreen.vue')).default
    const wrapper = mount(TaskNewScreen)
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    vi.clearAllMocks()
    corrente = attivita()
    rotta = { name: 'task-item', params: { id: 't1' } }
})

describe('la pagina di un\'attività', () => {
    it('dice a che punto è, cosa c\'è scritto e quando riparte', async () => {
        corrente = attivita({ schedule_json: OGNI_GIORNO, instruction: 'Riassumi le notizie' })
        const wrapper = await pagina()

        expect(wrapper.get('[data-testid="talos-task-item-state"]').attributes('data-state')).toBe('scheduled')
        expect(wrapper.get('[data-testid="talos-task-item-recurrence"]').text()).toContain('tasks.scheduleDaily')
        expect(wrapper.get('[data-testid="talos-task-item-instruction"]').text()).toBe('Riassumi le notizie')
    })

    it('⛔ l\'istruzione NON si mostra senza ricorrenza: sarebbe una promessa che nessuno mantiene', async () => {
        const wrapper = await pagina()
        expect(wrapper.find('[data-testid="talos-task-item-instruction"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-task-item-pause"]').exists()).toBe(false)
    })

    it('un indirizzo che non esiste lo dice, invece di mostrare una pagina vuota', async () => {
        rotta = { name: 'task-item', params: { id: 'mai-esistita' } }
        const wrapper = await pagina()
        expect(wrapper.find('[data-testid="talos-task-item-missing"]').exists()).toBe(true)
    })

    it('la casella in testa completa, e riapre', async () => {
        const wrapper = await pagina()
        await wrapper.get('[data-testid="talos-task-item-check"]').trigger('click')
        await flushPromises()
        expect(setStatus).toHaveBeenCalledWith('t1', 'done')

        await wrapper.get('[data-testid="talos-task-item-check"]').trigger('click')
        await flushPromises()
        expect(setStatus).toHaveBeenLastCalledWith('t1', 'todo')
    })

    it('«In corso» si imposta da qui, con lo stato fra le proprietà', async () => {
        const wrapper = await pagina()
        await wrapper.get('[data-testid="talos-task-item-status"]').setValue('doing')
        await flushPromises()
        expect(setStatus).toHaveBeenCalledWith('t1', 'doing')
    })

    it('la priorità si cambia da qui, e non si chiede alla creazione', async () => {
        const wrapper = await pagina()
        await wrapper.get('[data-testid="talos-task-item-priority"]').setValue('low')
        await flushPromises()
        expect(update).toHaveBeenCalledWith('t1', { priority: 'low' })
    })
})

describe('i punti spuntabili, che qui sono AZIONI', () => {
    it('spuntare riscrive la riga nella descrizione, e nient\'altro', async () => {
        const wrapper = await pagina()
        const punti = wrapper.findAll('[data-testid="talos-task-check-item"]')
        expect(punti).toHaveLength(2)

        await punti[1]!.trigger('click')
        await flushPromises()
        expect(update).toHaveBeenCalledWith('t1', {
            description: 'Apri le sei slide.\n- [x] struttura\n- [x] titoli',
        })
    })

    it('spuntato l\'ULTIMO, l\'attività è completata', async () => {
        const wrapper = await pagina()
        const punti = wrapper.findAll('[data-testid="talos-task-check-item"]')
        await punti[1]!.trigger('click')
        await flushPromises()
        expect(setStatus).toHaveBeenCalledWith('t1', 'done')
    })

    it('⛔ AL VERSO CONTRARIO: tolta una spunta a una completata, torna da fare', async () => {
        corrente = attivita({ status: 'done', description: '- [x] struttura\n- [x] titoli' })
        const wrapper = await pagina()
        await wrapper.findAll('[data-testid="talos-task-check-item"]')[0]!.trigger('click')
        await flushPromises()
        expect(update).toHaveBeenCalledWith('t1', { description: '- [ ] struttura\n- [x] titoli' })
        expect(setStatus).toHaveBeenCalledWith('t1', 'todo')
    })

    it('⛔ spuntando un punto di DUE, non completa niente', async () => {
        corrente = attivita({ description: '- [ ] uno\n- [ ] due' })
        const wrapper = await pagina()
        await wrapper.findAll('[data-testid="talos-task-check-item"]')[0]!.trigger('click')
        await flushPromises()
        expect(setStatus).not.toHaveBeenCalled()
    })

    it('la frase che NON è una casella resta leggibile, e non è premibile', async () => {
        const wrapper = await pagina()
        const testo = wrapper.findAll('[data-testid="talos-task-detail-text"]')
        expect(testo).toHaveLength(1)
        expect(testo[0]!.text()).toBe('Apri le sei slide.')
        expect(testo[0]!.element.tagName).toBe('P')
    })

    it('senza punti si legge la descrizione, e senza descrizione lo si dice', async () => {
        corrente = attivita({ description: 'Una frase sola.' })
        let wrapper = await pagina()
        expect(wrapper.get('[data-testid="talos-task-item-description"]').text()).toBe('Una frase sola.')

        corrente = attivita({ description: null })
        wrapper = await pagina()
        expect(wrapper.get('[data-testid="talos-task-item-description"]').text()).toBe('tasks.noDescription')
    })
})

describe('U-17 — fermare e riprendere, dalla pagina', () => {
    it('ferma senza cancellare la ricorrenza', async () => {
        corrente = attivita({ schedule_json: OGNI_GIORNO, instruction: 'Riassumi' })
        const wrapper = await pagina()
        await wrapper.get('[data-testid="talos-task-item-pause"]').trigger('click')
        await flushPromises()
        expect(update).toHaveBeenCalledWith('t1', { paused: true })
        // ⛔ La ricorrenza è ancora lì: fermare non è cancellare.
        expect(corrente.schedule_json).toBe(OGNI_GIORNO)
        expect(corrente.instruction).toBe('Riassumi')
    })

    it('⛔ AL VERSO CONTRARIO: una ferma riparte, e la pastiglia lo dice', async () => {
        corrente = attivita({ schedule_json: OGNI_GIORNO, paused: true })
        const wrapper = await pagina()
        expect(wrapper.get('[data-testid="talos-task-item-state"]').attributes('data-state')).toBe('paused')
        await wrapper.get('[data-testid="talos-task-item-pause"]').trigger('click')
        await flushPromises()
        expect(update).toHaveBeenCalledWith('t1', { paused: false })
    })

    it('⛔ «Simula esecuzione» del mockup NON è stato portato', async () => {
        corrente = attivita({ schedule_json: OGNI_GIORNO })
        const wrapper = await pagina()
        // Nel mockup fingeva, e lo dichiarava. Un bottone che finge è peggio di
        // un bottone che manca.
        expect(wrapper.text()).not.toMatch(/simula/i)
    })
})

describe('portarla fuori, e toglierla di mezzo', () => {
    it('«Esporta testo» passa dalla porta condivisa con le note', async () => {
        const wrapper = await pagina()
        await wrapper.get('[data-testid="talos-task-item-export"]').trigger('click')
        await flushPromises()
        expect(esporta).toHaveBeenCalledTimes(1)
        expect((esporta.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 't1' })
    })

    it('⛔ senza foglio di condivisione il ripiego si DICE: è successo altro', async () => {
        const { talosNotify } = await import('@/stores/notificationCentre')
        const wrapper = await pagina()
        await wrapper.get('[data-testid="talos-task-item-export"]').trigger('click')
        await flushPromises()
        // `copied` è il ripiego (`canShare()` falso): la persona non ha visto
        // nessun foglio, e deve sapere dov'è finito il testo.
        expect(talosNotify).toHaveBeenCalledTimes(1)
    })

    it('l\'eliminazione CHIEDE in linea, con l\'attività ancora sullo schermo', async () => {
        const wrapper = await pagina()
        expect(wrapper.find('[data-testid="talos-task-item-delete-confirm"]').exists()).toBe(false)
        await wrapper.get('[data-testid="talos-task-item-delete"]').trigger('click')
        expect(remove).not.toHaveBeenCalled()

        await wrapper.get('[data-testid="talos-task-item-delete-confirm"]').trigger('click')
        await flushPromises()
        expect(remove).toHaveBeenCalledWith('t1')
        expect(replace).toHaveBeenCalledWith({ name: 'tasks' })
    })

    it('«Modifica» porta al modulo, con l\'id', async () => {
        const wrapper = await pagina()
        await wrapper.get('[data-testid="talos-task-item-edit"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'task-edit', params: { id: 't1' } })
    })
})

describe('il modulo che CORREGGE — lo stesso che crea', () => {
    beforeEach(() => { rotta = { name: 'task-edit', params: { id: 't1' } } })

    it('arriva precompilato, ricorrenza compresa', async () => {
        corrente = attivita({ schedule_json: OGNI_GIORNO, instruction: 'Riassumi le notizie' })
        const wrapper = await modulo()

        expect((wrapper.get('[data-testid="talos-task-title"]').element as HTMLInputElement).value)
            .toBe('Rivedere la presentazione')
        expect((wrapper.get('[data-testid="talos-task-description"]').element as HTMLTextAreaElement).value)
            .toContain('- [x] struttura')
        expect((wrapper.get('[data-testid="talos-task-schedule-enable"]').element as HTMLInputElement).checked).toBe(true)
    })

    it('salva con `update`, e torna all\'ATTIVITÀ — non all\'elenco', async () => {
        const wrapper = await modulo()
        await wrapper.get('[data-testid="talos-task-title"]').setValue('Rivedere le slide')
        await wrapper.get('form').trigger('submit')
        await flushPromises()

        expect(create).not.toHaveBeenCalled()
        expect(update).toHaveBeenCalledWith('t1', {
            title: 'Rivedere le slide',
            description: 'Apri le sei slide.\n- [x] struttura\n- [ ] titoli',
            schedule_json: null,
            instruction: null,
        })
        expect(replace).toHaveBeenCalledWith({ name: 'task-item', params: { id: 't1' } })
    })

    it('⛔ ANNULLATA non scrive niente: torna da dove si è arrivati', async () => {
        const wrapper = await modulo()
        await wrapper.get('[data-testid="talos-task-title"]').setValue('Un titolo mai salvato')
        await wrapper.get('[data-testid="talos-task-cancel"]').trigger('click')
        await flushPromises()

        expect(update).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
        expect(back).toHaveBeenCalledTimes(1)
    })

    it('un\'attività che non c\'è più non apre un modulo vuoto: torna all\'elenco', async () => {
        rotta = { name: 'task-edit', params: { id: 'mai-esistita' } }
        await modulo()
        expect(replace).toHaveBeenCalledWith({ name: 'tasks' })
    })

    it('⛔ dalla rotta di CREAZIONE il modulo resta vuoto e chiama `create`', async () => {
        rotta = { name: 'task-new', params: {} }
        const wrapper = await modulo()
        expect((wrapper.get('[data-testid="talos-task-title"]').element as HTMLInputElement).value).toBe('')
        await wrapper.get('[data-testid="talos-task-title"]').setValue('Una cosa nuova')
        await wrapper.get('form').trigger('submit')
        await flushPromises()
        expect(create).toHaveBeenCalledTimes(1)
        expect(update).not.toHaveBeenCalled()
        expect(replace).toHaveBeenCalledWith({ name: 'tasks' })
    })
})
