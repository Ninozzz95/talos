// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileToastRegion from '@/components/shell/TalosMobileToastRegion.vue'
import { __resetToastsForTests, useTalosMobileToasts } from '@/stores/toasts'

/*
 * ⛔ AVVISO-INERTE (Pad, 27/10/2026, prova dal vivo di IMPOSTAZIONE-RIFIUTATA sulla 4177): con un foglio aperto la radice dell'app
 * (`#app`) è `inert` (modalità SF-7 di `TalosMobileComposerSheet`), e la regione degli avvisi ci stava DENTRO. L'avviso si disegnava
 * sopra il foglio ma non si toccava: `elementFromPoint` al centro di «Chiedi al computer» dava la riga del modello sotto, e un tocco
 * avrebbe scelto quel modello. Vale per ogni avviso con un'azione mentre un foglio è aperto. Cura: la regione va nel `body`, fuori dalla
 * radice resa inerte, come i fogli (Desktop 27/10, OK). jsdom non fa l'hit-test di `inert`: qui si prova dove sta la regione.
 */
describe('la regione degli avvisi resta toccabile sopra un foglio aperto (AVVISO-INERTE)', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        __resetToastsForTests()
    })

    it('AVV-INERTE-01 con la radice dell’app resa inerte, la regione degli avvisi non sta dentro `[inert]`', async () => {
        const radice = document.createElement('div')
        radice.id = 'app'
        document.body.appendChild(radice)
        const w = mount(TalosMobileToastRegion, { attachTo: radice })
        useTalosMobileToasts().push({ message: 'Preferenza non salvata.', action: { label: 'Chiedi al computer', run: () => {} } })
        await flushPromises()
        radice.setAttribute('inert', '')
        const regione = document.querySelector('[data-testid="talos-mobile-toasts"]')
        expect(regione, 'la regione c’è').toBeTruthy()
        expect(regione!.closest('[inert]')).toBeNull()
        expect(document.querySelector('[data-testid="talos-toast-action"]')!.closest('[inert]')).toBeNull()
        w.unmount()
    })
})
