// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

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
    // Owner 27/10/2026, «Unico, tolgo le forme»: le tre forme e la loro traduzione in prop non esistono più (FORMA-01..04 in
    // formaUnica.test.ts). Resta il fatto che conta: la forma unica porta il selettore, e uno solo.
    /**
     * Il controllo che avrebbe evitato l'errore: **entrambi** i rami del
     * template portano lo stesso gancio. Guarda il sorgente perché è lì che il
     * difetto viveva — un ramo lo aveva, l'altro no, e nessun test montava
     * entrambe le forme.
     */
    it('la forma unica porta un solo selettore identificabile', async () => {
        const sorgente = await import('@/components/chat/TalosMobileComposer.vue?raw')
        const occorrenze = (sorgente.default.match(/talos-composer-model-chip/g) ?? []).length
        expect(occorrenze).toBe(1)
    })
})
