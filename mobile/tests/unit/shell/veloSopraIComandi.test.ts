// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileImmersiveChrome from '@/components/shell/TalosMobileImmersiveChrome.vue'

/**
 * ⛔⛔ IL VELO DEVE ARRIVARE DOVE ARRIVANO I COMANDI.
 *
 * MISURATO sul Pad il 2026-08-10, viewport telefono:
 *
 * ```
 *   velo (sfumatura)      0 → 64 px
 *   «Apri menu»          40 → 88 px     ← 24 px di pulsante su fondo NUDO
 * ```
 *
 * Il velo aveva un'altezza scritta a mano (`h-[calc(4rem+…)]`) e i tondi
 * flottanti arrivavano più in basso: la loro parte finale stava direttamente
 * sopra il testo della conversazione. Nella cattura si legge «Cosa puoi
 * controllare sel mio telef…», col resto tagliato dal tondo di destra.
 *
 * ⛔ jsdom non fa layout, quindi qui NON si misurano pixel: si controlla la
 * FORMA che rende impossibile il difetto — il velo è `inset-0` di un
 * contenitore che avvolge la riga dei comandi, quindi eredita la loro altezza
 * vera. Un'altezza fissa può restare indietro; una che eredita, no.
 */
describe('l\'intestazione immersiva: il velo copre TUTTI i comandi', () => {
    function monta() {
        return mount(TalosMobileImmersiveChrome, {
            props: { activeTitle: 'Chat', busy: false, hideMenu: false },
            global: {
                stubs: {
                    TalosMobileNotificationBell: true,
                    TalosMobileDownloadCenterTrigger: true,
                    TalosMobileChatOptionsMenu: true,
                },
                mocks: { $t: (chiave: string) => chiave },
            },
        })
    }

    it('il velo NON ha un\'altezza propria scritta a mano', () => {
        const html = monta().html()
        /*
         * È esattamente la riga che ha causato il difetto. Se torna, il velo
         * può di nuovo finire prima dei pulsanti — e nessuno se ne accorge
         * finché non guarda il telefono.
         */
        expect(html, 'un\'altezza fissa non può seguire i comandi').not.toMatch(/h-\[calc\(\d+(\.\d+)?rem\s*\+\s*env\(safe-area-inset-top\)\)\]/)
    })

    it('⭐ il velo AVVOLGE la riga dei comandi: eredita la loro altezza', () => {
        const w = monta()
        const velo = w.find('[aria-hidden="true"].absolute.inset-0')
        expect(velo.exists(), 'il velo deve essere inset-0, non alto N').toBe(true)

        const menu = w.find('[data-testid="talos-shell-menu"]')
        expect(menu.exists()).toBe(true)

        // Stesso contenitore ⇒ stessa altezza, qualunque essa diventi.
        const contenitore = velo.element.parentElement
        expect(contenitore, 'il velo ha un contenitore').not.toBeNull()
        expect(
            contenitore!.contains(menu.element),
            'il pulsante del menu sta DENTRO ciò che il velo copre',
        ).toBe(true)
    })

    it('⛔ e il velo resta dietro: non ruba i tocchi ai comandi', () => {
        // Un velo che intercetta sarebbe il difetto al contrario — comandi
        // visibili e non premibili, che è come si è scoperto tutto questo.
        const w = monta()
        expect(w.attributes('class')).toContain('pointer-events-none')
        expect(w.find('[data-testid="talos-shell-menu"]').attributes('class'))
            .toContain('pointer-events-auto')
    })
})
