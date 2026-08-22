// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { talosComposerFlags } from '@/lib/composerStyle'

/**
 * Il selettore del modello si raggiunge in OGNI forma del compositore.
 *
 * Owner 2026-08-06: «deve essere messo per tutti i layout, mi sembra ovvio».
 *
 * La storia vale più della regola. Cercando sul OnePlus Pad 3 il chip del
 * modello per `data-testid`, il DOM ne restituiva zero — e la conclusione, che
 * ho riferito all'owner, è stata che sul tablet **non si potesse scegliere un
 * modello locale**. Sbagliata due volte:
 *
 * 1. nel compositore *classico* il selettore c'era già, ma come icona senza
 *    identificativo: cercandolo per nome non si trovava. Un comando che esiste
 *    e non si sa nominare è, per chiunque lo cerchi da fuori, un comando che
 *    non c'è — compresi i test.
 * 2. nel compositore *immersivo* la riga è collassata **a riposo** e riappare
 *    al tocco sul campo: guardavo il DOM di un compositore che nessuno stava
 *    usando.
 *
 * Questo test tiene fermo il fatto che conta: **nessuna forma può togliere la
 * capacità**. La forma è una preferenza di aspetto.
 */
describe('la forma del compositore non toglie il selettore del modello', () => {
    /**
     * Le tre forme esistenti, e cosa producono. Se domani ne nasce una quarta,
     * questo test non la conosce — ma il controllo qui sotto sul sorgente sì.
     */
    it.each([
        ['classic', 'menu'],
        ['drawer', 'menu'],
        ['compact', 'menu'],
    ] as const)('la forma %s produce una combinazione gestita', (shape, plus) => {
        const flags = talosComposerFlags(shape as never, plus as never)
        // Ogni forma cade in uno dei due rami del template: quello a cassetto
        // (`drawerMode`) o quello classico. Nessuna forma resta senza riga.
        expect(typeof flags.drawerMode).toBe('boolean')
        expect(typeof flags.immersiveComposer).toBe('boolean')
        // `compact` è l'unica immersiva, ed è quella che collassa A RIPOSO.
        expect(flags.immersiveComposer).toBe(shape === 'compact')
    })

    /**
     * Il controllo che avrebbe evitato l'errore: **entrambi** i rami del
     * template portano lo stesso gancio. Guarda il sorgente perché è lì che il
     * difetto viveva — un ramo lo aveva, l'altro no, e nessun test montava
     * entrambe le forme.
     */
    it('entrambi i rami del template portano lo stesso identificativo', async () => {
        const sorgente = await import('@/components/chat/TalosMobileComposer.vue?raw')
        const occorrenze = (sorgente.default.match(/talos-composer-model-chip/g) ?? []).length
        expect(occorrenze).toBeGreaterThanOrEqual(2)
    })
})
