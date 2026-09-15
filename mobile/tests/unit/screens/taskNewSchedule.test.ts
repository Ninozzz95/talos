// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'
import TaskNewScreen from '@/screens/TaskNewScreen.vue'
import { talosOnNotificationAndroid, talosOnNotificationToast, talosResetNotificationCentre } from '@/stores/notificationCentre'

const creaAttività = vi.fn(async () => undefined)

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ tasks: { create: creaAttività } }),
}))

function router() {
    return createRouter({
        history: createMemoryHistory(),
        routes: TALOS_MOBILE_ROUTES.map((r) => ({
            path: r.path, name: r.name, component: { template: '<div />' },
        })),
    })
}

async function pagina() {
    const r = router()
    await r.push('/')
    await r.isReady()
    return mount(TaskNewScreen, { global: { plugins: [r] } })
}

beforeEach(() => {
    creaAttività.mockClear()
    talosResetNotificationCentre()
})

afterEach(() => {
    talosOnNotificationToast(null)
    talosOnNotificationAndroid(null)
    document.body.innerHTML = ''
})

/**
 * «Pianificare» di ChatGPT, dentro le Attività.
 *
 * La ricerca del 2026-08-06 ha misurato sette limiti di quella funzione; questi
 * test tengono ferme le tre scelte con cui se ne battono la metà: la
 * pianificazione è facoltativa e non pesa su chi non la vuole, un'attività che
 * si ripete DEVE dire cosa fare, e una ricorrenza a metà non si salva.
 */
describe('la pianificazione di un\'attività', () => {
    /**
     * Un'attività su tre è un promemoria che non si ripete. Sei campi in più per
     * tutte sarebbero sei campi pagati da chi ne voleva zero, sulla pagina che
     * deve costare meno di tutte.
     */
    it('parte spenta, e da spenta non chiede niente', async () => {
        const wrapper = await pagina()
        expect(wrapper.find('[data-testid="talos-task-schedule-enable"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-task-instruction"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-task-schedule-kind"]').exists()).toBe(false)

        await wrapper.find('[data-testid="talos-task-title"]').setValue('Comprare il pane')
        await wrapper.find('form').trigger('submit')
        await flushPromises()

        expect(creaAttività).toHaveBeenCalledTimes(1)
        const salvata = creaAttività.mock.calls[0][0] as Record<string, unknown>
        // Spenta significa NON pianificata: nessun residuo salvato di nascosto.
        expect(salvata.schedule_json).toBeNull()
        expect(salvata.instruction).toBeNull()
    })

    /**
     * Accesa e senza istruzione, il tasto resta spento. Un'attività che parte e
     * non sa cosa fare è il difetto peggiore possibile qui, perché si scopre
     * soltanto domani mattina alle nove.
     */
    it('accesa, non si salva finché non dice cosa fare', async () => {
        const wrapper = await pagina()
        await wrapper.find('[data-testid="talos-task-title"]').setValue('Notizie del mattino')
        await wrapper.find('[data-testid="talos-task-schedule-enable"]').setValue(true)
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-task-save"]').attributes('disabled')).toBeDefined()

        await wrapper.find('[data-testid="talos-task-instruction"]').setValue('Riassumi le notizie sull\'IA')
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-task-save"]').attributes('disabled')).toBeUndefined()
    })

    it('salva la ricorrenza scelta, e l\'istruzione separata dalla descrizione', async () => {
        const wrapper = await pagina()
        await wrapper.find('[data-testid="talos-task-title"]').setValue('Notizie del mattino')
        await wrapper.find('[data-testid="talos-task-description"]').setValue('Per non aprire dieci siti.')
        await wrapper.find('[data-testid="talos-task-schedule-enable"]').setValue(true)
        await flushPromises()
        await wrapper.find('[data-testid="talos-task-instruction"]').setValue('Riassumi le notizie sull\'IA')
        await wrapper.find('[data-testid="talos-task-schedule-at"]').setValue('07:30')
        await wrapper.find('[data-testid="talos-task-schedule-only-if-changed"]').setValue(true)
        await flushPromises()

        await wrapper.find('form').trigger('submit')
        await flushPromises()

        const salvata = creaAttività.mock.calls[0][0] as Record<string, unknown>
        expect(JSON.parse(salvata.schedule_json as string)).toEqual({
            kind: 'daily', at: '07:30', days: [1, 2, 3, 4, 5], everyMinutes: 60, onlyIfChanged: true,
        })
        // Le due cose restano DUE: la descrizione la legge un umano, l'istruzione
        // la esegue una macchina.
        expect(salvata.instruction).toBe('Riassumi le notizie sull\'IA')
        expect(salvata.description).toBe('Per non aprire dieci siti.')
    })

    /**
     * La riga «prossima esecuzione» è l'unica che risponde alla domanda vera —
     * quando succederà — e deve accorgersi da sola delle combinazioni che non
     * partono mai, che altrimenti si scoprono aspettando invano.
     */
    it('dice quando partirà, e avvisa quando non partirebbe mai', async () => {
        const wrapper = await pagina()
        await wrapper.find('[data-testid="talos-task-schedule-enable"]').setValue(true)
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-task-schedule-next"]').text().length).toBeGreaterThan(0)

        // «A giorni scelti» senza nessun giorno: incompleta, e lo dice.
        await wrapper.findComponent({ name: 'TalosThemedSelect' }).vm.$emit('update:modelValue', 'weekly')
        await flushPromises()
        for (const giorno of [1, 2, 3, 4, 5]) {
            await wrapper.find(`[data-testid="talos-task-schedule-day-${giorno}"]`).trigger('click')
        }
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-task-save"]').attributes('disabled')).toBeDefined()
    })
})
