// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosModelFitBar from '@/components/talos/models/TalosModelFitBar.vue'

/**
 * Il mockup approvato dall'owner il 2026-08-04. Owner, mentre lo costruivo:
 * «ricorda di allineare lo stile al mockup che hai fatto, legato al nostro
 * theme engine — non puoi propormi una cosa e farmene una diversa».
 */
function barra(props: Record<string, unknown>) {
    return mount(TalosModelFitBar, { props: { tone: 'ok', ratio: 0.6, label: 'Ci sta', ...props } })
}

describe('la barra della capienza', () => {
    it('quando il modello sfora, il SEGNO della memoria libera finisce dentro', () => {
        /**
         * È la ragione per cui questa barra esiste. Un pieno che si ferma al
         * bordo dice «pieno»; un pieno che oltrepassa un segno dice «esce di
         * tanto così», e non c'è niente da leggere.
         */
        const dentro = barra({ tone: 'over', ratio: 1.4, label: 'Non ci sta' })
        const segno = dentro.find('[data-testid="talos-model-fit-mark"]')
        expect(segno.exists()).toBe(true)
        // A ratio 1.4 il disponibile finisce al ~71%: il segno sta lì, non in fondo.
        expect(segno.attributes('style')).toMatch(/left:\s*7[0-2]/)
    })

    it('quando manca una misura non inventa né barra né rapporto', () => {
        const sconosciuta = barra({ tone: 'unknown', ratio: null, label: 'Da verificare' })

        expect(sconosciuta.attributes('data-fit-tone')).toBe('unknown')
        expect(sconosciuta.find('[data-testid="talos-model-fit-track"]').exists()).toBe(false)
        expect(sconosciuta.text()).toContain('Da verificare')
    })

    it('quando ci sta, non c’è nessun segno da mostrare', () => {
        // Il limite è il bordo: disegnarci sopra una riga sarebbe rumore.
        expect(barra({ ratio: 0.6 }).find('[data-testid="talos-model-fit-mark"]').exists())
            .toBe(false)
    })

    it('i colori vengono dal THEME ENGINE, non da esadecimali', () => {
        /**
         * I token si invertono fra chiaro e scuro perché sono colori di primo
         * piano. Un colore fisso qui sarebbe illeggibile su metà dei temi.
         */
        for (const [tone, token] of [
            ['ok', 'success'],
            ['tight', 'warning'],
            ['over', 'danger'],
            ['unknown', 'muted'],
        ] as const) {
            const html = barra({ tone, ratio: 0.5 }).html()
            expect(html).toContain(`var(--talos-${token}`)
        }
    })

    it('una stima si DICHIARA, con la tilde', () => {
        // Una stima che si spaccia per misura è peggio di nessun numero.
        const stimata = barra({ size: '18,0 GB', estimated: true, tone: 'over', ratio: 1.5, label: 'Non ci sta' })
        expect(stimata.text()).toContain('~18,0 GB')
        expect(stimata.attributes('data-fit-estimated')).toBe('true')

        const misurata = barra({ size: '2,6 GB', estimated: false })
        expect(misurata.text()).toContain('2,6 GB')
        expect(misurata.text()).not.toContain('~')
    })
})
