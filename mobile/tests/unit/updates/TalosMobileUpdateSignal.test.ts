// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TalosMobileUpdateSignal from '@/components/updates/TalosMobileUpdateSignal.vue'
import { talosSegnaleAggiornamento } from '@/lib/updates/segnaleAggiornamento'

/*
 * Il segnale nell'intestazione (owner 22/10/2026, 1): chiuso il cassetto resta per riaprirlo; come il campanello sparisce quando
 * non c'è niente da dire.
 */
afterEach(() => { Object.assign(talosSegnaleAggiornamento, { visibile: false, fallita: false, aperto: false }) })

describe('TalosMobileUpdateSignal', () => {
    it('UPD-SIG-01 niente da dire, niente segnale; col cassetto aperto nemmeno', async () => {
        const w = mount(TalosMobileUpdateSignal)
        expect(w.find('[data-testid="talos-update-signal"]').exists()).toBe(false)
        talosSegnaleAggiornamento.visibile = true
        talosSegnaleAggiornamento.aperto = true
        await nextTick()
        expect(w.find('[data-testid="talos-update-signal"]').exists()).toBe(false)
    })

    it('UPD-SIG-02 pronta: il segnale dice «Update ready» e riapre il cassetto', async () => {
        talosSegnaleAggiornamento.visibile = true
        const w = mount(TalosMobileUpdateSignal)
        const segnale = w.get('[data-testid="talos-update-signal"]')
        expect(segnale.attributes('aria-label')).toBe('Update ready')
        await segnale.trigger('click')
        expect(talosSegnaleAggiornamento.aperto).toBe(true)
    })

    it('UPD-SIG-03 scartata: il segnale lo dice', () => {
        Object.assign(talosSegnaleAggiornamento, { visibile: true, fallita: true })
        const w = mount(TalosMobileUpdateSignal)
        expect(w.get('[data-testid="talos-update-signal"]').attributes('aria-label')).toBe('Update discarded')
        expect(w.get('[data-testid="talos-update-signal"]').attributes('data-update-failed')).toBe('true')
    })
})
