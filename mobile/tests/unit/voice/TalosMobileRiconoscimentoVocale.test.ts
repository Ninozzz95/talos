// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import TalosMobileRiconoscimentoVocale from '@/components/talos/settings/TalosMobileRiconoscimentoVocale.vue'

enableAutoUnmount(afterEach)

/**
 * N12 (mobile, 13/10/2026) — la voce «Riconoscimento vocale sul dispositivo» nelle Impostazioni: scaricare (~670 MB) e
 * togliere il modello Parakeet. Decisione dell'owner del 12/10: scaricato al primo uso. Dice solo cose vere: «pronto»
 * quando lo conferma il motore, il progresso quello del trasferimento, il costo in chiaro.
 */
function servizio(iniziale: boolean) {
    let pronto = iniziale
    let avanza: (p: unknown) => void = () => {}
    let chiudi: (v: unknown) => void = () => {}
    return {
        avanza: (p: unknown) => avanza(p),
        chiudi: (esito: { ok: boolean, motivo?: string }) => { if (esito.ok) pronto = true; chiudi(esito) },
        pronto: vi.fn(async () => pronto),
        installa: vi.fn((onProgress: (p: unknown) => void) => { avanza = onProgress; return new Promise<any>((ok) => { chiudi = ok }) }),
        rimuovi: vi.fn(async () => { pronto = false; return 4 }),
    }
}
const t = (w: ReturnType<typeof mount>, id: string) => w.find(`[data-testid="${id}"]`)

describe('N12 — «Riconoscimento vocale sul dispositivo» nelle Impostazioni', () => {
    it('N12-IMP-01: senza modello dice che non c è, quanto pesa e quanta memoria usa; il pulsante scarica e mostra il progresso vero', async () => {
        const s = servizio(false)
        const w = mount(TalosMobileRiconoscimentoVocale, { props: { servizio: s } })
        await flushPromises()
        expect(t(w, 'talos-voice-recognition-status').text()).toBe('Not downloaded')
        expect(w.text()).toContain('670 MB')
        expect(w.text()).toContain('1 GB')
        expect(t(w, 'talos-voice-recognition-download').text()).toBe('Download (670 MB)')
        await t(w, 'talos-voice-recognition-download').trigger('click')
        expect(t(w, 'talos-voice-recognition-download').attributes('disabled')).toBeDefined()
        s.avanza({ fase: 'scarico', fatti: 335_000_000, totali: 670_000_000 })
        await flushPromises()
        expect(t(w, 'talos-voice-recognition-progress').text()).toBe('Downloading: 50%')
        s.chiudi({ ok: true })
        await flushPromises()
        expect(t(w, 'talos-voice-recognition-status').text()).toBe('Ready on this device')
        expect(t(w, 'talos-voice-recognition-download').exists()).toBe(false)
    })

    it('N12-IMP-02: uno scaricamento che fallisce lo dice col suo motivo, e si può riprovare; «pronto» resta falso', async () => {
        const s = servizio(false)
        const w = mount(TalosMobileRiconoscimentoVocale, { props: { servizio: s } })
        await flushPromises()
        await t(w, 'talos-voice-recognition-download').trigger('click')
        s.chiudi({ ok: false, motivo: 'not-verified' })
        await flushPromises()
        expect(t(w, 'talos-voice-recognition-error').text()).toContain('not-verified')
        expect(t(w, 'talos-voice-recognition-status').text()).toBe('Not downloaded')
        expect(t(w, 'talos-voice-recognition-download').attributes('disabled')).toBeUndefined()
    })

    it('N12-IMP-03: col modello pronto si può togliere, con conferma e due azioni una sotto l altra; «Keep it» non toglie niente', async () => {
        const s = servizio(true)
        const w = mount(TalosMobileRiconoscimentoVocale, { props: { servizio: s } })
        await flushPromises()
        expect(t(w, 'talos-voice-recognition-status').text()).toBe('Ready on this device')
        await t(w, 'talos-voice-recognition-remove').trigger('click')
        expect(t(w, 'talos-voice-recognition-confirm').classes()).toContain('flex-col')
        await t(w, 'talos-voice-recognition-remove-no').trigger('click')
        expect(s.rimuovi).not.toHaveBeenCalled()
        await t(w, 'talos-voice-recognition-remove').trigger('click')
        await t(w, 'talos-voice-recognition-remove-yes').trigger('click')
        await flushPromises()
        expect(s.rimuovi).toHaveBeenCalledTimes(1)
        expect(t(w, 'talos-voice-recognition-status').text()).toBe('Not downloaded')
    })
})
