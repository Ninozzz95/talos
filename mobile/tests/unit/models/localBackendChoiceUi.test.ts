// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import TalosMobileLocalBackendChoice from '@/components/talos/models/TalosMobileLocalBackendChoice.vue'

const magazzino = new Map<string, string>()

vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: vi.fn(async ({ key }: { key: string }) => ({ value: magazzino.get(key) ?? null })),
        set: vi.fn(async ({ key, value }: { key: string, value: string }) => {
            magazzino.set(key, value)
        }),
    },
}))

/**
 * ⭐⭐⭐ LA SCELTA CHE PER MESI NON SI POTEVA FARE.
 *
 * Owner, 2026-09-10: «LA SCELTA RESTA ALL'UTENTE, SCEGLIE SEMPRE LUI, CPU GPU O
 * HEXAGON». Tutto esisteva — la chiave, la forma, il lettore, la decisione —
 * tranne CHI SCRIVE: il ramo `mode === 'manual'` di `talosDecideLocalBackend`
 * era codice morto, perché nessun ingresso poteva raggiungerlo.
 *
 * ⛔ Questi test provano il CONTRASTO, non la presenza: che una voce
 * indisponibile resti visibile con un motivo invece di sparire, e che «scelto»
 * e «in uso» restino due cose separate. Sono le due forme in cui questa
 * schermata potrebbe mentire.
 */

const DISPOSITIVI = [
    { registry: 'CPU', name: 'CPU', canOffload: false },
    { registry: 'OpenCL', name: 'QUALCOMM Adreno(TM) 830', canOffload: true },
]

function monta(extra: Record<string, unknown> = {}) {
    return mount(TalosMobileLocalBackendChoice, {
        props: { devices: DISPOSITIVI, inUse: null, ...extra },
    })
}

describe('BACKEND — dove gira il modello', () => {
    beforeEach(() => {
        magazzino.clear()
    })

    it('BK-01 le quattro voci ci sono TUTTE, Hexagon compreso', () => {
        const vista = monta()
        for (const valore of ['auto', 'cpu', 'gpu', 'hexagon']) {
            expect(vista.find(`[data-testid="talos-backend-choice-${valore}"]`).exists()).toBe(true)
        }
    })

    /**
     * ⛔ IL TEST CHE MORDE. Il difetto naturale qui è far sparire ciò che non
     * si può scegliere: sembra pulito e toglie l'informazione più utile della
     * schermata. Hexagon oggi non è nemmeno compilato nell'APK — deve restare,
     * spento, col motivo accanto.
     */
    it('BK-02 una voce indisponibile resta a schermo, disabilitata e col motivo', () => {
        const vista = monta()
        const hexagon = vista.get('[data-testid="talos-backend-choice-hexagon"]')
        expect(hexagon.attributes('disabled')).toBeDefined()
        expect(hexagon.text()).not.toBe('Hexagon')
        expect(hexagon.text().length).toBeGreaterThan('Hexagon'.length)
    })

    it('BK-03 una voce disponibile porta il NOME VERO del dispositivo, non un’etichetta nostra', () => {
        expect(monta().get('[data-testid="talos-backend-choice-gpu"]').text()).toContain('Adreno')
    })

    it('BK-04 la scelta si SCRIVE, sulla chiave che il lettore usa già', async () => {
        const vista = monta()
        await vista.get('[data-testid="talos-backend-choice-gpu"]').trigger('click')
        // ⛔ `flushPromises` e non due `Promise.resolve()`: il salvataggio passa
        // da un `import()` dinamico, e una catena di microtask contata a mano
        // e' un test che passa oggi e cade il giorno che si aggiunge un await.
        await flushPromises()
        expect(magazzino.get('talos.engine.backend.v1')).toBe(
            JSON.stringify({ mode: 'manual', manual: 'gpu' }),
        )
    })

    /**
     * ⛔ «Spegnere non è dimenticare»: tornando ad automatico la scelta manuale
     * resta salvata, così chi ci ripensa non deve riscegliere.
     */
    it('BK-05 tornare ad automatico NON cancella la scelta manuale', async () => {
        const vista = monta()
        await vista.get('[data-testid="talos-backend-choice-gpu"]').trigger('click')
        await flushPromises()
        await vista.get('[data-testid="talos-backend-choice-auto"]').trigger('click')
        await flushPromises()
        expect(magazzino.get('talos.engine.backend.v1')).toBe(
            JSON.stringify({ mode: 'auto', manual: 'gpu' }),
        )
    })

    /**
     * ⛔⛔ SCELTO non è IN USO — il differenziatore contro PocketPal, che mostra
     * solo la scelta. Se un domani qualcuno derivasse «in uso» dalla preferenza
     * invece che dal nativo, questo test resterebbe verde solo finché i due
     * coincidono: per questo il caso provato è proprio quello in cui DIVERGONO.
     */
    it('BK-06 si può aver scelto GPU e girare su CPU, e si vede', async () => {
        const vista = monta({ inUse: 'cpu', inUseDevice: 'CPU' })
        await vista.get('[data-testid="talos-backend-choice-gpu"]').trigger('click')
        await flushPromises()
        const inUso = vista.get('[data-testid="talos-backend-in-use"]').text()
        expect(inUso).toContain('CPU')
        expect(inUso).not.toContain('Adreno')
    })

    it('BK-07 AL CONTRARIO: senza nessun modello aperto la riga «in uso» non esiste', () => {
        expect(monta({ inUse: null }).find('[data-testid="talos-backend-in-use"]').exists()).toBe(false)
    })

    /**
     * ⛔ Trovato guardando lo schermo, non da un test: la prima versione
     * scriveva «adesso gira su CPU · —», col trattino al posto del dispositivo
     * che il motore non aveva nominato. Un dato mancante travestito da dato.
     */
    it('BK-08 senza il nome del dispositivo la frase resta INTERA, senza trattino', () => {
        const testo = monta({ inUse: 'cpu' }).get('[data-testid="talos-backend-in-use"]').text()
        expect(testo).toContain('CPU')
        expect(testo).not.toContain('—')
        expect(testo).not.toContain('·')
    })

    /**
     * ⛔⛔ TROVATO GUARDANDO LO SCHERMO, l'11/09, non da un test.
     *
     * Con un modello Q4_K_M selezionato la riga Hexagon diventa spenta e dice
     * «non per questo formato» — giusto — ma il pallino restava **ambra pieno**,
     * perche' Hexagon era ancora la scelta salvata. Una riga grigia con
     * l'accento acceso dice due cose opposte nello stesso respiro, e a colpo
     * d'occhio vince l'accento.
     *
     * ⛔ La scelta non si dimentica: resta salvata e torna appena si sceglie un
     * modello che l'NPU sa mangiare. Cambia solo cio' che lo schermo dichiara.
     */
    it('BK-10 una riga NON disponibile non porta l’accento, anche se e la scelta salvata', async () => {
        const vista = monta()
        await vista.get('[data-testid="talos-backend-choice-hexagon"]').trigger('click')
        await flushPromises()
        const hexagon = vista.get('[data-testid="talos-backend-choice-hexagon"]')
        // Hexagon non e' fra i dispositivi di questa fixture: e' indisponibile.
        expect(hexagon.attributes('disabled')).toBeDefined()
        expect(hexagon.html()).not.toContain('bg-[var(--talos-accent)]')
    })

    /** AL CONTRARIO: una riga scelta E disponibile l'accento ce l'ha. */
    it('BK-11 la riga scelta e disponibile porta l’accento', async () => {
        const vista = monta()
        await vista.get('[data-testid="talos-backend-choice-gpu"]').trigger('click')
        await flushPromises()
        expect(vista.get('[data-testid="talos-backend-choice-gpu"]').html())
            .toContain('bg-[var(--talos-accent)]')
    })

    it('BK-09 col nome del dispositivo lo dice, accanto al motore', () => {
        const testo = monta({ inUse: 'gpu', inUseDevice: 'OPENCL' })
            .get('[data-testid="talos-backend-in-use"]').text()
        expect(testo).toContain('GPU')
        expect(testo).toContain('OPENCL')
    })
})
