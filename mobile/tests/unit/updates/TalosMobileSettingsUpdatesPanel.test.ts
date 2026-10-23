// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const azioni = vi.hoisted(() => ({
    controlla: vi.fn(async () => 'aggiornata' as const),
    imposta: vi.fn(async () => undefined),
}))
vi.mock('@/services/appUpdates', async (originale) => ({
    ...(await originale<typeof import('@/services/appUpdates')>()),
    talosControllaOra: azioni.controlla,
    talosImpostaAggiornamenti: azioni.imposta,
}))

import TalosMobileSettingsUpdatesPanel from '@/components/talos/settings/TalosMobileSettingsUpdatesPanel.vue'
import { talosApplicaStatoAggiornamenti, talosAzzeraAggiornamentiPerTest } from '@/services/appUpdates'
import { talosSegnaleAggiornamento } from '@/lib/updates/segnaleAggiornamento'

/*
 * Impostazioni › Aggiornamenti. Owner 22/10/2026 «semplice a primo sguardo, avanzato a richiesta»: a primo sguardo la versione,
 * «Controlla ora» e UN interruttore; il resto sotto «Avanzate», chiusa.
 */
afterEach(() => {
    talosAzzeraAggiornamentiPerTest()
    talosSegnaleAggiornamento.aperto = false
    for (const f of Object.values(azioni)) f.mockClear()
})

function visibili(w: ReturnType<typeof mount>) {
    const corpo = w.get('[data-testid="talos-updates-advanced-body"]').element as HTMLElement
    return w.findAll('[role="switch"]').filter((s) => !corpo.contains(s.element))
}

describe('Impostazioni › Aggiornamenti', () => {
    it('UPD-SET-01 a primo sguardo: versione, Controlla ora e un interruttore solo; Avanzate chiusa', () => {
        talosApplicaStatoAggiornamenti({ installata: '0.1.43' })
        const w = mount(TalosMobileSettingsUpdatesPanel)
        expect(w.get('[data-testid="talos-updates-installed"]').text()).toBe('0.1.43')
        expect(w.get('[data-testid="talos-updates-check"]').text()).toContain('Check now')
        expect(visibili(w)).toHaveLength(1)
        expect(w.get('[data-testid="talos-updates-advanced"]').attributes('aria-expanded')).toBe('false')
        expect(w.get('[data-testid="talos-updates-advanced-body"]').attributes('aria-hidden')).toBe('true')
    })

    it('UPD-SET-02 Controlla ora dice l\'esito', async () => {
        const w = mount(TalosMobileSettingsUpdatesPanel)
        await w.get('[data-testid="talos-updates-check"]').trigger('click')
        await flushPromises()
        expect(azioni.controlla).toHaveBeenCalledTimes(1)
        expect(w.get('[data-testid="talos-updates-check-result"]').text()).toBe('TALOS is up to date.')
    })

    it('UPD-SET-03 con una versione pronta l\'azione è installarla, e apre il cassetto', async () => {
        talosApplicaStatoAggiornamenti({ fase: 'PRONTA', versione: '0.1.44', installata: '0.1.43' })
        const w = mount(TalosMobileSettingsUpdatesPanel)
        expect(w.find('[data-testid="talos-updates-check"]').exists()).toBe(false)
        await w.get('[data-testid="talos-updates-install"]').trigger('click')
        expect(talosSegnaleAggiornamento.aperto).toBe(true)
    })

    it('UPD-SET-05 «la sto scaricando» sparisce quando lo scaricamento è finito (visto sul Pad il 22/10 alle 22:41)', async () => {
        azioni.controlla.mockResolvedValueOnce('trovata' as never)
        talosApplicaStatoAggiornamenti({ installata: '0.1.43' })
        const w = mount(TalosMobileSettingsUpdatesPanel)
        await w.get('[data-testid="talos-updates-check"]').trigger('click')
        talosApplicaStatoAggiornamenti({ fase: 'IN_SCARICAMENTO', versione: '0.1.44' })
        await flushPromises()
        expect(w.get('[data-testid="talos-updates-check-result"]').text()).toBe('0.1.44 found: it is downloading now.')
        talosApplicaStatoAggiornamenti({ fase: 'PRONTA' })
        await flushPromises()
        expect(w.find('[data-testid="talos-updates-check-result"]').exists()).toBe(false)
        expect(w.get('[data-testid="talos-updates-install"]').text()).toBe('Install 0.1.44 and restart')
    })

    it('UPD-SET-04 Avanzate si apre a richiesta e mostra Wi-Fi, avviso e permesso', async () => {
        talosApplicaStatoAggiornamenti({ permessoConcesso: false, dimensione: 192749764 })
        const w = mount(TalosMobileSettingsUpdatesPanel)
        await w.get('[data-testid="talos-updates-advanced"]').trigger('click')
        expect(w.get('[data-testid="talos-updates-advanced"]').attributes('aria-expanded')).toBe('true')
        const corpo = w.get('[data-testid="talos-updates-advanced-body"]')
        expect(corpo.text()).toContain('Wi-Fi only')
        expect(corpo.text()).toContain('Notify me when it’s ready')
        expect(w.get('[data-testid="talos-updates-permission"]').text()).toContain('Not granted yet')
    })
})
