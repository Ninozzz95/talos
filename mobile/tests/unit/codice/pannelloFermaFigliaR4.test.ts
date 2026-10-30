// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { __resetTalosOverlayBackForTests } from '@/composables/useTalosOverlayBack'
import { creaPannelloR4 } from '@/lib/harness/r4/pannelloR4'
import TalosCodiceR4Pannello from '@/components/codice/TalosCodiceR4Pannello.vue'

/*
 * ⛔ «Ferma» nella scheda Agenti (owner 29/10 notte; scheda `mockup/ferma-agente/pezzi/SCHEDA-DI-CONSEGNA.md`, voce 3): la scheda riceve lo
 * Stop di una figlia dal pannello, come oggi l'azione dei Processi; dopo la risposta il pannello rilegge figli ed elenco (come il PC,
 * `caricaFigliSessione`). Il numero accanto ad «Agenti» conta TUTTI i vivi, anche chi aspetta te (owner).
 */
afterEach(() => { document.body.innerHTML = ''; __resetTalosOverlayBackForTests() })

function monta(fermaFiglia?: (id: string) => Promise<{ ok: true } | { ok: false; messaggio: string | null }>) {
    const caricaSessioni = vi.fn(async () => [{ sessionId: 'r', conclusa: true }])
    const caricaFigli = vi.fn(async () => [
        { sessionId: 'f1', padreId: 'r', conclusa: false, taskCorto: 'Esegui i test' },
        { sessionId: 'f2', padreId: 'r', conclusa: false, inAttesaApprovazione: true, taskCorto: 'Scrivi le note' },
        { sessionId: 'f3', padreId: 'r', conclusa: true, taskCorto: 'Leggi il changelog' },
    ])
    const w = mount(TalosCodiceR4Pannello, { attachTo: document.body, props: {
        pannello: creaPannelloR4(), caricaPolitica: async () => null, caricaCache: async () => null, giriFiniti: 0, azioneProcesso: vi.fn(),
        caricaRisorse: vi.fn(async () => null), caricaSessioni, caricaFigli, sessioneId: 'r', ...(fermaFiglia ? { fermaFiglia } : {}),
    } as never })
    return { w, caricaSessioni, caricaFigli }
}

describe('PAN-FERMA — lo Stop di una figlia dal pannello', () => {
    it('PAN-FERMA-01 il numero conta i vivi (2: al lavoro e in attesa); «Ferma» chiama lo Stop della figlia e poi rilegge', async () => {
        const fermaFiglia = vi.fn(async () => ({ ok: true as const }))
        const { w, caricaSessioni, caricaFigli } = monta(fermaFiglia)
        await flushPromises()
        await w.get('[data-scheda="agenti"]').trigger('click')
        expect(w.get('[data-testid="talos-codice-r4-agenti-numero"]').text()).toBe('2')
        expect(w.find('[data-testid="talos-codice-r4-agente-azioni-f3"]').exists()).toBe(false)
        await w.get('[data-testid="talos-codice-r4-agente-azioni-f1"]').trigger('click')
        await flushPromises()
        document.querySelector<HTMLElement>('[data-testid="talos-codice-r4-agente-menu-ferma"]')!.click()
        await flushPromises()
        const letture = caricaFigli.mock.calls.length
        await w.get('[data-testid="talos-codice-r4-agente-ferma"]').trigger('click')
        await flushPromises()
        expect(fermaFiglia).toHaveBeenCalledWith('f1')
        expect(caricaFigli.mock.calls.length).toBeGreaterThan(letture)
        expect(caricaSessioni.mock.calls.length).toBeGreaterThan(1)
        expect(w.get('[data-testid="talos-codice-r4-agente-esito"]').text()).toBe('Stopped')
        w.unmount()
    })
    it('PAN-FERMA-02 senza lo Stop della figlia (chi monta il pannello come prima) niente tre puntini', async () => {
        const { w } = monta()
        await flushPromises()
        await w.get('[data-scheda="agenti"]').trigger('click')
        expect(w.findAll('[data-testid^="talos-codice-r4-agente-azioni-"]')).toHaveLength(0)
        w.unmount()
    })
})
