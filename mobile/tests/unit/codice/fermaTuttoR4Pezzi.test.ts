// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTalosI18n } from '@/i18n'
import TalosCodiceR4FermaTuttoScelte from '@/components/codice/TalosCodiceR4FermaTuttoScelte.vue'
import TalosCodiceR4FiglieFermate from '@/components/codice/TalosCodiceR4FiglieFermate.vue'
import TalosMobileSettingsStopAgenti from '@/components/talos/settings/TalosMobileSettingsStopAgenti.vue'

/*
 * «Ferma tutto» (owner 29/10/2026): i tre pezzi a schermo. Spostati in `tests/unit/codice/fermaTuttoR4Pezzi.test.ts` cambiano solo gli import.
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

describe('FT-UI-P — il corpo del foglio', () => {
    it('FT-UI-P-01 «Ferma tutto» per primo, pieno, con «La chat e N agenti»; «Ferma solo la chat» col bordo', () => {
        const f = mount(TalosCodiceR4FermaTuttoScelte, { props: { quante: 3 } })
        const pulsanti = f.findAll('button')
        expect(pulsanti.map((b) => b.text())).toEqual(['Ferma tutto', 'Ferma solo la chat', 'Ricorda la scelta'])
        expect(pulsanti[0]!.classes()).toContain('bg-[var(--talos-accent)]')
        expect(pulsanti[1]!.classes()).toContain('border')
        expect(f.text()).toContain('La chat e 3 agenti')
        expect(f.text()).toContain('Gli agenti continuano; li fermi dalla scheda Agenti')
        for (const b of pulsanti.slice(0, 2)) expect(f.get(`#${b.attributes('aria-describedby')}`).exists()).toBe(true)
    })
    it('FT-UI-P-02 un tocco manda la scelta, con la casella com’è', async () => {
        const f = mount(TalosCodiceR4FermaTuttoScelte, { props: { quante: 1 } })
        expect(f.text()).toContain('La chat e 1 agente')
        await f.get('[data-testid="talos-codice-r4-ferma-tutto-solo-chat"]').trigger('click')
        const casella = f.get('[data-testid="talos-codice-r4-ferma-tutto-ricorda"]')
        expect(casella.attributes('role')).toBe('checkbox')
        expect(casella.attributes('aria-checked')).toBe('false')
        await casella.trigger('click')
        expect(casella.attributes('aria-checked')).toBe('true')
        await f.get('[data-testid="talos-codice-r4-ferma-tutto-tutte"]').trigger('click')
        expect(f.emitted('scegli')).toEqual([['solo-chat', false], ['tutte', true]])
    })
})

describe('FT-UI-P — la riga della chat', () => {
    it('FT-UI-P-03 «Fermati anche 3 agenti» e la coda; «dal modello» solo quando l’ha fatto il modello', () => {
        const persona = mount(TalosCodiceR4FiglieFermate, { props: { voce: { quante: 3, ids: ['a', 'b', 'c'], da: 'persona', chatFerma: false } } })
        expect(persona.get('[data-parte="cosa"]').text()).toBe('Fermati anche 3 agenti')
        expect(persona.get('[data-parte="perche"]').text()).toBe('I loro risultati restano in coda e partono col tuo prossimo messaggio')
        expect(persona.find('[data-parte="da"]').exists()).toBe(false)
        expect(persona.get('section').attributes('role')).toBe('status')
        const modello = mount(TalosCodiceR4FiglieFermate, { props: { voce: { quante: 1, ids: ['a'], da: 'modello', chatFerma: false } } })
        expect(modello.get('[data-parte="cosa"]').text()).toBe('Fermato 1 agente')
        const aChatFerma = mount(TalosCodiceR4FiglieFermate, { props: { voce: { quante: 2, ids: ['a', 'b'], da: 'persona', chatFerma: true } } })
        expect(aChatFerma.get('[data-parte="cosa"]').text()).toBe('Fermati 2 agenti')
        expect(aChatFerma.get('[data-parte="perche"]').text()).toBe('I loro risultati restano in coda e partono col tuo prossimo messaggio')
        expect(modello.get('[data-parte="da"]').text()).toBe('Fermati dal modello su richiesta')
    })
})

describe('FT-UI-P — le Impostazioni', () => {
    it('FT-UI-P-04 tre scelte in un gruppo radio, la scelta col ✓, il tocco la cambia', async () => {
        const s = mount(TalosMobileSettingsStopAgenti, { props: { modelValue: 'tutte' } })
        const radio = s.findAll('[role="radio"]')
        expect(radio.map((r) => r.text())).toEqual(['Chiedi ogni volta', 'Ferma tutto', 'Ferma solo la chat'])
        expect(radio.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'true', 'false'])
        expect(radio.map((r) => r.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
        expect(s.text()).toContain('Stop con agenti al lavoro')
        await radio[0]!.trigger('click')
        expect(s.emitted('update:modelValue')).toEqual([['chiedi']])
        await s.get('[role="radiogroup"]').trigger('keydown', { key: 'ArrowDown' })
        expect(s.emitted('update:modelValue')!.at(-1)).toEqual(['solo-chat'])
    })
})
