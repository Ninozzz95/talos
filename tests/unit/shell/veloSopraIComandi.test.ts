// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/*
 * ⛔⛔ I TRE FIGLI SI SOSTITUISCONO ALLA RADICE, non con uno stub per nome.
 *
 * Il guscio li carica con `defineAsyncComponent(() => import(...))`, e sono
 * LEGAMI LOCALI del `<script setup>`: `global.stubs` per nome non li tocca, il
 * caricamento parte lo stesso e atterra **dopo** che Vitest ha smontato
 * l'ambiente —
 *
 *     EnvironmentTeardownError: Cannot load '/src/stores/notificationCentre.ts'
 *     … after the environment was torn down
 *
 * Sei rejection da un file solo, con zero test falliti: la suite esce 1 e il
 * rumore nasconde un fallimento vero (compito #57). E `flushPromises()` da solo
 * non basta, perché i figli caricano a loro volta: ne restavano due.
 *
 * ⇒ `vi.mock` sul MODULO: l'import dinamico si risolve dal registro, non dal
 * disco. Niente corsa, niente caricamento a cascata, e la prova resta su ciò
 * che deve provare — il velo e i comandi veri.
 */
/*
 * ⛔ `render: () => null` e NON `template`: un modello va compilato a
 * runtime, e il compilatore nel pacchetto di prova non c'è. È la stessa
 * forma già usata in `TalosMobileToolSheet.test.ts`, che questo difetto
 * l'aveva già pagato — con la misura: renderli sincroni per far tacere una
 * prova costerebbe 60 KB nel grafo d'avvio, che ha 57 byte di margine.
 */
const finto = (name: string) => ({ __esModule: true, default: { name, render: () => null } })
vi.mock('@/components/shell/TalosMobileNotificationBell.vue', () => finto('TalosMobileNotificationBell'))
vi.mock('@/components/shell/TalosMobileDownloadCenterTrigger.vue', () => finto('TalosMobileDownloadCenterTrigger'))
vi.mock('@/components/shell/TalosMobileChatOptionsMenu.vue', () => finto('TalosMobileChatOptionsMenu'))

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
    /*
     * ⛔ `await flushPromises()` NON è cerimonia.
     *
     * Il guscio carica tre figli con `defineAsyncComponent(() => import(...))`.
     * Il caricamento parte al primo disegno e **atterra dopo** la fine del
     * test: Vitest ha già smontato l'ambiente e alza
     * `EnvironmentTeardownError: Cannot load … after the environment was torn
     * down`. Sei rejection da un file solo, e la suite intera esce 1 pur avendo
     * zero test falliti — rumore che nasconde un fallimento vero (compito #57).
     *
     * ⇒ Si aspetta che le promesse posino DENTRO l'ambiente. Gli stub per nome
     * non bastano: quei componenti sono legami locali del `<script setup>`, non
     * registrazioni globali.
     */
    async function monta() {
        const w = mount(TalosMobileImmersiveChrome, {
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
        await flushPromises()
        return w
    }

    it('il velo NON ha un\'altezza propria scritta a mano', async () => {
        const html = (await monta()).html()
        /*
         * È esattamente la riga che ha causato il difetto. Se torna, il velo
         * può di nuovo finire prima dei pulsanti — e nessuno se ne accorge
         * finché non guarda il telefono.
         */
        expect(html, 'un\'altezza fissa non può seguire i comandi').not.toMatch(/h-\[calc\(\d+(\.\d+)?rem\s*\+\s*env\(safe-area-inset-top\)\)\]/)
    })

    it('⭐ il velo AVVOLGE la riga dei comandi: eredita la loro altezza', async () => {
        const w = await monta()
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

    it('⛔ e il velo resta dietro: non ruba i tocchi ai comandi', async () => {
        // Un velo che intercetta sarebbe il difetto al contrario — comandi
        // visibili e non premibili, che è come si è scoperto tutto questo.
        const w = await monta()
        expect(w.attributes('class')).toContain('pointer-events-none')
        expect(w.find('[data-testid="talos-shell-menu"]').attributes('class'))
            .toContain('pointer-events-auto')
    })
})
