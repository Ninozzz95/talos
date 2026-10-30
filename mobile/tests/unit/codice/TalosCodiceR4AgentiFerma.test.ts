// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTalosI18n } from '@/i18n'
import { __resetTalosOverlayBackForTests } from '@/composables/useTalosOverlayBack'
import TalosCodiceR4Agenti from '@/components/codice/TalosCodiceR4Agenti.vue'
import type { AgenteDelPannelloR4 } from '@/lib/harness/r4/agentiR4'

/*
 * ⛔ «Ferma» nella scheda Agenti (owner 29/10 notte; scheda `mockup/ferma-agente/pezzi/SCHEDA-DI-CONSEGNA.md`, voce 3 e «Correzioni»;
 * ledger `LEDGER-FERMA-TUTTO-MOBILE-2026-10-29.md`, riga 14): la riga diventa un contenitore col pulsante che apre la conversazione (lo
 * stesso contenuto, `data-sessione-figlia` e `data-stato` invariati) e accanto i tre puntini dell'app, solo sui vivi, con la sola voce
 * «Ferma questa delega»; sotto, la conferma nella riga e l'esito (`TalosCodiceR4FermaAgente`). Una sezione con la conferma aperta resta
 * aperta quando arriva una richiesta più nuova.
 */
type Composer = { locale: { value: string } }
let lingua = 'en'
beforeAll(async () => {
    const global = (await createTalosI18n()).global as unknown as Composer
    lingua = global.locale.value
    global.locale.value = 'it'
})
afterAll(async () => {
    ((await createTalosI18n()).global as unknown as Composer).locale.value = lingua
})
beforeEach(() => {
    document.body.innerHTML = ''
    __resetTalosOverlayBackForTests()
})

const richiesta = (id: string, at: string, corrente: boolean) => ({ id, at, testo: `Richiesta ${id}`, corrente })
const agente = (sessionId: string, campi: Record<string, unknown> = {}): AgenteDelPannelloR4 => ({
    sessionId, padreId: 'chat', taskCorto: `Compito ${sessionId}`, nome: `Agente ${sessionId}`, numeroFigli: 0, richiesta: null, conclusa: false, ...campi,
} as AgenteDelPannelloR4)

type Esito = { ok: true } | { ok: false; messaggio?: string | null }
function scheda(agenti: AgenteDelPannelloR4[], ferma: (id: string) => Promise<Esito> = async () => ({ ok: true })) {
    return mount(TalosCodiceR4Agenti, { props: { agenti, errore: null, ferma }, attachTo: document.body })
}
const voci = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
async function apriConferma(w: ReturnType<typeof scheda>, id: string): Promise<void> {
    await w.get(`[data-testid="talos-codice-r4-agente-azioni-${id}"]`).trigger('click')
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="talos-codice-r4-agente-menu-ferma"]')!.click()
    await flushPromises()
}

describe('AGENTI-FERMA — «Ferma» nella scheda Agenti', () => {
    it('AGENTI-FERMA-01 i tre puntini solo sui vivi (al lavoro, aspetta te), con la sola voce «Ferma questa delega»; finiti e in pausa no', async () => {
        const w = scheda([
            agente('vivo'),
            agente('aspetta', { inAttesaApprovazione: true }),
            agente('finito', { conclusa: true }),
            agente('pausa', { conclusa: true, esitoDelega: 'in-pausa' }),
            agente('fermato', { interrotta: true }),
        ])
        const puntini = (id: string) => w.find(`[data-testid="talos-codice-r4-agente-azioni-${id}"]`).exists()
        expect(['vivo', 'aspetta', 'finito', 'pausa', 'fermato'].map(puntini)).toEqual([true, true, false, false, false])
        await w.get('[data-testid="talos-codice-r4-agente-azioni-vivo"]').trigger('click')
        await flushPromises()
        expect(voci().map((v) => v.textContent?.trim())).toEqual(['Ferma questa delega'])
        w.unmount()
    })

    it('AGENTI-FERMA-02 la conferma nella riga; «Ferma la delega» manda UNA richiesta, «Lo fermo…», poi «Fermato»', async () => {
        let fatto: (e: Esito) => void = () => {}
        const ferma = vi.fn(() => new Promise<Esito>((r) => { fatto = r }))
        const w = scheda([agente('vivo'), agente('altro')], ferma)
        await apriConferma(w, 'vivo')
        const conferma = w.get('[data-testid="talos-codice-r4-agente-conferma"]')
        expect(conferma.text()).toContain('Fermare questa delega?')
        await w.get('[data-testid="talos-codice-r4-agente-ferma"]').trigger('click')
        expect(w.find('[data-testid="talos-codice-r4-agente-conferma"]').exists()).toBe(false)
        expect(w.get('[data-testid="talos-codice-r4-agente-in-corso"]').text()).toContain('Lo fermo…')
        // un secondo tocco sui tre puntini non riapre niente e non manda una seconda richiesta
        await apriConferma(w, 'vivo')
        expect(ferma).toHaveBeenCalledTimes(1)
        expect(ferma).toHaveBeenCalledWith('vivo')
        fatto({ ok: true })
        await flushPromises()
        expect(w.get('[data-testid="talos-codice-r4-agente-esito"]').text()).toBe('Fermato')
        // l'altro agente non è toccato
        expect(w.findAll('[data-testid="talos-codice-r4-agente-esito"]')).toHaveLength(1)
        w.unmount()
    })

    it('AGENTI-FERMA-02b «Annulla» chiude senza mandare niente; un rifiuto dice «Delega non fermata»', async () => {
        const ferma = vi.fn(async (): Promise<Esito> => ({ ok: false, messaggio: null }))
        const w = scheda([agente('vivo')], ferma)
        await apriConferma(w, 'vivo')
        await w.get('[data-testid="talos-codice-r4-agente-annulla"]').trigger('click')
        expect(w.find('[data-testid="talos-codice-r4-agente-conferma"]').exists()).toBe(false)
        expect(ferma).not.toHaveBeenCalled()
        await apriConferma(w, 'vivo')
        await w.get('[data-testid="talos-codice-r4-agente-ferma"]').trigger('click')
        await flushPromises()
        const esito = w.get('[data-testid="talos-codice-r4-agente-esito"]')
        expect([esito.attributes('role'), esito.text()]).toEqual(['alert', 'Delega non fermata'])
        w.unmount()
    })

    it('AGENTI-FERMA-03 l’agente finisce da solo con la conferma aperta: si chiude e dice «Aveva già finito: niente da fermare»', async () => {
        const ferma = vi.fn(async (): Promise<Esito> => ({ ok: true }))
        const w = scheda([agente('vivo')], ferma)
        await apriConferma(w, 'vivo')
        await w.setProps({ agenti: [agente('vivo', { conclusa: true })] })
        expect(w.find('[data-testid="talos-codice-r4-agente-conferma"]').exists()).toBe(false)
        expect(w.get('[data-testid="talos-codice-r4-agente-esito"]').text()).toBe('Aveva già finito: niente da fermare')
        expect(w.find('[data-testid="talos-codice-r4-agente-azioni-vivo"]').exists()).toBe(false)
        expect(ferma).not.toHaveBeenCalled()
        w.unmount()
    })

    it('AGENTI-FERMA-04 una sezione con la conferma aperta resta aperta quando arriva una richiesta più nuova; la persona la richiude', async () => {
        const r1 = richiesta('r1', '2026-10-29T20:00:00.000Z', false)
        const prima = [agente('a', { richiesta: r1 }), agente('b', { richiesta: r1 })]
        const w = scheda([...prima, agente('z', { richiesta: richiesta('r0', '2026-10-29T19:00:00.000Z', false), conclusa: true })])
        expect(w.get('[data-richiesta-id="r1"]').attributes('aria-expanded')).toBe('true')
        await apriConferma(w, 'a')
        const nuova = richiesta('r2', '2026-10-29T21:00:00.000Z', true)
        await w.setProps({ agenti: [...prima, agente('z', { richiesta: richiesta('r0', '2026-10-29T19:00:00.000Z', false), conclusa: true }), agente('c', { richiesta: nuova })] })
        expect(w.get('[data-richiesta-id="r2"]').attributes('aria-expanded')).toBe('true')
        expect(w.get('[data-richiesta-id="r1"]').attributes('aria-expanded')).toBe('true')
        expect(w.find('[data-testid="talos-codice-r4-agente-conferma"]').exists()).toBe(true)
        await w.get('[data-richiesta-id="r1"]').trigger('click')
        expect(w.get('[data-richiesta-id="r1"]').attributes('aria-expanded')).toBe('false')
        w.unmount()
    })

    it('AGENTI-FERMA-05 il tocco sul contenuto apre ancora la conversazione; `data-sessione-figlia` e `data-stato` stanno sul pulsante di sempre', async () => {
        const w = scheda([agente('vivo')])
        const riga = w.get('[data-sessione-figlia="vivo"]')
        expect(riga.element.tagName).toBe('BUTTON')
        expect(riga.attributes('data-stato')).toBe('in-corso')
        expect(riga.attributes('aria-label')).toBe('Apri la conversazione di: Agente vivo')
        await riga.trigger('click')
        expect(w.emitted('apri')).toEqual([['vivo']])
        // la riga è il riquadro di sempre, ora un contenitore
        expect(w.get('li.talos-codice-r4-agente').find('[data-sessione-figlia="vivo"]').exists()).toBe(true)
        w.unmount()
    })
})
