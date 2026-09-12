// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TasksScreen from '@/screens/TasksScreen.vue'
import TalosMobileTaskCard from '@/components/talos/tasks/TalosMobileTaskCard.vue'
import TalosMobileTaskRow from '@/components/talos/tasks/TalosMobileTaskRow.vue'
import type { TalosLocalTask } from '@/repositories/chatRepository'

/**
 * La stazione Attività, nella forma del mockup «Talos Calm Finale».
 *
 * ## Cosa tiene fermo questo file
 *
 * Le tre cose che una schermata-elenco può sbagliare senza che nessuno se ne
 * accorga guardandola per due secondi:
 *
 *   1. **dire il falso mentre carica** — «non ci sono attività» con sei
 *      attività salvate è una risposta sbagliata a una domanda appena fatta, e
 *      dura un fotogramma;
 *   2. **contare male** — i numeri accanto ai filtri servono a decidere dove
 *      guardare, e quattro numeri che non fanno il totale sono quattro numeri
 *      di cui non ci si fida più;
 *   3. **offrire un'azione che non fa niente** — «Metti in pausa» su
 *      un'attività senza ricorrenza.
 *
 * ⛔ Ogni verbo è provato ANCHE al contrario: completare e riaprire, mettere in
 * pausa e riprendere, filtrare e azzerare.
 */

const OGNI_GIORNO = JSON.stringify({ kind: 'daily', at: '07:30' })

function attivita(patch: Partial<TalosLocalTask> & { id: string; title: string }): TalosLocalTask {
    return {
        description: null,
        run_id: null,
        priority: 'normal',
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

let tasks: TalosLocalTask[] = []
let rispondi: () => Promise<TalosLocalTask[]> = async () => tasks

const list = vi.fn(() => rispondi())
const setStatus = vi.fn(async () => tasks[0]!)
const update = vi.fn(async () => tasks[0]!)
const remove = vi.fn(async () => undefined)
const push = vi.fn()

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ tasks: { list, create: vi.fn(), setStatus, update, remove } }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
    useRoute: () => ({ name: 'tasks', params: {} }),
}))

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key, locale: { value: 'it' } }),
}))

vi.mock('@/stores/notificationCentre', () => ({ talosNotify: vi.fn() }))
vi.mock('@/services/haptics', () => ({ talosLightImpact: vi.fn(async () => undefined) }))

const esporta = vi.fn(async () => 'shared' as const)
vi.mock('@/components/talos/tasks/taskExport', () => ({
    exportTalosTaskText: (...args: unknown[]) => esporta(...(args as [])),
}))

async function schermata() {
    const wrapper = mount(TasksScreen)
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    vi.clearAllMocks()
    rispondi = async () => tasks
    tasks = [
        attivita({ id: 't1', title: 'Rivedere la presentazione', priority: 'high', description: 'Apri le sei slide.\n- [x] struttura\n- [ ] titoli' }),
        attivita({ id: 't2', title: 'Briefing del lunedì', schedule_json: OGNI_GIORNO, instruction: 'Riassumi' }),
        attivita({ id: 't3', title: 'Sistemare gli appunti', status: 'doing' }),
        attivita({ id: 't4', title: 'Un ultimo sguardo', schedule_json: OGNI_GIORNO, paused: true, instruction: 'Controlla' }),
        attivita({ id: 't5', title: 'Controllare le impostazioni', status: 'done' }),
    ]
})

describe('i tre stati della stazione Attività', () => {
    /**
     * ⛔ «Non lo so ancora» non è «non ce ne sono».
     *
     * Con cinque attività salvate il primo fotogramma non deve dichiarare un
     * vuoto che sparirà subito: è un lampo che dice il falso, e lo stesso
     * difetto era stato visto sul Pad nelle Note il 12/09/2026.
     */
    it('mentre carica non dice né quante sono né che non ce ne sono', async () => {
        let sblocca: (value: TalosLocalTask[]) => void = () => {}
        rispondi = () => new Promise((resolve) => { sblocca = resolve })
        const wrapper = mount(TasksScreen)
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-tasks-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-tasks-no-matches"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-tasks-count"]').text()).toBe('')

        sblocca(tasks)
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-tasks-count"]').text()).toBe('tasks.count')
        expect(wrapper.findAllComponents(TalosMobileTaskCard)).toHaveLength(5)
    })

    it('senza attività invita a crearne una', async () => {
        tasks = []
        const wrapper = await schermata()
        expect(wrapper.find('[data-testid="talos-tasks-empty"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-tasks-no-matches"]').exists()).toBe(false)
        await wrapper.get('[data-testid="talos-tasks-empty-new"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'task-new' })
    })

    it('⛔ col filtro che nasconde tutto dice UN\'ALTRA cosa, e la si può annullare', async () => {
        const wrapper = await schermata()
        await wrapper.get('[data-testid="talos-tasks-search"]').setValue('niente di niente')
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-tasks-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-tasks-no-matches"]').exists()).toBe(true)

        await wrapper.get('[data-testid="talos-tasks-clear-filters"]').trigger('click')
        await flushPromises()
        expect(wrapper.findAllComponents(TalosMobileTaskCard)).toHaveLength(5)
    })

    /**
     * ⛔ Anche una lista che FALLISCE è una risposta: lasciando la pagina nello
     * stato «non lo so» resterebbe muta per sempre, con l'errore scritto sopra
     * un vuoto senza via d'uscita.
     */
    it('dopo un errore la pagina parla comunque', async () => {
        rispondi = async () => { throw new Error('deposito chiuso') }
        const wrapper = await schermata()
        expect(wrapper.get('[data-testid="talos-tasks-error"]').text()).toContain('deposito chiuso')
        expect(wrapper.find('[data-testid="talos-tasks-empty"]').exists()).toBe(true)
    })
})

describe('i cinque filtri, coi loro numeri', () => {
    it('contano una partizione: la somma fa il totale', async () => {
        const wrapper = await schermata()
        const conta = (id: string) => Number(
            wrapper.get(`[data-testid="talos-tasks-filter-${id}"] small`).text(),
        )
        expect(conta('all')).toBe(5)
        // t1 da fare · t3 in corso · t2 e t4 pianificate (t4 in pausa) · t5 completata
        expect([conta('todo'), conta('doing'), conta('scheduled'), conta('done')]).toEqual([1, 1, 2, 1])
        expect(conta('todo') + conta('doing') + conta('scheduled') + conta('done')).toBe(conta('all'))
    })

    it('⛔ ogni filtro RESPINGE qualcosa, non solo accetta', async () => {
        const wrapper = await schermata()
        for (const [id, attese] of [['todo', 1], ['doing', 1], ['scheduled', 2], ['done', 1]] as const) {
            await wrapper.get(`[data-testid="talos-tasks-filter-${id}"]`).trigger('click')
            await flushPromises()
            expect(wrapper.findAllComponents(TalosMobileTaskCard), id).toHaveLength(attese)
        }
        await wrapper.get('[data-testid="talos-tasks-filter-all"]').trigger('click')
        await flushPromises()
        expect(wrapper.findAllComponents(TalosMobileTaskCard)).toHaveLength(5)
    })

    it('i conteggi NON seguono la ricerca: dicono quante ce ne sono, non quante corrispondono', async () => {
        const wrapper = await schermata()
        await wrapper.get('[data-testid="talos-tasks-search"]').setValue('Briefing')
        await flushPromises()
        expect(wrapper.findAllComponents(TalosMobileTaskCard)).toHaveLength(1)
        expect(wrapper.get('[data-testid="talos-tasks-filter-all"] small').text()).toBe('5')
    })
})

describe('l\'ordine e la densità', () => {
    it('parte da PRIORITÀ, e le completate vanno in fondo', async () => {
        const wrapper = await schermata()
        expect((wrapper.get('[data-testid="talos-tasks-sort"]').element as HTMLSelectElement).value)
            .toBe('priority')
        const titoli = wrapper.findAllComponents(TalosMobileTaskCard).map((c) => c.props('task').id)
        expect(titoli[0]).toBe('t1')
        expect(titoli.at(-1)).toBe('t5')
    })

    it('per titolo riordina davvero', async () => {
        const wrapper = await schermata()
        await wrapper.get('[data-testid="talos-tasks-sort"]').setValue('title')
        await flushPromises()
        const titoli = wrapper.findAllComponents(TalosMobileTaskCard).map((c) => c.props('task').title)
        expect(titoli).toEqual([...titoli].sort((a, b) => a.localeCompare(b, 'it')))
    })

    it('parte a SCHEDE, e la lista è a un tocco', async () => {
        const wrapper = await schermata()
        expect(wrapper.get('[data-testid="talos-tasks-list"]').attributes('data-view')).toBe('grid')
        await wrapper.get('[data-testid="talos-tasks-view-list"]').trigger('click')
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-tasks-list"]').attributes('data-view')).toBe('list')
        expect(wrapper.findAllComponents(TalosMobileTaskRow)).toHaveLength(5)
    })
})

describe('i verbi, dalla riga', () => {
    it('la casella COMPLETA in un tocco — e con lo stesso tocco riapre', async () => {
        const wrapper = await schermata()
        const prima = wrapper.findAllComponents(TalosMobileTaskCard)
            .find((c) => c.props('task').id === 't1')!
        prima.vm.$emit('toggle')
        await flushPromises()
        expect(setStatus).toHaveBeenCalledWith('t1', 'done')

        // ⛔ Al verso contrario, sulla completata.
        const finita = wrapper.findAllComponents(TalosMobileTaskCard)
            .find((c) => c.props('task').id === 't5')!
        finita.vm.$emit('toggle')
        await flushPromises()
        expect(setStatus).toHaveBeenCalledWith('t5', 'todo')
    })

    it('«In corso» si mette dal menu, e si toglie dallo stesso menu', async () => {
        const wrapper = await schermata()
        const daFare = wrapper.findAllComponents(TalosMobileTaskCard)
            .find((c) => c.props('task').id === 't1')!
        daFare.vm.$emit('action', 'doing')
        await flushPromises()
        expect(setStatus).toHaveBeenCalledWith('t1', 'doing')

        const inCorso = wrapper.findAllComponents(TalosMobileTaskCard)
            .find((c) => c.props('task').id === 't3')!
        inCorso.vm.$emit('action', 'doing')
        await flushPromises()
        expect(setStatus).toHaveBeenCalledWith('t3', 'todo')
    })

    it('U-17 — la pausa va e torna, e NON tocca la ricorrenza', async () => {
        const wrapper = await schermata()
        const viva = wrapper.findAllComponents(TalosMobileTaskCard)
            .find((c) => c.props('task').id === 't2')!
        viva.vm.$emit('action', 'pause')
        await flushPromises()
        expect(update).toHaveBeenCalledWith('t2', { paused: true })

        const ferma = wrapper.findAllComponents(TalosMobileTaskCard)
            .find((c) => c.props('task').id === 't4')!
        ferma.vm.$emit('action', 'pause')
        await flushPromises()
        expect(update).toHaveBeenLastCalledWith('t4', { paused: false })
        // ⛔ Nessuna delle due chiamate parla di `schedule_json`: fermare non è
        // cancellare, ed è tutta la differenza fra le due parole.
        for (const chiamata of update.mock.calls) {
            expect(Object.keys(chiamata[1] as object)).toEqual(['paused'])
        }
    })

    it('⛔ «Metti in pausa» non compare dove non c\'è niente da fermare', async () => {
        const wrapper = await schermata()
        const senza = wrapper.findAllComponents(TalosMobileTaskCard)
            .find((c) => c.props('task').id === 't1')!
        const con = wrapper.findAllComponents(TalosMobileTaskCard)
            .find((c) => c.props('task').id === 't2')!
        const idDi = (c: typeof senza) => c.props('actions').map((a) => a.id)
        expect(idDi(senza)).not.toContain('pause')
        expect(idDi(con)).toContain('pause')
    })

    it('«Modifica» porta alla pagina di correzione, con l\'id', async () => {
        const wrapper = await schermata()
        wrapper.findComponent(TalosMobileTaskCard).vm.$emit('action', 'edit')
        await flushPromises()
        expect(push).toHaveBeenCalledWith({ name: 'task-edit', params: { id: 't1' } })
    })

    it('«Esporta testo» passa dalla porta condivisa con le note', async () => {
        const wrapper = await schermata()
        wrapper.findComponent(TalosMobileTaskCard).vm.$emit('action', 'export')
        await flushPromises()
        expect(esporta).toHaveBeenCalledTimes(1)
        expect((esporta.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 't1' })
    })

    /**
     * ⛔ Mai senza conferma da un ELENCO: qui l'attività è un titolo e due
     * righe, e decidere di cancellarla è decidere su un testo che non si è
     * riletto.
     */
    it('«Elimina» CHIEDE prima, e solo dopo cancella', async () => {
        const wrapper = await schermata()
        wrapper.findComponent(TalosMobileTaskCard).vm.$emit('action', 'delete')
        await flushPromises()
        expect(remove).not.toHaveBeenCalled()

        // Il dialogo è TELEPORTATO nel `body`: dentro un `<dialog>` modale il
        // body sta sotto il top layer, e la shell dell'app lo ha già scoperto
        // sul tablet il 2026-08-03.
        const conferma = document.querySelector('[data-testid="talos-tasks-delete-confirm"]')
        expect(conferma).not.toBeNull()
        ;(conferma as HTMLButtonElement).click()
        await flushPromises()
        expect(remove).toHaveBeenCalledWith('t1')
    })

    it('«Nuova attività» è nel titolo, e il FAB non c\'è più', async () => {
        const wrapper = await schermata()
        expect(wrapper.find('[data-testid="talos-tasks-new-fab"]').exists()).toBe(false)
        await wrapper.get('[data-testid="talos-tasks-new"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'task-new' })
    })
})

describe('U-14 — il movimento, come PROVENIENZA', () => {
    /**
     * ⛔ Queste prove dicono da DOVE viene l'animazione, non che aspetto abbia.
     * Nessuna prova unitaria poteva accorgersi che 205 ms non erano 440 — 205 è
     * un numero perfettamente valido. Quello che si può provare è che la durata
     * la decida il motore e non un numero scritto a mano.
     */
    it('il filo sotto la scelta attiva è marcato per scivolare', async () => {
        const wrapper = await schermata()
        const fili = wrapper.findAll('[data-talos-indicator]')
        // Uno sotto la vista attiva, uno sotto il filtro attivo.
        expect(fili).toHaveLength(2)
        for (const filo of fili) expect(filo.classes()).toContain('talos-calm-indicator')
    })

    it('le schede si riordinano col FLIP di Vue, e chi esce esce dal flusso', async () => {
        const wrapper = await schermata()
        const gruppo = wrapper.findComponent({ name: 'TransitionGroup' })
        expect(gruppo.props('moveClass')).toBe('talos-calm-move')
        expect(gruppo.props('leaveActiveClass')).toBe('talos-calm-leave-active')
    })

    it('l\'entrata è scaglionata sul token del motore, e si ferma a 16', async () => {
        const wrapper = await schermata()
        const prima = wrapper.findAllComponents(TalosMobileTaskCard)[0]!
        expect(prima.attributes('data-talos-motion-intent')).toBe('message-insert')
        const seconda = wrapper.findAllComponents(TalosMobileTaskCard)[1]!
        // ⛔ Il ritardo è un `calc()` sul token, non un numero: a movimento
        // spento il token va a `0ms` e il `calc()` si annulla da sé.
        expect(seconda.attributes('style')).toContain('calc(var(--talos-motion-stagger')
        // ⛔ L'unico numero ammesso è il RIPIEGO dentro la `var()`: fuori da
        // lì un `240ms` scritto a mano resterebbe anche a movimento spento.
        expect(seconda.attributes('style')?.replace(/var\([^)]*\)/g, '')).not.toMatch(/\d+ms/)
    })

    it('⛔ nessuna durata scritta a mano nei componenti delle attività', async () => {
        const { readFileSync, readdirSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const cartella = resolve(process.cwd(), 'src/components/talos/tasks')
        for (const nome of readdirSync(cartella)) {
            const sorgente = readFileSync(resolve(cartella, nome), 'utf8')
            // Una durata CSS letterale fuori da una `var()` è un numero che
            // nessuna preferenza può toccare: è il difetto trovato una volta
            // sull'onda del tocco (SHELL-CSS-02).
            const fuori = sorgente
                .split('\n')
                .filter((riga) => /transition:|animation:/.test(riga))
                .filter((riga) => /\b\d+m?s\b/.test(riga) && !riga.includes('var('))
            expect(fuori).toEqual([])
        }
    })
})
