// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Barra from '@/components/chat/TalosMobileDictationBar.vue'

/**
 * ⭐ LA BARRA DELLA DETTATURA — owner 2026-08-10, con lo screenshot di Claude.
 *
 * ⛔ Questi casi stavano nei test del COMPOSITORE, e ci stavano male: la barra è
 * diventata un componente caricato al bisogno (fuori dal grafo d'avvio), e da
 * lì dentro si provava soltanto che una promessa non si era ancora risolta. Un
 * componente si prova dove vive.
 */
const monta = (props: Partial<{
    avvio: boolean; livello: number; trascrizione: string; bozza: string
}> = {}) => mount(Barra, {
    props: { avvio: false, livello: 0.5, trascrizione: '', bozza: '', ...props },
    global: { mocks: { $t: (k: string) => k } },
})

describe('⭐ la barra della dettatura', () => {
    it('⛔ LE PAROLE MENTRE LE DICI: la trascrizione viva si vede', () => {
        // Il difetto era invisibile: le parziali finivano nella bozza, ma la
        // bozza durante la dettatura è NASCOSTA. Si parlava al buio.
        const w = monta({ trascrizione: 'accendi la torcia' })
        expect(w.get('[data-testid="talos-dictation-transcript"]').text())
            .toBe('accendi la torcia')
    })

    it('e finché non si è detto niente non c\'è nessuna riga vuota che balla', () => {
        expect(monta().find('[data-testid="talos-dictation-transcript"]').exists()).toBe(false)
    })

    it('⛔ TRE comandi distinti, e ognuno emette il SUO', async () => {
        const w = monta({ trascrizione: 'ciao' })
        await w.get('[data-testid="talos-dictation-discard"]').trigger('click')
        await w.get('[data-testid="talos-dictation-keep"]').trigger('click')
        await w.get('[data-testid="talos-dictation-send"]').trigger('click')
        expect(w.emitted('annulla')).toHaveLength(1)
        expect(w.emitted('ferma')).toHaveLength(1)
        expect(w.emitted('invia')).toHaveLength(1)
    })

    it('⛔ INVIA È SPENTO se non c\'è niente da mandare', () => {
        const vuota = monta()
        expect(vuota.get('[data-testid="talos-dictation-send"]').attributes('disabled'))
            .toBeDefined()
        // Con del testo già nel campo si può mandare anche senza aver parlato.
        const conBozza = monta({ bozza: 'scritto a mano' })
        expect(conBozza.get('[data-testid="talos-dictation-send"]').attributes('disabled'))
            .toBeUndefined()
    })

    it('l\'onda c\'è, ed è l\'unica cosa che dice «ti sto sentendo»', () => {
        expect(monta().find('[data-testid="talos-mic-waveform"]').exists()).toBe(true)
    })

    it('«in ascolto» resta per chi non vede, senza diventare una frase a schermo', () => {
        const w = monta()
        const nascosto = w.find('.sr-only')
        expect(nascosto.exists()).toBe(true)
        expect(nascosto.attributes('role')).toBe('status')
    })
})
