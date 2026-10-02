// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const motore = vi.hoisted(() => ({
    talosAcceptNpuTerms: vi.fn(async (_locale: string) => ({ accepted: true, loaded: true })),
    talosWithdrawNpuTerms: vi.fn(async () => true),
}))
vi.mock('@/services/localEngine', () => motore)

const magazzino = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: vi.fn(async ({ key }: { key: string }) => ({ value: magazzino.get(key) ?? null })),
        set: vi.fn(async ({ key, value }: { key: string, value: string }) => { magazzino.set(key, value) }),
    },
}))

import TalosNpuTermsSheet from '@/components/talos/models/TalosNpuTermsSheet.vue'
import TalosMobileLocalBackendChoice from '@/components/talos/models/TalosMobileLocalBackendChoice.vue'

/**
 * ⛔ PKLA Qualcomm 2.1 b (owner, 01/10/2026) — l'NPU si accende solo dopo
 * un'accettazione esplicita del testo approvato: testo visibile prima, una
 * casella da spuntare, un pulsante che dice cosa succede («Accetto e accendo
 * l'NPU»). Chiudere o «Non ora» non accettano niente.
 */
describe('il foglio delle condizioni Qualcomm', () => {
    beforeEach(() => {
        motore.talosAcceptNpuTerms.mockClear()
    })
    afterEach(() => {
        document.body.innerHTML = ''
    })

    function apri() {
        return mount(TalosNpuTermsSheet, { attachTo: document.body })
    }
    const trova = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null

    it('NPU-UI-01 il testo approvato è a schermo, e senza la casella non si accetta', async () => {
        const vista = apri()
        await flushPromises()
        // Il testo approvato, nella lingua attiva (l'ambiente di prova è in inglese).
        expect(document.body.textContent).toMatch(/Software Qualcomm|Qualcomm Software/)
        expect(document.body.textContent).toMatch(/Leggi sull'esportazione\.|Export laws\./)
        const accetta = trova('talos-npu-terms-accept') as HTMLButtonElement
        expect(accetta.disabled).toBe(true)
        accetta.click()
        await flushPromises()
        expect(motore.talosAcceptNpuTerms).not.toHaveBeenCalled()
        vista.unmount()
    })

    it('NPU-UI-02 spuntata la casella, «Accetto e accendo l\'NPU» registra e lo dice', async () => {
        const vista = apri()
        await flushPromises()
        trova('talos-npu-terms-checkbox')!.click()
        await flushPromises()
        expect(trova('talos-npu-terms-checkbox')!.getAttribute('aria-checked')).toBe('true')
        trova('talos-npu-terms-accept')!.click()
        await flushPromises()
        expect(motore.talosAcceptNpuTerms).toHaveBeenCalledTimes(1)
        expect(vista.emitted('decide')?.[0]).toEqual(['accepted'])
        vista.unmount()
    })

    it('NPU-UI-03 «Non ora» non accetta niente', async () => {
        const vista = apri()
        await flushPromises()
        trova('talos-npu-terms-later')!.click()
        await flushPromises()
        expect(motore.talosAcceptNpuTerms).not.toHaveBeenCalled()
        expect(vista.emitted('decide')?.[0]).toEqual(['later'])
        vista.unmount()
    })

    it('NPU-UI-04 se il registro non si scrive, il foglio resta aperto e lo dice', async () => {
        motore.talosAcceptNpuTerms.mockResolvedValueOnce({ accepted: false, loaded: false })
        const vista = apri()
        await flushPromises()
        trova('talos-npu-terms-checkbox')!.click()
        await flushPromises()
        trova('talos-npu-terms-accept')!.click()
        await flushPromises()
        expect(vista.emitted('decide')).toBeUndefined()
        expect(trova('talos-npu-terms-error')).not.toBeNull()
        vista.unmount()
    })
})

describe('la riga Hexagon con le condizioni da accettare', () => {
    const DISPOSITIVI = [
        { registry: 'CPU', name: 'CPU', canOffload: false },
        { registry: 'OpenCL', name: 'QUALCOMM Adreno(TM) 830', canOffload: true },
    ]

    it('NPU-UI-05 NPU nell\'app ma condizioni non accettate: la riga non dice «qui non c\'è», chiede di accettare', async () => {
        const vista = mount(TalosMobileLocalBackendChoice, {
            props: { devices: DISPOSITIVI, inUse: null, quantisation: 'Q4_K_M', npu: { installed: true, accepted: false } },
        })
        await flushPromises()
        const riga = vista.find('[data-testid="talos-backend-choice-hexagon"]')
        expect((riga.element as HTMLButtonElement).disabled).toBe(false)
        expect(riga.text()).toMatch(/accetta le condizioni|accept the terms/)
        await riga.trigger('click')
        expect(vista.emitted('openNpuTerms')).toHaveLength(1)
    })

    it('NPU-UI-06 senza NPU nell\'app resta «qui non c\'è», come prima', async () => {
        const vista = mount(TalosMobileLocalBackendChoice, {
            props: { devices: DISPOSITIVI, inUse: null, quantisation: 'Q4_K_M', npu: { installed: false, accepted: false } },
        })
        await flushPromises()
        const riga = vista.find('[data-testid="talos-backend-choice-hexagon"]')
        expect((riga.element as HTMLButtonElement).disabled).toBe(true)
        expect(vista.emitted('openNpuTerms')).toBeUndefined()
    })
})
