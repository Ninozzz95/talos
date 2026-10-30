// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTalosI18n } from '@/i18n'
import TalosCodiceR4FermaAgente from '@/components/codice/TalosCodiceR4FermaAgente.vue'

/* «Ferma» nella scheda Agenti: il pezzo a schermo. Spostato in `tests/unit/codice/fermaAgenteR4Pezzi.test.ts` cambia solo l'import. */
type Composer = { locale: { value: string } }
let lingua = 'en'
beforeAll(async () => {
    const global = (await createTalosI18n()).global as unknown as Composer
    lingua = global.locale.value
    global.locale.value = 'it'
})
afterAll(async () => { ((await createTalosI18n()).global as unknown as Composer).locale.value = lingua })

describe('FA-P — la conferma e l’esito nella riga', () => {
    it('FA-P-01 la conferma: domanda, conseguenza, «Annulla» a sinistra e «Ferma la delega» rosso a destra; i tocchi escono', async () => {
        const r = mount(TalosCodiceR4FermaAgente, { props: { stato: { conferma: true, esito: null }, nome: 'Esegui i test' } })
        const gruppo = r.get('[data-testid="talos-codice-r4-agente-conferma"]')
        expect(gruppo.attributes('role')).toBe('group')
        expect(gruppo.text()).toContain('Fermare questa delega?')
        expect(gruppo.text()).toContain('Il lavoro già fatto resta al suo posto. Quello in corso no: il giro si interrompe dove è arrivato.')
        const pulsanti = gruppo.findAll('button')
        expect(pulsanti.map((b) => b.text())).toEqual(['Annulla', 'Ferma la delega'])
        expect(pulsanti[1]!.classes()).toEqual(expect.arrayContaining(['bg-[var(--talos-danger-soft)]', 'text-[var(--talos-danger)]', 'min-h-touch']))
        expect(pulsanti[1]!.attributes('aria-label')).toBe('Ferma la delega: Esegui i test')
        await pulsanti[0]!.trigger('click'); await pulsanti[1]!.trigger('click')
        expect(Object.keys(r.emitted())).toEqual(expect.arrayContaining(['annulla', 'conferma']))
    })
    it('FA-P-02 «Lo fermo…» senza secondi nei primi 2 s; poi «Fermato», «Aveva già finito», il perché', async () => {
        const r = mount(TalosCodiceR4FermaAgente, { props: { stato: { conferma: false, esito: { tipo: 'in-corso', dal: Date.now() } }, nome: 'x' } })
        expect(r.get('[data-testid="talos-riga-in-corso"]').attributes('aria-label')).toBe('Lo fermo…')
        await r.setProps({ stato: { conferma: false, esito: { tipo: 'fatto' } } })
        expect(r.get('[data-testid="talos-codice-r4-agente-esito"]').text()).toBe('Fermato')
        await r.setProps({ stato: { conferma: false, esito: { tipo: 'gia-finito' } } })
        expect(r.get('[data-testid="talos-codice-r4-agente-esito"]').text()).toBe('Aveva già finito: niente da fermare')
        await r.setProps({ stato: { conferma: false, esito: { tipo: 'errore', messaggio: 'r4 non risponde' } } })
        expect(r.get('[data-testid="talos-codice-r4-agente-esito"]').attributes('role')).toBe('alert')
        await r.setProps({ stato: { conferma: false, esito: null } })
        expect(r.html()).not.toContain('talos-codice-r4-agente')
    })
})
